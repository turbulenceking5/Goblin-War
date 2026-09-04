# Combat (index.html)

A minimal turn-based fight system with three enemy races — Bandit, Goblin, and Ork — each with several real-art *variants* rather than one look apiece. Lives entirely in index.html — there's no separate combat page, it's an overlay (`#combat-view`, z-index 70) drawn on top of whatever screen was showing.

## Starting a fight

`startCombat(enemyName, enemyMaxHp, enemyDmgRange, playerDmgRange, onEnd, artPath, goldRewardRange)` is the low-level entry point everything else wraps. `enemyDmgRange` is what the enemy deals to the player per round; `playerDmgRange` is what the player deals back; `artPath` renders as an `<img>` inside `#combat-enemy-icon`.

- `triggerEnemyFight(race, onEnd)` — picks a random entry from `ENEMY_VARIANTS[race]` (see below) and starts a fight with that variant's own `hp`/`enemyDmgRange`/`goldRange`/`art`. The one function every race uses now that all three have real art.
- `triggerAmbushFight(burgId, onEnd, context)` — the one the two ambush call sites below actually use. Picks which race ambushes (`pickAmbushEnemy`, see "Which race shows up" below), shows a toast worded for `context` (`'road'` vs `'camp'`), and calls `triggerEnemyFight`.

`PLAYER_DMG_RANGE` (`[8,15]`) is a single shared constant — the player's own weapon damage never changes based on who they're fighting; only the *enemy's* side (`enemyDmgRange`, `hp`, `goldRange`) scales with difficulty. (Earlier code had this backwards — two hardcoded fight-starting calls passed their difficulty numbers into the *player's* damage slot instead of the enemy's, so fighting an Ork Raider let the player hit harder than fighting a Bandit while the enemy's own damage output stayed flat. Fixed when `ENEMY_VARIANTS` was introduced.)

`goldRewardRange` is what `endCombat` rolls from on victory (see below) — stored on the `combat` object alongside everything else, so a harder fight visibly looks harder and pays out more, not just a renamed Bandit with bigger numbers.

`combat` is a single module-level object (`{enemyName, enemyHp, enemyMaxHp, enemyDmgRange, playerDmgRange, onEnd, goldRewardRange}`) — the game only ever supports one fight at a time, no queue or nesting.

## Enemy variants and their art

`ENEMY_VARIANTS` (index.html) is `{ race: [{name, hp, enemyDmgRange, goldRange, art}, ...] }`. Real portraits live in `assets/enemies/*.png` (transparent background, downscaled to a 600px longest edge — see `#combat-enemy-icon img`'s `max-width:190px`/`max-height:210px` for how they're actually displayed). Currently:

- **Bandit** (1 variant so far): Bandit (30 HP, hooded human archer, hits for 5–12 — the easiest fight in the game).
- **Goblin** (4 variants): Goblin Raider (35 HP, spear+sword, the baseline), Goblin Shieldbearer (45 HP, spear+shield — tankiest goblin, hits softest at 6–12), Goblin Skirmisher (30 HP, dual curved blades — squishiest melee goblin but hits hardest at 9–16, best goblin payout), Goblin Archer (25 HP, bow — lowest HP, moderate 7–13 damage, lowest goblin payout).
- **Ork** (3 variants): Ork Raider (55 HP, dual axe/cleaver, hits for 11–20 — the original baseline), Ork Berserker (45 HP, bare-chested dual hand-axes, no armor — squishiest ork but hits just as hard as a Raider at 12–22), Ork Warlord (70 HP, heavily armored with bone trophies and a single heavy cleaver, hits for 13–22 — the toughest fight in the game, best payout).

A race with only one variant so far (Bandit) picks that same variant every time — nothing special about it, `triggerEnemyFight` just has a one-element array to choose from. Adding another variant to any race is one more array entry plus its PNG in `assets/enemies/` — `triggerEnemyFight` already picks uniformly at random from whatever's in the list, no other code changes. A whole new race (Dwarf, if it ever becomes an ambusher) means giving `ENEMY_VARIANTS` a new key and teaching `pickAmbushEnemy` to return it for the right settlements.

