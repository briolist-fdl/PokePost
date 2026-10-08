function createFeedMessageModeration({getSettings,logger=console,setTimeoutFn=setTimeout}) {
  async function handle(message) {
    if (message.author?.bot || !message.guildId || !message.channelId) return false;
    const settings=await getSettings(message.guildId);
    const feeds=[settings?.internationalChannelId,settings?.localChannelId].filter(Boolean);
    if (!feeds.includes(message.channelId)) return false;
    try {
      await message.delete();
      const warning=await message.channel.send({
        content:`<@${message.author.id}> Please use \`/post setup\` to share your friend code. Regular messages are removed, but may remain visible on your screen until refreshed.`,
        allowedMentions:{users:[message.author.id],roles:[],repliedUser:false}
      });
      setTimeoutFn(()=>{
        warning.delete().catch(error=>logger.error(JSON.stringify({event:'poke_post_feed_warning_cleanup_failed',guildId:message.guildId,channelId:message.channelId,errorCode:error.code||null})));
      },22000);
    } catch(error) {
      logger.error(JSON.stringify({event:'poke_post_feed_message_moderation_failed',guildId:message.guildId,channelId:message.channelId,errorCode:error.code||null}));
    }
    return true;
  }
  return {handle};
}
module.exports={createFeedMessageModeration};
