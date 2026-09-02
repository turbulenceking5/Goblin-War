# Roadmap: Stubs Already Scaffolded in the Code

Every "coming soon" placeholder currently in the game, collected in one place so future work has a checklist instead of needing to grep for it. Each entry names the exact file/element so implementing it means replacing that stub, not guessing where it should live.

## Skills & Progression — character.html

`.coming-soon` block near the bottom: *"Skills, combat stats, and a proper progression system aren't built yet — this is the next thing after player state. Equipment now affects combat (see Inventory to equip gear); Accessories above are still a placeholder."* No XP, levels, or skill points exist anywhere in the code yet — victory in combat only grants gold, nothing that would feed a progression system. The Level/XP header at the top of the page (`.level-badge` hardcoded "1", `.xp-fill` permanently `width:0%`, labeled "Progression system coming soon") is a visual placeholder for where real level/XP would go, not backed by any `goblinwar_level`/`goblinwar_xp` key. The **Character Stats** box (Strength/Agility/Intelligence, each showing `—`) is the same kind of honest placeholder — there's no numeric stat system in the actual game data at all, only Health and Stamina are real, so these deliberately show a dash rather than an invented number.

## Equipment — done; Accessories — still a stub

Equipping is real now: six `MARKET_ITEMS` entries (Sword, Shield, Leather Cap, Leather Armour, Leather Boots, Lucky Charm) each carry a `slot` and a `dmg`/`def` combat bonus, `goblinwar_equipped` tracks what's in each of the 6 slots, inventory.html is where you equip/unequip (an Equip/Unequip button per equippable item row), character.html shows what's equipped and lets you unequip from there too, and `combatAttack()` (index.html) actually applies the bonus to damage dealt/taken — see [player-state.md](player-state.md) and [combat.md](combat.md) for the full mechanics.

What's still not built: the **Accessories** grid (character.html, 8 unlabeled slots) is pure decoration — no accessory-type item exists in `MARKET_ITEMS`, nothing points at those slots, tapping one does nothing. Also still missing: any UI hint in the Marketplace itself that an item is equippable *before* you buy it (you only find out on inventory.html), and stacking multiple bonus *sources* per slot (each slot holds exactly one item, as intended, but there's no rarity/tier variation — a Sword is always +4, forever). Selling now exists (see [locations-and-camp.md](locations-and-camp.md)) and correctly auto-unequips an item if you sell its last copy — dropping (destroying an item for no gold) still doesn't exist as a separate action.

## Faction AI, territory & war economy — index.html

A real weekly tick now exists — see [factions-and-territory.md](factions-and-territory.md) for the full mechanics (kingdoms war/raid/sue-for-peace, settlements can actually change hands, Marketplace prices react to it). Its own "Known simplifications" section is the checklist for this system specifically (binary per-kingdom war state rather than a real relations matrix, raids as a flat coin-flip with no siege/garrison concept, no player involvement in the outcome) — not duplicated here to avoid the two files drifting apart.

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
