const {groupFor}=require('./vivillonGroups');
const {fingerprint,validateConfig}=require('./threadRouter');
const validId=id=>typeof id==='string'&&/^\d{17,20}$/.test(id);
// Existing imported thread rows stored the profile fingerprint only. Prefixing
// the renderer version makes each of those rows receive one safe conversion to
// the shared thread layout, without repeatedly rewriting it thereafter.
const threadContentHash=profile=>'thread-v2:'+fingerprint(profile);
// Read-only planning boundary. A future executor must lock and re-read before
// Discord I/O; this snapshot is deliberately not an authorization to send.
function createGuildThreadPlanner({pool,guildIds=null}){
 if(guildIds!==null&&(!Array.isArray(guildIds)||!guildIds.length||guildIds.some(id=>!validId(id))||new Set(guildIds).size!==guildIds.length))throw Error('Choose explicit, unique thread-planning servers');
 const allowed=guildIds===null?null:new Set(guildIds);
 async function plan(guildId){
  if(!validId(guildId)||allowed&&!allowed.has(guildId))throw Error('Server is outside the thread-planning scope');
  const db=await pool.connect();
  try{
   await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   const guild=(await db.query('SELECT * FROM poke_post_guilds WHERE guild_id=$1',[guildId])).rows[0];
   if(!guild)throw Error('Server is not configured');
   const routes=(await db.query('SELECT group_key,thread_id FROM poke_post_group_threads WHERE guild_id=$1 ORDER BY group_key',[guildId])).rows;
   const threads=Object.fromEntries(routes.map(row=>[row.group_key,row.thread_id]));validateConfig([{guildId,threads}]);
   const profiles=(await db.query(`SELECT p.*,a.*,COALESCE(a.region_override,p.vivillon_pattern) AS vivillon_pattern,
    EXISTS(SELECT 1 FROM poke_post_refresh_queue q WHERE q.guild_id=a.guild_id AND q.discord_user_id=a.discord_user_id) AS refresh_pending,
    EXISTS(SELECT 1 FROM poke_post_delivery_attempts d WHERE d.guild_id=a.guild_id AND d.discord_user_id=a.discord_user_id) AS delivery_pending
    FROM poke_post_profiles p JOIN poke_post_activations a USING(discord_user_id) WHERE a.guild_id=$1 ORDER BY a.discord_user_id`,[guildId])).rows;
   const states=(await db.query('SELECT * FROM poke_post_thread_posts WHERE guild_id=$1 ORDER BY discord_user_id',[guildId])).rows;
   const pending=(await db.query(`SELECT discord_user_id FROM poke_post_refresh_queue WHERE guild_id=$1
    UNION SELECT discord_user_id FROM poke_post_delivery_attempts WHERE guild_id=$1`,[guildId])).rows;
   const blocked=new Set(pending.map(row=>row.discord_user_id));
   const byUser=new Map(profiles.map(p=>[p.discord_user_id,p])),byState=new Map(states.map(s=>[s.discord_user_id,s]));
   const actions=[],deferred=[];
   for(const userId of [...new Set([...byUser.keys(),...byState.keys()])].sort()){
    const profile=byUser.get(userId)||null,state=byState.get(userId)||null;
    let reason=null;
    if(state?.attempted_at&&!state.message_id)reason='unconfirmed_thread_delivery';
    else if(blocked.has(userId)||profile&&(profile.refresh_pending||profile.delivery_pending||String(profile.repost_requested)!==String(profile.repost_delivered)))reason='pending_profile_work';
    else if(profile?.active&&!profile.public_message_id)reason='unpublished_profile';
    else if(profile?.active&&profile.public_channel_id!==(guild.local_channel_id&&profile.vivillon_pattern===guild.local_pattern?guild.local_channel_id:guild.international_channel_id))reason='stale_primary_route';
    if(reason){deferred.push({guildId,userId,reason});continue;}
    const target=profile?.active?threads[groupFor(profile.vivillon_pattern)]||null:null;
    let kind;
    if(!target){if(state)kind='remove';}
    else if(!state)kind='create';
    else if(state.thread_id!==target)kind='move';
    else if(!state.message_id)kind='create';
    else if(state.content_hash!==threadContentHash(profile))kind='update';
    if(kind)actions.push({guildId,userId,kind,targetThreadId:target,profile:target?profile:null,state});
   }
   await db.query('COMMIT');return {guildId,threads,actions,deferred};
  }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}finally{db.release();}
 }
 return {plan};
}
module.exports={createGuildThreadPlanner};
