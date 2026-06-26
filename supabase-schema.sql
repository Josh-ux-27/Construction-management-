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

create table if not exists public.manager_project_access (
  manager_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (manager_id, project_id)
);

create or replace function public.manager_search_projects(company_term text, project_term text)
returns table (
  id uuid,
  owner_id uuid,
  company_name text,
  title text,
  description text,
  location text,
  budget numeric,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select p.id, p.owner_id, p.company_name, p.title, p.description, p.location, p.budget, p.created_at
  from public.projects p
  join public.profiles me on me.id = auth.uid()
  where me.role = 'manager'
    and lower(coalesce(p.company_name, '')) like '%' || lower(coalesce(company_term, '')) || '%'
    and lower(coalesce(p.title, '')) like '%' || lower(coalesce(project_term, '')) || '%'
  order by p.created_at desc
  limit 50;
$$;

revoke all on function public.manager_search_projects(text, text) from public;
grant execute on function public.manager_search_projects(text, text) to authenticated;

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.crews enable row level security;
alter table public.tasks enable row level security;
alter table public.shift_notes enable row level security;
alter table public.assets enable row level security;
alter table public.manager_project_access enable row level security;

-- Owner and manager-scoped policies.

drop policy if exists "profiles_all_auth" on public.profiles;
drop policy if exists "profiles_self_select" on public.profiles;
drop policy if exists "profiles_self_update" on public.profiles;
drop policy if exists "profiles_self_insert" on public.profiles;

create policy "profiles_self_select" on public.profiles
for select to authenticated
using (id = auth.uid());

create policy "profiles_self_update" on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "profiles_self_insert" on public.profiles
for insert to authenticated
with check (id = auth.uid());

drop policy if exists "projects_all_auth" on public.projects;
drop policy if exists "projects_owner_read_write" on public.projects;
drop policy if exists "projects_manager_read_assigned" on public.projects;

create policy "projects_owner_read_write" on public.projects
for all to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "projects_manager_read_assigned" on public.projects
for select to authenticated
using (
  exists (
    select 1
    from public.profiles me
    where me.id = auth.uid()
      and me.role = 'manager'
  )
  and
  exists (
    select 1
    from public.manager_project_access mpa
    where mpa.project_id = projects.id
      and mpa.manager_id = auth.uid()
  )
);

drop policy if exists "crews_all_auth" on public.crews;
drop policy if exists "crews_owner_read_write" on public.crews;
drop policy if exists "crews_manager_read_assigned" on public.crews;

create policy "crews_owner_read_write" on public.crews
for all to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "crews_manager_read_assigned" on public.crews
for select to authenticated
using (
  exists (
    select 1
    from public.profiles me
    where me.id = auth.uid()
      and me.role = 'manager'
  )
  and
  exists (
    select 1
    from public.manager_project_access mpa
    join public.projects p on p.id = mpa.project_id
    where p.owner_id = crews.owner_id
      and mpa.manager_id = auth.uid()
  )
);

drop policy if exists "tasks_all_auth" on public.tasks;
drop policy if exists "tasks_owner_read_write" on public.tasks;
drop policy if exists "tasks_manager_read_assigned" on public.tasks;

create policy "tasks_owner_read_write" on public.tasks
for all to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "tasks_manager_read_assigned" on public.tasks
for select to authenticated
using (
  exists (
    select 1
    from public.profiles me
    where me.id = auth.uid()
      and me.role = 'manager'
  )
  and
  exists (
    select 1
    from public.manager_project_access mpa
    where mpa.project_id = tasks.project_id
      and mpa.manager_id = auth.uid()
  )
);

drop policy if exists "shift_notes_all_auth" on public.shift_notes;
drop policy if exists "shift_notes_owner_read_write" on public.shift_notes;
drop policy if exists "shift_notes_manager_read_assigned" on public.shift_notes;

create policy "shift_notes_owner_read_write" on public.shift_notes
for all to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "shift_notes_manager_read_assigned" on public.shift_notes
for select to authenticated
using (
  exists (
    select 1
    from public.profiles me
    where me.id = auth.uid()
      and me.role = 'manager'
  )
  and
  exists (
    select 1
    from public.manager_project_access mpa
    join public.projects p on p.id = mpa.project_id
    where p.owner_id = shift_notes.owner_id
      and mpa.manager_id = auth.uid()
  )
);

drop policy if exists "assets_all_auth" on public.assets;
drop policy if exists "assets_owner_read_write" on public.assets;
drop policy if exists "assets_manager_read_assigned" on public.assets;

create policy "assets_owner_read_write" on public.assets
for all to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "assets_manager_read_assigned" on public.assets
for select to authenticated
using (
  exists (
    select 1
    from public.profiles me
    where me.id = auth.uid()
      and me.role = 'manager'
  )
  and
  exists (
    select 1
    from public.manager_project_access mpa
    join public.projects p on p.id = mpa.project_id
    where p.owner_id = assets.owner_id
      and mpa.manager_id = auth.uid()
  )
);

drop policy if exists "manager_project_access_manager_rw" on public.manager_project_access;

create policy "manager_project_access_manager_rw" on public.manager_project_access
for all to authenticated
using (
  manager_id = auth.uid()
  and exists (
    select 1
    from public.profiles me
    where me.id = auth.uid()
      and me.role = 'manager'
  )
)
with check (
  manager_id = auth.uid()
  and exists (
    select 1
    from public.profiles me
    where me.id = auth.uid()
      and me.role = 'manager'
  )
);

drop policy if exists "manager_project_access_project_owner_read" on public.manager_project_access;

create policy "manager_project_access_project_owner_read" on public.manager_project_access
for select to authenticated
using (
  exists (
    select 1
    from public.projects p
    where p.id = manager_project_access.project_id
      and p.owner_id = auth.uid()
  )
);
