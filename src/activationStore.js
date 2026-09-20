const { publicChannelFor, validatePattern } = require('./guildSettings');
const { normalizePersonalMessage, normalizeWantedRegions } = require('./profileExtras');

function requireId(value) {
  if (typeof value !== 'string' || !/^\d{17,20}$/.test(value)) throw Error('Invalid Discord ID');
}
function owner(actorId, userId) {
  requireId(actorId); requireId(userId);
  if (actorId !== userId) throw Error('Only the profile owner can change their shared profile or activate it');
}
function scope(guildId, userId) { requireId(guildId); requireId(userId); }
function config(row) {
  if (!row) throw Error('Server is not configured');
  return { guildId: row.guild_id, localChannelId: row.local_channel_id,
    internationalChannelId: row.international_channel_id, localPattern: row.local_pattern,
    moderateChannels: row.moderate_channels, bumpEnabled: row.bump_enabled };
}
const projection = `SELECT p.*, a.guild_id, a.active, a.publish_to_followers,
  a.region_override, a.public_channel_id, a.public_message_id, a.last_bumped_at, a.personal_message_hidden,
  COALESCE(a.region_override, p.vivillon_pattern) AS vivillon_pattern
  FROM poke_post_profiles p JOIN poke_post_activations a USING (discord_user_id)`;

