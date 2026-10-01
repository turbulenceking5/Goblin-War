# War Room — a Claude Artifact, not part of this repo

**Live at:** https://claude.ai/artifact/FzguJP5U16ZQVmyMMuajZq

Unlike every other tracker artifact in this family, War Room is **not an art/image-prompt
tracker** — it's a feature-status board that mirrors [roadmap.md](roadmap.md), letting the project
owner click through every stub, in-progress build, and brainstormed idea without reading the raw
markdown file. Its own footer says exactly what it is: *"Mirrors context/roadmap.md in the
Goblin-War repo — click a status circle to cycle Not Started → In Progress → Implemented. Kept in
sync by hand, not automatically."*

## This duplicates roadmap.md — keep both in sync when you touch either

There is no automatic sync between this artifact and `context/roadmap.md`. When a feature ships (or
a roadmap item's status changes) and roadmap.md gets updated as part of that work — per this repo's
own standing convention — **War Room should get the matching status-circle update too**, the same
read → edit JSON → publish mechanics every other tracker in this family uses. If a future session
only updates roadmap.md and not this artifact (or vice versa), the two will drift and whichever one
is read next will mislead. Treat roadmap.md as the authoritative source when they disagree — it's
the one actually checked into version control.

## Structure

Items are nested under `sections` (not a flat list): `{id, name, items: [...]}` per major system
area. Each item: `{id, title, desc, status}`, where `status` is one of `not-started` / `in-progress`
/ `implemented` (hyphenated, not the boolean `implemented` field the art trackers use). Sections seen
as of this writing: Skills & Progression, Quests, Faction AI/Territory & War Economy, Settlements &
Locations, World Map & Travel, Combat, Talkable NPCs & Dialogue, Party/Companions, Presentation &
Art, Character Creation & Race, Living World (big ideas) — likely more beyond what a single read
captured, given the artifact's size (~58KB, 257 lines, with some individual lines tens of thousands
of characters long); read further into the file if a section isn't found where expected.

## One pinned design note worth remembering

The page's own fixed note, shown above every section: *"Player power stays a support role, by
design — strong enough to matter, never strong enough to solo-topple a city."* This is a standing
constraint the project owner has settled on — worth checking any new combat/army-strength/player-
power feature proposal against before building it.

## When to read this vs. roadmap.md

Prefer `context/roadmap.md` for anything you're about to act on (it's versioned, diffable, and the
actual source of truth this repo tracks). Read War Room specifically when: the project owner
references "the tracker" or "War Room" by name, you need the project owner's own click-tracked
Not-Started/In-Progress/Implemented state at a glance, or you've just shipped something and need to
update both places to keep them from drifting.
