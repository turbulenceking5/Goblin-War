# Secondary Pages

Three pages reachable from index.html's toolbar nav icons, alongside settings.html (its own file, see [characters.md](characters.md)). All three share the same page chrome: a sticky header with a title and a "&larr; Back to Map" button (cache-busted — `location.href='index.html?_='+Date.now()`, see the cache-busting convention in [../CLAUDE.md](../CLAUDE.md)), and a parchment-colored `<main>` capped at `max-width:520px`. character.html and inventory.html each also have their own `#toast`/`showToast()` (same markup/CSS as index.html's, duplicated per the no-modules convention) now that both can mutate state (equip/unequip) and need to confirm it happened.

## character.html — Hero Sheet

Mostly display, with one real interaction now — reads every stat key listed in [player-state.md](player-state.md) once on load and writes the values into the DOM (`hero-name` off `goblinwar_characterName`, `hp-bar`/`hp-value`, `stamina-bar`/`stamina-value`, `age-value`, `gold-value`, `current-date`, `food-value`, `weight-value`), and re-renders live (`renderEquipment()`) when you unequip something. Nothing else updates without a reload — if you level up, fight, take damage, or equip something *from inventory.html* while this tab is open elsewhere, it won't reflect that until you come back to it. Food carried and carried weight are computed here the same way index.html does (parse `goblinwar_inventory`, find the `"Food"` stack, sum `weight*qty` across everything) — duplicated logic, not shared, per the no-modules convention.

A dashboard-style layout, closer to a typical RPG character sheet than the original simple stat list, but still entirely real-data-or-honestly-a-placeholder except where noted — nothing here fabricates numbers:
- **Level badge + XP bar** (`.level-badge`, `.xp-track`/`.xp-fill`): hardcoded "Level 1", bar permanently at `width:0%`, labeled "Progression system coming soon" — see [roadmap.md](roadmap.md).
- **Portrait box** (`.portrait-box`): a dashed placeholder frame around the same simple hero-silhouette SVG used elsewhere, labeled "Character portrait — coming soon" — the character-sheet equivalent of the location-view art box (see [locations-and-camp.md](locations-and-camp.md)), reserving the spot rather than pretending there's real per-character art.
- **Character Stats** (`.stats-box`): Strength/Agility/Intelligence rows, each showing an em dash rather than an invented number — there's no numeric stat system in the actual game data (only Health and Stamina are real), so this is deliberately honest about being unbuilt rather than filling in placeholder digits.
- **Equipment** (`.slot-grid.equip`, 3×2, `renderEquipment()`): real now — reads `goblinwar_equipped` and shows each filled slot's item name (`.equip-slot.filled`), with a `.combat-bonus` line summing every equipped item's `dmg`/`def` (see [player-state.md](player-state.md)). Tapping a filled slot unequips it (`setEquippedSlot(slot, null)`) and re-renders in place; there's no way to equip *from* this page, only unequip — equipping happens on inventory.html.
- **Accessories** (`.slot-grid.accessory`, 4×2): still fully cosmetic — unlabeled empty slots, not backed by anything, no accessory-type items exist yet (see [roadmap.md](roadmap.md)).

Text lives directly inside each Equipment slot rather than a `title` tooltip, since tooltips don't fire on touch. Gold is shown once, in its own Purse card lower down (`#gold-value`) — earlier drafts also duplicated it next to Equipment; that's gone now to avoid showing the same number twice.

Two fixed display fields with no backing state at all: **Origin** is hardcoded to "Kingdom of Bary" (not derived from anything — there's currently no character-origin selection), and **Current location** is resolved by fetching `assets/travel-graph.json` just to look up `burgId`'s name (the page doesn't need the rest of the graph, just this one lookup).

Below the stats card is a `.coming-soon` block for Skills & Progression — see [roadmap.md](roadmap.md).

## inventory.html — Bag

Reads `goblinwar_gold` and parses `goblinwar_inventory` (defaults to `[]` on any parse failure, not a hardcoded fallback list — an empty bag renders "Your bag is empty." rather than the default starting items). A `.weight-card` above the item list shows carried weight vs. `CARRY_CAPACITY` (`40`, duplicated from index.html), turning red (`.over`) if somehow exceeded — shouldn't normally happen, since `addItem` in index.html refuses purchases that would push over the limit, but this page doesn't assume that invariant holds. The whole list is rendered by one `render()` function (called once on load, and again after every equip/unequip) rather than a one-shot template, so the page stays in sync with itself without a reload.

Each item renders as a row with a generic bag-icon SVG (not per-item icons), item name, a weight sub-line (`N wt each · M total`, only shown if the item has a `weight` field — older saves might not), a value badge (`Ng each`, only shown if the item has a `value` field — see [player-state.md](player-state.md)), and `×qty`. Items with a slot in the local `ITEM_STATS` table (mirrors `MARKET_ITEMS`' equippable entries, see [player-state.md](player-state.md)) additionally get a stat-bonus line and a full-width **Equip**/**Unequip** button (`.equip-btn`) — clicking it toggles `goblinwar_equipped[slot]` and calls `render()` again, so the row's own styling (`.item-row.equipped`, gold border) and button label flip immediately. Non-equippable items (Healing Potion, Books, Firewood, Waterskin, Bedroll) get no button — there's still no use/drop action for them.

Below the item list is a real Equipment section (`#equip-grid`, `.slot-grid.equip`) built the same way as character.html's — 6 slots, showing whatever's equipped, with a `#combat-bonus` line summing the totals. Tapping a filled slot here also unequips it, same as on character.html. This is the *only* page where you can equip something in the first place; character.html can only unequip.

## party.html — Companions

The simplest page in the game: header, one static "coming soon" block, no script tag at all. Placeholder for a future recruitable-companion system.

## Adding a new secondary page

Follow the existing pattern rather than inventing a new one: copy the shared CSS block (`:root` custom properties, `header`/`#back-btn`/`main`/`.subtitle`/`.coming-soon` rules are near-identical across all three files), add the nav icon + `onclick="location.href='yourpage.html'"` to index.html's `#nav-icons`, and read `localStorage` directly rather than trying to pass state through the URL or a shared script — see root [CLAUDE.md](../CLAUDE.md) on why there's no shared module.
