# Player State

There is no player-state module — every page reads and writes the same `localStorage` keys directly, duplicating the constant names and default values. This file is the canonical list; if you rename or add a key, update it in every page listed under "used by".

## The keys

| Key | Meaning | Default | Used by |
|---|---|---|---|
| `goblinwar_health` | Current HP | = max health | index.html, character.html, settings.html |
| `goblinwar_maxHealth` | Max HP | `100` | index.html, character.html, settings.html |
| `goblinwar_stamina` | Current stamina | = max stamina | index.html, character.html, settings.html |
| `goblinwar_maxStamina` | Max stamina | `100` | index.html, character.html, settings.html |
| `goblinwar_age` | Hero's age (string) | `"24"` | character.html, settings.html |
| `goblinwar_gold` | Gold carried | `50` | index.html, character.html, inventory.html, settings.html |
| `goblinwar_inventory` | JSON array of `{name, qty, weight}` | see `DEFAULT_INVENTORY` below | index.html, character.html, inventory.html, settings.html |
| `goblinwar_equipped` | JSON object `{slot: itemName \| null}` | `{}` | index.html, character.html, inventory.html, settings.html |
| `goblinwar_currentBurg` | Burg id (string) of last-arrived settlement | `"5"` (Bary) | index.html, character.html, settings.html |
| `goblinwar_gameDay` | Flat day counter | `0` | index.html, character.html, settings.html |
| `goblinwar_heading` | Marker facing, degrees (0=north) | `0` | index.html, settings.html |
| `goblinwar_territoryControl` | JSON object `{burgId: race}` — sparse, only conquered settlements | `{}` | index.html only |
| `goblinwar_warState` | JSON object `{kingdomName: "war"\|"peace"}` — sparse, missing = peace | `{}` | index.html only |
| `goblinwar_lastWarTick` | `gameDay` the faction AI last ran | `0` | index.html only |
| `goblinwar_slot_1/2/3` | Full save-slot snapshots | unset | settings.html only — see [save-system.md](save-system.md) |

The last three are world state, not player state — they don't currently round-trip through save slots or reset on New Game (see [save-system.md](save-system.md)) and aren't read by character.html/inventory.html/settings.html at all yet. Full mechanics in [factions-and-territory.md](factions-and-territory.md).

Stamina exists again as of this pass, but scoped only to combat — see "Stamina: a combat-only resource" below. It has nothing to do with travel, which is paced by Food instead (see below). A returning save from before Food existed won't have a `"Food"` entry in its inventory, but that's not a soft-lock: entering a settlement you're already standing in never costs anything, so the player can always reach a Marketplace to buy some. Likewise, a save from before stamina was reintroduced will get `100`/`100` seeded in by `initPlayerStateIfMissing()` the next time index.html loads.

`DEFAULT_INVENTORY` is:
```js
[
  { name:"Food", qty:10, weight:1, value:2 },
  { name:"Waterskin", qty:1, weight:2, value:3 },
  { name:"Bedroll", qty:1, weight:3, value:5 },
]
```

`weight` is per single unit — a stack's total contribution to carried weight is `weight * qty` (see "Carry weight" below). `value` is also per single unit, gold, display-only right now (shown in inventory.html as "Ng each") — there's no sell-back mechanic, so it doesn't do anything mechanical yet, it's just what the item would cost to (re-)buy. Food is consumed by travel; Waterskin and Bedroll are pure flavor/weight; everything else the Marketplace sells (see [locations-and-camp.md](locations-and-camp.md)) is either equippable (see "Equipment" below) or, like Healing Potion/Books/Firewood, still just sits in the bag.

## Equipment

`goblinwar_equipped` is a flat `{slot: itemName}` map, one entry per slot in `EQUIP_SLOTS` (`head`, `chest`, `legs`, `weapon`, `shield`, `trinket` — duplicated as a constant in index.html, character.html, and inventory.html). It only ever points at an item already in `playerInventory` by name; equipping doesn't move, duplicate, or remove anything from the inventory array, so an equipped item's weight and quantity are unaffected and it still shows up as a normal row in inventory.html.

Which items are equippable, and what they do, lives on `MARKET_ITEMS` in index.html — an item with a `slot` field is equippable, and its `dmg`/`def` fields (default `0`) are the combat bonus while equipped (see [combat.md](combat.md)):

| Item | Slot | Bonus |
|---|---|---|
| Sword | weapon | +4 damage dealt |
| Shield | shield | -3 damage taken |
| Leather Cap | head | -1 damage taken |
| Leather Armour | chest | -2 damage taken |
| Leather Boots | legs | -1 damage taken |
| Lucky Charm | trinket | +1 damage dealt |

index.html derives a `name -> {slot, dmg, def}` lookup (`ITEM_STATS`) from `MARKET_ITEMS` once at load; character.html and inventory.html each hardcode their own copy of the same table (no way to equip a *new* item type without also adding it there — three places, not one, per the no-modules convention). `getEquipDamageBonus()`/`getEquipDefenseBonus()` (index.html) sum every equipped slot's `dmg`/`def` — see [combat.md](combat.md) for where they're applied.

