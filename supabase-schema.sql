-- Run this in Supabase SQL editor.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('contractor', 'crew', 'manager')),
  company text not null,
  email text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  company_name text not null,
  title text not null,
  description text,
  location text,
  budget numeric,
  created_at timestamptz not null default now()
);

create table if not exists public.crews (
  id uuid primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  crew_id uuid references public.crews(id) on delete cascade,
  title text not null,
  location text not null,
  project_title text,
  crew_type text,
  note text,
  due text,
  status text not null default 'pending' check (status in ('pending', 'in-progress', 'done')),
  created_at timestamptz not null default now()
);

create table if not exists public.shift_notes (
  id uuid primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  target text not null default 'all',
  text text not null,
  timestamp timestamptz not null default now()
);

create table if not exists public.assets (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  blueprint_url text,
  blueprint_is_pdf boolean not null default false,
  model_url text,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.crews enable row level security;
alter table public.tasks enable row level security;
alter table public.shift_notes enable row level security;
alter table public.assets enable row level security;

-- Broad authenticated policies for first rollout.
-- Tighten these later with role/company-specific constraints.

drop policy if exists "profiles_all_auth" on public.profiles;
create policy "profiles_all_auth" on public.profiles
for all to authenticated using (true) with check (true);

drop policy if exists "projects_all_auth" on public.projects;
create policy "projects_all_auth" on public.projects
for all to authenticated using (true) with check (true);

drop policy if exists "crews_all_auth" on public.crews;
create policy "crews_all_auth" on public.crews
for all to authenticated using (true) with check (true);

drop policy if exists "tasks_all_auth" on public.tasks;
create policy "tasks_all_auth" on public.tasks
for all to authenticated using (true) with check (true);

drop policy if exists "shift_notes_all_auth" on public.shift_notes;
create policy "shift_notes_all_auth" on public.shift_notes
for all to authenticated using (true) with check (true);

drop policy if exists "assets_all_auth" on public.assets;
create policy "assets_all_auth" on public.assets
for all to authenticated using (true) with check (true);
