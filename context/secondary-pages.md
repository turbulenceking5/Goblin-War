# Secondary Pages

Three pages reachable from index.html's toolbar nav icons, alongside settings.html (its own file, see [save-system.md](save-system.md)). All three share the same page chrome: a sticky header with a title and a "&larr; Back to Map" button that just does `location.href='index.html'`, and a parchment-colored `<main>` capped at `max-width:520px`.

## character.html — Hero Sheet

Pure display, no mutation — reads every stat key listed in [player-state.md](player-state.md) once on load and writes the values into the DOM (`hp-bar`/`hp-value`, `sp-bar`/`sp-value`, `age-value`, `gold-value`, `current-date`). No live updates — if you level up or take damage while this tab is open elsewhere, it won't reflect that until reload.

Two fixed display fields with no backing state at all: **Origin** is hardcoded to "Kingdom of Bary" (not derived from anything — there's currently no character-origin selection), and **Current location** is resolved by fetching `assets/travel-graph.json` just to look up `burgId`'s name (the page doesn't need the rest of the graph, just this one lookup).

Below the stats card is a `.coming-soon` block for Skills & Progression — see [roadmap.md](roadmap.md).

## inventory.html — Bag

Reads `goblinwar_gold` and parses `goblinwar_inventory` (defaults to `[]` on any parse failure, not a hardcoded fallback list — an empty bag renders "Your bag is empty." rather than the default starting items). Each item renders as a row with a generic bag-icon SVG (not per-item icons), item name, and `×qty`. No click handling on items — nothing happens if you tap one; there's no use/drop/equip action yet.

Equipment section below is a `.coming-soon` stub — see [roadmap.md](roadmap.md).

## party.html — Companions

The simplest page in the game: header, one static "coming soon" block, no script tag at all. Placeholder for a future recruitable-companion system.

## Adding a new secondary page

Follow the existing pattern rather than inventing a new one: copy the shared CSS block (`:root` custom properties, `header`/`#back-btn`/`main`/`.subtitle`/`.coming-soon` rules are near-identical across all three files), add the nav icon + `onclick="location.href='yourpage.html'"` to index.html's `#nav-icons`, and read `localStorage` directly rather than trying to pass state through the URL or a shared script — see root [CLAUDE.md](../CLAUDE.md) on why there's no shared module.
