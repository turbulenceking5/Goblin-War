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
