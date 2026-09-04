# Player State

There is no player-state module — every page reads and writes the same `localStorage` keys directly, duplicating the constant names and default values. This file is the canonical list; if you rename or add a key, update it in every page listed under "used by".

## The keys

| Key | Meaning | Default | Used by |
|---|---|---|---|
| `goblinwar_characterName` | The active character's name, set once at creation and never changed | none — always set before index.html ever loads, see [characters.md](characters.md) | index.html, character.html, settings.html, characters.html |
| `goblinwar_health` | Current HP | = max health | index.html, character.html, settings.html |
| `goblinwar_maxHealth` | Max HP | `100` | index.html, character.html, settings.html |
| `goblinwar_stamina` | Current stamina | = max stamina | index.html, character.html, settings.html |
| `goblinwar_maxStamina` | Max stamina | `100` | index.html, character.html, settings.html |
| `goblinwar_age` | Hero's age (string) | `"24"` | character.html, settings.html |
| `goblinwar_gold` | Gold carried | `50` | index.html, character.html, inventory.html, settings.html |
| `goblinwar_inventory` | JSON array of `{name, qty, weight}` | see `DEFAULT_INVENTORY` below | index.html, character.html, inventory.html, settings.html |
| `goblinwar_equipped` | JSON object `{slot: itemName \| null}` | `{}` | index.html, character.html, inventory.html, settings.html |
| `goblinwar_level` | Character level | `1` | index.html, character.html |
| `goblinwar_xp` | XP progress toward the *next* level (not cumulative) | `0` | index.html, character.html |
| `goblinwar_skillPoints` | Unspent skill points | `0` | index.html, character.html |
| `goblinwar_stats` | JSON object `{str, agi, int}` | `{str:0,agi:0,int:0}` | index.html (persists only), character.html |
| `goblinwar_skills` | JSON object `{skillId: true}` — unlocked perks/moves | `{}` | index.html (persists only) — nothing reads it yet, see below |
| `goblinwar_quests` | JSON array of accepted quests | `[]` | index.html only — see [quests.md](quests.md) |
| `goblinwar_currentBurg` | Burg id (string) of last-arrived settlement | `"5"` (Bary) | index.html, character.html, settings.html |
| `goblinwar_gameDay` | Flat day counter | `0` | index.html, character.html, settings.html |
| `goblinwar_heading` | Marker facing, degrees (0=north) | `0` | index.html, settings.html |
| `goblinwar_territoryControl` | JSON object `{burgId: kingdomName}` — sparse, only conquered settlements (older saves may hold a bare race string instead — see [factions-and-territory.md](factions-and-territory.md)) | `{}` | index.html only |
| `goblinwar_warState` | JSON object `{kingdomName: "war"\|"peace"}` — sparse, missing = peace | `{}` | index.html only |
| `goblinwar_reinforcements` | JSON object `{kingdomName: {amount, expiresDay, fromKingdom}}` — sparse, a temporary strength bonus from a Palace petition | `{}` | index.html only — see [factions-and-territory.md](factions-and-territory.md) |
| `goblinwar_lastWarTick` | `gameDay` the faction AI last ran | `0` | index.html only |
| `goblinwar_population` | JSON object `{burgId: population}` — sparse, in thousands (Azgaar's unit); missing = `graph.burgs[id].population` | `{}` | index.html only |

The last four are world state, not player state in the usual sense, but they're still part of every character's save (see [characters.md](characters.md)) — each character runs its own independent copy of the world's faction/war state. They aren't read by character.html/inventory.html/settings.html's UI at all, only carried along by settings.html's Save Now and index.html's autosave so they survive alongside everything else. Full mechanics in [factions-and-territory.md](factions-and-territory.md).

There's no `goblinwar_slot_1/2/3` anymore — the three local save slots were replaced by one save per character, held in Supabase rather than `localStorage`. See [characters.md](characters.md).

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

## Leveling & stats

Both the core loop and every perk/special-attack's mechanical effect are real and wired in — see [roadmap.md](roadmap.md) for what's still not built on top of this (multi-enemy encounters, mainly). `addXp(amount)` (index.html) is called from `endCombat('victory')` with a per-`ENEMY_VARIANTS`-variant `xpRange` roll (same pattern as `goldRange`, see [combat.md](combat.md)). `xpForLevel(level)` (`Math.round(40 * level^1.5)`) is the XP needed to clear the *current* level, not a cumulative total — `goblinwar_xp` resets (carrying any overshoot) on level-up, which can loop more than once if a single reward clears multiple thresholds. Each level-up grants 1 skill point and a flat `+8 maxHealth`/`+4 maxStamina` (current health/stamina rise by the same amount, not fully refilled), so leveling feels good before any point is spent.

[skills.html](secondary-pages.md) is the only place to spend a skill point — either a "+" button next to Strength/Agility/Intelligence in `goblinwar_stats`, or an Unlock button on one of the 9 perks in `goblinwar_skills` (`{skillId: true}`), gated on that perk's stat threshold (see index.html's `PERKS` array, duplicated in skills.html per the no-modules convention — this used to live on character.html, moved out to its own toolbar tab at the project owner's request so the two screens don't compete for space, see [secondary-pages.md](secondary-pages.md)). Both cost 1 skill point; a perk can't be re-locked once unlocked. The perks' actual mechanical effects live entirely in index.html (`hasPerk(id)` checked wherever relevant):

