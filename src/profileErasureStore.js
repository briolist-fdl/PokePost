const {createHash}=require('node:crypto');
const validId=v=>typeof v==='string'&&/^\d{17,20}$/.test(v);
function failure(code){const error=Error(code);error.code=code;return error;}
function createProfileErasureStore(pool){
 function validate(actor){if(!validId(actor))throw Error('Invalid profile owner');}
 async function read(db,actor){
  const profile=(await db.query('SELECT * FROM poke_post_profiles WHERE discord_user_id=$1',[actor])).rows[0]||null;
  const activations=(await db.query('SELECT * FROM poke_post_activations WHERE discord_user_id=$1 ORDER BY guild_id',[actor])).rows;
  const fingerprint=createHash('sha256').update(JSON.stringify({profile,activations})).digest('hex');
  return {exists:!!profile,serverCount:activations.filter(a=>a.active).length,fingerprint};
 }
 async function snapshot(actor){validate(actor);return read(pool,actor);}
 async function erase(actor,expected){
  validate(actor);if(typeof expected!=='string')throw failure('STALE_ERASURE');
  const db=await pool.connect();
  try{
   await db.query('BEGIN');
   // Shared form writes use this owner lock. Hold it before enumerating scopes.
   await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,7260518))',[actor]);
   const scopes=(await db.query(`SELECT guild_id FROM poke_post_activations WHERE discord_user_id=$1
    UNION SELECT guild_id FROM poke_post_delivery_attempts WHERE discord_user_id=$1
    UNION SELECT guild_id FROM poke_post_thread_posts WHERE discord_user_id=$1
    UNION SELECT guild_id FROM poke_post_post_cleanup WHERE discord_user_id=$1 ORDER BY guild_id`,[actor])).rows;
   // Acquire delivery locks before profile row locks to match publisher ordering.
   for(const row of scopes)await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,7260520))',[row.guild_id+':'+actor]);
   await db.query('SELECT 1 FROM poke_post_profiles WHERE discord_user_id=$1 FOR UPDATE',[actor]);
   const current=await read(db,actor);
   if(current.fingerprint!==expected)throw failure('STALE_ERASURE');
   if(!current.exists){await db.query('COMMIT');return false;}
   const attempts=(await db.query('SELECT * FROM poke_post_delivery_attempts WHERE discord_user_id=$1',[actor])).rows;
   const threads=(await db.query('SELECT * FROM poke_post_thread_posts WHERE discord_user_id=$1',[actor])).rows;
   if(attempts.some(a=>a.attempted_at&&!a.delivered_message_id)||threads.some(t=>t.attempted_at&&!t.message_id))throw failure('ERASURE_DELIVERY_REVIEW');
   async function cleanup(g,ch,id){if(ch&&id)await db.query('INSERT INTO poke_post_post_cleanup(guild_id,discord_user_id,channel_id,message_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[g,actor,ch,id]);}
   const activations=(await db.query('SELECT * FROM poke_post_activations WHERE discord_user_id=$1',[actor])).rows;
   for(const a of activations)await cleanup(a.guild_id,a.public_channel_id,a.public_message_id);
   for(const t of threads)await cleanup(t.guild_id,t.thread_id,t.message_id);
   for(const a of attempts){await cleanup(a.guild_id,a.source_channel_id,a.source_message_id);await cleanup(a.guild_id,a.target_channel_id,a.delivered_message_id);}
   await db.query('DELETE FROM poke_post_delivery_attempts WHERE discord_user_id=$1',[actor]);
   await db.query('DELETE FROM poke_post_thread_posts WHERE discord_user_id=$1',[actor]);
   // The refresh queue cascades from activations. Cleanup references deliberately survive.
   await db.query('DELETE FROM poke_post_activations WHERE discord_user_id=$1',[actor]);
   await db.query('DELETE FROM poke_post_profiles WHERE discord_user_id=$1',[actor]);
   await db.query('COMMIT');return true;
  }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}finally{db.release();}
 }
 return {snapshot,erase};
}
module.exports={createProfileErasureStore};
