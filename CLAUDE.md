# Goblin War

A browser-based overworld RPG. No build step, no framework, no backend — every page is a single self-contained `.html` file with inline `<style>` and `<script>`, opened directly or served as static files. All game state lives in `localStorage`, shared across pages by convention (same key names, no formal schema).

Fictional setting only — "Goblin War" and its world data have no connection to any real organization, event, or person.

## Files at a glance

| File | Role |
|---|---|
| [index.html](index.html) | The overworld map — pan/zoom, travel, camp, combat. This is the game's hub; every other page links back to it. |
| [character.html](character.html) | Read-only hero sheet (HP/stamina/gold/food/weight/age/location). |
| [inventory.html](inventory.html) | Read-only bag contents, gold, and carried weight. |
| [party.html](party.html) | Stub — no companion system yet. |
| [settings.html](settings.html) | 3 save slots (read/write `localStorage` snapshots) and a new-game reset. |
| [game-map.html](game-map.html) | Legacy prototype map (scroll-based, pre-dates index.html's pan/zoom canvas). Not linked from anywhere — dead code, kept for reference only. |
| [manifest.json](manifest.json) | Web App Manifest — `display:standalone`, `start_url:index.html`, icons. Every page links it (`<link rel="manifest">`) plus an `apple-touch-icon`, so "Add to Home Screen" installs a real app icon and stays in standalone mode (no browser chrome) across page navigations rather than reopening in Safari/Chrome. Re-adding the home-screen icon is required after any manifest/icon change — it's only read at install time. |
| `assets/icons/` | `icon-192.png` / `icon-512.png` (manifest) and `icon-180.png` (`apple-touch-icon`) — resized from `DisplayPicture.jpeg` (the source art, kept for regenerating at other sizes later). Re-adding the home-screen icon is required after changing these — see [manifest.json](manifest.json)'s row above. `assets/icons/Map/Cities.png` is unrelated — the City/Capital marker drawn on the game map itself (see [context/travel-and-map.md](context/travel-and-map.md)), not an app icon. |
| `assets/travel-graph.json` | Processed world data the game actually reads: settlements + road/sea graph. |
| `assets/world-raster.jpg` | The map image rendered under the SVG overlay. |
| `assets/game-map.json` | Raw Azgaar Fantasy Map Generator export `travel-graph.json` was built from. Not fetched by any page at runtime. |

## Context files

Each covers one system in depth — read the relevant one before changing that part of the game:

- [context/travel-and-map.md](context/travel-and-map.md) — the map canvas, road-graph pathfinding, travel animation, camp/stop-mid-journey, calendar.
- [context/player-state.md](context/player-state.md) — health/stamina/food/weight/gold/age/inventory: the `localStorage` keys every page shares.
- [context/combat.md](context/combat.md) — the turn-based bandit encounter system and how it's triggered.
- [context/locations-and-camp.md](context/locations-and-camp.md) — the settlement location-view (Inn, Marketplace, etc.) and the camp screen.
- [context/save-system.md](context/save-system.md) — save slots and new-game reset in settings.html.
- [context/secondary-pages.md](context/secondary-pages.md) — character.html, inventory.html, party.html.
- [context/data-files.md](context/data-files.md) — the shape of `travel-graph.json` and where the map assets come from.
- [context/roadmap.md](context/roadmap.md) — every "coming soon" stub in the codebase, collected in one place.

## Conventions worth knowing before editing

- **No modules, no bundler.** Each HTML file's `<script>` is copy-pasted, self-contained JS — shared logic (e.g. the calendar formatter, the `localStorage` key names) is duplicated across files rather than imported. When you change a constant or a formula in one page, check the others for the same duplicated logic.
- **`localStorage` is the only persistence.** There's no server. Keys are plain strings prefixed `goblinwar_` (e.g. `goblinwar_health`); see [context/player-state.md](context/player-state.md) for the full list.
- **Map coordinates are dual-scale.** World data (`travel-graph.json`, SVG overlay) uses a 2560×1277 "logical" space; the raster image is 10240×5108 (4× that). `STAGE_W/LOGICAL_W` converts between them — see [context/travel-and-map.md](context/travel-and-map.md).
- **Tone/flavor text is Chatty English fantasy** (rumours, ambush messages, location descriptions) — match that voice when adding more.
- **Full-screen overlays are z-index layered, and it's easy to get wrong.** index.html stacks `#location-view` (60), `#combat-view` (70), and `#toast` (80, deliberately above both) on top of the normal map UI. `showToast()` can fire from inside either overlay (Work, Inn, Marketplace, combat results), so the toast must outrank every overlay it can be called from, not just the base map chrome — it was briefly rendering invisibly behind `#location-view` for exactly this reason. If you add a new full-screen overlay, either give it a z-index below 80 or bump the toast again.
- **`env(safe-area-inset-*)` matters on installed iOS home-screen apps.** `viewport-fit=cover` (every page's viewport meta) lets content draw under the notch/status bar and home indicator; every sticky/fixed element pinned to a true screen edge — headers, `#toast`, `#travel-controls`, `#recenter-btn`, `#camp-here-btn`, `#info-card`, `#loc-actions`, `#combat-header` — adds the relevant `env(safe-area-inset-top/bottom)` into its own padding/position so it doesn't get clipped there. A new fixed-position element needs the same treatment; it's easy to miss on a new full-screen overlay specifically, since those don't inherit the normal `<header>`'s padding — `#loc-actions`'s "Back to Map" button and `#combat-header`'s title were both found clipped under the notch after being added without it.
