-- BREAKLINE OPERATOR IDENTITY + REPUTATION FOUNDATION
-- Run this in Supabase SQL Editor after the existing profile setup.

create table if not exists public.operator_name_history (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  operator_name text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create index if not exists operator_name_history_user_id_idx
on public.operator_name_history(user_id);

alter table public.operator_name_history enable row level security;

create policy "Name history is public"
on public.operator_name_history
for select
using (true);

-- Reputation is recorded as individual, auditable events.
create table if not exists public.reputation_events (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  event_type text not null,
  points integer not null,
  source_type text,
  source_id text,
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists reputation_events_user_id_idx
on public.reputation_events(user_id);

create index if not exists reputation_events_created_at_idx
on public.reputation_events(created_at desc);

alter table public.reputation_events enable row level security;

create policy "Reputation events are public"
on public.reputation_events
for select
using (true);

-- Badges are definitions. Awards are attached to individual operators.
create table if not exists public.badges (
  id bigint generated always as identity primary key,
  slug text unique not null,
  name text not null,
  description text not null,
  icon text not null default '★'
);

create table if not exists public.operator_badges (
  user_id uuid references public.profiles(id) on delete cascade not null,
  badge_id bigint references public.badges(id) on delete cascade not null,
  awarded_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

alter table public.badges enable row level security;
alter table public.operator_badges enable row level security;

create policy "Badges are public"
on public.badges
for select
using (true);

create policy "Operator badges are public"
on public.operator_badges
for select
using (true);

-- Keep the profile's displayed reputation synchronized with its auditable events.
create or replace function public.sync_profile_reputation(target_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set reputation = greatest(0, coalesce((
    select sum(points)
    from public.reputation_events
    where user_id = target_user
  ), 0))::integer
  where id = target_user;
end;
$$;

create or replace function public.sync_reputation_after_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_profile_reputation(coalesce(new.user_id, old.user_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists reputation_event_sync on public.reputation_events;
create trigger reputation_event_sync
after insert or update or delete on public.reputation_events
for each row execute procedure public.sync_reputation_after_event();

-- Create a name-history entry when a new profile is created.
create or replace function public.record_initial_operator_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.operator_name_history (user_id, operator_name)
  values (new.id, new.operator_name);
  return new;
end;
$$;

drop trigger if exists profile_initial_name_history on public.profiles;
create trigger profile_initial_name_history
after insert on public.profiles
for each row execute procedure public.record_initial_operator_name();

-- Track future profile-name changes without losing the old identity.
create or replace function public.record_operator_name_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.operator_name is distinct from old.operator_name then
    update public.operator_name_history
    set ended_at = now()
    where user_id = new.id and ended_at is null;

    insert into public.operator_name_history (user_id, operator_name)
    values (new.id, new.operator_name);
  end if;
  return new;
end;
$$;

drop trigger if exists profile_name_history on public.profiles;
create trigger profile_name_history
after update of operator_name on public.profiles
for each row execute procedure public.record_operator_name_change();

-- Seed only badge definitions, not fake awards or reputation.
insert into public.badges (slug, name, description, icon) values
('founding-operator', 'Founding Operator', 'Joined Breakline during its founding period.', '★'),
('trusted-builder', 'Trusted Builder', 'Consistently contributes highly regarded builds.', '◆'),
('squad-leader', 'Squad Leader', 'Builds a strong record of organizing squads.', '▲'),
('intel-contributor', 'Intel Contributor', 'Consistently contributes useful community information.', '◈'),
('community-veteran', 'Community Veteran', 'Long-term member with an established contribution history.', '✦')
on conflict (slug) do nothing;