| Perk | Stat req | Effect | Where it's checked |
|---|---|---|---|
| Power Strike | Str 2 | +2 flat damage on attack | `getEquipDamageBonus()` |
| Iron Skin | Str 2 | -1 flat damage taken | `getEquipDefenseBonus()` |
| Pack Mule | Str 4 | +10 carry capacity | `getCarryCapacity()` (replaces the flat `CARRY_CAPACITY` constant everywhere it was read — index.html, character.html, inventory.html) |
| Evasion | Agi 2 | 15% chance to fully dodge the enemy's counter-attack | `combatAttack()` |
| Second Wind | Agi 2 | 25% chance an attack costs no stamina | `combatAttack()` |
| Sure Feet | Agi 4 | -10% ambush chance (relative) | `rollAmbush()` and the camp's night-ambush roll |
| Silver Tongue | Int 2 | -10% Marketplace buy prices | `getBuyPrice()` |
| Scavenger | Int 2 | +20% gold from combat victories | `endCombat('victory')` |
| Field Rations | Int 4 | -10% Food cost while traveling | `hoursToFoodCost()` |

A skill point can also unlock an active special attack instead of a perk — same `goblinwar_skills` storage, same stat-threshold gating, but usable in combat rather than always-on. index.html's `MOVES` array is the source of truth; skills.html's Special Attacks card (duplicated `MOVES`, per the no-modules convention) is the only place to unlock one. In combat, a "Specials" button (`#combat-special-btn`) toggles `#combat-specials-panel`, which lists whichever moves are unlocked; `combatSpecial(moveId)` (index.html) runs the effect. Each move costs more stamina than a plain Attack and is usable once per fight — tracked in `combat.usedMoves`, reset whenever `startCombat` runs:

| Move | Stat req | Stamina cost | Effect |
|---|---|---|---|
| Crushing Blow | Str 2 | 35 | 2x damage, single hit |
| Reckless Swing | Str 4 | 30 | 2.5x damage, but the enemy's counter that turn ignores both armor and Evasion |
| Precise Shot | Agi 2 | 25 | Always rolls maximum damage instead of random (the game has no miss chance to guarantee against, so this is the meaningful equivalent) |
| Adrenaline Rush | Agi 4 | 15 | A free extra attack this turn, no stamina cost |
| War Cry | Int 2 | 20 | Cuts the enemy's damage 30% for the rest of the fight; deals no damage itself |
| Cleave | Str 6 | 40 | Hits every enemy for 60% damage — written as a loop so it's ready for multi-enemy fights (see [roadmap.md](roadmap.md)), but today there's always exactly one enemy, so it plays like a single reduced-damage hit |

