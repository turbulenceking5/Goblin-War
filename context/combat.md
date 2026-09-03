# Combat (index.html)

A minimal turn-based fight system with three enemy races — Bandit, Goblin, and Ork — the latter two now with several real-art *variants* each rather than one reskinned Bandit apiece. Lives entirely in index.html — there's no separate combat page, it's an overlay (`#combat-view`, z-index 70) drawn on top of whatever screen was showing.

## Starting a fight

`startCombat(enemyName, enemyMaxHp, enemyDmgRange, playerDmgRange, onEnd, iconKey, goldRewardRange, artPath)` is the low-level entry point everything else wraps. `enemyDmgRange` is what the enemy deals to the player per round; `playerDmgRange` is what the player deals back — two ready-made wrappers call it with real numbers:

- `triggerBanditFight(onEnd)` — `startCombat('Bandit', 30, [5,12], PLAYER_DMG_RANGE, onEnd, 'bandit', [8,20])`: 30 HP, hits the player for 5–12, 8–20 gold on victory. Still uses the old hand-drawn SVG (`iconKey:'bandit'`) since there's no human portrait art yet.
- `triggerRaidersFight(race, onEnd)` — picks a random entry from `ENEMY_VARIANTS[race]` (see below) and starts a fight with that variant's own `hp`/`enemyDmgRange`/`goldRange`/`art`.
- `triggerAmbushFight(burgId, onEnd, context)` — the one the two ambush call sites below actually use. Picks which race ambushes (`pickAmbushEnemy`, see "Which enemy shows up" below), shows a toast worded for `context` (`'road'` vs `'camp'`), and calls `triggerBanditFight`/`triggerRaidersFight`.

`PLAYER_DMG_RANGE` (`[8,15]`) is a single shared constant — the player's own weapon damage never changes based on who they're fighting; only the *enemy's* side (`enemyDmgRange`, `hp`, `goldRange`) scales with difficulty. (Earlier code had this backwards — `triggerRaidersFight`'s two calls passed their difficulty numbers into the *player's* damage slot instead of the enemy's, so fighting an Ork Raider let the player hit harder than fighting a Bandit while the enemy's own damage output stayed flat. Fixed when `ENEMY_VARIANTS` was introduced.)

`artPath`, when given, renders as an `<img>` inside `#combat-enemy-icon`; otherwise `iconKey` selects a hand-drawn SVG from `ENEMY_ICONS` (currently just `bandit` — same circle-head/cape-body/weapon composition as always). `goldRewardRange` is what `endCombat` rolls from on victory (see below). Both are stored on the `combat` object alongside everything else, so a harder fight visibly looks harder and pays out more, not just a renamed Bandit with bigger numbers.

`combat` is a single module-level object (`{enemyName, enemyHp, enemyMaxHp, enemyDmgRange, playerDmgRange, onEnd, goldRewardRange}`) — the game only ever supports one fight at a time, no queue or nesting.

## Enemy variants and their art

`ENEMY_VARIANTS` (index.html) is `{ race: [{name, hp, enemyDmgRange, goldRange, art}, ...] }`. Real portraits live in `assets/enemies/*.png` (transparent background, downscaled to a 600px longest edge — see `#combat-enemy-icon img`'s `max-width:190px`/`max-height:210px` for how they're actually displayed). Currently:

- **Goblin** (4 variants, one picked at random per fight): Goblin Raider (35 HP, spear+sword, the baseline — same numbers the single "Goblin Raiders" type used before variants existed), Goblin Shieldbearer (45 HP, spear+shield — tankiest, hits softest at 6–12), Goblin Skirmisher (30 HP, dual curved blades — squishiest melee goblin but hits hardest at 9–16, best goblin payout), Goblin Archer (25 HP, bow — lowest HP, moderate 7–13 damage, lowest goblin payout).
- **Ork** (1 variant so far): Ork Raider (55 HP, dual axe/cleaver, hits for 11–20 — the toughest fight in the game, best payout).
- **Bandit**: still the single hand-drawn SVG type, no variants — human art hasn't been supplied yet. When it is, Bandit should move into this same `ENEMY_VARIANTS` shape.

Adding another variant to an existing race (more goblin or ork art) is just one more array entry — `triggerRaidersFight` already picks uniformly at random from whatever's in the list, no other code changes. Adding a new race (human/dwarf bandit variants) means giving `pickAmbushEnemy` a way to return that race and adding its own `ENEMY_VARIANTS` entry.

## Which race shows up

`pickAmbushEnemy(burgId)` is what actually decides Bandit vs. Goblin vs. Ork for a given ambush (variant selection within a race happens afterward, inside `triggerRaidersFight`): if `burgId`'s original kingdom is Good-alliance (human/dwarf — see [factions-and-territory.md](factions-and-territory.md)) *and* that kingdom is currently at war, there's a `RAID_AMBUSH_CHANCE` (50%) chance of a themed raiding party (coin-flip between goblin/ork) instead of a plain Bandit. A Bad-alliance settlement (ork/goblin territory) never spawns a themed raid, at war or not — the game doesn't cast Human/Dwarf as ambush enemies, so an ambush there is always just a Bandit. This is the direct payoff of the faction AI system: fighting through a warzone now actually feels different from a peaceful road.

## Turn loop

