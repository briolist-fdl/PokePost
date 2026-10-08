const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { createGuildSettingsStore } = require('./guildSettings');
const { GROUPS } = require('./vivillonGroups');
const idValid = value => typeof value === 'string' && /^\d{17,20}$/.test(value);
function feedSnapshot(settings) {
  return settings ? JSON.stringify([settings.internationalChannelId, settings.localChannelId || null, settings.localPattern, settings.bumpEnabled]) : null;
}
function createServerSetupStore(pool) {
  const base = createGuildSettingsStore(pool);
  async function get(guildId) {
    const settings = await base.get(guildId);
    if (!settings) return null;
    const rows = (await pool.query('SELECT group_key,thread_id FROM poke_post_group_threads WHERE guild_id=$1',[guildId])).rows;
    return { ...settings, threads: Object.fromEntries(rows.map(row=>[row.group_key,row.thread_id])) };
  }
  async function change(guild, work) {
    if (!idValid(guild?.id)) throw Error('Choose a server before configuring PokéPost.');
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,7260517))',[guild.id]);
      const store = createGuildSettingsStore(db);
      const current = await store.get(guild.id);
      const result = await work(db, store, current);
      await db.query('COMMIT');
      return result;
    } catch(error) { await db.query('ROLLBACK').catch(()=>{}); throw error; }
    finally { db.release(); }
  }
  async function saveFeeds(guild, values, expected) {
    return change(guild, async (db,store,current)=>{
      if (feedSnapshot(current) !== expected) throw Error('The server setup changed while this form was open. Reopen it to review the latest choices.');
      await store.save({ guildId:guild.id, internationalChannelId:values.internationalChannelId,
        localChannelId:values.localChannelId || null, localPattern:values.localPattern,
        moderateChannels:true,bumpEnabled:values.bumpEnabled },guild);
      await db.query(`INSERT INTO poke_post_refresh_queue(guild_id,discord_user_id)
        SELECT guild_id,discord_user_id FROM poke_post_activations WHERE guild_id=$1 AND active
        ON CONFLICT(guild_id,discord_user_id) DO UPDATE SET generation=poke_post_refresh_queue.generation+1,requested_at=NOW()`,[guild.id]);
      return true;
    });
  }
  async function saveThread(guild, group, threadId, expected) {
    if (!Object.hasOwn(GROUPS,group)) throw Error('Choose a valid Vivillon group.');
    if (threadId !== null && !idValid(threadId)) throw Error('Enter a valid thread ID or link.');
    return change(guild,async(db,store,current)=>{
      if (!current) throw Error('Choose the server feed channels before configuring group threads.');
      const old = (await db.query('SELECT thread_id FROM poke_post_group_threads WHERE guild_id=$1 AND group_key=$2',[guild.id,group])).rows[0]?.thread_id || null;
      if (old !== expected) throw Error('This group changed while the form was open. Reopen it to review the latest choice.');
      if (threadId) {
        const thread=await guild.channels.fetch(threadId);
        if (!thread || thread.guildId !== guild.id || ![ChannelType.PublicThread,ChannelType.AnnouncementThread].includes(thread.type)) throw Error('Choose an existing public thread in this server.');
        if (thread.locked) throw Error('Unlock the thread before using it for a group feed.');
        const me=guild.members.me || await guild.members.fetchMe();
        if (!thread.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.SendMessagesInThreads])) throw Error('PokéPost needs permission to view the thread, read its history and send messages there.');
        const conflict=(await db.query('SELECT group_key FROM poke_post_group_threads WHERE guild_id=$1 AND thread_id=$2 AND group_key<>$3',[guild.id,threadId,group])).rows[0];
        if(conflict) throw Error('That thread is already assigned to another group.');
        await db.query(`INSERT INTO poke_post_group_threads(guild_id,group_key,thread_id) VALUES($1,$2,$3)
          ON CONFLICT(guild_id,group_key) DO UPDATE SET thread_id=EXCLUDED.thread_id`,[guild.id,group,threadId]);
      } else await db.query('DELETE FROM poke_post_group_threads WHERE guild_id=$1 AND group_key=$2',[guild.id,group]);
      return true;
    });
  }
  return {get,saveFeeds,saveThread};
}
module.exports={createServerSetupStore,feedSnapshot};
