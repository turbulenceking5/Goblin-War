# Save System (settings.html)

Three fixed save slots plus a hard reset, both operating on the same `localStorage` keys documented in [player-state.md](player-state.md). There's no autosave — `localStorage` already persists between sessions on its own, so a "save" here really means "snapshot the current state into a separate, named slot you can return to," distinct from whatever's currently active.

## Save slots

`SLOT_KEYS = ["goblinwar_slot_1", "goblinwar_slot_2", "goblinwar_slot_3"]`. Each holds a JSON blob (not the live keys themselves) shaped like:

```js
{
  burgId, day, heading,
  health, maxHealth,
  stamina, maxStamina,
  age, gold,
  inventory,   // JSON string, not parsed — copied as-is from goblinwar_inventory (carries Food + weights)
  equipped,    // JSON string, not parsed — copied as-is from goblinwar_equipped ({slot: itemName})
  savedAt      // localized date string, display only
}
```

- **Save Here** (`data-save` buttons in `renderSlots()`): reads every live key, builds the object above, `JSON.stringify`s it into the slot key, re-renders. Overwrites without confirmation — there's no "are you sure" on save, only on load/reset.
- **Load** (`data-load` buttons): `confirm()`s first ("current unsaved progress will be overwritten"), then writes every field from the slot back onto the live keys and redirects to `index.html`. Each field is written only `if(data.field !== undefined)` — this is defensive against loading a slot saved by an older version of the game that predates a given field (e.g. a slot saved before Food/weight existed has no `weight` on its inventory items). Stamina had a brief detour here: it existed as a travel-pacing stat, got replaced by Food and dropped from the slot shape entirely, then came back scoped to combat only — a slot saved during that in-between window simply has no `stamina`/`maxStamina` fields and loads with whatever `initPlayerStateIfMissing()`'s defaults left on the live keys, same as any other missing field.
- A slot with no saved data shows "Empty" and a disabled Load button; `renderSlots()` fully rebuilds the three slot cards from scratch on every call rather than diffing.

## New Game

The `#new-game-btn` handler `confirm()`s, then writes fresh defaults directly for every key (matching `initPlayerStateIfMissing()`'s defaults in index.html, duplicated here rather than shared — see root [CLAUDE.md](../CLAUDE.md) on the no-modules convention) and redirects to `index.html`. It does **not** touch the save slots themselves — starting a new game doesn't clear Slot 1/2/3, so existing saves survive a reset.

## Display-only header

`renderCurrent()` at the top of the page (current location, date, HP, stamina, gold) reads live keys but writes nothing — purely informational, refreshed by the same `renderCurrent()`/`renderSlots()` pair called once on load after `travel-graph.json` resolves (needed only to turn `burgId` into a display name via `locationName()`).

## Cloud Save (Supabase)

Every player is logged in by the time they reach settings.html — see [accounts.md](accounts.md) for the login gate every page sits behind. Separate from the three local slots above: settings.html's Account & Cloud Save section lets a logged-in player push/pull **one** cloud save per account, stored in the `saves` table (`user_id primary key, data jsonb, saved_at` — see [supabase/schema.sql](../supabase/schema.sql)). It reuses the exact same snapshot shape as a local slot — both now go through shared helpers, `collectLiveState()` (build the snapshot from live keys) and `applyLoadedState(data)` (write a snapshot back onto live keys) — so a cloud save can be loaded with the same defensive-guard behavior described above.

- **Save to Cloud**: `collectLiveState()` then `sb.from('saves').upsert({ user_id, data, saved_at })` — one row per user, overwritten each time, no multiple cloud slots.
- **Load from Cloud**: `confirm()`s (same as a local slot load), fetches the row by `user_id`, then `applyLoadedState()` and redirects to index.html.
- `sb` and `authGateReady` come from `assets/auth-client.js` (shared with every gated page — see [accounts.md](accounts.md)), not something settings.html sets up itself. The Supabase client persists its own session in `localStorage` under a `sb-`-prefixed key it manages itself — separate from every `goblinwar_`-prefixed key.
- Row Level Security on the `saves` table restricts every operation to `auth.uid() = user_id`, so the public anon key in `assets/supabase-config.js` can't read or write another account's save even though it ships in the page source — that's expected of an anon key, not a leak.
- Cloud save/load is still manual and settings.html-only — logging in doesn't itself push or pull anything (see accounts.md's "What the gate does not do"). It's a deliberate mirror of the local-slot flow the player triggers, not an automatic sync.

## Gotcha: keys added after a slot format existed

If you add a new persisted key to the game (e.g. a future reputation stat), remember three places need it, not one: the live default in index.html's `initPlayerStateIfMissing()`, the New Game reset in this file, and — if it should survive save/load — the save-slot object shape and both the save and (defensively-guarded) load handlers here.

A live example of not having done this yet: `goblinwar_territoryControl`/`goblinwar_warState`/`goblinwar_lastWarTick`/`goblinwar_population` (see [factions-and-territory.md](factions-and-territory.md)) are seeded in `initPlayerStateIfMissing()` but don't appear anywhere in this file — no save slot captures them, and New Game doesn't reset them. Loading an old save or starting fresh currently leaves whatever territory/war/population state is already live untouched either way.
