'use strict';
const LOCK=7260529,MINUTE=60000;
function nextSlot(time,minutes,offset=0){
 if(!(time instanceof Date)||!Number.isFinite(+time)||!Number.isInteger(minutes)||minutes<30||minutes>10080||!Number.isInteger(offset)||offset<0||offset>=minutes)throw Error('Invalid bump schedule');
 return new Date((Math.floor((+time-offset*MINUTE)/(minutes*MINUTE))+1)*minutes*MINUTE+offset*MINUTE);
}
function createGuildBumpScheduler({pool,bump,now=()=>new Date(),logger=console}){
 if(typeof bump!=='function')throw Error('Bump publisher required');
 let running=false,initialized=false;
 async function lock(work){
  if(running)return false;running=true;
  let db,acquired=false,destroy=false;
  try{
   db=await pool.connect();
   acquired=(await db.query('SELECT pg_try_advisory_lock($1) AS locked',[LOCK])).rows[0].locked;
   if(!acquired)return false;
   return await work(db);
  }finally{
   if(acquired)try{await db.query('SELECT pg_advisory_unlock($1)',[LOCK]);}catch{destroy=true;}
   db?.release(destroy);running=false;
  }
 }
 async function tx(db,work){try{await db.query('BEGIN');const result=await work();await db.query('COMMIT');return result;}catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}}
 async function synchronize(db,time,restart){
  const guilds=(await db.query('SELECT * FROM poke_post_guilds WHERE bump_enabled ORDER BY guild_id')).rows;
  await db.query(`DELETE FROM poke_post_guild_bump_schedule s WHERE NOT EXISTS(
   SELECT 1 FROM poke_post_guilds g WHERE g.guild_id=s.guild_id AND g.bump_enabled
   AND (s.feed='main' OR g.local_channel_id IS NOT NULL))`);
  for(const g of guilds)for(const feed of ['main','local']){
   const channel=feed==='main'?g.international_channel_id:g.local_channel_id;if(!channel)continue;
   const minutes=g[feed+'_bump_interval_minutes'],days=g[feed+'_bump_cooldown_days'];
   const next=nextSlot(time,minutes,feed==='local'?Math.min(30,minutes-1):0);
   await db.query(`INSERT INTO poke_post_guild_bump_schedule(guild_id,feed,channel_id,interval_minutes,cooldown_days,next_run_at)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(guild_id,feed) DO UPDATE SET
    channel_id=EXCLUDED.channel_id,interval_minutes=EXCLUDED.interval_minutes,cooldown_days=EXCLUDED.cooldown_days,
    next_run_at=CASE WHEN $7 OR poke_post_guild_bump_schedule.channel_id<>EXCLUDED.channel_id
      OR poke_post_guild_bump_schedule.interval_minutes<>EXCLUDED.interval_minutes
      OR poke_post_guild_bump_schedule.cooldown_days<>EXCLUDED.cooldown_days
     THEN EXCLUDED.next_run_at ELSE poke_post_guild_bump_schedule.next_run_at END`,
    [g.guild_id,feed,channel,minutes,days,next,restart]);
  }
 }
 async function initialize(){return lock(async db=>{await tx(db,()=>synchronize(db,now(),true));initialized=true;return true;});}
 async function tick(){
  if(!initialized){await initialize();return false;}
  return lock(async db=>{
   const time=now();
   const claim=await tx(db,async()=>{
    await synchronize(db,time,false);
    const states=(await db.query(`SELECT s.* FROM poke_post_guild_bump_schedule s
     WHERE next_run_at<=$1
     AND NOT EXISTS(SELECT 1 FROM poke_post_guild_bump_schedule other WHERE other.guild_id=s.guild_id AND other.last_attempt_at>$2)
     AND NOT EXISTS(SELECT 1 FROM poke_post_activations a WHERE a.guild_id=s.guild_id AND a.last_bumped_at>$2)
     AND NOT EXISTS(SELECT 1 FROM poke_post_delivery_attempts d WHERE d.guild_id=s.guild_id AND d.auto_bump)
     ORDER BY next_run_at,guild_id,feed LIMIT 1 FOR UPDATE`,[time,new Date(+time-30*MINUTE)])).rows;
    const state=states[0];if(!state)return null;
    const cutoff=new Date(+time-state.cooldown_days*86400000);
    const candidate=(await db.query(`SELECT a.discord_user_id,a.public_message_id FROM poke_post_activations a
     JOIN poke_post_profiles p USING(discord_user_id) JOIN poke_post_guilds g ON g.guild_id=a.guild_id
     WHERE a.guild_id=$1 AND a.public_channel_id=$2 AND a.active AND g.bump_enabled AND a.public_message_id IS NOT NULL
     AND a.repost_requested=a.repost_delivered AND (a.last_bumped_at IS NULL OR a.last_bumped_at<$3)
     AND a.public_channel_id=CASE WHEN g.local_channel_id IS NOT NULL AND COALESCE(a.region_override,p.vivillon_pattern)=g.local_pattern
        THEN g.local_channel_id ELSE g.international_channel_id END
     AND NOT EXISTS(SELECT 1 FROM poke_post_refresh_queue q WHERE q.guild_id=a.guild_id AND q.discord_user_id=a.discord_user_id)
     AND NOT EXISTS(SELECT 1 FROM poke_post_delivery_attempts d WHERE d.guild_id=a.guild_id AND d.discord_user_id=a.discord_user_id)
     ORDER BY RANDOM() LIMIT 1`,[state.guild_id,state.channel_id,cutoff])).rows[0];
    await db.query(`UPDATE poke_post_guild_bump_schedule SET next_run_at=$3,
     last_attempt_at=CASE WHEN $4 THEN $5 ELSE last_attempt_at END WHERE guild_id=$1 AND feed=$2`,
     [state.guild_id,state.feed,nextSlot(time,state.interval_minutes,state.feed==='local'?Math.min(30,state.interval_minutes-1):0),!!candidate,time]);
    return candidate?{state,candidate,cutoff}:null;
   });
   // Commit the slot before Discord I/O so crashes cannot immediately reuse it.
   if(!claim)return false;
   const {state,candidate,cutoff}=claim;
   try{
    const sent=await bump(state.guild_id,candidate.discord_user_id,{messageId:candidate.public_message_id,channelId:state.channel_id,cutoff});
    if(sent)await db.query('UPDATE poke_post_guild_bump_schedule SET last_success_at=$3 WHERE guild_id=$1 AND feed=$2',[state.guild_id,state.feed,now()]);
    return sent===true;
   }catch{
    logger.error(JSON.stringify({event:'poke_post_guild_bump_failed',guildId:state.guild_id,feed:state.feed}));
    return false;
   }
  });
 }
 return {initialize,tick};
}
module.exports={createGuildBumpScheduler,nextSlot};
