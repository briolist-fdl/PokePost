const {createCopyTransition}=require('./copyTransition');
const {createGuildThreadDelivery}=require('./guildThreadDelivery');
const {createGuildBumpScheduler}=require('./guildBumpScheduler');
const {createGuildModeration}=require('./guildModeration');
const {createProfileErasureStore}=require('./profileErasureStore');
const {createProfileErasure}=require('./profileErasure');
const {createGuildSettingsStore}=require('./guildSettings');
const {createActivationStore}=require('./activationStore');
const {createProfileFormStore}=require('./profileFormStore');
const {createGuildProfileForm}=require('./guildProfileForm');
const {createGuildProfileCommands}=require('./guildProfileCommands');
const {createProfileRefreshWorker}=require('./profileRefreshWorker');
const {createGuildOwnerStore}=require('./guildOwnerStore');
const {createGuildPublisher}=require('./guildPublisher');
// Explicit factory for the future migrated runtime. No connection, timer or login
// is created here. The caller provides the Discord client and profile renderer.
function createGuildProfileRuntime({pool,client,render,logger=console,guildIds=[]}) {
 const threads=guildIds.length?createGuildThreadDelivery({pool,client,render,guildIds,logger}):null;
 const copyTransition=guildIds.length?createCopyTransition({pool,client,mode:'shared',guildIds}):async()=>false;
 const publisher=createGuildPublisher({pool,client,render,logger});
 const scheduler=createGuildBumpScheduler({pool,bump:publisher.bump,logger});
 const guilds=createGuildSettingsStore(pool),formStore=createProfileFormStore(pool),activationStore=createActivationStore(pool);
 const getSettings=guildId=>guilds.get(guildId);
 const moderation=createGuildModeration({publisher,getSettings,logger});
 const erasure=createProfileErasure({store:createProfileErasureStore(pool),logger});
 const form=createGuildProfileForm({store:formStore,getSettings,logger});
 const commands=createGuildProfileCommands({form,formStore,activationStore,getSettings,ownerStore:createGuildOwnerStore(pool),deactivate:publisher.deactivate,logger});
 const worker=createProfileRefreshWorker({pool,refresh:publisher.refresh,cleanupInactive:publisher.refresh,logger});
 async function handle(i) {
  if(i.isChatInputCommand())return await erasure.command(i)||await moderation.command(i)||commands.command(i);
  if(i.isModalSubmit()&&i.customId.startsWith('guild_profile:')){await form.submit(i);return true;}
  if(i.isButton())return await copyTransition(i)||await erasure.button(i)||commands.button(i);
  return false;
 }
 let recoveryTurn=true,running=false;
 async function refreshTick(){
  if(running)return;running=true;
  try{
   if(recoveryTurn&&await publisher.recoveryTick()){recoveryTurn=false;return;}
   recoveryTurn=true;await worker.tick();
  }finally{running=false;}
 }
 async function bumpTick(){
  if(running)return false;running=true;
  try{return await scheduler.tick();}finally{running=false;}
 }
 async function threadTick(){if(running||!threads)return false;running=true;try{return await threads.tick();}finally{running=false;}}
 return {handle,threadTick,bumpProfile:publisher.bump,initializeBumps:scheduler.initialize,bumpTick,refreshTick,cleanupTick:publisher.cleanupTick,deactivateProfile:publisher.deactivate};
}
module.exports={createGuildProfileRuntime};
