# Scene Backdrops tracker — a Claude Artifact, not part of this repo

**Live at:** https://claude.ai/artifact/D8yWjovudsyUoSNw6RTfM8

This is a separate, self-persisting Claude Artifact (not a file in this repo) used to track AI-image-generation
prompts for Goblin War's visual assets — environment backdrops, world-map icons, settlement location art, and
the Realm Forge procedural-world terrain/sprites. [CLAUDE.md](../CLAUDE.md) and the other context files
(`combat.md`, `roadmap.md`, `locations-and-camp.md`, `factions-and-territory.md`) reference it by name
("the Scene Backdrops tracker") whenever a piece of art is pending or was recently regenerated. This file exists
so a future session reviewing generated images knows which artifact entry a given image belongs to without
re-deriving the naming convention from scratch.

## Why this file exists

The project owner iteratively reviews AI-generated candidate images and reports defects (e.g. "there's still
goblins on the ladders", "these are for when the bad side attacks during the day"). Fixing the right prompt
requires knowing which of the tracker's ~40 items a given image is a candidate for — especially for the four
siege entries, whose names (`bg-siege-day-good`/`bg-siege-day-bad`/`bg-siege-night-good`/`bg-siege-night-bad`)
encode two independent axes (time of day, which alliance is attacking) that are easy to mix up.

## Editing the artifact (mechanics)

The page rebuilds itself from a `<script id="state-data" type="application/json">{"items":[...]}</script>` block.
Each item: `{id, name, category, usedBy, prompt, images: [...], implemented: bool}`. To edit it from outside its
own live JS:
1. `Artifact` tool, `action:"read"`, the `url` above — this saves the full HTML to a local file and hands back
   the path. Read that file in full (required before any edit).
2. `Edit` that exact file, touching only the specific JSON string field(s) for the item(s) in question — never
   touch the CSS, the `HEAD_HTML`/`MAIN_SCRIPT_SRC` equivalent, or other items' entries.
3. Sanity-check the edited JSON is still valid (e.g. a Python regex-extract + `json.loads()` pass) before publishing.
4. `Artifact` tool, `action:"publish"`, same `url` and `file_path` — updates the existing artifact in place. Never
   publish without `url` (that creates a separate new artifact instead of updating this one).
5. To add a generated candidate image to an item's gallery: `Artifact` tool, `action:"publish"`, the artifact's
   `url`, `asset:true`, `file_paths` (the local image file(s)) — returns each upload's `/_blob/<hash>` URL, which
   gets appended to that item's `images` array in the JSON (step 2) before republishing.
6. House style: only *clean* candidates go in `images`. A defective candidate is discarded, not kept — its defect
   gets a short note in `usedBy` instead ("3 clean candidates kept below; other generated attempts had ork/goblin
   defenders straying off the parapet onto the ground and were discarded").

**Critical: only treat an image's file path as authoritative for re-upload/forensic comparison if it was given via
a proper system-reminder path like `/root/.claude/uploads/<session-id>/<hash>-image.<ext>`.** An informal "source:"
annotation inside the user's own message text (e.g. a `/tmp/claude-0/.../images/N.jpg` path) is not reliable —
treating it as identical/authoritative to a real upload path has caused real duplicate-detection errors before.
When no proper upload path is given, fall back to direct visual inspection only, with lower confidence noted.

## Categories

`icon` (map markers — army/battle/supply-cut), `context` (combat backdrops keyed by trigger, not terrain — Field
Battle, Night Camp, the 4 siege entries), `biome` (combat backdrops keyed by a burg's actual terrain — Forest,
Plains, Hills, etc.), `location` (settlement interior scenes — Tavern, Marketplace, etc. — currently all pulled
pending pixel-art regen, see `assets/locations/`'s row in CLAUDE.md), `terrain` (Realm Forge's procedural-map
sprites/textures — mountain ranges, trees, tileable ground textures).

## The siege quartet — naming convention (the thing most worth getting right)

Four `context` items cover `SIEGE_ART`, the backdrop pool for Defend the Walls (`triggerSiegeDefenseFight`,
index.html). `SIEGE_ART` is one flat array in the actual game code — not yet split by alliance/time — but the
tracker already models all four combinations so each can be generated and fixed independently:

| Item id | Time | Attacker (outside, besieging) | Defender (atop/behind the wall) |
|---|---|---|---|
| `bg-siege-day-good` | Daylight | **Good alliance** — human/dwarf | Ork/goblin |
| `bg-siege-day-bad` | Daylight | **Bad alliance** — ork/goblin | Human/dwarf |
| `bg-siege-night-good` | Night | **Good alliance** — human/dwarf | Ork/goblin |
| `bg-siege-night-bad` | Night | **Bad alliance** — ork/goblin | Human/dwarf |

**The `good`/`bad` in the id names the attacker, not the defender.** "The bad side attacking during the day" =
`bg-siege-day-bad`. This is the one detail most likely to get swapped when a user describes a batch of images in
plain language — always translate "which side is attacking" into the id before editing, not "which side is
depicted" in general (both sides always appear in every siege image).

Good alliance = human/dwarf (blue-and-silver banners, disciplined ranks, a proper wooden siege tower, long
ladders). Bad alliance = ork/goblin (tattered red-and-black banners, a crude warband, a crude lashed-together
siege tower, crudely-lashed ladders). This matches `ALLIANCE[race]` in index.html's own faction code.

All four prompts are structurally symmetric (same beats, race-swapped) except: the two **Good-alliance**
(ork/goblin-defending) prompts carry extra reinforcement text pinning defenders to the parapet ("every ork and
goblin in this scene is pinned to the parapet's stonework... none climbs down, jumps down, drops to the ground...")
that the two Bad-alliance prompts don't. This is deliberate, not an oversight — see "Known recurring defects" below.

## Known recurring defects and their fixes (so a future session doesn't re-litigate these)

Fixed, in rough chronological order:
- **Siege ladders/tower too short to reach the wall** — fixed by explicitly stating the tower is "built taller
  than the wall with its top platform level with the parapet" and ladders "reach all the way up to the top of
  the wall."
- **Empty-looking scene** (no soldiers on the siege engines) — caused by the shared `context` category's style
  suffix including a blanket "no characters or creatures present" clause (written for entries where the game
  overlays its own enemy portrait separately). Fixed by explicitly describing soldiers on the ladders/tower/ram
  crew/trebuchet crew in-prompt, which reads as emphasis since the suffix is appended after the prompt text.
- **Attacker race on both sides of the wall** — fixed by restructuring to strict one-side-per-race separation
  ("Outside, on the attacking side only: ... Atop and behind the wall, on the defending side only: ...").
- **Defender race on the ladders/tower** — fixed with explicit negative constraints ("every figure actually
  touching a ladder, the tower, or the ground is a [attacker race]").
- **Defender race standing on the ground at the wall's base** (a persistent, multi-round issue — see below).
- **Dead bodies**: added per the project owner's request, with an explicit constraint that corpses on each
  side's ground must match that side's own attacker race, never the defender's.
- **Game UI/HUD chrome and decorative border frames baked into generated images** — fixed by adapting `bg-camp`
  (Night Camp)'s existing precedent verbatim: *"absolutely no UI elements, no HUD, no menus, no buttons, no
  icons, no interface graphics or overlays of any kind — pure background artwork, not a game screen or menu"*,
  plus "bleeding flat to all four edges with no border, frame, or vignette of any kind." Added to all four
  siege prompts.

**Open / asymmetric finding**: the "defender figure stray on the ground" defect was observed to occur *only*
when the Good alliance attacks (i.e. only in `bg-siege-day-good`/`bg-siege-night-good`, where orks/goblins are
the defenders) — never when the Bad alliance attacks. The two prompts were confirmed structurally/textually
symmetric before concluding this, so it's hypothesized to be a generator-side bias (orks/goblins culturally
associated with chaotic ground-swarming poses in fantasy art broadly) rather than a prompt-wording bug. Response:
asymmetric reinforcement — only the two Good-alliance (ork-defending) prompts carry the extra "pinned to the
parapet... under any circumstances" language. Do not blanket-apply that reinforcement to the Bad-alliance prompts
too; it wasn't needed there and would just bloat the prompt.

## Current image status (drifts — check the live artifact for ground truth)

As of this writing, `bg-siege-day-good` is the only one of the four with clean candidates in its `images` array
(3 images). `bg-siege-day-bad`, `bg-siege-night-good`, and `bg-siege-night-bad` all have empty `images` arrays —
not yet generated/reviewed to a clean batch. Update this section (or just drop it and rely on the live artifact)
whenever a future session adds images, so it doesn't silently go stale.
