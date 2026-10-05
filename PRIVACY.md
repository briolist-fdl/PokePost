# Privacy Policy for PokéPost

Effective date: 2026-07-03

PokéPost is a Discord bot for structured Pokémon GO friend code posting.

This privacy policy explains what data PokéPost stores and why.

## Data PokéPost may store

PokéPost may store data submitted through `/post` commands, including:

* Discord user IDs
* Pokémon GO usernames
* Pokémon GO trainer codes
* additional trainer codes
* Vivillon patterns
* optional Campfire usernames
* republishing preferences
* message references needed to edit, repost, or delete bot-created profile posts

PokéPost may also store channel and server references needed to post friend code profiles in configured Discord channels.

## Public profile posts

When a user creates or reposts a profile, PokéPost may publish the submitted profile information in configured Discord channels.

This may include:

* Pokémon GO username
* trainer code
* additional trainer codes
* Vivillon pattern
* optional Campfire username
* Discord user reference

Users should only submit information they are comfortable sharing in the configured friend code channels.

## Why this data is used

PokéPost uses this data to:

* create and manage friend code profiles
* post profiles in configured Discord channels
* allow users to view, edit, repost, or delete their profile
* manage additional trainer codes
* manage Vivillon region information
* apply republishing preferences
* maintain clean friend code feeds

## What PokéPost does not do

PokéPost is not designed as a general-purpose message archive.

PokéPost does not sell user data.

PokéPost does not share stored data with advertisers or third parties.

## Data retention

### Moderator corrections

Authorized administrators can correct a profile's Vivillon region and channel
placement. The bot records the acting moderator's Discord ID, profile owner's
Discord ID, server ID, old/new region, channel/message references, timestamp and
outcome in hosting logs. These moderation records do not include trainer codes.
Hosting log retention is separate from profile storage; `/post delete` does not
delete hosting logs. Contact the maintainer for requests concerning these records.

### Profile storage

PokéPost stores profile data for as long as the user keeps a profile registered with the bot.

Users can delete their saved profile using:

```text
/post delete
```

Deleting a profile removes the saved profile data used by the bot and may remove the bot-created public post where technically possible.

## Data deletion

Users can delete their own saved profile using the bot command above.

Server administrators or users may also request deletion of stored PokéPost data by contacting the maintainer through the GitHub repository:

https://github.com/briolist-fdl/poke-post

## Open source

PokéPost is built as an open source community tool.

The source code is available here:

https://github.com/briolist-fdl/poke-post

## Changes

This policy may be updated when PokéPost changes how it stores or processes data.
