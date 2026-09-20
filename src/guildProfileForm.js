const {randomUUID}=require('node:crypto');
const {ModalBuilder,LabelBuilder,TextInputBuilder,TextInputStyle,StringSelectMenuBuilder,MessageFlags}=require('discord.js');
const {GROUPS}=require('./vivillonGroups');
const title=v=>v.split('_').map(w=>w[0].toUpperCase()+w.slice(1)).join(' ');
function createGuildProfileForm({store,getSettings,now=()=>Date.now(),logger=console}) {
 const sessions=new Map();
 async function guard(i) {
  if(!i.guildId||i.guild?.id!==i.guildId){await i.reply({content:'Open this command in the server where you want to use your profile.',flags:MessageFlags.Ephemeral});return false;}
  if(!await getSettings(i.guildId)){await i.reply({content:'This server has not configured Poké-Post yet. Ask a moderator to set it up.',flags:MessageFlags.Ephemeral});return false;}return true;
 }
 function token(i,data){
  for(const [key,s]of sessions)if(s.expires<=now()||(s.actor===i.user.id&&s.guild===i.guildId))sessions.delete(key);
  const key=randomUUID();sessions.set(key,{...data,actor:i.user.id,guild:i.guildId,expires:now()+900000});return 'guild_profile:'+key;
 }
 function input(id,label,value,required,maxLength,description){const item=new TextInputBuilder().setCustomId(id).setStyle(TextInputStyle.Short).setRequired(required).setMaxLength(maxLength);if(value)item.setValue(value);const field=new LabelBuilder().setLabel(label).setTextInputComponent(item);if(description)field.setDescription(description);return field;}
 async function open(i,command) {
  if(!await guard(i))return;
  if(!['setup','edit'].includes(command))throw Error('Unsupported profile command');
  const snap=await store.snapshot(i.user.id,i.guildId);
  if(command==='edit'&&!snap.activation?.active)return i.reply({content:'Use `/post setup` to activate your profile in this server first.',flags:MessageFlags.Ephemeral});
  const mode=snap.activation?.active?'edit':snap.profile?'activate':'create';
  const p=snap.profile;
  const publishing=new StringSelectMenuBuilder().setCustomId('publishing').setMinValues(1).setMaxValues(1)
    .setPlaceholder('Choose whether this server may republish your post')
    .addOptions([{label:'Yes, allow republishing',value:'yes',default:mode==='edit'&&snap.activation.publish_to_followers===true},
      {label:'No, keep it in this server',value:'no',default:mode==='edit'&&snap.activation.publish_to_followers===false}]);
  const modal=new ModalBuilder().setCustomId(token(i,{mode,revision:snap.revision,activationStamp:snap.activationStamp}))
    .setTitle(mode==='activate'?'Use your profile in this server':mode==='edit'?'Edit your shared profile':'Create your friend code profile');
  if(mode!=='activate') {
    const region=new StringSelectMenuBuilder().setCustomId('region').setMinValues(1).setMaxValues(1)
      .setPlaceholder('Choose your own Vivillon region').addOptions(Object.values(GROUPS).flat().sort().map(value=>({label:title(value),value,default:p?.vivillon_pattern===value})));
    modal.addLabelComponents(input('name','Pokémon GO username',p?.pokemon_username,true,64,'Profile details are shared across servers where you have activated your profile.'),
      input('code','Trainer code',p?.trainer_code_raw,true,32),new LabelBuilder().setLabel('Your Vivillon region').setStringSelectMenuComponent(region),
      input('campfire','Campfire username, optional',p?.campfire_username,false,64));
  }
  modal.addLabelComponents(new LabelBuilder().setLabel('Republish from this server?')
    .setDescription(mode==='activate'?'Submit to use your saved profile here. Your choices in other servers stay the same.':'This publishing choice applies only to this server.')
    .setStringSelectMenuComponent(publishing));
  await i.showModal(modal);
 }
 async function submit(i) {
  if(!await guard(i))return;
  const key=i.customId?.startsWith('guild_profile:')?i.customId.slice(14):'';const pending=sessions.get(key);
  if(!pending||pending.actor!==i.user.id||pending.guild!==i.guildId||pending.expires<=now())return i.reply({content:'This profile form has expired. Reopen the command to continue.',flags:MessageFlags.Ephemeral});
  sessions.delete(key);await i.deferReply({flags:MessageFlags.Ephemeral});
  try {
   const choices=i.fields.getStringSelectValues('publishing');
   if(choices.length!==1||!['yes','no'].includes(choices[0]))throw Error('Choose whether this server may republish your profile.');
   const values={publishToFollowers:choices[0]==='yes'};
   if(pending.mode!=='activate') {
    const regions=i.fields.getStringSelectValues('region');if(regions.length!==1)throw Error('Choose your own Vivillon region.');
    Object.assign(values,{pokemonUsername:i.fields.getTextInputValue('name').trim(),trainerCodeRaw:i.fields.getTextInputValue('code').replace(/\D/g,''),
      campfireUsername:i.fields.getTextInputValue('campfire').trim(),vivillonPattern:regions[0]});
   }
   await store.save(i.user.id,i.guildId,values,pending);
   await i.editReply({content:pending.mode==='edit'?'Your shared profile is saved. Posts in your active servers will update shortly.':'Your profile is activated in this server. Your post will appear shortly.',allowedMentions:{parse:[]}});
  }catch(error){logger.error(JSON.stringify({event:'poke_post_profile_form_failed',guildId:i.guildId,userId:i.user.id,errorCode:error.code||null}));
   await i.editReply({content:error.code==='STALE_PROFILE_FORM'?error.message:'The profile could not be confirmed. Check your details and reopen the command before trying again.',allowedMentions:{parse:[]}});
  }
 }
 return {open,submit};
}
module.exports={createGuildProfileForm};
