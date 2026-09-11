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
- **Create New Character**: an inline name field, a **Starting City** `<select>`, and three **Difficulty** checkboxes (toggled open together, not a separate page) insert a fresh row — `freshCharacterData(name, burgId, difficulty)` matches index.html's `initPlayerStateIfMissing()` defaults exactly otherwise (same starting gold/inventory/etc., see [player-state.md](player-state.md)) — then plays it the same way Play does. The city dropdown is populated from the same `travel-graph.json` fetch this page already does for `locationName()`, filtered to `race === 'human'` settlements of `tier` `'city'` or `'capital'` (15 today), capitals sorted first then alphabetically — per the project owner, a fresh character always starts somewhere in Human territory, never a Dwarf/Ork/Goblin settlement (`populateStartCitySelect()`). Bary (`id "5"`) is preselected, matching the single hardcoded start every character used before this existed; `freshCharacterData`'s own `burgId` parameter still defaults to `"5"` too, as a last-resort fallback if it's ever called without one. The three Difficulty checkboxes (You/Companions/Mercenaries permadeath) default checked-state matches the pre-existing behavior exactly (player unchecked, companions/mercenaries checked) — see "The snapshot shape" below for what they actually do.
- **Delete**: `confirm()`s, deletes the row, and if it was the active character, clears `goblinwar_activeCharacterId` too (so the gate correctly bounces back to characters.html rather than treating a since-deleted id as still active).

## The snapshot shape

Every character's `data` column holds:

```js
{
  name,
  burgId, day, hour, heading,
  health, maxHealth,
  stamina, maxStamina,
  isDead,                                                              // permadeath — see below
  permadeathPlayer, permadeathCompanions, permadeathMercenaries,       // difficulty choice, set once at creation — see below
  age, gold,
  inventory,          // JSON string, not parsed — see player-state.md
  equipped,           // JSON string, not parsed
  level, xp, skillPoints,          // leveling — see player-state.md's "Leveling & stats"
  stats, skills,                   // JSON strings, not parsed — see player-state.md
  kills,                           // JSON string, not parsed — {race: count}, see player-state.md's "Titles"
  quests,                          // JSON string, not parsed — see quests.md
  party, mercenaries,              // JSON strings, not parsed — see secondary-pages.md's party.html section
  territoryControl, relations, reinforcements, lastWarTick, population,  // JSON strings/number — see below
  sieges, refugeeArrivals, siegeDefenseCooldowns,                        // JSON strings — see below
  savedAt
}
```

This is the old local-save-slot shape (see player-state.md) plus three additions:
- **`name`** — new. Set once at character creation, shown in character.html's header and settings.html's current-character card, never edited afterward (no rename feature).
- **`hour`** — the real hour-of-day clock (`goblinwar_gameHour`, 0-24 float), alongside `day`'s existing whole-day counter — see [travel-and-map.md](travel-and-map.md)'s "Calendar and the clock". Defaults to `8` (a fresh character starts on a morning) wherever a `data` predates this field, same reset-onto-`freshCharacterData` merge as everything else here.
- **`territoryControl`/`relations`/`reinforcements`/`lastWarTick`/`population`/`sieges`/`refugeeArrivals`/`siegeDefenseCooldowns`** — these are pure device-local "world state" that would otherwise never round-trip through a save at all (see [factions-and-territory.md](factions-and-territory.md); `relations` replaced the earlier per-kingdom `warState` field). Now that one account can run multiple characters sharing the same browser's `localStorage`, that gap became a real bug rather than a theoretical one: without carrying these along, switching characters on the same device would let one character's faction/war progress bleed into another's, since they'd all be reading/writing the same flat keys. So each character now has its own copy — and `applyCharacterData`'s reset-onto-`freshCharacterData` merge (see above) is what actually makes that hold for *every* character, including ones saved before these fields existed.
- **`level`/`xp`/`skillPoints`/`stats`/`skills`** — the Skills & Progression system (see [player-state.md](player-state.md) and [roadmap.md](roadmap.md)). Without these, switching characters or logging in on another device would silently reset a character's level back to the freshly-created default.
- **`kills`** — cumulative combat-victory kills by enemy race, backing character.html's small cosmetic Titles line (see [player-state.md](player-state.md)'s "Titles"). Same reasoning as `level`/`xp`/etc. above: without it, switching characters would silently reset progress toward a title.
- **`quests`** — accepted Quest Board/Notable Figure quests (see [quests.md](quests.md)). Same reasoning as above: without it, switching characters would silently drop whatever quests were in progress.
- **`party`** — recruited companion ids for party.html's roster (see [secondary-pages.md](secondary-pages.md)). Recruiting is real now (index.html's "A New Face" settlement action) — without this field, switching characters on the same device would bleed one character's recruited companions into another's, same reasoning as `mercenaries` below.
- **`mercenaries`** — hired mercenary instances (`{instanceId, typeId, hiredDay, lastUpkeepDay}[]`, see [secondary-pages.md](secondary-pages.md) and [combat.md](combat.md)'s "Party in combat"). Without this, switching characters on the same device would bleed one character's hired mercenaries (and their upkeep obligations) into another's, same reasoning as `party` above — and now that a mercenary can die permanently in combat, that removal needs to survive a save too, not just the hire itself.
- **`isDead`/`permadeathPlayer`/`permadeathCompanions`/`permadeathMercenaries`** — the difficulty setting (see [roadmap.md](roadmap.md)'s "Difficulty setting — permadeath" and [combat.md](combat.md)'s "Party in combat" and "Ending a fight"). The three `permadeath*` fields are chosen once on characters.html's create form (alongside Starting City) and never changed afterward — `freshCharacterData(name, burgId, difficulty)`'s third parameter, defaulting to `{permadeathPlayer:false, permadeathCompanions:true, permadeathMercenaries:true}` if omitted, which exactly matches the game's behavior before this setting existed, so an old character (or any path that doesn't pass a `difficulty`) plays unchanged. `isDead` starts `false` and flips permanently `true` in index.html's `endCombat` if `permadeathPlayer` is on and the player loses a fight — see the next section for what happens then.
- **A dead character (`isDead: true`) can never be `Play`ed again.** characters.html's card rendering shows a "Deceased" badge and simply doesn't render a Play button for one; `playCharacter()` also refuses on `row.data.isDead` directly as defense in depth, in case a Play click ever reaches it some other way (a stale render, say). Nothing deletes the row automatically — it stays visible (Delete still works) as a record of that playthrough, per the project owner's "no more continuing this save" framing rather than "the character vanishes."

