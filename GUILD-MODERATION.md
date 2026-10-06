# Guild moderation

Prepared for the new shared profile runtime, not enabled in production. Apply
migration 009 after 001 through 008. Live command registration remains unchanged.

## Permissions and scope

The runtime routes post admin region and post admin remove to guildModeration.
Both require a configured guild and Manage Messages in the interaction permissions,
matching the existing moderation policy. Manage Server is not required. The target
comes from the existing user option, accepting its resolved ID or a string ID or
mention. No guild membership lookup is needed for the target.

The publisher moderation methods are internal operations. Authorization belongs to
the controller. They must not be exposed to untrusted calls or owner command paths.

## Region correction

Correction changes the activation's region_override in this guild only. It retains
the shared region, other guilds' overrides, and all republishing choices. Refresh
is queued atomically with the correction and its audit row. Inactive profiles are
not reactivated. Normal delivery moves the main post when its destination changes.
The multi-server thread adapter still needs integration.

Pending delivery now records the effective region. If a moderator correction
arrives before an older delivery settles, the newer refresh stays queued even when
both regions share the same main feed. A retry cannot acknowledge stale content.

## Removal

Without a message option, removal deactivates the local profile and queues its main
post and tracked group copies for cleanup. The shared profile and other guilds are
retained. This is not a posting ban and the owner can activate again through setup.

The optional message accepts a same-guild Discord link or a message ID. A bare ID
uses the stored main channel, or the interaction channel if no profile exists.
Use a full link for an older copy in a different channel. The selected message must
be authored by the bot and carry a matching owner copy button. Bot channel access
and guild identity are checked. Current guild_copy and legacy copy_friend_code
buttons are both accepted. The cleanup worker verifies ownership again on deletion.

Selecting the tracked main post or tracked group copy deactivates the local profile
and queues its copies. Selecting an untracked older copy only queues that copy,
preserving any active profile. A user who left the server or whose saved profile is
gone can still have an older copy removed by ID and message link.

## Audit and failure behavior

The database audit records guild, actor, target, interaction, action, time and a
small result object. It does not copy profile text or friend codes. The audit row
commits with the state change and cleanup or refresh queue. Failed audit writes
roll the operation back. Interaction IDs make replay of a completed action safe.
Success replies describe queued work, not confirmed external deletion.

Actual Discord cleanup may still fail due to access changes. It remains queued for
retry. Unconfirmed sends retain the existing DELIVERY_REVIEW_REQUIRED handling.
Audit retention, operational inspection, global erasure and the complete migration
and recovery procedure remain release requirements. No automatic production schema
migration, deployment or command registration is performed by these modules.
