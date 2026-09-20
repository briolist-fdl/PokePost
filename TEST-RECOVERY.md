# Test delivery recovery

This local operator tool uses only `.env.test`, validates the database marker and bot identity, and restricts confirmation to an allowed test server. It is not a Discord command and must not be exposed to ordinary users. Production uses the unchanged legacy entry point.

## Inspect

Run `node test-recovery.js inspect` in the Poké-Post repository. The output lists unresolved attempts using IDs, timestamps and the delivery nonce. It does not print tokens, database URLs or profile payloads. Inspect is read-only.

An empty pending list needs no action. For a pending attempt, inspect its destination channel and identify the exact post from that delivery. Never select the older source post simply because it has identical text.

## Confirm an observed post

Run `node test-recovery.js confirm GUILD_ID USER_ID NONCE MESSAGE_ID` only after selecting the actual delivered post. Use the nonce from the current inspection. The command verifies the saved destination, bot author, profile copy buttons, exact content, message creation time and the nonce if Discord returns it. A missing nonce in a fetched Discord message is not treated as proof, so selecting the message remains an explicit operator decision. Matching text alone is not automatic deduplication.

The tool obtains the same per-profile database lock as normal delivery. It persists the confirmed receipt before settlement. Normal settlement then either adopts the post, or queues it for cleanup if the activation was removed or its destination changed. Newer profile changes remain queued. The tool itself never sends or deletes Discord messages.

If confirmation fails, inspect again. Do not delete the pending row, clear the nonce, or force a resend. If no exact post can be identified, the delivery remains blocked for further review. No automatic history scan or assertion of exactly-once delivery is provided.

## Verification boundary

Local fault-injection tests exercise an expired ambiguous send, mismatched messages, deactivation, newer profile revisions and database failure between receipt persistence and settlement. Discord is simulated. Do not deliberately interrupt live user deliveries to reproduce these cases. Ordinary idle restart was separately tested in Discord.
