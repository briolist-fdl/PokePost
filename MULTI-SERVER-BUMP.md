# Multi-server bump delivery

Implemented locally on 2026-09-29. No scheduler, running bot or database was changed.

The new publisher.bump(guildId, userId, {messageId, channelId, cutoff}) operation replaces one active post through the existing durable delivery mechanism. The runtime exposes it as bumpProfile for a future scheduler. The caller supplies the expected current message and channel and the cooldown cutoff. Guild IDs, user IDs, message IDs and cutoff are validated.

The operation skips inactive profiles, disabled server bumping, stale references, a different selected feed, cooldown-protected profiles, pending manual reposts, pending delivery attempts and queued profile refreshes. Scope, payload, nonce and auto_bump are persisted before sending. Retries use the existing recovery path. Ambiguous old deliveries still require operator reconciliation.

Only auto-bump delivery adds the bumped marker to the first line. All sends retain suppressed notifications and no allowed mentions. A normal refresh removes the marker. last_bumped_at changes only when the delivered replacement is accepted and uses the persisted first-attempt timestamp. Rejected replacements are queued for cleanup. The old post is queued for cleanup only after the replacement is accepted.

Migration 010-bump-delivery.sql is required before starting this changed multi-server runtime. Do not apply it to production as part of this step. Adding the migration changes the expected test schema hash, so the existing test entry point will refuse a restart until its explicit initialization procedure has been reviewed and run. Current legacy index.js is unchanged.

The next task is a durable per-guild scheduler with one replacement per slot, optional local feed, separate local/main intervals, cooldown and no immediate restart catch-up. That scheduler is not implemented or activated here. The existing production scheduler remains responsible for live feeds.

Verification uses synthetic local PGlite and simulated Discord. It does not establish cross-process PostgreSQL locking or real Discord nonce behavior. Test code is kept outside tracked bot files as previously requested.

Validation completed 2026-09-29. All 78 tests passed in the combined local run covering delivery recovery, guild moderation, profile integration, erasure and ten new bump scenarios. Log is test-runtime/bump-delivery-validation.log in the master workspace. Existing checkpoint 23ee9aa remains the historical baseline, not a manifest of these new changes.
