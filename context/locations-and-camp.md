# Locations & Camp (index.html)

Two full-screen overlays (`#location-view`, shared markup, z-index 60) that show up in different contexts: arriving at (or re-entering) a settlement, versus stopping mid-journey. Both use the same shell — `#loc-actions` (a full-width, full-height scrollable list of action buttons) with `#loc-visual` pinned as a small `position:fixed` box in the bottom-right corner (112×130px, `z-index:61`, so it stays on top of the scrolling list rather than scrolling with it) showing an SVG illustration + name/tier label — just populated differently. That corner box is a placeholder reserved for real per-settlement art later; `#loc-actions`' bottom padding (`150px`) exists specifically so the last action button never ends up hidden behind it.

## Settlement view — `showLocationView(burgId)`

Reached by tapping "Enter Settlement" / "Travel Here" on a burg you're already at, or automatically on arrival after travel (post-ambush-roll, see [combat.md](combat.md)).

- The visual side picks an SVG from `TIER_ART` (`village`/`town`/`city`/`capital` — four hand-drawn building illustrations, no per-settlement art).
- The action list is a small array of `{icon, title, desc, action}` objects rendered identically. Every settlement gets the same base four:
  - **The Inn** (`action:'inn'`) → `showInnPanel(burgId)`.
  - **Marketplace** (`action:'market'`) → `showMarketPanel(burgId)`.
  - **Work** (`action:'work'`) → `doWork()`, straight from the action list with no sub-panel — see "Work" below.
  - **Talk to Townsfolk** (`action:'stub'`) → toast "Not built yet — coming in a future update." (see [roadmap.md](roadmap.md)).

  City- and Capital-tier settlements get more on top, appended conditionally by `b.tier` before the array is rendered — deliberately so a big settlement has more to actually do, not just a fancier building icon:
  - **Temple** (`action:'temple'`, City + Capital) and **Guard House** (`action:'guardhouse'`, City + Capital) → `showFlavorPanel(burgId, title, LINES)`.
  - **The Palace** (`action:'palace'`, Capital only) → same, one tier further.

  All three route through one shared `showFlavorPanel(burgId, title, lines)` rather than three near-copies of `showInnPanel` — it picks a random line from whichever pool is passed in (`TEMPLE_LINES`/`GUARDHOUSE_LINES`/`PALACE_LINES`, 5 lines each, same flavor-only pattern as `RUMOURS`) and renders one Back button + one quote box. No mechanical effect, same as Talk to Townsfolk's eventual replacement is likely to be — see [roadmap.md](roadmap.md).
- `loc-back` (the `&larr; Back to Map` button) just hides the overlay — no state changes.

### The Inn — `showInnPanel(burgId)`

Replaces the action list in-place (same `#loc-action-list` container) with, in this order:
- **Rest for the Night** first: `advanceDays(1)`, full heal (`setHealth(playerMaxHealth)`) and full stamina refill (`setStamina(playerMaxStamina)`), toast, and a fresh rumour swapped in. No ambush roll here — Inns are the safe option (contrast with camping, below). Resting does **not** restore Food — see [player-state.md](player-state.md) on why that's deliberate. Health and stamina are the only two things resting ever touches.
- A random line from the `RUMOURS` array (12 flavor-text strings, no mechanical effect — pure world-building color) under "Tavern Talk", below the Rest button — deliberately ordered so the action you're most likely here for isn't buried under flavor text.
- **Back** returns to `showLocationView(burgId)`, i.e. one level up, not the map.

### Work — `doWork(burgId)`

