# Player State

There is no player-state module — every page reads and writes the same `localStorage` keys directly, duplicating the constant names and default values. This file is the canonical list; if you rename or add a key, update it in every page listed under "used by".

## The keys

| Key | Meaning | Default | Used by |
|---|---|---|---|
| `goblinwar_health` | Current HP | = max health | index.html, character.html, settings.html |
| `goblinwar_maxHealth` | Max HP | `100` | index.html, character.html, settings.html |
| `goblinwar_stamina` | Current stamina | = max stamina | index.html, settings.html |
| `goblinwar_maxStamina` | Max stamina | `100` | index.html, settings.html |
| `goblinwar_age` | Hero's age (string) | `"24"` | character.html, settings.html |
| `goblinwar_gold` | Gold carried | `50` | index.html, character.html, inventory.html, settings.html |
| `goblinwar_inventory` | JSON array of `{name, qty}` | see `DEFAULT_INVENTORY` below | index.html, inventory.html, settings.html |
| `goblinwar_currentBurg` | Burg id (string) of last-arrived settlement | `"5"` (Bary) | index.html, character.html, settings.html |
| `goblinwar_gameDay` | Flat day counter | `0` | index.html, character.html, settings.html |
| `goblinwar_heading` | Marker facing, degrees (0=north) | `0` | index.html, settings.html |
| `goblinwar_slot_1/2/3` | Full save-slot snapshots | unset | settings.html only — see [save-system.md](save-system.md) |

`DEFAULT_INVENTORY` is:
```js
[
  { name:"Traveler's Rations", qty:3 },
  { name:"Waterskin", qty:1 },
  { name:"Bedroll", qty:1 },
]
```

## Initialization

Only index.html calls `initPlayerStateIfMissing()` on load, which seeds every key above (except save slots) with its default *if and only if that key doesn't already exist*. character.html, inventory.html, and settings.html never write defaults — they read with a `|| "fallback"` inline instead (e.g. `localStorage.getItem(HEALTH_KEY) || "100"`), which means if you ever open one of those pages before index.html has run once, the fallback is only a *display* value — it never gets persisted.

## Mutators (index.html only)

`setHealth(v)`, `setStamina(v)`, `setGold(v)` are the only three functions that write these keys during play. Each clamps to a valid range (`0..max` for health/stamina, `0..∞` for gold), persists to `localStorage`, and calls `refreshPlayerStatUI()` to update the three stat pills in the toolbar. There's no `setAge` or inventory mutator yet — age is set once at new-game and never changes; inventory is only ever read back out (see [roadmap.md](roadmap.md) — there's no item-use or shop system yet).

## The stamina gate

`canTravel()` is just `playerStamina > 0`. It's checked in two places in index.html:
- `onMapTap`, to show "You're too exhausted to travel" in the info card instead of a travel quote, when the tapped burg isn't the current one.
- `beginTravel`, as a hard guard that blocks starting a journey (with a toast) even if something else tries to call it directly (e.g. the camp screen's "Continue" button).

The only ways stamina goes back up are resting: `setStamina(playerMaxStamina)` in the Inn's rest button (showInnPanel) and the camp's rest button (showCampView) — see [locations-and-camp.md](locations-and-camp.md).

## Health vs. stamina in combat

Combat (see [combat.md](combat.md)) only ever touches `playerHealth`, never stamina — a bandit fight can knock you down to 10 HP on defeat, but it doesn't tire you out. Stamina is purely a travel-pacing resource.
