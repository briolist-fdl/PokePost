const { PermissionFlagsBits } = require('discord.js');

const INSTRUCTION = 'Please use `/post setup` to share your friend code. Regular messages are removed from this feed.';

function createCleanFeedModeration({ store, logger = console, schedule = setTimeout, instructionLifetimeMs = 20000 }) {
  async function handle(message) {
    if (!message?.inGuild?.() || message.author?.bot) return false;
    const settings = await store.get(message.guildId);
    if (!settings?.moderateChannels) return false;
    const feeds = new Set([settings.internationalChannelId, settings.localChannelId].filter(Boolean));
    if (!feeds.has(message.channelId)) return false;

    const me = message.guild?.members?.me || await message.guild?.members?.fetchMe?.();
    const permissions = message.channel?.permissionsFor?.(me);
    if (!permissions?.has([PermissionFlagsBits.ManageMessages, PermissionFlagsBits.SendMessages])) {
      logger.warn?.(JSON.stringify({ event: 'poke_post_clean_feed_unavailable', guildId: message.guildId, channelId: message.channelId }));
      return false;
    }

    await message.delete();
    const instruction = await message.channel.send({ content: INSTRUCTION, allowedMentions: { parse: [] } });
    schedule(() => instruction.delete().catch(error => logger.warn?.(JSON.stringify({ event: 'poke_post_clean_feed_instruction_delete_failed', guildId: message.guildId, channelId: message.channelId, errorCode: error?.code || null }))), instructionLifetimeMs);
    return true;
  }
  return { handle, INSTRUCTION };
}

module.exports = { createCleanFeedModeration, INSTRUCTION };
