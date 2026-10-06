const {publicChannelFor,validatePattern}=require('./guildSettings');
const validId=value=>typeof value==='string' && /^\d{17,20}$/.test(value);
function stale() { const e=Error('Your profile changed while this form was open. Reopen the command to review the latest details.');e.code='STALE_PROFILE_FORM';return e; }
function settings(row) {return row && {guildId:row.guild_id,localChannelId:row.local_channel_id,internationalChannelId:row.international_channel_id,
 localPattern:row.local_pattern,moderateChannels:row.moderate_channels,bumpEnabled:row.bump_enabled};}
function activationStamp(row) {
 return row ? JSON.stringify([row.active,row.publish_to_followers,row.region_override,row.updated_at instanceof Date?row.updated_at.toISOString():row.updated_at]) : null;
}
function createProfileFormStore(pool) {
 function scope(actor,guild) {if(!validId(actor)||!validId(guild))throw Error('Invalid profile scope');}
 async function snapshot(actor,guild) {
  scope(actor,guild);
  const p=(await pool.query('SELECT * FROM poke_post_profiles WHERE discord_user_id=$1',[actor])).rows[0]||null;
  const a=(await pool.query('SELECT * FROM poke_post_activations WHERE guild_id=$1 AND discord_user_id=$2',[guild,actor])).rows[0]||null;
  return {profile:p,activation:a,revision:p?String(p.revision):null,activationStamp:activationStamp(a)};
 }
 async function save(actor,guild,values,expected) {
  scope(actor,guild);
  if(!['create','edit','activate'].includes(expected.mode)||typeof values.publishToFollowers!=='boolean')throw Error('Invalid profile form');
  if(expected.mode!=='activate') {
   if(typeof values.pokemonUsername!=='string'||!values.pokemonUsername.trim()||values.pokemonUsername.trim().length>64||
      !/^\d{12}$/.test(values.trainerCodeRaw)||typeof values.campfireUsername!=='string'||values.campfireUsername.length>64)throw Error('Check the profile fields and enter a trainer code with 12 digits.');
   validatePattern(values.vivillonPattern);
  }
  const db=await pool.connect();
  try {
   await db.query('BEGIN');
   await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,7260518))',[actor]);
   const config=settings((await db.query('SELECT * FROM poke_post_guilds WHERE guild_id=$1',[guild])).rows[0]);
   if(!config)throw Error('This server has not configured PokéPost yet.');
   let p=(await db.query('SELECT * FROM poke_post_profiles WHERE discord_user_id=$1 FOR UPDATE',[actor])).rows[0];
   const a=(await db.query('SELECT * FROM poke_post_activations WHERE guild_id=$1 AND discord_user_id=$2 FOR UPDATE',[guild,actor])).rows[0];
   if((p?String(p.revision):null)!==expected.revision||activationStamp(a)!==expected.activationStamp)throw stale();
   if(expected.mode==='create' && (p||a))throw stale();
   if(expected.mode==='edit' && (!p||!a?.active))throw stale();
   if(expected.mode==='activate' && (!p||a?.active))throw stale();
   if(expected.mode==='create') {
    p=(await db.query(`INSERT INTO poke_post_profiles(discord_user_id,pokemon_username,trainer_code_raw,campfire_username,vivillon_pattern)
      VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING *`,[actor,values.pokemonUsername.trim(),values.trainerCodeRaw,values.campfireUsername.trim()||null,values.vivillonPattern])).rows[0];
    if(!p)throw stale();
   }else if(expected.mode==='edit') {
    p=(await db.query(`UPDATE poke_post_profiles SET pokemon_username=$2,trainer_code_raw=$3,campfire_username=$4,
      vivillon_pattern=$5,revision=revision+1,updated_at=NOW() WHERE discord_user_id=$1 RETURNING *`,
     [actor,values.pokemonUsername.trim(),values.trainerCodeRaw,values.campfireUsername.trim()||null,values.vivillonPattern])).rows[0];
   }
   const target=publicChannelFor(config,a?.region_override||p.vivillon_pattern);
   if(expected.mode==='edit') {
    await db.query('UPDATE poke_post_activations SET publish_to_followers=$3,updated_at=NOW() WHERE guild_id=$1 AND discord_user_id=$2',[guild,actor,values.publishToFollowers]);
   }else {
    await db.query(`INSERT INTO poke_post_activations(guild_id,discord_user_id,active,publish_to_followers,public_channel_id)
      VALUES($1,$2,TRUE,$3,$4) ON CONFLICT(guild_id,discord_user_id) DO UPDATE SET active=TRUE,
      publish_to_followers=EXCLUDED.publish_to_followers,public_channel_id=EXCLUDED.public_channel_id,updated_at=NOW()`,[guild,actor,values.publishToFollowers,target]);
   }
   // Shared edits refresh active servers only. Consent and moderator overrides elsewhere remain untouched.
   await db.query(`INSERT INTO poke_post_refresh_queue(guild_id,discord_user_id)
     SELECT guild_id,discord_user_id FROM poke_post_activations WHERE discord_user_id=$1 AND active
       AND ($3 OR guild_id=$2)
     ON CONFLICT(guild_id,discord_user_id) DO UPDATE SET generation=poke_post_refresh_queue.generation+1,requested_at=NOW()`,
    [actor,guild,expected.mode==='edit']);
   await db.query('COMMIT');return {mode:expected.mode};
  }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}finally{db.release();}
 }
 return {snapshot,save};
}
module.exports={createProfileFormStore,activationStamp};
