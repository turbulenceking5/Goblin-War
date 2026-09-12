# build-world-raster

Offline Node tool that renders `assets/world-raster.jpg` — the painterly map image the game
displays under its interactive SVG overlay. Not part of the game's runtime; nothing in the
browser ever loads this folder. See [../../context/data-files.md](../../context/data-files.md)
for what the output is used for and [../../context/roadmap.md](../../context/roadmap.md)'s
"World map rebuilt as a painterly render" section for how the look was designed and why (biome
fill, coastline distance transform, river tracing, forests, hachures, clouds, waves).

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

The full render (10240×5108) takes a while and prints progress per stage (water bands, land
fill, blur, stipple, rivers, linework, composite).

## CLI flags

All optional, passed after the script name (`node render-painterly.js --out ... --blur ...`) —
`npm run build` doesn't forward extra args past `--`, so use the `node` form directly if you need
these:

| Flag | Default | Effect |
|---|---|---|
| `--out <path>` | `assets/world-raster-preview.jpg` | Where the rendered JPEG is written. |
| `--blur <sigma>` | `1.2` | Gaussian blur applied to the merged land/water fill before crisp linework is composited on top. Kept small now that `--pixel` (below) does the actual soft/blocky look — a bigger blur here just muddies fine linework into the pixelation's block-averaging. |
| `--river-blur <sigma>` | `1.1` | Separate, lighter blur applied only to the river layer, to soften rare river-crossing overlaps without softening coastline/trees/hachures. |
| `--water-blur <sigma>` | `18` | Blur applied only to the water-band layer (in raster px), before it's merged with land — this is what actually makes the coastline's fade-to-deep-ocean read as soft; the band colors themselves are already linearly interpolated by distance, but that alone wasn't enough. |
| `--pixel <blockSize>` | `3` | Pixel-art pass: downsamples the whole finished composite to `width/blockSize` with a smoothing kernel, then scales back up with nearest-neighbor (no interpolation) — turns smooth curves into visible hard-edged blocks. `0` disables it. |
| `--sundown <strength>` | `0.35` | Warm, low-sun color grade (0-1), soft-light blended over the whole map after pixelation. `0` disables it. Implemented as a full-strength blend re-composited at partial alpha — libvips' blend-mode compositing ignores an overlay's own alpha, so a naive semi-transparent overlay silently composites at 100% strength regardless of the number here. |

## Determinism

Tree placement, cloud positions, wave marks, and mountain hachures are all seeded
(`mulberry32`, keyed off each cell's own id) rather than using `Math.random()` — re-running the
build with unchanged input data reproduces the same output, so a diff in the resulting JPEG means
the source data or the script actually changed, not random jitter.
