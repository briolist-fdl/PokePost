# Multi-server bump delivery

Implemented locally on 2026-09-29. No scheduler, running bot or database was changed.

The new publisher.bump(guildId, userId, {messageId, channelId, cutoff}) operation replaces one active post through the existing durable delivery mechanism. The runtime exposes it as bumpProfile for a future scheduler. The caller supplies the expected current message and channel and the cooldown cutoff. Guild IDs, user IDs, message IDs and cutoff are validated.

The operation skips inactive profiles, disabled server bumping, stale references, a different selected feed, cooldown-protected profiles, pending manual reposts, pending delivery attempts and queued profile refreshes. Scope, payload, nonce and auto_bump are persisted before sending. Retries use the existing recovery path. Ambiguous old deliveries still require operator reconciliation.

Only auto-bump delivery adds the bumped marker to the first line. All sends retain suppressed notifications and no allowed mentions. A normal refresh removes the marker. last_bumped_at changes only when the delivered replacement is accepted and uses the persisted first-attempt timestamp. Rejected replacements are queued for cleanup. The old post is queued for cleanup only after the replacement is accepted.

Migration 010-bump-delivery.sql is required before starting this changed multi-server runtime. Do not apply it to production as part of this step. Adding the migration changes the expected test schema hash, so the existing test entry point will refuse a restart until its explicit initialization procedure has been reviewed and run. Current legacy index.js is unchanged.

The per-guild scheduler is implemented below and remains inactive. The existing production scheduler remains responsible for live feeds.

Verification uses synthetic local PGlite and simulated Discord. It does not establish cross-process PostgreSQL locking or real Discord nonce behavior. Test code is kept outside tracked bot files as previously requested.

Validation completed 2026-09-29. All 78 tests passed in the combined local run covering delivery recovery, guild moderation, profile integration, erasure and ten new bump scenarios. Log is test-runtime/bump-delivery-validation.log in the master workspace. Existing checkpoint 23ee9aa remains the historical baseline, not a manifest of these new changes.

## Per-guild scheduler added 2026-09-29

Migration 011-guild-bump-schedule.sql adds per-guild policy columns and persistent schedule rows. It does not enable bumping. Main defaults to 240 minutes and 3 days cooldown. Local defaults to 480 minutes and 5 days cooldown. Intervals accept 30 through 10080 minutes and cooldown 0 through 365 days. No new moderator configuration command is added in this step.

guildBumpScheduler exposes initialize and tick. The runtime exposes initializeBumps and bumpTick, but no running entry point calls them yet. Explicit initialization is required before enabling a timer, and the first tick initializes without publishing when necessary. Restart moves due slots to the next future slot and never performs immediate catch-up. Main slots align to UTC and local slots have a thirty-minute offset at the default intervals.

Only configured guilds with bump_enabled are considered. Optional local feeds are derived from guild settings and local_pattern, never from a hardcoded Tundra region. Changes to channels, interval or cooldown reset that feed to a future slot. Removing local feed or disabling bumping removes its schedule state. Profile timestamps and active status remain untouched.

One tick can attempt at most one profile replacement. PostgreSQL session advisory locking serializes scheduler instances. Calls from the same runtime also share the refresh/bump guard. A slot is committed before calling Discord, so failure consumes the slot instead of creating a rapid retry loop. Ambiguous deliveries use the publisher recovery path. Pending bump delivery, recent accepted bumps and recent attempts prevent another feed in that guild from running inside thirty minutes. Another guild remains independent.

The pool must support at least two simultaneous connections because the scheduler holds a lock connection while the publisher opens its own. The ordinary pg Pool default satisfies this requirement. There is no timer, login, migration or database connection created by the factory itself.

Candidate selection excludes queued edits, pending deliveries, manual reposts, inactive profiles, cooldown-protected profiles and stale routing. A feed with no candidates advances its slot without posting, and another feed is considered on a subsequent tick. Selection within an eligible feed is random.

Verification passed eight scheduler tests and one integrated scheduler-to-publisher test using local PGlite and simulated Discord. A separate real local PostgreSQL test with two connection pools confirmed lock exclusion and committed slot behavior. Its temporary cluster was removed. It did not connect to the Railway databases or Discord.

Next step is to integrate an explicit opt-in schedule loop into the closed test runtime, review migrations 010 and 011 and initialize the isolated test database before restarting that runtime. Do not run both legacy and multi-server schedulers against the same production feed.
