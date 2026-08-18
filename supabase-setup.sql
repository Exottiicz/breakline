-- Run this once in Supabase: Dashboard > SQL Editor > New query.
create table if not exists public.builds (
  id bigint generated always as identity primary key,
  title text not null check (char_length(title) between 1 and 48),
  type text not null,
  weapon text not null,
  price integer not null check (price >= 0),
  notes text,
  author text not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  likes integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.builds enable row level security;
create policy "Anyone can view builds" on public.builds for select using (true);
create policy "Members can submit their builds" on public.builds for insert to authenticated with check (auth.uid() = user_id);
create policy "Members can edit their own builds" on public.builds for update to authenticated using (auth.uid() = user_id);

