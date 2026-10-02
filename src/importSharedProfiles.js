// Explicit import using a dedicated client, while old/new writers are stopped.
// Does not connect to a database, read secrets or execute schema migrations itself.
const {groupFor}=require('./vivillonGroups');
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
    // Rehearsal/cutover requires stopped writers. Existing legacy thread rows
    // share this table with the new worker and must remain intact.
    await db.query('LOCK TABLE poke_post_thread_posts, poke_post_group_threads, poke_post_refresh_queue, poke_post_delivery_attempts, poke_post_post_cleanup, poke_post_guild_bump_schedule IN EXCLUSIVE MODE');
    for (const table of ['poke_post_refresh_queue','poke_post_delivery_attempts','poke_post_post_cleanup','poke_post_guild_bump_schedule']) {
      if ((await db.query('SELECT 1 FROM '+table+' LIMIT 1')).rows.length) throw Error('Resolve destination work before import');
    }
    const source=(await db.query('SELECT * FROM friendcode_profiles')).rows;
    const byUser=new Map(source.map(p=>[p.discord_user_id,p]));
    const routes=new Map((await db.query('SELECT group_key,thread_id FROM poke_post_group_threads WHERE guild_id=$1',[guildId])).rows.map(r=>[r.group_key,r.thread_id]));
    for(const p of source){
      groupFor(p.vivillon_pattern);
      if(!/^\d{17,20}$/.test(p.discord_user_id)||!/^\d{12}$/.test(p.trainer_code_raw)) throw Error('Invalid legacy profile identity or code');
      if(p.additional_codes!=null&&(!Array.isArray(p.additional_codes)||p.additional_codes.length>3||p.additional_codes.some(c=>typeof c!=='string'||!/^\d{12}$/.test(c)))) throw Error('Invalid legacy extra codes');
      if(p.personal_message!=null&&(typeof p.personal_message!=='string'||[...p.personal_message].length>160)) throw Error('Invalid legacy personal message');
      if(p.wanted_regions!=null){if(!Array.isArray(p.wanted_regions)||p.wanted_regions.length>18)throw Error('Invalid legacy wanted regions');for(const region of p.wanted_regions)groupFor(region);}
      for(const key of ['publish_to_followers','personal_message_hidden'])if(p[key]!=null&&typeof p[key]!=='boolean')throw Error('Invalid legacy boolean');
      if(p.public_message_id&&p.public_channel_id!==(settings.local_channel_id&&p.vivillon_pattern===settings.local_pattern?settings.local_channel_id:settings.international_channel_id)) throw Error('Legacy post requires routing reconciliation');
    }
    for(const row of (await db.query('SELECT * FROM poke_post_thread_posts')).rows){
      const p=byUser.get(row.discord_user_id);
      if(row.guild_id!==guildId||!p||!p.public_message_id||row.thread_id!==routes.get(groupFor(p.vivillon_pattern))) throw Error('Legacy thread requires routing reconciliation');
      if(!row.message_id) throw Error('Resolve unconfirmed legacy thread delivery before import');
    }
    const profiles = await db.query(`INSERT INTO poke_post_profiles
      (discord_user_id, pokemon_username, trainer_code_raw, additional_codes, campfire_username,
       vivillon_pattern, personal_message, wanted_regions, created_at, updated_at)
      SELECT p.discord_user_id, p.pokemon_username, p.trainer_code_raw,
        ARRAY(SELECT jsonb_array_elements_text(COALESCE(NULLIF(to_jsonb(p)->'additional_codes', 'null'::jsonb), '[]'::jsonb))),
        p.campfire_username, p.vivillon_pattern, to_jsonb(p)->>'personal_message',
        ARRAY(SELECT jsonb_array_elements_text(COALESCE(NULLIF(to_jsonb(p)->'wanted_regions', 'null'::jsonb), '[]'::jsonb))),
        p.created_at, p.updated_at
      FROM friendcode_profiles p RETURNING discord_user_id`);
    await db.query(`INSERT INTO poke_post_activations
      (guild_id, discord_user_id, active, publish_to_followers, public_channel_id,
       public_message_id, last_bumped_at, personal_message_hidden, created_at, updated_at)
      SELECT $1, p.discord_user_id, p.public_message_id IS NOT NULL,
        COALESCE((to_jsonb(p)->>'publish_to_followers')::boolean, FALSE),
        p.public_channel_id, p.public_message_id, p.last_bumped_at,
        COALESCE((to_jsonb(p)->>'personal_message_hidden')::boolean, FALSE), p.created_at, p.updated_at
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
