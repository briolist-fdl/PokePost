# Shared profile command integration

This milestone connects a new profile interaction controller to the prepared shared
profile and per-server activation tables. It is local and not enabled in index.js.
The current Railway deployment continues to use legacy profiles unchanged.

## Completed command paths

The runtime factory composes the form store, guild settings, activation store,
setup/edit forms, private view and scoped copy buttons. It handles setup, edit, view, delete, repost, republishing, region, add-code, remove-code,
guild_profile modal submissions, guild_copy buttons and local removal confirmations. Other commands return false
to the caller. Do not mix these paths with legacy mutation handlers in production.

Setup creates a shared profile and activates it only in the current server. When a
saved profile exists but is not active here, setup shows an activation form with a
fresh republishing choice and does not edit the shared identity fields. Editing
requires an active profile here and explains that shared details affect active
servers. Republishing is still selected per server and other servers' choices remain.

The save and refresh enqueue happen in one transaction. Extra codes, personal text,
wanted regions and local moderator overrides are preserved. No inactive server is
reactivated by an edit. Changed shared details enqueue all active servers, while new
activation queues only the current server. The private view reads only the owner.
Copy buttons carry guild and owner IDs and verify active publication in that guild.
They never fall back to a profile that is active only elsewhere.

Forms are tied to the current user and guild, expire after 15 minutes and are single
use. Profile revision and local activation state are rechecked under locks on save.
Concurrent edits or removal require the user to reopen the form. Initial creation
cannot overwrite a concurrently created profile. No target guild or owner is taken
from editable form fields.

See [server-scoped owner actions](OWNER-ACTIONS.md) for local removal, queued reposts
and republishing. Migration 008 is required for the current runtime. The old command
registration description for delete must change before enabling these handlers.

The runtime also routes admin region and admin remove through the scoped moderator
controller. See [guild moderation](GUILD-MODERATION.md). Migration 009 is required
for the current runtime. Moderation is prepared locally and is not enabled live.

## Durable refresh queue

Apply migration 006 after the earlier prepared schema. The queue is per guild and
owner with an incrementing generation. The worker attempts one delivery per tick,
keeps failures pending, and only acknowledges the generation actually attempted.
New edits arriving during delivery are not discarded. Inactive activations resolve pending delivery before old queue work is cleared.
They are never republished by the refresh worker.

createGuildProfileRuntime now accepts the Discord client and renderer and composes
its durable publisher. Apply migration 007 as well as 006 before enabling it. The
factory starts no timers, database connections or Discord session. Schedule both
refreshTick and cleanupTick, with a pool of at least two connections. See
[delivery and recovery](DELIVERY-RECOVERY.md) for delivery failures, cleanup and
manual reconciliation requirements. Success text assumes that worker is operating.

## Import correction and remaining release work

The legacy import now checks source channels correctly when localChannelId is null.
Both rejection of foreign channels and successful single-feed import are tested.
Removed profiles remain inactive and import remains repeat-safe. No production
import or schema change was performed.

Remaining before a public release are other owner commands, moderation and bump
integration, the multi-server thread adapter preserving existing thread copies,
and a reviewed migration and recovery procedure. Do not publish a partial dispatcher
that lets old handlers mutate new shared-profile data. The current command registry
and live Tundraheim data have not changed in this milestone.
