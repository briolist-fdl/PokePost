# Optional profile fields

This is part of the local shared-profile implementation. It is not connected to
the deployed slash commands or legacy renderer yet. Migration 003 is explicit,
after 001 and 002; none of these migrations run automatically at startup.

The owner may save a personal message (optional, at most 160 Unicode characters)
and desired Vivillon regions (validated unique selection from the 18 regions).
The desired regions are separate from the owner's own region and do not affect
channel routing. Whitespace is normalized in messages. Null/empty text clears the
message and an empty region list clears the selection. Omitting a field preserves
its value. Existing basic profile edits preserve both extras.

Per-server `showPersonalMessage` and `showWantedRegions` settings default to false,
including on existing rows. The existing compact feed is therefore the default.
An internal `setPresentation` method controls these flags without changing channel
configuration; saving channel configuration does not reset them.

Moderation can hide a personal message for one server using
`hidePersonalMessage(guildId, userId, hidden)`. This leaves the owner's shared text
and other servers unchanged. The local hiding flag survives owner edits and local
deactivation/reactivation until a moderator explicitly clears it. The caller must
derive guild/user scope from trusted interactions, enforce Manage Messages and log
the action; no new slash commands are exposed in this storage milestone.

`renderProfileExtras` returns optional feed lines only for an active profile and
matching server settings. It respects the local hiding flag, escapes Markdown and
breaks mention syntax. The exact SAP marker `🔇 republishing off` is reserved and
cannot be supplied as personal text. The existing republishing preference and
marker must still be rendered by the main post renderer.

Next integration: owner input/edit controls, authorized server presentation controls,
moderator hide/unhide commands with audit, and appending the optional lines in all
public rendering paths (including bump and moderator correction). Validate the
complete message length and apply no-mention sending there. No active Discord
posts, commands, secrets or production data have been changed by this milestone.
