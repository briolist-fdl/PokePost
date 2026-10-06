# PokéPost

PokéPost keeps Pokémon GO friend code channels useful instead of noisy. Players
save one profile and choose which servers to post it in. Server moderators choose
the feeds. They can also sort Vivillon regions into existing threads.

PokéPost is in a free public pilot. We have not set any pricing. If paid
features arrive later, servers will get notice before anything changes.

## Add PokéPost to a server

[Install PokéPost](https://discord.com/oauth2/authorize?client_id=1494609975031369828&scope=bot%20applications.commands&permissions=292058106880&integration_type=0)

The link requests only Guild Install. It asks for permission to view channels,
read message history, send messages, send in threads, manage threads and use
external emojis. A moderator needs **Manage Messages** to configure the bot.

1. Run `/post admin server` and select a main friend code channel and your local
   Vivillon region. A separate local channel is optional.
2. If you already have Vivillon group threads, run `/post admin thread` for each
   group you want to link. Thread sorting is optional. PokéPost does not create
   the threads for you yet.
3. Players can run `/post setup` to save a profile and activate it in the server.

The bot needs access to the channels and threads you choose. It may take a little
while for a new global slash command to appear in Discord.

## Player commands

`/post setup` opens the profile form. It asks for your Pokémon GO name, friend
code, Vivillon region and whether you allow republishing to follower servers.
Campfire name and additional codes are optional.

`/post view`, `/post edit`, `/post region`, `/post add-code` and
`/post remove-code` manage your saved profile. Shared profile edits update every
server where you have activated it. `/post repost` replaces your post in the
current server. `/post republishing` changes that server's republishing choice.

`/post delete` removes your posts from the current server. Your saved profile
and posts in other servers remain. `/post erase` asks for confirmation before
deleting your saved profile across servers. Post cleanup can take time, and
copies already published to follower servers may remain.

`/post about` shows a short overview of the pilot and what is planned.

## PokéTrade

Trade posts are planned, but there are no trade commands yet. If you are mainly
interested in that feature, [join the PokéPost channel in Brio Bots](https://discord.gg/FzXq7fjRhR).
This invite gives you the **PokéTrade Interest** role.

Guided thread setup and alternative region emoji sets are also on the roadmap.
They are not part of the pilot today.

## Privacy and support

Read the [Privacy Policy](PRIVACY.md) and [Terms of Service](TERMS.md). To report
an issue or request help, use [GitHub Issues](https://github.com/briolist-fdl/PokePost/issues).
Do not post a bot token, database address or other credential in a public issue.

The [public pilot copy](PUBLIC-PILOT.md) records the current invitation and
roadmap wording. Source code is available in this repository. No software
licence has been selected yet.

## Development

The public Railway service starts `production-bot.js`. The package's `npm start`
command still starts the older single server runtime in `index.js`. Do not use
that command as a production setup guide for the public pilot.

The shared runtime requires PostgreSQL migrations and reviewed environment
settings. See [production runtime notes](PRODUCTION-SHARED-RUNTIME-20261002.md),
[shared profile notes](SHARED-PROFILES.md) and [delivery recovery notes](DELIVERY-RECOVERY.md)
before working on it. Some dated technical notes describe earlier milestones
and do not reflect the current deployment.
