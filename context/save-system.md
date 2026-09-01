# Save System (settings.html)

Three fixed save slots plus a hard reset, both operating on the same `localStorage` keys documented in [player-state.md](player-state.md). There's no autosave — `localStorage` already persists between sessions on its own, so a "save" here really means "snapshot the current state into a separate, named slot you can return to," distinct from whatever's currently active.

## Save slots

`SLOT_KEYS = ["goblinwar_slot_1", "goblinwar_slot_2", "goblinwar_slot_3"]`. Each holds a JSON blob (not the live keys themselves) shaped like:

```js
{
  burgId, day, heading,
  health, maxHealth, stamina, maxStamina,
  age, gold,
  inventory,   // JSON string, not parsed — copied as-is from goblinwar_inventory
  savedAt      // localized date string, display only
}
```

- **Save Here** (`data-save` buttons in `renderSlots()`): reads every live key, builds the object above, `JSON.stringify`s it into the slot key, re-renders. Overwrites without confirmation — there's no "are you sure" on save, only on load/reset.
- **Load** (`data-load` buttons): `confirm()`s first ("current unsaved progress will be overwritten"), then writes every field from the slot back onto the live keys and redirects to `index.html`. Each field is written only `if(data.field !== undefined)` — this is defensive against loading a slot saved by an older version of the game that predates a given field (e.g. slots saved before stamina existed).
- A slot with no saved data shows "Empty" and a disabled Load button; `renderSlots()` fully rebuilds the three slot cards from scratch on every call rather than diffing.

## New Game

The `#new-game-btn` handler `confirm()`s, then writes fresh defaults directly for every key (matching `initPlayerStateIfMissing()`'s defaults in index.html, duplicated here rather than shared — see root [CLAUDE.md](../CLAUDE.md) on the no-modules convention) and redirects to `index.html`. It does **not** touch the save slots themselves — starting a new game doesn't clear Slot 1/2/3, so existing saves survive a reset.

## Display-only header

`renderCurrent()` at the top of the page (current location, date, HP, gold) reads live keys but writes nothing — purely informational, refreshed by the same `renderCurrent()`/`renderSlots()` pair called once on load after `travel-graph.json` resolves (needed only to turn `burgId` into a display name via `locationName()`).

## Gotcha: keys added after a slot format existed

If you add a new persisted key to the game (e.g. a future reputation stat), remember three places need it, not one: the live default in index.html's `initPlayerStateIfMissing()`, the New Game reset in this file, and — if it should survive save/load — the save-slot object shape and both the save and (defensively-guarded) load handlers here.
