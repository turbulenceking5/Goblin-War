# Quests (index.html)

The first quest system in the game — two sources, deliberately different in feel. The **Quest Board** (any settlement) offers several minor, procedurally-generated delivery jobs at once (Deliver a Message, Deliver Cargo). A **Notable Figure** (a handful of specific pinned settlements, not every City/Capital) offers one important kill-task at a time — Deal with the Bandits, or Drive Off the Raiders once their home kingdom is at war — from a named person rather than a board. This split was a deliberate design choice: important quests should come from talking to someone, minor busywork from a board — see [roadmap.md](roadmap.md)'s Talkable NPCs section for how Notable Figure relates to that still-unbuilt idea.

## Data model

`goblinwar_quests`: a JSON array of accepted quests, default `[]`. Each entry:

```js
{
  id,                    // "q_<timestamp>_<rand>", assigned on accept
  type,                  // "deliver_message" | "deliver_cargo" | "kill_bandits" | "kill_raiders"
  source,                // "board" | "notable_figure"
  giverBurgId, giverName,     // settlement name (board) or NPC name (notable_figure)
  targetBurgId, targetName,   // deliver_* only; null for kill_*
  reward: { gold, xp },
  acceptedDay,           // gameDay at accept time, currently unused beyond record-keeping
  status                 // always "active" — a completed quest is removed from the array,
                          // not marked done, so there's no quest history/log yet
}
```

Part of every character's save (see [characters.md](characters.md)) like every other `goblinwar_`-prefixed key — `collectCharacterSnapshot()`/`freshCharacterData()`/`applyCharacterData()` all carry `quests` alongside `level`/`xp`/`stats`/`skills`.

## Offers aren't stored — they're regenerated

