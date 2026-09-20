# Closed test bot

This entry point assembles the shared profile implementation for a private Discord
test. It is separate from index.js and npm start, which still run the deployed
Tundraheim bot. No production migration or legacy profile import is part of this test.

## Required setup

Use a separate Discord bot application, a private test server, and a separate empty
PostgreSQL database. Add the test bot to the chosen server with application commands
and permission to view feed channels, read history and send messages. Human
moderators need Manage Messages to use the admin commands. Run only one test process.

Copy .env.test.example to .env.test locally and fill its four values through the
local editor or host secrets UI. Do not post tokens or database URLs in chat. The
real .env.test file is ignored by Git. The launcher never reads the production .env.

POKEPOST_TEST_CLIENT_ID is the test application's ID. POKEPOST_TEST_TOKEN belongs to
that same test bot. POKEPOST_TEST_GUILD_IDS is a comma-separated list of private test
server IDs. POKEPOST_TEST_DATABASE_URL points to the separate PostgreSQL database.
The known production bot ID and Tundraheim server ID are explicitly rejected.

## Explicit commands

Run these from the repository directory after dependencies have been installed.
The first command creates tables only in an empty database. An existing unmarked
database is refused. Its marker binds it to the test application and schema version.

```
node test-bot.js init
node test-bot.js register
node test-bot.js run
```

Registration verifies the token's bot identity before writing guild commands to the
allowlisted servers. It does not register global commands. Startup checks the marked
database and refuses queued work or guild settings outside the allowed server list.
No schema changes are applied by register or run. A schema mismatch requires a
reviewed update or a new empty test database, never blindly deleting existing data.

Refresh and cleanup each run at most once per minute. Startup does not immediately
post. Errors log a stage and code without secrets. Ctrl+C or SIGTERM stops timers and
waits for tracked work before closing the database pool.

## First Discord acceptance test

1. Use /post admin server to choose a main feed and local region. A separate local
   feed is optional. Saving a feed change queues active profiles in that guild.
2. Create a test profile with /post setup. Confirm a single silent post appears
   after a worker tick, with a working private copy reply.
3. Edit it. Confirm the existing post updates. Change region with a separate local
   feed configured and confirm the replacement appears and the old post is removed.
4. If a second private test server is available, activate the same profile there.
   Confirm it asks for a fresh publishing choice. Shared edits should update both
   servers while each publishing choice and moderator override remains separate.
5. Try moderator region and remove with and without Manage Messages. Test removal
   of an old bot-authored copy using its link. Verify unrelated posts survive.
6. Test local /post delete and Cancel. Removal retains the shared profile and other
   server activations. Check that a restart does not duplicate a pending delivery.

The test renderer uses the final region emojis and universal Discord, Pokémon GO
and Campfire text labels, avoiding dependency on Tundraheim's custom emojis. Profile
links preserve underscores without visible escape slashes. The exact republishing
sentinel is retained. This does not change production message formatting.

## Deliberately outside this test

No automatic bumping, group routing, feed message policing, new optional profile
fields or premium features are enabled. No real community rollout yet. Public
release still requires global profile erasure, recovery tooling, retention and
privacy documentation, and a reviewed production migration and rollback plan.
The private test uses disposable volunteer profiles and an isolated database.

## Local verification

The test suite uses actual Discord builders, the composed runtime and local PGlite
with simulated Discord calls. It covers two-server setup and profile delivery,
feed moves, moderation, consent isolation, identity and database guards, guild-only
registration, timer startup/shutdown and renderer output. It is not a live Discord
verification or a multi-connection PostgreSQL concurrency test.
