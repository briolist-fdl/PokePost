const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function setupError(message){const error=Error(message);error.code='TEST_SETUP_REQUIRED';error.safeMessage=message;return error;}
const id=s=>typeof s==='string'&&/^\d{17,20}$/.test(s);
function testConfig(env){
 const clientId=env.POKEPOST_TEST_CLIENT_ID,guildIds=[...new Set((env.POKEPOST_TEST_GUILD_IDS||'').split(',').map(s=>s.trim()).filter(Boolean))];
 if(!id(clientId)||clientId==='1494609975031369828')throw setupError('Use a separate test application ID');
 if(!guildIds.length||guildIds.some(g=>!id(g)||g==='327525048246206465'))throw setupError('Choose explicit test servers outside Tundraheim');
 if(!env.POKEPOST_TEST_TOKEN||!env.POKEPOST_TEST_DATABASE_URL)throw setupError('Test token and test database are required');
 if(env.POKEPOST_TEST_DATABASE_URL===env.DATABASE_URL)throw setupError('The test database must differ from the production database');
 let url;try{url=new URL(env.POKEPOST_TEST_DATABASE_URL);}catch{throw setupError('Invalid test database URL');}
 if(!['postgres:','postgresql:'].includes(url.protocol)||!url.pathname||url.pathname==='/')throw setupError('Use a named PostgreSQL test database');
 const bumpOption=env.POKEPOST_TEST_ENABLE_BUMPS;
 if(bumpOption!==undefined&&!['','false','true'].includes(bumpOption))throw setupError('POKEPOST_TEST_ENABLE_BUMPS must be true or false');
 return {bumpsEnabled:bumpOption==='true',clientId,guildIds,token:env.POKEPOST_TEST_TOKEN,databaseUrl:env.POKEPOST_TEST_DATABASE_URL};
}
function schema(root=path.join(__dirname,'../migrations')){
 const files=fs.readdirSync(root).filter(f=>/^\d+.*\.sql$/.test(f)).sort();
 const sql=files.map(f=>fs.readFileSync(path.join(root,f),'utf8').replace(/^\uFEFF/,'').replace(/\r\n/g,'\n'));
 return {sql,hash:crypto.createHash('sha256').update(sql.join('\n')).digest('hex')};
}
async function prepareTestDatabase(pool,config,initialize=false){
 const db=await pool.connect(),spec=schema();
 try{
  await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(7260521)');
  const exists=(await db.query("SELECT to_regclass('public.poke_post_test_environment') AS marker")).rows[0].marker;
  if(!exists){
   if(!initialize)throw setupError('Initialize an empty test database first');
   const objects=(await db.query("SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' LIMIT 1")).rows;
   if(objects.length)throw setupError('Test initialization requires an empty database');
   for(const sql of spec.sql)await db.query(sql);
   await db.query('CREATE TABLE poke_post_test_environment(singleton BOOLEAN PRIMARY KEY CHECK(singleton),client_id TEXT NOT NULL,schema_hash TEXT NOT NULL)');
   await db.query('INSERT INTO poke_post_test_environment VALUES(TRUE,$1,$2)',[config.clientId,spec.hash]);
  }
  const marker=(await db.query('SELECT * FROM poke_post_test_environment WHERE singleton=TRUE')).rows[0];
  if(marker?.client_id!==config.clientId||marker?.schema_hash!==spec.hash)throw setupError('Test database identity or schema does not match this build');
  for(const table of ['poke_post_guilds','poke_post_delivery_attempts','poke_post_post_cleanup','poke_post_thread_posts']){
   if((await db.query(`SELECT 1 FROM ${table} WHERE NOT(guild_id=ANY($1::text[])) LIMIT 1`,[config.guildIds])).rows.length)throw setupError('Database contains a server outside the test list');
  }
  await db.query('COMMIT');
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}finally{db.release();}
}
module.exports={testConfig,prepareTestDatabase};
