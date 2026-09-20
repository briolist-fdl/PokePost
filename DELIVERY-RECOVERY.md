# Durable profile delivery

This is a prepared local component for the shared profile runtime. It is not wired
into index.js, deployed, or applied to the production database.

## Runtime contract

Apply migrations 001 through 007 through a reviewed migration procedure. Construct
createGuildProfileRuntime with pool, client, render and an optional logger. The
renderer receives the scoped profile and current guild settings and returns text.
It must preserve the republishing sentinel and honor presentation flags.

Call refreshTick and cleanupTick from supervised bounded timers after startup.
The factory starts no timers or Discord connection. Use a database pool with at
least two connections because the refresh worker holds its scheduling lock while
the publisher obtains its own connection. Failed ticks must be logged by the caller.

Recovery and normal refresh work alternate when recovery remains pending. Each
refresh tick attempts at most one delivery. Recovery candidates rotate after a
failed attempt so one inaccessible destination does not monopolize recovery.
Cleanup deletes at most one message per tick and rotates blocked candidates.

## Delivery and recovery

Each guild and profile has a session advisory lock. In-place updates verify bot
ownership and a matching profile copy button. New deliveries first persist their
destination, original reference, complete payload and stable nonce. Sends suppress
push notifications and all mentions. A retry reuses the original payload and nonce.

The returned Discord message ID is persisted before settlement. Settlement locks
the activation, checks it is still active and that its source and destination still
match, then changes the reference and queues the old post for deletion atomically.
If that state has changed, the new post is queued for cleanup instead. Newer refresh
queue generations remain pending. A crash after a successful database commit is
safe to retry using the persisted current reference.

Ambiguous sends are automatically retried only within a conservative two-minute
window using Discord nonce deduplication. This is not an exactly-once guarantee.
Older ambiguous attempts remain stored and report DELIVERY_REVIEW_REQUIRED. Inspect
the target channel and reconcile the delivered message ID before retrying. Do not
clear an attempt or generate a new nonce merely because an API call timed out.
A future operational recovery command is still needed before public release.

Delivery attempts and cleanup jobs intentionally survive profile deletion. Payloads
contain profile data and remain until delivery is settled or manually reconciled.
A retention and manual recovery procedure is required before production activation.

## Removal and permissions

The internal deactivateProfile method retains the shared profile and other servers'
activations. It queues the current main post and tracked thread copies, then clears
local references in the same transaction. Uncertain thread sends require inspection.
This method is not an authorization boundary. The future command controller must
require the profile owner or a moderator with Manage Messages in the relevant scope.

Cleanup checks both current main and thread references before deleting. It only
deletes bot-authored messages with matching profile buttons. A confirmed missing
message or channel completes cleanup, while missing access retains the job.

## Remaining integration

The production command dispatcher, other owner actions, moderator handlers, bump
scheduler and multi-server thread adapter still require migration. Existing thread
references retain their current table shape. No legacy handlers should be allowed
to mutate the new profile model. Feed changes must enqueue affected profiles.
Complete the import, rollback, retention and recovery procedures before activation.
