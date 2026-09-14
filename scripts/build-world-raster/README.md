# build-world-raster

Offline Node tool that renders `assets/world-raster.jpg` — the painterly map image the game
displays under its interactive SVG overlay. Not part of the game's runtime; nothing in the
browser ever loads this folder. See [../../context/data-files.md](../../context/data-files.md)
for what the output is used for and [../../context/roadmap.md](../../context/roadmap.md)'s
"World map rebuilt as a painterly render" section for how the look was designed and why (biome
fill, coastline distance transform, river tracing, clouds, and — the latest revision — real
generated sprite/texture art for forests, mountains, water, and land grain, read from
`assets/map-sprites/` at a fixed path rather than passed as a flag).

## Setup

```
cd scripts/build-world-raster
npm install
```

Installs `sharp` (the only dependency) into this folder's own gitignored `node_modules` — a
separate npm project from the rest of the repo, which has no `package.json` at all.

## Running it

```
npm run build
```

equivalent to:

```
node render-painterly.js
```

Reads `assets/game-map.json` (the raw Azgaar export — real cell geometry, biome, elevation,
rivers, state) and writes `assets/world-raster-preview.jpg`, **not** the live asset. Inspect the
preview and only then copy it over `assets/world-raster.jpg` once it looks right:

```
copy assets\world-raster-preview.jpg ..\..\assets\world-raster.jpg
```

The full render (10240×5108) prints progress per stage (water bands, land fill, blur, rivers,
icon-variant caching, tree/mountain placement, grain masking, composite, pixelation, sundown) and
takes roughly 20-30 seconds — placing tens of thousands of tree/mountain sprites used to make this
hang indefinitely (see the "raw-blit" note in roadmap.md) until that got fixed.

## CLI flags

All optional, passed after the script name (`node render-painterly.js --out ... --blur ...`) —
`npm run build` doesn't forward extra args past `--`, so use the `node` form directly if you need
these:

| Flag | Default | Effect |
|---|---|---|
| `--out <path>` | `assets/world-raster-preview.jpg` | Where the rendered JPEG is written. |
| `--blur <sigma>` | `1.2` | Gaussian blur applied to the merged land/water fill before crisp linework is composited on top. Kept small now that `--pixel` (below) does the actual soft/blocky look — a bigger blur here just muddies fine linework into the pixelation's block-averaging. |
| `--river-blur <sigma>` | `1.1` | Separate, lighter blur applied only to the river layer, to soften rare river-crossing overlaps without softening the coastline. |
| `--water-blur <sigma>` | `3` | Blur applied only to the water-band color layer (in raster px), before the water texture tiles on top of it — softens the hard distance-threshold band seams. Dialed back hard from an original `18` once the map committed to a real pixel-art look (that strength was enough to wash out the pixelation pass entirely on water specifically). |
| `--water-texture-strength <0-1>` | `0.4` | How strongly the blended water texture (real ripple detail) shows over the band-color water raster — the band coloring still shows through underneath for the correct shallow/deep hue. Brought down from an original `0.55` since the texture was drawing enough attention to wash out the shore-to-deep color shift. |
| `--pixel <blockSize>` | `3` | Pixel-art pass: downsamples the whole finished composite to `width/blockSize` with a smoothing kernel, then scales back up with nearest-neighbor (no interpolation) — turns smooth curves into visible hard-edged blocks. `0` disables it. |
| `--sundown <strength>` | `0.35` | Warm, low-sun color grade (0-1), soft-light blended over the whole map after pixelation. `0` disables it. Implemented as a full-strength blend re-composited at partial alpha — libvips' blend-mode compositing ignores an overlay's own alpha, so a naive semi-transparent overlay silently composites at 100% strength regardless of the number here. |

Tree icon sizes, rotation count, and per-cell placement density are constants near the top of
`render-painterly.js` (`TREE_ICON_SIZES`, `ICON_ROTATIONS`, the `clumpCount`/`CLUMP_RADIUS` in
`buildSVG`), not CLI flags — tune those directly if a re-render needs denser/sparser forests.
Conifer trees pool multiple shape files the same way mountains do (`listConiferSpritePaths()`
auto-detects any `tree-conifer*.png`, each placement rolls a random shape via `pickShapeVariant`);
deciduous only ever had the one good shape, so it stays a single fixed path.