No sub-panel, just an immediate result straight from the settlement action list — but gated by a per-settlement, once-per-day cooldown. `hasWorkedToday(burgId)` checks `goblinwar_workCooldowns` (a `{burgId: gameDay}` JSON map, read/written via `getWorkCooldowns()`/`recordWorked()`) against the current `gameDay`; `showLocationView` calls it while building the action list, so a settlement already worked today renders its Work button `disabled` with the description swapped to "Already worked here today — come back tomorrow" (native `disabled` buttons don't fire `click` at all, so `doWork`'s own cooldown check at the top is a fallback, not the primary gate — same belt-and-suspenders pattern as combat's Attack button). Because the cooldown key is `gameDay`, not a real-world timer, it clears whenever the calendar actually advances — resting at an Inn/camp (always +1 day) or a long enough journey (see [travel-and-map.md](travel-and-map.md)) — not by waiting in real time.

When it's available: picks a random gold amount in `[3,15]` (`randRange`, same helper combat uses), adds it via `setGold(playerGold + earned)`, calls `recordWorked(burgId)`, shows a toast built from a random line in `WORK_LINES` (5 flavor strings) plus the amount earned, and re-renders the panel with `showLocationView(burgId)` so the now-disabled Work button and its cooldown message show up immediately rather than only after leaving and re-entering. No time cost — `gameDay` isn't touched by working itself — and no stamina cost either (stamina is combat-only, see [player-state.md](player-state.md)/[combat.md](combat.md)).

### The Marketplace — `showMarketPanel(burgId)`

The only shop in the game, and the only source of Food besides whatever you start with. Sells everything in the `MARKET_ITEMS` array (index.html, near `DEFAULT_INVENTORY`) — Food, Sword, Shield, Leather Cap, Leather Armour, Leather Boots, Lucky Charm, Healing Potion, Books, and Firewood — each with its own `{name, price, weight, desc}`, plus `slot`/`dmg`/`def` on the six equippable ones (see [player-state.md](player-state.md) for the full equip table):
- Shows current gold and carried weight (`getCarriedWeight()`/`CARRY_CAPACITY`) up top, then one row per `MARKET_ITEMS` entry (price/weight-per-unit, current carried amount from `getItem(name)`), each with a quantity **slider** (`<input type="range">`, `data-slider`) instead of fixed Buy 1/Buy 5 buttons, a live readout (`#qty-readout-N`, updated on the slider's `input` event without a full re-render), and one **Buy** button that reads the slider's current value.
- Each slider's `max` isn't a flat number — `render()` computes `Math.min(MAX_SLIDER_QTY (30), affordableQty, capacityQty)` per item, so you can never drag past what you could actually afford or carry at render time (though gold/weight can still change between renders from other purchases, which is what the real gate in `buyItem` is for — the slider max is a UX convenience, not the source of truth).
- Buy buttons carry a `data-buy` index into `MARKET_ITEMS` (not a fixed qty) rather than one hardcoded handler per item, so adding a new item to `MARKET_ITEMS` is enough — no new wiring needed in `render()`.
- `buyItem(mi, qty)` (generalized from the old Food-only `buyFood`) checks gold first (toast + no-op if short), then calls `addItem(mi.name, qty, mi.weight, mi.price)` (toast + no-op if it would exceed `CARRY_CAPACITY` — see [player-state.md](player-state.md)), and only deducts gold (`setGold`) if the item was actually added. Order matters here: a failed weight check must never have already spent the player's gold.
- Re-renders itself in place after every purchase (`render()` is a closure over `burgId`/`list`, called both initially and after `buyItem` succeeds) so the gold/weight/carried numbers — and every slider's recomputed `max` — stay current without leaving the panel. Sliders reset to `1` on every re-render; there's no "remember what I had the slider set to" behavior.
- Buying doesn't equip anything — a bought Sword just joins the bag like Waterskin/Bedroll always have. Equipping happens on inventory.html, not here — see [player-state.md](player-state.md) and [secondary-pages.md](secondary-pages.md).

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

All three view functions follow the same pattern: build an array of small metadata objects (or, for Inn/Market, just a fixed block of HTML), `.map()` or template them into `#loc-action-list`, then `querySelectorAll` + `addEventListener` to wire clicks. `showMarketPanel` is the template to copy for a second shop (e.g. an Armorer) — replace `#loc-action-list`'s contents with a new sub-screen rather than adding a new top-level overlay, so the existing "Back" chain of `location-view → sub-panel → location-view → map` stays intact. Work is the exception: not every action needs a sub-panel — a one-shot result like `doWork()` can just run directly from `showLocationView`'s action-list handler and toast the outcome, no `showXPanel`/Back-button pair required. For a pure-flavor sub-panel with no mechanical effect (Temple, Guard House, The Palace), `showFlavorPanel(burgId, title, lines)` is the one to reuse rather than writing a fourth near-identical function — it's already generic over title and line pool.

Gating an action to certain settlement tiers (as Temple/Guard House/Palace do) is just conditionally `.push()`-ing onto the `actions` array in `showLocationView` before it's rendered — `b.tier` is already available there from the burg lookup at the top of the function.
