# Group delivery checkpoint — 2026-10-01

This checkpoint adds group-thread delivery to the shared-profile test runtime after e39043a. It is a local development checkpoint, not a production release. THREAD-DELIVERY-CHECKPOINT-20261001.json records the selected files and normalized source hashes. Earlier checkpoint manifests describe their historical versions.

## Delivered and verified

The allowlisted worker plans from the current database, coordinates with profile/setup/deletion locks, sends quiet scoped copies, edits existing messages, and retires old copies through the cleanup queue. Uncertain sends remain held for operator reconciliation rather than automatic replay. The existing minute loop invokes it only with POKEPOST_TEST_ENABLE_THREADS=true. Legacy production index.js is unchanged.

Local validation: 45 tests passed across runtime/upgrade/emoji/planner/delivery suites, followed by 19 existing bump tests against the same source. Three real PostgreSQL concurrency scenarios passed for moderation, erasure and shared edits. Syntax and whitespace checks passed. Test files remain outside Git per the existing maintainer preference.

Live Discord validation in Brio Test passed creation, in-place render refresh, stable-copy idempotence, actual deletion after mapping removal, and recreation of one final copy. The harness's initial cleanup return-value assertion was corrected; actual deletion was verified and the sequence rerun successfully.

The automatic-loop follow-up restarted only the test bot, enabled the group worker through the local launcher, and temporarily changed a server-local region override within the existing group. The ordinary minute loop updated the main and group posts without replacing their message IDs, then restored the original content after the override was restored. The shared profiles and other server's activations were unchanged. No worker tick was called by the verification script.

Only Brio Test has a group mapping. The other configured test server has none. Thread opt-in is process-wide across the explicit test guild allowlist, so adding another mapping later also enables delivery there. Guild bump flags remain disabled. No actual .env.test value was changed. Start-ClosedTest.ps1 in the detail workspace now passes both process opt-ins and records them in LocalAppData/BrioBots/TestRuntime/current.json.

Final test post: https://discord.com/channels/1550967873101500566/1555313989939101800/1555314431796449331

Machine-readable live results: thread-test-result.json and thread-loop-result.json in LocalAppData/BrioBots/TestRuntime. Harnesses and local validation notes are retained in the detail workspace. Credentials, profile contents, process logs, test fixtures, unrelated package.json changes and ops/ are excluded from the commit.

## Production preparation and rollback boundary

The next concrete release task is a synthetic legacy import and rollback rehearsal, including consent, optional/hidden fields, existing main and group message references, and bump scheduling. Follow the master PUBLISHING-PLAN.md sequence. Do not bypass test-bot.js identity guards or use its initializer for production.

Before any production write, prepare a read-only inventory, verified backup, selected destination mapping and final diff; establish how both legacy and new writers are stopped during cutover. Rehearse rollback both before and after new-model user edits. Live transfer between distinct group threads and submission of group copy buttons are not claimed by this acceptance test; local tests cover movement and scoped button construction.

To pause automatic group delivery in the test environment, restart only the identified test process with POKEPOST_TEST_ENABLE_THREADS=false. The local launcher currently explicitly supplies true, so change that launcher setting when pausing; merely changing .env.test does not override it. Keep mappings and receipts intact. Pending unconfirmed sends require reconciliation. Never run old and new group workers against the same feeds.

No push, production restart, production migration, command registration or public announcement is included in this checkpoint.
