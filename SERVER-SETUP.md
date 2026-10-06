# Server setup milestone

The server setup controller and persistence layer are implemented and tested locally.
They are not registered, imported by index.js or deployed. Production still uses
Tundraheim's existing feed variables and approved thread map. These modules do not
make the current single-server bot ready for public installation.

## User flow

`/post admin server` opens a form with a required main channel, an optional separate
local channel and a selected local Vivillon region. Both channels must belong to the
server and support text or announcement messages. If the local channel is omitted,
all regions use the main channel. Choosing a region alone does not split the feed.

`/post admin thread` selects one of the six groups and opens a form for its existing
thread link or ID. Leaving the field empty explicitly disconnects the group. Public
and announcement threads are supported. Another server's threads, private threads,
locked threads and duplicate destinations for different groups are rejected. The
bot must be able to view the thread, read its history and send messages there.

Both commands require Manage Messages, following the existing project preference.
Permissions are checked again on submit. Forms are bound to their moderator and
server, expire after 15 minutes and can be submitted once. Restarting the process
invalidates open forms and users are asked to reopen them. Concurrent configuration
changes are compared against the form snapshot under a per-server database lock.
Old forms cannot silently replace new feed or group choices. Success logs identify
the moderator, server and changed destinations, without profile data.

## Storage and integration

`src/serverSetup.js` exports the command builder extension and controller methods
open, openThread and submit. It uses the installed discord.js modal builders and
channel selectors. Discord reference https://docs.discord.com/developers/components/reference

`src/serverSetupStore.js` saves feed choices through guildSettings and group targets
through poke_post_group_threads. The actor must be checked by the controller before
these internal storage methods are called. Group configuration is scoped by guild
and group, with a unique destination per guild. Moderation, bump and presentation
flags remain unchanged when feed settings are saved. New servers start with bumping
and channel moderation disabled. No user profiles or publishing consent are changed.

Apply schema 001 and 004 before 005-group-threads.sql. These migrations are preparatory
and none run automatically. The existing runtime table poke_post_thread_posts holds
delivered copies, not configuration. The new group table does not replace or erase it.

Before making these commands available, connect all profile operations and routing
to the shared-profile and explicit per-guild activation layer. Configuration changes
must reconcile existing main and thread posts instead of dropping old references.
Import the current Tundraheim feeds and six approved thread IDs explicitly during
that transition. Do not allow a missing database row to silently fall back to another
server or reactivate removed profiles. Retain the current stable thread references.

The legacy import channel check now supports a null localChannelId and has tests
for valid and foreign single-feed imports. No production import has been attempted.
See PROFILE-COMMANDS.md for the completed setup/edit/view/copy integration layer
and the remaining production delivery and command migration.

Only after that integration and migration review should index.js dispatch the new
admin commands and post_server modal IDs, and registration use addServerSetupCommands.
Until then, neither the global nor Tundraheim command definitions advertise them.