Three duplicated copies of the functions that build/apply this shape exist, per the project's [no-modules convention](../CLAUDE.md) — `collectCharacterSnapshot()`/nothing-to-apply in index.html (it only ever saves, never loads, since a character is already active by the time index.html runs), `collectCharacterSnapshot()`/`applyLoadedState()`-equivalent in settings.html (Save Now), and `freshCharacterData()`/`applyCharacterData()` in characters.html (create/play). Add a new field to all three if you add one to player state that should survive a save.

## Autosave (index.html)

There's no manual "Save" button on the map itself — the active character's row is kept current automatically:
- Every 60 seconds while index.html is open (`setInterval(saveActiveCharacter, 60000)`).
- Whenever the tab is backgrounded/hidden (`visibilitychange` → `'hidden'`).
- Immediately before leaving to another page — every toolbar nav button calls `goTo(page)` instead of a bare `location.href`, which fires `saveActiveCharacter()` and navigates right away (see the cache-busting convention in [../CLAUDE.md](../CLAUDE.md) — `goTo()` still appends the same `?_=` timestamp).
- Before the "Update available" banner's reload, for the same reason.

**`goTo()` used to `await` that save before navigating at all — this was changed per the project owner because it was the actual cause of every toolbar tap feeling slow** (a real Supabase round trip, several hundred ms to over a second). The fix wasn't to drop the guarantee, just to stop blocking on it: [assets/auth-client.js](../assets/auth-client.js)'s shared `sb` client now sends every request with `keepalive:true`, the fetch spec's own mechanism for a request surviving the page that started it being unloaded (the same one `navigator.sendBeacon` uses) — so the save reliably finishes in the background even though `goTo()` no longer waits for it. `settings.html`'s **Save Now** button (below) deliberately kept its own `await` — that one has visible success/failure feedback the player explicitly asked for, so waiting is the point there, not a cost to cut.

`saveActiveCharacter()` is deliberately best-effort — a failed autosave (offline, say) doesn't surface an error to the player, it just quietly doesn't update `updated_at`. This means a hard crash or a device losing power mid-session could lose whatever changed since the last successful trigger above (well under a minute in the worst case), but every *normal* way a player stops playing is covered without needing to hook autosave into dozens of individual state-mutating call sites scattered across index.html.

## settings.html: Save Now / Switch Character / Delete This Character

Settings no longer shows three local save slots or a manual cloud Save/Load pair — with one save per character, "which slot" isn't a question anymore. The current-character card also shows the active character's chosen Difficulty (`#current-difficulty`, read-only — "Permadeath — You: Off · Companions: On · Mercenaries: On", or whatever was actually picked at creation) so a player can recall it; there's no way to change it after creation, deliberately. What's there instead:
- **Save Now** — an explicit, immediate version of the same autosave index.html does, for players who want the reassurance of a manual trigger.
- **Switch Character** — just navigates to characters.html; the gate takes care of everything else once there's no (or a different) active character.
- **Delete This Character** — deletes the active character's row entirely (not a "New Game reset" that kept the row and just zeroed its stats, like the old system's New Game button did) and sends the player back to characters.html. This is the correct replacement for the old "Start New Game" button: in a one-save-per-character world, starting over *is* deleting the character and creating a new one from characters.html, not resetting stats in place.

## Stale-save warning (settings.html)

A device-local `goblinwar_localSyncedAt` key (not part of the character snapshot above — it's per-device, not per-character data) tracks the last Supabase `updated_at` this browser actually knows about for the active character: characters.html's `playCharacter` seeds it from the row it just loaded, and both index.html's `saveActiveCharacter` and settings.html's Save Now update it to the timestamp they just wrote, but only on a successful write. On load, settings.html fetches the active character's live `updated_at` and compares it against this key — if the server's value is more than `STALE_SAVE_THRESHOLD_MS` (5s, just clock/round-trip slack) ahead of what this device last saw, it shows a warning banner above the current-character card: the same character was saved more recently somewhere else (another device, another tab) since this one last loaded or wrote it, so tapping Save Now would silently overwrite that newer save with whatever's loaded here. The warning clears itself the moment Save Now actually runs (it becomes the newest save at that point) and never appears at all for a character that predates this feature and has no local marker yet — no false positive, just no warning until this device saves or reloads it once.
