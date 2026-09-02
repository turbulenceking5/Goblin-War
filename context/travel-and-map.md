# Travel & Map (index.html)

The overworld screen. This is the largest and most complex system in the game — everything else (combat, resting, save state) hangs off of it.

## Two coordinate spaces

The world data and the rendered image use different scales, and the code converts between them constantly:

- **Logical space** (`LOGICAL_W=2560, LOGICAL_H=1277`) — the coordinate system every settlement, road point, and the SVG `#overlay` viewBox use. This is what `travel-graph.json` stores `x`/`y` in.
- **Raster/stage space** (`STAGE_W=10240, STAGE_H=5108`) — the actual pixel size of `world-raster.jpg` and `#map-stage`, exactly 4× logical space.

`STAGE_W/LOGICAL_W` (4) is the conversion factor, used everywhere the camera needs to place something in screen pixels from a logical `x,y`.

## Camera (pan/zoom)

- `view = { scale, tx, ty }` is the single source of truth for the camera; `applyView()` writes it to `#map-stage`'s CSS transform after `clampView()` keeps it in bounds (can't zoom out past fitting the map, can't zoom in past `maxScale=3.0`).
- `centerOnLogical(lx, ly, scale)` is the one function that points the camera at a logical coordinate — used on load, on recenter, and (critically) every frame during travel animation.
- Panning/pinch-zoom is handled with raw Pointer Events (`pointerdown`/`pointermove`/`pointerup`) rather than touch/mouse-specific listeners, so it works the same on desktop and mobile. A single pointer that doesn't move more than 6px counts as a tap (`handleTap`), not a drag.

## The road/sea graph

`travel-graph.json` models the world as a graph of map **cells** (not just settlements) — every point along a drawn road, trail, or sea route is a node, so junctions and mid-route camping work naturally. See [data-files.md](data-files.md) for the exact JSON shape.

- `buildAdjacency()` turns the flat `edges` array into a `cellId -> [{to, mi, edge, forward}]` map, once, at load.
- `cellRoute(fromCell, toCell)` is a Dijkstra shortest-path search over that adjacency map using a hand-rolled binary `MinHeap` (a plain sorted array was too slow across thousands of cells). Returns `{miles, edges}` or `null` if there's no path at all.
- `computeTravel(toId)` wraps `cellRoute` into game terms: raw miles are first divided by `DISTANCE_SCALE` (`5`) — the world data's mileage is realistic-scale and would otherwise make a cross-map trip take dozens of in-game days, so this compresses every distance down before anything else touches it. From there: miles → **hours** (`Math.max(1, Math.ceil(miles/ROAD_PACE))`, `ROAD_PACE=20`/day-equivalent) — trips are timed in hours, not days, so even a settlement "2 days" away by the old realistic pacing now reads as "2 hours" and rarely dents the calendar at all. `hoursToFoodCost(hours)` and `hoursToDaysElapsed(hours)` (both near `computeTravel`) derive Food cost and calendar advancement from that hour count separately — see "Hours vs. the calendar" below. If no route exists (rare — most of the ~800 settlements are connected), it falls back to a straight-line "cross-country" estimate at `OFFROAD_PACE=12`/day-equivalent instead of blocking travel entirely (also scaled by `DISTANCE_SCALE`).
- `formatDuration(hours)` renders that count for display — `"N hours"` under a day, `"N days M hours"` above it — used in the info-card quote and the Travel button label (`Travel Here (Nh)`).
- `computeReachable(fromCell)` is a separate, distance-ignorant flood fill used only once at load, to detect if the player's saved location got stranded with zero road connections (falls back to Bary, burg id `"5"`, if so).

## Where you are: settlement vs. camp

`currentBurg` (a burg id string, persisted as `goblinwar_currentBurg`) is the player's last-arrived-at settlement. But mid-journey the player can stop or camp somewhere that isn't a named settlement — `campPos = {x, y, cell, name}` holds that in-between position (snapped to the nearest real point on the road graph). Three helpers abstract over both cases so the rest of the code never has to branch on it:

- `getCurrentCell()`, `getCurrentXY()`, `getCurrentDisplayName()` — all check `campPos` first, fall back to `graph.burgs[currentBurg]`.

