# Roadmap: Stubs Already Scaffolded in the Code

Every "coming soon" placeholder currently in the game, collected in one place so future work has a checklist instead of needing to grep for it. Each entry names the exact file/element so implementing it means replacing that stub, not guessing where it should live.

## Skills & Progression — character.html

`.coming-soon` block below the stats card: *"Skills, combat stats, and a proper progression system aren't built yet — this is the next thing after player state."* No XP, levels, or skill points exist anywhere in the code yet — `combat.md`'s fight outcomes only affect HP and gold, never anything that would feed a progression system.

## Equipment & Marketplace — inventory.html + index.html

inventory.html's `.coming-soon` block: *"Weapons, armor, and the Marketplace to buy/sell them aren't built yet — that's next once combat exists."* Combat now exists (see [combat.md](combat.md)), which is what unblocks this per the note's own framing. The **Marketplace** action in a settlement's location view (`showLocationView` in index.html, `action:'stub'`) is the intended entry point on the map side — currently just toasts "Not built yet."

## Talk to Townsfolk — index.html

Also a `action:'stub'` entry in `showLocationView`'s action list, alongside Marketplace. Intended purpose per its description: "Ask what's happening in the world" — likely meant to be a settlement-flavored counterpart to the Inn's random `RUMOURS`, rather than a mechanical system.

## Party / Companions — party.html

The entire page is one `.coming-soon` block: *"No followers yet. Recruitable companions and their own quests will show up here once that system is built."* No data model for a companion exists anywhere (no `goblinwar_party` key, no companion stats). This is the least-started system in the game — everything else has at least a stub function or a data shape; this has neither.

## Smaller/implicit gaps (not marked with a UI stub, but visible from the code)

- **No item usage.** inventory.html renders items but has no click handler on rows — nothing consumes a "Traveler's Rations" or "Waterskin" despite them existing in `DEFAULT_INVENTORY`.
- **No character customization.** character.html hardcodes "The Traveler" / "Human" / "Kingdom of Bary" — there's no race/origin choice, even though the world data (`travel-graph.json`) already models four races and dozens of states that a real origin system could draw from.
- **Single enemy type.** Combat only knows about "Bandit" — see [combat.md](combat.md) for how straightforward adding a second type would be (parameterized already, just needs a second wrapper + a trigger site).
- **No random encounters while simply walking around** — only the two fixed ambush rolls (on arrival, on overnight camp) exist; there's no per-day-of-travel "something happens" table beyond bandits.