**Where equipping happens:** inventory.html is the only place to *equip* something — every equippable item row gets an Equip/Unequip button that toggles `goblinwar_equipped[slot]` between that item's name and `null`. character.html's Equipment grid is read-only for equipping but supports *un*-equipping by tapping a filled slot (both pages re-render immediately after any change, no reload needed — see [secondary-pages.md](secondary-pages.md)). The Accessories grid (8 slots, character.html only) is a separate, still-entirely-cosmetic block — no accessory-type items exist yet, see [roadmap.md](roadmap.md).

## Initialization

Only index.html calls `initPlayerStateIfMissing()` on load, which seeds every key above (except save slots) with its default *if and only if that key doesn't already exist*. character.html, inventory.html, and settings.html never write defaults — they read with a `|| "fallback"` inline instead (e.g. `localStorage.getItem(HEALTH_KEY) || "100"`), which means if you ever open one of those pages before index.html has run once, the fallback is only a *display* value — it never gets persisted.

## Mutators (index.html only)

`setHealth(v)`, `setStamina(v)`, and `setGold(v)` clamp to a valid range (`0..max` for health/stamina, `0..∞` for gold), persist to `localStorage`, and call `refreshPlayerStatUI()`. Inventory has its own pair instead of a single setter, because items are a list, not a scalar:

- `addItem(name, qty, weightEach, valueEach)` — creates the stack (or adds to an existing one), *unless* doing so would push total carried weight over `CARRY_CAPACITY` (`40`), in which case it changes nothing and returns `false`. Every call site (currently just the Marketplace, see [locations-and-camp.md](locations-and-camp.md)) must check that return value. `valueEach` is stored on the item purely for display (see `value` above) — it plays no part in the weight check.
- `consumeItem(name, qty)` — subtracts, clamped at 0, and drops the stack entirely once it hits empty. Used for Food during travel; nothing currently removes non-Food items.
- `getItem(name)`, `getFoodQty()`, `getCarriedWeight()` — read-only helpers built on the same in-memory `playerInventory` array, which both mutators keep in sync with `localStorage` via `saveInventory()`.

There's no `setAge` — age is set once at new-game and never changes.

## Food: the travel resource

Food replaced stamina as what travel costs and what gates it. `computeTravel(toId)` returns `foodCost` (the full cost of the trip — trips are timed in hours now, not days, see [travel-and-map.md](travel-and-map.md), so this is derived from that hour count rather than a flat `days*FOOD_PER_DAY`, but it's still at least 1 Food per journey), checked against `getFoodQty()` at both points travel can start — you can't set out at all unless you're carrying enough to actually arrive:
- `onMapTap`, where a destination you can't afford shows the miles/duration quote plus a red "Not enough food to make it there" line, and the Travel button is hidden entirely rather than shown with a warning.
- `beginTravel`, as a hard guard (with a toast) that blocks starting a journey even if something else tries to call it directly — e.g. the camp screen's "Continue" button, which recomputes the trip fresh from wherever you camped and can still refuse if you haven't restocked.

Because the check happens before departure, running out mid-trip can't happen — a journey that was affordable when it started stays affordable, since nothing else consumes Food while `animateTravel` is running. Food is deducted via `consumeItem(FOOD_NAME, t.foodCost)` once on arrival (or on the partial amount if the journey is interrupted by `campMidTravel`).

Unlike the old stamina system, **resting does not refill Food** — the Inn and camp's "Rest" actions only restore health now. The only way to get more Food is to buy it at a settlement's Marketplace (see [locations-and-camp.md](locations-and-camp.md)) — a deliberate change so the Marketplace has a real reason to exist. Camping is still reachable two ways (interrupting an in-progress journey, or the standalone "Make Camp" map button) so a player stuck at 0 Food is never soft-locked — see [travel-and-map.md](travel-and-map.md) for the camera/travel side of this.

## Carry weight

`CARRY_CAPACITY` (`40`) is a fixed constant, not a stat tied to anything else yet (no strength/character-build system exists — see [roadmap.md](roadmap.md)). `getCarriedWeight()` sums `weight * qty` across every item in the inventory array; `addItem` is the only enforcement point — buying more Food than you have room for fails with a toast rather than partially succeeding. There's no weight penalty to travel speed or anything else — exceeding capacity currently can't happen at all, since the only way to add weight (buying Food) is blocked at the limit.

## Stamina: a combat-only resource

Stamina is spent by attacking in combat and nothing else — travel, camping, and the Marketplace never touch it (that's Food's job, above). `combatAttack()` deducts `STAMINA_COST_PER_ATTACK` (20, defined in index.html near the combat code) via `setStamina()` before each attack roll, and refuses the attack instead if the player can't afford it — see [combat.md](combat.md) for the full turn-by-turn detail and the UI that disables the Attack button before that refusal is ever needed.

Unlike Food, stamina **is** restored by resting: both the Inn's "Rest for the Night" and the camp's "Rest Until Morning" call `setStamina(playerMaxStamina)` alongside the existing full heal. That's currently the *only* way stamina goes back up — there's no potion, no passive regen, and the Marketplace doesn't sell anything for it (contrast with Food, which is bought, never rested back).

## Health vs. Food vs. Stamina in combat

Combat (see [combat.md](combat.md)) touches `playerHealth` (the enemy's counter-attack, reduced by equipped defense) and `playerStamina` (the player's own attacks) — a bandit fight can knock you down to 10 HP on defeat and leave you too winded to keep swinging, but it never costs Food or gold beyond a victory reward. Equipment (above) affects how much damage each attack deals/takes, but never costs stamina itself — only the Attack action does.
