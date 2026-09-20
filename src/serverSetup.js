const {randomUUID}=require('node:crypto');
const {ModalBuilder,LabelBuilder,ChannelSelectMenuBuilder,StringSelectMenuBuilder,TextInputBuilder,TextInputStyle,ChannelType,PermissionFlagsBits,MessageFlags}=require('discord.js');
const {GROUPS}=require('./vivillonGroups');
const {feedSnapshot}=require('./serverSetupStore');
const title=s=>s.split('_').map(word=>word[0].toUpperCase()+word.slice(1)).join(' ');
function addServerSetupCommands(admin) {
  return admin.addSubcommand(sub=>sub.setName('server').setDescription('Choose this server’s friend code feeds and local region.'))
    .addSubcommand(sub=>sub.setName('thread').setDescription('Choose or disconnect an existing Vivillon group thread.')
      .addStringOption(opt=>opt.setName('group').setDescription('The Vivillon group to configure.').setRequired(true)
        .addChoices(...Object.keys(GROUPS).map(value=>({name:title(value),value})))));
}
function parseThread(value,guildId) {
  const text=value.trim();
  if(!text) return null;
  if(/^\d{17,20}$/.test(text)) return text;
  const link=/^https:\/\/(?:www\.)?discord\.com\/channels\/(\d{17,20})\/(\d{17,20})(?:\/\d{17,20})?\/?$/.exec(text);
  if(link && link[1]===guildId) return link[2];
  throw Error('Enter a thread ID or a Discord link from this server.');
}
function createServerSetup({store,now=()=>Date.now(),logger=console}) {
  const sessions=new Map();
  async function guard(i) {
    if(!i.guildId || i.guild?.id!==i.guildId || !i.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
      await i.reply({content:'You need Manage Messages in this server to configure Poké-Post.',flags:MessageFlags.Ephemeral});return false;
    }return true;
  }
  function session(i,data) {
    for(const [key,value] of sessions)if(value.expires<=now())sessions.delete(key);
    // One pending form per moderator and server, bounded lifetime and no reusable IDs.
    for(const [key,value] of sessions)if(value.actor===i.user.id && value.guild===i.guildId)sessions.delete(key);
    const key=randomUUID();sessions.set(key,{...data,actor:i.user.id,guild:i.guildId,expires:now()+900000});return 'post_server:'+key;
  }
  function channelInput(id,label,selected,optional) {
    const select=new ChannelSelectMenuBuilder().setCustomId(id).setChannelTypes(ChannelType.GuildText,ChannelType.GuildAnnouncement)
      .setMinValues(optional?0:1).setMaxValues(1).setRequired(!optional);
    if(selected)select.setDefaultChannels(selected);
    return new LabelBuilder().setLabel(label).setChannelSelectMenuComponent(select);
  }
  async function open(i) {
    if(!await guard(i))return;
    const settings=await store.get(i.guildId);
    const region=new StringSelectMenuBuilder().setCustomId('local_pattern').setPlaceholder('Choose your local Vivillon region')
      .setMinValues(1).setMaxValues(1).addOptions(Object.values(GROUPS).flat().sort().map(value=>({label:title(value),value,default:settings?.localPattern===value})));
    const modal=new ModalBuilder().setCustomId(session(i,{kind:'feeds',expected:feedSnapshot(settings)})).setTitle('Set up your server feeds')
      .addLabelComponents(channelInput('main_channel','Main friend code feed',settings?.internationalChannelId,false),
        channelInput('local_channel','Separate local feed, optional',settings?.localChannelId,true),
        new LabelBuilder().setLabel('Local Vivillon region').setStringSelectMenuComponent(region));
    await i.showModal(modal);
  }
  async function openThread(i,group) {
    if(!await guard(i))return;
    if(!Object.hasOwn(GROUPS,group))return i.reply({content:'Choose a valid Vivillon group.',flags:MessageFlags.Ephemeral});
    const settings=await store.get(i.guildId);
    if(!settings)return i.reply({content:'Use `/post admin server` to choose your feeds first.',flags:MessageFlags.Ephemeral});
    const existing=settings.threads[group]||null;
    const field=new TextInputBuilder().setCustomId('thread').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(200)
      .setPlaceholder('Paste a thread link or ID. Leave blank to disconnect.');
    if(existing)field.setValue(existing);
    await i.showModal(new ModalBuilder().setCustomId(session(i,{kind:'thread',group,expected:existing}))
      .setTitle('Set up '+title(group)).addLabelComponents(new LabelBuilder().setLabel('Existing group thread').setTextInputComponent(field)));
  }
  async function submit(i) {
    if(!await guard(i))return;
    const key=i.customId?.startsWith('post_server:')?i.customId.slice(12):'';
    const pending=sessions.get(key);
    if(!pending || pending.actor!==i.user.id || pending.guild!==i.guildId || pending.expires<=now()) {
      return i.reply({content:'This setup form has expired. Reopen the command to continue.',flags:MessageFlags.Ephemeral});
    }
    sessions.delete(key);
    await i.deferReply({flags:MessageFlags.Ephemeral});
    try {
      if(pending.kind==='feeds') {
        const main=i.fields.getSelectedChannels('main_channel'),local=i.fields.getSelectedChannels('local_channel');
        const patterns=i.fields.getStringSelectValues('local_pattern');
        if(main?.size!==1 || (local?.size||0)>1 || patterns.length!==1)throw Error('Choose one main feed and one local region. A separate local feed is optional.');
        const values={internationalChannelId:main.first().id,localChannelId:local?.first()?.id||null,localPattern:patterns[0]};
        await store.saveFeeds(i.guild,values,pending.expected);
        logger.log?.(JSON.stringify({event:'poke_post_server_setup_saved',guildId:i.guildId,actorId:i.user.id,action:'feeds',...values}));
        await i.editReply({content:values.localChannelId ? 'Your feed settings are saved. The local region has a separate feed.' : 'Your feed settings are saved. All regions use the main feed.',allowedMentions:{parse:[]}});
      }else {
        const threadId=parseThread(i.fields.getTextInputValue('thread'),i.guildId);
        await store.saveThread(i.guild,pending.group,threadId,pending.expected);
        logger.log?.(JSON.stringify({event:'poke_post_server_setup_saved',guildId:i.guildId,actorId:i.user.id,action:'thread',group:pending.group,threadId}));
        await i.editReply({content:threadId?title(pending.group)+' is linked to <#'+threadId+'>.':title(pending.group)+' is no longer linked to a thread.',allowedMentions:{parse:[]}});
      }
    }catch(error){
      logger.error(JSON.stringify({event:'poke_post_server_setup_failed',guildId:i.guildId,actorId:i.user.id,errorCode:error.code||null}));
      // Expected validation errors are plain Error values. Do not expose SQL/network internals.
      const content=error.code ? 'The settings could not be confirmed. Reopen the command and check the saved choices before trying again.' : error.message;
      await i.editReply({content,allowedMentions:{parse:[]}});
    }
  }
  return {open,openThread,submit};
}
module.exports={createServerSetup,addServerSetupCommands,parseThread};
