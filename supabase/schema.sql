-- Goblin War character storage.
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- (Kept here so the schema is reproducible/versioned; the anon key alone can't run DDL.)

-- Superseded by the `characters` table below: an account now owns a roster of characters
-- (picked from at login) instead of a single save. Safe to drop even with an existing test
-- row in it — nothing reads from `saves` anymore. Skip this line if you'd rather keep the
-- old table around unused.
drop table if exists public.saves;

create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists characters_user_id_idx on public.characters (user_id);

alter table public.characters enable row level security;

create policy "Users can read their own characters"
  on public.characters for select
  using (auth.uid() = user_id);

create policy "Users can insert their own characters"
  on public.characters for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own characters"
  on public.characters for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own characters"
  on public.characters for delete
  using (auth.uid() = user_id);

-- Memorial/legacy — one row per permadeath (old age or combat), written when a run ends and
-- later discoverable by a *different* character on the same account at the settlement they fell
-- in, for a one-time gold bonus. Deliberately its own table rather than a field on `characters`:
-- a grave has to outlive the very character row whose death created it. Same RLS shape as
-- `characters` above — a grave is only ever visible to the account that created it, never
-- another player's. See index.html's recordGrave/visitGrave/loadAccountGraves and
-- context/roadmap.md's "Memorial/legacy mechanic on permadeath".
create table if not exists public.graves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  character_name text not null,
  burg_id text not null,
  burg_name text not null,
  kingdom text not null default '',
  level integer not null default 1,
  died_day integer not null default 0,
  cause text not null default 'fell',
  claimed boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists graves_user_id_idx on public.graves (user_id);

alter table public.graves enable row level security;

create policy "Users can read their own graves"
  on public.graves for select
  using (auth.uid() = user_id);

create policy "Users can insert their own graves"
  on public.graves for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own graves"
  on public.graves for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
