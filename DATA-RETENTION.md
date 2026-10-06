# Test data retention operations

The closed test launcher runs a bounded database moderation-audit purge on its existing one-minute timer. It deletes only records older than 30 days for explicitly allowed test servers, at most 100 per tick. One SQL statement and row locking keep each batch atomic. Recent records and records for other servers remain. No schema migration or automatic production rollout is involved.

A retention error is logged by event and code and does not prevent the profile refresh and cleanup jobs from running. The next tick retries. There is no startup purge before the first timer tick.

`node test-recovery.js inspect` is read-only and now reports the retention period, total and eligible audit counts, and pending cleanup references alongside unresolved deliveries. Cleanup details are limited to 100 entries and a count plus truncation flag makes the limit explicit. This output contains identifiers needed for maintenance, not profile content or credentials.

## Pending cleanup procedure

1. Inspect unresolved deliveries and cleanup references before considering cleanup complete.
2. Use the saved server/channel/message references to check the exact message and bot access. Restore access when appropriate, then let the worker retry. Use TEST-RECOVERY.md for an uncertain send.
3. A missing message or channel is completed by the existing worker only after Discord confirms that state. Missing access is not proof that a message disappeared.
4. If access cannot be restored, arrange removal with the server's moderators and verify the result before resolving references. Do not delete a queue row merely to make the report empty or because its retry timestamp is old. queued_at rotates on retries and is not the age of the original deletion request.

Never purge pending delivery payloads or cleanup references as part of the audit expiry job. No timer can guarantee removal from a Discord server the bot cannot access. The 30-day policy applies only to database moderation records, not process logs or backups.

New test-process diagnostics use .test-logs/test-YYYY-MM-DD.jsonl, ignored by Git. The retained window is the current UTC date plus the previous six dates. Pruning runs at startup and every maintenance tick. It only removes dated regular files matching that pattern inside the configured log directory, skips symbolic links, and does not follow a symbolic-link log directory. Unknown files are untouched. A 5 MiB daily soft cap bounds growth, with at most one final record crossing the cap. Log failures emit a fixed notice without exception details.

The logger accepts only structured event identifiers, severity, time, numeric or constrained error codes and validated Discord IDs. It discards arbitrary text, payloads, stack traces and credentials. Runtime loggers receive this logger explicitly. The console is not globally patched, and the ready notice contains no user data.

Before public release, settle retention of earlier ad hoc troubleshooting files, hosting logs and database backups, review inaccessible-server cases, and replace the production privacy policy only when the shared-profile implementation is actually deployed. TEST-PRIVACY.md describes the test today.

Discord's developer terms require an accurate description of collection, use, sharing and deletion requests. The 30-day audit duration here is a project choice, not a duration prescribed by Discord. Reference reviewed during this change, https://support-dev.discord.com/hc/en-us/articles/8562894815383-Discord-Developer-Terms-of-Service
