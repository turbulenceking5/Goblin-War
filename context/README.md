# Context Files — Reading Guide

These files exist so an AI assistant (or a returning human) can load just the system they're touching instead of the whole codebase. Project overview and file map live in [../CLAUDE.md](../CLAUDE.md); this index is for the context folder specifically — useful if you're uploading only this folder somewhere (e.g. a claude.ai Project's knowledge) without the rest of the repo attached.

## Suggested reading order

1. **[player-state.md](player-state.md)** — the `localStorage` keys everything else touches. Read this first regardless of what you're changing.
2. **[travel-and-map.md](travel-and-map.md)** — the biggest system; most other systems hang off the map screen.
3. **[combat.md](combat.md)** and **[locations-and-camp.md](locations-and-camp.md)** — both extend the map screen, best read after it.
4. **[factions-and-territory.md](factions-and-territory.md)** — the weekly faction AI tick; depends on `locations-and-camp.md`'s Marketplace section (war-driven pricing) and the calendar in `travel-and-map.md` (the tick rides on `advanceDays`).
5. **[save-system.md](save-system.md)** and **[secondary-pages.md](secondary-pages.md)** — the smaller, mostly-independent pages.
6. **[data-files.md](data-files.md)** — reference material on the world data shape, read on demand rather than up front.
7. **[roadmap.md](roadmap.md)** — what's intentionally unbuilt, useful before proposing new features so you don't duplicate a stub that already has a planned home.

## Dependency notes

- Every file assumes you know the key names from `player-state.md` — they're not re-explained elsewhere.
- `combat.md` and `locations-and-camp.md` both describe pieces of index.html and reference each other (ambushes fire *from* travel/camp *into* combat).
- `data-files.md` is pure reference — nothing depends on reading it first, but `travel-and-map.md` will make more sense with it in mind if you're touching pathfinding.

## Keeping these current

There's no build step or test suite tying these docs to the code (see the no-modules convention in [../CLAUDE.md](../CLAUDE.md)) — they're accurate as of the code that existed when each was written, and can drift. If you change a system described here, update its file in the same change rather than leaving it to rot; a stale context file is worse than none, since it'll actively mislead the next read.
