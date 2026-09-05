# Characters (one save per character, chosen at login)

Replaces the old three-local-save-slot system. An account can own a roster of characters (stored in Supabase, one row each), each with exactly one save — there's no way to save the same character into a second slot, and no local-only saves at all anymore. Read [accounts.md](accounts.md) first — this builds directly on the login gate described there.

## The table

`characters` (see [supabase/schema.sql](../supabase/schema.sql)): `id` (uuid, primary key), `user_id` (references `auth.users`), `name`, `data` (jsonb — the full character snapshot, same shape described below), `created_at`, `updated_at`. Row Level Security restricts every operation to `auth.uid() = user_id`, same pattern as the old `saves` table it replaces (that table is dropped by the current schema.sql — nothing reads from it anymore).

## The gate: login → characters.html → the game

Login no longer drops a player straight into index.html. `login.html`'s `targetPage()` always routes through `characters.html` first, carrying along wherever the player actually wanted to go as `?redirect=` (defaulting to index.html) for characters.html to forward on once a character's picked.

The two shared gate scripts (see [accounts.md](accounts.md)) enforce this on every other gated page too, not just right after login:
- **`assets/auth-gate-sync.js`** (synchronous, no network): after confirming a session token exists, also checks `localStorage.getItem('goblinwar_activeCharacterId')`. If that's missing, it redirects to `characters.html?redirect=<page>` — before a single frame of gameplay paints, same as the login check. `login.html` and `characters.html` itself are both exempt (characters.html obviously can't require an active character to reach the page where you pick one).
- **`assets/auth-client.js`** (async, authoritative): re-checks the same thing, but also actually queries whether that character id still exists and still belongs to this account (`sb.from('characters').select('id').eq('id', activeId).maybeSingle()`) — covering the case it was deleted from another device since this browser last picked it. If the row's gone, it clears the stale id and redirects to characters.html too.

Net effect: **every gated page requires both a valid session and a real, currently-existing active character**, checked twice (fast local guess, then confirmed against the server) exactly like the login check itself already worked.

## characters.html — pick, create, delete

Lists the logged-in account's characters (name, HP, location, in-game date — resolved via `travel-graph.json`, fetched here too), newest-played first (`order('updated_at', {ascending:false})`). Three actions:

- **Play**: `localStorage.setItem('goblinwar_activeCharacterId', row.id)`, writes the row's `data` onto the live `goblinwar_*` keys (`applyCharacterData()`), then redirects to wherever `?redirect=` says. `applyCharacterData` merges the loaded row onto a fresh `freshCharacterData(data.name)` baseline (`Object.assign(freshCharacterData(data.name), data)`) rather than conditionally patching whatever's currently in `localStorage` — a real bug the merge fixes: a character save made before some field existed (e.g. before Hunger/Thirst or the war-relations system shipped) simply lacks that key in its own `data`, and without resetting first, playing it would silently keep whatever the *previously active* character on this device had left in that same `localStorage` key, bleeding one character's state into another's instead of falling back to that field's real default.
- **Create New Character**: an inline name field (toggled open, not a separate page) inserts a fresh row — `freshCharacterData(name)` matches index.html's `initPlayerStateIfMissing()` defaults exactly (same starting gold/inventory/location/etc., see [player-state.md](player-state.md)) — then plays it the same way Play does.
- **Delete**: `confirm()`s, deletes the row, and if it was the active character, clears `goblinwar_activeCharacterId` too (so the gate correctly bounces back to characters.html rather than treating a since-deleted id as still active).

## The snapshot shape

Every character's `data` column holds:

```js
{
  name,
  burgId, day, heading,
  health, maxHealth,
  stamina, maxStamina,
  age, gold,
  inventory,          // JSON string, not parsed — see player-state.md
  equipped,           // JSON string, not parsed
  level, xp, skillPoints,          // leveling — see player-state.md's "Leveling & stats"
  stats, skills,                   // JSON strings, not parsed — see player-state.md
  quests,                          // JSON string, not parsed — see quests.md
  territoryControl, relations, reinforcements, lastWarTick, population,  // JSON strings/number — see below
  sieges, refugeeArrivals, siegeDefenseCooldowns,                        // JSON strings — see below
  savedAt
}
```

