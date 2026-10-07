const {SlashCommandBuilder}=require('discord.js');
const {GROUPS}=require('./vivillonGroups');
const patterns=Object.values(GROUPS).flat().sort().map(value=>({name:value.replaceAll('_',' '),value}));
function testCommands(){
 const root=new SlashCommandBuilder().setName('post').setDescription('Manage your friend code profile.');
 root.addSubcommand(s=>s.setName('erase').setDescription('Permanently delete your saved profile and remove its posts from all servers.'));
 root.addSubcommand(s=>s.setName('about').setDescription('Learn what PokéPost offers and what is planned.'));
 for(const [name,description] of [['setup','Create or activate your profile in this server.'],['edit','Edit your shared profile across its active servers.'],['view','View your saved profile privately.'],['delete','Remove your profile posts from this server.'],['repost','Replace your profile post in this server.']])root.addSubcommand(s=>s.setName(name).setDescription(description));
 root.addSubcommand(s=>s.setName('republishing').setDescription('Choose whether this server may republish your post.').addBooleanOption(o=>o.setName('enabled').setDescription('Allow republishing from this server.').setRequired(true)));
 root.addSubcommand(s=>s.setName('region').setDescription('Change your shared region across active servers.').addStringOption(o=>o.setName('vivillon_pattern').setDescription('Your Vivillon region.').setRequired(true).addChoices(...patterns)));
 root.addSubcommand(s=>s.setName('add-code').setDescription('Add a friend code to your shared profile.').addStringOption(o=>o.setName('trainer_code').setDescription('A friend code with 12 digits.').setRequired(true)));
 root.addSubcommand(s=>s.setName('remove-code').setDescription('Remove an extra code from your shared profile.').addIntegerOption(o=>o.setName('code_number').setDescription('Extra code number from your profile view.').setRequired(true).setMinValue(1).setMaxValue(3)));
 root.addSubcommandGroup(g=>g.setName('admin').setDescription('Configure and moderate this server.').addSubcommand(s=>s.setName('server').setDescription('Choose this server’s feeds and local region.'))
  .addSubcommand(s=>s.setName('thread').setDescription('Choose or disconnect an existing Vivillon group thread.')
   .addStringOption(o=>o.setName('group').setDescription('The Vivillon group to configure.').setRequired(true)
    .addChoices(...Object.keys(GROUPS).map(value=>({name:value.replaceAll('_',' ').replace(/\b\w/g,letter=>letter.toUpperCase()),value})))))
  .addSubcommand(s=>s.setName('region').setDescription('Correct a profile’s region in this server.').addStringOption(o=>o.setName('user').setDescription('Profile owner’s user ID or mention.').setRequired(true)).addStringOption(o=>o.setName('vivillon_pattern').setDescription('Correct region for this server.').setRequired(true).addChoices(...patterns)))
  .addSubcommand(s=>s.setName('remove').setDescription('Remove a profile post from this server.').addStringOption(o=>o.setName('user').setDescription('Profile owner’s user ID or mention.').setRequired(true)).addStringOption(o=>o.setName('message').setDescription('Optional message link or ID for an older copy.'))));
 return [root.toJSON()];
}
module.exports={testCommands};
