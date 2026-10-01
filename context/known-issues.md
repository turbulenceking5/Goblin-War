# Known Issues — a Claude Artifact, not part of this repo

**Live at:** https://claude.ai/artifact/Fc6hK4wFwrTsDa8VYuUS2Y

Another non-art tracker in this family: a bug/regression log for things found while building or
testing Goblin War, plus standing conventions worth re-verifying as the game grows. Its own banner
note states the intended workflow: *"Before shipping a change that touches one of these areas — or
at the start of a new session working on the game — skim 'Needs Recheck' and confirm the behavior
still holds. Mark Fixed once verified fixed, or leave a fresh note if it recurs."*

**Worth skimming at the start of a session that touches Party/Mercenaries or the character-save
system specifically** — several open recheck items concentrate there (see below).

## Structure

Flat item list, each: `{id, title, severity: high|medium|low, status: open|recheck|fixed, found,
area, desc, recheck}`. `recheck` is a short note on exactly what to re-verify and how (a concrete
repro step), not just a restated description of the bug.

## The one high-severity standing rule — reinforces a CLAUDE.md convention directly

`cross-character-key-bleed-pattern` (status: `recheck`, severity: `high`) restates, with a concrete
mechanism, the same rule CLAUDE.md's Conventions section already states in general terms ("Don't
add a new persisted key to `localStorage` alone and assume it's safe"): every new `goblinwar_*` key
added to `collectCharacterSnapshot()` (in both index.html and settings.html) must also get a default
in characters.html's `freshCharacterData()` and a merge line in `applyCharacterData()`, or an older
or freshly-created character can silently inherit a different character's leftover value for that
key — a real bug this codebase has already had once, with sieges. **Any session that adds a new
persisted key should check this item off (or add a fresh note) as part of that change**, not just
rely on CLAUDE.md's general-purpose warning.

## Other open/recheck items as of this writing

- Several `recheck`-status items cluster around **Party / Mercenaries** (index.html): multi-
  mercenary upkeep charging with mixed affordability was verified by code reading only, never an
  actual two-mercenary test; the Guard House's "party full (3/3)" disabled-button state was never
  actually driven to 3/3 and observed.
  - A per-mercenary-upkeep persistence bug (`merc-upkeep-not-persisted`) is already marked `fixed`.
- An achievement's "earned" (checkmark/green) card styling was verified by reading the CSS only —
  no achievement was ever actually pushed past its threshold on a real test character to see it
  trigger live.

These are all **low/medium severity, read-the-code-but-never-saw-it-live** gaps — not active bugs,
just untested paths worth a real pass with a live account next time one of those screens is touched.

## Status (drifts — check the live artifact for ground truth)

Most items are `recheck`, meaning "believed fine by code reading, never confirmed with an actual
playtest" rather than "known broken." Only the `merc-upkeep-not-persisted` item (fixed) and the
cross-character-key-bleed item (recheck, but actively enforced/re-confirmed for every key added
since 2026-09-09 per its own note) have seen recent attention — the others may simply be stale
accumulated low-priority items rather than anything urgent.
