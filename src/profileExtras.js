const { escapeMarkdown } = require('discord.js');
const { validatePattern } = require('./guildSettings');

function normalizePersonalMessage(value) {
  if (value === null) return null;
  if (typeof value !== 'string') throw Error('Personal message must be text');
  const text = value.replace(/\s+/gu, ' ').trim();
  if (Array.from(text).length > 160) throw Error('Personal message must be at most 160 characters');
  // This exact sentinel is part of the Selective Auto Publisher contract.
  if (text.includes('🔇 republishing off')) throw Error('Personal message contains reserved publishing text');
  return text || null;
}
function normalizeWantedRegions(value) {
  if (!Array.isArray(value) || value.length > 18) throw Error('Choose up to 18 Vivillon regions');
  value.forEach(validatePattern);
  return [...new Set(value)];
}
function renderProfileExtras(profile, settings) {
  // Fail closed if the caller accidentally supplies another guild's settings.
  if (!profile?.active || !profile.guild_id || profile.guild_id !== settings?.guildId) return [];
  const lines = [];
  if (settings.showPersonalMessage === true && !profile.personal_message_hidden && profile.personal_message) {
    const text = normalizePersonalMessage(profile.personal_message);
    if (text) lines.push(`Message: ${escapeMarkdown(text).replace(/@/g, '@\u200b')}`);
  }
  if (settings.showWantedRegions === true && profile.wanted_regions?.length) {
    const regions = normalizeWantedRegions(profile.wanted_regions);
    lines.push(`Looking for: ${regions.map(region => region.split('_').map(word => word[0].toUpperCase() + word.slice(1)).join(' ')).join(', ')}`);
  }
  return lines;
}
module.exports = { normalizePersonalMessage, normalizeWantedRegions, renderProfileExtras };
