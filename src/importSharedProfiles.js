// Explicit import using a dedicated client, while old/new writers are stopped.
// Does not connect to a database, read secrets or execute schema migrations itself.
async function importSharedProfiles(db, guildId) {
  if (typeof guildId !== 'string' || !/^\d{17,20}$/.test(guildId)) throw Error('Invalid source guild ID');
  await db.query('BEGIN');
  try {
    await db.query('LOCK TABLE poke_post_imports IN EXCLUSIVE MODE');
    const previous = (await db.query("SELECT * FROM poke_post_imports WHERE import_key = 'legacy-shared-v1'")).rows[0];
    if (previous) {
      if (previous.guild_id !== guildId) throw Error('Legacy data was imported into a different server');
      await db.query('COMMIT');
      return { alreadyImported: true, count: previous.imported_count };
    }
    const settings = (await db.query('SELECT * FROM poke_post_guilds WHERE guild_id = $1 FOR UPDATE', [guildId])).rows[0];
    if (!settings) throw Error('Verify and save the source server settings first');
    await db.query('LOCK TABLE friendcode_profiles IN SHARE MODE');
    await db.query('LOCK TABLE poke_post_profiles, poke_post_activations IN EXCLUSIVE MODE');
    if ((await db.query('SELECT discord_user_id FROM poke_post_profiles LIMIT 1')).rows.length) {
      throw Error('Import requires an empty destination profile store');
    }
    if ((await db.query(`SELECT discord_user_id FROM friendcode_profiles
      WHERE public_channel_id IS NULL OR public_channel_id <> ALL(array_remove(ARRAY[$1::text,$2::text],NULL)) LIMIT 1`,
    [settings.local_channel_id, settings.international_channel_id])).rows.length) {
      throw Error('Legacy post channels do not match the verified source server');
    }
    const profiles = await db.query(`INSERT INTO poke_post_profiles
      (discord_user_id, pokemon_username, trainer_code_raw, additional_codes, campfire_username,
       vivillon_pattern, created_at, updated_at)
      SELECT p.discord_user_id, p.pokemon_username, p.trainer_code_raw,
        ARRAY(SELECT jsonb_array_elements_text(COALESCE(NULLIF(to_jsonb(p)->'additional_codes', 'null'::jsonb), '[]'::jsonb))),
        p.campfire_username, p.vivillon_pattern, p.created_at, p.updated_at
      FROM friendcode_profiles p RETURNING discord_user_id`);
    await db.query(`INSERT INTO poke_post_activations
      (guild_id, discord_user_id, active, publish_to_followers, public_channel_id,
       public_message_id, last_bumped_at, created_at, updated_at)
      SELECT $1, p.discord_user_id, p.public_message_id IS NOT NULL,
        COALESCE((to_jsonb(p)->>'publish_to_followers')::boolean, TRUE),
        p.public_channel_id, p.public_message_id, p.last_bumped_at, p.created_at, p.updated_at
      FROM friendcode_profiles p`, [guildId]);
    await db.query(`INSERT INTO poke_post_imports (import_key, guild_id, imported_count)
      VALUES ('legacy-shared-v1',$1,$2)`, [guildId, profiles.rows.length]);
    await db.query('COMMIT');
    return { alreadyImported: false, count: profiles.rows.length };
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    throw error;
  }
}
module.exports = { importSharedProfiles };
