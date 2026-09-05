# Combat (index.html)

A minimal turn-based fight system with three enemy races — Bandit, Goblin, and Ork — each with several real-art *variants* rather than one look apiece. Lives entirely in index.html — there's no separate combat page, it's an overlay (`#combat-view`, z-index 70) drawn on top of whatever screen was showing. Fights can have 1-3 enemies at once (see "Multi-enemy encounters" below).

## Starting a fight

`startCombat(enemySpecs, playerDmgRange, onEnd, race)` is the low-level entry point everything else wraps. `enemySpecs` is an array of `{name, hp, dmgRange, goldRange, xpRange, art}` — one entry per enemy in the fight. `combat` (the single module-level fight-state object — the game only ever supports one fight at a time, no queue or nesting) becomes:
```js
{
  enemies: [{name, hp, maxHp, dmgRange, goldRange, xpRange, art}, ...], // one per enemy, hp mutates as the fight goes
  targetIndex, // index into enemies — which one Attack/Specials currently hit
  playerDmgRange, onEnd, usedMoves, race
}
```
Each enemy's `dmgRange` is copied (`.slice()`) off its `ENEMY_VARIANTS` entry rather than shared by reference, since War Cry (see "Turn loop" below) mutates it in place per-enemy.

- `triggerEnemyFight(race, onEnd)` — picks 1-3 random entries from `ENEMY_VARIANTS[race]` (see below) and starts a fight with them. Bandit ambushes are always solo; Goblin/Ork raiding-party ambushes are 2-3 enemies (see "Multi-enemy encounters" below).
- `triggerAmbushFight(burgId, onEnd, context)` — the one the two ambush call sites below actually use. Picks which race ambushes (`pickAmbushEnemy`, see "Which race shows up" below), shows a toast worded for `context` (`'road'` vs `'camp'`), and calls `triggerEnemyFight`.
- `triggerSiegeDefenseFight(burgId, onEnd)` (see [factions-and-territory.md](factions-and-territory.md)'s "Player involvement") — a non-ambush call site, "Defend the Walls" at a besieged settlement. It calls `startCombat` directly rather than going through `triggerEnemyFight`/`pickAmbushEnemy` (siege attackers are always 2-3 of the attacking kingdom's own race, never a Bandit), then overwrites `startCombat`'s own ambush-flavored `#combat-title`/`#combat-log` strings with siege-appropriate text right after the call — proof `startCombat` itself has no ambush-specific coupling beyond those two hardcoded strings.

`PLAYER_DMG_RANGE` (`[8,15]`) is a single shared constant — the player's own weapon damage never changes based on who they're fighting; only the *enemy's* side (`dmgRange`, `hp`, `goldRange`) scales with difficulty. (Earlier code had this backwards — two hardcoded fight-starting calls passed their difficulty numbers into the *player's* damage slot instead of the enemy's, so fighting an Ork Raider let the player hit harder than fighting a Bandit while the enemy's own damage output stayed flat. Fixed when `ENEMY_VARIANTS` was introduced.)

Each enemy's own `goldRange`/`xpRange` is what `endCombat` sums from on victory (see "Ending a fight" below) — so a harder fight (bigger enemies, or more of them) visibly looks harder and pays out more.

## Multi-enemy encounters

