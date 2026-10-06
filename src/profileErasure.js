const {randomUUID}=require('node:crypto');
const {ActionRowBuilder,ButtonBuilder,ButtonStyle,MessageFlags}=require('discord.js');
function createProfileErasure({store,now=()=>Date.now(),logger=console}){
 const confirmations=new Map();
 const reply=(i,content)=>i.reply({content,flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}});
 async function command(i){
  if(i.commandName!=='post'||i.options.getSubcommandGroup(false)||i.options.getSubcommand()!=='erase')return false;
  if(!i.guildId){await reply(i,'Open this command in a server with PokéPost.');return true;}
  await i.deferReply({flags:MessageFlags.Ephemeral});
  const snap=await store.snapshot(i.user.id);
  if(!snap.exists){await i.editReply({content:'You do not have a saved profile to delete.'});return true;}
  for(const [key,value] of confirmations)if(value.expires<=now())confirmations.delete(key);
  if(confirmations.size>=1000)throw Error('Too many pending confirmations');
  const token=randomUUID().replaceAll('-','').slice(0,20);
  confirmations.set(token,{actor:i.user.id,guild:i.guildId,expires:now()+900000,fingerprint:snap.fingerprint});
  const row=new ActionRowBuilder().addComponents(
   new ButtonBuilder().setCustomId('profile_erase:'+token).setLabel('Delete my profile everywhere').setStyle(ButtonStyle.Danger),
   new ButtonBuilder().setCustomId('profile_keep:'+token).setLabel('Cancel').setStyle(ButtonStyle.Secondary));
  await i.editReply({content:`Permanently delete your saved profile and remove its posts from all servers? Your profile is currently active in ${snap.serverCount} server${snap.serverCount===1?'':'s'}. This cannot be undone.\n\nUse /post delete instead to remove it only from this server.\n\nPost removal runs gradually. Minimal message references remain until cleanup finishes. Moderation records and copies already published to followers may remain.`,components:[row],allowedMentions:{parse:[]}});
  return true;
 }
 async function button(i){
  if(!/^profile_(erase|keep):/.test(i.customId||''))return false;
  const match=/^profile_(erase|keep):([a-f0-9]{20})$/.exec(i.customId),saved=match&&confirmations.get(match[2]);
  if(!saved||saved.actor!==i.user.id||saved.guild!==i.guildId||saved.expires<=now()){
   await reply(i,'This confirmation is no longer available. Run /post erase again.');return true;
  }
  confirmations.delete(match[2]);await i.deferUpdate();
  if(match[1]==='keep'){await i.editReply({content:'Deletion cancelled. Your profile is unchanged.',components:[]});return true;}
  try{
   const removed=await store.erase(i.user.id,saved.fingerprint);
   await i.editReply({content:removed?'Your saved profile has been deleted. Its posts in all servers are queued for removal. Minimal message references remain until cleanup finishes. Moderation records and copies already published to followers may remain.':'You do not have a saved profile to delete.',components:[],allowedMentions:{parse:[]}});
  }catch(error){
   logger.error(JSON.stringify({event:'poke_post_erasure_failed',errorCode:error.code||null}));
   const content=error.code==='STALE_ERASURE'?'Your profile changed after you opened this confirmation. Run /post erase again to review it.':
    error.code==='ERASURE_DELIVERY_REVIEW'?'Deletion is paused because an earlier post needs to be checked. Your profile has not been deleted. Contact bot support, then try again.':
    'Deletion could not be confirmed. Check /post view before trying again.';
   await i.editReply({content,components:[],allowedMentions:{parse:[]}});
  }
  return true;
 }
 return {command,button};
}
module.exports={createProfileErasure};
