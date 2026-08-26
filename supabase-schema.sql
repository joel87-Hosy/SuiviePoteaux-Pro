-- SuiviPoteaux Pro - schema Supabase
-- A executer dans Supabase SQL Editor avant d'activer les variables Render.

create extension if not exists "pgcrypto";

create table if not exists public.tenants (
  id text primary key,
  raison_sociale text not null,
  slug text not null unique,
  secteur_activite text,
  pays text,
  ville text,
  logo_url text,
  status text not null default 'trial' check (status in ('active', 'trial', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_users (
  id text primary key,
  tenant_id text references public.tenants(id) on update cascade on delete restrict,
  email text not null unique,
  password_hash text not null,
  name text not null,
  role text not null check (role in ('platform_admin', 'super_admin', 'tenant_admin', 'magasinier', 'depot_manager', 'terrain', 'field_agent', 'controleur', 'quality_inspector')),
  active boolean not null default true,
  approved boolean not null default true,
  depot text,
  team text,
  phone text,
  job_title text,
  profile_photo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id text primary key,
  tenant_id text references public.tenants(id) on update cascade on delete restrict,
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
  tenant_id text references public.tenants(id) on update cascade on delete restrict,
  type text not null,
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
  tenant_id text references public.tenants(id) on update cascade on delete restrict,
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
  team_signature_image text,
  client_signature text,
  validated_by text references public.app_users(id) on update cascade,
  validated_at timestamptz,
  anomaly_reason text,
  anomaly_status text,
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
  tenant_id text references public.tenants(id) on update cascade on delete restrict,
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
  tenant_id text references public.tenants(id) on update cascade on delete restrict,
  actor_id text,
  action text not null,
  payload jsonb not null default '{}',
  date timestamptz not null default now()
);

create table if not exists public.app_settings (
  id text primary key,
  value jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id text primary key,
  tenant_id text not null references public.tenants(id) on update cascade on delete cascade,
  plan_name text not null check (plan_name in ('starter', 'pro', 'enterprise')),
  status text not null default 'trialing',
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly', 'annual')),
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null default now() + interval '30 days',
  cancel_at_period_end boolean not null default false
);

create table if not exists public.tenant_limits (
  id text primary key,
  tenant_id text not null unique references public.tenants(id) on update cascade on delete cascade,
  max_depots int not null default 2,
  max_users int not null default 8,
  max_storage_gb numeric not null default 10
);

create table if not exists public.platform_plans (
  id text primary key check (id in ('starter', 'pro', 'enterprise')),
  price_monthly numeric not null default 0,
  price_annual numeric not null default 0,
  max_depots int not null default 1,
  max_users int not null default 1,
  max_storage_gb numeric not null default 1,
  features jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists public.coupons (
  id text primary key,
  code text not null unique,
  discount_percent numeric not null default 0,
  plan_name text check (plan_name in ('starter', 'pro', 'enterprise')),
  expires_at date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id text primary key,
  tenant_id text references public.tenants(id) on update cascade on delete set null,
  provider text not null,
  amount numeric not null default 0,
  currency text not null default 'XOF',
  status text not null,
  reference text,
  date timestamptz not null default now()
);

create table if not exists public.system_banners (
  id text primary key,
  message text not null,
  severity text not null default 'info' check (severity in ('info', 'warn', 'danger')),
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.platform_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id text references public.app_users(id) on update cascade,
  target_tenant_id text references public.tenants(id) on update cascade on delete set null,
  action text not null,
  ip_address text,
  payload jsonb not null default '{}',
  timestamp timestamptz not null default now()
);

alter table public.poles drop constraint if exists poles_type_check;
alter table public.app_users drop constraint if exists app_users_role_check;
alter table public.app_users add constraint app_users_role_check check (role in ('platform_admin', 'super_admin', 'tenant_admin', 'magasinier', 'depot_manager', 'terrain', 'field_agent', 'controleur', 'quality_inspector'));
alter table public.app_users add column if not exists tenant_id text references public.tenants(id) on update cascade on delete restrict;
alter table public.app_users add column if not exists phone text;
alter table public.app_users add column if not exists job_title text;
alter table public.app_users add column if not exists profile_photo text;
alter table public.poles add column if not exists assigned_team text;
alter table public.projects add column if not exists tenant_id text references public.tenants(id) on update cascade on delete restrict;
alter table public.poles add column if not exists tenant_id text references public.tenants(id) on update cascade on delete restrict;
alter table public.interventions add column if not exists tenant_id text references public.tenants(id) on update cascade on delete restrict;
alter table public.stock_movements add column if not exists tenant_id text references public.tenants(id) on update cascade on delete restrict;
alter table public.audit_log add column if not exists tenant_id text references public.tenants(id) on update cascade on delete restrict;
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
alter table public.interventions add column if not exists anomaly_reason text;
alter table public.interventions add column if not exists anomaly_status text;
alter table public.interventions add column if not exists team_signature_image text;

create index if not exists idx_poles_status on public.poles(status);
create index if not exists idx_app_users_tenant on public.app_users(tenant_id);
create index if not exists idx_projects_tenant on public.projects(tenant_id);
create index if not exists idx_poles_tenant on public.poles(tenant_id);
create index if not exists idx_interventions_tenant on public.interventions(tenant_id);
create index if not exists idx_tenants_status on public.tenants(status);
create index if not exists idx_platform_audit_logs_timestamp on public.platform_audit_logs(timestamp desc);
create index if not exists idx_poles_depot on public.poles(depot);
create index if not exists idx_poles_assigned_team on public.poles(assigned_team);
create index if not exists idx_poles_project on public.poles(project_id);
create index if not exists idx_projects_request_status on public.projects(request_status);
create index if not exists idx_interventions_pole on public.interventions(pole_id);
create index if not exists idx_interventions_agent on public.interventions(agent_id);
create index if not exists idx_intervention_photos_intervention on public.intervention_photos(intervention_id);
create index if not exists idx_audit_log_date on public.audit_log(date desc);

alter table public.app_users enable row level security;
alter table public.tenants enable row level security;
alter table public.subscriptions enable row level security;
alter table public.tenant_limits enable row level security;
alter table public.platform_plans enable row level security;
alter table public.coupons enable row level security;
alter table public.transactions enable row level security;
alter table public.system_banners enable row level security;
alter table public.platform_audit_logs enable row level security;
alter table public.projects enable row level security;
alter table public.poles enable row level security;
alter table public.interventions enable row level security;
alter table public.intervention_photos enable row level security;
alter table public.stock_movements enable row level security;
alter table public.audit_log enable row level security;
alter table public.app_settings enable row level security;

-- L'API Node utilise SUPABASE_SERVICE_ROLE_KEY cote serveur.
-- Le role service_role contourne RLS. Ne jamais exposer cette cle dans le frontend.
revoke all on table public.app_users from anon, authenticated;
revoke all on table public.tenants from anon, authenticated;
revoke all on table public.subscriptions from anon, authenticated;
revoke all on table public.tenant_limits from anon, authenticated;
revoke all on table public.platform_plans from anon, authenticated;
revoke all on table public.coupons from anon, authenticated;
revoke all on table public.transactions from anon, authenticated;
revoke all on table public.system_banners from anon, authenticated;
revoke all on table public.platform_audit_logs from anon, authenticated;
revoke all on table public.projects from anon, authenticated;
revoke all on table public.poles from anon, authenticated;
revoke all on table public.interventions from anon, authenticated;
revoke all on table public.intervention_photos from anon, authenticated;
revoke all on table public.stock_movements from anon, authenticated;
revoke all on table public.audit_log from anon, authenticated;
revoke all on table public.app_settings from anon, authenticated;

insert into public.app_settings (id, value)
values (
  'default',
  '{"operators":["MOOV CI","Orange CI","MTN CI","CIE"],"poleTypes":["BETON","METALLIQUE"],"poleHeights":[7,9,10,11,12],"depots":["Depot Central","Depot Bouake","Depot Yopougon"],"gpsMaxDistanceKm":5}'::jsonb
)
on conflict (id) do nothing;

insert into public.tenants (id, raison_sociale, slug, secteur_activite, pays, ville, status)
values ('tenant-demo', 'ITC Demo', 'itc-demo', 'BTP / Telecom', 'Cote d''Ivoire', 'Abidjan', 'active')
on conflict (id) do nothing;

insert into public.subscriptions (id, tenant_id, plan_name, status, billing_cycle, current_period_start, current_period_end, cancel_at_period_end)
values ('sub-demo', 'tenant-demo', 'pro', 'active', 'monthly', now() - interval '15 days', now() + interval '15 days', false)
on conflict (id) do nothing;

insert into public.tenant_limits (id, tenant_id, max_depots, max_users, max_storage_gb)
values ('limits-demo', 'tenant-demo', 8, 35, 80)
on conflict (id) do nothing;

insert into public.platform_plans (id, price_monthly, price_annual, max_depots, max_users, max_storage_gb, features)
values
  ('starter', 99000, 990000, 2, 8, 10, '{"offline":true,"pdfExport":true,"customPdf":false,"apiAccess":false}'::jsonb),
  ('pro', 249000, 2490000, 8, 35, 80, '{"offline":true,"pdfExport":true,"customPdf":true,"apiAccess":false}'::jsonb),
  ('enterprise', 650000, 6500000, 99, 250, 500, '{"offline":true,"pdfExport":true,"customPdf":true,"apiAccess":true}'::jsonb)
on conflict (id) do nothing;

insert into public.app_users (id, email, password_hash, name, role, active, approved, depot, team)
values
  ('USR-PLATFORM', 'platform@itc.local', 'pbkdf2$120000$7e8b36af6f9ff43f7b95c72c70bd9559$2516bae429b4f1a8413a83014c8d29c95d44fc9bda435e921817a5fab37ee3e9', 'Equipe SaaS', 'platform_admin', true, true, 'Plateforme', null),
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

update public.app_users set tenant_id = 'tenant-demo' where tenant_id is null and role <> 'platform_admin';
update public.projects set tenant_id = 'tenant-demo' where tenant_id is null;
update public.poles set tenant_id = 'tenant-demo' where tenant_id is null;
update public.interventions set tenant_id = 'tenant-demo' where tenant_id is null;
update public.stock_movements set tenant_id = 'tenant-demo' where tenant_id is null;
update public.audit_log set tenant_id = 'tenant-demo' where tenant_id is null;