## Which race shows up

`pickAmbushEnemy(burgId)` is what actually decides Bandit vs. Goblin vs. Ork for a given ambush (variant selection within a race happens afterward, inside `triggerEnemyFight`): if `burgId`'s original kingdom is Good-alliance (human/dwarf — see [factions-and-territory.md](factions-and-territory.md)) *and* that kingdom is currently at war, there's a `RAID_AMBUSH_CHANCE` (50%) chance of a themed raiding party (coin-flip between goblin/ork) instead of a plain Bandit. A Bad-alliance settlement (ork/goblin territory) never spawns a themed raid, at war or not — the game doesn't cast Human/Dwarf as ambush enemies, so an ambush there is always just a Bandit. This is the direct payoff of the faction AI system: fighting through a warzone now actually feels different from a peaceful road.

## Turn loop

- **Attack** (`combatAttack`): costs `STAMINA_COST_PER_ATTACK` (20) stamina, spent via `setStamina(playerStamina - STAMINA_COST_PER_ATTACK)` before the damage roll — unless the Second Wind perk's 25% roll waives it that turn (see [player-state.md](player-state.md)'s perk table). If `playerStamina` is below the full cost, the attack refuses instead — logs "You're too exhausted to attack — flee and rest up first." and does nothing else; `updateCombatUI()` also disables the Attack button proactively whenever stamina is too low, so this refusal path is a fallback guard rather than the normal way players find out. Otherwise: roll player damage (`randRange(playerDmgRange) + getEquipDamageBonus()`, see [player-state.md](player-state.md) for what's equippable and which perk adds a flat bonus here), apply to `combat.enemyHp`. If the enemy drops to 0 or below, `endCombat('victory')` immediately — the enemy doesn't get a last hit in. Otherwise `enemyCounter()` runs (shared with every special move below except Reckless Swing): normally rolls enemy damage and applies `Math.max(1, roll - getEquipDefenseBonus())` to `playerHealth` via `setHealth()` — armor/shield reduce the hit but can never make an attack deal zero — unless the Evasion perk's 15% roll dodges it entirely first. If the hit (or lack of one) brings the player to 0 or below, `endCombat('defeat')`.
- **Specials** (`combatSpecial`, `#combat-special-btn` toggles `#combat-specials-panel`): a third action alongside Attack/Flee, listing whichever of the 6 `MOVES` the player has unlocked with a skill point (character.html's Special Attacks card — see [player-state.md](player-state.md) for the full table and stamina costs). Each move is usable once per fight (`combat.usedMoves`, reset in `startCombat`) and cannot be re-enabled by resting mid-fight. Most moves deal damage then call the same `enemyCounter()` Attack uses; Reckless Swing deliberately bypasses it with its own full-damage, perk-ignoring counter-hit, and War Cry deals no damage at all, only reshapes `combat.enemyDmgRange` downward for the rest of the fight. Cleave is written against `combat.enemyHp` directly (there's only ever one enemy today) but phrased as "every enemy" so it's ready to loop over a real enemies array once multi-enemy fights exist (see [roadmap.md](roadmap.md)).
- **Flee** (`combatFlee`): always succeeds, no roll, no stamina cost — logs a line and calls `endCombat('flee')`. There's no "the bandit gets a free hit as you flee" penalty currently. Because Flee is free, running out of stamina mid-fight can't soft-lock a player — they can always break off and go rest, same philosophy as the Food gate on travel (see [player-state.md](player-state.md)).
- `combatLog(msg)` appends a line to the scrolling `#combat-log` div (auto-scrolls to bottom).

## Stamina

Stamina (`playerStamina`/`playerMaxStamina`, see [player-state.md](player-state.md)) is spent only by attacking — nothing else in the game touches it, and the enemy's counter-attack never costs the player stamina, only health. The combat overlay shows a third bar (`#combat-player-stamina-bar`/`-text`, styled `.combat-bar-fill.stamina`) alongside the enemy and player HP bars, refreshed by `updateCombatUI()` on every turn. `updateCombatUI()` also toggles `#combat-attack-btn`'s `disabled` attribute directly (`playerStamina < STAMINA_COST_PER_ATTACK`) so the button greys out and stops accepting clicks before a player can even try an attack they can't afford — the in-`combatAttack` refusal above only fires if something bypasses that (there's no other call site right now).

