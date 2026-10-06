const {randomUUID}=require('node:crypto');
const {ChannelType,PermissionFlagsBits,MessageFlags}=require('discord.js');
const {publicChannelFor,validatePattern}=require('./guildSettings');
const {activationStamp}=require('./profileFormStore');
const {scopedCopyButtons}=require('./guildProfileCommands');
const validId=v=>typeof v==='string'&&/^\d{17,20}$/.test(v);
function createGuildPublisher({pool,client,render,now=()=>new Date(),logger=console}) {
 if(typeof render!=='function')throw Error('A profile renderer is required');
 function review(message){const error=Error(message);error.code='DELIVERY_REVIEW_REQUIRED';return error;}
 function scope(g,u){if(!validId(g)||!validId(u))throw Error('Invalid publication scope');}
 async function locked(g,u,work) {
  scope(g,u);const db=await pool.connect();let acquired=false,destroy=false;
  try{await db.query('SELECT pg_advisory_lock(hashtextextended($1,7260520))',[g+':'+u]);acquired=true;return await work(db);}
  finally{if(acquired)try{await db.query('SELECT pg_advisory_unlock(hashtextextended($1,7260520))',[g+':'+u]);}catch{destroy=true;}db.release(destroy);}
 }
 async function tx(db,work){try{await db.query('BEGIN');const result=await work();await db.query('COMMIT');return result;}catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}}
 async function current(db,g,u,forUpdate=false){return (await db.query(`SELECT p.*,a.*,COALESCE(a.region_override,p.vivillon_pattern) AS vivillon_pattern
  FROM poke_post_profiles p JOIN poke_post_activations a USING(discord_user_id)
  WHERE a.guild_id=$1 AND a.discord_user_id=$2 ${forUpdate?'FOR UPDATE OF p,a':''}`,[g,u])).rows[0]||null;}
 async function settings(db,g){const row=(await db.query('SELECT * FROM poke_post_guilds WHERE guild_id=$1',[g])).rows[0];if(!row)throw Error('Server is not configured');return {guildId:g,localChannelId:row.local_channel_id,internationalChannelId:row.international_channel_id,localPattern:row.local_pattern,moderateChannels:row.moderate_channels,bumpEnabled:row.bump_enabled,showPersonalMessage:row.show_personal_message===true,showWantedRegions:row.show_wanted_regions===true};}
 async function channel(g,id,write){const guild=await client.guilds.fetch(g);if(guild.id!==g)throw Error('Wrong server');const ch=await guild.channels.fetch(id);
  const types=write?[ChannelType.GuildText,ChannelType.GuildAnnouncement]:[ChannelType.GuildText,ChannelType.GuildAnnouncement,ChannelType.PublicThread,ChannelType.AnnouncementThread];
  if(!ch||ch.guildId!==g||!types.includes(ch.type))throw Error('Invalid publication channel');
  const me=guild.members.me||await guild.members.fetchMe();const permissions=[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.ReadMessageHistory];if(write)permissions.push(PermissionFlagsBits.SendMessages);
  if(!ch.permissionsFor(me)?.has(permissions))throw Error('Missing publication permissions');return ch;
 }
 function owns(message,g,u){return message.author.id===client.user.id&&message.components?.some(row=>row.components?.some(b=>
  b.customId===`copy_friend_code:${u}`||new RegExp(`^copy_friend_code:${u}:\\d+$`).test(b.customId||'')||new RegExp(`^guild_copy:${g}:${u}:\\d+$`).test(b.customId||'')));}
 async function message(ch,id,g,u){if(!id)return null;try{const m=await ch.messages.fetch(id);if(!owns(m,g,u))throw Error('Stored message belongs to another author or profile');return m;}catch(e){if(e.code===10008)return null;throw e;}}
 async function queueCleanup(db,g,u,ch,id){if(ch&&id)await db.query('INSERT INTO poke_post_post_cleanup(guild_id,discord_user_id,channel_id,message_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[g,u,ch,id]);}
 async function settle(db,g,u,attempt){return tx(db,async()=>{
  const p=await current(db,g,u,true);let accept=false;
  if(p?.active && p.public_channel_id===attempt.source_channel_id && p.public_message_id===attempt.source_message_id){const config=await settings(db,g);accept=publicChannelFor(config,p.vivillon_pattern)===attempt.target_channel_id;}
  if(accept){await db.query('UPDATE poke_post_activations SET public_channel_id=$3,public_message_id=$4,repost_delivered=GREATEST(repost_delivered,$5),last_bumped_at=CASE WHEN $6 THEN $7 ELSE last_bumped_at END,updated_at=NOW() WHERE guild_id=$1 AND discord_user_id=$2',[g,u,attempt.target_channel_id,attempt.delivered_message_id,attempt.repost_generation,attempt.auto_bump,attempt.attempted_at]);
   await queueCleanup(db,g,u,attempt.source_channel_id,attempt.source_message_id);
  }else await queueCleanup(db,g,u,attempt.target_channel_id,attempt.delivered_message_id);
  await db.query('DELETE FROM poke_post_delivery_attempts WHERE guild_id=$1 AND discord_user_id=$2',[g,u]);return accept&&String(p.revision)===String(attempt.source_revision)&&p.publish_to_followers===attempt.source_publishing&&p.vivillon_pattern===attempt.source_region;
 });}
 async function refresh(g,u,bumpRequest=null){return locked(g,u,async db=>{
  let pending=(await db.query('SELECT * FROM poke_post_delivery_attempts WHERE guild_id=$1 AND discord_user_id=$2',[g,u])).rows[0];
  let p=await current(db,g,u);
  if(bumpRequest&&(pending||!p?.active))return false;
  if(pending?.delivered_message_id)return settle(db,g,u,pending);
  if(pending?.attempted_at && now()-new Date(pending.attempted_at)>120000)throw review('Unconfirmed delivery requires inspection before retry');
  if(!p?.active){
   if(pending?.attempted_at)throw review('Unconfirmed delivery must be resolved before cleanup');
   if(pending)await db.query('DELETE FROM poke_post_delivery_attempts WHERE guild_id=$1 AND discord_user_id=$2',[g,u]);return true;
  }
  const config=await settings(db,g),target=publicChannelFor(config,p.vivillon_pattern),ch=await channel(g,target,true);
  if(bumpRequest){
   if(!config.bumpEnabled||p.public_message_id!==bumpRequest.messageId||p.public_channel_id!==bumpRequest.channelId||target!==bumpRequest.channelId||
    (p.last_bumped_at&&new Date(p.last_bumped_at)>=bumpRequest.cutoff)||String(p.repost_requested)!==String(p.repost_delivered))return false;
   if((await db.query('SELECT 1 FROM poke_post_refresh_queue WHERE guild_id=$1 AND discord_user_id=$2',[g,u])).rows.length)return false;
  }
  if(!pending){
   let content=await render({...p,trainer_code_formatted:p.trainer_code_raw.replace(/(\d{4})(\d{4})(\d{4})/,'$1 $2 $3')},config);
   if(typeof content!=='string')throw Error('Renderer must return text');
   if(bumpRequest){const lines=content.split('\n');lines[0]+=' · *bumped*';content=lines.join('\n');}
   if(content.length>2000)throw Error('Rendered profile is too long');
   const payload=JSON.parse(JSON.stringify({content,components:scopedCopyButtons(p),allowedMentions:{parse:[]},flags:MessageFlags.SuppressNotifications}));
   if(!bumpRequest&&String(p.repost_requested)===String(p.repost_delivered)&&p.public_channel_id===target&&p.public_message_id){const old=await message(ch,p.public_message_id,g,u);if(old){await old.edit({content:payload.content,components:payload.components,allowedMentions:payload.allowedMentions});return true;}}
   pending=(await db.query(`INSERT INTO poke_post_delivery_attempts(guild_id,discord_user_id,source_channel_id,source_message_id,target_channel_id,nonce,payload,repost_generation,source_revision,source_publishing,source_region,auto_bump)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,[g,u,p.public_channel_id,p.public_message_id,target,randomUUID().replaceAll('-','').slice(0,25),JSON.stringify(payload),p.repost_requested,p.revision,p.publish_to_followers,p.vivillon_pattern,!!bumpRequest])).rows[0];
  }
  // A prior attempt keeps its original destination, body and nonce across retries.
  const destination=pending.target_channel_id===target?ch:await channel(g,pending.target_channel_id,true);
  await db.query('UPDATE poke_post_delivery_attempts SET attempted_at=COALESCE(attempted_at,$3) WHERE guild_id=$1 AND discord_user_id=$2',[g,u,now()]);
  const sent=await destination.send({...pending.payload,nonce:pending.nonce,enforceNonce:true});
  await db.query('UPDATE poke_post_delivery_attempts SET delivered_message_id=$3 WHERE guild_id=$1 AND discord_user_id=$2',[g,u,sent.id]);
  pending.delivered_message_id=sent.id;
  if(!pending.attempted_at)pending.attempted_at=(await db.query('SELECT attempted_at FROM poke_post_delivery_attempts WHERE guild_id=$1 AND discord_user_id=$2',[g,u])).rows[0].attempted_at;
  return settle(db,g,u,pending);
 });}
 async function deactivateInTransaction(db,g,u,expected){
  const p=await current(db,g,u,true);if(!p)return false;
  if(expected&&(String(p.revision)!==expected.revision||activationStamp(p)!==expected.activationStamp)){
   const error=Error('Your profile changed. Reopen the delete command to review it.');error.code='STALE_PROFILE_FORM';throw error;
  }
  await queueCleanup(db,g,u,p.public_channel_id,p.public_message_id);
  const copies=(await db.query('SELECT * FROM poke_post_thread_posts WHERE guild_id=$1 AND discord_user_id=$2 FOR UPDATE',[g,u])).rows;
  for(const copy of copies){if(copy.attempted_at&&!copy.message_id)throw review('Unconfirmed thread delivery requires inspection');await queueCleanup(db,g,u,copy.thread_id,copy.message_id);}
  await db.query('DELETE FROM poke_post_thread_posts WHERE guild_id=$1 AND discord_user_id=$2',[g,u]);
  await db.query('UPDATE poke_post_activations SET active=FALSE,public_message_id=NULL,updated_at=NOW() WHERE guild_id=$1 AND discord_user_id=$2',[g,u]);
  await db.query(`INSERT INTO poke_post_refresh_queue(guild_id,discord_user_id) VALUES($1,$2)
   ON CONFLICT(guild_id,discord_user_id) DO UPDATE SET generation=poke_post_refresh_queue.generation+1,requested_at=NOW()`,[g,u]);return true;
 }
 async function deactivate(g,u,expected){return locked(g,u,db=>tx(db,()=>deactivateInTransaction(db,g,u,expected)));}
 async function cleanupTick(){
  const jobs=(await pool.query('SELECT * FROM poke_post_post_cleanup ORDER BY queued_at,guild_id,message_id LIMIT 5')).rows;
  for(const job of jobs){const {guild_id:g,discord_user_id:u,channel_id:chId,message_id:id}=job;
   try{const removed=await locked(g,u,async db=>{
    const p=await current(db,g,u);if(p?.active&&p.public_channel_id===chId&&p.public_message_id===id)return false;
    const route=(await db.query('SELECT 1 FROM poke_post_thread_posts WHERE guild_id=$1 AND discord_user_id=$2 AND thread_id=$3 AND message_id=$4',[g,u,chId,id])).rows.length;if(route)return false;
    let ch;try{ch=await channel(g,chId,false);}catch(e){if(e.code!==10003)throw e;}
    if(ch){const old=await message(ch,id,g,u);if(old)await old.delete().catch(e=>{if(e.code!==10008)throw e;});}
    await db.query('DELETE FROM poke_post_post_cleanup WHERE guild_id=$1 AND channel_id=$2 AND message_id=$3',[g,chId,id]);return true;
   });if(removed)return;
    await pool.query('UPDATE poke_post_post_cleanup SET queued_at=NOW() WHERE guild_id=$1 AND channel_id=$2 AND message_id=$3',[g,chId,id]);
   }catch(error){logger.error(JSON.stringify({event:'poke_post_cleanup_failed',guildId:g,userId:u,errorCode:error.code||null}));
    await pool.query('UPDATE poke_post_post_cleanup SET queued_at=NOW() WHERE guild_id=$1 AND channel_id=$2 AND message_id=$3',[g,chId,id]);return;
   }
  }
 }
 async function recoveryTick(){
  const cutoff=new Date(now().getTime()-120000);
  const pending=(await pool.query('SELECT guild_id,discord_user_id FROM poke_post_delivery_attempts WHERE delivered_message_id IS NOT NULL OR attempted_at IS NULL OR attempted_at >= $1 ORDER BY recovery_checked_at NULLS FIRST,attempted_at NULLS FIRST,guild_id,discord_user_id LIMIT 1',[cutoff])).rows[0];
  if(!pending)return false;
  await pool.query('UPDATE poke_post_delivery_attempts SET recovery_checked_at=NOW() WHERE guild_id=$1 AND discord_user_id=$2',[pending.guild_id,pending.discord_user_id]);
  try{await refresh(pending.guild_id,pending.discord_user_id);}catch(error){logger.error(JSON.stringify({event:'poke_post_delivery_recovery_failed',guildId:pending.guild_id,userId:pending.discord_user_id,errorCode:error.code||null}));}
  return true;
 }

 // Operator-only recovery. The caller must authenticate and restrict server scope.
 // This confirms a specific observed post. It never sends or deletes a message.
 async function reconcileDelivery(g,u,{nonce,messageId}={}){
  if(typeof nonce!=='string'||!nonce||!validId(messageId))throw review('A delivery nonce and message ID are required');
  return locked(g,u,async db=>{
   const attempt=(await db.query('SELECT * FROM poke_post_delivery_attempts WHERE guild_id=$1 AND discord_user_id=$2',[g,u])).rows[0];
   if(!attempt||attempt.nonce!==nonce)throw review('The pending delivery changed. Inspect it again');
   if(!attempt.attempted_at||attempt.source_message_id===messageId)throw review('This is not a new attempted delivery');
   if(attempt.delivered_message_id&&attempt.delivered_message_id!==messageId)throw review('A different delivered message is already recorded');
   const ch=await channel(g,attempt.target_channel_id,false);
   const found=await message(ch,messageId,g,u);
   if(!found)throw review('The selected message does not exist');
   if(found.nonce!=null&&String(found.nonce)!==nonce)throw review('The message belongs to another delivery');
   const sentAt=Number((BigInt(messageId)>>22n)+1420070400000n);
   if(sentAt<new Date(attempt.attempted_at).getTime()-5000)throw review('The selected message predates this attempt');
   const actualIds=found.components.flatMap(row=>row.components.map(b=>b.customId));
   const expectedIds=attempt.payload.components.flatMap(row=>row.components.map(b=>b.custom_id));
   if(found.content!==attempt.payload.content||JSON.stringify(actualIds)!==JSON.stringify(expectedIds))throw review('The selected message does not match the saved delivery');
   // Persist the receipt first, exactly as on the regular successful send path.
   // If settlement fails, ordinary recovery can finish using this receipt.
   await db.query('UPDATE poke_post_delivery_attempts SET delivered_message_id=$3 WHERE guild_id=$1 AND discord_user_id=$2',[g,u,messageId]);
   attempt.delivered_message_id=messageId;
   const current=await settle(db,g,u,attempt);
   return {confirmed:true,current};
  });
 }
 function moderationScope(g,u,context){scope(g,u);if(!validId(context?.actor)||!validId(context?.interaction))throw Error('Invalid moderation actor');}
 async function audit(db,g,u,context,action,details){await db.query('INSERT INTO poke_post_moderation_audit(guild_id,moderator_id,discord_user_id,interaction_id,action,details) VALUES($1,$2,$3,$4,$5,$6)',[g,context.actor,u,context.interaction,action,JSON.stringify(details)]);}
 async function prior(db,g,u,context){const row=(await db.query('SELECT * FROM poke_post_moderation_audit WHERE interaction_id=$1',[context.interaction])).rows[0];if(row&&(row.guild_id!==g||row.discord_user_id!==u||row.moderator_id!==context.actor))throw Error('Interaction scope mismatch');return row?.details;}
 async function moderateRegion(g,u,pattern,context){
  moderationScope(g,u,context);validatePattern(pattern);
  return locked(g,u,db=>tx(db,async()=>{
   const previous=await prior(db,g,u,context);if(previous)return previous;
   const p=await current(db,g,u,true);if(!p?.active)return {inactive:true};
   const config=await settings(db,g);publicChannelFor(config,pattern);
   await db.query('UPDATE poke_post_activations SET region_override=$3,updated_at=NOW() WHERE guild_id=$1 AND discord_user_id=$2',[g,u,pattern]);
   await db.query(`INSERT INTO poke_post_refresh_queue(guild_id,discord_user_id) VALUES($1,$2)
    ON CONFLICT(guild_id,discord_user_id) DO UPDATE SET generation=poke_post_refresh_queue.generation+1,requested_at=NOW()`,[g,u]);
   const result={oldRegion:p.vivillon_pattern,newRegion:pattern};await audit(db,g,u,context,'region',result);return result;
  }));
 }
 async function moderateRemove(g,u,selected,context){
  moderationScope(g,u,context);
  if(selected&&(!validId(selected.messageId)||(selected.channelId&&!validId(selected.channelId))))throw Error('Invalid selected post');
  return locked(g,u,async db=>{
   const previous=await prior(db,g,u,context);if(previous)return previous;
   await settings(db,g);
   const p=await current(db,g,u);
   const chId=selected&&(selected.channelId||p?.public_channel_id||context.channelId);
   if(selected){if(!validId(chId))throw Error('Missing selected channel');const ch=await channel(g,chId,false);await message(ch,selected.messageId,g,u);}
   return tx(db,async()=>{
    const row=await current(db,g,u,true);
    const routed=selected&&(await db.query('SELECT 1 FROM poke_post_thread_posts WHERE guild_id=$1 AND discord_user_id=$2 AND thread_id=$3 AND message_id=$4',[g,u,chId,selected.messageId])).rows.length>0;
    const isCurrent=selected&&((row?.public_channel_id===chId&&row?.public_message_id===selected.messageId)||routed);
    if(!selected&&!row?.active)return {inactive:true};
    const deactivateLocal=!selected||isCurrent;
    if(deactivateLocal)await deactivateInTransaction(db,g,u);
    if(selected)await queueCleanup(db,g,u,chId,selected.messageId);
    const result={deactivated:!!deactivateLocal,selectedChannelId:chId||null,selectedMessageId:selected?.messageId||null};
    await audit(db,g,u,context,'remove',result);return result;
   });
  });
 }
 async function bump(g,u,{messageId,channelId,cutoff}={}){
  scope(g,u);
  if(!validId(messageId)||!validId(channelId)||!(cutoff instanceof Date)||!Number.isFinite(+cutoff)||cutoff>now())throw Error('Invalid bump request');
  return refresh(g,u,{messageId,channelId,cutoff});
 }
 return {refresh:(g,u)=>refresh(g,u),bump,deactivate,cleanupTick,recoveryTick,reconcileDelivery,moderateRegion,moderateRemove};
}
module.exports={createGuildPublisher};
