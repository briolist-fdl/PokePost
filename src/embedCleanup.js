// Queue one quiet edit of each existing primary post after the profile layout changes.
// The marker and queue entries commit together, so a restart resumes unfinished work.
async function queueExistingEmbedCleanup(pool,guildIds){
 const db=await pool.connect();
 try{
  await db.query('BEGIN');
  const marker=(await db.query(`INSERT INTO poke_post_imports(import_key,guild_id,imported_count)
   VALUES('profile-button-order-v1',$1,0) ON CONFLICT DO NOTHING RETURNING import_key`,[guildIds[0]])).rows[0];
  if(marker){
   const queued=await db.query(`INSERT INTO poke_post_refresh_queue(guild_id,discord_user_id)
    SELECT guild_id,discord_user_id FROM poke_post_activations
    WHERE active AND public_message_id IS NOT NULL
    ON CONFLICT(guild_id,discord_user_id) DO UPDATE SET
      generation=poke_post_refresh_queue.generation+1,requested_at=NOW()`);
   await db.query('UPDATE poke_post_imports SET imported_count=$1 WHERE import_key=$2',[queued.rowCount,'profile-button-order-v1']);
  }
  await db.query('COMMIT');
  return !!marker;
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
 finally{db.release();}
}
module.exports={queueExistingEmbedCleanup};
