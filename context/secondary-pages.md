# Secondary Pages

Three pages reachable from index.html's toolbar nav icons, alongside settings.html (its own file, see [save-system.md](save-system.md)). All three share the same page chrome: a sticky header with a title and a "&larr; Back to Map" button that just does `location.href='index.html'`, and a parchment-colored `<main>` capped at `max-width:520px`.

## character.html — Hero Sheet

Pure display, no mutation — reads every stat key listed in [player-state.md](player-state.md) once on load and writes the values into the DOM (`hp-bar`/`hp-value`, `stamina-bar`/`stamina-value`, `age-value`, `gold-value`, `current-date`, `food-value`, `weight-value`). No live updates — if you level up, fight, or take damage while this tab is open elsewhere, it won't reflect that until reload. Food carried and carried weight are computed here the same way index.html does (parse `goblinwar_inventory`, find the `"Food"` stack, sum `weight*qty` across everything) — duplicated logic, not shared, per the no-modules convention.

Above the Health/Stamina bars is an "Equipment" section: a paper-doll layout (`.equip-doll`) — a hero silhouette flanked by two columns of 3 empty `.equip-slot` boxes each — plus an `.equip-footer` row showing gold (`#equip-gold-value`, just the same `gold` value already shown lower down in Purse) and a static level bar (`#level-bar`). None of it is backed by real state — see [roadmap.md](roadmap.md) for why the slots and level bar are pure placeholders.

Two fixed display fields with no backing state at all: **Origin** is hardcoded to "Kingdom of Bary" (not derived from anything — there's currently no character-origin selection), and **Current location** is resolved by fetching `assets/travel-graph.json` just to look up `burgId`'s name (the page doesn't need the rest of the graph, just this one lookup).

Below the stats card is a `.coming-soon` block for Skills & Progression — see [roadmap.md](roadmap.md).

## inventory.html — Bag

Reads `goblinwar_gold` and parses `goblinwar_inventory` (defaults to `[]` on any parse failure, not a hardcoded fallback list — an empty bag renders "Your bag is empty." rather than the default starting items). A `.weight-card` above the item list shows carried weight vs. `CARRY_CAPACITY` (`40`, duplicated from index.html), turning red (`.over`) if somehow exceeded — shouldn't normally happen, since `addItem` in index.html refuses purchases that would push over the limit, but this page doesn't assume that invariant holds. Each item renders as a row with a generic bag-icon SVG (not per-item icons), item name, a weight sub-line (`N wt each · M total`, only shown if the item has a `weight` field — older saves might not), a value badge (`Ng each`, only shown if the item has a `value` field — see [player-state.md](player-state.md)), and `×qty`. No click handling on items — nothing happens if you tap one; there's no use/drop/equip action yet.

Equipment section below is a `.coming-soon` stub — see [roadmap.md](roadmap.md). It also notes the Marketplace now sells Swords and Shields alongside Food (see [locations-and-camp.md](locations-and-camp.md)), just with no way to equip them yet.

## party.html — Companions

The simplest page in the game: header, one static "coming soon" block, no script tag at all. Placeholder for a future recruitable-companion system.

## Adding a new secondary page

Follow the existing pattern rather than inventing a new one: copy the shared CSS block (`:root` custom properties, `header`/`#back-btn`/`main`/`.subtitle`/`.coming-soon` rules are near-identical across all three files), add the nav icon + `onclick="location.href='yourpage.html'"` to index.html's `#nav-icons`, and read `localStorage` directly rather than trying to pass state through the URL or a shared script — see root [CLAUDE.md](../CLAUDE.md) on why there's no shared module.
