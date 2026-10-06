// refresh must confirm the scoped external post update before returning true.
// This worker never drops a failed refresh or a newer concurrent generation.
function createProfileRefreshWorker({pool,refresh,cleanupInactive,logger=console}) {
 let running=false;
 async function tick() {
  if(running)return;running=true;let db,locked=false;
  try {
   db=await pool.connect();locked=(await db.query('SELECT pg_try_advisory_lock(7260519) AS locked')).rows[0].locked;if(!locked)return;
   const jobs=(await db.query('SELECT * FROM poke_post_refresh_queue ORDER BY requested_at,guild_id,discord_user_id LIMIT 5')).rows;
   for(const job of jobs) {
    const current=(await db.query('SELECT active FROM poke_post_activations WHERE guild_id=$1 AND discord_user_id=$2',[job.guild_id,job.discord_user_id])).rows[0];
    if(!current?.active) {
      if(cleanupInactive) {
        try {
          if(await cleanupInactive(job.guild_id,job.discord_user_id)!==true) {
            await db.query('UPDATE poke_post_refresh_queue SET requested_at=NOW() WHERE guild_id=$1 AND discord_user_id=$2 AND generation=$3',[job.guild_id,job.discord_user_id,job.generation]);return;
          }
        }catch(error){
          logger.error(JSON.stringify({event:'poke_post_inactive_delivery_pending',guildId:job.guild_id,userId:job.discord_user_id,errorCode:error.code||null}));
          await db.query('UPDATE poke_post_refresh_queue SET requested_at=NOW() WHERE guild_id=$1 AND discord_user_id=$2 AND generation=$3',[job.guild_id,job.discord_user_id,job.generation]);return;
        }
      }
      await db.query('DELETE FROM poke_post_refresh_queue WHERE guild_id=$1 AND discord_user_id=$2 AND generation=$3',[job.guild_id,job.discord_user_id,job.generation]);continue;
    }
    try {
     if(await refresh(job.guild_id,job.discord_user_id)===true) {
      await db.query('DELETE FROM poke_post_refresh_queue WHERE guild_id=$1 AND discord_user_id=$2 AND generation=$3',[job.guild_id,job.discord_user_id,job.generation]);
     }else await db.query('UPDATE poke_post_refresh_queue SET requested_at=NOW() WHERE guild_id=$1 AND discord_user_id=$2 AND generation=$3',[job.guild_id,job.discord_user_id,job.generation]);
    }catch(error){
     logger.error(JSON.stringify({event:'poke_post_profile_refresh_failed',guildId:job.guild_id,userId:job.discord_user_id,errorCode:error.code||null}));
     await db.query('UPDATE poke_post_refresh_queue SET requested_at=NOW() WHERE guild_id=$1 AND discord_user_id=$2 AND generation=$3',[job.guild_id,job.discord_user_id,job.generation]);
    }
    return; // one delivery attempt per tick
   }
  }finally {
   if(locked){try{await db.query('SELECT pg_advisory_unlock(7260519)');}catch{db.release(true);db=null;}}
   db?.release();running=false;
  }
 }
 return {tick};
}
module.exports={createProfileRefreshWorker};
