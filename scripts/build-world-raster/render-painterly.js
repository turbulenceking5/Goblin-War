#!/usr/bin/env node
// Renders assets/world-raster.jpg as a soft, painterly hand-drawn-style map (the project
// owner's actual target look — see the reference discussed in context/roadmap.md) directly
// from assets/game-map.json's real Voronoi cell geometry, biome, elevation, river, and state
// data. Replaces the earlier chunky pixel-art tileset approach entirely: no external art
// generation, no seams to manage — everything is vector-rendered then blurred for soft
// blending, with crisp linework (coastline, rivers, tree icons) layered on top unblurred.
"use strict";
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const GAME_MAP_PATH = path.join(REPO_ROOT, "assets", "game-map.json");
const DEFAULT_OUT_PATH = path.join(REPO_ROOT, "assets", "world-raster-preview.jpg");

const LOGICAL_W = 2560;
const LOGICAL_H = 1277;
const SCALE = 4;
const RASTER_W = LOGICAL_W * SCALE;
const RASTER_H = LOGICAL_H * SCALE;

const MOUNTAIN_HEIGHT_THRESHOLD = 62;
const SNOW_HEIGHT_THRESHOLD = 82; // top slice of Mountain cells get a pale snow-cap tint
const SNOW_COLOR = "#f3f1ea";
const CLOUD_COLOR = "#4a5f6e";

// Real art assets (see context/roadmap.md's "World map rebuilt as a painterly render" and the
// project owner's "Terrain Prompt Forge" artifact) replacing what used to be vector-drawn
// stand-ins: tree/mountain icons are scattered as small raster sprites instead of SVG circles and
// triangles, and the water/land-grain textures are tiled raster images instead of a flat band
// color and a per-cell speckle scatter. Sprites were generated on a magenta chroma-key background
// and de-fringed/hard-cut to real alpha by scripts/build-world-raster's own one-off processing
// (not part of this file) before landing here.
const SPRITE_DIR = path.join(REPO_ROOT, "assets", "map-sprites");
const SPRITE_PATHS = {
  treeDeciduous: path.join(SPRITE_DIR, "tree-deciduous.png"),
  treeConifer: path.join(SPRITE_DIR, "tree-conifer.png"),
  grainTexture: path.join(SPRITE_DIR, "grain-texture.png"),
};
// Mountains support several distinct shape files, not just one — a single repeated massif shape
// (even rotated/resized) reads as an obviously copy-pasted icon once several sit next to each
// other forming a range. Any file matching mountain-peak.png / mountain-peak-2.png / etc. in
// SPRITE_DIR is picked up automatically; each placement rolls a random shape *and* rotation/size.
function listMountainSpritePaths() {
  const files = fs.readdirSync(SPRITE_DIR)
    .filter((f) => /^mountain-peak(-\d+)?\.png$/.test(f))
    .sort();
  return files.map((f) => path.join(SPRITE_DIR, f));
}
// Same idea for water: a single tiled texture (even with its own edges seamless) can still read
// as an obvious repeat once the same exact content tiles across a huge canvas — several distinct
// source images, randomly assigned per grid tile alongside the flip variation buildTiledLayer
// already does, breaks that up far more convincingly than flips of one image alone. Any file
// matching water-texture.jpg/.png, water-texture-2.jpg/.png, etc. is picked up automatically.
// Split into two roles per the project owner: "deep" open-ocean textures (water-texture*.jpg —
// the original naming, unchanged) and "shallow" coastal textures (water-shallow*.jpg — a
// distinct look meant to fade in near the shore, not just scattered everywhere at random).
function listWaterDeepPaths() {
  const files = fs.readdirSync(SPRITE_DIR)
    .filter((f) => /^water-texture(-\d+)?\.(jpe?g|png)$/i.test(f))
    .sort();
  return files.map((f) => path.join(SPRITE_DIR, f));
}
function listWaterShallowPaths() {
  const files = fs.readdirSync(SPRITE_DIR)
    .filter((f) => /^water-shallow(-\d+)?\.(jpe?g|png)$/i.test(f))
    .sort();
  return files.map((f) => path.join(SPRITE_DIR, f));
}
// Each icon is pre-rendered once per (size, rotation) combination and cached — see
// buildIconVariants — rather than resized/rotated fresh per placement, since a forest can call for
// tens of thousands of individual tree placements and rotating a fresh buffer that many times is
// the expensive part, not compositing them (sharp batches a large composite() array cheaply).
const ICON_ROTATIONS = 8; // 45° steps
const TREE_ICON_SIZES = [14, 20, 27]; // target longest edge, raster px
// Mountains went through four rounds of icon-size/placement-density tuning (see roadmap.md) before
// the project owner asked to layer the shape images together instead of placing discrete icons at
// all — see buildBlendedMountainLayer, which replaced all of that (no per-instance size constant
// needed anymore, just the shared TILE_W/TILE_H it defines internally).

// Warmed toward ochre/tan per the project owner's reference — grassland/savanna in particular
// were reading as a cool, saturated green; the reference's open plains lean golden-brown instead.
const BIOME_COLOR = {
  1: "#dcc383", // Hot desert
  2: "#bcac7d", // Cold desert
  3: "#d0b263", // Savanna
  4: "#c2b26a", // Grassland
  5: "#9aab5c", // Tropical seasonal forest
  6: "#8a9c54", // Temperate deciduous forest
  7: "#6a9a4f", // Tropical rainforest
  8: "#5c8a4a", // Temperate rainforest
  9: "#5c7a5f", // Taiga
  10: "#ab9d7e", // Tundra
  11: "#e4eef0", // Glacier
  12: "#8a8d5c", // Wetland
};
// Mountains are no longer one flat tone — see the per-cell banding in the fill loop below
// (buildSVG), which blends between these two based on elevation, low bands leaning brown/rocky,
// high bands leaning cooler grey, closer to the reference's banded rock look than a single tint.
const MOUNTAIN_COLOR_LOW = "#8a7355";
const MOUNTAIN_COLOR_HIGH = "#9a958a";
const FOREST_BIOMES = new Set([5, 6, 7, 8, 9]);
// Water depth bands, nearest-to-farthest from the coast (real pixel distance, not cell hops
// — see distanceFromLand below). Band 0 leans warm/sandy so it blends into the shoreline
// the way the reference does, rather than reading as pure water right up to the coast.
const WATER_BANDS = ["#d7e4c0", "#a8d2c4", "#6bacb6", "#3f7f9c", "#1f3f61"];
const COAST_STROKE = "#1c2f3f";
const RIVER_FILL = "#3f7ea3";
const RIVER_HALO = "#bcdce4";

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex([r, g, b]) {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}
// Mountains banded by elevation instead of one flat tint — a low mountain cell (just past
// MOUNTAIN_HEIGHT_THRESHOLD) leans brown/rocky, a high one leans cooler grey, blending linearly
// between the two up to SNOW_HEIGHT_THRESHOLD (above that, the separate snow-cap overlay in
// buildSVG takes over). Closer to the reference's real rock-face banding than a single tone.
const MOUNTAIN_LOW_RGB = hexToRgb(MOUNTAIN_COLOR_LOW);
const MOUNTAIN_HIGH_RGB = hexToRgb(MOUNTAIN_COLOR_HIGH);
function mountainBandColor(h) {
  const t = Math.max(0, Math.min(1, (h - MOUNTAIN_HEIGHT_THRESHOLD) / (SNOW_HEIGHT_THRESHOLD - MOUNTAIN_HEIGHT_THRESHOLD)));
  const rgb = MOUNTAIN_LOW_RGB.map((lo, i) => lo + (MOUNTAIN_HIGH_RGB[i] - lo) * t);
  return rgbToHex(rgb);
}

