-- FinisPay × FinisFlow isolated authentication and personal-data schema.
create extension if not exists pgcrypto;
create schema if not exists private;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  email text not null unique,
  phone text null check (phone is null or char_length(phone) <= 32),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_dashboard_data (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  data_type text not null check (char_length(trim(data_type)) between 1 and 80),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index user_dashboard_data_owner_created_idx
  on public.user_dashboard_data (user_id, created_at desc);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')),
    lower(new.email)
  );
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;
revoke all on function private.set_updated_at() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

create trigger dashboard_data_set_updated_at
  before update on public.user_dashboard_data
  for each row execute function private.set_updated_at();

alter table public.profiles enable row level security;
alter table public.user_dashboard_data enable row level security;

create policy "profiles_select_own"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "dashboard_insert_own"
  on public.user_dashboard_data for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "dashboard_select_own"
  on public.user_dashboard_data for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "dashboard_update_own"
  on public.user_dashboard_data for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "dashboard_delete_own"
  on public.user_dashboard_data for delete to authenticated
  using ((select auth.uid()) = user_id);

-- New Supabase projects no longer automatically expose tables to the Data API.
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.user_dashboard_data from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (full_name, phone) on table public.profiles to authenticated;
grant select, insert, update, delete on table public.user_dashboard_data to authenticated;

comment on table public.profiles is 'One private profile per authenticated FinisPay user. Passwords never belong here.';
comment on table public.user_dashboard_data is 'User-owned FinisPay and FinisFlow dashboard records protected by RLS.';
