const {randomUUID}=require('node:crypto');
const {ActionRowBuilder,ButtonBuilder,ButtonStyle,MessageFlags,escapeMarkdown}=require('discord.js');
const formatCode=code=>code.replace(/(\d{4})(\d{4})(\d{4})/,'$1 $2 $3');
function scopedCopyButtons(profile) {
 if(!/^\d{17,20}$/.test(profile.guild_id)||!/^\d{17,20}$/.test(profile.discord_user_id))throw Error('Missing profile scope');
 return [new ActionRowBuilder().addComponents([profile.trainer_code_raw,...(profile.additional_codes||[])].map((code,index)=>
  new ButtonBuilder().setCustomId(`guild_copy:${profile.guild_id}:${profile.discord_user_id}:${index}`).setStyle(ButtonStyle.Secondary)
   .setLabel(index===0?'📋 Copy friend code':`📋 Copy code ${index+1}`)))];
}
function createGuildProfileCommands({form,formStore,activationStore,getSettings,ownerStore,deactivate,logger=console,now=()=>Date.now()}) {
 const confirmations=new Map();
 const unavailable='Your profile is not active in this server. Use `/post setup` to activate it here.';
 async function action(i,sub){
  if(!i.guildId||!await getSettings(i.guildId)){await reply(i,'Open this command in a server where PokéPost is configured.');return;}
  await i.deferReply({flags:MessageFlags.Ephemeral});
  try{
   if(sub==='delete'){
    const snap=await formStore.snapshot(i.user.id,i.guildId);
    if(!snap.activation?.active){await i.editReply({content:unavailable});return;}
    for(const [key,value] of confirmations)if(value.expires<=now())confirmations.delete(key);
    if(confirmations.size>=1000)throw Error('Too many pending confirmations');
    const token=randomUUID().replaceAll('-','').slice(0,20);
    confirmations.set(token,{actor:i.user.id,guild:i.guildId,expires:now()+900000,revision:snap.revision,activationStamp:snap.activationStamp});
    const row=new ActionRowBuilder().addComponents(
     new ButtonBuilder().setCustomId('guild_remove:'+token).setLabel('Remove from this server').setStyle(ButtonStyle.Danger),
     new ButtonBuilder().setCustomId('guild_cancel:'+token).setLabel('Cancel').setStyle(ButtonStyle.Secondary));
    await i.editReply({content:'Remove your post and its group thread copies from this server? Your saved profile and posts in other servers will remain. You can activate it here again with `/post setup`.',components:[row],allowedMentions:{parse:[]}});return;
   }
   if(['region','add-code','remove-code'].includes(sub)){
    const result=sub==='region'?await ownerStore.setRegion(i.user.id,i.guildId,i.options.getString('vivillon_pattern',true)):
     sub==='add-code'?await ownerStore.addCode(i.user.id,i.guildId,i.options.getString('trainer_code',true)):
     await ownerStore.removeCode(i.user.id,i.guildId,i.options.getInteger('code_number',true));
    let content=!result?unavailable:'Your shared profile is saved. Your posts will update in every server where your profile is active.';
    if(result&&sub==='region'&&result.localOverride)content+=' A moderator has set a different region for this server, which remains in effect here.';
    await i.editReply({content,allowedMentions:{parse:[]}});return;
   }
   const result=sub==='repost'?await ownerStore.repost(i.user.id,i.guildId):await ownerStore.setRepublishing(i.user.id,i.guildId,i.options.getBoolean('enabled',true));
   const content=!result?unavailable:sub==='repost'?'Your repost is queued for this server. The previous post will be removed after the replacement is saved.':
    i.options.getBoolean('enabled',true)?'Republishing is enabled for this server. Your post will update shortly.':'Republishing is disabled for this server. Your post will update shortly. Copies already published to followers may remain.';
   await i.editReply({content,allowedMentions:{parse:[]}});
  }catch(error){logger.error(JSON.stringify({event:'poke_post_owner_action_failed',guildId:i.guildId,userId:i.user.id,errorCode:error.code||null}));await i.editReply({content:error.code==='INVALID_PROFILE_CHANGE'?error.message:'The action could not be confirmed. Check your profile before trying again.',components:[]});}
 }
 async function removalButton(i){
  const match=/^guild_(remove|cancel):([a-f0-9]{20})$/.exec(i.customId||'');
  if(!match){await reply(i,'This confirmation is no longer available. Open the command again.');return;}
  const saved=confirmations.get(match[2]);
  if(!saved||saved.expires<=now()||saved.actor!==i.user.id||saved.guild!==i.guildId){await reply(i,'This confirmation is no longer available. Open the command again.');return;}
  confirmations.delete(match[2]);
  await i.deferUpdate();
  if(match[1]==='cancel'){await i.editReply({content:'Removal cancelled.',components:[]});return;}
  try{
   if(!await getSettings(i.guildId))throw Error('Server is not configured');
   const removed=await deactivate(i.guildId,i.user.id,saved);
   await i.editReply({content:removed?'Your profile is now inactive in this server. Its posts are queued for removal. Your saved profile and other servers are unchanged.':unavailable,components:[],allowedMentions:{parse:[]}});
  }catch(error){logger.error(JSON.stringify({event:'poke_post_owner_removal_failed',guildId:i.guildId,userId:i.user.id,errorCode:error.code||null}));await i.editReply({content:error.code==='STALE_PROFILE_FORM'?'Your profile changed after you opened this confirmation. Run `/post delete` again to review it.':'Removal could not be confirmed. Check your profile before trying again.',components:[]});}
 }
 const reply=(i,content)=>i.reply({content,flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}});
 async function command(i) {
  if(i.commandName!=='post'||i.options.getSubcommandGroup(false))return false;
  const sub=i.options.getSubcommand();
  if(sub==='about'){
   await reply(i,[
    '**PokéPost**\nKeeps Pokémon GO friend code channels useful instead of noisy. Set up your profile with `/post setup`. Server admins choose the feeds and may sort regions into Vivillon threads.',
    '',
    '**Early access**\nEverything available in the pilot is free. We have not set any pricing. If paid features ever arrive, servers will get notice before anything changes.',
    '',
    '**In the works**\nPokéTrade posts, guided thread setup, alternative region emoji sets, and more ways to organise your Pokémon GO server.'
   ].join('\n'));return true;
  }
  if(['delete','repost','republishing','region','add-code','remove-code'].includes(sub)){await action(i,sub);return true;}if(!['setup','edit','view'].includes(sub))return false;
  if(sub!=='view'){await form.open(i,sub);return true;}
  if(!i.guildId||!await getSettings(i.guildId)){await reply(i,'Open this command in a server where PokéPost is configured.');return true;}
  const snap=await formStore.snapshot(i.user.id,i.guildId),p=snap.profile;
  if(!p){await reply(i,'You do not have a saved profile yet. Use `/post setup` first.');return true;}
  const safe=value=>escapeMarkdown(String(value)).replace(/@/g,'@\u200b');
  const lines=[`**Pokémon GO** ${safe(p.pokemon_username)}`,`**Friend code** ${formatCode(p.trainer_code_raw)}`,
    ...(p.additional_codes||[]).map(code=>`**Extra code** ${formatCode(code)}`),p.campfire_username?`**Campfire** ${safe(p.campfire_username)}`:null,
    `**Your region** ${safe(p.vivillon_pattern.replace(/_/g,' '))}`];
  if(snap.activation?.region_override)lines.push(`**Region in this server** ${safe(snap.activation.region_override.replace(/_/g,' '))}`);
  lines.push(snap.activation?.active?'Your profile is active in this server.':'Your profile is not active in this server. Use `/post setup` to activate it here.');
  await reply(i,lines.filter(Boolean).join('\n'));return true;
 }
 async function button(i) {
  if(/^guild_(remove|cancel):/.test(i.customId||'')){await removalButton(i);return true;}
  if(!i.customId?.startsWith('guild_copy:'))return false;
  const match=/^guild_copy:(\d{17,20}):(\d{17,20}):([0-3])$/.exec(i.customId);
  if(!match||i.guildId!==match[1]||!await getSettings(i.guildId)) {await reply(i,'This profile is not available in this server.');return true;}
  const profile=await activationStore.getForGuild(i.guildId,match[2]);
  if(!profile?.active||!profile.public_message_id){await reply(i,'That profile is no longer available in this server.');return true;}
  const code=[profile.trainer_code_raw,...(profile.additional_codes||[])][Number(match[3])];
  await reply(i,code?formatCode(code):'That friend code is no longer available.');return true;
 }
 return {command,button};
}
module.exports={createGuildProfileCommands,scopedCopyButtons};