function loadPack() {
  const data = JSON.parse(fs.readFileSync(GAME_MAP_PATH, "utf8"));
  return data.pack;
}

function resolveCellPolygon(pack, cell) {
  return cell.v.map((vi) => pack.vertices[vi].p);
}

function pointsAttr(poly) {
  return poly.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}

// Finds the shared-edge neighbor pairs by vertex-set intersection rather than assuming
// cell.v/cell.c are index-parallel — they aren't reliably, especially at the map's outer
// boundary (a cell there can have fewer neighbors than vertices).
function buildEdges(pack, cells) {
  const vertSets = cells.map((c) => new Set(c.v));
  const edges = []; // { a, b, p1, p2 }
  const seen = new Set();
  for (const cell of cells) {
    for (const nb of cell.c) {
      if (nb == null || nb === cell.i || nb >= cells.length) continue;
      const key = cell.i < nb ? `${cell.i}_${nb}` : `${nb}_${cell.i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const shared = [...vertSets[cell.i]].filter((v) => vertSets[nb].has(v));
      if (shared.length < 2) continue;
      const p1 = pack.vertices[shared[0]].p;
      const p2 = pack.vertices[shared[1]].p;
      edges.push({ a: cell.i, b: nb, p1, p2 });
    }
  }
  return edges;
}

// The exact shared boundary point between two adjacent cells, by vertex-set intersection
// (same technique buildEdges uses) — used to extend a river to precisely where the coast
// actually is, rather than stopping at the last land cell's centroid (which can sit a
// noticeable distance inland of the real coastline and leave a visible gap).
function sharedEdgeMidpoint(pack, cellA, cellB) {
  const setA = new Set(cellA.v);
  const shared = cellB.v.filter((v) => setA.has(v));
  if (shared.length < 2) return null;
  const p1 = pack.vertices[shared[0]].p, p2 = pack.vertices[shared[1]].p;
  return [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
}

// Two-pass chamfer (3-4) distance transform: gives a smooth per-pixel distance-to-nearest-
// land field, which is what actually produces clean concentric coastal rings — cell-hop
// distance over the water Voronoi graph doesn't, since water cells are huge and irregular
// far from shore (that's what the first render's blocky water patches were).
function distanceFromLand(landMask, w, h) {
  const INF = 1e9;
  const dist = new Float32Array(w * h).fill(INF);
  for (let i = 0; i < w * h; i++) if (landMask[i]) dist[i] = 0;
  const at = (x, y) => dist[y * w + x];
  const set = (x, y, v) => { if (v < dist[y * w + x]) dist[y * w + x] = v; };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (landMask[y * w + x]) continue;
      let d = dist[y * w + x];
      if (x > 0) d = Math.min(d, at(x - 1, y) + 3);
      if (y > 0) d = Math.min(d, at(x, y - 1) + 3);
      if (x > 0 && y > 0) d = Math.min(d, at(x - 1, y - 1) + 4);
      if (x < w - 1 && y > 0) d = Math.min(d, at(x + 1, y - 1) + 4);
      dist[y * w + x] = d;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      if (landMask[y * w + x]) continue;
      let d = dist[y * w + x];
      if (x < w - 1) d = Math.min(d, at(x + 1, y) + 3);
      if (y < h - 1) d = Math.min(d, at(x, y + 1) + 3);
      if (x < w - 1 && y < h - 1) d = Math.min(d, at(x + 1, y + 1) + 4);
      if (x > 0 && y < h - 1) d = Math.min(d, at(x - 1, y + 1) + 4);
      dist[y * w + x] = d;
    }
  }
  for (let i = 0; i < dist.length; i++) dist[i] /= 3; // chamfer units -> approx pixels
  return dist;
}

// Renders just the land/mountain mask (1) vs water (0) at a modest working resolution —
// plenty of precision for band widths of a dozen-plus logical px, and far cheaper than a
// 10240x5108 flood fill.
async function buildWaterBandRaster(pack, cells, polys, bandThresholds, waterBlurSigma) {
  const w = LOGICAL_W, h = LOGICAL_H;
  let maskSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${LOGICAL_W} ${LOGICAL_H}">`;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i].biome === 0) continue;
    maskSVG += `<polygon points="${pointsAttr(polys[i])}" fill="#fff"/>`;
  }
  maskSVG += `</svg>`;
  const { data } = await sharp(Buffer.from(maskSVG)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const landMask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) landMask[i] = data[i * 4 + 3] > 128 ? 1 : 0; // alpha channel = land coverage
  const dist = distanceFromLand(landMask, w, h);

  const bandColors = WATER_BANDS.map((hex) => {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  });
  // Per the project owner: a real fade between bands, not a hard-edged step. bandDistances pins
  // each WATER_BANDS color to a specific distance-from-shore (0 for the nearest/shallowest band,
  // then each threshold in turn for the rest), and every pixel's color is linearly interpolated
  // between whichever two anchors its own distance falls between — continuous the whole way out,
  // rather than snapping to whichever single band it happened to land in.
  const bandDistances = [0, ...bandThresholds];
  const out = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    const d = dist[i];
    let r, g, bch;
    if (d <= bandDistances[0]) {
      [r, g, bch] = bandColors[0];
    } else if (d >= bandDistances[bandDistances.length - 1]) {
      [r, g, bch] = bandColors[bandColors.length - 1];
    } else {
      let seg = bandDistances.length - 2;
      for (let s = 0; s < bandDistances.length - 1; s++) {
        if (d >= bandDistances[s] && d < bandDistances[s + 1]) { seg = s; break; }
      }
      const t = (d - bandDistances[seg]) / (bandDistances[seg + 1] - bandDistances[seg]);
      const c0 = bandColors[seg], c1 = bandColors[seg + 1];
      r = c0[0] + (c1[0] - c0[0]) * t;
      g = c0[1] + (c1[1] - c0[1]) * t;
      bch = c0[2] + (c1[2] - c0[2]) * t;
    }
    out[i * 3] = r; out[i * 3 + 1] = g; out[i * 3 + 2] = bch;
  }
  // Per the project owner: the linear interpolation above is smooth *in principle*, but the
  // overall composite's own blur (main()'s blurSigma, deliberately kept tiny for the pixel-art
  // look) wasn't enough to keep it reading as a soft blend once resized up — this blurs the
  // water raster specifically, before that resize, so the band transitions themselves are
  // genuinely soft rather than relying on a blur pass meant for the whole map to do it too.
  let pipeline = sharp(out, { raw: { width: w, height: h, channels: 3 } }).resize(RASTER_W, RASTER_H);
  if (waterBlurSigma > 0) pipeline = pipeline.blur(waterBlurSigma);
  const png = await pipeline.png().toBuffer();

  // Also derive a shallow-water *texture* weight field from the same distance-from-land data
  // (1 right at the coast, fading to 0 by the last band threshold) — used by
  // buildBlendedWaterLayer to fade in an actual shallow-water texture near shore rather than just
  // a shallower color, per the project owner's ask. Reuses `dist` rather than recomputing it.
  const shallowRange = bandDistances[bandDistances.length - 1];
  const shallowRaw = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) shallowRaw[i] = Math.round(255 * Math.max(0, Math.min(1, 1 - dist[i] / shallowRange)));
  const shallowWeightRaster = await sharp(Buffer.from(shallowRaw), { raw: { width: w, height: h, channels: 1 } })
    .resize(RASTER_W, RASTER_H)
    .raw().toBuffer();

  return { png, shallowWeightRaster };
}

// Deterministic per-cell pseudo-random, so re-running the build doesn't jitter tree
// placement around for no reason.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cellRadius(poly, cx, cy) {
  let maxD = 0;
  for (const [x, y] of poly) maxD = Math.max(maxD, Math.hypot(x - cx, y - cy));
  return maxD;
}

