# Goblin War

A browser-based overworld RPG. No build step, no framework — every page is a single self-contained `.html` file with inline `<style>` and `<script>`, opened directly or served as static files. Each character's world (map, settlements, factions) is procedurally generated from a saved seed; the turn-based combat, quest, and faction-war systems all hang off that same overworld map.

Fictional setting only — "Goblin War" and its world data have no connection to any real organization, event, or person.

## Play it

**Live version: [turbulenceking5.github.io/Goblin-War](https://turbulenceking5.github.io/Goblin-War/)** — served as static files straight from this repo via GitHub Pages, no build step. To run it locally instead:

```
python3 -m http.server 8000
```

then open `http://localhost:8000/login.html`. You need a real HTTP origin (not `file://`) — Supabase Auth's email-confirmation redirect and the login gate's `localStorage` checks both depend on a stable origin.

Every player page requires a logged-in account with an active character — there's no way to see the map without both. First run: sign up on `login.html`, confirm your email, then create a character on `characters.html`. See [SETUP.md](SETUP.md) if you're standing up your own Supabase project rather than using an existing one.

## Repo map

This repo documents itself in depth — read these before diving into the code:

- **[CLAUDE.md](CLAUDE.md)** — the full project brief: every file's role, the shared conventions (no-modules, the `CHANGELOG`-in-three-places rule, dark theme tokens, cache-busting, safe-area insets), and pointers into `context/`.
- **[context/](context/)** — one deep-dive file per game system (travel/map, combat, quests, factions, accounts, characters, and more). Start with [context/README.md](context/README.md)'s reading order.
- **[context/roadmap.md](context/roadmap.md)** — every "coming soon" stub already scaffolded in the code, plus brainstormed ideas not yet scoped. Read this before proposing something new so you don't duplicate a planned feature.
- **[SETUP.md](SETUP.md)** — how to stand up your own Supabase project and connect it to this codebase from scratch.
- **[context/testing-and-qa.md](context/testing-and-qa.md)** — there's no automated test suite; this is the manual smoke-test checklist to run before shipping a change.

## Why no build step

The project is deliberately static: every page's `<script>` is copy-pasted, self-contained JS rather than imported from shared modules (see CLAUDE.md's "no modules, no bundler" convention). This keeps deployment to "copy the files somewhere with HTTP hosting" and means any editor/AI assistant can open one file and see the whole picture for that page — at the cost of duplicated logic that has to be kept in sync by hand across pages when it changes. The one exception is the login/character gate (`assets/auth-gate-sync.js` + `assets/auth-client.js`), which is genuinely shared because it's security-relevant control flow.

## Contributing

There's no CI and no automated tests. Before shipping a UI-visible change: test it in an actual browser (golden path + edge cases — see [context/testing-and-qa.md](context/testing-and-qa.md)), add a `CHANGELOG` entry in the three places CLAUDE.md describes, and update the relevant `context/*.md` file in the same change if you touched the system it describes — a stale doc actively misleads the next person more than no doc at all.