function createActivationStore(pool) {
  async function transaction(work) {
    const db = await pool.connect();
    try { await db.query('BEGIN'); const value = await work(db); await db.query('COMMIT'); return value; }
    catch (error) { await db.query('ROLLBACK').catch(() => {}); throw error; }
    finally { db.release(); }
  }
  async function getProfile(actorId, userId) {
    owner(actorId, userId);
    return (await pool.query('SELECT * FROM poke_post_profiles WHERE discord_user_id = $1', [userId])).rows[0] || null;
  }
  async function saveProfile(actorId, profile) {
    owner(actorId, profile.discordUserId);
    if (typeof profile.pokemonUsername !== 'string' || !profile.pokemonUsername.trim() ||
        !/^\d{12}$/.test(profile.trainerCodeRaw || '') || !Array.isArray(profile.additionalCodes) ||
        profile.additionalCodes.length > 3 || profile.additionalCodes.some(c => typeof c !== 'string' || !/^\d{12}$/.test(c))) {
      throw Error('Invalid profile name or friend codes');
    }
    validatePattern(profile.vivillonPattern);
    return (await pool.query(`INSERT INTO poke_post_profiles
      (discord_user_id, pokemon_username, trainer_code_raw, additional_codes, campfire_username, vivillon_pattern)
      VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (discord_user_id) DO UPDATE SET
      pokemon_username = EXCLUDED.pokemon_username, trainer_code_raw = EXCLUDED.trainer_code_raw,
      additional_codes = EXCLUDED.additional_codes, campfire_username = EXCLUDED.campfire_username,
      vivillon_pattern = EXCLUDED.vivillon_pattern, revision = poke_post_profiles.revision + 1, updated_at = NOW()
      RETURNING *`, [profile.discordUserId, profile.pokemonUsername.trim(), profile.trainerCodeRaw,
      profile.additionalCodes, profile.campfireUsername || null, profile.vivillonPattern])).rows[0];
  }
  async function getForGuild(guildId, userId) {
    scope(guildId, userId);
    return (await pool.query(`${projection} WHERE a.guild_id = $1 AND a.discord_user_id = $2 AND a.active`, [guildId, userId])).rows[0] || null;
  }
  async function activate(actorId, guildId, userId, publishToFollowers) {
    owner(actorId, userId); scope(guildId, userId);
    if (typeof publishToFollowers !== 'boolean') throw Error('Explicit per-server publishing choice is required');
    return transaction(async db => {
      const settings = config((await db.query('SELECT * FROM poke_post_guilds WHERE guild_id = $1', [guildId])).rows[0]);
      const profile = (await db.query('SELECT * FROM poke_post_profiles WHERE discord_user_id = $1 FOR UPDATE', [userId])).rows[0];
      if (!profile) throw Error('Create a shared profile before activation');
      const channelId = publicChannelFor(settings, profile.vivillon_pattern);
      // An already active post must not be reset or silently have its consent changed.
      const result = await db.query(`INSERT INTO poke_post_activations
        (guild_id, discord_user_id, active, publish_to_followers, public_channel_id)
        VALUES ($1,$2,TRUE,$3,$4) ON CONFLICT (guild_id, discord_user_id) DO UPDATE SET
        active = TRUE, publish_to_followers = EXCLUDED.publish_to_followers, updated_at = NOW()
        WHERE NOT poke_post_activations.active RETURNING *`, [guildId, userId, publishToFollowers, channelId]);
      return result.rows[0] || null;
    });
  }
  async function removePost(guildId, userId, deletePublicPost) {
    scope(guildId, userId);
    return transaction(async db => {
      const previous = (await db.query('SELECT * FROM poke_post_activations WHERE guild_id = $1 AND discord_user_id = $2 FOR UPDATE', [guildId, userId])).rows[0];
      if (!previous) return null;
      if (previous.public_message_id) {
        if (typeof deletePublicPost !== 'function') throw Error('A verified Discord deletion handler is required');
        await deletePublicPost(previous);
      }
      await db.query(`UPDATE poke_post_activations SET active = FALSE, public_message_id = NULL,
        updated_at = NOW() WHERE guild_id = $1 AND discord_user_id = $2`, [guildId, userId]);
      return previous;
    });
  }
  async function setRegionOverride(guildId, userId, pattern) {
    scope(guildId, userId);
    const settings = config((await pool.query('SELECT * FROM poke_post_guilds WHERE guild_id = $1', [guildId])).rows[0]);
    publicChannelFor(settings, pattern);
    return (await pool.query(`UPDATE poke_post_activations SET region_override = $3, updated_at = NOW()
      WHERE guild_id = $1 AND discord_user_id = $2 AND active RETURNING *`, [guildId, userId, pattern])).rows[0] || null;
  }
  async function setRepublishing(actorId, guildId, userId, enabled) {
    owner(actorId, userId); scope(guildId, userId);
    if (typeof enabled !== 'boolean') throw Error('Invalid publishing choice');
    return (await pool.query(`UPDATE poke_post_activations SET publish_to_followers = $3, updated_at = NOW()
      WHERE guild_id = $1 AND discord_user_id = $2 AND active RETURNING *`, [guildId, userId, enabled])).rows[0] || null;
  }
  async function withActivePost(guildId, userId, expectedMessageId, work) {
    scope(guildId, userId);
    if (expectedMessageId !== null) requireId(expectedMessageId);
    return transaction(async db => {
      const profile = (await db.query(`${projection} WHERE a.guild_id = $1 AND a.discord_user_id = $2 AND a.active
        FOR UPDATE OF p, a`, [guildId, userId])).rows[0];
      if (!profile || profile.public_message_id !== expectedMessageId) return null;
      const settings = config((await db.query('SELECT * FROM poke_post_guilds WHERE guild_id = $1', [guildId])).rows[0]);
      const targetChannelId = publicChannelFor(settings, profile.vivillon_pattern);
      // Discord delivery/cleanup belongs to the caller. Only this scoped reference writer is exposed.
      return work(profile, targetChannelId, async (messageId, { bumped = false } = {}) => {
        requireId(messageId);
        await db.query(`UPDATE poke_post_activations SET public_channel_id = $3, public_message_id = $4,
          last_bumped_at = CASE WHEN $5 THEN NOW() ELSE last_bumped_at END, updated_at = NOW()
          WHERE guild_id = $1 AND discord_user_id = $2`, [guildId, userId, targetChannelId, messageId, bumped]);
      });
    });
  }
  async function bumpCandidates(guildId, channelId, cutoff, limit) {
    requireId(guildId); requireId(channelId);
    if (!(cutoff instanceof Date) || !Number.isFinite(cutoff.getTime()) || !Number.isInteger(limit) || limit < 1 || limit > 100) throw Error('Invalid bump bounds');
    return (await pool.query(`${projection} JOIN poke_post_guilds g ON g.guild_id = a.guild_id
      WHERE a.guild_id = $1 AND a.public_channel_id = $2 AND a.active AND g.bump_enabled
      AND a.public_message_id IS NOT NULL AND (a.last_bumped_at IS NULL OR a.last_bumped_at < $3)
      ORDER BY a.last_bumped_at NULLS FIRST, a.discord_user_id LIMIT $4`, [guildId, channelId, cutoff, limit])).rows;
  }
  async function setProfileExtras(actorId, userId, changes) {
    owner(actorId, userId);
    const hasMessage = Object.hasOwn(changes, 'personalMessage');
    const hasRegions = Object.hasOwn(changes, 'wantedRegions');
    if (Object.keys(changes).some(key => !['personalMessage', 'wantedRegions'].includes(key))) throw Error('Unknown profile field');
    if (!hasMessage && !hasRegions) return getProfile(actorId, userId);
    const message = hasMessage ? normalizePersonalMessage(changes.personalMessage) : null;
    const regions = hasRegions ? normalizeWantedRegions(changes.wantedRegions) : [];
    return (await pool.query(`UPDATE poke_post_profiles SET
      personal_message = CASE WHEN $2 THEN $3 ELSE personal_message END,
      wanted_regions = CASE WHEN $4 THEN $5::text[] ELSE wanted_regions END,
      revision = revision + 1, updated_at = NOW() WHERE discord_user_id = $1 RETURNING *`,
    [userId, hasMessage, message, hasRegions, regions])).rows[0] || null;
  }
  async function hidePersonalMessage(guildId, userId, hidden) {
    scope(guildId, userId);
    if (typeof hidden !== 'boolean') throw Error('Hidden must be a boolean');
    return (await pool.query(`UPDATE poke_post_activations SET personal_message_hidden = $3,
      updated_at = NOW() WHERE guild_id = $1 AND discord_user_id = $2 RETURNING *`,
    [guildId, userId, hidden])).rows[0] || null;
  }
  return { getProfile, saveProfile, getForGuild, activate, removePost, setRegionOverride,
    setRepublishing, withActivePost, bumpCandidates, setProfileExtras, hidePersonalMessage };
}
module.exports = { createActivationStore };
