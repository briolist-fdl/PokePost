const {MessageFlags,PermissionFlagsBits}=require('discord.js');
const {validatePattern}=require('./guildSettings');
function createGuildModeration({publisher,getSettings,logger=console}){
 async function command(i){
  if(i.commandName!=='post'||i.options.getSubcommandGroup(false)!=='admin')return false;
  const sub=i.options.getSubcommand();if(!['region','remove'].includes(sub))return false;
  const reply=content=>i.reply({content,flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}});
  if(!i.guildId||!await getSettings(i.guildId)){await reply('Open this command in a server where Poké-Post is configured.');return true;}
  if(!i.memberPermissions?.has(PermissionFlagsBits.ManageMessages)){await reply('You need Manage Messages to moderate profile posts.');return true;}
  const raw=String(i.options.get('user',true)?.value||'').trim();
  const match=/^(?:<@!?(\d{17,20})>|(\d{17,20}))$/.exec(raw),userId=match?.[1]||match?.[2];
  if(!userId){await reply('Enter the profile owner’s user ID or @mention.');return true;}
  let pattern,selected;
  if(sub==='region'){
   pattern=i.options.getString('vivillon_pattern',true);
   try{validatePattern(pattern);}catch{await reply('Choose a valid Vivillon region.');return true;}
  }else{
   const value=i.options.getString('message')?.trim();
   if(value){const link=/^https:\/\/(?:www\.)?discord\.com\/channels\/(\d{17,20})\/(\d{17,20})\/(\d{17,20})\/?$/.exec(value);
    if(link&&link[1]===i.guildId)selected={channelId:link[2],messageId:link[3]};
    else if(/^\d{17,20}$/.test(value))selected={messageId:value};
    else{await reply('Enter a message ID or a Discord message link from this server.');return true;}
   }
  }
  await i.deferReply({flags:MessageFlags.Ephemeral});
  try{
   const context={actor:i.user.id,interaction:i.id,channelId:i.channelId};
   const result=sub==='region'?await publisher.moderateRegion(i.guildId,userId,pattern,context):await publisher.moderateRemove(i.guildId,userId,selected,context);
   let content;
   if(result.inactive)content='That profile is not active in this server. To remove an older copy, include its message link.';
   else if(sub==='region')content='The region correction is saved for this server. The post will update shortly. The shared profile and other servers are unchanged.';
   else if(result.deactivated)content='The profile is inactive in this server and its posts are queued for removal. The shared profile remains. The owner can activate it here again.';
   else content='The selected copy is queued for removal. Other active posts are unchanged.';
   await i.editReply({content,allowedMentions:{parse:[]}});
  }catch(error){logger.error(JSON.stringify({event:'poke_post_guild_moderation_failed',guildId:i.guildId,userId,moderatorId:i.user.id,interactionId:i.id,errorCode:error.code||null}));
   await i.editReply({content:'The moderation action could not be confirmed. Check the selected post and the bot’s channel access before trying again.',allowedMentions:{parse:[]}});
  }
  return true;
 }
 return {command};
}
module.exports={createGuildModeration};
