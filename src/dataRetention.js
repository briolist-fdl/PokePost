const AUDIT_RETENTION_DAYS=30;
const BATCH_SIZE=100;
function createDataRetention({pool,guildIds=null,now=()=>new Date()}){
 if(guildIds!==null&&(!Array.isArray(guildIds)||!guildIds.length||guildIds.some(g=>typeof g!=='string'||!/^\d{17,20}$/.test(g))))throw Error('Invalid retention server scope');
 const scope=guildIds===null?null:[...new Set(guildIds)];let running=false;
 function cutoff(){const time=now();if(!(time instanceof Date)||!Number.isFinite(time.getTime()))throw Error('Invalid retention clock');return new Date(time.getTime()-AUDIT_RETENTION_DAYS*86400000);}
 async function tick(){
  if(running)return {skipped:true,deleted:0};running=true;
  try{
   // One atomic, bounded batch. SKIP LOCKED also permits independent workers.
   const result=await pool.query(`DELETE FROM poke_post_moderation_audit WHERE id IN (
    SELECT id FROM poke_post_moderation_audit WHERE ${scope?'guild_id=ANY($1::text[]) AND ':''}created_at<$${scope?2:1}
    ORDER BY created_at,id LIMIT $${scope?3:2} FOR UPDATE SKIP LOCKED
   ) RETURNING id`,scope?[scope,cutoff(),BATCH_SIZE]:[cutoff(),BATCH_SIZE]);
   return {deleted:result.rows.length};
  }finally{running=false;}
 }
 async function inspect(){
  const audit=(await pool.query(`SELECT COUNT(*)::int AS total,COUNT(*) FILTER (WHERE created_at<$${scope?2:1})::int AS eligible
   FROM poke_post_moderation_audit${scope?' WHERE guild_id=ANY($1::text[])':''}`,scope?[scope,cutoff()]:[cutoff()])).rows[0];
  const cleanup=(await pool.query(`SELECT guild_id,discord_user_id,channel_id,message_id FROM poke_post_post_cleanup${scope?' WHERE guild_id=ANY($1::text[])':''} ORDER BY guild_id,message_id LIMIT 100`,scope?[scope]:[])).rows;
  const cleanupCount=Number((await pool.query(`SELECT COUNT(*) AS total FROM poke_post_post_cleanup${scope?' WHERE guild_id=ANY($1::text[])':''}`,scope?[scope]:[])).rows[0].total);
  return {auditRetentionDays:AUDIT_RETENTION_DAYS,audit,cleanupCount,cleanup,cleanupListTruncated:cleanupCount>cleanup.length};
 }
 return {tick,inspect};
}
module.exports={createDataRetention,AUDIT_RETENTION_DAYS,BATCH_SIZE};
