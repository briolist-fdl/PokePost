const {createHash}=require('node:crypto');
const {groupFor}=require('./vivillonGroups');
const tables=['friendcode_profiles','poke_post_guilds','poke_post_profiles','poke_post_activations','poke_post_group_threads','poke_post_thread_posts','poke_post_refresh_queue','poke_post_delivery_attempts','poke_post_post_cleanup','poke_post_guild_bump_schedule','poke_post_imports'];
const validId=s=>typeof s==='string'&&/^\d{17,20}$/.test(s);
async function inspect(db,g){
 if(!validId(g))throw Error('Invalid rollback guild');
 const state={};for(const table of tables)state[table]=(await db.query('SELECT to_jsonb(t) AS row FROM '+table+' t ORDER BY to_jsonb(t)::text')).rows.map(x=>x.row);
 const columns=(await db.query("SELECT column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='friendcode_profiles' ORDER BY ordinal_position")).rows;
 if(state.poke_post_imports.some(x=>x.import_key==='legacy-rollback-v1'))throw Error('Rollback already completed; do not project stale shared data again');
 if(!state.poke_post_imports.some(x=>x.import_key==='legacy-shared-v1'&&x.guild_id===g))throw Error('Matching import required');
 const settings=state.poke_post_guilds.find(x=>x.guild_id===g);if(!settings)throw Error('Missing source settings');
 if(settings.local_pattern!=='tundra'||!settings.local_channel_id)throw Error('Legacy runtime requires the original separate Tundra feed');
 // A single-server legacy runtime cannot preserve additional server activations.
 for(const table of ['poke_post_activations','poke_post_thread_posts','poke_post_group_threads','poke_post_guild_bump_schedule'])if(state[table].some(x=>x.guild_id!==g))throw Error('Rollback cannot represent other server state');
 for(const table of ['poke_post_refresh_queue','poke_post_delivery_attempts','poke_post_post_cleanup'])if(state[table].length)throw Error('Drain or reconcile pending work before rollback');
 if(state.poke_post_activations.some(a=>String(a.repost_requested)!==String(a.repost_delivered)))throw Error('Resolve manual reposts before rollback');
 const acts=new Map(state.poke_post_activations.map(a=>[a.discord_user_id,a])),routes=new Map(state.poke_post_group_threads.map(r=>[r.group_key,r.thread_id]));
 const projected=state.poke_post_profiles.map(p=>{const a=acts.get(p.discord_user_id);if(!a)throw Error('Unactivated shared profile needs explicit disposition before rollback');
  const region=a.region_override||p.vivillon_pattern;groupFor(region);const target=settings.local_channel_id&&region===settings.local_pattern?settings.local_channel_id:settings.international_channel_id;
  if(a.active&&(!a.public_message_id||a.public_channel_id!==target))throw Error('Reconcile primary routing before rollback');
  if(!validId(p.discord_user_id)||!/^\d{12}$/.test(p.trainer_code_raw)||!Array.isArray(p.additional_codes)||p.additional_codes.length>3||p.additional_codes.some(c=>!/^\d{12}$/.test(c)))throw Error('Invalid profile codes');
  return {discord_user_id:p.discord_user_id,pokemon_username:p.pokemon_username,trainer_code_raw:p.trainer_code_raw,trainer_code_formatted:p.trainer_code_raw.replace(/(\d{4})(\d{4})(\d{4})/,'$1 $2 $3'),additional_codes:p.additional_codes,campfire_username:p.campfire_username,vivillon_pattern:region,public_channel_id:a.active?a.public_channel_id:target,public_message_id:a.active?a.public_message_id:null,publish_to_followers:a.publish_to_followers,created_at:p.created_at,updated_at:p.updated_at,last_bumped_at:a.last_bumped_at,personal_message:p.personal_message,wanted_regions:p.wanted_regions,personal_message_hidden:a.personal_message_hidden};});
 const byUser=new Map(projected.map(p=>[p.discord_user_id,p]));for(const t of state.poke_post_thread_posts){const p=byUser.get(t.discord_user_id);if(!p?.public_message_id||!t.message_id||t.attempted_at||t.thread_id!==routes.get(groupFor(p.vivillon_pattern)))throw Error('Reconcile thread routing/delivery before rollback');}
 const names=new Set(columns.map(c=>c.column_name));for(const k of ['discord_user_id','pokemon_username','trainer_code_raw','trainer_code_formatted','additional_codes','campfire_username','vivillon_pattern','public_channel_id','public_message_id','publish_to_followers','created_at','updated_at','last_bumped_at'])if(!names.has(k))throw Error('Unsupported legacy schema');
 for(const k of ['personal_message','wanted_regions','personal_message_hidden'])if(!names.has(k)&&projected.some(p=>Array.isArray(p[k])?p[k].length:p[k]))throw Error('Legacy schema cannot preserve optional data');
 const fields=Object.keys(projected[0]||{discord_user_id:null}).filter(k=>names.has(k));
 for(const c of columns)if(c.is_nullable==='NO'&&c.column_default==null&&!fields.includes(c.column_name)&&projected.some(p=>!state.friendcode_profiles.some(old=>old.discord_user_id===p.discord_user_id)))throw Error('Legacy required column prevents importing new profiles');
 const digest=createHash('sha256').update(JSON.stringify({g,state,columns})).digest('hex');
 return {state,projected,fields,digest,counts:{profiles:projected.length,active:projected.filter(p=>p.public_message_id).length,erasedLegacy:state.friendcode_profiles.filter(p=>!byUser.has(p.discord_user_id)).length,threads:state.poke_post_thread_posts.length},legacyConfig:{guildId:g,internationalChannelId:settings.international_channel_id,localChannelId:settings.local_channel_id,localPattern:settings.local_pattern,mainInterval:settings.main_bump_interval_minutes,localInterval:settings.local_bump_interval_minutes,mainCooldown:settings.main_bump_cooldown_days,localCooldown:settings.local_bump_cooldown_days,threads:Object.fromEntries(routes)}};
}
async function previewLegacyRollback(db,g){await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');try{const r=await inspect(db,g);await db.query('COMMIT');return {digest:r.digest,counts:r.counts,legacyConfig:r.legacyConfig};}catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}}
// Dedicated offline client only. A verified rescue backup and stopped writers
// are operator prerequisites; flags acknowledge them, they do not stop services.
async function applyLegacyRollback(db,g,{expectedDigest,writersStopped,backupVerified}={}){
 if(writersStopped!==true||backupVerified!==true||!/^[a-f0-9]{64}$/.test(expectedDigest||''))throw Error('Reviewed digest, stopped writers and verified rescue backup required');
 await db.query('BEGIN');try{await db.query('LOCK TABLE '+tables.join(',')+' IN EXCLUSIVE MODE');const r=await inspect(db,g);if(r.digest!==expectedDigest)throw Error('Rollback preview is stale');
  for(const p of r.projected){const exists=r.state.friendcode_profiles.some(old=>old.discord_user_id===p.discord_user_id);const fields=r.fields.filter(k=>k!=='discord_user_id'),values=fields.map(k=>p[k]);
   if(exists)await db.query('UPDATE friendcode_profiles SET '+fields.map((k,i)=>k+'=$'+(i+2)).join(',')+' WHERE discord_user_id=$1',[p.discord_user_id,...values]);
   else await db.query('INSERT INTO friendcode_profiles(discord_user_id,'+fields.join(',')+') VALUES('+[p.discord_user_id,...values].map((_,i)=>'$'+(i+1)).join(',')+')',[p.discord_user_id,...values]);
  }
  await db.query('DELETE FROM friendcode_profiles WHERE NOT(discord_user_id=ANY($1::text[]))',[r.projected.map(p=>p.discord_user_id)]);
  await db.query("INSERT INTO poke_post_imports(import_key,guild_id,imported_count) VALUES('legacy-rollback-v1',$1,$2)",[g,r.projected.length]);await db.query('COMMIT');return {counts:r.counts,legacyConfig:r.legacyConfig};
 }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}
}
module.exports={previewLegacyRollback,applyLegacyRollback};
