const {MessageFlags}=require('discord.js');
const {createGuildProfileRuntime}=require('./guildProfileRuntime');
const {createServerSetup}=require('./serverSetup');
const {createServerSetupStore}=require('./serverSetupStore');
const {createProfileRenderer}=require('./profileRenderer');
const {createFeedMessageModeration}=require('./feedMessageModeration');
function createTestRuntime({pool,client,guildIds,logger=console}){
 const allowed=new Set(guildIds),runtime=createGuildProfileRuntime({pool,client,render:createProfileRenderer(client),logger,guildIds});
 const store=createServerSetupStore(pool),setup=createServerSetup({store,logger}),feedModeration=createFeedMessageModeration({getSettings:store.get,logger});
 async function handle(i){
  if(!i.isChatInputCommand()&&!i.isModalSubmit()&&!i.isButton())return;
  if(!allowed.has(i.guildId))return i.reply({content:'This test bot is not enabled in this server.',flags:MessageFlags.Ephemeral});
  if(i.isChatInputCommand()&&i.commandName==='post'&&i.options.getSubcommandGroup(false)==='admin'&&i.options.getSubcommand()==='server')return setup.open(i);
  if(i.isChatInputCommand()&&i.commandName==='post'&&i.options.getSubcommandGroup(false)==='admin'&&i.options.getSubcommand()==='thread')return setup.openThread(i,i.options.getString('group',true));
  if(i.isModalSubmit()&&i.customId.startsWith('post_server:'))return setup.submit(i);
  if(!await runtime.handle(i))await i.reply({content:'This feature is not available in the test version.',flags:MessageFlags.Ephemeral});
 }
 return {handle,handleMessage:message=>allowed.has(message.guildId)?feedModeration.handle(message):false,threadTick:runtime.threadTick,initializeBumps:runtime.initializeBumps,bumpTick:runtime.bumpTick,refreshTick:runtime.refreshTick,cleanupTick:runtime.cleanupTick};
}
module.exports={createTestRuntime};
