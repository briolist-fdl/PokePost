# Production shared-runtime entry point

Prepared locally on 2026-10-02 after production preflight work. This does not change Railway, package.json, the active `index.js` start command, Discord commands, production schema, database data or bot process. The live production release remains `74294dd`.

`production-bot.js` is the only candidate entry point for the shared production model. It requires `POKEPOST_SHARED_PRODUCTION_MODE=enabled`, an explicit non-test `POKEPOST_SHARED_GUILD_IDS` allowlist, the expected production bot identity, a production database and reviewed server settings. `POKEPOST_SHARED_ENABLE_THREADS` and `POKEPOST_SHARED_ENABLE_BUMPS` default off. Both must be explicitly enabled in a later reviewed deployment; start with both false.

Before Discord login, it verifies a repeatable-read production schema snapshot: all shared-runtime tables must exist, every allowlisted server needs settings, no test marker or completed rollback marker may exist, no foreign scoped state is present, no delivery/refresh/cleanup work is pending, and six group mappings exist for every server before thread delivery can run. This is validation only; it never creates tables, migrates a database, posts, registers commands or changes a setting.

`production-register-commands.js` is separate and refuses unless `POKEPOST_SHARED_REGISTER_COMMANDS=approved`. It replaces guild commands only for the reviewed allowlist, never global commands. Run it only after reviewing the exact `/post` command replacement and immediately before the controlled shared-runtime pilot. It is not a migration substitute.

The normal one-minute loop runs retention, refresh, cleanup, and only explicitly enabled bump/thread workers. The shared runtime is blocked after a completed legacy rollback marker. Legacy `index.js` is unchanged except for the earlier guarded compatibility path; it must not run alongside this entry point against the same feeds.

Validation: 43 local tests passed in 69.2 seconds, combining the new production config/schema/command guards with existing runtime, delivery, import and rollback suites. Tests use PGlite and simulated Discord only. No live production database connection was possible from this workstation: its private endpoint reset before authentication twice. The read-only aggregate inventory remains a Railway-console task.

## Later activation sequence

1. Resolve Railway’s currently staged changes and preserve the known active release.
2. Complete the aggregate read-only inventory, fresh rescue backup and isolated restore check.
3. Push a reviewed release branch, build it, apply reviewed migrations/import while all writers are stopped, and verify aggregate counts.
4. Change Railway’s start command to `node production-bot.js` with shared mode enabled, threads and bumps false. This is the first external write needing a final deployment approval.
5. Register the reviewed guild command definition, accept one controlled existing-post interaction, then enable threads and eventually bumps only after their checks pass.

Do not put production secrets in the repository, a command line, chat or this document.
