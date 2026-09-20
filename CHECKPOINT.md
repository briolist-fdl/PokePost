# Shared-profile test checkpoint

Prepared on 2026-09-20 from production baseline 74294ddc597cdf871296aff6292a3928d92c8446. This is a local development checkpoint, not a production release.

## Entry points and scope

The unchanged npm start command runs index.js and the existing production implementation. The shared-profile implementation runs only through test-bot.js using a separate test bot, database and explicit server allowlist. Do not remove those safeguards to turn it into a production launcher.

The closed test includes server setup, optional local feeds, shared profiles, per-server activation and republishing, moderation, local removal, global profile erasure, durable delivery and cleanup, operator recovery, and bounded log retention. The two-server profile flow and permissions have been verified by the user in Discord.

Automatic bumping, group-thread routing, new optional profile features and premium are not enabled in the new test entry point. Existing production behavior remains in the legacy entry point. Preparatory modules and schema fields do not imply that these features are available in the test UI.

## Exact file set

CHECKPOINT-MANIFEST.json records the production baseline and SHA256 hashes of the 48 selected development files. Hashes normalize CRLF to LF so Git line-ending conversion does not change their meaning. The manifest and this document add two checkpoint files. Other files come from the baseline commit.

The local package.json test-script change and untracked test directory were deliberately excluded. Secrets and daily diagnostic logs are ignored and excluded. No branch push, command registration, process restart or database migration is part of this checkpoint.

## Validation

The combined run passed all 100 tests with zero failures or skipped tests in 214 seconds. The source-file manifest was checked again before commit. Entry-point syntax and Git whitespace checks also passed. The pattern-based credential check found no suspected credentials in the selected files, and the environment example contains only empty values.

The local harness prepares eight suites against this repository's current source rather than historical review copies. It covers profile forms and queue behavior, moderation, shared consent, server setup, composed test runtime, recovery, erasure and data retention. Tests use PGlite, simulated Discord, launcher stubs and temporary filesystem fixtures.

The maintainer requested that test files remain outside this commit. The master workspace retains prepare-checkpoint-tests.cjs, test-runtime/checkpoint, checkpoint-validation.json and checkpoint-manifest.json. To rerun on the same workstation, prepare the suites and run `node --test --test-concurrency=1 test-runtime/checkpoint/*.test.cjs` from the master workspace. The generator currently points to the local repository path and must be adjusted if that checkout moves.

## Before production

- Verify PostgreSQL concurrency with separate connections and controlled recovery beyond the simulated tests.
- Confirm actual backup retention and exercise restore to an isolated destination.
- Port and verify existing bump and group-thread behavior before moving Tundraheim.
- Rehearse full import and rollback, including optional fields, consent, message references and scheduler state. The prepared importer alone is not a production migration plan.
- Finish retention for earlier troubleshooting artifacts, hosting logs and backups. TEST-PRIVACY.md describes the test, not a replacement production policy.
- Complete public onboarding and support, then obtain explicit approval for the concrete production migration and pilot.

Some older component documents describe their original preparatory stage. This checkpoint overview, TEST-BOT.md, TEST-RECOVERY.md, PROFILE-ERASURE.md, DATA-RETENTION.md and TEST-PRIVACY.md provide the current test boundaries. The master workspace's PUBLISHING-PLAN.md controls the overall release sequence.
