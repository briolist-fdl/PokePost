const {MessageFlags}=require('discord.js');
const id=v=>typeof v==='string'&&/^\d{17,20}$/.test(v);
// Internal bridge. Call only after validating the bot identity and server scope.
function createCopyTransition({pool,client,mode,guildIds=null}){
 if(!['shared','legacy'].includes(mode)||(guildIds!==null&&(!Array.isArray(guildIds)||!guildIds.length||guildIds.some(g=>!id(g)))))throw Error('Invalid copy transition scope');
 const allowed=guildIds===null?null:new Set(guildIds);
 return async function handle(i){
  const prefix=mode==='shared'?'copy_friend_code:':'guild_copy:';if(!i.customId?.startsWith(prefix))return false;
  const deny=async()=>{await i.reply({content:'That profile is no longer available in this server.',flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}});return true;};
  const match=mode==='shared'?/^copy_friend_code:(\d{17,20})(?::([0-3]))?$/.exec(i.customId):/^guild_copy:(\d{17,20}):(\d{17,20}):([0-3])$/.exec(i.customId);
  if(!match||!id(i.guildId)||allowed&&!allowed.has(i.guildId)||i.message?.author?.id!==client.user.id||!id(i.message?.id)||!id(i.channelId))return deny();
  if(mode==='legacy'&&match[1]!==i.guildId)return deny();
  const user=mode==='shared'?match[1]:match[2],index=Number((mode==='shared'?match[2]:match[3])||0);
  const query=mode==='shared'?`SELECT p.trainer_code_raw,p.additional_codes FROM poke_post_profiles p
   JOIN poke_post_activations a USING(discord_user_id)
   WHERE a.guild_id=$1 AND p.discord_user_id=$2 AND a.active AND a.public_message_id IS NOT NULL
   AND EXISTS(SELECT 1 FROM poke_post_imports WHERE import_key='legacy-shared-v1' AND guild_id=$1)
   AND NOT EXISTS(SELECT 1 FROM poke_post_imports WHERE import_key='legacy-rollback-v1')
   AND ((a.public_channel_id=$3 AND a.public_message_id=$4) OR EXISTS(SELECT 1 FROM poke_post_thread_posts t WHERE t.guild_id=$1 AND t.discord_user_id=$2 AND t.thread_id=$3 AND t.message_id=$4))`:
   `SELECT p.trainer_code_raw,p.additional_codes FROM friendcode_profiles p WHERE p.discord_user_id=$2 AND p.public_message_id IS NOT NULL
   AND EXISTS(SELECT 1 FROM poke_post_imports WHERE import_key='legacy-rollback-v1' AND guild_id=$1)
   AND ((p.public_channel_id=$3 AND p.public_message_id=$4) OR EXISTS(SELECT 1 FROM poke_post_thread_posts t WHERE t.guild_id=$1 AND t.discord_user_id=$2 AND t.thread_id=$3 AND t.message_id=$4))`;
  const p=(await pool.query(query,[i.guildId,user,i.channelId,i.message.id])).rows[0];if(!p)return deny();
  const code=[p.trainer_code_raw,...(p.additional_codes||[])][index];
  await i.reply({content:code?code.replace(/(\d{4})(\d{4})(\d{4})/,'$1 $2 $3'):'That friend code is no longer available.',flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}});return true;
 };
}
module.exports={createCopyTransition};
