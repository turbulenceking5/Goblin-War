# Data Files (assets/)

**The world is procedurally generated per character now — this file mostly describes legacy
data.** As of the "Realm Forge" swap (see [travel-and-map.md](travel-and-map.md)'s own note at
its top), index.html/character.html/settings.html/characters.html/achievements.html no longer
fetch `travel-graph.json` or `border-water-mask.json` at all, and index.html no longer fetches
`world-raster.jpg` either — every one of those now calls `generateWorld(seed)` (a big block of
code duplicated into all five pages, same no-modules convention as everything else) and, in
index.html's case, renders its own raster canvas from that same call's output. The three files
are kept in the repo (nothing was deleted) as the last snapshot of the original hand-authored
world, and `git tag legacy-map-fixed-world` (local only — pushing tag refs isn't permitted in
this project's CI environment) marks the commit they were last live at. `game-map.html`, the
unused legacy prototype map (see root [CLAUDE.md](../CLAUDE.md)'s file table), still references
`world-raster.jpg` directly — it was never touched by this swap, being dead code nothing links to.

| File | Size | Fetched at runtime? |
|---|---|---|
| `travel-graph.json` | ~400KB | No longer — kept as a legacy snapshot, see above |
| `world-raster.jpg` | ~6.5MB | Only by the unused `game-map.html` prototype |
| `border-water-mask.json` | ~13KB | No longer — the generator computes its own water mask directly from elevation data, see below |
| `game-map.json` | ~9.5MB | No |
| `map` | 2 bytes | No — stray/placeholder file, not referenced anywhere |
| `assets/realm-sprites/` | ~1.5MB | Yes — index.html's `renderWorldRaster()`; mountain-range/tree PNGs plus real ground and water JPEG textures the generator composites onto the terrain it paints. Most are extracted from the "Realm Forge" prototype artifact; `mountainRock1.jpg` is a later addition generated separately (bare mountainside ground didn't exist as a category in that prototype), see below |

## The procedural world generator (`generateWorld(seed)`)

Every character gets its own continent, generated once at character creation from a random
`mapSeed` (stored in the character snapshot — see [characters.md](characters.md)) and regenerated
identically from that same seed every time that character's save loads afterward — a new
character is a new world, but a given save's world never changes underneath it. Ported from a
prototype artifact ("Realm Forge"): Perlin-ish fbm noise for elevation/moisture, a mountain-edge
flood-fill for Dwarf hold placement, nearest-capital Voronoi for kingdom territory, and an
MST-plus-A* road network. Duplicated verbatim (per the no-modules convention) into index.html,
character.html, settings.html, characters.html, and achievements.html — every page that used to
fetch `travel-graph.json` calls this instead, with the identical function body pasted into each.

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
  have 1 each), tiled via `ctx.createPattern`. Every category has real art now — hills reuses the
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
  scaled to `85 × cw` wide — bumped up from an original `42 × cw` per the project owner wanting
  bigger, more prominent ranges); each range sprite is also run through `rfGroundFadeSprite()`
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

## travel-graph.json

The only world data the live game reads. Top-level shape:

```js
{
  "burgs": {
    "<id>": {
      id, name, tier,        // tier: "village" | "town" | "city" | "capital"
      x, y,                  // logical-space coordinates (2560x1277), see travel-and-map.md
      cell,                  // the map-cell id this burg sits on, links into the graph
      stateId, state,        // owning nation, e.g. "Grand Duchy of Mevia"
      race,                  // "human" | "dwarf" | "ork" | "goblin" | "neutral"
      population, port
    }, ...
  },
  "edges": [
    { a, b, mi, kind, pts }  // a/b: cell ids this edge connects; mi: distance in miles;
                             // kind: "road" | "trail" | "sea" (etc.); pts: [[x,y], ...] polyline
  ],
  "states": { ... }          // nation metadata, not currently read by any page
}
```

`burgs` is keyed by a stable numeric-string id — burg `"5"` (Bary) is hardcoded as the new-game starting location and the fallback for a stranded/invalid saved position (see [travel-and-map.md](travel-and-map.md)). `edges` is the road/sea graph itself: `buildAdjacency()` in index.html turns it into a bidirectional lookup, and `pts` is what makes the travel animation follow the actual drawn road shape instead of a straight line.

