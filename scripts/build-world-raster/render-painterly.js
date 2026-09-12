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
const WAVE_COLOR = "#7fb3c9";
const CLOUD_COLOR = "#4a5f6e";

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
const HACHURE_COLOR = "#4a4038";
const FOREST_BIOMES = new Set([5, 6, 7, 8, 9]);
// Water depth bands, nearest-to-farthest from the coast (real pixel distance, not cell hops
// — see distanceFromLand below). Band 0 leans warm/sandy so it blends into the shoreline
// the way the reference does, rather than reading as pure water right up to the coast.
const WATER_BANDS = ["#d7e4c0", "#a8d2c4", "#6bacb6", "#3f7f9c", "#1f3f61"];
const COAST_STROKE = "#1c2f3f";
const RIVER_FILL = "#3f7ea3";
const RIVER_HALO = "#bcdce4";
const TREE_COLOR = "#3f6b3a";

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
  return pipeline.png().toBuffer();
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

  // Small, size-varied dots rather than bold uniform circles — the earlier pass read as a
  // flat polka-dot pattern rather than a scatter of individual tree icons.
  // Each "tree" is a small cluster of 2-3 overlapping circles (a fuller, fluffier canopy
  // than one plain dot) for deciduous/rainforest biomes, or a small triangle for taiga
  // (conifers read as pointed, not round, so taiga doesn't look identical to a deciduous
  // forest just because both are "green with dots"). Density is up substantially from the
  // first pass, which was too sparse to read as an actual forest at map scale.
  // Redesigned as distinct rounded tree-icon sprites (per the project owner's reference) rather
  // than a dense speckle/dot-fill texture — fewer per cell, but each one notably bigger, with a
  // lighter highlight blob offset toward the light for a puffy, individually-readable canopy
  // instead of many tiny dots blurring into a flat texture at a glance.
  let trees = "";
  const TREE_SHADES = ["#3f6b3a", "#4a7a44", "#365e32"];
  const TREE_HIGHLIGHT = "#7aab5e";
  const CONIFER_SHADES = ["#3a5a3d", "#2f4d33", "#456b47"];
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (!FOREST_BIOMES.has(c.biome) || c.h >= MOUNTAIN_HEIGHT_THRESHOLD) continue;
    const rand = mulberry32(c.i * 2654435761);
    const [cx, cy] = c.p;
    const r = cellRadius(polys[i], cx, cy) * 0.85;
    const isConifer = c.biome === 9; // Taiga
    const count = c.biome === 8 || c.biome === 7 ? 16 : isConifer ? 13 : 10; // rainforest densest
    for (let t = 0; t < count; t++) {
      const ang = rand() * Math.PI * 2;
      const rad = rand() * r;
      const x = cx + Math.cos(ang) * rad, y = cy + Math.sin(ang) * rad;
      if (isConifer) {
        const shade = CONIFER_SHADES[Math.floor(rand() * CONIFER_SHADES.length)];
        const size = 3 + rand() * 1.6;
        // A simple upward-pointing triangle glyph in place of a round canopy blob.
        trees += `<polygon points="${x.toFixed(1)},${(y - size).toFixed(1)} ${(x - size * 0.72).toFixed(1)},${(y + size * 0.65).toFixed(1)} ${(x + size * 0.72).toFixed(1)},${(y + size * 0.65).toFixed(1)}" fill="${shade}" fill-opacity="0.92"/>`;
      } else {
        // One solid base canopy blob plus a smaller, lighter highlight blob offset up-left —
        // reads as one distinct rounded tree icon rather than a cluster of overlapping dots.
        const shade = TREE_SHADES[Math.floor(rand() * TREE_SHADES.length)];
        const baseR = 2.3 + rand() * 1.7;
        // fill-opacity, not opacity — the plain "opacity" attribute forces librsvg to allocate
        // an isolated offscreen compositing group per element, which is fine for one path but
        // pathological repeated thousands of times on a 10240x5108 canvas (this is what caused
        // the multi-minute render hang before). fill-opacity blends directly, no group.
        trees += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${baseR.toFixed(2)}" fill="${shade}" fill-opacity="0.92"/>`;
        const hx = x - baseR * 0.32, hy = y - baseR * 0.38;
        trees += `<circle cx="${hx.toFixed(1)}" cy="${hy.toFixed(1)}" r="${(baseR * 0.55).toFixed(2)}" fill="${TREE_HIGHLIGHT}" fill-opacity="0.55"/>`;
      }
    }
  }

  // Wave texture: small "~" arcs scattered across every water cell, count scaled roughly by
  // cell size so the huge open-ocean cells don't end up looking barer than the small coastal
  // ones — the ocean was otherwise just flat color bands with no texture at all.
  let waves = "";
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (c.biome !== 0) continue;
    const rand = mulberry32(c.i * 741103597);
    const [cx, cy] = c.p;
    const r = cellRadius(polys[i], cx, cy) * 0.7;
    const count = Math.max(1, Math.min(40, Math.round(r / 7)));
    for (let t = 0; t < count; t++) {
      const ang = rand() * Math.PI * 2;
      const rad = rand() * r;
      const x = cx + Math.cos(ang) * rad, y = cy + Math.sin(ang) * rad;
      const waveW = 4 + rand() * 5;
      const waveAng = rand() * Math.PI * 2;
      const dx = Math.cos(waveAng), dy = Math.sin(waveAng);
      const perpX = -dy, perpY = dx;
      const x1 = x - dx * waveW, y1 = y - dy * waveW;
      const x2 = x + dx * waveW, y2 = y + dy * waveW;
      const cxp = x + perpX * waveW * 0.35, cyp = y + perpY * waveW * 0.35;
      waves += `<path d="M${x1.toFixed(1)},${y1.toFixed(1)} Q${cxp.toFixed(1)},${cyp.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}" stroke="${WAVE_COLOR}" stroke-width="0.6" fill="none" stroke-opacity="0.35" stroke-linecap="round"/>`;
    }
  }

  // Mountain hachures: short dark tick marks scattered across high-elevation cells, standing
  // in for the cross-hatch shading real hand-drawn relief maps use — cheap approximation,
  // not a real slope-aware hachure algorithm. Count/length/opacity bumped hard (was 4 ticks
  // per cell, barely visible) plus a scatter of small rock speckle dots on top, so mountains
  // read as an actual textured rock face rather than a flat tinted blob with a few marks.
  const HACHURE_LIGHT = "#c9c2b4";
  let hachures = "";
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (c.h < MOUNTAIN_HEIGHT_THRESHOLD) continue;
    const rand = mulberry32(c.i * 1013904223);
    const [cx, cy] = c.p;
    const r = cellRadius(polys[i], cx, cy) * 0.8;
    const count = 22;
    for (let t = 0; t < count; t++) {
      const ang = rand() * Math.PI * 2;
      const rad = rand() * r;
      const x = cx + Math.cos(ang) * rad, y = cy + Math.sin(ang) * rad;
      const tickAng = rand() * Math.PI;
      const len = 4 + rand() * 5;
      const dx = Math.cos(tickAng) * len, dy = Math.sin(tickAng) * len;
      hachures += `<line x1="${(x - dx / 2).toFixed(1)}" y1="${(y - dy / 2).toFixed(1)}" x2="${(x + dx / 2).toFixed(1)}" y2="${(y + dy / 2).toFixed(1)}" stroke="${HACHURE_COLOR}" stroke-width="1" stroke-opacity="0.62" stroke-linecap="round"/>`;
    }
    // Rock speckles: small light-and-dark dots interspersed with the hachure ticks, breaking
    // up the flat fill so it reads as mottled stone rather than one uniform tint.
    const speckleCount = 30;
    for (let t = 0; t < speckleCount; t++) {
      const ang = rand() * Math.PI * 2;
      const rad = rand() * r;
      const x = cx + Math.cos(ang) * rad, y = cy + Math.sin(ang) * rad;
      const light = rand() < 0.5;
      const sr = 0.6 + rand() * 1;
      hachures += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${sr.toFixed(2)}" fill="${light ? HACHURE_LIGHT : HACHURE_COLOR}" fill-opacity="${light ? 0.5 : 0.35}"/>`;
    }
  }

  // Per the project owner: dropped the baked-in dashed kingdom-border line entirely (drawn from
  // the Azgaar export's original/historical state field, not live territory control) — it read as
  // visual clutter, and it was already redundant with the game's real border rendering: the live
  // SVG #overlay draws the actual current frontline/territory lines on top of this raster,
  // reacting to real conquest state (see context/factions-and-territory.md's "Burg adjacency" and
  // buildFrontlineMarkers) — this file's own doc comment always said borders belonged to that
  // overlay, not baked into the art, so removing this also fixes that mismatch.

  return {
    cells, polys,
    fillSVG: `<svg xmlns="http://www.w3.org/2000/svg" width="${RASTER_W}" height="${RASTER_H}" viewBox="0 0 ${LOGICAL_W} ${LOGICAL_H}">${fillLayer}</svg>`,
    // Rivers render as their own layer, separate from the rest of the crisp linework, so
    // main() can give just this one a touch of blur (softens rare river-on-river crossings)
    // without softening the coastline/trees/hachures too.
    riverSVG: `<svg xmlns="http://www.w3.org/2000/svg" width="${RASTER_W}" height="${RASTER_H}" viewBox="0 0 ${LOGICAL_W} ${LOGICAL_H}">${riverLines}</svg>`,
    lineSVG: `<svg xmlns="http://www.w3.org/2000/svg" width="${RASTER_W}" height="${RASTER_H}" viewBox="0 0 ${LOGICAL_W} ${LOGICAL_H}">${waves}${coastLine}${trees}${hachures}</svg>`,
  };
}

