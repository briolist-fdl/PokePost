const {randomUUID}=require('node:crypto');
const {ChannelType,PermissionFlagsBits,MessageFlags}=require('discord.js');
const {createGuildThreadPlanner}=require('./guildThreadPlan');
const {fingerprint}=require('./threadRouter');
const {scopedCopyButtons}=require('./guildProfileCommands');
function createGuildThreadDelivery({pool,client,render,guildIds,logger=console,now=()=>new Date()}){
 const planner=createGuildThreadPlanner({pool,guildIds}),allowed=new Set(guildIds),blocked=new Map();let running=false;
 const review=()=>Object.assign(Error('Unconfirmed thread delivery requires operator review'),{code:'THREAD_DELIVERY_REVIEW'});
 async function locked(g,u,work){
  if(!allowed.has(g)||!/^\d{17,20}$/.test(u))throw Error('Invalid thread delivery scope');
  const db=await pool.connect(),held=[];let broken=false;
  try{
   // Same ordering as shared edits/erasure, followed by guild setup and publisher.
   for(const [key,salt] of [[u,7260518],[g,7260517],[g+':'+u,7260520]]){
    if(!(await db.query('SELECT pg_try_advisory_lock(hashtextextended($1,$2)) AS locked',[key,salt])).rows[0].locked)return false;
    held.push([key,salt]);
   }
   return await work(db);
  }finally{for(const params of held.reverse())try{await db.query('SELECT pg_advisory_unlock(hashtextextended($1,$2))',params);}catch{broken=true;}db.release(broken);}
 }
 async function thread(g,id,write){const guild=await client.guilds.fetch(g);if(guild.id!==g)throw Error('Wrong server');const ch=await guild.channels.fetch(id);
  if(!ch||ch.guildId!==g||![ChannelType.PublicThread,ChannelType.AnnouncementThread].includes(ch.type))throw Error('Invalid group thread');
  const me=guild.members.me||await guild.members.fetchMe();const permissions=[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.ReadMessageHistory];if(write)permissions.push(PermissionFlagsBits.SendMessagesInThreads);
  if(!ch.permissionsFor(me)?.has(permissions)||write&&ch.locked)throw Error('Thread unavailable');return ch;
 }
 function owns(message,g,u,legacy=false){return message.author.id===client.user.id&&message.components?.some(row=>row.components?.some(b=>(new RegExp(`^guild_copy:${g}:${u}:\\d+$`).test(b.customId||'')||legacy&&(b.customId===`copy_friend_code:${u}`||new RegExp(`^copy_friend_code:${u}:\\d+$`).test(b.customId||'')))));}
 async function existing(ch,id,g,u,legacy=false){if(!id)return null;try{const m=await ch.messages.fetch(id);if(!owns(m,g,u,legacy))throw Error('Thread post ownership mismatch');return m;}catch(e){if(e.code===10008)return null;throw e;}}
 async function retire(db,g,u,state){
  if(state.attempted_at&&!state.message_id)throw review();
  try{await db.query('BEGIN');if(state.message_id)await db.query('INSERT INTO poke_post_post_cleanup(guild_id,discord_user_id,channel_id,message_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[g,u,state.thread_id,state.message_id]);await db.query('DELETE FROM poke_post_thread_posts WHERE guild_id=$1 AND discord_user_id=$2',[g,u]);await db.query('COMMIT');}catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}
 }
 async function execute(job){return locked(job.guildId,job.userId,async db=>{
  // Discard stale caller data. Re-read with all relevant writer locks held.
  const fresh=await createGuildThreadPlanner({pool:{connect:async()=>({query:(q,p)=>db.query(q,p),release(){}})},guildIds}).plan(job.guildId);
  const action=fresh.actions.find(a=>a.userId===job.userId);if(!action)return false;
  const {guildId:g,userId:u,state,profile,targetThreadId:target}=action;
  if(action.kind==='remove'){await retire(db,g,u,state);return true;}
  const ch=await thread(g,target,true);
  if(action.kind==='move'){await retire(db,g,u,state);return true;}
  const content=await render(profile);if(typeof content!=='string'||content.length>2000)throw Error('Invalid thread content');
  const payload={content,components:scopedCopyButtons(profile),allowedMentions:{parse:[]}};
  const imported=!!state?.message_id&&(await db.query("SELECT 1 FROM poke_post_imports WHERE import_key='legacy-shared-v1' AND guild_id=$1",[g])).rows.length>0;
  const old=state&&await existing(ch,state.message_id,g,u,imported);
  if(ch.archived)await ch.setArchived(false,'Update configured Poké-Post group feed');
  if(old){await old.edit(payload);await db.query('UPDATE poke_post_thread_posts SET content_hash=$3,checked_at=$4 WHERE guild_id=$1 AND discord_user_id=$2',[g,u,fingerprint(profile),now()]);return true;}
  if(state?.attempted_at)throw review();
  const nonce=randomUUID().replaceAll('-','').slice(0,25);
  await db.query(`INSERT INTO poke_post_thread_posts(guild_id,discord_user_id,thread_id,delivery_nonce,attempted_at,checked_at)
   VALUES($1,$2,$3,$4,$5,$5) ON CONFLICT(guild_id,discord_user_id) DO UPDATE SET
   thread_id=EXCLUDED.thread_id,delivery_nonce=EXCLUDED.delivery_nonce,message_id=NULL,content_hash=NULL,attempted_at=EXCLUDED.attempted_at,checked_at=EXCLUDED.checked_at`,[g,u,target,nonce,now()]);
  // Persist intent before Discord. Any uncertain send is held for reconciliation,
  // never replayed from a changed profile or beyond Discord's dedupe window.
  const sent=await ch.send({...payload,flags:MessageFlags.SuppressNotifications,nonce,enforceNonce:true});
  await db.query('UPDATE poke_post_thread_posts SET message_id=$3,content_hash=$4,attempted_at=NULL,checked_at=$5 WHERE guild_id=$1 AND discord_user_id=$2',[g,u,sent.id,fingerprint(profile),now()]);return true;
 });}
 async function reconcile(g,u,{nonce,messageId}={}){if(typeof nonce!=='string'||!/^\d{17,20}$/.test(messageId||''))throw review();return locked(g,u,async db=>{
  const state=(await db.query('SELECT * FROM poke_post_thread_posts WHERE guild_id=$1 AND discord_user_id=$2',[g,u])).rows[0];if(!state?.attempted_at||state.message_id||state.delivery_nonce!==nonce)throw review();
  const ch=await thread(g,state.thread_id,false),m=await existing(ch,messageId,g,u);if(!m||String(m.nonce)!==nonce||Number((BigInt(messageId)>>22n)+1420070400000n)<+new Date(state.attempted_at)-5000)throw review();
  await db.query('UPDATE poke_post_thread_posts SET message_id=$3,attempted_at=NULL,content_hash=NULL WHERE guild_id=$1 AND discord_user_id=$2',[g,u,messageId]);return true;
 });}
 async function tick(){if(running)return false;running=true;let db,held=false;
  try{db=await pool.connect();held=(await db.query('SELECT pg_try_advisory_lock(7260530) AS locked')).rows[0].locked;if(!held)return false;
   const jobs=[];for(const g of guildIds){if(!(await db.query('SELECT 1 FROM poke_post_guilds WHERE guild_id=$1',[g])).rows.length)continue;jobs.push(...(await planner.plan(g)).actions);}
   jobs.sort((a,b)=>+new Date(a.state?.checked_at||0)-+new Date(b.state?.checked_at||0)||a.guildId.localeCompare(b.guildId)||a.userId.localeCompare(b.userId));
   const job=jobs.find(j=>(blocked.get(j.guildId+':'+j.userId)||0)<=+now());if(!job)return false;
   const key=job.guildId+':'+job.userId;
   try{const done=await execute(job);if(done)blocked.delete(key);else blocked.set(key,+now()+90000);return done;}catch(e){blocked.set(key,+now()+300000);logger.error(JSON.stringify({event:'poke_post_thread_delivery_failed',guildId:job.guildId,userId:job.userId,errorCode:e.code||null}));return false;}
  }finally{if(held)try{await db.query('SELECT pg_advisory_unlock(7260530)');}catch{db.release(true);db=null;}db?.release();running=false;}
 }
 return {tick,execute,reconcile};
}
module.exports={createGuildThreadDelivery};