// Chaikin corner-cutting: rivers were being drawn as a straight polyline through each
// cell's centroid, which zigzags sharply from one coarse Voronoi cell to the next and reads
// as "broken" rather than a flowing river. A first attempt fixed that with Catmull-Rom
// curve fitting, but Catmull-Rom extrapolates a tangent through each point, and on a river
// that makes a sharp hairpin turn (common — it's following coarse terrain cells) that
// extrapolation overshoots into a visible pinched cusp. Chaikin only ever interpolates
// (each new point is a blend of two existing ones, never extrapolated beyond them), so it
// can smooth a sharp turn without ever producing a cusp or loop.
function chaikinSmooth(points, iterations = 3) {
  let pts = points;
  for (let it = 0; it < iterations; it++) {
    const next = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
      next.push([x1 + 0.25 * (x2 - x1), y1 + 0.25 * (y2 - y1)]);
      next.push([x1 + 0.75 * (x2 - x1), y1 + 0.75 * (y2 - y1)]);
    }
    next.push(pts[pts.length - 1]);
    pts = next;
  }
  return pts;
}
function smoothPath(points) {
  const pts = points.length < 3 ? points : chaikinSmooth(points);
  return `M${pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" L")}`;
}

function buildSVG(pack) {
  const cells = pack.cells;
  const polys = cells.map((c) => resolveCellPolygon(pack, c));
  const edges = buildEdges(pack, cells);

  // --- Layer A: land/mountain fill only, transparent elsewhere — water is a separate
  // pixel-distance-field raster (buildWaterBandRaster) composited underneath, since true
  // concentric rings need real distance-to-coast, not the huge/irregular water cells here.
  let fillLayer = "";
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (c.biome === 0) continue;
    const color = c.h >= MOUNTAIN_HEIGHT_THRESHOLD ? mountainBandColor(c.h) : (BIOME_COLOR[c.biome] || "#c2b26a");
    fillLayer += `<polygon points="${pointsAttr(polys[i])}" fill="${color}"/>`;
    // Snow caps: a pale tint over just the very highest peaks, layered on top of the base
    // mountain fill so it blurs into a soft cap rather than a hard-edged patch.
    if (c.h >= SNOW_HEIGHT_THRESHOLD) {
      fillLayer += `<polygon points="${pointsAttr(polys[i])}" fill="${SNOW_COLOR}" fill-opacity="0.65"/>`;
    }
  }

  // Cloud shadows: a handful of large, very faint soft blobs drifting across the whole
  // canvas (land and water alike, since clouds don't care about coastlines) — drawn into
  // this same layer so they pick up the same blur as everything else and read as
  // atmospheric haze rather than a hard-edged shape. Seeded, not tied to any cell.
  const cloudRand = mulberry32(0x516c0);
  const CLOUD_COUNT = 16;
  for (let i = 0; i < CLOUD_COUNT; i++) {
    const cx = cloudRand() * LOGICAL_W, cy = cloudRand() * LOGICAL_H;
    const rx = 60 + cloudRand() * 120, ry = rx * (0.4 + cloudRand() * 0.3);
    const rot = cloudRand() * 360;
    fillLayer += `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="${CLOUD_COLOR}" fill-opacity="0.07" transform="rotate(${rot.toFixed(1)} ${cx.toFixed(1)} ${cy.toFixed(1)})"/>`;
  }

  // --- Layer B: crisp linework/icons on top (coastline, rivers, trees) ---
  let coastPath = "";
  for (const { a, b, p1, p2 } of edges) {
    const waterA = cells[a].biome === 0, waterB = cells[b].biome === 0;
    if (waterA === waterB) continue;
    coastPath += `M${p1[0].toFixed(1)},${p1[1].toFixed(1)} L${p2[0].toFixed(1)},${p2[1].toFixed(1)} `;
  }
  const coastLine = `<path d="${coastPath}" stroke="${COAST_STROKE}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;

  // Three real bugs here previously: (1) each river drew its own halo+centerline back to
  // back, so at a confluence a later river's light halo painted right over an earlier
  // river's dark centerline, breaking the line; fixed by drawing every halo first, then
  // every centerline on top, in two passes. (2) rivers included one water cell "so they'd
  // reach the shore", which combined with (3) a round line cap — which extends a stroke
  // past its actual last point by half the stroke width — made every river mouth look like
  // a sharp arrowhead spiking through the coastline stroke instead of blending into it.
  // Fixed by stopping strictly at the last *land* cell and using a flush "butt" cap, so
  // nothing overshoots past real data into the water or through the coast.
  let riverLines = "";
  if (Array.isArray(pack.rivers)) {
    const riverDs = [];
    for (const r of pack.rivers) {
      if (!Array.isArray(r.cells) || r.cells.length < 2) continue;
      const cellSeq = r.cells.map((ci) => cells[ci]).filter((c) => c && Array.isArray(c.p) && isFinite(c.p[0]) && isFinite(c.p[1]));
      let cut = cellSeq.length;
      for (let i = 0; i < cellSeq.length; i++) {
        if (cellSeq[i].biome === 0) { cut = i; break; } // first water cell — stop the centroid trail here
      }
      const pts = cellSeq.slice(0, cut).map((c) => c.p);
      // Extend to the real coastline boundary between the last land cell and that first
      // water cell, instead of leaving the river hanging at the land cell's centroid —
      // stopping at the centroid alone was leaving a visible gap short of the actual shore.
      if (cut < cellSeq.length && pts.length > 0) {
        const mid = sharedEdgeMidpoint(pack, cellSeq[cut - 1], cellSeq[cut]);
        if (mid) pts.push(mid);
      }
      if (pts.length < 2) continue;
      // Slightly thinner than before, per the project owner's call on softening the rare
      // case of two unrelated rivers passing close together — thinner strokes plus a small
      // blur (applied to this layer only, see RIVER_BLUR_SIGMA in main()) make a crossing
      // read as a soft blend instead of a hard doubled line, without blurring the rest of
      // the crisp linework (coastline/borders/trees/hachures).
      const w = Math.max(0.7, Math.min(4.5, (r.width || 1) * 1.3));

      // Tapers from thin at the source (every river's own cells[0] is a genuine headwater —
      // tributaries join a parent at their downstream end, not their start) up to full width
      // at the mouth, instead of starting at full width from a dead stop. SVG strokes can't
      // vary width continuously along one path, so this is stepped: split into a few
      // overlapping sub-paths (sharing their boundary point so there's no gap) each with its
      // own width, narrowest first.
      const STEPS = 4;
      const segments = [];
      if (pts.length - 1 < STEPS) {
        segments.push({ pts, widthMul: 1 });
      } else {
        for (let s = 0; s < STEPS; s++) {
          const from = Math.floor((s * (pts.length - 1)) / STEPS);
          const to = Math.floor(((s + 1) * (pts.length - 1)) / STEPS);
          segments.push({ pts: pts.slice(from, to + 1), widthMul: 0.35 + (0.65 * (s + 1)) / STEPS });
        }
      }
      // Every segment gets a round cap (natural at the tapering source, and harmless at the
      // internal joints between taper steps — the next, wider segment's own round cap
      // overlaps and hides it) EXCEPT the last one, which ends at the coastline and must
      // stay flush ("butt") — a round cap there extends past the endpoint and is exactly
      // what caused the earlier arrowhead-through-the-coast bug.
      riverDs.push({ segments: segments.map((seg, idx) => ({ d: smoothPath(seg.pts), w: w * seg.widthMul, cap: idx === segments.length - 1 ? "butt" : "round" })) });
    }
    for (const { segments } of riverDs) for (const { d, w, cap } of segments) riverLines += `<path d="${d}" stroke="${RIVER_HALO}" stroke-width="${w + 1}" fill="none" stroke-linecap="${cap}" stroke-linejoin="round"/>`;
    for (const { segments } of riverDs) for (const { d, w, cap } of segments) riverLines += `<path d="${d}" stroke="${RIVER_FILL}" stroke-width="${w}" fill="none" stroke-linecap="${cap}" stroke-linejoin="round"/>`;
  }

  // Tree placements: real sprite art (see SPRITE_PATHS.treeDeciduous/treeConifer) scattered at
  // per-cell seeded positions, one whole *clump* of 2-3 overlapping sprites at a time rather than
  // one icon per point — a single isolated overhead tree icon read as too sparse/graphic at map
  // scale, where real forest cover is continuous canopy, not individually spaced trees. Each
  // clump center gets its own small huddle of sprites (tight random offset, own size/rotation
  // roll each) so it reads as one denser tree-mass instead of a lone icon. main() still just
  // gets a flat list of individual sprite placements — the clumping only changes how many get
  // generated per center point, not anything downstream.
  const CLUMP_RADIUS = 2.6; // logical px — tight enough that a clump's members visibly overlap
  const treePlacements = [];
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (!FOREST_BIOMES.has(c.biome) || c.h >= MOUNTAIN_HEIGHT_THRESHOLD) continue;
    const rand = mulberry32(c.i * 2654435761);
    const [cx, cy] = c.p;
    const r = cellRadius(polys[i], cx, cy) * 0.85;
    const isConifer = c.biome === 9; // Taiga
    // Cut roughly in half from the old single-icon-per-point counts (16/13/10) — every point now
    // places a whole 2-3 sprite clump instead of one, so total sprite instances (and render time)
    // stay in the same ballpark despite each clump center reading as visibly denser.
    const clumpCount = c.biome === 8 || c.biome === 7 ? 6 : isConifer ? 5 : 4;
    for (let t = 0; t < clumpCount; t++) {
      const ang = rand() * Math.PI * 2;
      const rad = rand() * r;
      const clumpX = cx + Math.cos(ang) * rad, clumpY = cy + Math.sin(ang) * rad;
      const members = 2 + Math.floor(rand() * 2); // 2 or 3 sprites per clump
      for (let m = 0; m < members; m++) {
        const mAng = rand() * Math.PI * 2;
        const mRad = rand() * CLUMP_RADIUS;
        const x = clumpX + Math.cos(mAng) * mRad, y = clumpY + Math.sin(mAng) * mRad;
        treePlacements.push({ x, y, isConifer, sizeRoll: rand(), rotRoll: rand() });
      }
    }
  }

  // Mountains used to be discrete icon *placements* (per-cell count + size + later real
  // minimum-distance thinning, see roadmap.md for the several rounds that took) — the project
  // owner ultimately asked to "layer" mountain art together the same way water was, instead of
  // scattering individual icons at all. buildBlendedMountainLayer (main()) handles that by tiling
  // the mountain-shape images across the *whole* canvas and blending them, the same technique as
  // buildBlendedWaterLayer; this just needs a plain elevation mask to clip that continuous blend
  // down to the actual mountain-elevation cells, same idea as buildWaterBandRaster's land mask.
  let mountainMaskSVG = "";
  for (let i = 0; i < cells.length; i++) {
    if (cells[i].h >= MOUNTAIN_HEIGHT_THRESHOLD) mountainMaskSVG += `<polygon points="${pointsAttr(polys[i])}" fill="#fff"/>`;
  }

  // Per the project owner: dropped the baked-in dashed kingdom-border line entirely (drawn from
  // the Azgaar export's original/historical state field, not live territory control) — it read as
  // visual clutter, and it was already redundant with the game's real border rendering: the live
  // SVG #overlay draws the actual current frontline/territory lines on top of this raster,
  // reacting to real conquest state (see context/factions-and-territory.md's "Burg adjacency" and
  // buildFrontlineMarkers) — this file's own doc comment always said borders belonged to that
  // overlay, not baked into the art, so removing this also fixes that mismatch.

  return {
    cells, polys, treePlacements,
    fillSVG: `<svg xmlns="http://www.w3.org/2000/svg" width="${RASTER_W}" height="${RASTER_H}" viewBox="0 0 ${LOGICAL_W} ${LOGICAL_H}">${fillLayer}</svg>`,
    // Rivers render as their own layer, separate from the rest of the crisp linework, so
    // main() can give just this one a touch of blur (softens rare river-on-river crossings)
    // without softening the coastline too.
    riverSVG: `<svg xmlns="http://www.w3.org/2000/svg" width="${RASTER_W}" height="${RASTER_H}" viewBox="0 0 ${LOGICAL_W} ${LOGICAL_H}">${riverLines}</svg>`,
    // Just the coastline now — trees are raster sprite placements (composited directly in main(),
    // not part of any SVG) and mountains/water/grain are tiled+blended raster textures, not
    // vector scatter.
    lineSVG: `<svg xmlns="http://www.w3.org/2000/svg" width="${RASTER_W}" height="${RASTER_H}" viewBox="0 0 ${LOGICAL_W} ${LOGICAL_H}">${coastLine}</svg>`,
    mountainMaskSVG: `<svg xmlns="http://www.w3.org/2000/svg" width="${RASTER_W}" height="${RASTER_H}" viewBox="0 0 ${LOGICAL_W} ${LOGICAL_H}">${mountainMaskSVG}</svg>`,
  };
}

// Pre-rotates/resizes one sprite into every (size, rotation) combination it'll be placed at, so
// main()'s placement loop just picks a cached buffer instead of rendering one per instance — see
// ICON_ROTATIONS/TREE_ICON_SIZES' own comment for why that matters at tree-forest scale. Returns
// { [size]: [{ data, width, height }, ...] } as *raw* decoded RGBA pixels, not PNG buffers — see
// blitInto's own comment for why. Rotation expands a square icon's bounding box (a 45°-rotated
// square needs ~1.41x the canvas), so each variant's actual pixel dimensions are read back from
// sharp rather than assumed, for correct centering. Trees only, now — mountains moved to a fully
// different technique (buildBlendedMountainLayer) once per-instance icon placement was dropped
// entirely in favor of layering the shape images together, per the project owner.
async function buildIconVariants(spritePath, sizes) {
  const variants = {};
  for (const size of sizes) {
    variants[size] = [];
    for (let r = 0; r < ICON_ROTATIONS; r++) {
      const angle = (r * 360) / ICON_ROTATIONS;
      const { data, info } = await sharp(spritePath)
        .resize(size, size, { fit: "inside" })
        .rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .raw().ensureAlpha().toBuffer({ resolveWithObject: true });
      variants[size].push({ data, width: info.width, height: info.height });
    }
  }
  return variants;
}

function pickVariant(variantsBySize, sizes, sizeRoll, rotRoll) {
  const size = sizes[Math.min(sizes.length - 1, Math.floor(sizeRoll * sizes.length))];
  const list = variantsBySize[size];
  return list[Math.min(list.length - 1, Math.floor(rotRoll * list.length))];
}

// Softens just the alpha channel's outer edge of a raw RGBA buffer — used on the finished
// mountain blend (buildBlendedMountainLayer) so its outer boundary (against plain grass/dirt
// fill) isn't a hard pixel-perfect cutout. A first attempt at this kind of feathering blurred
// alpha alone and produced solid black rectangles: every fully-transparent pixel is stored as RGB
// (0,0,0) (un-premultiplied, meaningless color), so once alpha-only blur gave those pixels
// partial opacity, they blended toward pure black instead of the real edge color. Fixed by
// premultiplying RGB by alpha, blurring all 4 channels together, then unpremultiplying — the
// standard way to blur something with transparency without black fringing.
async function featherAlphaEdges(data, width, height, sigma) {
  const n = width * height;
  const premult = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    const o = i * 4, af = data[o + 3] / 255;
    premult[o] = Math.round(data[o] * af);
    premult[o + 1] = Math.round(data[o + 1] * af);
    premult[o + 2] = Math.round(data[o + 2] * af);
    premult[o + 3] = data[o + 3];
  }
  const blurred = await sharp(premult, { raw: { width, height, channels: 4 } }).blur(sigma).raw().toBuffer();
  const out = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    const o = i * 4, a = blurred[o + 3];
    if (a === 0) continue; // already zeroed by Buffer.alloc
    const af = a / 255;
    out[o] = Math.max(0, Math.min(255, Math.round(blurred[o] / af)));
    out[o + 1] = Math.max(0, Math.min(255, Math.round(blurred[o + 1] / af)));
    out[o + 2] = Math.max(0, Math.min(255, Math.round(blurred[o + 2] / af)));
    out[o + 3] = a;
  }
  return out;
}

// Alpha-blends one small sprite's raw RGBA pixels directly into a big raw RGBA canvas buffer, in
// plain JS. A forest cell's worth of clumped tree placements adds up to tens of thousands of
// individual sprite instances map-wide, and handing sharp's own composite() an overlay array that
// large turned out to be the real bottleneck — a first attempt at exactly that stalled for a very
// long time (high CPU, ~3.8GB resident) and had to be killed, well past the point a render this
// size should reasonably take. Per-pixel typed-array math on tiny sprites (each at most ~95px
// square) has none of that per-layer overhead, so this replaces it: mutate the canvas buffer
// directly, then hand the finished buffer back to sharp once, as a single raw image.
function blitInto(bigData, bigW, bigH, spriteData, spriteW, spriteH, left, top) {
  const x0 = Math.max(0, left), y0 = Math.max(0, top);
  const x1 = Math.min(bigW, left + spriteW), y1 = Math.min(bigH, top + spriteH);
  if (x1 <= x0 || y1 <= y0) return;
  for (let y = y0; y < y1; y++) {
    const sy = y - top;
    let bigOff = (y * bigW + x0) * 4;
    let spriteOff = (sy * spriteW + (x0 - left)) * 4;
    for (let x = x0; x < x1; x++, bigOff += 4, spriteOff += 4) {
      const sa = spriteData[spriteOff + 3];
      if (sa === 0) continue;
      if (sa === 255) {
        bigData[bigOff] = spriteData[spriteOff];
        bigData[bigOff + 1] = spriteData[spriteOff + 1];
        bigData[bigOff + 2] = spriteData[spriteOff + 2];
      } else {
        const a = sa / 255, ia = 1 - a;
        bigData[bigOff] = spriteData[spriteOff] * a + bigData[bigOff] * ia;
        bigData[bigOff + 1] = spriteData[spriteOff + 1] * a + bigData[bigOff + 1] * ia;
        bigData[bigOff + 2] = spriteData[spriteOff + 2] * a + bigData[bigOff + 2] * ia;
      }
      bigData[bigOff + 3] = 255;
    }
  }
}

// Tiles ONE source image across the full raster canvas at a given sub-tile pixel offset (used by
// buildBlendedWaterLayer below to give each of several water layers its own phase, so they don't
// all repeat in lockstep). Composites onto a canvas one tile wider/taller than needed, then crops
// the offset window out of that — sharp's composite() won't take negative left/top, so padding
// and cropping is simpler than trying to wrap tiles around the edges directly.
// channels=3 (default, used by water — opaque JPEGs) drops alpha; channels=4 (used by mountains
// — real transparent PNGs) keeps it, since a mountain shape's transparent background is real
// content here (where there's *no* rock), not just an artifact to discard like water's opaque
// JPEG background.
async function buildOffsetTiledCanvas(tileBuf, tileW, tileH, offsetX, offsetY, channels = 3) {
  const bigW = RASTER_W + tileW, bigH = RASTER_H + tileH;
  const cols = Math.ceil(bigW / tileW) + 1, rows = Math.ceil(bigH / tileH) + 1;
  const composites = [];
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    composites.push({ input: tileBuf, left: col * tileW, top: row * tileH });
  }
  // sharp's create+composite raw output comes back as 4 channels (RGBA) regardless of the
  // channels:3 requested here — confirmed directly (info.channels was 4, hasAlpha true) — so
  // .removeAlpha() is required before .raw() when 3 channels are wanted, or the 3-channel stride
  // math below silently reads misaligned bytes (this is what produced a flattened, near-grey
  // result the first time).
  // The base canvas itself must be created with 4 channels AND a genuinely transparent
  // background when keeping alpha — creating it as channels:3 (even with an alpha value in the
  // background object, which is silently ignored) made every gap between/around the tiled shapes
  // composite as solid opaque black instead of staying transparent, confirmed directly (visible
  // black wedges cutting through the mountain blend where tiles didn't cover a pixel).
  const background = channels === 4 ? { r: 0, g: 0, b: 0, alpha: 0 } : { r: 0, g: 0, b: 0 };
  let pipeline = sharp({ create: { width: bigW, height: bigH, channels, background } }).composite(composites);
  if (channels === 3) pipeline = pipeline.removeAlpha();
  const { data } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(RASTER_W * RASTER_H * channels);
  for (let y = 0; y < RASTER_H; y++) {
    const srcStart = ((y + offsetY) * bigW + offsetX) * channels;
    data.copy(out, y * RASTER_W * channels, srcStart, srcStart + RASTER_W * channels);
  }
  return out;
}

// A low-resolution random field, upscaled with a smoothing kernel — a cheap way to get a smooth,
// organic-looking spatial weight map with no visible structure of its own (no grid, no repeat at
// this scale), used to blend multiple full-canvas water layers together (see below).
async function buildSmoothWeightField(seed, lowW, lowH) {
  const rand = mulberry32(seed);
  const low = Buffer.alloc(lowW * lowH);
  for (let i = 0; i < low.length; i++) low[i] = Math.round(rand() * 255);
  const { data } = await sharp(low, { raw: { width: lowW, height: lowH, channels: 1 } })
    .resize(RASTER_W, RASTER_H, { kernel: "cubic" })
    .raw().toBuffer({ resolveWithObject: true });
  return data;
}

// Per the project owner: assigning one whole source image per grid *tile* (buildTiledLayer's
// approach) always leaves a visible boundary where one tile's content meets a different tile's
// content, no matter how well the two images are tone-matched — matching brightness fixes the
// obvious grid-of-rectangles look, but the content itself still changes abruptly at each tile
// edge. This instead tiles every source image across the *entire* canvas independently (each at
// its own random phase offset and flip, via buildOffsetTiledCanvas, so they don't repeat in
// lockstep with each other), then blends all of them together using smooth per-layer weight
// fields (buildSmoothWeightField) normalized to sum to 1 at every pixel — so at any point on the
// map, the water is some smoothly-varying mix of all the source images rather than one full-
// strength image with a hard border to the next. No tile boundary exists anywhere in the result.
// Tiles every path in `texturePaths` across the whole canvas independently (own random phase +
// flip each) and blends them into one raw RGB buffer using sharpened, normalized weight fields —
// the core of buildBlendedWaterLayer, factored out so it can build a "deep" composite and a
// "shallow" composite separately (see buildBlendedWaterLayer's own comment for why those are two
// different sets of source images, not just two more entries in one big pool). `seedBase` keeps
// the two calls from drawing identical-looking noise fields.
async function buildMultiLayerBlend(texturePaths, seedBase) {
  const meta = await sharp(texturePaths[0]).metadata();
  const tileW = meta.width, tileH = meta.height;
  const layerRand = mulberry32(seedBase);
  const layers = [];
  for (const p of texturePaths) {
    const flip = Math.floor(layerRand() * 4);
    let base = sharp(p).resize(tileW, tileH);
    if (flip === 1) base = base.flop();
    else if (flip === 2) base = base.flip();
    else if (flip === 3) base = base.flip().flop();
    const tileBuf = await base.toBuffer();
    const offsetX = Math.floor(layerRand() * tileW), offsetY = Math.floor(layerRand() * tileH);
    layers.push(await buildOffsetTiledCanvas(tileBuf, tileW, tileH, offsetX, offsetY));
  }
  const N = layers.length;
  const totalPixels = RASTER_W * RASTER_H;
  const out = Buffer.alloc(totalPixels * 3);
  if (N === 1) { layers[0].copy(out); return out; } // nothing to blend — skip the weight-field math entirely

  const weightFields = [];
  for (let i = 0; i < N; i++) weightFields.push(await buildSmoothWeightField(seedBase + 0x9e3779b1 + i * 7919, 12, 7));
  // Raw weight values, normalized, hover close to 1/N everywhere (N independent random-ish
  // fields rarely diverge much) — a first attempt at that produced a flat, washed-out result:
  // averaging several busy wave textures together with near-equal weight everywhere cancels out
  // almost all the fine detail instead of letting any one texture read clearly. Raising each
  // weight to a high power before normalizing sharpens the contest so whichever field is
  // *locally* highest dominates strongly (weight near 1) over a broad area, with a smooth (not
  // hard-edged) handoff to a different dominant layer elsewhere — regions of real texture, not an
  // even blur of all of them.
  const WEIGHT_POWER = 10;
  const w = new Array(N);
  for (let p = 0; p < totalPixels; p++) {
    let wsum = 0;
    for (let i = 0; i < N; i++) { w[i] = Math.pow((weightFields[i][p] + 1) / 256, WEIGHT_POWER); wsum += w[i]; }
    let r = 0, g = 0, b = 0;
    const o3 = p * 3;
    for (let i = 0; i < N; i++) {
      const wn = w[i] / wsum;
      r += layers[i][o3] * wn; g += layers[i][o3 + 1] * wn; b += layers[i][o3 + 2] * wn;
    }
    out[o3] = Math.round(r); out[o3 + 1] = Math.round(g); out[o3 + 2] = Math.round(b);
  }
  return out;
}

// Per the project owner: shallow water right at the coast should use a visibly different,
// shallow-looking texture (see listWaterShallowPaths — sandy/mottled), fading into the deep-ocean
// texture set (listWaterDeepPaths — open-water waves) farther out, rather than one undifferentiated
// pool of images blended everywhere regardless of depth. Builds each set's own multi-layer blend
// independently, then mixes the two using shallowWeightRaster (the real distance-from-shore field
// buildWaterBandRaster derives its color bands from) — so the shallow texture is dominant right at
// the coast and fades out over the same distance the band coloring itself fades, not an arbitrary
// separate zone.
async function buildBlendedWaterLayer(deepPaths, shallowPaths, shallowWeightRaster) {
  const deep = await buildMultiLayerBlend(deepPaths, 0x5eed0001);
  const shallow = await buildMultiLayerBlend(shallowPaths, 0x5eed0002);
  const totalPixels = RASTER_W * RASTER_H;
  const out = Buffer.alloc(totalPixels * 4);
  for (let p = 0; p < totalPixels; p++) {
    const sw = shallowWeightRaster[p] / 255;
    const o3 = p * 3, o4 = p * 4;
    out[o4] = Math.round(shallow[o3] * sw + deep[o3] * (1 - sw));
    out[o4 + 1] = Math.round(shallow[o3 + 1] * sw + deep[o3 + 1] * (1 - sw));
    out[o4 + 2] = Math.round(shallow[o3 + 2] * sw + deep[o3 + 2] * (1 - sw));
    out[o4 + 3] = 255;
  }
  return sharp(out, { raw: { width: RASTER_W, height: RASTER_H, channels: 4 } }).png().toBuffer();
}

// Per the project owner: after several rounds of tuning discrete icon *placements* (count, size,
// real minimum-distance thinning — see roadmap.md), mountains still read as individually-stamped
// shapes rather than one continuous range, and the ask became to "layer" them together the same
// way water is. Unlike water's source images (opaque JPEGs meant to tile edge-to-edge), mountain
// PNGs are irregular shapes on a transparent background, trimmed to their own content — so this
// tiles each one into a shared letterboxed frame (own random offset + flip) across the whole
// canvas the same way buildMultiLayerBlend does, but blends with real alpha awareness: a layer
// only competes for a pixel it actually covers (weight is zero wherever that layer is
// transparent there), color blends among whichever layers *do* cover a given pixel via the same
// sharpened smooth-noise weighting, and the result is opaque wherever at least one layer covers
// it, transparent only where none do. `TILE_W`/`TILE_H`'s ~1.86 aspect matches the source
// sprites' own average aspect ratio, to minimize empty letterbox padding per tile.
async function buildBlendedMountainLayer(mountainPaths) {
  // Same tile size for every layer (only phase-offset between them) left a faint but real
  // repeating diagonal pattern visible at full zoom-out — 4 layers sharing one period still share
  // that period's overall grid structure, even with each individually offset/flipped. Giving each
  // layer its own randomized tile size (aspect kept ~1.86, matching the source sprites) means the
  // layers' periods don't line up with each other at all, so no combined repeat interval exists
  // for the eye to catch — the mountain-tuning equivalent of the water fix (color/tone matching
  // wasn't enough either; needed structurally different repeat intervals, not just different
  // content at a shared one).
  const BASE_TILE_W = 420, ASPECT = 1.86;
  const layerRand = mulberry32(0x6d0917a1);
  const layers = [];
  for (const p of mountainPaths) {
    const scale = 0.75 + layerRand() * 0.75; // 0.75x-1.5x
    const tileW = Math.round(BASE_TILE_W * scale), tileH = Math.round(tileW / ASPECT);
    const flip = Math.floor(layerRand() * 4);
    let base = sharp(p).resize(tileW, tileH, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } });
    if (flip === 1) base = base.flop();
    else if (flip === 2) base = base.flip();
    else if (flip === 3) base = base.flip().flop();
    const tileBuf = await base.png().toBuffer();
    const offsetX = Math.floor(layerRand() * tileW), offsetY = Math.floor(layerRand() * tileH);
    layers.push(await buildOffsetTiledCanvas(tileBuf, tileW, tileH, offsetX, offsetY, 4));
  }
  const N = layers.length;
  const weightFields = [];
  for (let i = 0; i < N; i++) weightFields.push(await buildSmoothWeightField(0x1234abcd + i * 7919, 12, 7));

  const WEIGHT_POWER = 10;
  const totalPixels = RASTER_W * RASTER_H;
  const out = Buffer.alloc(totalPixels * 4);
  const w = new Array(N);
  for (let p = 0; p < totalPixels; p++) {
    const o4 = p * 4;
    let wsum = 0;
    for (let i = 0; i < N; i++) {
      const a = layers[i][o4 + 3] / 255;
      w[i] = a > 0 ? Math.pow((weightFields[i][p] + 1) / 256, WEIGHT_POWER) * a : 0;
      wsum += w[i];
    }
    if (wsum === 0) { out[o4] = 0; out[o4 + 1] = 0; out[o4 + 2] = 0; out[o4 + 3] = 0; continue; }
    let r = 0, g = 0, b = 0, aOut = 0;
    for (let i = 0; i < N; i++) {
      if (w[i] === 0) continue;
      const wn = w[i] / wsum;
      r += layers[i][o4] * wn; g += layers[i][o4 + 1] * wn; b += layers[i][o4 + 2] * wn;
      aOut = Math.max(aOut, layers[i][o4 + 3]);
    }
    out[o4] = Math.round(r); out[o4 + 1] = Math.round(g); out[o4 + 2] = Math.round(b); out[o4 + 3] = aOut;
  }
  return out; // raw RGBA — caller feathers/masks/composites as needed
}

// Tiles a (typically much smaller) seamless texture across the full raster canvas — used for
// the land-grain texture, which is a large continuous surface rather than discrete scattered
// objects like the tree/mountain icons above. (Water used to share this function too — see
// buildBlendedWaterLayer above for why it moved off a discrete tile grid entirely.)
// varyTiles breaks up the obvious "same tile repeated in a grid" look a large seamless texture
// gets when tiled many times across a big canvas (confirmed: water was doing this — clear
// repeating vertical bands across the whole ocean, not a boundary-seam problem at all, since the
// source texture's own internal wave rhythm repeats every ~1/4 tile width; a seamless *edge*
// doesn't stop the *interior* pattern from visibly repeating once tiled 7-8 times). Each grid cell
// gets a deterministically-but-pseudorandomly picked flip (identity/flip-h/flip-v/both) rather
// than always the exact same orientation — flips preserve true seamlessness at the tile's own
// edges (a flipped seamless tile is still seamless against an unflipped one, since a mirror image
// of matching edge content still matches), while breaking the exact repeat that makes the
// underlying periodicity read as an obvious grid.
// texturePaths can be a single path or an array — several distinct source images (e.g. multiple
// water-texture*.jpg files, see listWaterSpritePaths) get pooled into one combined variant list
// alongside the flip variations, so a grid cell's tile is randomly one of (source image) x (flip)
// rather than just flips of a single image. All sources are resized to the first one's dimensions
// so the tiling grid math stays simple.
async function buildTiledLayer(texturePaths, varyTiles) {
  const paths = Array.isArray(texturePaths) ? texturePaths : [texturePaths];
  const meta = await sharp(paths[0]).metadata();
  const variants = [];
  for (const p of paths) {
    const base = sharp(p).resize(meta.width, meta.height);
    variants.push(await base.clone().toBuffer());
    if (varyTiles) {
      variants.push(await base.clone().flop().toBuffer()); // horizontal flip
      variants.push(await base.clone().flip().toBuffer()); // vertical flip
      variants.push(await base.clone().flip().flop().toBuffer()); // both
    }
  }
  const cols = Math.ceil(RASTER_W / meta.width) + 1;
  const rows = Math.ceil(RASTER_H / meta.height) + 1;
  const rand = mulberry32(0x7a11e5);
  const composites = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const tile = variants[Math.floor(rand() * variants.length)];
      composites.push({ input: tile, left: col * meta.width, top: row * meta.height });
    }
  }
  return sharp({ create: { width: RASTER_W, height: RASTER_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(composites)
    .png()
    .toBuffer();
}

async function main() {
  const args = process.argv.slice(2);
  const getArg = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
  const outPath = path.resolve(getArg("out", DEFAULT_OUT_PATH));
  // Softened way down from the old painterly default (3.5) — the pixelate pass below does the
  // actual blocky-look work now; a lingering big blur before it just muddies fine linework
  // (rivers, coastline) into the block-averaging instead of letting it read as real detail
  // within each block. Tree/mountain icons and the water/grain textures are composited after
  // this blur (see below), so they're unaffected by it either way.
  const blurSigma = parseFloat(getArg("blur", "1.2"));
  const riverBlurSigma = parseFloat(getArg("river-blur", "1.1"));
  // Per the project owner: pixel-art look instead of a soft painted blend — hard block edges,
  // not smooth gradients. 0 disables it and falls back to the old painterly output untouched.
  // Applied once, at the very end, to the *entire* composited image (fills, coastline, rivers,
  // tree/mountain sprites, water/grain textures alike) rather than per-layer — one pass keeps
  // every element on the same block grid instead of mixing crisp linework over a blocky
  // background. Dialed back
  // from an earlier 8px pass, which the project owner felt looked low-quality/chunky rather than
  // like genuine pixel art — 3px keeps a fine pixel grain without visibly blocking up the map.
  const pixelBlock = parseInt(getArg("pixel", "3"), 10);
  // Per the project owner: an overall warm, low-sun lighting grade — soft-light-blended over the
  // whole finished map, after pixelation, so the color grade itself stays smooth (it's meant to
  // read as atmospheric light, not another blocky layer). 0 disables it.
  const sundownStrength = parseFloat(getArg("sundown", "0.35"));
  // Per the project owner: the water-band fade needed to be genuinely soft, not just
  // mathematically continuous — see buildWaterBandRaster's own comment. In raster px (the
  // raster is 4x the logical coordinate space), applied only to the water layer itself.
  // Dialed back hard from an earlier 18 once the map committed to a real pixel-art look — at 18,
  // the blur was strong enough to wash out the whole-image pixelation pass entirely, so water
  // stayed smooth/blurry (correctly, by this parameter's own design) while every other surface
  // read as crisp blocks, an inconsistency the project owner caught after the crisp-zoom CSS fix
  // actually started working. Small enough now to still soften the hard distance-threshold seams
  // without fighting the pixelation.
  const waterBlurSigma = parseFloat(getArg("water-blur", "3"));
  // Real photographic-ish texture, not vector — lets the underlying shore-distance band color
  // still show through (so the shallow/deep hue transition stays informative) while a real ripple
  // pattern rides on top instead of the small hand-drawn "~" arcs this used to be. Brought down
  // from an original 0.55 per the project owner, who wanted the shallow-to-deep shore fade to read
  // more clearly — at 0.55 the busy wave texture was drawing the eye enough that the band color
  // shift underneath (see bandThresholds below) got lost.
  const waterTextureStrength = parseFloat(getArg("water-texture-strength", "0.4"));

  console.log(`Loading ${GAME_MAP_PATH}...`);
  const pack = loadPack();
  console.log(`Loaded ${pack.cells.length} cells, ${pack.rivers?.length || 0} rivers. Building SVG...`);
  const { cells, polys, fillSVG, riverSVG, lineSVG, treePlacements, mountainMaskSVG } = buildSVG(pack);

  console.log("Building water distance-from-coast bands...");
  // Pulled back from [14,30,48,70] to [5,11,19,30] earlier in the project (see git history/
  // roadmap.md) because the shallow band covered too much area at the wider setting. Widened
  // again here (to [10,22,38,60]) once the real water texture made the shore fade read as too
  // thin/subtle — a real ripple texture on top of a narrow color band draws attention away from
  // the band shift much more than a flat color fill did, so the band itself needs more room to
  // read clearly now.
  const bandThresholds = [10, 22, 38, 60]; // logical px; last band is "beyond all thresholds"
  const { png: waterPng, shallowWeightRaster } = await buildWaterBandRaster(pack, cells, polys, bandThresholds, waterBlurSigma);

  console.log("Blending water texture layers...");
  const waterTextureBlend = await buildBlendedWaterLayer(listWaterDeepPaths(), listWaterShallowPaths(), shallowWeightRaster);
  // Same removeAlpha()-then-ensureAlpha() reasoning as the sundown grade below: the blend's own
  // alpha channel is already baked in at full opacity, so ensureAlpha(strength) alone would no-op
  // (it only fills a *missing* channel, never overrides one that's present).
  const waterTextured = await sharp(waterTextureBlend).removeAlpha().ensureAlpha(waterTextureStrength).toBuffer();

  console.log(`Rasterizing land fill layer and merging with water bands...`);
  const landPng = await sharp(Buffer.from(fillSVG)).png().toBuffer();
  // Water texture goes on top of the band-color raster but under the land fill — landPng is
  // transparent everywhere except actual land, so re-compositing it here (same as the old
  // two-layer merge) naturally masks the texture to water-only without a separate mask step.
  const merged = await sharp(waterPng)
    .composite([{ input: waterTextured, left: 0, top: 0 }, { input: landPng, left: 0, top: 0 }])
    .png().toBuffer();

  console.log(`Blurring (sigma=${blurSigma}) for soft blending...`);
  const blurred = await sharp(merged).blur(blurSigma).png().toBuffer();

  console.log(`Rasterizing river layer and blurring it slightly (sigma=${riverBlurSigma})...`);
  const riverPng = await sharp(Buffer.from(riverSVG)).blur(riverBlurSigma).png().toBuffer();

  console.log("Rasterizing crisp coastline layer...");
  const linePng = await sharp(Buffer.from(lineSVG)).png().toBuffer();

  console.log(`Building tree icon variants (${ICON_ROTATIONS} rotations x sizes each)...`);
  const treeDeciduousVariants = await buildIconVariants(SPRITE_PATHS.treeDeciduous, TREE_ICON_SIZES);
  const treeConiferVariants = await buildIconVariants(SPRITE_PATHS.treeConifer, TREE_ICON_SIZES);

  console.log(`Placing ${treePlacements.length} trees...`);
  // See blitInto's own comment: this decodes the blurred base + river layer to a single raw RGBA
  // buffer once, then blits every tree sprite into it by hand instead of handing sharp a
  // composite() array with tens of thousands of entries (confirmed far too slow at that scale).
  const { data: canvasData, info: canvasInfo } = await sharp(blurred)
    .composite([{ input: riverPng, left: 0, top: 0 }])
    .raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  for (const p of treePlacements) {
    const variants = p.isConifer ? treeConiferVariants : treeDeciduousVariants;
    const v = pickVariant(variants, TREE_ICON_SIZES, p.sizeRoll, p.rotRoll);
    blitInto(canvasData, canvasInfo.width, canvasInfo.height, v.data, v.width, v.height,
      Math.round(p.x * SCALE - v.width / 2), Math.round(p.y * SCALE - v.height / 2));
  }

  console.log("Layering mountain shapes together...");
  const mountainBlend = await buildBlendedMountainLayer(listMountainSpritePaths());
  const mountainFeathered = await featherAlphaEdges(mountainBlend, RASTER_W, RASTER_H, 3);
  // mountainMaskSVG is a raw fill of the actual elevation-cell polygons — used unblurred, its
  // edges trace individual Voronoi cell boundaries exactly, which reads as a jagged, stair-
  // stepped cutoff between rock and grass (confirmed: the project owner spotted this in a
  // screenshot) despite the blend *inside* that boundary being smooth. Blurring the mask itself
  // before using it as the dest-in alpha softens that outer cutoff into a natural-looking fade,
  // the same fix already used elsewhere in this file for other per-cell-classification boundaries
  // (e.g. the coastline's own distance-based softening).
  const mountainMaskPng = await sharp(Buffer.from(mountainMaskSVG)).blur(18).png().toBuffer();
  // dest-in clips the continuous blended mountain texture down to the actual mountain-elevation
  // cells, the same masking idiom grainMasked below uses against landPng.
  const mountainMasked = await sharp(mountainFeathered, { raw: { width: RASTER_W, height: RASTER_H, channels: 4 } })
    .composite([{ input: mountainMaskPng, blend: "dest-in" }]).png().toBuffer();

  console.log("Tiling and masking land-grain texture...");
  const grainTile = await buildTiledLayer(SPRITE_PATHS.grainTexture, true);
  // dest-in keeps the grain tile's own per-dot alpha, multiplied by landPng's alpha as a mask —
  // landPng is opaque over land/transparent over water, so this reads as "grain, land only",
  // without needing a separately-built land/water mask image.
  const grainMasked = await sharp(grainTile).composite([{ input: landPng, blend: "dest-in" }]).png().toBuffer();

  console.log("Compositing...");
  let composite = sharp(canvasData, { raw: { width: canvasInfo.width, height: canvasInfo.height, channels: canvasInfo.channels } })
    .composite([{ input: mountainMasked, left: 0, top: 0 }, { input: linePng, left: 0, top: 0 }, { input: grainMasked, left: 0, top: 0 }]);

  if (pixelBlock > 1) {
    // The actual pixel-art trick: shrink with a smoothing kernel (each tiny output pixel becomes
    // a true area-average of its block, so color/detail from that whole block survives) then
    // blow back up with a *nearest*-neighbor kernel (no interpolation at all — every source pixel
    // just repeats into a hard-edged square), which is what turns smooth curves into visible
    // blocky steps instead of a blurrier version of the same shape.
    console.log(`Pixelating (block=${pixelBlock}px)...`);
    const smallW = Math.max(1, Math.round(RASTER_W / pixelBlock));
    const smallH = Math.max(1, Math.round(RASTER_H / pixelBlock));
    const compositeBuf = await composite.png().toBuffer();
    composite = sharp(await sharp(compositeBuf).resize(smallW, smallH, { kernel: "cubic" }).toBuffer())
      .resize(RASTER_W, RASTER_H, { kernel: "nearest" });
  }

  if (sundownStrength > 0) {
    // A flat warm-orange layer, "soft-light" blended rather than simply overlaid — soft-light
    // warms midtones/highlights while leaving the darkest areas closer to untouched, the way
    // real low-sun light actually falls across a scene, rather than tinting everything uniformly
    // the way a plain alpha overlay would. libvips' blend-mode compositing ignores the overlay's
    // own alpha channel entirely (any alpha > 0 composites at full strength — confirmed directly,
    // not assumed), so --sundown's strength can't be a partially-transparent overlay the way
    // you'd expect; instead this computes the *fully*-blended result once, then re-composites
    // that over the original using plain "over" alpha compositing (which *does* respect alpha) to
    // actually get a controllable, linear strength. The blend step itself always bakes in its own
    // opaque alpha channel (confirmed: it's there even though the base going in has none), so
    // removeAlpha() before ensureAlpha(strength) is required — ensureAlpha only fills in a
    // *missing* alpha channel, it won't override one that's already present, and silently no-ops
    // (always 100% strength) without the removeAlpha() first — also confirmed the hard way.
    console.log(`Applying sundown color grade (strength=${sundownStrength})...`);
    const strength = Math.max(0, Math.min(1, sundownStrength));
    const baseBuf = await composite.png().toBuffer();
    const opaqueWarm = await sharp({
      create: { width: RASTER_W, height: RASTER_H, channels: 4, background: { r: 255, g: 145, b: 60, alpha: 255 } },
    }).png().toBuffer();
    const fullyBlended = await sharp(baseBuf).composite([{ input: opaqueWarm, blend: "soft-light" }])
      .raw().toBuffer({ resolveWithObject: true });
    const blendedWithAlpha = await sharp(fullyBlended.data, {
      raw: { width: fullyBlended.info.width, height: fullyBlended.info.height, channels: fullyBlended.info.channels },
    }).removeAlpha().ensureAlpha(strength).png().toBuffer();
    composite = sharp(baseBuf).composite([{ input: blendedWithAlpha }]);
  }

  await composite.jpeg({ quality: 90 }).toFile(outPath);

  console.log(`Wrote ${outPath} (${RASTER_W}x${RASTER_H}).`);
}

main().catch((err) => { console.error(err); process.exit(1); });
