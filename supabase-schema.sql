-- SuiviPoteaux Pro - schema Supabase
-- A executer dans Supabase SQL Editor avant d'activer les variables Render.

create extension if not exists "pgcrypto";

create table if not exists public.app_users (
  id text primary key,
  email text not null unique,
  password_hash text not null,
  name text not null,
  role text not null check (role in ('super_admin', 'magasinier', 'terrain', 'controleur')),
  active boolean not null default true,
  approved boolean not null default true,
  depot text,
  team text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id text primary key,
  name text not null,
  client text,
  zone text,
  start_date date,
  end_date date,
  pole_count int not null default 0,
  assigned_team text,
  status text not null default 'Planifie',
  request_status text not null default 'Brouillon',
  requirements jsonb not null default '[]',
  assigned_pole_ids jsonb not null default '[]',
  created_by text,
  validated_by text,
  validated_at timestamptz,
  taken_by text,
  taken_at timestamptz,
  closure_requested_by text,
  closure_requested_at timestamptz,
  closed_by text,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.poles (
  id text primary key,
  type text not null check (type in ('BETON', 'METALLIQUE')),
  height numeric not null,
  effort text,
  weight numeric,
  maker text,
  status text not null,
  depot text,
  assigned_team text,
  project_id text,
  lat numeric,
  lng numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.interventions (
  id text primary key,
  pole_id text not null references public.poles(id) on update cascade,
  project_id text not null references public.projects(id) on update cascade,
  agent text,
  agent_id text references public.app_users(id) on update cascade,
  date timestamptz not null default now(),
  lat numeric not null,
  lng numeric not null,
  gps_accuracy numeric,
  soil text,
  depth numeric,
  validation text not null default 'Pose - En attente validation',
  notes text,
  team_signature text,
  client_signature text,
  validated_by text references public.app_users(id) on update cascade,
  validated_at timestamptz,
  draft boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.intervention_photos (
  id text primary key,
  intervention_id text not null references public.interventions(id) on delete cascade,
  position int not null,
  step text not null,
  date timestamptz,
  lat text,
  lng text,
  url text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  pole_id text references public.poles(id) on update cascade,
  movement_type text not null,
  from_depot text,
  to_depot text,
  actor_id text references public.app_users(id) on update cascade,
  payload jsonb not null default '{}',
  date timestamptz not null default now()
);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id text,
  action text not null,
  payload jsonb not null default '{}',
  date timestamptz not null default now()
);

alter table public.poles add column if not exists assigned_team text;
alter table public.poles add column if not exists project_id text;
alter table public.projects add column if not exists start_date date;
alter table public.projects add column if not exists end_date date;
alter table public.projects add column if not exists pole_count int not null default 0;
alter table public.projects add column if not exists assigned_team text;
alter table public.projects add column if not exists status text not null default 'Planifie';
alter table public.projects add column if not exists request_status text not null default 'Brouillon';
alter table public.projects add column if not exists requirements jsonb not null default '[]';
alter table public.projects add column if not exists assigned_pole_ids jsonb not null default '[]';
alter table public.projects add column if not exists created_by text;
alter table public.projects add column if not exists validated_by text;
alter table public.projects add column if not exists validated_at timestamptz;
alter table public.projects add column if not exists taken_by text;
alter table public.projects add column if not exists taken_at timestamptz;
alter table public.projects add column if not exists closure_requested_by text;
alter table public.projects add column if not exists closure_requested_at timestamptz;
alter table public.projects add column if not exists closed_by text;
alter table public.projects add column if not exists closed_at timestamptz;

create index if not exists idx_poles_status on public.poles(status);
create index if not exists idx_poles_depot on public.poles(depot);
create index if not exists idx_poles_assigned_team on public.poles(assigned_team);
create index if not exists idx_poles_project on public.poles(project_id);
create index if not exists idx_projects_request_status on public.projects(request_status);
create index if not exists idx_interventions_pole on public.interventions(pole_id);
create index if not exists idx_interventions_agent on public.interventions(agent_id);
create index if not exists idx_intervention_photos_intervention on public.intervention_photos(intervention_id);
create index if not exists idx_audit_log_date on public.audit_log(date desc);

alter table public.app_users enable row level security;
alter table public.projects enable row level security;
alter table public.poles enable row level security;
alter table public.interventions enable row level security;
alter table public.intervention_photos enable row level security;
alter table public.stock_movements enable row level security;
alter table public.audit_log enable row level security;

-- L'API Node utilise SUPABASE_SERVICE_ROLE_KEY cote serveur.
-- Le role service_role contourne RLS. Ne jamais exposer cette cle dans le frontend.
revoke all on table public.app_users from anon, authenticated;
revoke all on table public.projects from anon, authenticated;
revoke all on table public.poles from anon, authenticated;
revoke all on table public.interventions from anon, authenticated;
revoke all on table public.intervention_photos from anon, authenticated;
revoke all on table public.stock_movements from anon, authenticated;
revoke all on table public.audit_log from anon, authenticated;

insert into public.app_users (id, email, password_hash, name, role, active, approved, depot, team)
values
  ('USR-001', 'admin@itc.local', 'pbkdf2$120000$7e8b36af6f9ff43f7b95c72c70bd9559$2516bae429b4f1a8413a83014c8d29c95d44fc9bda435e921817a5fab37ee3e9', 'Aminata Kone', 'super_admin', true, true, 'Direction', null),
  ('USR-002', 'depot@itc.local', 'pbkdf2$120000$7e8b36af6f9ff43f7b95c72c70bd9559$2516bae429b4f1a8413a83014c8d29c95d44fc9bda435e921817a5fab37ee3e9', 'Magasin Central', 'magasinier', true, true, 'Depot Central', null),
  ('USR-003', 'terrain@itc.local', 'pbkdf2$120000$7e8b36af6f9ff43f7b95c72c70bd9559$2516bae429b4f1a8413a83014c8d29c95d44fc9bda435e921817a5fab37ee3e9', 'Equipe Terrain A', 'terrain', true, true, 'Terrain', 'Equipe Terrain A'),
  ('USR-004', 'controle@itc.local', 'pbkdf2$120000$7e8b36af6f9ff43f7b95c72c70bd9559$2516bae429b4f1a8413a83014c8d29c95d44fc9bda435e921817a5fab37ee3e9', 'Controle Qualite', 'controleur', true, true, 'Controle', null)
on conflict (id) do nothing;

insert into public.projects (id, name, client, zone, start_date, end_date, pole_count, assigned_team, status, request_status, requirements, assigned_pole_ids)
values
  ('CH-MOOV-A1', 'MOOV - Axe Yopougon PK12', 'MOOV', 'Abidjan Nord', '2026-08-20', '2026-09-05', 2, 'Equipe Terrain A', 'Pris en main', 'Validee', '[{"type":"METALLIQUE","height":9,"quantity":2}]', '["POT-2026-M4-018","POT-2026-M4-019"]'),
  ('CH-CIE-B4', 'CIE - Extension reseau B4', 'CIE', 'Bouake Est', '2026-08-22', '2026-08-30', 1, 'Equipe Terrain A', 'En implantation', 'Validee', '[{"type":"BETON","height":12,"quantity":1}]', '["POT-2026-B10-021"]'),
  ('CH-ORG-T2', 'Orange - Fibre rurale T2', 'Orange', 'Daloa Sud', null, null, 0, null, 'Planifie', 'Brouillon', '[]', '[]')
on conflict (id) do nothing;

insert into public.poles (id, type, height, effort, weight, maker, status, depot, assigned_team, project_id, lat, lng)
values
  ('POT-2026-B9-001', 'BETON', 12, '400 daN', 860, 'SIPREL / Lot B9', 'En Stock', 'Depot Central', null, null, null, null),
  ('POT-2026-B9-002', 'BETON', 11, '300 daN', 790, 'SIPREL / Lot B9', 'En Transit', 'Terrain - Equipe Terrain A', 'Equipe Terrain A', null, null, null),
  ('POT-2026-M4-018', 'METALLIQUE', 9, '250 daN', 235, 'METALCI / Lot M4', 'Pose - En attente validation', 'Chantier MOOV', 'Equipe Terrain A', 'CH-MOOV-A1', 5.39231, -4.03221),
  ('POT-2026-M4-019', 'METALLIQUE', 9, '250 daN', 236, 'METALCI / Lot M4', 'Valide', 'Chantier MOOV', 'Equipe Terrain A', 'CH-MOOV-A1', 5.38875, -4.02684),
  ('POT-2026-B10-021', 'BETON', 12, '500 daN', 920, 'SIPREL / Lot B10', 'Anomalie', 'Chantier CIE', 'Equipe Terrain A', 'CH-CIE-B4', 7.69592, -5.03012),
  ('POT-2026-M5-030', 'METALLIQUE', 10, '300 daN', 280, 'METALCI / Lot M5', 'En Stock', 'Depot Bouake', null, null, null, null)
on conflict (id) do nothing;

insert into public.interventions (id, pole_id, project_id, agent, agent_id, date, lat, lng, soil, depth, validation, notes, team_signature, client_signature)
values
  ('RPT-2026-0001', 'POT-2026-M4-019', 'CH-MOOV-A1', 'Equipe Terrain A', 'USR-003', now() - interval '1 day', 5.38875, -4.02684, 'Terre', 1.25, 'Valide', 'Pose conforme, aplomb controle et massif cure.', 'A. Konan', 'Controle Qualite')
on conflict (id) do nothing;
