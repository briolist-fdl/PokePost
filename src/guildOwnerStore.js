const {validatePattern}=require('./guildSettings');
const validId=value=>typeof value==='string'&&/^\d{17,20}$/.test(value);
function createGuildOwnerStore(pool) {
 async function change(actor,guild,kind,enabled) {
  if(!validId(actor)||!validId(guild))throw Error('Invalid owner scope');
  if(kind==='republishing'&&typeof enabled!=='boolean')throw Error('Explicit publishing choice is required');
  const db=await pool.connect();
  try {
   await db.query('BEGIN');
   await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,7260520))',[guild+':'+actor]);
   const configured=(await db.query('SELECT 1 FROM poke_post_guilds WHERE guild_id=$1',[guild])).rows.length;
   if(!configured)throw Error('Server is not configured');
   const activation=(await db.query('SELECT * FROM poke_post_activations WHERE guild_id=$1 AND discord_user_id=$2 FOR UPDATE',[guild,actor])).rows[0];
   if(!activation?.active){await db.query('COMMIT');return false;}
   if(kind==='republishing')await db.query('UPDATE poke_post_activations SET publish_to_followers=$3,updated_at=NOW() WHERE guild_id=$1 AND discord_user_id=$2',[guild,actor,enabled]);
   else await db.query(`UPDATE poke_post_activations SET repost_requested=CASE WHEN repost_requested=repost_delivered THEN repost_requested+1 ELSE repost_requested END,updated_at=NOW() WHERE guild_id=$1 AND discord_user_id=$2`,[guild,actor]);
   await db.query(`INSERT INTO poke_post_refresh_queue(guild_id,discord_user_id) VALUES($1,$2)
    ON CONFLICT(guild_id,discord_user_id) DO UPDATE SET generation=poke_post_refresh_queue.generation+1,requested_at=NOW()`,[guild,actor]);
   await db.query('COMMIT');return true;
  }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}finally{db.release();}
 }

 function invalid(message){const error=Error(message);error.code='INVALID_PROFILE_CHANGE';return error;}
 async function sharedChange(actor,guild,kind,value){
  if(!validId(actor)||!validId(guild))throw Error('Invalid owner scope');
  if(kind==='region'){try{validatePattern(value);}catch{throw invalid('Choose a valid Vivillon region.');}}
  if(kind==='add'){
   if(typeof value!=='string')throw invalid('Enter a friend code with 12 digits.');
   value=value.replace(/[\s-]/g,'');if(!/^\d{12}$/.test(value))throw invalid('Enter a friend code with 12 digits.');
  }
  if(kind==='remove'&&(!Number.isInteger(value)||value<1||value>3))throw invalid('Choose an extra code number from 1 to 3.');
  const db=await pool.connect();
  try{
   await db.query('BEGIN');
   await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,7260518))',[actor]);
   if(!(await db.query('SELECT 1 FROM poke_post_guilds WHERE guild_id=$1',[guild])).rows.length)throw Error('Server is not configured');
   const profile=(await db.query('SELECT * FROM poke_post_profiles WHERE discord_user_id=$1 FOR UPDATE',[actor])).rows[0];
   const activation=(await db.query('SELECT * FROM poke_post_activations WHERE guild_id=$1 AND discord_user_id=$2 FOR UPDATE',[guild,actor])).rows[0];
   if(!profile||!activation?.active){await db.query('COMMIT');return false;}
   const codes=[...(profile.additional_codes||[])];
   if(kind==='add'){
    if(profile.trainer_code_raw===value||codes.includes(value))throw invalid('That code is already in your profile.');
    if(codes.length>=3)throw invalid('Your profile already has three extra codes. Remove one before adding another.');
    codes.push(value);
   }else if(kind==='remove'){
    if(!codes[value-1])throw invalid('That extra code is no longer available. Use /post view to check your current codes.');
    codes.splice(value-1,1);
   }
   if(kind==='region')await db.query('UPDATE poke_post_profiles SET vivillon_pattern=$2,revision=revision+1,updated_at=NOW() WHERE discord_user_id=$1',[actor,value]);
   else await db.query('UPDATE poke_post_profiles SET additional_codes=$2::text[],revision=revision+1,updated_at=NOW() WHERE discord_user_id=$1',[actor,codes]);
   await db.query(`INSERT INTO poke_post_refresh_queue(guild_id,discord_user_id)
    SELECT guild_id,discord_user_id FROM poke_post_activations WHERE discord_user_id=$1 AND active
    ON CONFLICT(guild_id,discord_user_id) DO UPDATE SET generation=poke_post_refresh_queue.generation+1,requested_at=NOW()`,[actor]);
   await db.query('COMMIT');return {localOverride:activation.region_override||null};
  }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}finally{db.release();}
 }
 return {setRegion:(actor,guild,pattern)=>sharedChange(actor,guild,'region',pattern),addCode:(actor,guild,code)=>sharedChange(actor,guild,'add',code),removeCode:(actor,guild,index)=>sharedChange(actor,guild,'remove',index),setRepublishing:(actor,guild,enabled)=>change(actor,guild,'republishing',enabled),repost:(actor,guild)=>change(actor,guild,'repost')};
}
module.exports={createGuildOwnerStore};