Goblin/Ork raiding-party ambushes spawn 2-3 enemies at once (`triggerEnemyFight`'s `count`), each an independently-rolled variant from that race's `ENEMY_VARIANTS` array (repeats allowed) — this is also what finally makes `triggerAmbushFight`'s "Ork raiders"/"Goblin raiders" toast wording (plural) accurate; it always was written that way even when only one enemy ever spawned. Bandit ambushes stay solo, preserving the documented "easiest fight in the game" balance.

**Targeting**: `#combat-enemies` holds one clickable `.combat-enemy-slot` per enemy (portrait, name, HP bar), rebuilt by `renderEnemies()` on every `updateCombatUI()` call — same full-rebuild-and-rebind pattern `renderSpecialsPanel` already used before this existed. Clicking an alive slot sets `combat.targetIndex`; a `.dead` slot (via CSS `pointer-events:none` and a guard in the click handler) can't be selected. If the currently-targeted enemy dies, `autoAdvanceTarget()` retargets to the next alive enemy automatically so Attack/Specials always have a valid target without forcing a re-click. A solo Bandit fight's single slot gets no selection ring (`:only-child` CSS) and keeps the old, larger portrait size — visually unchanged from before multi-enemy existed.

These are deliberate balance decisions made when this shipped, not incidental to the refactor:
- **Every alive enemy counters every round** (`runEnemyCounters`), not just the targeted one — this is the actual difficulty lever that makes a 3-enemy raid feel harder than a 1-enemy Bandit fight, not just longer. Evasion (15% dodge) and defense reduction still roll independently per incoming hit.
- **Cleave and War Cry act on every alive enemy**, not just the target — see "Turn loop" below. This is what those two moves were originally written to do (Cleave's code carried an aspirational "loops over every enemy" comment for a while before this actually existed).
- **Reckless Swing's ignore-armor/Evasion counter is scoped to only the one enemy it targeted** — every other alive enemy still counters normally (armor/Evasion apply) that round. This was a deliberate choice to keep the move usable instead of a trap: stacked with "every enemy counters," an ignore-armor hit from every enemy at once would make the move actively dangerous to use.

## Enemy variants and their art

`ENEMY_VARIANTS` (index.html) is `{ race: [{name, hp, enemyDmgRange, goldRange, art}, ...] }`. Real portraits live in `assets/enemies/*.png` (transparent background, downscaled to a 600px longest edge — see `#combat-enemy-icon img`'s `max-width:190px`/`max-height:210px` for how they're actually displayed). Currently:

- **Bandit** (1 variant so far): Bandit (30 HP, hooded human archer, hits for 5–12 — the easiest fight in the game).
- **Goblin** (4 variants): Goblin Raider (35 HP, spear+sword, the baseline), Goblin Shieldbearer (45 HP, spear+shield — tankiest goblin, hits softest at 6–12), Goblin Skirmisher (30 HP, dual curved blades — squishiest melee goblin but hits hardest at 9–16, best goblin payout), Goblin Archer (25 HP, bow — lowest HP, moderate 7–13 damage, lowest goblin payout).
- **Ork** (3 variants): Ork Raider (55 HP, dual axe/cleaver, hits for 11–20 — the original baseline), Ork Berserker (45 HP, bare-chested dual hand-axes, no armor — squishiest ork but hits just as hard as a Raider at 12–22), Ork Warlord (70 HP, heavily armored with bone trophies and a single heavy cleaver, hits for 13–22 — the toughest fight in the game, best payout).

A race with only one variant so far (Bandit) picks that same variant every time — nothing special about it, `triggerEnemyFight` just has a one-element array to choose from. Adding another variant to any race is one more array entry plus its PNG in `assets/enemies/` — `triggerEnemyFight` already picks uniformly at random from whatever's in the list, no other code changes. A whole new race (Dwarf, if it ever becomes an ambusher) means giving `ENEMY_VARIANTS` a new key and teaching `pickAmbushEnemy` to return it for the right settlements.

## Which race shows up

`pickAmbushEnemy(burgId)` is what actually decides Bandit vs. Goblin vs. Ork for a given ambush (variant selection within a race happens afterward, inside `triggerEnemyFight`): if `burgId`'s original kingdom is Good-alliance (human/dwarf — see [factions-and-territory.md](factions-and-territory.md)) *and* that kingdom is currently at war, there's a `RAID_AMBUSH_CHANCE` (50%) chance of a themed raiding party (coin-flip between goblin/ork) instead of a plain Bandit. A Bad-alliance settlement (ork/goblin territory) never spawns a themed raid, at war or not — the game doesn't cast Human/Dwarf as ambush enemies, so an ambush there is always just a Bandit. This is the direct payoff of the faction AI system: fighting through a warzone now actually feels different from a peaceful road.

## Turn loop

- **Attack** (`combatAttack`): costs `STAMINA_COST_PER_ATTACK` (20) stamina, spent via `setStamina(playerStamina - STAMINA_COST_PER_ATTACK)` before the damage roll — unless the Second Wind perk's 25% roll waives it that turn (see [player-state.md](player-state.md)'s perk table). If `playerStamina` is below the full cost, the attack refuses instead — logs "You're too exhausted to attack — flee and rest up first." and does nothing else; `updateCombatUI()` also disables the Attack button proactively whenever stamina is too low, so this refusal path is a fallback guard rather than the normal way players find out. Otherwise: roll player damage (`randRange(playerDmgRange) + getEquipDamageBonus()`, see [player-state.md](player-state.md) for what's equippable and which perk adds a flat bonus here), apply to `combat.enemies[combat.targetIndex].hp` (the currently-targeted enemy — see "Multi-enemy encounters" above). If every enemy is now dead (`aliveEnemies().length === 0`), `endCombat('victory')` fires immediately — enemies don't get a last hit in. Otherwise `autoAdvanceTarget()` runs (retargets off a just-killed enemy) and `runEnemyCounters(null)` resolves every alive enemy's counter-hit for the round: each rolls `Math.max(1, roll - getEquipDefenseBonus())` against `playerHealth` via `setHealth()` — armor/shield reduce the hit but can never make an attack deal zero — unless that enemy's own Evasion-perk 15% roll dodges it entirely first, independently per enemy. If the player is at 0 or below after the round, `endCombat('defeat')`.
- **Specials** (`combatSpecial`, `#combat-special-btn` toggles `#combat-specials-panel`): a third action alongside Attack/Flee, listing whichever of the 6 `MOVES` the player has unlocked with a skill point (skills.html's Special Attacks card — see [player-state.md](player-state.md) for the full table and stamina costs). Each move is usable once per fight (`combat.usedMoves`, reset in `startCombat`) and cannot be re-enabled by resting mid-fight. `crushing_blow`/`precise_shot`/`adrenaline_rush` are single-target damage variants of Attack, hitting `combat.enemies[combat.targetIndex]`, then running `runEnemyCounters(null)` same as Attack. `reckless_swing` deals 2.5x single-target damage; its counter-hit ignores armor/Evasion, but only for the enemy it targeted (`runEnemyCounters(target)`) — every other alive enemy still counters normally that round, a deliberate scoping decision (see "Multi-enemy encounters" above). `war_cry` deals no damage, instead permanently reshaping every *alive* enemy's `dmgRange` downward by 30% for the rest of the fight. `cleave` loops over every alive enemy, dealing 60% damage to each — this is what its code originally claimed to do before multi-enemy fights existed to loop over.
- **Flee** (`combatFlee`): always succeeds, no roll, no stamina cost — logs a line and calls `endCombat('flee')`, regardless of how many enemies are still alive. There's no "the enemies get a free hit as you flee" penalty currently. Because Flee is free, running out of stamina mid-fight can't soft-lock a player — they can always break off and go rest, same philosophy behind travel never being blockable on Hunger/Thirst either (see [player-state.md](player-state.md)).
- `combatLog(msg)` appends a line to the scrolling `#combat-log` div (auto-scrolls to bottom).

## Stamina

Stamina (`playerStamina`/`playerMaxStamina`, see [player-state.md](player-state.md)) is spent only by attacking — nothing else in the game touches it, and enemy counter-attacks never cost the player stamina, only health. The combat overlay shows a third bar (`#combat-player-stamina-bar`/`-text`, styled `.combat-bar-fill.stamina`) below the per-enemy HP bars (`#combat-enemies`) and player HP bar, refreshed by `updateCombatUI()` on every turn. `updateCombatUI()` also toggles `#combat-attack-btn`'s `disabled` attribute directly (`playerStamina < STAMINA_COST_PER_ATTACK`) so the button greys out and stops accepting clicks before a player can even try an attack they can't afford — the in-`combatAttack` refusal above only fires if something bypasses that (there's no other call site right now).

The only way stamina goes back up is resting — `restFully()`, called from both the Inn's rest button and the camp's rest button, alongside the existing full heal (see [locations-and-camp.md](locations-and-camp.md) and [player-state.md](player-state.md)'s Stamina section for the Bedroll overcap bonus it can also grant). There's no partial recovery anywhere else; a long run of fights without resting will eventually strand the player at low stamina, forced to flee until they can reach an Inn or make camp.

## Ending a fight

`endCombat(result)` hides `#combat-view`, shows one toast, and calls the stored `onEnd(result)` — with a short delay (700ms) only for victory/defeat, so the last HP-bar update is visible before the overlay closes; flee closes instantly. The whole `combat.enemies` array (not just one enemy's numbers) is captured into a local before `combat` is nulled, same re-entrancy-guard reasoning as before multi-enemy existed. Right after `combat` is nulled, `endCombat` also calls `addHunger(COMBAT_HUNGER_GAIN)`/`addThirst(COMBAT_THIRST_GAIN)` (8/10 flat) unconditionally — victory, defeat, and flee alike all raise both meters, since a fight is exertion regardless of how it ends. See [player-state.md](player-state.md)'s Hunger & Thirst section for the meters themselves and what happens if either overflows.

- `victory` → a `randRange` gold and XP roll from *each* defeated enemy's own `goldRange`/`xpRange`, summed across the whole encounter (so a 3-enemy raid pays out roughly 3x a solo fight of similar enemies, not a flat per-fight amount), Scavenger's +20% applied to the gold total, toast "Victory! You defeated ..." naming every enemy type defeated (grouped by name — e.g. "2x Goblin Raider, 1x Goblin Archer" — via a small name→count tally, not one line per enemy). Also checks for an active "Kill Bandits" quest if `combat.race === 'bandit'` (`race` is threaded through `startCombat`/`triggerEnemyFight` for exactly this, and stays a single value for the whole encounter regardless of enemy count) and folds its payout into the same toast — see [quests.md](quests.md).
- `defeat` → `setHealth(10)` (never actually kills the player — this is the game's only failure-recovery mechanic right now), toast about barely escaping.
- `flee` → no state change beyond whatever happened during the rounds already fought, toast "You flee from the fight."

## Loot drops

Each defeated enemy independently rolls `LOOT_CHANCE` (25%, per-enemy not per-fight — so a 3-enemy raid gets three rolls, not one bigger one) for whether it drops anything, via `rollLoot(race)`. On a hit, a weighted pick from that race's `LOOT_TABLES` entry (a small array of `{name, weight}`, one set per race with a race-flavored mix of consumables/gear) decides which single item — items are referenced by name off the existing `MARKET_ITEMS` array (see "Adding a new enemy variant or race" below for the parallel with `ENEMY_VARIANTS`) rather than duplicating weight/price data. This is the first weighted-random construct in the codebase; every other random pick elsewhere is uniform.

The pick is added via the same `addItem(name, qty, weightEach, valueEach)` the Marketplace uses (see [player-state.md](player-state.md)) — if it would push the player over `getCarryCapacity()`, `addItem` refuses and the item is listed in the victory toast as "too heavy to carry, left behind" instead of silently vanishing. `endCombat`'s loot rolls happen inside the same per-enemy loop that sums gold/XP, using `combat.race` (one race for the whole encounter, unchanged from before multi-enemy existed) for every roll regardless of which specific enemy variant died.

`LOOT_CHANCE`/`LOOT_TABLES` are a first-pass balance point, easy to retune later — same as other numeric constants in this codebase (`RAID_AMBUSH_CHANCE`, `AMBUSH_CHANCE_PER_DAY`, etc.).

## Where fights are triggered

There is no random-encounter-while-walking system — ambushes only roll at two fixed moments, both gated by chance constants defined near `computeTravel` in index.html:

- **On arrival** (`AMBUSH_CHANCE_PER_DAY = 0.12`): after a completed journey, `rollAmbush(days)` computes `1 - (1-0.12)^days` — so a 1-day trip has a 12% ambush chance, a 5-day trip has a much higher cumulative chance. If it hits, `triggerAmbushFight(currentBurg, () => showLocationView(currentBurg), 'road')` runs before the settlement's location view opens; if not, the location view opens immediately.
- **Camping overnight** (`NIGHT_AMBUSH_CHANCE = 0.15`, flat, no day-scaling): only on the camp screen's "Rest Until Morning" button (`showCampView`), not the Inn's — the fiction is that an Inn is a guarded settlement, camping on the open road is not. If the roll hits, `triggerAmbushFight(currentBurg, finishRest, 'camp')` runs first and rest (healing) is applied afterward via the `finishRest` callback either way. Note both sites pass `currentBurg`, not a destination-in-progress or `campPos` — there's no clean "which kingdom is this camp near" concept for a mid-journey camp, so the player's last-arrived settlement is used as a reasonable stand-in for "what territory is this."

Both call sites are examples of the `onEnd` pattern above: the fight is spliced into an existing flow and the flow's normal continuation (open location view / apply rest) becomes the combat callback.

## Adding a new enemy variant or race

More art for an existing race: drop the PNG in `assets/enemies/`, add one entry to `ENEMY_VARIANTS.bandit`/`.goblin`/`.ork` with its own `hp`/`enemyDmgRange`/`goldRange`/`art` — nothing else needs to change, `triggerEnemyFight` already picks uniformly at random from the array.

A whole new race (Dwarf, if it becomes an ambusher): give `ENEMY_VARIANTS` a new race key with its own variant array, then change `pickAmbushEnemy` so it can actually return that race for the right settlements, and update `triggerAmbushFight`'s toast wording to cover it.
