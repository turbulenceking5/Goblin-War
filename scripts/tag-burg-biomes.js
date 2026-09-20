#!/usr/bin/env node
// Derived-data patch: adds a `biome` category string to every burg in assets/travel-graph.json,
// read from assets/game-map.json's raw per-cell Azgaar biome/elevation data (pack.cells[burg.cell]).
// Backs index.html's BIOME_ART/getBiomeBackdrop (see context/combat.md's "Environment backdrop"
// section) — real combat-encounter art picked by where an ambush actually happened, instead of
// every road ambush always showing a Forest scene regardless of terrain.
//
// Reduces Azgaar's 12 raw biome ids down to the 7 categories index.html's BIOME_ART keys off:
// forest/plains/desert/swamp/snow/hills/mountains. Coast is deliberately NOT one of them —
// travel-graph.json's existing `port` field already answers "is this settlement coastal?" for
// free, no biome data needed (see getBiomeBackdrop).
//
// Plain Node, no dependencies, standalone from scripts/build-world-raster's own npm project
// (this only reads/writes JSON, no image work). Run from the repo root once game-map.json is
// present locally — it's gitignored, not checked in, see context/data-files.md:
//
//   node scripts/tag-burg-biomes.js
//
// Overwrites assets/travel-graph.json in place, same "regenerate and copy over" caveat every
// other one-off patch to this file carries (see data-files.md's settlement-thinning/kingdom-
// name/mountain-race patches) — if travel-graph.json is ever rebuilt from game-map.json again,
// this needs re-running, since the `biome` field only lives in the derived file.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const GAME_MAP_PATH = path.join(ROOT, 'assets/game-map.json');
const TRAVEL_GRAPH_PATH = path.join(ROOT, 'assets/travel-graph.json');

// Same constant scripts/build-world-raster/render-painterly.js uses to decide where mountain
// art/color bands go — kept in sync so a settlement showing as mountain-terrain on the map
// itself also fights its ambushes with a mountain backdrop.
const MOUNTAIN_HEIGHT_THRESHOLD = 62;
// Azgaar has no discrete "hills" biome, and elevation is the only signal available to fake one
// with — this exact cutoff is a judgment call, not derived from anything in the source data, and
// worth tuning against real map screenshots once Hills art exists to check it against.
const HILL_HEIGHT_THRESHOLD = 40;

// Azgaar's raw biome ids -> the game's own combat-backdrop categories.
const BIOME_CATEGORY = {
  1: 'desert',  // Hot desert
  2: 'desert',  // Cold desert
  3: 'plains',  // Savanna
  4: 'plains',  // Grassland
  5: 'forest',  // Tropical seasonal forest
  6: 'forest',  // Temperate deciduous forest
  7: 'forest',  // Tropical rainforest
  8: 'forest',  // Temperate rainforest
  9: 'snow',    // Taiga — cold conifer forest; grouped with Snow rather than Forest since it's
                // the game's only signal for "cold", and a snowy-conifer scene reads closer to
                // Snow than to a temperate/tropical Forest backdrop
  10: 'snow',   // Tundra
  11: 'snow',   // Glacier
  12: 'swamp',  // Wetland
  // 0 (Marine) never applies — a burg is never sited on an open-water cell.
};

function categorize(cell){
  if(cell.h >= MOUNTAIN_HEIGHT_THRESHOLD) return 'mountains'; // overrides biome, same rule render-painterly.js uses
  if(cell.h >= HILL_HEIGHT_THRESHOLD) return 'hills';
  return BIOME_CATEGORY[cell.biome] || 'plains';
}

const { pack } = JSON.parse(fs.readFileSync(GAME_MAP_PATH, 'utf8'));
const graph = JSON.parse(fs.readFileSync(TRAVEL_GRAPH_PATH, 'utf8'));

const counts = {};
let tagged = 0;
const burgIds = Object.keys(graph.burgs);
for(const id of burgIds){
  const burg = graph.burgs[id];
  const cell = pack.cells[burg.cell];
  if(!cell) continue;
  burg.biome = categorize(cell);
  counts[burg.biome] = (counts[burg.biome] || 0) + 1;
  tagged++;
}

fs.writeFileSync(TRAVEL_GRAPH_PATH, JSON.stringify(graph));
console.log(`Tagged ${tagged}/${burgIds.length} burgs with a biome category.`);
console.log(counts);