Mountains don't place discrete icons at all (an earlier version did — per-cell count, then real
minimum-distance/Poisson-disc thinning; see roadmap.md for the several rounds that took and why it
was abandoned). `buildBlendedMountainLayer` instead tiles every `mountain-peak*.png` shape across
the *entire* canvas independently (own random tile size, offset, and flip) and blends them with
the same sharpened-weight-field technique water uses below, but alpha-aware: a layer only competes
for a pixel it actually covers, so the result is opaque wherever at least one shape covers a point
and transparent only where none do. The blended result gets a light overall edge feather
(`featherAlphaEdges`) and is clipped to the real mountain-elevation cells via a plain
`mountainMaskSVG` mask (`dest-in`, same idiom `grainMasked` uses against `landPng`). Each layer's
own tile *size* is randomized (not just offset), not just flip — sharing one tile size across all
4 layers left a faint but real repeating pattern visible at full zoom-out, since even
independently-offset copies of the same-sized tile share that size's underlying repeat period.

Water pools multiple source *images* too, split into two roles: `listWaterDeepPaths()`
(`water-texture.jpg`/`water-texture-2.jpg`/etc. — open ocean) and `listWaterShallowPaths()`
(`water-shallow.jpg`/`water-shallow-2.jpg`/etc. — coastal/shore). Like mountains, it doesn't assign
one image per grid cell — `buildBlendedWaterLayer` (via the shared `buildMultiLayerBlend` helper)
tiles every image in each set across the *entire* canvas independently and blends each set's
images together with smooth, sharpened per-layer weight fields, so there's no tile boundary
anywhere within a set (a per-tile assignment still showed a visible edge between different images
even after tone-matching them — see roadmap.md's own note on the couple of rounds that took,
including a real channel-count bug along the way, the same class of bug mountains hit too). The
two sets' blends are then mixed using the same distance-from-shore field the water's color bands
are built from (see `buildWaterBandRaster`'s `shallowWeightRaster`), so the shallow set actually
fades in near the coast rather than being mixed in everywhere at random. A new water image (either
role) still needs its brightness/tone matched to the existing ones first, or it'll stand out
within the blend the same way it would in a tiled grid.

## Determinism

Tree/mountain placement, cloud positions, and land grain are all seeded (`mulberry32`, keyed off
each cell's own id) rather than using `Math.random()` — re-running the build with unchanged input
data reproduces the same output, so a diff in the resulting JPEG means the source data or the
script actually changed, not random jitter.

## Sprite/texture assets

`assets/map-sprites/` holds the real generated art this script composites in for forests,
mountains, water, and land grain (`tree-deciduous.png`, `tree-conifer.png`, `mountain-peak.png`
through `mountain-peak-4.png`, `grain-texture.png`, `water-texture.jpg`/`water-texture-2.jpg`/etc.
for deep ocean, `water-shallow.jpg`/etc. for shore) — read from that fixed path
(`SPRITE_PATHS`/`listMountainSpritePaths()`/`listWaterDeepPaths()`/`listWaterShallowPaths()` at the
top of `render-painterly.js`), not passed as a flag. Replacing one means overwriting the file(s)
there directly. See [../../context/roadmap.md](../../context/roadmap.md)'s "World map rebuilt as a
painterly render" section for how these were generated (a companion "Terrain Prompt Forge" Claude
Artifact holds the actual generation prompts) and processed:
- **Icons** (trees, mountains): magenta chroma-key de-fringing, hard-cut to real alpha rather than
  soft antialiasing. One conifer regeneration came back on a non-magenta background despite the
  prompt — keyed out fine anyway by sampling that image's own corner pixel as the background color
  instead of assuming `#ff00ff`.
- **Land grain**: came back as an opaque JPEG with a literal checkerboard graphic instead of a
  real alpha channel — recovered by classifying near-neutral pixels as background.
- **Water**: an obvious repeating pattern once tiled turned out to be a big soft light/dark blob
  baked into the source art itself (not a boundary-edge seam, despite first appearances) — fixed
  by flattening that large-scale gradient out (subtract a heavily-blurred copy of the image from
  itself, add back the global mean) rather than editing the tile's edges. Once several water
  images were combined into one pool, a *second* issue showed up: each was independently generated
  and landed at a different overall brightness/tone, so a boundary between two different source
  images read as an obvious rectangular seam even though each was individually clean. Fixed by
  matching every image's per-channel mean color to one shared target (the average across all of
  them) before using them as a pool — any new water image added later needs this same treatment,
  not just the flatten step, or it'll reintroduce a visible grid.
