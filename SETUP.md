# Setting up your own Supabase backend

Goblin War has no server of its own — the only backend is a Supabase project (hosted Postgres + Auth), talked to directly from the browser via a public anon key and Row Level Security. This walks through standing up a fresh project from scratch. You only need this once per project; after that, `assets/supabase-config.js` is the only file that points at it.

This doc is the step-by-step "make it work" companion to [context/accounts.md](context/accounts.md) (how the login gate works) and [context/characters.md](context/characters.md) (what gets saved) — read those for *why*, this for *how*.

## 1. Create the project

1. Sign up / log in at [supabase.com](https://supabase.com) and create a new project.
2. Wait for provisioning, then open **Project Settings → API**. You'll need two values from here in step 3: the **Project URL** and the **anon / publishable key** (not the `service_role` key — that one's secret and must never go in client code).

## 2. Run the schema

1. Open **SQL Editor → New query** in the Supabase dashboard.
2. Paste the entire contents of [supabase/schema.sql](supabase/schema.sql) and run it.
3. This creates the `characters` table (one row per character, not per account — an account can own a roster) and the `graves` table (one row per permadeath, see [context/characters.md](context/characters.md)'s "Memorial/legacy"), each with Row Level Security policies scoping every read/write/delete to `auth.uid() = user_id`. Nothing else needs to run — there's no migration tool, this file is applied by hand once.

**Already have a project running from before the `graves` table existed?** Re-open SQL Editor and run just the `graves`-related block of `supabase/schema.sql` (the `create table`/index/RLS-policy statements after the `characters` ones) — every statement in this file is `if not exists`/safe to re-run, so pasting the whole file again works too and won't touch your existing `characters` rows.

If you ever change the save shape (see [context/characters.md](context/characters.md)'s snapshot format), update `supabase/schema.sql` too even though it's `jsonb` and technically doesn't need a migration — it's kept here so the schema stays versioned and reproducible.

## 3. Wire up the client

Edit `assets/supabase-config.js` with the two values from step 1:

```js
const SUPABASE_URL = "https://<your-project-ref>.supabase.co";
const SUPABASE_ANON_KEY = "<your-anon-key>";
```

This file is loaded synchronously, first, in every gated page's `<head>` — see CLAUDE.md's file table. The anon key is meant to be public (rate-limited, and RLS is the actual security boundary), so it's fine to commit.

## 4. Configure Auth redirect settings

This is the step that's easy to skip and hard to debug later — a misconfigured Site URL produces a 404 on a valid, unexpired confirmation link, which looks like a broken token but isn't.

1. Open **Authentication → URL Configuration** in the dashboard.
2. Set **Site URL** to wherever you're actually hosting the game, including any sub-path — e.g. `https://<user>.github.io/Goblin-War/`, not just the bare domain.
3. Add the exact URL of `login.html` (as hosted) to **Redirect URLs**. `login.html` passes `emailRedirectTo: location.origin + location.pathname` when a player signs up — Supabase only honors that if it exactly matches an allow-listed redirect URL; otherwise it silently falls back to the Site URL instead.
4. If you're testing locally, add your local server's URL too (e.g. `http://localhost:8000/login.html`) — you'll need both entries if you deploy to one place but sometimes test locally.

Email/password sign-up is the only auth method this game uses — no need to enable OAuth providers.

## 5. Verify the gate end-to-end

1. Serve the repo over real HTTP (`python3 -m http.server 8000` from the repo root, or any static file server) — not `file://`, which breaks the origin-based checks above.
2. Visit `login.html`, sign up with a real email you can check.
3. Confirm via the emailed link — it should land back on `login.html` showing "You're authenticated!", not a 404.
4. Click through to `characters.html`, create a character, and confirm you land on `index.html` with the map rendering.
5. In the Supabase dashboard's **Table Editor**, confirm a row now exists in `characters` with your account's `user_id`.

If step 3 404s, revisit step 4 — that's almost always a Site URL/Redirect URL mismatch, not a code bug.

## Notes

- There's no staging/production split baked into the code — `assets/supabase-config.js` points at exactly one project at a time. If you want separate dev and prod backends, keep two versions of this file and swap which one is committed/deployed, or branch on `location.hostname` inside it.
- Nothing here provisions storage buckets or edge functions — the game doesn't use either. The whole backend surface is the one `characters` table.
