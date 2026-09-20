# Shared profile erasure

`/post delete` remains local removal. `/post erase` is a separate test command for permanently deleting the caller's saved profile and removing its tracked posts across all servers. It accepts no target user and requires no moderator permission.

The ephemeral confirmation explains the all-server scope, current active-server count, irreversible loss of the saved profile and gradual post cleanup. Cancel makes no changes. A confirmation is bound to the caller and server, expires after fifteen minutes, and can be used once. A profile or activation change invalidates it. Confirmation state is not persisted across restart.

## Database behavior

Erasure takes the shared owner lock, enumerates all associated server scopes, takes their delivery locks in sorted order, then locks the profile. This order avoids waiting for a publisher lock while holding the profile row it needs. New shared form activations use the same owner lock.

The transaction queues tracked main posts, thread copies, source references and confirmed delivery receipts for cleanup before deleting activations, the shared profile, thread mappings and delivery payloads. The refresh queue cascades from activations. Any failure rolls back the transaction. A send or thread delivery whose outcome is unknown blocks erasure until reconciled, rather than discarding the only recovery information.

Cleanup retains only the references needed to identify and remove messages. The existing cleanup worker checks ownership, protects a newly created current post, and retains failed cleanup jobs for retry. Erasure does not promise immediate disappearance from Discord. Lack of bot access may prevent cleanup.

Moderation audit records are retained. Messages already distributed to follower servers may remain. This command is deletion of the saved profile, not a blanket claim that all historical data or external copies have been erased. Audit retention, inaccessible-server cleanup and privacy documentation still need a publication policy before public launch.

## Test scope

Fifteen tests cover two-server removal, isolation from other users, uncertain delivery refusal, confirmed receipts, thread copies, transaction rollback, stale confirmations, old form rejection, new-profile protection, actor and guild checks, cancellation, expiry and real runtime dispatch. They use PGlite and simulated Discord. PostgreSQL cross-connection lock ordering has been reviewed but is not established by those tests.

The test command is registered only for the isolated test application. No schema migration is needed. Production index.js and legacy commands are unchanged.

For the Discord acceptance test, use a disposable profile active in both test servers. Cancel once and confirm both posts remain. Then explicitly confirm erasure, allow multiple worker ticks for cleanup, and check that /post view no longer finds a saved profile in either server. A subsequent /post setup should ask for a new profile, not activate the old one.