The only way stamina goes back up is resting — `setStamina(playerMaxStamina)` in both the Inn's rest button and the camp's rest button, alongside the existing full heal (see [locations-and-camp.md](locations-and-camp.md)). There's no partial recovery anywhere else; a long run of fights without resting will eventually strand the player at low stamina, forced to flee until they can reach an Inn or make camp.

## Ending a fight

`endCombat(result)` hides `#combat-view`, shows one toast, and calls the stored `onEnd(result)` — with a short delay (700ms) only for victory/defeat, so the last HP-bar update is visible before the overlay closes; flee closes instantly.

- `victory` → random gold reward from the fight's own `goldRewardRange` (8–20 for a Bandit, more for a raiding party — see "Starting a fight" above), toast "Victory! ...". Also checks for an active "Kill Bandits" quest if `combat.race === 'bandit'` (`race` is threaded through `startCombat`/`triggerEnemyFight` for exactly this) and folds its payout into the same toast — see [quests.md](quests.md).
- `defeat` → `setHealth(10)` (never actually kills the player — this is the game's only failure-recovery mechanic right now), toast about barely escaping.
- `flee` → no state change beyond whatever happened during the rounds already fought, toast "You flee from the fight."

## Where fights are triggered

There is no random-encounter-while-walking system — ambushes only roll at two fixed moments, both gated by chance constants defined near `computeTravel` in index.html:

- **On arrival** (`AMBUSH_CHANCE_PER_DAY = 0.12`): after a completed journey, `rollAmbush(days)` computes `1 - (1-0.12)^days` — so a 1-day trip has a 12% ambush chance, a 5-day trip has a much higher cumulative chance. If it hits, `triggerAmbushFight(currentBurg, () => showLocationView(currentBurg), 'road')` runs before the settlement's location view opens; if not, the location view opens immediately.
- **Camping overnight** (`NIGHT_AMBUSH_CHANCE = 0.15`, flat, no day-scaling): only on the camp screen's "Rest Until Morning" button (`showCampView`), not the Inn's — the fiction is that an Inn is a guarded settlement, camping on the open road is not. If the roll hits, `triggerAmbushFight(currentBurg, finishRest, 'camp')` runs first and rest (healing) is applied afterward via the `finishRest` callback either way. Note both sites pass `currentBurg`, not a destination-in-progress or `campPos` — there's no clean "which kingdom is this camp near" concept for a mid-journey camp, so the player's last-arrived settlement is used as a reasonable stand-in for "what territory is this."

Both call sites are examples of the `onEnd` pattern above: the fight is spliced into an existing flow and the flow's normal continuation (open location view / apply rest) becomes the combat callback.

## Adding a new enemy variant or race

More art for an existing race: drop the PNG in `assets/enemies/`, add one entry to `ENEMY_VARIANTS.bandit`/`.goblin`/`.ork` with its own `hp`/`enemyDmgRange`/`goldRange`/`art` — nothing else needs to change, `triggerEnemyFight` already picks uniformly at random from the array.

A whole new race (Dwarf, if it becomes an ambusher): give `ENEMY_VARIANTS` a new race key with its own variant array, then change `pickAmbushEnemy` so it can actually return that race for the right settlements, and update `triggerAmbushFight`'s toast wording to cover it.
