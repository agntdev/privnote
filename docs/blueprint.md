# Private Notes Keeper — Bot specification

**Archetype:** custom

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

Telegram bot for storing encrypted text notes secured by user-chosen PIN/password. Notes are encrypted at rest and require PIN entry for every access operation. No user sharing or session persistence.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- individual Telegram users
- privacy-focused note-takers

## Success criteria

- User can securely store and retrieve encrypted notes via PIN authentication
- All note operations require PIN verification
- No plaintext PINs stored in system

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Initialize user account and show help menu
- **/setpin** (command, actor: user, command: /setpin) — Initiate PIN setup/changes with confirmation flow
  - inputs: new PIN, confirmation
  - outputs: PIN verification status
- **/add** (command, actor: user, command: /add) — Create new encrypted note with optional title
  - inputs: note title, note body
  - outputs: note creation confirmation
- **View note** (command, actor: user, callback: view:note_id) — Decrypt and display note contents after PIN verification
  - inputs: note ID, PIN
  - outputs: decrypted note text
- **Export all notes** (button, actor: user, callback: export:start) — Prompt for PIN and return decrypted notes as text file
  - inputs: PIN
  - outputs: exported notes file

## Flows

### PIN authentication
_Trigger:_ any decrypt operation

1. Request PIN input
2. Verify against stored verifier
3. Allow operation if valid

_Data touched:_ Credential

### Note creation
_Trigger:_ /add

1. Request title/body
2. Encrypt with derived key
3. Store encrypted payload

_Data touched:_ Note

### Note listing
_Trigger:_ /list

1. Fetch encrypted notes
2. Display titles as buttons

_Data touched:_ Note

### Note deletion
_Trigger:_ /delete <note-id>

1. Confirm deletion
2. Verify PIN
3. Remove encrypted payload

_Data touched:_ Note

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

- **User** _(retention: persistent)_ — Telegram user account metadata
  - fields: Telegram user ID, registration date, last activity timestamp
- **Credential** _(retention: persistent)_ — PIN authentication data
  - fields: salted verifier, key derivation parameters
- **Note** _(retention: persistent)_ — Encrypted note content
  - fields: encrypted payload, title, creation timestamp, last-updated timestamp, tags

## Integrations

- **Telegram** (required) — Bot API messaging
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- PIN verification logic
- Encryption key derivation
- Access control enforcement
- Audit metadata retention

## Notifications

- Security reminders on /help
- PIN verification status messages
- Note operation success/failure alerts

## Permissions & privacy

- Notes are private to user account
- No plaintext PINs stored
- User must re-enter PIN for every operation

## Edge cases

- Wrong PIN attempts
- Missing note IDs
- Concurrent access to same note
- Export without valid PIN

## Required tests

- PIN verification flow with multiple attempts
- Note encryption/decryption roundtrip
- Button-based note listing navigation
- Export file format validation

## Assumptions

- Telegram user IDs are unique and reliable
- PIN must be re-entered for every operation
- Encryption keys derived at runtime from PIN
- No session persistence between operations
