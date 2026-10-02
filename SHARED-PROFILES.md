# Shared profiles and explicit guild activation

Approved model: one owner-controlled profile, explicitly activated in each server.
Server-local moderation, posting references, republishing consent and bump timestamps
belong to the activation. Following a feed is not activation.

This milestone implements and tests the persistence and explicit legacy-import layer.
It is NOT wired into `index.js`, command registration, button/modal handling, or the
live scheduler. Do not deploy this as completed multi-server support. Old profiles
remain in `friendcode_profiles`, which the current bot still uses.

## Behavior

- Only the owner may save shared identity/code/region data or activate the profile.
  Reading a shared profile directly also requires the owner's identity. Server
  reads require an active `(guild_id, discord_user_id)` record; no fallback exists.
- Activation requires an explicit per-server republishing choice. Repeating activation
  on an active profile does not reset its post or consent. New activation does not
  create a Discord post by itself.
- Owner edits change the shared data seen by active servers. A moderator's local
  region override affects only that activation and remains until explicitly cleared.
  Existing Discord posts are not silently rewritten by this storage module.
- Local removal stops that activation, preserves the shared profile and leaves all
  other servers untouched. The owner can explicitly reactivate later. It is not a ban.
- Removal requires a caller-supplied verified Discord deletion handler when a post
  exists. It runs under the activation row lock before references are cleared;
  a failed deletion rolls back. The handler must validate guild, channel and bot
  authorship, tolerate only a genuinely missing message, and enforce moderator rights.
- Delivery and bumping use `withActivePost` with expected message ID (`null` only for
  initial posting). It rechecks activation while locking profile and activation rows,
  computes the server's channel and provides a scoped reference writer. Stale queued
  work cannot recreate a removed or replaced post. Failed callbacks roll back DB work.
- PostgreSQL and Discord do not share a transaction. An uncertain commit after an
  external action must be surfaced by the controller for review/retry, as in the
  existing single-server moderator implementation. Do not swallow those errors.
- `bumpCandidates` filters on guild, channel, activation, saved public post, cutoff
  and the server's bump-enabled flag. Frequency/count/cooldown remain the scheduler's
  responsibility; existing Railway values must be preserved during integration.

The storage methods are internal APIs. Callers must derive actor/guild IDs from the
authenticated Discord interaction, not user-supplied fields. Moderator methods must
be gated by Manage Messages before calling the store. No new user-facing permission
or destructive global-delete command is added here.

## Explicit migration

After approval, stop all old/new writers, back up the database, apply the reviewed
current schema (001 through 011) and verify/save the home-server settings using the channel validator. Call
`importSharedProfiles` with a dedicated client and the verified source guild ID.
The helper never reads environment variables or creates a connection itself.

Import requires an empty destination profile store, validates every source channel,
preserves profile codes, optional fields, timestamps, message references and explicit republishing preference (missing consent becomes false),
and activates only profiles with an existing public-message reference. Removed
profiles stay saved but inactive. It creates no activation on any other server.
An import marker prevents reruns from restoring removed data; a different source
guild is rejected. The legacy table is retained, not dropped or rewritten.

The earlier `guild_friendcode_profiles` prototype uses a different model and must
not be merged into this schema. If it has ever been deployed, assess that database
separately instead of using this legacy import.

## Remaining integration before public installation

1. Wire every slash command, modal, button and moderator operation to authenticated
   guild scope; expose explicit activation and explain the scope of shared edits.
2. Format global codes for rendering, handle local region overrides/channel moves,
   and refresh active public posts after shared edits with retry-safe delivery.
3. Complete owner deactivation and separately confirmed all-server profile deletion,
   including external-post cleanup and retention of the legacy migration copy.
4. Wire the guild scheduler to scoped row-lock operations. Preserve actual intervals
   and publishing behavior; never infer activation from SAP/followed posts.
5. Exercise the complete two-server Discord flow and migration rollback/recovery,
   then explicitly approve production migration, registration and deployment.

## Import rehearsal update (2026-10-02)

See IMPORT-ROLLBACK-REHEARSAL-20261002.md for current import prerequisites,
legacy thread adoption, the tested database restoration boundary and unresolved
post-write rollback/button-transition gates. Earlier integration notes above are historical.