**Settlement density was hand-thinned — this is also NOT in the raw Azgaar export.** The raw export had 796 burgs (24 capitals, 67 cities, 507 towns, 198 villages) — 89% Town/Village tier, with many pairs sitting only 10-20 logical units apart, dense enough that map labels routinely collided (e.g. "Lengar"/"Sandosen" running together, or two cities 13.6 units apart). A one-off script greedily removes burgs sitting within a minimum distance of another kept settlement, processed by tier priority (Capital always kept, never touched) then by population within a tier (a denser cluster's bigger settlement wins the contested spot over its smaller neighbors), one tier at a time — City, then Town, then Village — so a lower tier is also excluded by whatever higher tier already claimed that ground. Went through two passes at the project owner's direction, both keyed off the *original* 796-burg export rather than compounding on the first pass's specific survivors, so each pass's thresholds are easy to reason about independently:

- **Pass 1**: Town/Village only, 20-unit minimum, City left untouched — 796 → 561 burgs (24/67/367/103).
- **Pass 2 (current)**: City added (30-unit minimum, so Cities also keep real distance from each other and from Capitals, not just from Town/Village) and the Town/Village minimum raised to 28 — 796 → **426 burgs** (24 capital / 58 city / 286 town / 58 village).

Roads (`edges`) are untouched throughout: they're keyed to map cells, not burgs, so a removed settlement's cell is still a real pass-through point on the route graph, it just stops being a named, tappable stop. **If `travel-graph.json` is ever regenerated from `game-map.json`, this thinning is lost too and needs reapplying**, same caveat as the kingdom-name patch below.

**Kingdom names were hand-patched to be race-appropriate — this is NOT in the raw Azgaar export.** Every kingdom name in the original `game-map.json` export used the same generic political-title format (Kingdom/Duchy/Grand Duchy/Principality/Republic/Empire/Dominion/Protectorate of `<name>`) regardless of which race actually ended up controlling it — so Ork- and Goblin-controlled kingdoms read exactly like Human/Dwarf ones (e.g. "Kingdom of Warg" for an Ork nation), per the project owner. A one-off script renamed all 13 Ork/Goblin kingdoms' `state` field (on every one of their burgs) to a race-flavored title while keeping each kingdom's distinctive original name — e.g. `Kingdom of Warg` → `Warg Horde`, `Dominion of Foroughia` → `Foroughia Warband`, `Kingdom of Mikiv` → `Mikiv Swarm` (Ork titles: Warband/Warhost/Horde/Clan/Warcamp/Stronghold/Legion; Goblin titles: Warren/Swarm/Nest/Burrow/Pack). Human and Dwarf kingdom names are untouched. `graph.states[*].name` was patched to match too, for consistency, even though nothing reads `states` today. **If `travel-graph.json` is ever regenerated from `game-map.json` again, this patch is lost and needs reapplying** — it lives only in the derived file, not the source export.

**Individual Ork/Goblin *settlement* names were hand-patched too, same reasoning one step down.** The kingdom-name patch above only ever touched the `state` field — every individual burg's own `name` was still a generic Azgaar name indistinguishable from a Human/Dwarf one (e.g. "Sidhyr", "Witry" for Ork villages), per the project owner. A second one-off script renamed all 265 Ork (147) and Goblin (118) burgs' `name` fields — a small prefix/suffix generator per race (Ork: harsh, guttural, heavy k/g/r/z clusters — "Grimgash", "Uzgardun"; Goblin: scrappier, sibilant, small-sounding — "Snikwick", "Grubditch"), seeded and checked against every existing name in the file so no new collision was introduced (426 burgs total; 3 pre-existing Human/Dwarf duplicate names from the original Azgaar export were already there and are unrelated/untouched). Every other field (`id`/`cell`/`x`/`y`/`state`/`race`/`tier`/`port`/`biome`) is byte-identical to before — confirmed by diffing every burg field against the pre-patch file, not just spot-checked. Human and Dwarf settlement names are untouched. **If `travel-graph.json` is ever regenerated from `game-map.json` again, this patch is lost too and needs reapplying**, same caveat as the kingdom-name patch above.

**Settlements can carry a `biome` category — NOT in the raw Azgaar export, and not backfilled yet either.** `scripts/tag-burg-biomes.js` (a real, committed, re-runnable script — unlike the one-off patches below, which were run once and never kept) reads `game-map.json`'s per-cell `biome`/`h` (elevation) data for each burg's own `cell` and reduces it down to one of 7 strings — `forest`/`plains`/`desert`/`swamp`/`snow`/`hills`/`mountains` — written onto that burg's `biome` field in `travel-graph.json`. It's what `index.html`'s `BIOME_ART`/`getBiomeBackdrop` (see [combat.md](combat.md)'s "Environment backdrop") reads to pick a combat backdrop that actually matches where the ambush happened, instead of every road ambush defaulting to the same Forest art regardless of terrain. Coast is deliberately not one of the 7 — a burg's existing `port` flag already answers that. **Not run yet**: no burg in the checked-in `travel-graph.json` has a `biome` field today, so `getBiomeBackdrop` always falls back to Forest exactly as before — running the script (needs `game-map.json` present locally, see below) is what starts it actually varying. `HILL_HEIGHT_THRESHOLD` (40) is a judgment call baked into the script, not derived from anything Azgaar provides (there's no discrete "hills" biome to read) — worth revisiting once real Hills art exists to check it against. **If `travel-graph.json` is ever regenerated from `game-map.json`, this needs re-running too**, same caveat as every patch below.

