# Multi-server group thread delivery

Implemented locally 2026-10-01 after checkpoint e39043a. The test runtime supports database-configured group feeds behind `POKEPOST_TEST_ENABLE_THREADS=true`. It defaults off and uses the existing minute loop. No production restart, live configuration change or schema migration is part of this delivery. Legacy `index.js` and `threadRouter.js` remain unchanged. Never run the legacy router and this worker against the same group feeds.

## Planning and delivery

`createGuildThreadPlanner({pool,guildIds})` requires an explicit nonempty unique guild allowlist and reads a repeatable-read, read-only snapshot. It combines shared profiles with per-guild activation, region override and republishing consent. All 18 regions use the existing six groups, including Tundra in Blizzard. Main-feed bumps do not rewrite unchanged group copies.

Pending primary refresh/delivery/reposts, unpublished active profiles, stale primary routing and unconfirmed group sends are deferred. Inactive profiles or removed destination mappings retire tracked copies through the existing cleanup queue. Pausing the worker does not remove mappings or posts.

`createGuildThreadDelivery` creates, edits, moves and retires copies. Before acting it acquires shared-profile, guild-configuration and scoped publisher advisory locks, in that order, then replans on the locked connection. This coordinates with shared edits, setup, moderation and profile erasure. A global worker lock prevents overlapping runners; the pool requires at least two connections. A tick attempts at most one action. Busy profiles defer for 90 seconds and failures for five minutes so other profiles can proceed.

Destinations must be public or announcement threads in the selected guild with view/history/send permissions. Locked threads are rejected. Archived threads are reopened for delivery. Existing messages must belong to this bot and carry the correct guild/user copy buttons. Sends suppress notifications and mentions. A move first validates the new destination and queues the old copy for cleanup; a later tick creates the new copy. Cleanup failure can temporarily leave both copies visible, with the old copy still durably queued.

## Uncertain delivery

The worker saves a nonce and attempted timestamp before sending. If sending or receipt persistence fails, it never automatically resends that attempt. Restart preserves this hold, and destructive operations refuse unresolved attempts. `reconcile(guildId,userId,{nonce,messageId})` accepts only a fetched owned message with matching nonce and plausible creation time. It is an operator API, not a public command; an authenticated operator must investigate and supply the receipt. There is no automatic recovery for a confirmed unsent attempt in this version.

Unchanged posts are not periodically fetched for existence. A missing message is replaced when a profile update causes delivery to inspect it. Controlled Discord testing and the automatic minute loop have passed in Brio Test; see THREAD-DELIVERY-CHECKPOINT-20261001.md. Production rollout remains a separate migration task.

## Local validation

Synthetic tests cover planning, scope, consent/overrides, all groups, create/edit/move/cleanup, stale jobs, permissions, ownership, archived/deleted messages, uncertain sends and receipt reconciliation, lock contention fairness and exact environment opt-in. A disposable loopback PostgreSQL cluster additionally checks real concurrent moderation, erasure and shared edits against an in-flight send. Tests use synthetic profiles and do not contact Discord or the external database.
