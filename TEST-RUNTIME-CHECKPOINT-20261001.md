# Closed test runtime checkpoint — 2026-10-01

Local checkpoint on codex/pokepost-shared-profile-checkpoint-20260920, based on ad094e846926363678cd3d67b1849c406ef4507e. Earlier commits c4d88a0 and ad094e8 provide recoverable bump delivery and the durable per-guild scheduler. This checkpoint completes the opt-in test loop, guarded database upgrade and application-emoji profile rendering. It is not a production release. CHECKPOINT.md and CHECKPOINT-MANIFEST.json remain historical records for 2026-09-20.

## Behavior included

- Exact POKEPOST_TEST_ENABLE_BUMPS=true enables scheduler initialization before the existing minute timer. Per-guild bump_enabled is a separate requirement. Refresh/recovery, cleanup and non-overlapping cycles are preserved.
- test-upgrade.js provides explicit check/apply modes for the isolated test app and two known test guilds. Reviewed source hashes and actual schema are verified before migration 010/011; target structure is checked before updating the marker. DDL and marker changes share one transaction. Check mode rolls back. Writer-stop and backup flags are operator attestations.
- Profile rendering resolves discord, pokeball and campfire app emojis by name, with cached lookups and text fallback. Region markers, escaped usernames and the exact SAP marker remain intact. Flat Poké Ball source and transparent 128px export are included.

Legacy index.js, production startup, package dependencies, command registration and other bots are unchanged. Local package.json, ops/ and test/ remain outside this checkpoint, as do environment secrets, runtime logs, backup archives and local operator/test scripts.

## Validation against this source

The combined local run uses these six suites: bump-runtime.test.cjs, test-upgrade.test.cjs, profile-app-emojis.test.cjs, guild-bump-scheduler.test.cjs, guild-bump-delivery.test.cjs and guild-bump-integration.test.cjs. The first three live in the detail workspace; the last three in the master workspace's test-runtime. They import the current repository source and use synthetic PGlite, simulated Discord and launcher stubs. Test files remain outside Git as previously requested.

Combined result: 45 tests passed, zero failures or skipped tests, in 55.8 seconds. Entry-point/module syntax, manifest and staged whitespace/credential-pattern checks also passed before committing.

The JSON manifest hashes the selected changed/new files plus current tracked src/ and migrations/ dependencies. UTF-8 text hashes normalize CRLF to LF; PNG hashes use raw bytes. The manifest excludes itself and this document. The parent commit identifies unchanged files outside the manifest. No historical manifest is rewritten to imply validation of this revision.

## Earlier operational evidence

These are separate completed exercises, not additional tests in the combined run:

- Synthetic PostgreSQL 18.6 backup/restore, transaction rollback and advisory-lock waiting passed.
- A consistent read-only external test snapshot restored locally with matching structure and row hashes after UTC normalization.
- User-authorized test migration 009 to 011 completed after fresh backup/decrypt/restore verification. Encrypted rollback backup is retained in Windows LocalAppData/BrioBots/Backup/MigrationRollbacks using DPAPI CurrentUser. It is local-account-bound, not an active cloud backup plan.
- Closed test runtime passed a maintenance-interval observation. It is a local Windows process and can be interrupted by PC sleep/shutdown; no new service or boot-start automation was configured. An earlier unexplained process disappearance is documented in the detail workspace.
- Brio Test's ordinary 00:00 UTC slot on 2026-10-01 produced a quiet, mention-free bump, preserved the SAP marker, removed the old post, and left the other guild unchanged. Bumping was turned off again after the single test.
- All three app icons were verified in the existing test message. The flat Poké Ball replacement was accepted by the user. The test post was edited in place with no activation/reference change in the other guild.

App emoji names must be provisioned separately in any future production application. This commit contains no production emoji upload or migration. Test-server bumping was last verified disabled; this checkpoint operation does not query or change live services.

Detailed evidence remains in the detail workspace: TEST-ROLLOUT-2026-09-30.md, LIVE-BUMP-RESULT-2026-10-01.md, APP-EMOJIS-2026-10-01.md, POSTGRES-UPGRADE-RESULT.md and EXTERNAL-TEST-RESTORE-RESULT.md. TEST-DATABASE-UPGRADE.md and MULTI-SERVER-BUMP.md are included here for the operational procedure and scheduler behavior.

## Next scope

Review and integrate the six group-thread routes in the multi-server runtime as a separate bounded task. Production import/rollback rehearsal, durable hosted operation and backup arrangements remain prerequisites to any production transition. No push, deployment, database operation or process restart is part of creating this checkpoint.
