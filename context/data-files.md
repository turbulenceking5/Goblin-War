# Data Files (assets/)

| File | Size | Fetched at runtime? |
|---|---|---|
| `travel-graph.json` | ~400KB | Yes — index.html, character.html, settings.html |
| `world-raster.jpg` | ~6.5MB | Yes — `<img id="map-img">` in index.html and game-map.html |
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

## world-raster.jpg

A 10240×5108 rendering of the world map, 4× the logical coordinate space (see [travel-and-map.md](travel-and-map.md) for why). Purely visual — the SVG `#overlay` sitting on top of it (same pixel dimensions, `viewBox="0 0 2560 1277"` so it can use logical coordinates directly) is what's actually interactive.

## game-map.json

The raw export from the Azgaar Fantasy Map Generator that `travel-graph.json` was derived from — full cell geometry, biomes, rivers, and everything else Azgaar tracks, well beyond what the game needs. Not fetched by any page at runtime. It's a ~9.5MB single-line JSON file, which is heavy to carry in git history permanently — worth confirming with the project owner whether it belongs in version control at all, or should live outside the repo (regenerating `travel-graph.json` from it is a one-time/occasional step, not something that needs to ship with every clone). Keep it around as the source if `travel-graph.json` ever needs regenerating with more fields (e.g. biome-based encounter tables), but don't wire it into runtime fetches directly.

## `assets/map`

A 2-byte file with no clear purpose and nothing in the codebase references it. Likely a leftover from an early experiment — safe to ignore, worth deleting if you're cleaning up the repo (confirm with the project owner first per general repo hygiene, not because it does anything).
