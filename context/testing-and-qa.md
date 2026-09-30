# Testing & QA

There's no automated test suite and no CI (see [../CLAUDE.md](../CLAUDE.md)'s no-build-step convention) — every change is verified by hand, in an actual browser, against the game running with a real logged-in character. This file is a checklist for that manual pass: what to click through before calling a change done, organized so you can run just the section(s) your change touches plus the cross-cutting checks at the bottom.

This is a checklist, not a spec — see the relevant `context/*.md` file for what "correct" behavior actually is for a given system.

## Before you start

- Have a Supabase project wired up (see [../SETUP.md](../SETUP.md)) and at least one test account with 2+ characters — some checks (Switch Character, roster caps) need more than one.
- Serve over real HTTP, not `file://` (the login gate depends on a stable origin).
- Test in whatever's the primary target (a real mobile browser or an installed home-screen PWA) at least once per change that touches layout — desktop-browser-only testing misses safe-area-inset and touch-target issues.

## Login & character gate ([context/accounts.md](context/accounts.md), [context/characters.md](context/characters.md))

- [ ] Logged out, visiting any gated page redirects to `login.html?redirect=<page>`; after logging in you land on `characters.html`, then on the *original* target page after picking a character — not straight into the game.
- [ ] Logged in but no active character redirects to `characters.html?redirect=<page>` instead of `login.html`.
- [ ] Sign up → confirmation email → click the link → lands on `login.html` showing "You're authenticated!", not a 404 (see SETUP.md if this fails).
- [ ] Switch Character (settings.html) actually swaps which save loads on the next page visit.
- [ ] Log out in one tab; a second already-open tab redirects to login on its next action (`SIGNED_OUT` listener).
- [ ] Delete This Character removes it from the roster and from the Supabase `characters` table (check Table Editor), and doesn't leave `goblinwar_activeCharacterId` pointing at a dead row.

## Core loop smoke test (run this for *any* change, however small)

- [ ] Map loads, pans/zooms, and a settlement can be reached by travel.
- [ ] Entering a settlement shows the location view; "Back to Map" returns cleanly (no leftover overlay, no wrong z-order — see CLAUDE.md's overlay z-index note).
- [ ] Triggering a fight (ambush or a location action) enters combat, at least one full turn loop completes (attack, take damage, use a special attack, win or flee), and returns to the map/location afterward with health/stamina/gold/inventory changes reflected everywhere (map HUD, character.html, inventory.html).
- [ ] Autosave fires without blocking navigation — tapping between pages feels instant, not stalled on a save (see [context/characters.md](context/characters.md)'s Autosave section).
- [ ] Reload the page mid-session — state resumes from the same `localStorage` snapshot, not reset.

## Page-by-page checks

Run the block for whichever page(s) your change touches.

**index.html (map, combat, locations, factions)**
- [ ] Travel animation, camp/stop-mid-journey, and the day/night cycle all still render.
- [ ] A settlement's Tavern, Work, Marketplace, Blacksmith, and (if at war) Army Camp panels all open and their actions resolve.
- [ ] War-driven Marketplace pricing changes when a settlement's controlling kingdom is at war (see [context/factions-and-territory.md](context/factions-and-territory.md)).
- [ ] The weekly faction tick doesn't throw when it lands mid-session (advance the calendar across a week boundary, e.g. via repeated travel/camp).
- [ ] "What's New" changelog popup appears only when the logged-in account's `goblinwar_lastSeenChangelog_<user id>` is behind the newest `CHANGELOG` id, and dismissing it (or visiting changelog.html) marks it seen for *that account only*.
- [ ] The "Update available" banner appears when `version.json`'s `changelogId` is ahead of the loaded page's baked-in id.

**character.html / skills.html**
- [ ] Equipment and Accessories can be unequipped from character.html; equipping still happens from inventory.html.
- [ ] Spending a skill point on Strength/Agility/Intelligence updates derived stats (Health/Stamina caps, damage) immediately.
- [ ] All 6 active special attacks are usable in combat and respect their stamina cost/cooldown.

**inventory.html**
- [ ] Equipping an item there is reflected on character.html without a reload.
- [ ] Carried weight and gold totals match what the map HUD/character sheet show.
- [ ] Real-art items (`assets/equipment/`) render at 76px, same as the generic SVG-icon fallback items, with no layout jump between the two.

**quests.html**
- [ ] Active Quests list matches what's actually offered/accepted in-game (Quest Board and Notable Figure sources — see [context/quests.md](context/quests.md)); Abandon removes it from both the list and any in-progress state.
- [ ] Turn-in grants the stated reward and moves the quest into Recently Completed.

**party.html**
- [ ] Recruiting a companion via "A New Face" and hiring a mercenary via the Guard House both show up here, respecting the combined cap of 3.
- [ ] Part Ways / Dismiss actually removes them from the roster and from combat.
- [ ] Loyalty bar (companions) is read-only here, and mercenary portraits stay faceless per the art convention.

**settings.html / achievements.html / changelog.html**
- [ ] Save Now writes to Supabase (check `updated_at` in Table Editor).
- [ ] Every achievement progress bar advances when its underlying stat does (a kill, a quest completion, a level-up, a first capital visit) — see [context/secondary-pages.md](context/secondary-pages.md).
- [ ] changelog.html's full history matches index.html's popup content exactly (they're duplicated arrays — see the Conventions bullet below).

## Cross-cutting checks (easy to break without noticing)

These map directly to the "Conventions worth knowing" bullets in [../CLAUDE.md](../CLAUDE.md) — each one has caused a real bug before, per that file.

- [ ] **CHANGELOG in three places.** If your change is player-visible, confirm the `CHANGELOG` array was added identically to index.html *and* changelog.html, with `version.json`'s `changelogId` bumped to match.
- [ ] **Duplicated logic stays in sync.** If you changed a formula/constant that exists on multiple pages (per the no-modules convention), grep for it elsewhere and update every copy, not just the one you were editing.
- [ ] **Cache-busting.** Any new same-app link/redirect appends `?_=' + Date.now()`.
- [ ] **z-index.** A new full-screen overlay is either below `#toast`'s z-index (80) or `#toast` was bumped again to stay on top.
- [ ] **Safe-area insets.** A new fixed/sticky element pinned to a screen edge includes `env(safe-area-inset-*)` padding, checked on an installed iOS home-screen app if possible (not just a desktop browser, which won't show the clipping).
- [ ] **Dark theme tokens.** New UI uses the existing palette (`#1c150c`/`#2b2115` backgrounds, `var(--parchment)` text, `rgba(209,164,69,.35)` borders) rather than a fresh light card.
- [ ] **PWA icon cache-buster.** If `assets/icons/icon-*.png` changed, the `?v=` param was bumped in all three `<link>` tags on every page plus `manifest.json`'s two `icons` entries.

## What this checklist won't catch

It's manual and shallow by design — it won't catch a subtle math error in, say, faction war-exhaustion decay or pathfinding cost, only that the feature runs without erroring. For a change to game balance or a data-shape change (anything in the character snapshot — see [context/characters.md](context/characters.md)), reason through the numbers by hand or add a scratch console log, since nothing here will do it for you.
