-- Goblin War cloud saves.
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- (Kept here so the schema is reproducible/versioned; the anon key alone can't run DDL.)

create table if not exists public.saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  saved_at timestamptz not null default now()
);

alter table public.saves enable row level security;

create policy "Users can read their own save"
  on public.saves for select
  using (auth.uid() = user_id);

create policy "Users can insert their own save"
  on public.saves for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own save"
  on public.saves for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own save"
  on public.saves for delete
  using (auth.uid() = user_id);
