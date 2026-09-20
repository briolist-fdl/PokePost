// Local operator tool for the isolated test environment, never production .env.
const {once}=require('node:events');
const {Client,GatewayIntentBits,Events,REST,Routes}=require('discord.js');
const {Pool}=require('pg');
const {testConfig,prepareTestDatabase}=require('./src/testEnvironment');
const {createGuildPublisher}=require('./src/guildPublisher');
const {createDataRetention}=require('./src/dataRetention');
async function main(){
 const [mode,guild,user,nonce,messageId,...extra]=process.argv.slice(2);
 if(mode==='--help'){
  console.log('node test-recovery.js inspect');
  console.log('node test-recovery.js confirm GUILD_ID USER_ID NONCE MESSAGE_ID');
  return;
 }
 if(!['inspect','confirm'].includes(mode)||extra.length||(mode==='inspect'&&guild)||(mode==='confirm'&&[guild,user,nonce,messageId].some(v=>!v)))throw Error('Invalid arguments');
 require('dotenv').config({path:'.env.test',quiet:true});
 const config=testConfig(process.env);
 if(mode==='confirm'&&!config.guildIds.includes(guild))throw Error('Server is outside the test list');
 const pool=new Pool({connectionString:config.databaseUrl,max:3,connectionTimeoutMillis:10000});
 let client;
 try{
  await prepareTestDatabase(pool,config,false);
  const rest=new REST({version:'10'}).setToken(config.token);
  const me=await rest.get(Routes.user('@me'));
  if(me.id!==config.clientId||!me.bot)throw Error('Unexpected test bot');
  if(mode==='inspect'){
   const result=await pool.query('SELECT guild_id,discord_user_id,target_channel_id,nonce,attempted_at,delivered_message_id FROM poke_post_delivery_attempts ORDER BY guild_id,discord_user_id');
   const retention=await createDataRetention({pool,guildIds:config.guildIds}).inspect();
   console.log(JSON.stringify({pending:result.rows,...retention},null,2));return;
  }
  client=new Client({intents:[GatewayIntentBits.Guilds]});
  client.on(Events.Error,()=>{});
  const ready=once(client,Events.ClientReady,{signal:AbortSignal.timeout(30000)});
  await Promise.all([ready,client.login(config.token)]);
  const publisher=createGuildPublisher({pool,client,render:async()=>{throw Error('Recovery must never render or send');}});
  const result=await publisher.reconcileDelivery(guild,user,{nonce,messageId});
  console.log(JSON.stringify({event:'test_delivery_confirmed',...result}));
 }finally{client?.destroy();await pool.end();}
}
main().catch(error=>{console.error(JSON.stringify({event:'test_recovery_failed',errorCode:error.code||null,message:'Recovery was not completed. Inspect the saved attempt and selected message.'}));process.exitCode=1;});
