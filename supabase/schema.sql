-- Khata household storage on Supabase.
-- Run this once in the project's SQL editor (Dashboard -> SQL Editor -> paste -> Run).
-- Each household holds the whole ledger as JSON and is joined with a short code.

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text,
  data jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) default auth.uid(),
  updated_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) default auth.uid(),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

alter table public.households enable row level security;
alter table public.household_members enable row level security;

-- A member can see and remove only their own membership rows.
drop policy if exists "read own membership" on public.household_members;
create policy "read own membership" on public.household_members
  for select using (user_id = auth.uid());
drop policy if exists "leave own membership" on public.household_members;
create policy "leave own membership" on public.household_members
  for delete using (user_id = auth.uid());

-- A household is readable and updatable by its members; deletable only by its creator.
drop policy if exists "members read household" on public.households;
create policy "members read household" on public.households
  for select using (exists (
    select 1 from public.household_members m
    where m.household_id = households.id and m.user_id = auth.uid()));
drop policy if exists "members update household" on public.households;
create policy "members update household" on public.households
  for update using (exists (
    select 1 from public.household_members m
    where m.household_id = households.id and m.user_id = auth.uid()));
drop policy if exists "creator delete household" on public.households;
create policy "creator delete household" on public.households
  for delete using (created_by = auth.uid());

-- Create a household + the creator's membership atomically, returning a short join code.
create or replace function public.create_household(p_name text)
returns table (id uuid, code text)
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_code text;
begin
  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from households h where h.code = v_code);
  end loop;
  insert into households (code, name, created_by) values (v_code, p_name, auth.uid())
    returning households.id into v_id;
  insert into household_members (household_id, user_id) values (v_id, auth.uid());
  return query select v_id, v_code;
end $$;

-- Join an existing household by its code, returning the household id.
create or replace function public.join_household(p_code text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select h.id into v_id from households h where h.code = upper(trim(p_code));
  if v_id is null then raise exception 'no such household'; end if;
  insert into household_members (household_id, user_id) values (v_id, auth.uid())
    on conflict do nothing;
  return v_id;
end $$;

grant execute on function public.create_household(text) to authenticated;
grant execute on function public.join_household(text) to authenticated;
