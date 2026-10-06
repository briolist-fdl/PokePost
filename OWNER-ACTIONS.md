# Server-scoped owner actions

Prepared locally for the shared profile runtime. These handlers are not registered
or enabled in the live bot. Apply migration 008 after 001 through 007 before use.

## Removal

The new delete handler opens a private confirmation explicitly offering removal
from the current server. It deactivates that server and queues the main post and
tracked group copies for cleanup. The shared profile and other servers remain.
The owner can reactivate through setup with a fresh local republishing choice.

The confirmation is tied to its original actor and guild, expires after 15 minutes
and can be used once. A changed profile revision or activation snapshot rejects an
old confirmation. Cancel never changes the profile. A process restart invalidates
pending confirmations and the owner must reopen the command.

This is deliberately different from the legacy delete command, which deletes the
saved profile. Before enabling the new dispatcher, change the command description
to "Remove your profile posts from this server." A separate explicit all-server
profile erasure flow is still needed before public release. Do not describe this
local removal as deletion of stored personal data.

## Repost

Repost requires an active profile in the current server. A stored generation makes
it a real replacement rather than an in-place edit. Repeated requests while that
replacement is pending coalesce. Delivery records the captured generation, and only
acknowledges it after the replacement reference is committed. The previous post is
then removed by the durable cleanup worker. Other guilds and thread copies are not
reposted by this command. There is no new arbitrary cooldown in this milestone.

## Republishing

The existing required boolean option enabled remains. The handler derives owner
and guild only from the authenticated interaction. Consent and refresh enqueue
commit in one transaction. An inactive profile cannot be reactivated by toggling
republishing. Existing follower copies are not promised to disappear.

Pending deliveries record the shared profile revision and local publishing choice.
If either changes before an old delivery settles, its reference can be saved but
refresh work remains pending until the current content has been rendered. This
prevents a successful retry of an older payload from acknowledging a newer edit.
All delivery still uses the existing conservative nonce recovery policy.

## Shared region and extra codes

The region, add-code and remove-code commands now update the shared owner profile.
They require an active profile in the current configured server and derive identity
from the interaction. The region must be a supported Vivillon pattern. Extra codes
accept spaces and hyphens, require 12 digits, reject duplicates including the main
code, and are limited to three. Removal addresses the current numbered extra code.

A shared owner lock and profile row lock serialize updates with profile forms.
Each successful mutation increments the profile revision and queues every active
server in the same transaction. Inactive servers stay inactive. A failed queue write
rolls back the mutation. Personal text, wanted regions, main code and unrelated
identity fields are preserved. Server republishing choices and moderator region
overrides are preserved. The response explains that updates affect all active
servers and that a local moderator override still applies when relevant.

The main feed publisher moves a post when the effective region selects another
channel. Multi-server group thread synchronization is still an integration task.
Before enabling these handlers, update the command descriptions to explicitly say
these fields belong to the shared profile and affect its active servers.

## Integration still required

Live index.js and command registration are unchanged. Remaining owner work includes optional profile fields and explicit global erasure. Moderator commands, bump
scheduling, multi-server thread routing, global erasure and the migration/recovery
procedure still need integration before production activation. Never fall through
to legacy mutation handlers against new shared-profile data.