// A single pattern-filled rect (one fill region, tiled by the renderer) rasterizes in a
// fraction of a second. Filling ~4500 individual cell polygons with the same pattern —
// the first attempt — made librsvg recompute pattern tiling per polygon and took 10+
// minutes before being killed; this masks the same-looking result against the already-
// rendered land alpha channel instead, via raw pixel math.
async function buildStippleLayer(landPng) {
  const dotsSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${RASTER_W}" height="${RASTER_H}">
    <defs><pattern id="dots" width="15" height="15" patternUnits="userSpaceOnUse">
      <circle cx="4" cy="4" r="1.9" fill="#2a2115" opacity="0.26"/>
      <circle cx="11" cy="9" r="1.7" fill="#2a2115" opacity="0.22"/>
      <circle cx="7" cy="12" r="1.4" fill="#2a2115" opacity="0.18"/>
    </pattern></defs>
    <rect width="${RASTER_W}" height="${RASTER_H}" fill="url(#dots)"/>
  </svg>`;
  const { data: dotData } = await sharp(Buffer.from(dotsSVG)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data: landData } = await sharp(landPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const n = RASTER_W * RASTER_H;
  const out = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    const di = i * 4, li = i * 4;
    out[di] = dotData[di]; out[di + 1] = dotData[di + 1]; out[di + 2] = dotData[di + 2];
    out[di + 3] = Math.round((dotData[di + 3] * landData[li + 3]) / 255);
  }
  return sharp(out, { raw: { width: RASTER_W, height: RASTER_H, channels: 4 } }).png().toBuffer();
}

async function main() {
  const args = process.argv.slice(2);
  const getArg = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
  const outPath = path.resolve(getArg("out", DEFAULT_OUT_PATH));
  // Softened way down from the old painterly default (3.5) — the pixelate pass below does the
  // actual blocky-look work now; a lingering big blur before it just muddies fine linework
  // (rivers, hachures, tree clusters) into the block-averaging instead of letting it read as
  // real detail within each block.
  const blurSigma = parseFloat(getArg("blur", "1.2"));
  const riverBlurSigma = parseFloat(getArg("river-blur", "1.1"));
  // Per the project owner: pixel-art look instead of a soft painted blend — hard block edges,
  // not smooth gradients. 0 disables it and falls back to the old painterly output untouched.
  // Applied once, at the very end, to the *entire* composited image (fills, coastline, rivers,
  // trees, hachures alike) rather than per-layer — one pass keeps every element on the same
  // block grid instead of mixing crisp vector linework over a blocky background. Dialed back
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
  const waterBlurSigma = parseFloat(getArg("water-blur", "18"));

  console.log(`Loading ${GAME_MAP_PATH}...`);
  const pack = loadPack();
  console.log(`Loaded ${pack.cells.length} cells, ${pack.rivers?.length || 0} rivers. Building SVG...`);
  const { cells, polys, fillSVG, riverSVG, lineSVG } = buildSVG(pack);

  console.log("Building water distance-from-coast bands...");
  // Pulled back in from [14,30,48,70] per the project owner, now that buildWaterBandRaster's own
  // dedicated blur (see waterBlurSigma above) is what actually makes the fade read as soft —
  // widening the raw distances was the wrong lever for that (it just made the whole coastal
  // ring wider, not smoother) and made the shallow-water band cover too much area.
  const bandThresholds = [5, 11, 19, 30]; // logical px; last band is "beyond all thresholds"
  const waterPng = await buildWaterBandRaster(pack, cells, polys, bandThresholds, waterBlurSigma);

  console.log(`Rasterizing land fill layer and merging with water bands...`);
  const landPng = await sharp(Buffer.from(fillSVG)).png().toBuffer();
  const merged = await sharp(waterPng).composite([{ input: landPng, left: 0, top: 0 }]).png().toBuffer();

  console.log(`Blurring (sigma=${blurSigma}) for soft blending...`);
  const blurred = await sharp(merged).blur(blurSigma).png().toBuffer();

  console.log("Building stipple texture (masked to land)...");
  const stipplePng = await buildStippleLayer(landPng);

  console.log(`Rasterizing river layer and blurring it slightly (sigma=${riverBlurSigma})...`);
  const riverPng = await sharp(Buffer.from(riverSVG)).blur(riverBlurSigma).png().toBuffer();

  console.log("Rasterizing crisp linework layer...");
  const linePng = await sharp(Buffer.from(lineSVG)).png().toBuffer();

  console.log("Compositing...");
  let composite = sharp(blurred)
    .composite([{ input: stipplePng, left: 0, top: 0 }, { input: riverPng, left: 0, top: 0 }, { input: linePng, left: 0, top: 0 }]);

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
