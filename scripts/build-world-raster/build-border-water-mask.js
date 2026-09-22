#!/usr/bin/env node
// Precomputes the land/water classification index.html's political border overlay uses to keep a
// kingdom's territory contour off open water (see context/travel-and-map.md's "border" section,
// the "Rebuilt a fourth time" entry onward, and buildBorderMarkers()/TERRITORY_CONTOUR_COLS/ROWS
// in index.html) — and writes it to assets/border-water-mask.json as static, checked-in data,
// the same "computed offline, read as plain JSON at runtime" shape travel-graph.json itself
// already uses.
//
// This replaces an earlier version that computed this mask live in the browser, once per session,
// via a canvas 2D drawImage()+getImageData() downscale of assets/world-raster.jpg. That approach
// went through several rounds of live breakage a synthetic/offline test never caught: a canvas
// downscale ratio this extreme (10240x5108 -> 161x81, over 63x) doesn't resample consistently
// across browser engines, and on top of that, canvas reads can fail outright on a real device for
// reasons a Chromium-based Playwright test harness never exercises (memory limits, a tainted
// canvas, an image decode failure) — each of which produced the exact same visible symptom (the
// border falling back to its old pre-mask look: a straight line cutting across open water) on a
// real player's phone that never reproduced in this project's own verification. Precomputing the
// mask offline, once, with a real high-quality image library (sharp's default Lanczos3 downscale
// kernel) and shipping the *result* as data sidesteps browser-downscale-quality differences and
// runtime canvas failures entirely — index.html now just fetches this file the same way it already
// fetches travel-graph.json, no canvas, no image decode, no async race with the first paint.
//
// Run from anywhere after `npm install` in this directory (sharp is this project's own
// dependency — see package.json):
//
//   node scripts/build-world-raster/build-border-water-mask.js
//
// Not part of the game's runtime, same as this directory's own render-painterly.js and
// scripts/tag-burg-biomes.js — re-run only when assets/world-raster.jpg itself changes.

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..', '..');
const RASTER_PATH = path.join(ROOT, 'assets', 'world-raster.jpg');
const OUT_PATH = path.join(ROOT, 'assets', 'border-water-mask.json');

// Must match TERRITORY_CONTOUR_COLS/ROWS in index.html — the mask is sampled at exactly the
// contour grid's own vertex resolution (cols+1 x rows+1), one water/land bit per grid point.
const COLS = 160, ROWS = 80;
const WIDTH = COLS + 1, HEIGHT = ROWS + 1;

// isWater = blue beats red by more than this margin — calibrated against the real image with
// Python/PIL before either version of this mask shipped: correctly separated all 426 real burgs
// (including all 76 coastal ports) from open-ocean sample points with zero misclassifications,
// comfortable margins on both sides (land: red beats blue by 16+; water: blue beats red by 19-27).
const WATER_THRESHOLD = 5;

async function main(){
  const { data, info } = await sharp(RASTER_PATH)
    .resize(WIDTH, HEIGHT, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  if(info.channels < 3){
    throw new Error(`expected at least 3 channels (RGB), got ${info.channels}`);
  }

  const rows = [];
  for(let gy = 0; gy < HEIGHT; gy++){
    let row = '';
    for(let gx = 0; gx < WIDTH; gx++){
      const i = (gy * WIDTH + gx) * info.channels;
      const r = data[i], b = data[i + 2];
      row += (b - r) > WATER_THRESHOLD ? '1' : '0';
    }
    rows.push(row);
  }

  const waterCount = rows.reduce((sum, row) => sum + row.split('').filter(c => c === '1').length, 0);
  const totalCount = WIDTH * HEIGHT;

  const out = { cols: COLS, rows: ROWS, rowStrings: rows };
  fs.writeFileSync(OUT_PATH, JSON.stringify(out));
  console.log(`wrote ${OUT_PATH}`);
  console.log(`${waterCount}/${totalCount} grid points classified as water (${(100*waterCount/totalCount).toFixed(1)}%)`);
}

main().catch(err => { console.error(err); process.exit(1); });