`campPos` is cleared (`= null`) only on a completed arrival (`beginTravel`'s `onDone`), never on rest — resting in camp keeps you on the road, it doesn't teleport you to a settlement.

## Travel animation

`beginTravel(destId)` is the entry point (called from the info-card's Travel button, or "Continue" in the camp view). It:

1. Computes the route via `computeTravel` and blocks immediately (with a toast) if `foodCost` exceeds `getFoodQty()` — see [player-state.md](player-state.md) for the Food gate.
2. Shows the `#travel-controls` bar (Stop / Set Up Camp).
3. Hands off to `animateTravel(fromPos, toId, edgeSteps, ...)`, which:
   - Builds one flat polyline (`buildRoutePolyline`) by concatenating each edge's real point list (`edge.pts`) in the correct direction — so the marker visibly follows actual drawn roads, not a straight line (unless there's no route at all).
   - Walks that polyline at **constant linear speed** (no easing) over a duration proportional to (already-scaled) distance (`Math.max(4000, 2000 + miles*20)` ms) — deliberately unhurried, like a Bannerlord-style overworld crossing, not a quick dart. This is independent of the hours/Food/calendar math above — animation length is purely about watching the journey happen, not simulated at all against in-game time.
   - On every animation frame, calls `centerOnLogical(pos.x, pos.y, view.scale)` — recomputed from the **current** `view.scale` each time, not a value cached at journey start. This is what keeps the character centered under the camera even if the player pinch-zooms or scrolls mid-journey; an earlier version cached the camera math once and zooming mid-travel caused visible drift.
4. On arrival: sets `currentBurg`, advances the calendar (`advanceDays(hoursToDaysElapsed(t.hours))`), consumes Food (`consumeItem(FOOD_NAME, t.foodCost)`), and rolls a bandit ambush chance (`rollAmbush(t.hours)`, converted to days internally) before opening the location view (see [combat.md](combat.md)).

`stopTravel()` and `campMidTravel()` both cancel the in-flight animation (`controller.cancelled = true; cancelAnimationFrame(...)`) and snap the player to `activeTravel.lastSnap` — the most recent `{x, y, cell}` the animation reported via its `onProgress` callback, i.e. wherever they actually were when interrupted, not back at the start. `campMidTravel` additionally derives `partialHours` from `activeTravel.totalHours * frac` (the fraction of the journey completed), advances the calendar and consumes Food from that via the same `hoursToDaysElapsed`/`hoursToFoodCost` helpers as a completed arrival, and opens the camp screen showing `formatDuration(partialHours)` passed.

## Calendar

A flat day counter (`gameDay`, key `goblinwar_gameDay`) is the only stored time value. `DAYS_PER_MONTH=30`, `MONTHS_PER_YEAR=12` are fixed constants used to derive day/month/year for display (`refreshCalendarUI`) — duplicated in character.html and settings.html rather than shared, since there's no module system (see root [CLAUDE.md](../CLAUDE.md)).

## Hours vs. the calendar

Travel duration (`t.hours`) and calendar advancement are deliberately decoupled: `hoursToDaysElapsed(hours) = Math.floor(hours/HOURS_PER_DAY)` only moves `gameDay` once a trip's hours cross a full 24-hour boundary, so the typical short hop (a handful of hours) doesn't advance the date at all — you arrive "the same day" you left. `gameDay` itself stays a whole-number day counter; there's no hour-of-day clock stored anywhere, so a 3-hour trip and a 20-hour trip both leave `gameDay` untouched, they just differ in the animation length and Food cost. Food cost uses a matching helper, `hoursToFoodCost(hours) = Math.max(1, Math.ceil((hours/HOURS_PER_DAY)*FOOD_PER_DAY))`, so every journey still costs at least 1 Food (preserving the pre-existing minimum-cost-per-trip balance) and only scales up for trips that are genuinely multiple calendar days long.

## Tap-to-select and the info card

Every settlement gets an invisible circular `<circle class="hitzone">` sized by tier (`HIT_R`), built once in `buildHitzones()`. City- and Capital-tier settlements additionally get a bold skyline glyph (`CITY_ICON_PATH`, three rectangular "buildings" of varying height, thick dark outline, saturated fill) drawn just above their point (`buildCityIcons()`, into the `#city-icons` group, `scale(1.6)` gold for capitals vs. `scale(1.2)` orange-brown for cities) — built once alongside the hitzones, purely visual (`pointer-events:none`), so major settlements read at a glance even zoomed out. It can't be drawn *behind* the map's own place-name text — those labels are baked into `world-raster.jpg` (a flat image below the entire `#overlay` SVG in the DOM, not a separate manipulable layer — see `labelElByBurg`'s comment) — and testing at high zoom found Azgaar centers each label directly *on* the settlement's point (not offset below/beside it, as first assumed), so the icon needs a vertical gap to clear its own label: `CITY_ICON_OFFSET_Y` (`-11` logical units — tuned down from an earlier `-16` that read as too detached from its own settlement). That offset alone isn't sufficient in dense clusters, though — two settlements close enough together (seen as close as ~14 units apart) means one's offset icon can land on top of a *different* settlement's label. Rather than solve that per-pair, `buildCityIcons()` checks each candidate icon position against every settlement's point (`CITY_ICON_MIN_CLEARANCE`, `12` units) and skips drawing it entirely if it's too close to any — about a quarter of eligible City/Capital icons go undrawn this way (69 of 91 in one measured pass at the `-11` offset), which is the deliberate trade-off: an occasionally-missing icon over a covered name. If either constant is retuned again, re-check the Domagassethor/Furlyliama pair (burg ids `41`/`449`, ~14 units apart) at high zoom — it's the closest known pair and the one that first exposed the collision. Tapping a hitzone calls `onMapTap(burgId)`, which populates and opens `#info-card` with one of three states: "you are here" (already at that burg), a travel quote with the button hidden and a red warning if you don't have enough Food to make the *full* trip (the Food gate, see [player-state.md](player-state.md)), or a normal travel quote (miles/`formatDuration(hours)`/Food cost, plus a route preview drawn along the same polyline logic as the travel animation) with the Travel button enabled, labeled `Travel Here (Nh)`.

## Camping from the map

Beyond interrupting an active journey, a fixed "MAKE CAMP" button (`#camp-here-btn`, stacked above the recenter button, hidden while `#travel-controls` is showing) lets the player camp on the spot at any time — see [locations-and-camp.md](locations-and-camp.md) for the standalone camp flow. This is what keeps the Food gate above from ever creating a soft-lock: even at 0 Food with nowhere affordable to travel, the player can always rest right where they stand (though resting only heals — reaching a Marketplace to restock Food still requires being at, or walking into, a settlement).
