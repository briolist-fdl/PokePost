async function assertLegacyRollbackStartup({pool,guildId,mainChannelId,localChannelId,threads,bumpEnabled}){
 if(bumpEnabled)throw Error('Keep automatic bumps paused until legacy scheduling is reconciled');
 const db=await pool.connect();try{await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const marker=(await db.query("SELECT guild_id FROM poke_post_imports WHERE import_key='legacy-rollback-v1'")).rows[0];
  const settings=(await db.query('SELECT * FROM poke_post_guilds WHERE guild_id=$1',[guildId])).rows[0];
  if(marker?.guild_id!==guildId||!settings||settings.local_pattern!=='tundra'||settings.international_channel_id!==mainChannelId||settings.local_channel_id!==localChannelId)throw Error('Rollback server/feed configuration mismatch');
  const mappings=Object.fromEntries((await db.query('SELECT group_key,thread_id FROM poke_post_group_threads WHERE guild_id=$1 ORDER BY group_key',[guildId])).rows.map(r=>[r.group_key,r.thread_id]));
  const normalize=o=>JSON.stringify(Object.entries(o||{}).sort(([a],[b])=>a.localeCompare(b)));
  if(normalize(mappings)!==normalize(threads))throw Error('Rollback thread configuration mismatch');
  await db.query('COMMIT');return true;
 }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db.release();}
}
module.exports={assertLegacyRollbackStartup};
