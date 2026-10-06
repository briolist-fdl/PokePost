const { ChannelType, PermissionFlagsBits } = require('discord.js');

const PATTERNS = new Set(['archipelago', 'continental', 'elegant', 'garden',
  'high_plains', 'icy_snow', 'jungle', 'marine', 'meadow', 'modern', 'monsoon',
  'ocean', 'polar', 'river', 'sandstorm', 'savanna', 'sun', 'tundra']);
const idIsValid = id => typeof id === 'string' && /^\d{17,20}$/.test(id);

function validate(settings) {
  for (const key of ['guildId', 'internationalChannelId']) {
    if (!idIsValid(settings[key])) throw new Error(`Invalid ${key}`);
  }
  if (settings.localChannelId != null && !idIsValid(settings.localChannelId)) throw Error('Invalid localChannelId');
  if (settings.localChannelId === settings.internationalChannelId) {
    throw new Error('Local and international feeds must use different channels');
  }
  if (!PATTERNS.has(settings.localPattern)) throw new Error('Invalid local Vivillon pattern');
  for (const key of ['moderateChannels', 'bumpEnabled']) {
    if (typeof settings[key] !== 'boolean') throw new Error(`${key} must be a boolean`);
  }
  return settings;
}

function fromRow(row) {
  return row ? validate({ guildId: row.guild_id, localChannelId: row.local_channel_id,
    internationalChannelId: row.international_channel_id, localPattern: row.local_pattern,
    moderateChannels: row.moderate_channels, bumpEnabled: row.bump_enabled,
    showPersonalMessage: row.show_personal_message === true,
    showWantedRegions: row.show_wanted_regions === true }) : null;
}

function publicChannelFor(settings, pattern) {
  validate(settings);
  if (!PATTERNS.has(pattern)) throw new Error('Invalid profile Vivillon pattern');
  return pattern === settings.localPattern && settings.localChannelId ? settings.localChannelId : settings.internationalChannelId;
}

async function validateChannels(settings, guild) {
  validate(settings);
  if (guild?.id !== settings.guildId) throw new Error('Settings belong to another server');
  const me = guild.members.me || await guild.members.fetchMe();
  for (const id of [settings.localChannelId, settings.internationalChannelId].filter(Boolean)) {
    const channel = await guild.channels.fetch(id);
    if (!channel || channel.guildId !== settings.guildId ||
        ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) {
      throw new Error('Feed channels must be text or announcement channels in this server');
    }
    const needed = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory];
    if (settings.moderateChannels) needed.push(PermissionFlagsBits.ManageMessages);
    if (!channel.permissionsFor(me)?.has(needed)) throw new Error('The bot lacks required feed permissions');
  }
}

function createGuildSettingsStore(pool) {
  async function get(guildId) {
    if (!idIsValid(guildId)) throw new Error('Invalid guildId');
    return fromRow((await pool.query('SELECT * FROM poke_post_guilds WHERE guild_id = $1', [guildId])).rows[0]);
  }
  async function save(settings, guild, { onlyIfMissing = false } = {}) {
    // Validate a snapshot before any database write, including Discord ownership/access.
    const checked = validate({ ...settings });
    await validateChannels(checked, guild);
    const conflict = onlyIfMissing ? 'DO NOTHING' : `DO UPDATE SET
      local_channel_id = EXCLUDED.local_channel_id,
      international_channel_id = EXCLUDED.international_channel_id,
      local_pattern = EXCLUDED.local_pattern,
      moderate_channels = EXCLUDED.moderate_channels,
      bump_enabled = EXCLUDED.bump_enabled`;
    await pool.query(`INSERT INTO poke_post_guilds
      (guild_id, local_channel_id, international_channel_id, local_pattern, moderate_channels, bump_enabled)
      VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (guild_id) ${conflict}`,
    [checked.guildId, checked.localChannelId, checked.internationalChannelId,
      checked.localPattern, checked.moderateChannels, checked.bumpEnabled]);
    return get(checked.guildId);
  }
  async function setPresentation(guildId, { showPersonalMessage, showWantedRegions }) {
    if (!idIsValid(guildId)) throw new Error('Invalid guildId');
    if (typeof showPersonalMessage !== 'boolean' || typeof showWantedRegions !== 'boolean') {
      throw new Error('Presentation choices must be booleans');
    }
    await pool.query(`UPDATE poke_post_guilds SET show_personal_message = $2,
      show_wanted_regions = $3 WHERE guild_id = $1`, [guildId, showPersonalMessage, showWantedRegions]);
    return get(guildId);
  }
  return { get, save, setPresentation };
}

function validatePattern(pattern) {
  if (!PATTERNS.has(pattern)) throw new Error('Invalid Vivillon pattern');
  return pattern;
}

module.exports = { createGuildSettingsStore, publicChannelFor, validateChannels, validatePattern };
