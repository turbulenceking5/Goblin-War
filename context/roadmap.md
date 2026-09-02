# Roadmap: Stubs Already Scaffolded in the Code

Every "coming soon" placeholder currently in the game, collected in one place so future work has a checklist instead of needing to grep for it. Each entry names the exact file/element so implementing it means replacing that stub, not guessing where it should live.

## Skills & Progression — character.html

`.coming-soon` block below the stats card: *"Skills, combat stats, and a proper progression system aren't built yet — this is the next thing after player state."* No XP, levels, or skill points exist anywhere in the code yet — `combat.md`'s fight outcomes only affect HP and gold, never anything that would feed a progression system.

## Equipment — inventory.html

inventory.html's `.coming-soon` block: *"Weapons and armor aren't built yet. The Marketplace (in any settlement) currently only sells Food."* The Marketplace itself is no longer a stub — `showMarketPanel` in index.html (see [locations-and-camp.md](locations-and-camp.md)) sells Food, which is what unlocked it: Food replaced stamina as the travel resource, and needed a way to be bought (see [player-state.md](player-state.md)). What's still missing is everything else a shop could sell — weapons, armor, or any equipment slot to put them in. (Stamina itself came back shortly after as a separate, combat-only resource — see [combat.md](combat.md) — but it isn't sold here; resting is still the only way to refill it.)

## Talk to Townsfolk — index.html

Also a `action:'stub'` entry in `showLocationView`'s action list, alongside Marketplace. Intended purpose per its description: "Ask what's happening in the world" — likely meant to be a settlement-flavored counterpart to the Inn's random `RUMOURS`, rather than a mechanical system.

## Party / Companions — party.html

The entire page is one `.coming-soon` block: *"No followers yet. Recruitable companions and their own quests will show up here once that system is built."* No data model for a companion exists anywhere (no `goblinwar_party` key, no companion stats). This is the least-started system in the game — everything else has at least a stub function or a data shape; this has neither.

## Smaller/implicit gaps (not marked with a UI stub, but visible from the code)

- **Waterskin and Bedroll do nothing.** Food is consumed by travel now, but the other two `DEFAULT_INVENTORY` items are pure flavor/weight — inventory.html has no click handler on rows, so nothing ever uses them.
- **Carry capacity isn't tied to anything.** `CARRY_CAPACITY` (`40`) is a flat constant — there's no strength stat, character build, or way to increase it (e.g. a bigger pack as purchasable gear). See [player-state.md](player-state.md).
- **No character customization.** character.html hardcodes "The Traveler" / "Human" / "Kingdom of Bary" — there's no race/origin choice, even though the world data (`travel-graph.json`) already models four races and dozens of states that a real origin system could draw from.
- **Single enemy type.** Combat only knows about "Bandit" — see [combat.md](combat.md) for how straightforward adding a second type would be (parameterized already, just needs a second wrapper + a trigger site).
- **No random encounters while simply walking around** — only the two fixed ambush rolls (on arrival, on overnight camp) exist; there's no per-day-of-travel "something happens" table beyond bandits.
