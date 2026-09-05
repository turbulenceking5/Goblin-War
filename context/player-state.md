# Player State

There is no player-state module — every page reads and writes the same `localStorage` keys directly, duplicating the constant names and default values. This file is the canonical list; if you rename or add a key, update it in every page listed under "used by".

## The keys

| Key | Meaning | Default | Used by |
|---|---|---|---|
| `goblinwar_characterName` | The active character's name, set once at creation and never changed | none — always set before index.html ever loads, see [characters.md](characters.md) | index.html, character.html, settings.html, characters.html |
| `goblinwar_health` | Current HP | = max health | index.html, character.html, settings.html |
| `goblinwar_maxHealth` | Max HP | `100` | index.html, character.html, settings.html |
| `goblinwar_stamina` | Current stamina — can briefly exceed `maxStamina` right after a Bedroll-assisted rest, see "Stamina: a combat-only resource" below | = max stamina | index.html, character.html, settings.html |
| `goblinwar_maxStamina` | Max stamina | `100` | index.html, character.html, settings.html |
| `goblinwar_hunger` | Current hunger, 0 (full) to 100 (starving) | `0` | index.html, inventory.html, settings.html |
| `goblinwar_thirst` | Current thirst, 0 (fine) to 100 (parched) | `0` | index.html, inventory.html, settings.html |
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
| `goblinwar_relations` | JSON object `{"KingdomA::KingdomB": "war"\|"peace"}` — sparse, pairwise, missing = peace (replaces the old per-kingdom `goblinwar_warState` flag) | `{}` | index.html only — see [factions-and-territory.md](factions-and-territory.md) |
| `goblinwar_reinforcements` | JSON object `{kingdomName: {amount, expiresDay, fromKingdom}}` — sparse, a temporary strength bonus from a Palace petition | `{}` | index.html only — see [factions-and-territory.md](factions-and-territory.md) |
| `goblinwar_lastWarTick` | `gameDay` the faction AI last ran | `0` | index.html only |
| `goblinwar_population` | JSON object `{burgId: population}` — sparse, in thousands (Azgaar's unit); missing = `graph.burgs[id].population` | `{}` | index.html only |
| `goblinwar_sieges` | JSON object `{burgId: {attackerKingdom, defenderKingdom, startedDay, progress}}` — sparse, at most one active siege per settlement | `{}` | index.html only — see [factions-and-territory.md](factions-and-territory.md) |
| `goblinwar_refugeeArrivals` | JSON object `{burgId: gameDay}` — sparse, last day a settlement took in war refugees; drives the Aid the Refugees action | `{}` | index.html only |
| `goblinwar_siegeDefenseCooldowns` | JSON object `{burgId: gameDay}` — sparse, once-per-day gate on the Defend the Walls action | `{}` | index.html only |

The last four are world state, not player state in the usual sense, but they're still part of every character's save (see [characters.md](characters.md)) — each character runs its own independent copy of the world's faction/war state. They aren't read by character.html/inventory.html/settings.html's UI at all, only carried along by settings.html's Save Now and index.html's autosave so they survive alongside everything else. Full mechanics in [factions-and-territory.md](factions-and-territory.md).

There's no `goblinwar_slot_1/2/3` anymore — the three local save slots were replaced by one save per character, held in Supabase rather than `localStorage`. See [characters.md](characters.md).

Stamina is scoped only to combat — see "Stamina: a combat-only resource" below. It has nothing to do with travel, which is paced by Hunger and Thirst instead (see "Hunger & Thirst" below) — Food and Waterskin no longer touch Stamina at all. A returning save from before Food existed won't have a `"Food"` entry in its inventory, but that's not a soft-lock: entering a settlement you're already standing in never costs anything, so the player can always reach a Marketplace to buy some. Likewise, a save from before stamina, or Hunger/Thirst, existed gets `100`/`100` or `0`/`0` seeded in by `initPlayerStateIfMissing()` the next time index.html loads.

`DEFAULT_INVENTORY` is:
```js
[
  { name:"Food", qty:10, weight:1, value:2 },
  { name:"Waterskin", qty:1, weight:2, value:3 },
  { name:"Bedroll", qty:1, weight:3, value:5 },
]
```

`weight` is per single unit — a stack's total contribution to carried weight is `weight * qty` (see "Carry weight" below). `value` is per single unit, gold, shown in inventory.html as "Ng each" — it's the base the Marketplace's `getBuyPrice`/`getSellPrice` (see [factions-and-territory.md](factions-and-territory.md)) scale from, not just decorative (Bedroll's `value` was raised to `45` to match its new Marketplace price, below). Food and Waterskin are the game's two real consumables — inventory.html's **Eat**/**Drink** buttons fight Hunger/Thirst respectively (see "Hunger & Thirst" below), never Stamina. Bedroll is a passive possession with two effects just from being carried, never consumed: safer camping (`BEDROLL_AMBUSH_MULT`) and a Stamina bonus after resting (`BEDROLL_STAMINA_BONUS`, see "Stamina: a combat-only resource" below) — both in index.html. Bedroll is deliberately priced well above everything else in `MARKET_ITEMS` (`45`g, vs. `25`g for the next most expensive item) since it's a one-time purchase rather than an ongoing cost like Food/Waterskin. Everything else the Marketplace sells (see [locations-and-camp.md](locations-and-camp.md)) is either equippable (see "Equipment" below) or, like Healing Potion/Books/Firewood, still just sits in the bag.

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
| Field Rations | Int 4 | -10% Hunger/Thirst gained while traveling or waiting (was -10% Food cost, before Hunger & Thirst replaced it) | `hoursToHungerGain()`/`hoursToThirstGain()` |

A skill point can also unlock an active special attack instead of a perk — same `goblinwar_skills` storage, same stat-threshold gating, but usable in combat rather than always-on. index.html's `MOVES` array is the source of truth; skills.html's Special Attacks card (duplicated `MOVES`, per the no-modules convention) is the only place to unlock one. In combat, a "Specials" button (`#combat-special-btn`) toggles `#combat-specials-panel`, which lists whichever moves are unlocked; `combatSpecial(moveId)` (index.html) runs the effect. Each move costs more stamina than a plain Attack and is usable once per fight — tracked in `combat.usedMoves`, reset whenever `startCombat` runs:

| Move | Stat req | Stamina cost | Effect |
|---|---|---|---|
| Crushing Blow | Str 2 | 35 | 2x damage, single hit |
| Reckless Swing | Str 4 | 30 | 2.5x damage, but the enemy's counter that turn ignores both armor and Evasion |
| Precise Shot | Agi 2 | 25 | Always rolls maximum damage instead of random (the game has no miss chance to guarantee against, so this is the meaningful equivalent) |
| Adrenaline Rush | Agi 4 | 15 | A free extra attack this turn, no stamina cost |
| War Cry | Int 2 | 20 | Cuts every alive enemy's damage 30% for the rest of the fight; deals no damage itself |
| Cleave | Str 6 | 40 | Hits every alive enemy in the fight for 60% damage each — see [combat.md](combat.md)'s "Multi-enemy encounters" for how raiding-party fights (2-3 enemies) work |

This resolved the naming collision noted in an earlier pass of [roadmap.md](roadmap.md): the active move is called **Crushing Blow**, kept distinct from the passive **Power Strike** perk (+2 flat damage, always on) above.

## Initialization

Only index.html calls `initPlayerStateIfMissing()` on load, which seeds every key above (except `goblinwar_characterName`, which characters.html always sets before index.html can load at all — see [characters.md](characters.md)) with its default *if and only if that key doesn't already exist*. In practice this rarely does anything now, since characters.html's create/play flow already writes every one of these keys explicitly — it exists mainly as a defensive fallback for a key added after some characters already have a save that predates it, same reasoning as the old save-slot system's guarded loads used to have. character.html, inventory.html, and settings.html never write defaults — they read with a `|| "fallback"` inline instead (e.g. `localStorage.getItem(HEALTH_KEY) || "100"`), which means if you ever open one of those pages before index.html has run once, the fallback is only a *display* value — it never gets persisted.

## Mutators (index.html only)

`setHealth(v)`, `setStamina(v)`, and `setGold(v)` clamp to a valid range (`0..max` for health/stamina, `0..∞` for gold), persist to `localStorage`, and call `refreshPlayerStatUI()`. Inventory has its own pair instead of a single setter, because items are a list, not a scalar:

- `addItem(name, qty, weightEach, valueEach)` — creates the stack (or adds to an existing one), *unless* doing so would push total carried weight over `getCarryCapacity()` (see "Carry weight" below), in which case it changes nothing and returns `false`. Every call site (the Marketplace, see [locations-and-camp.md](locations-and-camp.md); and combat loot rolls, see [combat.md](combat.md)'s "Loot drops") must check that return value. `valueEach` is stored on the item purely for display (see `value` above) — it plays no part in the weight check.
- `consumeItem(name, qty)` — subtracts, clamped at 0, and drops the stack entirely once it hits empty. Used by inventory.html's Eat/Drink buttons (Food/Waterskin, one at a time) — travel no longer consumes any item directly, see "Hunger & Thirst" below.
- `getItem(name)`, `getFoodQty()`, `getCarriedWeight()` — read-only helpers built on the same in-memory `playerInventory` array, which both mutators keep in sync with `localStorage` via `saveInventory()`.

There's no `setAge` — age is set once at new-game and never changes.

## Hunger & Thirst: the travel resources

Replaces the older single-Food-cost-per-trip model. Travel, waiting (see [travel-and-map.md](travel-and-map.md)), and combat all raise these two 0-100 meters instead of spending Food/Waterskin items directly — the player has to proactively eat/drink (inventory.html's Eat/Drink buttons, or a Pub's Meal & Drink, see [locations-and-camp.md](locations-and-camp.md)) to bring them back down. There is **no affordability gate anymore** — travel and waiting are never blocked by how much Food/Waterskin you're carrying, unlike the old Food system. The trade-off: letting either meter reach 100 doesn't just sit there looking bad.

- `addHunger(amount)`/`addThirst(amount)` (index.html) are the only mutators — shared by every source that changes either meter, positive (travel, waiting, combat) or negative (eating/drinking, a Pub meal). Each clamps its meter to `[0,100]` and persists, then — only when the *raw*, pre-clamp total would have exceeded 100 — converts the excess into real Health damage via `setHealth()`, floored at `STARVATION_HEALTH_FLOOR` (`1`) so hunger/thirst alone can never be fatal on their own; combat is still the only way to actually reach 0 HP. Thirst's overflow multiplier (`THIRST_OVERFLOW_HEALTH_MULT`, `0.8`) is harsher than Hunger's (`HUNGER_OVERFLOW_HEALTH_MULT`, `0.5`) — dehydration is the more urgent threat.
- `hoursToHungerGain(hours)`/`hoursToThirstGain(hours)` (index.html, near `computeTravel`) derive how much a given trip or wait duration raises each meter — `HUNGER_PER_DAY` (20) and `THIRST_PER_DAY` (25, rising faster) per full day, each with a `Math.max(2, ...)` floor so even the shortest hop bumps both a little, and both discounted 10% by the Field Rations perk (see "Leveling & stats" above).
- Combat raises both by a flat amount regardless of outcome (`COMBAT_HUNGER_GAIN` 8, `COMBAT_THIRST_GAIN` 10, applied in `endCombat` right after `combat = null`) — victory, defeat, or fleeing are all real exertion.
- **Eating/drinking is inventory.html's job, not index.html's.** Food's row grows an **Eat** button (`FOOD_HUNGER_RESTORE`, 35), Waterskin's grows a **Drink** button (`WATERSKIN_THIRST_RESTORE`, 35) — both disabled once the relevant meter is already at 0. inventory.html duplicates its own simpler `setHunger`/`setThirst` (no overflow-to-Health logic — this page only ever *reduces* either meter, so the "exceeds 100" case never applies here) alongside `playerHunger`/`playerThirst`, reading/writing the same keys index.html owns so a meal taken here reflects back on the map immediately. Two `.meter-card`s above the item list (styled like the existing Carried Weight card) show current/max so the player can judge whether it's worth eating before opening a row.
- The Marketplace continues to sell both Food and Waterskin (`getBuyPrice`/`getSellPrice`, see [factions-and-territory.md](factions-and-territory.md)) — buying/selling itself didn't change, only what the items *do* once eaten/drunk.

## Carry weight

`CARRY_CAPACITY` (`40`) is the base value; `getCarryCapacity()` adds +10 on top of it if the Pack Mule perk is unlocked (see "Leveling & stats" above) — every read site (index.html's `addItem` check and Marketplace display, plus character.html's and inventory.html's own weight displays, each with their own duplicated copy of the function) goes through `getCarryCapacity()`, never the raw constant. `getCarriedWeight()` sums `weight * qty` across every item in the inventory array; `addItem` is the only enforcement point — buying more Food than you have room for fails with a toast rather than partially succeeding. There's no weight penalty to travel speed or anything else — exceeding capacity currently can't happen at all, since the only way to add weight (buying Food) is blocked at the limit.

## Stamina: a combat-only resource

Stamina is spent by attacking in combat and nothing else — travel, camping, and the Marketplace never touch it (that's Hunger/Thirst's job, above, and neither Food nor Waterskin restores Stamina at all anymore). `combatAttack()` deducts `STAMINA_COST_PER_ATTACK` (20, defined in index.html near the combat code) via `setStamina()` before each attack roll, and refuses the attack instead if the player can't afford it — see [combat.md](combat.md) for the full turn-by-turn detail and the UI that disables the Attack button before that refusal is ever needed.

Stamina **is** restored by resting: both the Inn's "Rest for the Night" and the camp's rest action call a shared `restFully()` (index.html, alongside `setHealth`/`setStamina`) that fully heals Health, and fills Stamina to `playerMaxStamina` — or a little **more** than max if a Bedroll is carried (`BEDROLL_STAMINA_BONUS`, `15`). `restFully()` deliberately bypasses `setStamina()`'s own clamp for that one write, so `playerStamina` genuinely sits above `playerMaxStamina` right after a Bedroll-assisted rest (visible in the header as e.g. `115/100`) rather than being silently clipped back to normal — it then erodes back down as Stamina is spent in combat via the ordinary `setStamina(playerStamina - cost)` calls, which never raise the value back up. That's still the *only* way stamina goes up at all — no potion, no passive regen.

## Health vs. Hunger/Thirst vs. Stamina in combat

Combat (see [combat.md](combat.md)) touches `playerHealth` (the enemy's counter-attack, reduced by equipped defense) and `playerStamina` (the player's own attacks) — a bandit fight can knock you down to 10 HP on defeat and leave you too winded to keep swinging, but it never costs gold beyond a victory reward. It does, however, raise Hunger and Thirst by a flat amount regardless of outcome (see "Hunger & Thirst" above) — fighting is real exertion. Equipment (above) affects how much damage each attack deals/takes, but never costs stamina itself — only the Attack action does.
