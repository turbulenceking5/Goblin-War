# Locations & Camp (index.html)

Two full-screen overlays (`#location-view`, shared markup, z-index 60) that show up in different contexts: arriving at (or re-entering) a settlement, versus stopping mid-journey. Both use the same split-screen shell — `#loc-actions` (left, a scrollable list of action buttons) and `#loc-visual` (right, an SVG illustration + name/tier label) — just populated differently.

## Settlement view — `showLocationView(burgId)`

Reached by tapping "Enter Settlement" / "Travel Here" on a burg you're already at, or automatically on arrival after travel (post-ambush-roll, see [combat.md](combat.md)).

- The visual side picks an SVG from `TIER_ART` (`village`/`town`/`city`/`capital` — four hand-drawn building illustrations, no per-settlement art).
- The action list is a small array of `{icon, title, desc, action}` objects rendered identically, currently:
  - **The Inn** (`action:'inn'`) → `showInnPanel(burgId)`.
  - **Marketplace** (`action:'market'`) → `showMarketPanel(burgId)`.
  - **Work** (`action:'work'`) → `doWork()`, straight from the action list with no sub-panel — see "Work" below.
  - **Talk to Townsfolk** (`action:'stub'`) → toast "Not built yet — coming in a future update." (see [roadmap.md](roadmap.md)).
- `loc-back` (the `&larr; Back to Map` button) just hides the overlay — no state changes.

### The Inn — `showInnPanel(burgId)`

Replaces the action list in-place (same `#loc-action-list` container) with, in this order:
- **Rest for the Night** first: `advanceDays(1)`, full heal (`setHealth(playerMaxHealth)`) and full stamina refill (`setStamina(playerMaxStamina)`), toast, and a fresh rumour swapped in. No ambush roll here — Inns are the safe option (contrast with camping, below). Resting does **not** restore Food — see [player-state.md](player-state.md) on why that's deliberate. Health and stamina are the only two things resting ever touches.
- A random line from the `RUMOURS` array (12 flavor-text strings, no mechanical effect — pure world-building color) under "Tavern Talk", below the Rest button — deliberately ordered so the action you're most likely here for isn't buried under flavor text.
- **Back** returns to `showLocationView(burgId)`, i.e. one level up, not the map.

### Work — `doWork()`

The simplest action in the game: no sub-panel, just an immediate result straight from the settlement action list. Picks a random gold amount in `[3,15]` (`randRange`, same helper combat uses), adds it via `setGold(playerGold + earned)`, and shows a toast built from a random line in `WORK_LINES` (5 flavor strings) plus the amount earned. No time cost — `gameDay` isn't touched — and no stamina cost either (stamina is combat-only, see [player-state.md](player-state.md)/[combat.md](combat.md)). No cooldown or once-per-day limit exists, so it's repeatable on demand.

### The Marketplace — `showMarketPanel(burgId)`

The only shop in the game, and the only source of Food besides whatever you start with. Sells everything in the `MARKET_ITEMS` array (index.html, near `DEFAULT_INVENTORY`) — currently Food, Sword, Healing Potion, Books, Firewood, and Shield, each with its own `{name, price, weight, desc}`:
- Shows current gold and carried weight (`getCarriedWeight()`/`CARRY_CAPACITY`) up top, then one row per `MARKET_ITEMS` entry (price/weight-per-unit, current carried amount from `getItem(name)`), each with its own **Buy 1** / **Buy 5** buttons.
- Buttons carry `data-buy`/`data-qty` attributes (index into `MARKET_ITEMS`, and 1 or 5) rather than one hardcoded handler per item, so adding a new item to `MARKET_ITEMS` is enough — no new wiring needed in `render()`.
- `buyItem(mi, qty)` (generalized from the old Food-only `buyFood`) checks gold first (toast + no-op if short), then calls `addItem(mi.name, qty, mi.weight, mi.price)` (toast + no-op if it would exceed `CARRY_CAPACITY` — see [player-state.md](player-state.md)), and only deducts gold (`setGold`) if the item was actually added. Order matters here: a failed weight check must never have already spent the player's gold.
- Re-renders itself in place after every purchase (`render()` is a closure over `burgId`/`list`, called both initially and after `buyItem` succeeds) so the gold/weight/carried numbers stay current without leaving the panel.
- Buying doesn't equip anything — Sword/Shield/etc. just sit in the bag like Waterskin/Bedroll always have. No equip system exists yet (see [roadmap.md](roadmap.md)).

## Camp view — `showCampView(destId, destName, partialHours)`

Two ways in, distinguished by `const standalone = !destId`:
- **Mid-journey**: `stopTravel()`/`campMidTravel()` interrupting an active trip (see [travel-and-map.md](travel-and-map.md)) pass a real `destId`/`destName`/`partialHours`.
- **Standalone**: the "MAKE CAMP" button fixed on the map (`#camp-here-btn`, stacked above the FIND ME recenter button) calls `showCampView(null, null, 0)` directly — lets the player camp anywhere, anytime, without an active journey (including right where they're already standing in a settlement, if they'd rather sleep rough than pay for the Inn). `#camp-here-btn` hides itself automatically while `#travel-controls` is showing (`showTravelControls`/`hideTravelControls` toggle both), since interrupting an active journey already has its own Stop/Set Up Camp path.

Visual side is always a fixed campfire SVG (`CAMP_ART`), no tier variation since it's not a real place. Header text (`loc-sub`) and the visual tier label branch on `standalone` — "Making camp at `${here}`" vs. "On the road to `${destName}` — `formatDuration(partialHours)` passed", where `here` is `getCurrentDisplayName()`.

Actions (the "Continue" button only renders `${standalone ? '' : ...}` — omitted entirely in standalone mode, since there's nothing to resume):
- **Rest Until Morning**: rolls `NIGHT_AMBUSH_CHANCE` (0.15) first — see [combat.md](combat.md) for why this one can trigger a fight and the Inn's rest can't. Either way, `finishRest()` (defined inline) applies the same full heal and stamina refill as the Inn (not Food — see [player-state.md](player-state.md)), plus `advanceDays(1)`.
- **Continue to `${destName}`** (mid-journey only): closes the overlay and calls `beginTravel(destId)` again — resumes the same journey from `campPos`, recomputing the route fresh (this will re-check the Food gate; since resting doesn't restock Food, this only succeeds if you already had enough for the *full remaining trip* — `beginTravel` blocks with a toast otherwise).
- **Choose a Different Destination** / **Back to Map** (label depends on `standalone`): just closes the overlay back to the map. `campPos` (if set) is left untouched either way — the player stays exactly where they stopped/camped, free to tap anywhere else.

## Adding a new location action

All three view functions follow the same pattern: build an array of small metadata objects (or, for Inn/Market, just a fixed block of HTML), `.map()` or template them into `#loc-action-list`, then `querySelectorAll` + `addEventListener` to wire clicks. `showMarketPanel` is the template to copy for a second shop (e.g. an Armorer) — replace `#loc-action-list`'s contents with a new sub-screen rather than adding a new top-level overlay, so the existing "Back" chain of `location-view → sub-panel → location-view → map` stays intact. Work is the exception: not every action needs a sub-panel — a one-shot result like `doWork()` can just run directly from `showLocationView`'s action-list handler and toast the outcome, no `showXPanel`/Back-button pair required.
