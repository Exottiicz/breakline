-- BREAKLINE COMMUNITY FOUNDATION
-- Run after supabase-setup.sql in Supabase SQL Editor.
-- Real data only: no seeded member counts, likes, or fake activity.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  operator_name text not null check (char_length(operator_name) between 2 and 24),
  bio text default '',
  favorite_game text default 'Arena Breakout: Infinite',
  reputation integer not null default 0 check (reputation >= 0),
  is_founder boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
create policy "Profiles are public" on public.profiles for select using (true);
create policy "Users can create their profile" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "Users can edit their profile" on public.profiles for update to authenticated using (auth.uid() = id);

create table if not exists public.lfg_posts (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  operator_name text not null,
  game text not null,
  title text not null check (char_length(title) between 3 and 80),
  region text not null default 'NA',
  party_current integer not null default 1 check (party_current >= 1),
  party_max integer not null default 3 check (party_max >= 2),
  status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now()
);

alter table public.lfg_posts enable row level security;
create policy "Anyone can view open LFG posts" on public.lfg_posts for select using (true);
create policy "Members can create LFG posts" on public.lfg_posts for insert to authenticated with check (auth.uid() = user_id);
create policy "Members can edit their LFG posts" on public.lfg_posts for update to authenticated using (auth.uid() = user_id);
create policy "Members can delete their LFG posts" on public.lfg_posts for delete to authenticated using (auth.uid() = user_id);

create table if not exists public.build_likes (
  build_id bigint references public.builds(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz not null default now(),
  primary key (build_id, user_id)
);

alter table public.build_likes enable row level security;
create policy "Anyone can see build likes" on public.build_likes for select using (true);
create policy "Members can like builds" on public.build_likes for insert to authenticated with check (auth.uid() = user_id);
create policy "Members can remove their build likes" on public.build_likes for delete to authenticated using (auth.uid() = user_id);

-- Automatically create a profile when a new account is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, operator_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'operator_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Keep the build like counter honest.
create or replace function public.sync_build_like_count()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.builds set likes = likes + 1 where id = new.build_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.builds set likes = greatest(0, likes - 1) where id = old.build_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists build_like_count_insert on public.build_likes;
drop trigger if exists build_like_count_delete on public.build_likes;
create trigger build_like_count_insert after insert on public.build_likes for each row execute procedure public.sync_build_like_count();
create trigger build_like_count_delete after delete on public.build_likes for each row execute procedure public.sync_build_like_count();

-- Founding 100 is intentionally a real flag, not a fake counter.
-- When you personally verify a member is part of the first 100, set is_founder = true.
