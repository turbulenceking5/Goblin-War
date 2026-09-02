# Factions, Territory & War Economy (index.html)

The first "living world" system in the game — kingdoms fight over settlements in the background while the player does other things, and the Marketplace reacts to it. Lives entirely in index.html, keyed off the same weekly tick.

## Two separate ideas: identity vs. control

A settlement's *historical* kingdom and race (`graph.burgs[id].state`/`.race`, from the Azgaar export — see [data-files.md](data-files.md)) never change. That's its permanent identity, same as a real place keeps its name after changing hands. Its *current controller* is a separate, sparse override:

- `goblinwar_territoryControl`: `{burgId: race}`, only present for settlements that have actually been fought over. `getController(burgId)` checks this map first and falls back to `graph.burgs[burgId].race` — so an unconquered settlement's controller is always just its original race, with no explicit entry needed.
- `setController(burgId, race)` writes an override. Nothing ever deletes one (a settlement can change hands multiple times, but there's no "restore original owner" action).

This deliberately avoids renaming anything — `graph.burgs[id].state`/`.name` stay put forever. Wherever the game already shows a settlement's race/kingdom, it should show the *current controller*, not necessarily the original — see "Where this shows up" below.

## War state belongs to kingdoms, not settlements

`goblinwar_warState`: `{kingdomName: "war"|"peace"}`, default `"peace"` for any kingdom not in the map. War/peace is a property of the *kingdom as a whole* — a kingdom that's currently fighting has every one of its settlements' Marketplaces charging wartime prices, regardless of which specific settlements have actually been captured. `getWarState(kingdom)` / `setWarState(kingdom, state)` are the accessors; `isAtWarAt(burgId)` is the one most call sites actually want (looks up `graph.burgs[burgId].state`, then that kingdom's war state).

## Faction data

`KINGDOM_RACE` (kingdom name → race) and `ALL_KINGDOMS` (the ~24 kingdom names) are built once by `buildFactionData()`, called right after `graph` loads (alongside `buildAdjacency()`). Derived by scanning every burg for its `state`/`race` pair — cheap, done once, not persisted (rebuilt fresh every page load from `travel-graph.json`, which is why it's safe to never invalidate).

`ALLIANCE` (`{human:"Good", dwarf:"Good", ork:"Bad", goblin:"Bad"}`, near `RACE_LABEL`) is what "enemy" means for war/raid purposes — any kingdom whose race is on the other side.

## The weekly tick

`maybeRunFactionAI()` runs at the end of every `advanceDays(n)` call — so it fires after travel arrival, Inn/camp rest, or a partial-travel camp, whichever advances the calendar. It compares `gameDay` against `goblinwar_lastWarTick` and does nothing unless at least `WAR_TICK_INTERVAL_DAYS` (7) have passed, then immediately stamps `lastWarTick` to the current `gameDay` before running `runFactionAITick()` — so a long journey that jumps the calendar by more than a week still only ticks once, not once per day skipped.

`runFactionAITick()` loops every kingdom in `ALL_KINGDOMS` and rolls independently:
- **At peace**: `WAR_DECLARE_CHANCE` (6%) chance to flip to `"war"`.
- **At war**: `RAID_CHANCE` (35%) chance to call `attemptRaid(kingdom)`, and separately (not mutually exclusive with a raid in the same tick) `WAR_PEACE_CHANCE` (15%) chance to flip back to `"peace"`.

`attemptRaid(attackerKingdom)` doesn't pick a target uniformly at random — it computes the centroid of every settlement the attacker's race currently controls (`getController(b.id) === attackerRace`), finds every enemy-alliance-controlled settlement, sorts by distance to that centroid, and picks randomly among the nearest `RAID_CANDIDATE_POOL` (15). This is a proximity *bias*, not a real adjacency graph (the game doesn't have kingdom border data — see "Territory border recoloring" in [roadmap.md](roadmap.md)), but it's enough to stop a kingdom from raiding all the way across the map. `RAID_SUCCESS_CHANCE` (50%) decides whether the raid actually flips the target's controller via `setController`.

If any raid actually succeeded during the tick, `maybeRunFactionAI()` shows one toast summarizing it (e.g. `"Grimstan has fallen to Human forces from Kingdom of Bary."`, or a count if more than one) — declarations of war and peace deals don't get a toast, since with 24 kingdoms rolling independently every week that would be constant noise; captures are the events worth the player's attention.

## Where this shows up

- **`onMapTap`** (the tap-a-settlement info card): the race tag and its color now come from `getController(burgId)`, not `burg.race`, and a `(captured)` note (in the danger-red used elsewhere for warnings) appears whenever the current controller differs from the original race. The kingdom name shown next to it is still the original `burg.state` — identity, not control.
- **`showLocationView`**'s subtitle: same idea, `"{tier} · {Race}-controlled"` appended only when the controller differs from the original.
- **`showMarketPanel`**: see below — this is where war state actually has a mechanical effect, not just a label.

## War-driven Marketplace pricing

Four constants near `isAtWarAt`: `WAR_BUY_MULTIPLIER` (1.5), `WAR_SELL_BONUS_MULT` (1.2), `PEACE_SELL_FRACTION` (0.5), and `isWarRelevant(mi)` (true for anything with an equip `slot`, plus Firewood by name — see [player-state.md](player-state.md) for what's equippable).

- `getBuyPrice(mi, burgId)` = `mi.price * (1.5 if that settlement's kingdom is at war, else 1)`, rounded.
- `getSellPrice(mi, burgId)` = for war-relevant items *at a settlement whose kingdom is at war*, `mi.price * 1.2` (a premium — wartime demand for gear and fuel); otherwise `mi.price * 0.5` (the normal sell-back cut), war or not. A region at lasting peace never pays the wartime premium for anything, and non-war-relevant goods (Food, Healing Potion, Books) never do either, even mid-war.

`showMarketPanel` calls both on every render — the war/peace banner at the top of the panel (`"{kingdom} — At war — prices up"` / `"At peace"`) reads `isAtWarAt(burgId)` directly, and every item row's Buy slider/button and (new) **Sell** button price off `getBuyPrice`/`getSellPrice` rather than the flat `mi.price`. Selling is new: any carried item that's also in `MARKET_ITEMS` gets a "Sell 1 for Ng" row once `getItem(mi.name).qty > 0` (checked fresh every `render()`, so it appears/disappears as your inventory changes) — `sellItem(mi)` is the one-way version of `buyItem`, using `consumeItem`/`setGold` instead of `addItem`/`setGold`. There's no bulk sell, only Sell 1 — deliberately simpler than the Buy slider, since selling is new and less central than buying.

Waterskin and Bedroll aren't in `MARKET_ITEMS`, so they're never sellable — same as they were never buyable.

## Persistence

None of `goblinwar_territoryControl`, `goblinwar_warState`, or `goblinwar_lastWarTick` currently round-trip through settings.html's save slots or New Game reset — see [save-system.md](save-system.md)'s "keys added after a slot format existed" gotcha. Loading an old save or starting a new game leaves whatever territory/war state was already live in `localStorage` untouched (for New Game, that's arguably fine — a fresh start with an already-contested world is a reasonable read — but it's inconsistent with how every other player-state key resets, and worth fixing if this system gets built on further).

## Known simplifications (not bugs, just where the scope was deliberately cut)

- War is binary and per-kingdom, not a relations matrix between specific kingdom pairs — a kingdom "at war" is fighting *someone*, not a tracked specific enemy. Simpler to reason about and to display, at the cost of not knowing (or being able to show) exactly who's fighting whom.
- Raids only ever move a settlement one hop of "current controller" — there's no concept of a siege, garrison, or the settlement fighting back; `RAID_SUCCESS_CHANCE` is a flat coin flip regardless of the target's tier, population, or how defended it is.
- No player involvement yet — the tick runs whether or not the player is anywhere nearby, and there's no way to intervene (fight for a settlement, negotiate a peace, etc.). See "Living world & war state" and "AI faction decision-making" in [roadmap.md](roadmap.md).
