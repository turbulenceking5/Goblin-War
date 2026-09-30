# Data Files (assets/)

**The world is procedurally generated per character now.** As of the "Realm Forge" swap (see
[travel-and-map.md](travel-and-map.md)'s own note at its top), index.html/character.html/
settings.html/characters.html/achievements.html no longer fetch any world data file at all —
every one of those now calls `generateWorld(seed)` (a big block of code duplicated into all five
pages, same no-modules convention as everything else) and, in index.html's case, renders its own
raster canvas from that same call's output. `travel-graph.json`, `world-raster.jpg`,
`border-water-mask.json`, `game-map.html`, and `scripts/tag-burg-biomes.js` — confirmed fetched
by nothing and superseded end-to-end by the procedural generator — were deleted outright on
2026-09-30, after sitting as unused legacy weight for a while (`assets/game-map.json`, also
long superseded, had apparently already been removed sometime before that pass — it's referenced
in a few places below and in `scripts/build-world-raster/`'s tooling, but wasn't present in the
working tree by the time this cleanup ran). See "Retired: the original hand-authored world"
below for what those files were and the hand-patches baked into them, kept as history now that
the files themselves are gone. `git tag legacy-map-fixed-world` (local to whichever environment
ran the delete — pushing tag refs isn't permitted in this project's CI, confirmed by a failed
push attempt) marks the last commit any of them were actually live at; failing that, the branch's
own ordinary git history still has every one of them in the commits before the deletion, tag or
not.

`scripts/build-world-raster/` (the offline tool that rendered `world-raster.jpg` from
`game-map.json`) and the `assets/map-sprites/` art it consumed are now doubly non-functional as a
result — their one input file doesn't exist in the repo and their one output file has just been
deleted too. Left in place for now (not part of this cleanup pass, which only touched the 5 files
named above) but worth a follow-up decision of their own.

| File | Size | Status |
|---|---|---|
| `assets/realm-sprites/` | ~1.5MB | **Live.** index.html's `renderWorldRaster()`; mountain-range/tree PNGs plus real ground and water JPEG textures the generator composites onto the terrain it paints. Most are extracted from the "Realm Forge" prototype artifact; `mountainRock1.jpg` is a later addition generated separately (bare mountainside ground didn't exist as a category in that prototype), see below |
| `map` | 2 bytes | Stray/placeholder file, nothing references it — see the bottom of this file |

## The procedural world generator (`generateWorld(seed)`)

Every character gets its own continent, generated once at character creation from a random
`mapSeed` (stored in the character snapshot — see [characters.md](characters.md)) and regenerated
identically from that same seed every time that character's save loads afterward — a new
character is a new world, but a given save's world never changes underneath it. Ported from a
prototype artifact ("Realm Forge"): Perlin-ish fbm noise for elevation, a mountain-edge flood-fill
for Dwarf hold placement, nearest-capital Voronoi for kingdom territory, and an MST-plus-A* road
network. Duplicated verbatim (per the no-modules convention) into index.html, character.html,
settings.html, characters.html, and achievements.html — every page that used to fetch
`travel-graph.json` calls this instead, with the identical function body pasted into each.