Neither the Quest Board's offers nor the Notable Figure's offer are ever written to `localStorage`. `generateBoardOffers(burgId)` and `generateNotableFigureOffer(burgId)` regenerate them fresh on every panel open, seeded deterministically from `burgId` + the current `gameDay` (and an offer index, for the Board's multiple slots) via a small `mulberry32` PRNG (`seededRandom(hashSeed(...))`). Reopening the same settlement's panel on the same day shows the same offers; once `gameDay` advances, they reroll. This is the same reasoning as Work's per-day cooldown (see [locations-and-camp.md](locations-and-camp.md)) — reuse the calendar as the "has this refreshed yet" signal instead of inventing separate storage.

`hashSeed(str)` folds a string into a 32-bit int; `seededRandom(seed)` (mulberry32) turns that into a `[0,1)` float. Neither needs to be cryptographically strong — this is flavor generation, not anything security-relevant.

## The Quest Board — `showQuestBoardPanel(burgId)`

A fifth entry in every settlement's action list (alongside Inn/Marketplace/Work/Talk to Townsfolk — see [locations-and-camp.md](locations-and-camp.md)), same `#loc-action-list`-replacement pattern as Market/Inn/flavor panels.

- **Your Active Quests** — every quest in `getActiveQuests()`, regardless of source or which settlement it was given at. There's no separate quest log page, so the Board doubles as the one place to see everything outstanding.
- **On the Board** — `generateBoardOffers(burgId)` returns up to `BOARD_OFFERS_PER_DAY` (2) offers, each to a random *other* settlement (picked from `Object.keys(graph.burgs)`, no reachability/distance weighting — any of the ~795 settlements can be the target). Each slot independently seeds a coin flip between **Deliver a Message** (`10-25` gold) and the heavier-paying **Deliver Cargo** (`15-30` gold) — both are the same `deliver_*` mechanic underneath (see Turn-in below), only the flavor and reward differ. XP is `8-20` either way. An offer already matching an active quest (same type + giver + target) is filtered out so accepting one doesn't leave a visible duplicate the same day.
- Accepting pushes a real quest object (with a fresh `id`, `acceptedDay: gameDay`, `status:'active'`) onto `goblinwar_quests` and re-renders the panel.

## The Notable Figure — `showNotableFigurePanel(burgId)`

`NOTABLE_FIGURES` is a small fixed roster of `{name, title, homeBurgId}` — no portraits, no dialogue tree, same spirit as the Inn's `RUMOURS` or Guard House's flavor lines, just a name attached this time. Unlike the Board, **each figure is pinned to one real settlement and doesn't move** — a deliberate project-owner call: important quests should come from a specific person in a specific place, not get randomly reassigned to a different city every day the way the Board's offers regenerate. All five currently sit in Good-alliance (human/dwarf) territory to match their names: Captain Aldric Vane (Bary), Yselle Thorn (Yeone), Elder Bram Oswick (Mosver), Scoutmaster Priska Ren (Sodoy), Sir Corwin Hale (Stothers).

All five are now cataloged in the "Character Forge" tracker artifact (see [roadmap.md](roadmap.md)'s Talkable NPCs section for the link) as `implemented: true, hasImage: false` — the concept exists in-game, no portrait art yet.

`getFigureForBurg(burgId)` is the single source of truth for "is there a figure here right now": it looks up whether `burgId` is anyone's `homeBurgId`, then checks `getController(homeBurgId) !== home.race` (see [factions-and-territory.md](factions-and-territory.md)) — if their home has been captured by another race since, it returns `null`. **This is the "they disappear if their city falls" behavior the project owner asked for**: the Notable Figure action itself stops appearing in `showLocationView`'s action list for that settlement (via the same `getFigureForBurg` check), and opening the panel anyway (a stale render from before a capture) shows "This place has changed hands. Whoever once sought your help here is gone." instead of an offer.

An already-*accepted* kill-quest is unaffected if the giver's city falls afterward — the reward was already promised, and turn-in (below) doesn't require revisiting the giver's panel at all. Only *new* offers stop once a figure is gone.

**Which task a figure offers reacts to real game state, not randomness.** `generateNotableFigureOffer(burgId)` checks `isAtWarAt(figure.homeBurgId)` (see [factions-and-territory.md](factions-and-territory.md)): at peace, the offer is Deal with the Bandits (`20-40` gold / `18-30` XP); once that figure's home kingdom is at war, the offer becomes Drive Off the Raiders instead — the actual Goblin War threat, paying more (`35-60` gold / `25-45` XP) to reflect the bigger danger. Same reactive-world spirit as Marketplace pricing and `pickAmbushEnemy` (see [combat.md](combat.md)) already reacting to war state. The reward is seeded from the figure's name + `gameDay`, not from `burgId` — the figure IS the settlement here, so no separate seed is needed.

**Capped at one active Notable Figure quest globally**, regardless of which figure gave it. The panel checks `getActiveQuests().find(q => q.source === 'notable_figure')` — by `source`, not `type`, so the cap still holds once a second important quest type exists — and if one's already active from a *different* figure, shows "You already have a task in progress for X" instead of a new offer. If it's active from *this* figure, shows that quest's status instead. This is deliberate: these are meant to feel like a real ask from a real person, not a stack of odd jobs like the Board.

## Turn-in

Two different mechanisms, one per quest *family*, because "deliver something" and "kill something" complete differently — both families now have two types apiece, proving the pattern generalizes:

- **Deliver a Message / Deliver Cargo** both complete on arrival, identically. `checkQuestTurnIns(burgId)` runs at the very top of `showLocationView`, before anything else renders — so it fires whether the player just arrived via travel, is re-entering a settlement they're standing in, or backed out of a sub-panel. It scans `goblinwar_quests` for any active quest whose `type` is in `DELIVERY_QUEST_TYPES` (`['deliver_message', 'deliver_cargo']`) and whose `targetBurgId` matches, pays out `setGold`/`addXp`, shows a toast (wording branches only on `type` for "message" vs. "shipment"/"cargo"), and removes it. Safe to call on every `showLocationView` invocation (which happens a lot) since a completed quest is gone from storage immediately — there's nothing left to complete twice.
- **Deal with the Bandits / Drive Off the Raiders** both complete on the next matching combat victory *anywhere*, not just near where the quest was accepted. `endCombat('victory')` (see [combat.md](combat.md)) checks `combat.race` — `race` is threaded through `startCombat`/`triggerEnemyFight` alongside the existing `enemyName`/`goldRewardRange`/`xpRewardRange` specifically so this check is possible — against a small `questMatchesRace(q)` helper (`kill_bandits` wants `'bandit'`; `kill_raiders` wants `'goblin'` or `'ork'`). If an active quest matches, it's paid out and folded into the same victory toast (one message, not two competing `showToast` calls). Since only one Notable Figure quest can ever be active (the cap above), there's at most one to resolve here regardless of which of the two types it is.

## Adding a new quest type

Both mechanisms exist so a new type is mostly a new offer-generator + a new turn-in check, not new architecture — the Board went from 1 type to 2, and Notable Figure went from 1 type to 2, without touching `checkQuestTurnIns`'s or `endCombat`'s structure, only the matching condition inside each:

1. Pick a `type` id and add its copy to `questTitle()`/`questDesc()`.
2. Decide Board (minor, several at once, generic) or Notable Figure (important, one at a time, named, reacts to whether the figure's home is at war) — or a third source later, if one ever makes sense.
3. Write a `generate*Offer(s)` function following the seeded-PRNG pattern above, and an Accept handler that pushes the finished quest shape onto `goblinwar_quests`.
4. Extend the existing turn-in check for that family (add the new `type` to `DELIVERY_QUEST_TYPES`, or a new branch in `questMatchesRace`) if it's a delivery- or kill-style quest; only write a genuinely new turn-in mechanism (a settlement action for "talk to X" style, say) if the completion condition doesn't fit either family.

The tracker's other brainstormed types (Protect a Caravan, Destroy a Goblin Nest, Train Villagers, a Faction Reputation Chain, a fuller Randomised Bounty Board) are all still just names — see [roadmap.md](roadmap.md)'s Quests section.
