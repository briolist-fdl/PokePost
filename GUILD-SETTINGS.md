# Server settings foundation

The local data layer supports a server-selected Vivillon region, a required main
feed and an optional separate local feed. Missing localChannelId means all regions
use the main feed. Tundra is Tundraheim's choice and is not a universal routing rule.

The new setup form and existing-thread configuration are described in
[SERVER-SETUP.md](SERVER-SETUP.md). They are implemented and tested locally but not
connected to the running bot. The current home-server deployment still uses legacy
profiles and its approved thread configuration. Do not advertise public multi-server
support until every profile read, write, modal, button, removal and bump is scoped.

Feed validation checks channel ownership, supported types, distinct channel IDs and
bot access before saving. Manage Messages is also needed by the bot when channel
moderation is enabled. New settings default bumping and moderation to false. Feed
choices do not change publishing consent or move existing posts by themselves.

The setup controller requires Manage Messages from the moderator. The underlying
guildSettings storage API does not authorize actors and must only be called through
an authorized controller or a reviewed migration. See SHARED-PROFILES.md for the
approved shared profile model and explicit activation per server.

Migrations remain explicit. Apply 001 for settings, 004 for optional local channels
and 005 for group-thread destinations. No production migration was run for this step.