**Biomes sit in their own contiguous regions, not scattered by local moisture noise.** `moisture`
used to be its own independent fbm noise field, same technique as elevation — every generated world
came out a patchwork of small, oddly-shaped grass/desert/forest/swamp patches wherever the noise
happened to land. Per the project owner, one real desert region, one real forest region, and so on
reads better than that patchwork. `moisture` is now a blocky field instead: a handful of seed points
sit on a jittered grid (`REGION_GRID_COLS × REGION_GRID_ROWS`, guaranteed spread so no single region
can dominate the map by clustering luck — a real failure mode an earlier pure-random-scatter version
hit), each assigned a fixed value covering one of `rfTerrainColor`'s moisture bands (desert/plains/
forest/swamp), and every cell blends between its two *nearest* seeds (smoothstep, widening near the
boundary) rather than hard-snapping to whichever is closest — the same nearest-seed-Voronoi
technique this file already uses for kingdom territory (`buildBorderMarkers`'s `kingdomAt` grid),
just applied to biome placement instead of political control, and blended rather than hard-cut so
the boundary between two regions shows real intermediate ground (a plains or sandy strip) instead of
an unnaturally straight cutout. **Snow gets its own region too**, via a `-1` moisture sentinel
`rfTerrainColor` checks before anything else — without this, snow (elevation ≥ 0.90) still only
ever caps whatever happens to be the highest ground inside another region, same as before; the
sentinel forces it regardless of elevation within its own region, so it can claim a real lowland
tundra/ice-field section like every other biome does. **Water inside a snow region freezes over** —
`renderWorldRaster()`'s own water-rendering branch checks the same `-1` sentinel and paints frozen
lakes with a dedicated blended ice texture (both real snow photos plus both real shallow-water
photos, via the same layering `rfBlendedCanvas`/`rfBlendedPattern` already use for open/shallow
water) instead of the normal water/shallow fill — a genuinely new composite, not a tinted copy of
either source. **A large contiguous region also exposed a real texture-tiling limitation**: a photo
tiled across many small, disconnected patches never repeats often enough in one contiguous run for
the eye to catch a pattern, but a big unified region tiles the same small source image dozens of
times in a row, and a distinctive fleck/rock in it lands at the same relative spot on every repeat —
an obvious stamped grid once a region gets big enough. `rfVariedPattern()` fixes this the same way
this project's own roadmap.md already documents for the (now-legacy) painterly map renderer: every
biome texture (and the new ice texture) tiles as an `N×N` "supertile" built from the source image
with each cell given an independent random flip, rather than the single raw image — a flipped copy
of an edge-to-edge-seamless texture is still seamless against an unflipped neighbor, so tile
boundaries stay invisible, only the "same rock always in the same place" giveaway goes away.

Its return value is shaped exactly like the old `travel-graph.json` (`burgs`/`edges`/`states`, see
below for the field-by-field shape, unchanged) plus `startBurgId` (the guaranteed-Human starting
capital, always assigned burg id `"0"` — every "fall back to a known-safe settlement" spot in the
codebase, e.g. a stranded saved location, uses `"0"` now instead of the old hardcoded `"5"`/Bary)
and `kingdomCount`. index.html additionally reads a `_raw` field (elevation/moisture/land grids —
not travel-graph.json-shaped, only `renderWorldRaster()` and the water-mask replacement below use
it) that the other four pages ignore.

Two things the old fetched files did are now computed instead, both only in index.html:
- **The terrain backdrop** (`renderWorldRaster()`) paints a `STAGE_W`×`STAGE_H` canvas directly
  from the generator's own elevation/moisture grid. Ground is real photo texture, not flat color:
  each biome category (`RF_TEXTURE_BUCKETS`) picks one of its real JPEG variants once per world
  (grass has 2, desert sand has 2, snow has 2; desert-rock/forest-floor/swamp/beach/hills/mountains
  have 1 each), tiled via `rfVariedPattern()` (see the biome-region paragraph above for why a plain
  `ctx.createPattern` alone isn't enough once a single texture has to repeat across a much larger
  contiguous area). Every category has real art now — hills reuses the
  same dry-rock photo as desert-rock (`desertRock1`, its designated stand-in per the Terrain Prompt
  Forge tracker) rather than getting dedicated art of its own, and mountains has its own dedicated
  `mountainRock1` texture (added after ground textures first shipped with mountains left flat —
  see "Known simplifications" below for that gap's history). Land-biome boundaries get a soft
  `globalAlpha` cross-fade into the neighboring texture (`RF_BIOME_BLEND_RADIUS`, a multi-source
  BFS over the grid) instead of a hard per-cell edge; the BFS treats every land category as a valid
  source/target (not just the ones with their own texture bucket), falling back to a plain
  `RF_BIOME_FLAT_COLOR` fill for any target with no pattern — a safety net that shouldn't trigger
  today since every category has real art, but kept so a category losing its texture in the future
  degrades to a soft-blended flat fill rather than silently skipping the blend entirely (this used
  to be a real, visible bug: hills/mountains were excluded from the BFS outright before either had
  a texture, so snow — which almost always borders one of the two by elevation — never actually
  got its own blend to fire, showing a hard blocky cutout at its edge instead). Water is a 3-way
  blended pattern from `water1-3`, with a lighter `waterShallow1-3` blend fading in by real
  distance-to-shore (`shoreDist`, already computed for the border trace below) — same techniques
  as the "Realm Forge" prototype's own final version, ported over after an initial pass that copied
  the texture files in but never actually loaded or drew them (worth checking for this class of
  gap — files present but unused — whenever a future port lands sprites/textures from that
  prototype). Mountain-range and tree sprites composite on top (`RF_RANGE_SPRITES`, 5 real variants
  scaled to `155 × cw` wide — bumped up in stages from an original `42 × cw` per the project owner
  repeatedly wanting them bigger and more prominent); each range sprite is also run through `rfGroundFadeSprite()`
  once (cached per sprite key, not per placement) before drawing, which walks every column of the
  sprite from the bottom to find its own lowest opaque pixel and fades alpha to 0 over the last
  quarter of its height above that point — a real per-pixel `getImageData`/`putImageData` pass, not
  `globalCompositeOperation: 'destination-in'` (tried first, rejected: it clears the whole canvas
  outside the drawn shape rather than fading alpha only where the sprite painted) — so a range's
  base visually dissolves into whatever ground texture is under it instead of showing a hard
  silhouette cutout. That canvas is then converted to a blob URL and set as `#map-img`'s `src`.
  Everything else the map draws (roads, political borders, settlement labels/city icons, hitzones)
  is the same existing SVG-overlay code as before, completely unchanged — it already worked
  generically off `graph.burgs`/`graph.edges`, so it needed no changes at all to work against
  generated data instead of fetched data. (Settlement *icons* specifically did change since this
  section was first written — see [travel-and-map.md](travel-and-map.md)'s own settlement-icon
  section; that change is about the SVG overlay, not this raster pass, so it's documented there.)
- **The border water mask** (`computeWaterMask()`) replaces the old fetched
  `border-water-mask.json` — instead of downsampling `world-raster.jpg`'s actual pixels offline,
  it samples the generator's own land/water field directly at the same grid resolution, which is
  both simpler and exactly accurate rather than an approximation.

**Known simplifications**, in the same spirit as this codebase's other "known simplifications"
write-ups: the generated world is much smaller than the original hand-authored one (roughly
45-65 settlements/15-18 kingdoms per world, vs. the original's 426 settlements/24 kingdoms) —
Realm Forge's own settlement-spacing constants cap how dense a world its grid size can produce;
raising `RF_SETTLEMENT_TARGET` further hits that spacing ceiling rather than actually adding more
settlements. Tier (village/town/city/capital) and population are synthesized (seeded, roughly
matching the original's tier-mix proportions) since Realm Forge itself only ever distinguished
capital-or-not. `NOTABLE_FIGURES`/`COMPANIONS` no longer have fixed `homeBurgId` literals —
`assignDynamicHomes()` (index.html) picks fresh, distinct Good-alliance settlements for all eight
of them each load, deterministically from the map seed.

**History worth knowing if you're touching ground textures again**: real photo textures for grass,
desert, forest, swamp, snow, and beach shipped in one pass, and the port was reviewed as complete —
but that review only checked whether copied texture files were referenced anywhere, not whether
every biome category actually had one. Hills and mountains were both left flat-colored (no entry
in `RF_TEXTURE_BUCKETS`) for an entire release, undetected until a player screenshot showed a large
flat gray/brown wash across bare mountainside and hillside terrain. Hills was fixed immediately by
reusing `desertRock1` (already the tracker's documented stand-in, just never wired in). Mountains
had no existing art to reuse, so as a stopgap it briefly got a small procedurally-painted
pixel-speckle canvas pattern (tileable, built once and cached) instead of a real photo texture —
replaced by the real `mountainRock1` texture once a generated candidate that actually tiled cleanly
was available (a first candidate was rejected: an obvious boulder-cluster shape recurring in a
visible diagonal grid once self-tiled — the same class of macro-repeat issue that rejected earlier
candidates for desert-rock, forest-floor, and swamp in the original pass). The general lesson: when
a "one texture per biome category" system ships, explicitly check it against the *full list* of
categories the terrain classifier can return, not just that some art exists somewhere in the diff.

## Retired: the original hand-authored world (deleted 2026-09-30)

`travel-graph.json`, `world-raster.jpg`, and `border-water-mask.json` (plus `game-map.html`, the
dead-code page that was their only remaining reader, and `scripts/tag-burg-biomes.js`) are gone
from the repo now — confirmed unread by any live page first (see the top of this file), then
deleted rather than kept as unused weight. This section is a compressed record of what they were
and the hand-work baked into them, for anyone who ever needs that history; the git tag/branch
history mentioned at the top of this file is the fallback for the actual bytes.

- **`travel-graph.json`** was the only world data the live game read, before `generateWorld(seed)`
  replaced it: `{burgs: {id: {id, name, tier, x, y, cell, stateId, state, race, population, port}},
  edges: [{a, b, mi, kind, pts}], states: {...}}` — logical-space coordinates (2560×1277, see
  [travel-and-map.md](travel-and-map.md)), burg `"5"` (Bary) hardcoded as the starting/fallback
  settlement. It was derived from the raw Azgaar export (`game-map.json`, not present in this repo
  by the time of this cleanup either) through several one-off, never-rerun hand-patches, all now
  lost along with the file itself since none were ever reapplied to the live procedural generator
  (a completely separate, independently-coded system — see below): settlement density thinned from
  Azgaar's raw 796 burgs down to 426 (two greedy min-distance passes, Capitals always kept, denser
  clusters keeping their biggest settlement); all 13 Ork/Goblin kingdoms' political titles
  reworded to race-flavored ones (`Kingdom of Warg` → `Warg Horde`, etc.) while Human/Dwarf titles
  stayed untouched; all 265 Ork/Goblin *settlement* names replaced with race-flavored ones via a
  seeded prefix/suffix generator; and 17 mountain-elevation settlements reassigned to Dwarf control
  (deliberately creating non-contiguous Dwarf enclaves elsewhere on the map, a geographic quirk the
  project owner accepted rather than redraw borders for contiguity). `scripts/tag-burg-biomes.js`
  was the mechanism that wrote a `biome` category onto each burg from Azgaar's per-cell elevation
  data — fully superseded (not merely unrun) since `generateWorld(seed)` computes the same
  categories live from each character's own generated elevation/moisture grid instead.
- **`world-raster.jpg`** was a 10240×5108 rendering (4× the logical coordinate space) of that same
  world, painted offline by `scripts/build-world-raster/render-painterly.js` from `game-map.json`'s
  cell/biome/elevation/river/state data — see [roadmap.md](roadmap.md)'s "World map rebuilt as a
  painterly render" for the fuller design history (macro-repeat detection, alpha-premultiplied
  blur, chamfer distance fields — lessons that generalized and were directly reused porting real
  ground textures into the live procedural renderer, even though the specific file and script
  output are gone now).
- **`border-water-mask.json`** was a precomputed land/water lookup (`{cols:160, rows:80,
  rowStrings:[...]}`) for the political-border overlay, generated from `world-raster.jpg` by
  `scripts/build-world-raster/build-border-water-mask.js` — superseded by `computeWaterMask()`
  sampling the live generator's own land/water field directly (see "The procedural world
  generator" above).

`scripts/build-world-raster/` itself (the offline Node tool, plus the `assets/map-sprites/` art it
consumed) wasn't part of this deletion pass and is still in the repo, but it's now non-functional
either way: its one documented input (`game-map.json`) isn't present in the working tree, and its
one output (`world-raster.jpg`) is the file just deleted above. Worth its own follow-up decision
(delete alongside the rest, or keep as reference for a future from-scratch Azgaar re-export)
rather than being silently left to rot as the next round of this same cleanup.

## `assets/map`

A 2-byte file with no clear purpose and nothing in the codebase references it. Likely a leftover from an early experiment — safe to ignore, worth deleting if you're cleaning up the repo (confirm with the project owner first per general repo hygiene, not because it does anything).
