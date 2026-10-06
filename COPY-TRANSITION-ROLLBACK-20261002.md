# Copy-button transition and post-write rollback

Local implementation after 43b7b34. It has not been deployed or enabled on a live database. No Discord network request, bot restart or production configuration change is included. The prior rehearsal report remains historical; this document supersedes its two unresolved implementation gates for the supported single-guild case below.

## Button continuity

`copyTransition.js` handles the two formats without a bulk Discord rewrite. In the shared runtime it accepts legacy `copy_friend_code:user[:index]` buttons only for the imported guild, an active published profile, this bot's message, and a currently tracked main or thread message/channel. A matching import marker is required and a completed rollback marker disables this path. Current codes are returned privately with mentions suppressed. Foreign guilds, forged authors, stale/deleted messages and malformed indices are rejected.

The legacy entry point has an explicit `POKEPOST_LEGACY_COPY_COMPAT=true` switch for `guild_copy:guild:user:index` buttons after reverse conversion. It reads the current legacy profile and references, so subsequent edits or deletions are respected. The default legacy path remains unchanged. Normal legacy message updates may replace scoped buttons with legacy buttons; both formats work during this fallback period.

With compatibility enabled, startup requires a completed rollback marker and exact guild/main/local/thread configuration. It refuses to start writers when these differ, or when automatic bumps are enabled. Pausing bumps avoids silently resuming the legacy campaign schedule from stale state; reconciliation and explicit re-enabling remain an operator step. No credentials or installation permissions are changed.

## Offline reverse conversion

`previewLegacyRollback(dedicatedClient, guildId)` reads one repeatable-read snapshot and returns only a digest, counts and required legacy configuration. It never writes or contacts Discord.

`applyLegacyRollback(dedicatedClient, guildId, {expectedDigest, writersStopped:true, backupVerified:true})` locks the relevant tables and recalculates that digest. It refuses stale plans. The flags acknowledge operator prerequisites; they do not stop services or verify a backup by themselves. Updates, inserts, deletion of erased legacy records and the completion marker commit atomically. An injected late failure rolls everything back.

Projection preserves current codes and additional codes, explicit consent, inactive state, optional fields where representable, bump time, primary message references and existing group references. It flattens the source guild's effective region override into the legacy region; the unchanged shared tables retain the original shared region and override separately. New users are inserted; globally erased users are removed from the old table. Existing legacy-only nullable metadata is retained where possible. The helper leaves shared tables and historical scheduler state in place for investigation and rescue, and creates no Discord messages.

Supported boundary: one imported server using the original separate Tundra/main topology. Pending refresh, delivery, cleanup or repost work, unconfirmed or incorrectly routed group copies, another guild's activation/thread/schedule state, an unactivated shared profile without a disposition, or optional data the old schema cannot preserve causes refusal. This is intentionally not a multi-server-to-single-server merge. Applying the rollback twice or re-importing after completion is rejected; test startup also refuses the rolled-back database. Any future shared production entry point must retain this startup guard.

## Operator sequence for a concrete cutover

1. Stop accepting new edits, let confirmed refresh/cleanup finish, reconcile uncertain sends, then stop all old/new writers. Preserve the current app identity and guild/channel mapping. If pending work cannot be reconciled, preserve it and repair forward instead of bypassing the refusal.
2. Take a fresh rescue backup of the complete current database and restore it to an isolated destination for verification. An old pre-migration backup is insufficient after accepted user edits or Discord changes.
3. Run the preview using a dedicated connection. Review counts (especially erased users), required legacy configuration and any refusal. Save the digest alongside backup evidence. Run apply with that digest only while writers remain stopped.
4. Configure the exact original guild/main/local/group mapping returned by preview. Start the compatible legacy build with `POKEPOST_LEGACY_COPY_COMPAT=true` and `BUMP_ENABLED=false`. Do not start the shared runtime against the completion marker. Verify current main/group copy buttons and profile operations in a controlled test before resuming access.
5. Reconcile the retained legacy bump campaign/queue and shared schedule with the intended normal intervals and cooldowns before enabling bumps. Restart must not catch up missed slots. A later move back to shared storage requires a fresh reviewed conversion; do not delete the marker and reuse stale shadow data.

This procedure preserves current references instead of restoring old Discord message IDs. A database backup cannot undo already completed Discord mutations. Continued use of the compatible build is required until all surviving scoped buttons have been replaced normally.

## Validation

The current synthetic suites cover both button directions, message ownership/scope, malformed inputs, current-code lookup, settled edits, new/inactive/erased users, consent and optional fields, local override projection, stale snapshots, pending-work refusal, late transaction failure, repeat prevention and both startup paths. Test harnesses remain outside Git per the existing preference.

A disposable loopback PostgreSQL rehearsal restored all 12 public tables from backup, accepted a simulated owner edit, used the actual refresh/cleanup/thread workers with in-memory Discord messages, verified a fresh settled rescue backup, applied reverse conversion, and exercised a scoped copy button against the converted legacy profile. The new region, current main message ID, consent and thread reference survived. The temporary cluster and dumps were removed. No live Discord acceptance test of fallback mode has been performed.

Harnesses: `copy-rollback.test.cjs`, `extend-real-rollback.cjs`, `import-rollback-postgres.cjs`, and `import-rehearsal-fixture.cjs` in the detail workspace. This closes the local implementation and synthetic rehearsal work; the actual production inventory, backup/configuration review and bounded live acceptance remain prerequisites for deployment.

Final combined run: 50 tests passed, zero failures/skips/cancellations, in 60.0 seconds. Seven isolated PostgreSQL scenario checks passed. Syntax and whitespace checks passed. Initial harness-only failures (a non-exported schema helper, file output location, name collision and builder/raw component distinction) were corrected before these final results.
