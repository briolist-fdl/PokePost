# Privacy information for the closed PokéPost test

This document describes Brio Bots Test and the shared-profile test implementation. It does not replace the existing policy for the production PokéPost bot, which still uses the legacy profile system.

## Your profile

The test bot stores your Discord user ID, Pokémon GO name, friend codes, Vivillon region and optional Campfire name. It also stores server activations, your publishing choice for each server, moderator region overrides and references to its profile posts. Database fields for future optional profile information exist but those features are not enabled in this test.

Profile information is shared between servers where you explicitly activate it. Profile edits update those active server posts. Each server keeps its own publishing choice and any local moderator override. Profile information is visible to people who can read the selected channels. Enabling republishing may allow copies to reach follower servers.

## Removing your information

Use `/post delete` to remove your posts from the current server while keeping the saved profile and other server activations. Use `/post erase` to permanently delete the saved profile and queue all its tracked posts for removal, after a separate confirmation. You can cancel that confirmation.

Deletion is gradual. The bot keeps the Discord user, server, channel and message IDs needed to finish removing tracked posts. Those cleanup references are removed after deletion succeeds or Discord confirms the message or channel no longer exists. If access is missing, cleanup remains pending and requires maintainer follow-up. References are not silently discarded after a fixed timeout while a post might still exist.

An interrupted delivery can temporarily retain a saved post payload and delivery identifiers so the bot can establish whether it already sent the post. An unresolved delivery pauses full profile erasure until it has been checked. The bot tells you when deletion has not completed. Delivery records are removed after reconciliation or successful settlement.

Copies already published to follower servers, screenshots and copies made by other users may remain outside the bot's control.

## Moderation records

Database moderation records contain the server, moderator and profile owner's Discord IDs, interaction ID, action time and the correction or removal details. They support review of moderation actions and duplicate interaction handling. They do not contain friend codes or the full profile post.

These database records become eligible for deletion after 30 days. While the test bot is running, automatic maintenance removes up to 100 eligible records per minute. An outage or a backlog can delay completion. `/post erase` does not immediately remove these moderation records.

New diagnostic records from the test process are stored in separate daily files. They contain a timestamp, event type, severity, error code when available and relevant Discord IDs. Profile text, friend codes, credentials and raw error messages are excluded. The bot keeps the current UTC day and the previous six days. Expired daily files are removed at startup and during maintenance while the bot runs. If the PC is off, deletion waits until the bot starts again. A daily size limit may stop further diagnostic recording for that day.

Earlier manually captured troubleshooting files, hosting logs and database backups are outside this automatic daily-file cleanup. Their retention still needs to be finalized before public launch. The test database is hosted on Railway, the test process runs on the maintainer's PC, and profile messages are processed through Discord.

## Support

For profile removal or a pending cleanup issue, contact the maintainer in the Brio Bots support channel. Do not post tokens, database addresses or other credentials. You can provide the relevant message link privately when requested.

This is a description of the closed test's behavior, not a claim that public release requirements or all external data deletion obligations have been completed.