**Settlements sitting in mountain-elevation terrain were reassigned to Dwarf — also NOT in the raw Azgaar export, and also lost if `travel-graph.json` is ever regenerated.** The project owner's call: mountain settlements should read as Dwarf, not whatever race the original export happened to assign. Cross-referencing every burg's `cell` against that cell's elevation in `game-map.json` (`pack.cells[cell].h >= 62`, the same `MOUNTAIN_HEIGHT_THRESHOLD` `scripts/build-world-raster/render-painterly.js` uses to decide where mountain art goes) found 17 settlements sitting on mountain terrain, only 2 of which were already Dwarf-owned. A one-off script set `race:"dwarf"` on all 17 and, for the 15 that belonged to a real (non-Dwarf) kingdom, also reassigned `state`/`stateId` to whichever *existing* Dwarf kingdom's territory centroid was geographically nearest — changing only `.race` and leaving `.state` alone would have been cosmetic no-ops for gameplay purposes, since `KINGDOM_RACE` (index.html's `buildFactionData()`) derives a settlement's *effective* race from its controlling kingdom, not its own raw `.race` field, except for the one settlement with no kingdom at all (`state: null`), where `.race` **is** read directly. Because every existing Dwarf kingdom's own territory sits clustered in the map's center-west while these mountain settlements are scattered much further out (several hundred logical units in some cases), this deliberately creates non-contiguous Dwarf enclaves deep inside other kingdoms' territory — a real geographic/thematic oddity the project owner accepted rather than the alternative (actually redrawing kingdom borders for contiguity, which is unscoped, much larger work — see roadmap.md's "Procedurally generated per-game kingdoms/borders" idea for why that's hard). No burg was removed, renamed, moved, or given a new id/cell/position — every id/quest/notable-figure reference into `travel-graph.json` still resolves exactly as before, only the settlement's own race/kingdom fields changed.

## world-raster.jpg

A 10240×5108 rendering of the world map, 4× the logical coordinate space (see [travel-and-map.md](travel-and-map.md) for why). Purely visual — the SVG `#overlay` sitting on top of it (same pixel dimensions, `viewBox="0 0 2560 1277"` so it can use logical coordinates directly) is what's actually interactive. Generated, not hand-drawn or AI-painted: `scripts/build-world-raster/render-painterly.js` (see [roadmap.md](roadmap.md)'s "World map rebuilt as a painterly render" for the design history, and [scripts/build-world-raster/README.md](../scripts/build-world-raster/README.md) for how to actually run it) renders it straight from `game-map.json`'s real cell/biome/elevation/river/state data below — coastlines, forests, rivers, and mountains all come from that data, not from art. Being purely visual with no roads/rivers/borders baked in (those are the SVG overlay, drawn separately) is what let the renderer treat them independently from the terrain underneath.

## border-water-mask.json

A precomputed land/water lookup for `index.html`'s political border overlay (`buildBorderMarkers()`
— see [travel-and-map.md](travel-and-map.md)'s border section), keeping a kingdom's territory
contour off open water. `{cols:160, rows:80, rowStrings:[...]}` — 81 strings of 161 `'0'`/`'1'`
characters, one bit per point of the same `TERRITORY_CONTOUR_COLS×ROWS` grid the contour itself is
traced on (`rowStrings[gy][gx] === '1'` means that grid point is water). Generated by
`scripts/build-world-raster/build-border-water-mask.js` from `world-raster.jpg` itself — see that
script's own header comment for why this moved from a live in-browser canvas computation to a
precomputed, checked-in file (repeated live breakage a synthetic test never caught: browser-specific
downscale quality differences and canvas read failures on real devices, at a >63x single-step
reduction ratio). **If `world-raster.jpg` is ever regenerated, re-run that script too** — same
"derived file goes stale" caveat as `travel-graph.json`'s own patches above, just for map art instead
of burg data.

## game-map.json

The raw export from the Azgaar Fantasy Map Generator that `travel-graph.json` was derived from — full cell geometry, biomes, rivers, and everything else Azgaar tracks, well beyond what the game needs. Not fetched by any page at runtime. It's a ~9.5MB single-line JSON file, which is heavy to carry in git history permanently — worth confirming with the project owner whether it belongs in version control at all, or should live outside the repo (regenerating `travel-graph.json` from it is a one-time/occasional step, not something that needs to ship with every clone). Keep it around as the source if `travel-graph.json` ever needs regenerating with more fields (e.g. biome-based encounter tables), but don't wire it into runtime fetches directly. It now has a second real consumer besides that one-time regeneration: `scripts/build-world-raster/render-painterly.js` reads it directly (cell geometry, biome, elevation, rivers, state) every time `assets/world-raster.jpg` gets rebuilt — see [roadmap.md](roadmap.md).

## `assets/map`

A 2-byte file with no clear purpose and nothing in the codebase references it. Likely a leftover from an early experiment — safe to ignore, worth deleting if you're cleaning up the repo (confirm with the project owner first per general repo hygiene, not because it does anything).
