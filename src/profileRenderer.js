const {escapeMarkdown}=require('discord.js');
const EMOJIS={archipelago:'🏝️',continental:'🚂',elegant:'🪭',garden:'🪴',high_plains:'🐎',icy_snow:'🏔️',jungle:'🦧',marine:'🐚',meadow:'🌼',modern:'🚕',monsoon:'🦎',ocean:'🗿',polar:'🐻‍❄️',river:'🦫',sandstorm:'🐪',savanna:'🌾',sun:'☀️',tundra:'❄️'};
const title=s=>s.split('_').map(w=>w[0].toUpperCase()+w.slice(1)).join(' ');
const safe=s=>escapeMarkdown(String(s||'').replace(/\r?\n/g,' ').replace(/@/g,'@\u200b').replaceAll('🔇 republishing off','republishing off'));
const code=s=>s.replace(/(\d{4})(\d{4})(\d{4})/,'$1 $2 $3');
function createProfileRenderer(client){
 return async function render(profile){
  let label='Discord profile';
  try{const user=await client.users.fetch(profile.discord_user_id,{force:true});if(/^[a-z0-9_.]{2,32}$/.test(user?.username||''))label=user.username;}catch{}
  // Discord usernames cannot inject brackets into the link label. Underscores
  // stay literal here because escaping them renders visible slashes on mobile.
  const identity=`[${label}](<https://discord.com/users/${profile.discord_user_id}>)`;
  const line=`Discord ${identity} | Pokémon GO ${safe(profile.pokemon_username)}`+(profile.campfire_username?` | Campfire ${safe(profile.campfire_username)}`:'');
  const codes=[profile.trainer_code_raw,...(profile.additional_codes||[])].map(code).join(' | ')+(profile.publish_to_followers===false?' | 🔇 republishing off':'');
  return [`${EMOJIS[profile.vivillon_pattern]||''} ${title(profile.vivillon_pattern)} Trainer`,'',line,'',codes].join('\n');
 };
}
module.exports={createProfileRenderer};
