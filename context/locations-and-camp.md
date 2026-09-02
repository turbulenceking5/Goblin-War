# Locations & Camp (index.html)

Two full-screen overlays (`#location-view`, shared markup, z-index 60) that show up in different contexts: arriving at (or re-entering) a settlement, versus stopping mid-journey. Both use the same split-screen shell — `#loc-actions` (left, a scrollable list of action buttons) and `#loc-visual` (right, an SVG illustration + name/tier label) — just populated differently.

## Settlement view — `showLocationView(burgId)`

Reached by tapping "Enter Settlement" / "Travel Here" on a burg you're already at, or automatically on arrival after travel (post-ambush-roll, see [combat.md](combat.md)).

- The visual side picks an SVG from `TIER_ART` (`village`/`town`/`city`/`capital` — four hand-drawn building illustrations, no per-settlement art).
- The action list is a small array of `{icon, title, desc, action}` objects rendered identically, currently:
  - **The Inn** (`action:'inn'`) → `showInnPanel(burgId)`, the only fully implemented action.
  - **Marketplace** and **Talk to Townsfolk** (`action:'stub'`) → toast "Not built yet — coming in a future update." (see [roadmap.md](roadmap.md)).
- `loc-back` (the `&larr; Back to Map` button) just hides the overlay — no state changes.

### The Inn — `showInnPanel(burgId)`

Replaces the action list in-place (same `#loc-action-list` container) with:
- A random line from the `RUMOURS` array (12 flavor-text strings, no mechanical effect — pure world-building color) under "Tavern Talk".
- **Rest for the Night**: `advanceDays(1)`, full heal (`setHealth(playerMaxHealth)`), full stamina restore (`setStamina(playerMaxStamina)`), toast, and a fresh rumour swapped in. No ambush roll here — Inns are the safe option (contrast with camping, below).
- **Back** returns to `showLocationView(burgId)`, i.e. one level up, not the map.

## Camp view — `showCampView(destId, destName, partialDays)`

Two ways in, distinguished by `const standalone = !destId`:
- **Mid-journey**: `stopTravel()`/`campMidTravel()` interrupting an active trip (see [travel-and-map.md](travel-and-map.md)) pass a real `destId`/`destName`/`partialDays`.
- **Standalone**: the "MAKE CAMP" button fixed on the map (`#camp-here-btn`, stacked above the FIND ME recenter button) calls `showCampView(null, null, 0)` directly — lets the player camp anywhere, anytime, without an active journey (including right where they're already standing in a settlement, if they'd rather sleep rough than pay for the Inn). `#camp-here-btn` hides itself automatically while `#travel-controls` is showing (`showTravelControls`/`hideTravelControls` toggle both), since interrupting an active journey already has its own Stop/Set Up Camp path.

Visual side is always a fixed campfire SVG (`CAMP_ART`), no tier variation since it's not a real place. Header text (`loc-sub`) and the visual tier label branch on `standalone` — "Making camp at `${here}`" vs. "On the road to `${destName}` — N days passed", where `here` is `getCurrentDisplayName()`.

Actions (the "Continue" button only renders `${standalone ? '' : ...}` — omitted entirely in standalone mode, since there's nothing to resume):
- **Rest Until Morning**: rolls `NIGHT_AMBUSH_CHANCE` (0.15) first — see [combat.md](combat.md) for why this one can trigger a fight and the Inn's rest can't. Either way, `finishRest()` (defined inline) applies the same full heal + full stamina restore as the Inn, plus `advanceDays(1)`.
- **Continue to `${destName}`** (mid-journey only): closes the overlay and calls `beginTravel(destId)` again — resumes the same journey from `campPos`, recomputing the route fresh (this will re-check the stamina gate; if resting hasn't topped it up enough for the *full remaining trip*, `beginTravel` blocks with a toast — see [player-state.md](player-state.md)).
- **Choose a Different Destination** / **Back to Map** (label depends on `standalone`): just closes the overlay back to the map. `campPos` (if set) is left untouched either way — the player stays exactly where they stopped/camped, free to tap anywhere else.

## Adding a new location action

Both view functions follow the same pattern: build an array of small metadata objects, `.map()` them to button HTML, then `querySelectorAll` + `addEventListener` to wire clicks. To add a real Marketplace, the shape to follow is `showInnPanel` — replace `#loc-action-list`'s contents with a new sub-screen rather than adding a new top-level overlay, so the existing "Back" chain of `location-view → sub-panel → location-view → map` stays intact.
