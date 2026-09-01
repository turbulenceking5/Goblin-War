# Combat (index.html)

A minimal turn-based fight system, currently with exactly one enemy type: the Bandit. Lives entirely in index.html — there's no separate combat page, it's an overlay (`#combat-view`, z-index 70) drawn on top of whatever screen was showing.

## Starting a fight

`triggerBanditFight(onEnd)` is the one entry point — it calls `startCombat('Bandit', 30, [5,12], [8,15], onEnd)`, i.e. 30 HP, deals 5–12 damage to the enemy per player hit, takes 8–15 damage from the enemy per round. `onEnd` is a callback invoked after the fight resolves (victory/defeat/flee), so combat can be dropped into any flow and hand control back afterward — see the two call sites below.

`combat` is a single module-level object (`{enemyName, enemyHp, enemyMaxHp, enemyDmgRange, playerDmgRange, onEnd}`) — the game only ever supports one fight at a time, no queue or nesting.

## Turn loop

- **Attack** (`combatAttack`): roll player damage (`randRange(playerDmgRange)`), apply to `combat.enemyHp`. If the enemy drops to 0 or below, `endCombat('victory')` immediately — the enemy doesn't get a last hit in. Otherwise the enemy immediately counter-attacks in the same call: roll enemy damage, apply to `playerHealth` via `setHealth()`. If that brings the player to 0 or below, `endCombat('defeat')`.
- **Flee** (`combatFlee`): always succeeds, no roll — logs a line and calls `endCombat('flee')`. There's no "the bandit gets a free hit as you flee" penalty currently.
- `combatLog(msg)` appends a line to the scrolling `#combat-log` div (auto-scrolls to bottom).

## Ending a fight

`endCombat(result)` hides `#combat-view`, shows one toast, and calls the stored `onEnd(result)` — with a short delay (700ms) only for victory/defeat, so the last HP-bar update is visible before the overlay closes; flee closes instantly.

- `victory` → random gold reward (8–20), toast "Victory! ...".
- `defeat` → `setHealth(10)` (never actually kills the player — this is the game's only failure-recovery mechanic right now), toast about barely escaping.
- `flee` → no state change beyond whatever happened during the rounds already fought, toast "You flee from the fight."

## Where fights are triggered

There is no random-encounter-while-walking system — ambushes only roll at two fixed moments, both gated by chance constants defined near `computeTravel` in index.html:

- **On arrival** (`AMBUSH_CHANCE_PER_DAY = 0.12`): after a completed journey, `rollAmbush(days)` computes `1 - (1-0.12)^days` — so a 1-day trip has a 12% ambush chance, a 5-day trip has a much higher cumulative chance. If it hits, `triggerBanditFight(() => showLocationView(currentBurg))` runs before the settlement's location view opens; if not, the location view opens immediately.
- **Camping overnight** (`NIGHT_AMBUSH_CHANCE = 0.15`, flat, no day-scaling): only on the camp screen's "Rest Until Morning" button (`showCampView`), not the Inn's — the fiction is that an Inn is a guarded settlement, camping on the open road is not. If the roll hits, the fight runs first and rest (healing + full stamina) is applied afterward via the `finishRest` callback either way.

Both call sites are examples of the `onEnd` pattern above: the fight is spliced into an existing flow and the flow's normal continuation (open location view / apply rest) becomes the combat callback.

## Adding a new enemy type

`startCombat` already takes enemy name/HP/damage ranges as parameters — a second enemy would mean a second wrapper function like `triggerBanditFight` (e.g. `triggerWolfFight`) with its own numbers, plus wiring it into wherever it should trigger. The combat UI itself (`#combat-enemy-icon`, `#combat-title`) is generic enough not to need changes for a reskin, though the SVG icon in the HTML is currently hand-drawn to look like a bandit specifically.
