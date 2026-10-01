# Character Forge tracker — a Claude Artifact, not part of this repo

**Live at:** https://claude.ai/artifact/WxzLVrHqSG8Ub6znHwzVjy

A Claude Artifact tracking AI-image-generation prompts and generated portraits for Goblin War's
characters and enemies — `ENEMY_VARIANTS` combat portraits, `NOTABLE_FIGURES` portraits,
recruitable `COMPANIONS`, and not-yet-wired NPCs like Natasha & Sophie (see
[roadmap.md](roadmap.md)'s "Talkable NPCs & Dialogue" section). Tabbed by race/category (human,
goblin, ork, dwarf, creature) rather than the collapsible-section layout the other trackers use.

## Critical difference from every other tracker: images are inline base64, not asset-store blobs

Scene Backdrops / UI Forge / Item Forge all store generated images as `/_blob/<hash>` references
into the artifact's own asset store (uploaded via `Artifact` tool's `asset:true` + `file_paths`).
**Character Forge instead embeds each image directly as a `data:image/png;base64,...` string inside
the item's own JSON field.** This is why the artifact's saved HTML file is enormous (~7MB) — every
portrait's full image data lives inline in the page source itself, not referenced externally.

Practical consequences for editing this one:
- The saved local file is too large to `Read` in full — read specific line ranges with
  offset/limit, the way the tool's own truncation notice instructs, and never try to view the whole
  file at once.
- Adding a new portrait here means base64-encoding the image and inserting the full data URI string
  into the JSON (not a short blob-id reference like the other trackers) — a much heavier edit. If a
  future session is adding bulk portraits, it's worth asking whether to switch this tracker onto the
  same asset-store pattern the others use before adding much more, rather than continuing to inflate
  an already-7MB file — but don't make that change unprompted.
- The primary field is `"image"` (singular, one main portrait), not an `"images"` array like every
  other tracker — there's no multi-candidate gallery convention here, just one image per character.

## The `expressions` field

Per [roadmap.md](roadmap.md)'s "Character Forge now supports more than one piece of art per
character" note, an item can carry an optional `expressions` array of `{label, image}` objects
alongside its main portrait — rendered as a row of small labeled thumbnails. Sophie (the companion
dog from the unbuilt Natasha & Sophie NPC pair) is the first and so far only entry using this, with
a Friendly/Neutral pair. The pattern exists for future combat-pose or dialogue-frame variants once
those get generated — not wired into any live game code yet since Talkable NPCs itself isn't built.

## What's in here

- `ENEMY_VARIANTS` combat portraits (Bandit confirmed present; the other named variants across
  Bandit/Goblin/Ork per [combat.md](combat.md) should also be here — check the live artifact for
  the full roster before assuming one is missing).
- `NOTABLE_FIGURES` portraits (5 named figures — Captain Aldric Vane, Yselle Thorn, Elder Bram
  Oswick, Scoutmaster Priska Ren, Sir Corwin Hale) — all wired into the live game via each figure's
  `portrait` field, per roadmap.md.
- `COMPANIONS` catalog portraits (Ser Brannoc Ward, Wren Sable, Thrain Emberforge) — real art
  exists per CLAUDE.md's `assets/party/` row, but nothing can recruit them in-game yet.
- Human/dwarf character-art roster (knights, mages, rangers, dwarven warriors) for the still-unscoped
  bigger "Talkable NPCs" idea — intentionally left unchecked for "Asset implemented in game" since
  none of it is wired into anything yet; start here first if that idea ever gets scoped for real
  rather than commissioning fresh art.
- Natasha & Sophie (princess + mythical companion dog), meant to appear together once Talkable NPCs
  exists — both have portrait art now.

## Status (drifts — check the live artifact for ground truth)

This tracker holds a mix of fully-wired portraits (Notable Figures, the 3 named Companions) and a
growing unwired backlog (generic human/dwarf roster, Natasha & Sophie) — check each item's
`implemented` flag individually rather than assuming category-wide status.