- **Attack** (`combatAttack`): costs `STAMINA_COST_PER_ATTACK` (20) stamina, spent via `setStamina(playerStamina - STAMINA_COST_PER_ATTACK)` before the damage roll. If `playerStamina` is below that cost, the attack refuses instead — logs "You're too exhausted to attack — flee and rest up first." and does nothing else; `updateCombatUI()` also disables the Attack button proactively whenever stamina is too low, so this refusal path is a fallback guard rather than the normal way players find out. Otherwise: roll player damage (`randRange(playerDmgRange) + getEquipDamageBonus()`, see [player-state.md](player-state.md) for what's equippable), apply to `combat.enemyHp`. If the enemy drops to 0 or below, `endCombat('victory')` immediately — the enemy doesn't get a last hit in. Otherwise the enemy immediately counter-attacks in the same call: roll enemy damage, apply `Math.max(1, roll - getEquipDefenseBonus())` to `playerHealth` via `setHealth()` — armor/shield reduce the hit but can never make an attack deal zero. If that brings the player to 0 or below, `endCombat('defeat')`.
- **Flee** (`combatFlee`): always succeeds, no roll, no stamina cost — logs a line and calls `endCombat('flee')`. There's no "the bandit gets a free hit as you flee" penalty currently. Because Flee is free, running out of stamina mid-fight can't soft-lock a player — they can always break off and go rest, same philosophy as the Food gate on travel (see [player-state.md](player-state.md)).
- `combatLog(msg)` appends a line to the scrolling `#combat-log` div (auto-scrolls to bottom).

## Stamina

Stamina (`playerStamina`/`playerMaxStamina`, see [player-state.md](player-state.md)) is spent only by attacking — nothing else in the game touches it, and the enemy's counter-attack never costs the player stamina, only health. The combat overlay shows a third bar (`#combat-player-stamina-bar`/`-text`, styled `.combat-bar-fill.stamina`) alongside the enemy and player HP bars, refreshed by `updateCombatUI()` on every turn. `updateCombatUI()` also toggles `#combat-attack-btn`'s `disabled` attribute directly (`playerStamina < STAMINA_COST_PER_ATTACK`) so the button greys out and stops accepting clicks before a player can even try an attack they can't afford — the in-`combatAttack` refusal above only fires if something bypasses that (there's no other call site right now).

The only way stamina goes back up is resting — `setStamina(playerMaxStamina)` in both the Inn's rest button and the camp's rest button, alongside the existing full heal (see [locations-and-camp.md](locations-and-camp.md)). There's no partial recovery anywhere else; a long run of fights without resting will eventually strand the player at low stamina, forced to flee until they can reach an Inn or make camp.

## Ending a fight

`endCombat(result)` hides `#combat-view`, shows one toast, and calls the stored `onEnd(result)` — with a short delay (700ms) only for victory/defeat, so the last HP-bar update is visible before the overlay closes; flee closes instantly.

- `victory` → random gold reward from the fight's own `goldRewardRange` (8–20 for a Bandit, more for a raiding party — see "Starting a fight" above), toast "Victory! ...".
- `defeat` → `setHealth(10)` (never actually kills the player — this is the game's only failure-recovery mechanic right now), toast about barely escaping.
- `flee` → no state change beyond whatever happened during the rounds already fought, toast "You flee from the fight."

## Where fights are triggered

There is no random-encounter-while-walking system — ambushes only roll at two fixed moments, both gated by chance constants defined near `computeTravel` in index.html:

- **On arrival** (`AMBUSH_CHANCE_PER_DAY = 0.12`): after a completed journey, `rollAmbush(days)` computes `1 - (1-0.12)^days` — so a 1-day trip has a 12% ambush chance, a 5-day trip has a much higher cumulative chance. If it hits, `triggerAmbushFight(currentBurg, () => showLocationView(currentBurg), 'road')` runs before the settlement's location view opens; if not, the location view opens immediately.
- **Camping overnight** (`NIGHT_AMBUSH_CHANCE = 0.15`, flat, no day-scaling): only on the camp screen's "Rest Until Morning" button (`showCampView`), not the Inn's — the fiction is that an Inn is a guarded settlement, camping on the open road is not. If the roll hits, `triggerAmbushFight(currentBurg, finishRest, 'camp')` runs first and rest (healing) is applied afterward via the `finishRest` callback either way. Note both sites pass `currentBurg`, not a destination-in-progress or `campPos` — there's no clean "which kingdom is this camp near" concept for a mid-journey camp, so the player's last-arrived settlement is used as a reasonable stand-in for "what territory is this."

Both call sites are examples of the `onEnd` pattern above: the fight is spliced into an existing flow and the flow's normal continuation (open location view / apply rest) becomes the combat callback.

## Adding a new enemy variant or race

More goblin or ork art: drop the PNG in `assets/enemies/`, add one entry to `ENEMY_VARIANTS.goblin`/`.ork` with its own `hp`/`enemyDmgRange`/`goldRange`/`art` — nothing else needs to change, `triggerRaidersFight` already picks uniformly at random from the array.

A whole new race (human/dwarf, once that art exists): give `ENEMY_VARIANTS` a new race key with its own variant array, then change `pickAmbushEnemy` so it can actually return that race for the right settlements, and update `triggerAmbushFight`'s toast wording to cover it.
