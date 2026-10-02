const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const id=v=>typeof v==='string'&&/^\d{17,20}$/.test(v);
const fail=message=>{const e=Error(message);e.code='PRODUCTION_SETUP_REQUIRED';e.safeMessage=message;return e;};
function productionConfig(env){
 const guildIds=[...new Set((env.POKEPOST_SHARED_GUILD_IDS||'').split(',').map(x=>x.trim()).filter(Boolean))];
 if(env.POKEPOST_SHARED_PRODUCTION_MODE!=='enabled')throw fail('Set POKEPOST_SHARED_PRODUCTION_MODE=enabled only for the reviewed cutover.');
 if(!id(env.DISCORD_CLIENT_ID)||env.DISCORD_CLIENT_ID==='1550595818661085335'||!env.DISCORD_TOKEN||!env.DATABASE_URL)throw fail('A production bot identity, token and database are required.');
 if(!guildIds.length||guildIds.some(g=>!id(g)||g==='1550119459891576852'||g==='1550967873101500566'))throw fail('Use an explicit production guild allowlist.');
 if(env.DISCORD_GUILD_ID&&!guildIds.includes(env.DISCORD_GUILD_ID))throw fail('Legacy home server must be in the shared production allowlist.');
 for(const value of ['POKEPOST_SHARED_ENABLE_THREADS','POKEPOST_SHARED_ENABLE_BUMPS'])if(env[value]!==undefined&&!['true','false',''].includes(env[value]))throw fail(value+' must be true or false.');
 return {clientId:env.DISCORD_CLIENT_ID,token:env.DISCORD_TOKEN,databaseUrl:env.DATABASE_URL,guildIds,threadsEnabled:env.POKEPOST_SHARED_ENABLE_THREADS==='true',bumpsEnabled:env.POKEPOST_SHARED_ENABLE_BUMPS==='true'};
}
function migrationSpec(root=path.join(__dirname,'../migrations')){const files=fs.readdirSync(root).filter(f=>/^\d+.*\.sql$/.test(f)).sort();return {files,hash:crypto.createHash('sha256').update(files.map(f=>fs.readFileSync(path.join(root,f),'utf8').replace(/^\uFEFF/,'').replace(/\r\n/g,'\n')).join('\n')).digest('hex')};}
async function verifyProductionSchema(pool,config){
 const db=await pool.connect();try{await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const tables=(await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows.map(r=>r.tablename);if(tables.includes('poke_post_test_environment'))throw fail('Refusing a database marked as test.');
 const required=['poke_post_guilds','poke_post_profiles','poke_post_activations','poke_post_imports','poke_post_group_threads','poke_post_refresh_queue','poke_post_delivery_attempts','poke_post_post_cleanup','poke_post_thread_posts','poke_post_guild_bump_schedule','poke_post_moderation_audit'];if(required.some(t=>!tables.includes(t)))throw fail('Apply the reviewed migrations before starting shared production runtime.');
 if((await db.query('SELECT 1 FROM poke_post_imports WHERE import_key=$1',['legacy-rollback-v1'])).rows.length)throw fail('This database completed a legacy rollback; shared runtime must remain stopped.');
 const configured=(await db.query('SELECT guild_id FROM poke_post_guilds WHERE guild_id=ANY($1::text[])',[config.guildIds])).rows.map(r=>r.guild_id);if(configured.length!==config.guildIds.length)throw fail('Every allowlisted production server must have reviewed settings.');
 for(const table of required.filter(t=>t!=='poke_post_guilds'&&t!=='poke_post_profiles'&&t!=='poke_post_imports'&&t!=='poke_post_moderation_audit'))if((await db.query('SELECT 1 FROM '+table+' WHERE NOT(guild_id=ANY($1::text[])) LIMIT 1',[config.guildIds])).rows.length)throw fail('Shared database contains a server outside the production allowlist.');
 if((await db.query('SELECT 1 FROM poke_post_delivery_attempts WHERE attempted_at IS NOT NULL OR delivered_message_id IS NOT NULL LIMIT 1')).rows.length)throw fail('Reconcile delivery attempts before starting production.');
 if((await db.query('SELECT 1 FROM poke_post_refresh_queue UNION SELECT 1 FROM poke_post_post_cleanup LIMIT 1')).rows.length)throw fail('Drain refresh and cleanup work before starting production.');
 const threads=(await db.query('SELECT guild_id,count(*)::int AS count FROM poke_post_group_threads WHERE guild_id=ANY($1::text[]) GROUP BY guild_id',[config.guildIds])).rows;if(config.threadsEnabled&&threads.some(r=>r.count!==6)||config.threadsEnabled&&threads.length!==config.guildIds.length)throw fail('Thread delivery requires six reviewed group mappings per server.');
 await db.query('COMMIT');return {migrationHash:migrationSpec().hash,configuredGuilds:configured,threadMappings:threads};
 }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db.release();}
}
module.exports={productionConfig,verifyProductionSchema,migrationSpec};
