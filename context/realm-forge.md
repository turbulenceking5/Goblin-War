# Realm Forge — a Claude Artifact, not part of this repo

**Live at:** https://claude.ai/artifact/CdUurXY3QbH5NPF25JbUxa

This one is different in kind from the other trackers: it's a **live, interactive prototype**, not
just a prompt checklist. Every page load generates a brand-new procedural continent (noise-based
elevation/moisture, race-aware kingdoms — Dwarves anchored to real mountain foothills, roads routed
around peaks, political borders traced the same way the live game's own border overlay works) and
renders it on an actual `<canvas>` with zoom/pan, a time-of-day lighting picker, and a toggle for
pixel-sprite terrain art vs flat colors. **This is the actual prototype the live game's procedural
world generator was ported from** — see CLAUDE.md's `assets/realm-sprites/` row and
[data-files.md](data-files.md)'s "The procedural world generator" section: `generateWorld(seed)` and
`renderWorldRaster()` in index.html are the production port of what this artifact demonstrates.

## Two things live in this one artifact

1. **The interactive world-generator demo itself** (canvas, regenerate button, zoom controls, legend,
   time-of-day buttons, a road-texture upload panel for live-previewing a custom road texture).
2. **A merged-in "Sprite Prompts" section** (collapsible, toggled via its own button) — originally a
   separate companion artifact ("Terrain Prompt Forge," referenced by that name in
   [roadmap.md](roadmap.md)), later merged directly into this page as a `.sp-*`-prefixed CSS/HTML
   block so there's only one link to keep track of. If an old reference to "Terrain Prompt Forge" as
   a separate artifact turns up, it means this merged section — there is no standalone artifact by
   that name anymore.

## The Sprite Prompts catalog (13 prompts)

- **Mountain Ranges** (2 variants: an even ridgeline, and one dominant peak tapering to foothills) —
  wide, long ridgeline sprites meant to cover a lot of ground per placement.
- **Single Peaks** (2 variants) — **superseded/legacy.** The live game unified mountain art into one
  wide-ridge sprite pool (`RANGE_SPRITES`) rather than a separate single-peak slot; these two prompts
  are kept for history/reference only — don't regenerate from them expecting a live wiring point.
- **Trees** — Deciduous and Conifer, matching the live game's `TREE_SPRITES` slots exactly (one
  picked at random per placement, scattered as discrete clumps).
- **Ground Textures** — Grass/Ground, Open Water, Shallow Water (seamless tileable textures).
- **Roads & Settlements** — **not generated or wired in yet.** Dirt/worn-path road texture, bare
  dirt/tilled-ground texture, and Village/Town marker icons (City/Capital already has real art,
  `assets/icons/Map/Cities.png` — not duplicated here). The live map still draws roads as flat color
  and Village/Town as plain dots; this group is the design for replacing that, whenever picked up.

## Mechanics specific to this artifact

- **7MB+ total size** (the page embeds reference sprite art inline) — never attempt a full `Read`;
  use offset/limit on the specific lines needed, same caution as [character-forge.md](character-forge.md).
- Capabilities declared: `assets` **and** `db` (most other trackers here only declare `assets`) —
  the `db` capability likely backs the in-page road-texture upload feature or some other live-demo
  state, not a gallery of generated candidates the way Scene Backdrops uses `images` arrays. Confirm
  what's actually using it before assuming a new feature can repurpose that capability.
- Editing the Sprite Prompts text follows the same read → edit saved file → validate → publish
  pattern as every other tracker here, but be careful to touch only the `.sp-*` prompt text, never
  the canvas-generator JS (`generate()`/`render()`/the noise/kingdom/road logic) — that code is a
  working interactive demo, not inert markup, and a byte-level mismatch there will break the live
  generator on next load.

## Status (drifts — check the live artifact for ground truth)

Only Deciduous/Conifer trees exist as real generated art so far among the Sprite Prompts group (per
the page's own footer note) — swapping in a third tree species is a one-line `TREE_SPRITES`
addition once art exists. Ground textures (grass/water/shallow-water) and the Mountain Range
prompts have real art extracted into `assets/realm-sprites/` per CLAUDE.md. Roads & Settlements is
entirely unstarted.
