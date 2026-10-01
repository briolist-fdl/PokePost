const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const APP='1550595818661085335',GUILDS=['1550119459891576852','1550967873101500566'];
const markerSql='CREATE TABLE poke_post_test_environment(singleton BOOLEAN PRIMARY KEY CHECK(singleton),client_id TEXT NOT NULL,schema_hash TEXT NOT NULL)';
function reject(message){const e=Error(message);e.code='TEST_UPGRADE_REJECTED';e.safeMessage=message;return e;}
function migrationSpec(root){
 const files=fs.readdirSync(root).filter(f=>/^\d+.*\.sql$/.test(f)).sort();
 const sql=files.map(f=>fs.readFileSync(path.join(root,f),'utf8').replace(/^\uFEFF/,'').replace(/\r\n/g,'\n'));
 return {files,sql,hash:n=>crypto.createHash('sha256').update(sql.slice(0,n).join('\n')).digest('hex')};
}
// A structural snapshot, not a hash of a marker supplied by the database.
async function inspectSchema(db){
 const queries={
  relations:`SELECT c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname`,
  columns:`SELECT table_name,column_name,ordinal_position,data_type,udt_name,is_nullable,column_default,is_identity,is_generated,generation_expression FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position`,
  constraints:`SELECT c.relname,k.conname,k.contype,k.convalidated,pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname,k.conname`,
  indexes:`SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname`,
  triggers:`SELECT event_object_table,trigger_name,event_manipulation,action_timing,action_statement FROM information_schema.triggers WHERE trigger_schema='public' ORDER BY event_object_table,trigger_name,event_manipulation`,
  policies:`SELECT tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname`
 };
 const result={};for(const [name,sql] of Object.entries(queries))result[name]=(await db.query(sql)).rows;
 return result;
}
async function upgradeTestDatabase(pool,config,{apply=false,writersStopped=false,backupVerified=false}={}){
 if(config.clientId!==APP||config.guildIds.length!==GUILDS.length||!GUILDS.every(g=>config.guildIds.includes(g)))throw reject('Upgrade requires the exact closed test application and guild list');
 if(!writersStopped)throw reject('Stop all test writers before rehearsing or applying the upgrade');
 if(apply&&!backupVerified)throw reject('Verify an isolated test database backup before applying');
 const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'testUpgradeSchemas.json'),'utf8'));
 const spec=migrationSpec(path.join(__dirname,'../migrations'));
 if(spec.files.length!==11||spec.hash(11)!==manifest['11'].hash)throw reject('Migration files differ from the reviewed upgrade build');
 const db=await pool.connect();
 try{
  await db.query('BEGIN');
  await db.query("SET LOCAL search_path TO public, pg_catalog");
  await db.query("SET LOCAL lock_timeout TO '5s'");
  await db.query("SET LOCAL statement_timeout TO '60s'");
  await db.query('SELECT pg_advisory_xact_lock(7260521)');
  if(!(await db.query("SELECT to_regclass('public.poke_post_test_environment') AS marker")).rows[0].marker)throw reject('Existing test database marker required');
  await db.query('LOCK TABLE poke_post_test_environment IN ACCESS EXCLUSIVE MODE');
  const markers=(await db.query('SELECT * FROM poke_post_test_environment')).rows;
  if(markers.length!==1||markers[0].singleton!==true||markers[0].client_id!==APP)throw reject('Test database identity does not match');
  const version=[9,10,11].find(n=>manifest[n].hash===markers[0].schema_hash);
  if(!version)throw reject('Unknown source schema hash; no upgrade attempted');
  // Locks also prevent ordinary writers changing scoped rows during verification.
  const tables=manifest[version].schema.relations.filter(r=>r.relkind==='r').map(r=>r.relname);
  await db.query('LOCK TABLE '+tables.map(n=>'"'+n+'"').join(',')+' IN ACCESS EXCLUSIVE MODE');
  if(JSON.stringify(await inspectSchema(db))!==JSON.stringify(manifest[version].schema))throw reject('Source schema differs from the reviewed structure');
  for(const table of tables){
   if(!manifest[version].schema.columns.some(c=>c.table_name===table&&c.column_name==='guild_id'))continue;
   if((await db.query(`SELECT 1 FROM "${table}" WHERE guild_id IS NULL OR NOT(guild_id=ANY($1::text[])) LIMIT 1`,[GUILDS])).rows.length)throw reject('Database contains a server outside the closed test list');
  }
  for(const sql of spec.sql.slice(version))await db.query(sql);
  if(JSON.stringify(await inspectSchema(db))!==JSON.stringify(manifest[11].schema))throw reject('Target schema verification failed');
  await db.query('UPDATE poke_post_test_environment SET schema_hash=$1 WHERE singleton=TRUE',[manifest[11].hash]);
  await db.query(apply?'COMMIT':'ROLLBACK');
  return {from:version,to:11,applied:apply};
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}finally{db.release();}
}
module.exports={upgradeTestDatabase,inspectSchema,migrationSpec,markerSql};
