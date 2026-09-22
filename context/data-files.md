# Data Files (assets/)

| File | Size | Fetched at runtime? |
|---|---|---|
| `travel-graph.json` | ~400KB | Yes — index.html, character.html, settings.html |
| `world-raster.jpg` | ~6.5MB | Yes — `<img id="map-img">` in index.html and game-map.html |
| `border-water-mask.json` | ~13KB | Yes — index.html's `loadBorderWaterMask()` |
| `game-map.json` | ~9.5MB | No |
| `map` | 2 bytes | No — stray/placeholder file, not referenced anywhere |

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