This is the old local-save-slot shape (see player-state.md) plus three additions:
- **`name`** — new. Set once at character creation, shown in character.html's header and settings.html's current-character card, never edited afterward (no rename feature).
- **`territoryControl`/`relations`/`reinforcements`/`lastWarTick`/`population`/`sieges`/`refugeeArrivals`/`siegeDefenseCooldowns`** — these are pure device-local "world state" that would otherwise never round-trip through a save at all (see [factions-and-territory.md](factions-and-territory.md); `relations` replaced the earlier per-kingdom `warState` field). Now that one account can run multiple characters sharing the same browser's `localStorage`, that gap became a real bug rather than a theoretical one: without carrying these along, switching characters on the same device would let one character's faction/war progress bleed into another's, since they'd all be reading/writing the same flat keys. So each character now has its own copy — and `applyCharacterData`'s reset-onto-`freshCharacterData` merge (see above) is what actually makes that hold for *every* character, including ones saved before these fields existed.
- **`level`/`xp`/`skillPoints`/`stats`/`skills`** — the Skills & Progression system (see [player-state.md](player-state.md) and [roadmap.md](roadmap.md)). Without these, switching characters or logging in on another device would silently reset a character's level back to the freshly-created default.
- **`quests`** — accepted Quest Board/Notable Figure quests (see [quests.md](quests.md)). Same reasoning as above: without it, switching characters would silently drop whatever quests were in progress.

Three duplicated copies of the functions that build/apply this shape exist, per the project's [no-modules convention](../CLAUDE.md) — `collectCharacterSnapshot()`/nothing-to-apply in index.html (it only ever saves, never loads, since a character is already active by the time index.html runs), `collectCharacterSnapshot()`/`applyLoadedState()`-equivalent in settings.html (Save Now), and `freshCharacterData()`/`applyCharacterData()` in characters.html (create/play). Add a new field to all three if you add one to player state that should survive a save.

## Autosave (index.html)

There's no manual "Save" button on the map itself — the active character's row is kept current automatically:
- Every 60 seconds while index.html is open (`setInterval(saveActiveCharacter, 60000)`).
- Whenever the tab is backgrounded/hidden (`visibilitychange` → `'hidden'`).
- Immediately before leaving to another page — every toolbar nav button calls `goTo(page)` instead of a bare `location.href`, which awaits `saveActiveCharacter()` before navigating (see the cache-busting convention in [../CLAUDE.md](../CLAUDE.md) — `goTo()` still appends the same `?_=` timestamp, just after the save resolves).
- Before the "Update available" banner's reload, for the same reason.

`saveActiveCharacter()` is deliberately best-effort — a failed autosave (offline, say) doesn't surface an error to the player, it just quietly doesn't update `updated_at`. This means a hard crash or a device losing power mid-session could lose whatever changed since the last successful trigger above (well under a minute in the worst case), but every *normal* way a player stops playing is covered without needing to hook autosave into dozens of individual state-mutating call sites scattered across index.html.

## settings.html: Save Now / Switch Character / Delete This Character

Settings no longer shows three local save slots or a manual cloud Save/Load pair — with one save per character, "which slot" isn't a question anymore. What's there instead:
- **Save Now** — an explicit, immediate version of the same autosave index.html does, for players who want the reassurance of a manual trigger.
- **Switch Character** — just navigates to characters.html; the gate takes care of everything else once there's no (or a different) active character.
- **Delete This Character** — deletes the active character's row entirely (not a "New Game reset" that kept the row and just zeroed its stats, like the old system's New Game button did) and sends the player back to characters.html. This is the correct replacement for the old "Start New Game" button: in a one-save-per-character world, starting over *is* deleting the character and creating a new one from characters.html, not resetting stats in place.