This resolved the naming collision noted in an earlier pass of [roadmap.md](roadmap.md): the active move is called **Crushing Blow**, kept distinct from the passive **Power Strike** perk (+2 flat damage, always on) above.

## Initialization

Only index.html calls `initPlayerStateIfMissing()` on load, which seeds every key above (except `goblinwar_characterName`, which characters.html always sets before index.html can load at all — see [characters.md](characters.md)) with its default *if and only if that key doesn't already exist*. In practice this rarely does anything now, since characters.html's create/play flow already writes every one of these keys explicitly — it exists mainly as a defensive fallback for a key added after some characters already have a save that predates it, same reasoning as the old save-slot system's guarded loads used to have. character.html, inventory.html, and settings.html never write defaults — they read with a `|| "fallback"` inline instead (e.g. `localStorage.getItem(HEALTH_KEY) || "100"`), which means if you ever open one of those pages before index.html has run once, the fallback is only a *display* value — it never gets persisted.

## Mutators (index.html only)

`setHealth(v)`, `setStamina(v)`, and `setGold(v)` clamp to a valid range (`0..max` for health/stamina, `0..∞` for gold), persist to `localStorage`, and call `refreshPlayerStatUI()`. Inventory has its own pair instead of a single setter, because items are a list, not a scalar:

- `addItem(name, qty, weightEach, valueEach)` — creates the stack (or adds to an existing one), *unless* doing so would push total carried weight over `getCarryCapacity()` (see "Carry weight" below), in which case it changes nothing and returns `false`. Every call site (currently just the Marketplace, see [locations-and-camp.md](locations-and-camp.md)) must check that return value. `valueEach` is stored on the item purely for display (see `value` above) — it plays no part in the weight check.
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

`CARRY_CAPACITY` (`40`) is the base value; `getCarryCapacity()` adds +10 on top of it if the Pack Mule perk is unlocked (see "Leveling & stats" above) — every read site (index.html's `addItem` check and Marketplace display, plus character.html's and inventory.html's own weight displays, each with their own duplicated copy of the function) goes through `getCarryCapacity()`, never the raw constant. `getCarriedWeight()` sums `weight * qty` across every item in the inventory array; `addItem` is the only enforcement point — buying more Food than you have room for fails with a toast rather than partially succeeding. There's no weight penalty to travel speed or anything else — exceeding capacity currently can't happen at all, since the only way to add weight (buying Food) is blocked at the limit.

## Stamina: a combat-only resource

Stamina is spent by attacking in combat and nothing else — travel, camping, and the Marketplace never touch it (that's Food's job, above). `combatAttack()` deducts `STAMINA_COST_PER_ATTACK` (20, defined in index.html near the combat code) via `setStamina()` before each attack roll, and refuses the attack instead if the player can't afford it — see [combat.md](combat.md) for the full turn-by-turn detail and the UI that disables the Attack button before that refusal is ever needed.

Unlike Food, stamina **is** restored by resting: both the Inn's "Rest for the Night" and the camp's "Rest Until Morning" call `setStamina(playerMaxStamina)` alongside the existing full heal. That's currently the *only* way stamina goes back up — there's no potion, no passive regen, and the Marketplace doesn't sell anything for it (contrast with Food, which is bought, never rested back).

## Health vs. Food vs. Stamina in combat

Combat (see [combat.md](combat.md)) touches `playerHealth` (the enemy's counter-attack, reduced by equipped defense) and `playerStamina` (the player's own attacks) — a bandit fight can knock you down to 10 HP on defeat and leave you too winded to keep swinging, but it never costs Food or gold beyond a victory reward. Equipment (above) affects how much damage each attack deals/takes, but never costs stamina itself — only the Attack action does.
