# Closed test database upgrade 009/010 → 011

This is a local operator procedure, not authorization to change an external database. Production and legacy index.js are outside its scope. No upgrade, backup, Discord login or restart was performed during implementation.

The dedicated `test-upgrade.js` entry point reads `.env.test` only when explicitly invoked. Importing it does nothing. It requires app `1550595818661085335` and exactly guilds `1550119459891576852` and `1550967873101500566`. Existing configuration validation still rejects the production identity, home guild and a database URL identical to DATABASE_URL. This tool verifies the database marker, not the Discord token remotely; normal runtime startup retains the Discord token identity check.

## Before any external execution

1. Obtain approval for the isolated test database operation. Verify its destination without printing connection strings or credentials.
2. Stop every writer using that database and keep them stopped throughout rehearsal and application. Flags are operator attestations, not process detection.
3. Take a consistent backup, verify restore into a separate isolated database, and record the known-good source revision and schema hash. Keep the backup through the test observation window.
4. Keep POKEPOST_TEST_ENABLE_BUMPS false while validating the upgrade. Review guild routing and bump policies separately.

## Rehearse, then apply

From the Poké-Post repository, with the reviewed `.env.test`:

```text
node test-upgrade.js --check --writers-stopped
node test-upgrade.js --apply --writers-stopped --backup-verified
```

`--check` executes the complete transactional upgrade and target verification, then rolls it back. It takes table locks and is not a read-only inspection. Neither mode starts Discord, registers commands, or enables bumping. Use the rehearsal first against the verified backup restore; compare its structure against the reviewed manifest on the actual PostgreSQL version before scheduling the real test database operation.

The tool recognizes only reviewed hashes for migrations 001–009, 001–010 or 001–011. It checks the on-disk target migration hash before connecting. It takes the same advisory transaction lock as test initialization, pins search_path to public, and locks the known tables. It compares relations, columns/types/defaults/nullability, constraints, indexes, row-security flags, triggers and policies against a manifest generated from synthetic PGlite. Every table containing guild_id is checked for foreign server data. Unknown hashes, partial migrations or unexpected public-schema objects are rejected; never edit the marker or regenerate the manifest to silence a mismatch.

Only missing migrations 010/011 are executed. They add bump metadata and an empty schedule table; profiles, message references, pending delivery payloads and existing bump_enabled settings remain as they were. The target structure must match before the marker is updated. DDL and marker update commit together; failure before commit rolls back both. A connection failure during commit can leave the outcome uncertain: keep writers stopped and run the guarded rehearsal again to identify the committed state. Do not assume rollback from a network error.

The structural manifest is intentionally strict. PostgreSQL-version differences in catalog formatting or pre-existing extensions/objects may cause rejection. PGlite validation does not prove external PostgreSQL compatibility or cross-process locking; resolve mismatches by review and isolated PostgreSQL rehearsal, never by weakening the guard ad hoc. The manifest does not audit owners, grants or every database-level setting.

## After successful application

Run the guarded rehearsal again to confirm schema 011. Then separately authorize a test runtime restart using the ordinary identity/schema checks. Enable POKEPOST_TEST_ENABLE_BUMPS=true and selected guild policies only for the approved scheduler test. Observe future slots, quiet mention-free delivery, preserved `🔇 republishing off`, recovery and cleanup. No command registration is required for this upgrade.

Before commit, transaction rollback preserves the old schema and marker. After commit, this tool has no destructive downgrade command: stop writers and use the verified backup/known-good source if rollback is required. Any data written after the backup needs separate reconciliation before restore. Disabling bump opt-in stops new scheduling after restart but does not undo a schema upgrade or pending deliveries.

## Local verification

Tests are outside the bot repository in the detail workspace: test-upgrade.test.cjs. They exercise source versions 009/010/011, rehearsal rollback, failure after DDL and after marker update, schema drift, wrong identity, unknown hash, foreign audit rows, operator prerequisites and preservation of synthetic profiles, activations and pending deliveries. No real profiles or credentials are used.

### PostgreSQL rehearsal completed 2026-09-29

Eight checks passed on a new local PostgreSQL 18.6 cluster using synthetic data: pg_dump/pg_restore equality, rehearsal rollback, observed advisory-lock waiting on a separate connection, applied upgrade with preserved pending deliveries and profiles, repeat/runtime guard validation, unchanged source, backup restore to the original version, and rollback after an injected failure immediately before COMMIT. Temporary cluster and dump were removed. No external test backup, migration or restart was performed. Evidence: POSTGRES-UPGRADE-RESULT.md and postgres-upgrade-rehearsal.cjs in the detail workspace. No runtime source fix was required.

### External snapshot restored locally 2026-09-30

Read-only export from the identity-verified external test database (schema 009, PostgreSQL 18.6) restored into isolated local PostgreSQL 18.6. All 11 tables / 7 rows matched after explicit UTC serialization on both comparison connections. Local-copy upgrade rehearsal, complete rollback, applied upgrade and ordinary runtime guard passed. Source database and bot process were unchanged. The temporary 21,362-byte dump, local cluster and credentials were removed. Evidence: EXTERNAL-TEST-RESTORE-RESULT.md and external-test-restore-rehearsal.cjs in the detail workspace. This is restore verification, not a retained rollback backup; take a fresh verified backup with agreed retention before actual test rollout.

### Authorized test rollout completed 2026-09-30

External test schema 009 was upgraded to 011 after verifying no other database clients or pending work, retaining a Windows DPAPI CurrentUser encrypted rollback backup in LocalAppData/BrioBots/Backup/MigrationRollbacks, and restoring/decrypting that exact backup into a local verification database. The migrated external database matched the verified upgraded copy. No production changes or command registration occurred. Test runtime was started with process-level scheduler opt-in; both existing guild bump policies remain disabled. At 07:32:37 UTC the running replacement process passed a full maintenance-interval observation: database activity advanced, post references were unchanged, pending queues were empty and no startup/runtime errors were logged. Full evidence, backup path, earlier unexplained process stop and local-runtime limitations are in TEST-ROLLOUT-2026-09-30.md in the detail workspace.
