# UI Forge tracker — a Claude Artifact, not part of this repo

**Live at:** https://claude.ai/artifact/WcWpEZnR6rn5pMw4zunJGC

A Claude Artifact tracking AI-image-generation prompts for Goblin War's deep-blue/gold pixel-art UI
reskin (see [roadmap.md](roadmap.md)'s "UI Theme" entry and CLAUDE.md's Conventions section).
Split out of [Item Forge](item-forge.md)'s old "UI Theme" section so items and UI assets aren't
mixed in one tracker. Same editing mechanics as [scene-backdrops.md](scene-backdrops.md) describes
(read via `Artifact` → edit the saved local file's `state-data` JSON → validate → publish with the
same `url`) — not repeated here.

## Structure

One flat `category: "ui"` item list (28 items), grouped by `slotGroup` for display:

- **Panels & Bars** — 9-slice panel border, Health/Stamina bar track+fill (4 separate prompts, not
  one bar each — tracks and fills are separate layered assets), Level badge frame, Race pill
  background.
- **Portrait** — portrait frame/rune border/crest, and a placeholder character portrait sprite
  (one-per-race once character creation exists — still unbuilt, see roadmap.md's Character
  Creation section).
- **Perk Icons** — one icon per passive perk (Power Strike, Iron Skin, Pack Mule, Evasion, Second
  Wind, Sure Feet, Silver Tongue, Scavenger, Field Rations) — 9 total, matching
  [player-state.md](player-state.md)'s perk list exactly.
- **Special Attack Icons** — one per active move (Crushing Blow, Reckless Swing, Precise Shot,
  Adrenaline Rush, War Cry, Cleave) — 6 total.
- **Buttons & Navigation** — Unlock button skin, top-bar sword icon.
- **Background & Type** — the tileable navy dither background texture, and the pixel display font.

## The one non-image item: `ui-font`

`ui-font`'s `prompt` field isn't an image prompt at all — it documents a **sourced licensed
webfont** (Press Start 2P, Google Fonts, SIL Open Font License) instead of generated art, with the
actual `<link>`/CSS snippet to paste recorded in its `note` field. `fullPrompt()` special-cases
this item's id to skip appending the shared `STYLE_SUFFIX_UI` suffix, since there's no image prompt
to suffix. Don't try to "generate" this one — it's already resolved, just not wired into every page
yet (per roadmap.md, the navy palette + pixel font are live on all 11 player pages already, so this
may already be stale/done — check the live pages before assuming otherwise).

## Status (drifts — check the live artifact and roadmap.md for ground truth)

27 of 28 assets have real generated art as of the last roadmap.md sync. The two still not wired
into the game are the Portrait frame and Portrait sprite — character creation / a race picker
doesn't exist yet, so there's nowhere in the live game to put them yet. Everything else (bars,
badges, perk/special-attack icons, buttons, background texture) is live.
