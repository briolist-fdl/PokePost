# Synthetic legacy import and rollback rehearsal — 2026-10-02

This is local preparation after checkpoint 01b9811. No production or external test database was accessed, and no Discord call, bot restart, registration or deployment was performed. The running test bot retains its previously loaded checkpoint.

## Changes verified

`importSharedProfiles` now requires the current schema (migrations 001–011), an empty destination profile store, verified guild configuration and stopped writers. It preserves additional codes, personal messages, wanted regions, moderation-hidden flags, explicit republishing consent, timestamps, main post references and bump timestamps. Missing/null consent imports as false. Legacy Discord tags and formatted codes remain in the retained legacy table; the new presentation obtains the current Discord identity and formats raw codes.

Import rejects invalid profile data, mismatched main-feed routing, unknown/orphan/inactive/incorrectly mapped thread references, unconfirmed thread sends and existing destination delivery/cleanup/refresh/schedule work. It leaves source data and existing thread references unchanged. An import marker prevents reruns from resurrecting deleted destination profiles.

Legacy and new thread routers share `poke_post_thread_posts`. The new delivery worker can now edit an imported legacy message in place when a matching source-guild import marker exists, the configured guild/thread and stored message ID match, and the message belongs to the bot and has that user's legacy copy button. Without the marker or matching owner, it refuses. The edit replaces legacy components with guild-scoped buttons; receipt reconciliation still requires new scoped buttons.

## Evidence

- Final local run: 17 tests passed, zero failures/skips/cancellations, in 41.8 seconds. Eight import tests plus nine thread-delivery regression tests load current repository code. Tests cover active/inactive profiles, explicit false/true/missing consent, older optional-column layouts, field limits, source/reference preservation, rerun protection, late failure rollback, routing and pending-work rejection, legacy-message adoption, and future scheduler slots without startup posting.
- PostgreSQL rehearsal: a disposable loopback-only cluster imported three synthetic profiles. Legacy rows and thread rows were unchanged. `pg_dump`/`pg_restore` restored all 12 public tables and their exact rows into a separate database.
- After a simulated owner region edit, the legacy table still contained the old value while the shared profile and refresh queue contained the new change. This demonstrates that restarting legacy against the old backup would lose accepted user work. A second rescue backup restored the complete changed state into a third database without loss.
- The temporary cluster and dumps were removed. Syntax and `git diff --check` passed. The first pending-work fixture used an impossible foreign-key state; it was corrected to use a cleanup entry before the final successful test run.

Harnesses remain outside Git per the maintainer preference: `import-rehearsal-fixture.cjs`, `import-rehearsal.test.cjs`, `guild-thread-delivery.test.cjs`, and `import-rollback-postgres.cjs` in the detail workspace. No schema migration or new dependency was added.

## Exact rollback boundary and remaining production work

Before either new-model user writes or Discord mutations, the pre-cutover database backup can restore the original database state; this was exercised. Keep legacy and new writers stopped during import, comparison and any restoration. Group message edits are Discord mutations too: restoring only PostgreSQL does not undo changed buttons or content.

After new writes or Discord mutations, do not restart legacy against the old snapshot. Stop writers, take and verify a rescue backup, retain current Discord message references, and use a reviewed repair or reverse-conversion procedure. The rescue backup was tested; an automated reverse migration into the legacy model was NOT implemented or validated. This remains a production release gate.

Also resolve the copy-button transition before cutover: the new command handler accepts `guild_copy` buttons, while old messages carry `copy_friend_code`. In-place delivery upgrades a message's buttons, but button clicks before that upgrade and reverting upgraded buttons back to legacy need an explicit compatibility/cutover solution. The tests do not claim an uninterrupted button transition.

A production plan must still include a read-only inventory of actual schema/data/configuration, verified backup retention, exact six-group mappings, scheduler intervals/cooldowns, same-bot ownership, staged message/button transition, and no simultaneous legacy/new writers. No existing test identity safeguard should be disabled to make a production launcher. Optional fields are preserved in storage; production display choices remain a separate acceptance check.

This rehearsal validates the import fixes and database recovery boundary. It does not declare the production migration ready.
