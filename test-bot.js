// Explicit test entry point. The production npm start command remains unchanged.
const {Client,GatewayIntentBits,Events,REST,Routes,MessageFlags}=require('discord.js');
const {Pool}=require('pg');
const {testConfig,prepareTestDatabase}=require('./src/testEnvironment');
const {testCommands}=require('./src/testCommands');
const {createTestRuntime}=require('./src/testRuntime');
const {createDataRetention}=require('./src/dataRetention');
const {createTestDiagnostics}=require('./src/testDiagnostics');
async function main(){
 const mode=process.argv[2]||'run';
 if(mode==='--help'){console.log('Use node test-bot.js init, register or run with an explicit .env.test file.');return;}
 if(!['init','register','run'].includes(mode))throw Error('Unknown test mode');
 require('dotenv').config({path:'.env.test',quiet:true});
 const config=testConfig(process.env),pool=new Pool({connectionString:config.databaseUrl,max:5,connectionTimeoutMillis:10000});
 const diagnostics=mode==='run'?createTestDiagnostics({onError:()=>console.error('Test diagnostic log maintenance failed.')}):null;
 diagnostics?.prune();
 let client,timer,closing=false;const pending=new Set();
 const report=(event,error)=>{const entry={event,errorCode:error?.code||null};if(diagnostics)diagnostics.error(entry);else console.error(JSON.stringify(entry));};
 function track(work){if(closing)return;const task=Promise.resolve().then(work).catch(e=>report('test_task_failed',e));pending.add(task);task.finally(()=>pending.delete(task));return task;}
 async function stop(){if(closing)return;closing=true;clearInterval(timer);client?.destroy();await Promise.allSettled([...pending]);await pool.end();}
 pool.on('error',error=>{report('test_database_error',error);process.exitCode=1;void stop();});
 try{
  await prepareTestDatabase(pool,config,mode==='init');
  if(mode==='init'){console.log('Test database initialized and identity checked.');await stop();return;}
  const rest=new REST({version:'10'}).setToken(config.token);
  const identity=await rest.get(Routes.user('@me'));
  if(identity.id!==config.clientId||!identity.bot)throw Error('Token does not belong to the selected test bot');
  if(mode==='register'){
   const body=testCommands();for(const guild of config.guildIds)await rest.put(Routes.applicationGuildCommands(config.clientId,guild),{body});
   console.log('Test commands registered only in the configured test servers.');await stop();return;
  }
  client=new Client({intents:[GatewayIntentBits.Guilds]});
  const runtime=createTestRuntime({pool,client,guildIds:config.guildIds,logger:diagnostics});
  const retention=createDataRetention({pool,guildIds:config.guildIds});
  client.on(Events.Error,error=>report('test_discord_error',error));
  client.on(Events.InteractionCreate,i=>track(async()=>{
   try{await runtime.handle(i);}catch(error){report('test_interaction_failed',error);const payload={content:'The test bot could not complete that action. Please try again.',allowedMentions:{parse:[]}};
    try{if(i.deferred)await i.editReply(payload);else if(!i.replied)await i.reply({...payload,flags:MessageFlags.Ephemeral});}catch(replyError){report('test_reply_failed',replyError);}
   }
  }));
  let busy=false;
  client.once(Events.ClientReady,()=>{
   if(closing)return;
   track(async()=>{
   try{
    if(config.bumpsEnabled&&await runtime.initializeBumps()!==true)throw Error('Bump initialization lock unavailable');
    if(closing)return;
   timer=setInterval(()=>{if(busy||closing)return;busy=true;track(async()=>{try{
    diagnostics.prune();
    try{await retention.tick();}catch(error){report('test_retention_failed',error);}
    await runtime.refreshTick();await runtime.cleanupTick();
    if(config.bumpsEnabled)await runtime.bumpTick();
    if(config.threadsEnabled)await runtime.threadTick();
   }finally{busy=false;}});},60000);
   console.log('Test bot ready. Refresh and cleanup run once per minute.');
   diagnostics.log({event:'test_bot_ready',bumpsEnabled:config.bumpsEnabled});
   }catch(error){report('test_bump_initialization_failed',error);process.exitCode=1;void stop();}
   });
  });
  await client.login(config.token);
  process.once('SIGINT',()=>{void stop();});process.once('SIGTERM',()=>{void stop();});
 }catch(error){await stop();throw error;}
}
if(require.main===module)main().catch(error=>{console.error(JSON.stringify({event:'test_startup_failed',errorCode:error.code||null,message:error.safeMessage||'Check the test configuration, bot identity and database access.'}));process.exitCode=1;});
module.exports={main};
