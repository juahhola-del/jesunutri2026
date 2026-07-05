-- JESUnutri - Demanda diaria clinica persistente.
-- Ejecutar despues de 14_abastecimiento_clinico.sql.

create table if not exists clinical_daily_demands (
  id uuid primary key default gen_random_uuid(),
  demand_date date not null,
  filename text null,
  uploaded_by uuid not null default auth.uid() references auth.users(id),
  status text not null default 'cargada' check (status in ('cargada', 'revisada', 'con errores')),
  observations text null,
  total_patients numeric not null default 0 check (total_patients >= 0),
  diet_special_total numeric not null default 0 check (diet_special_total >= 0),
  enteral_total integer not null default 0 check (enteral_total >= 0),
  supply_total integer not null default 0 check (supply_total >= 0),
  warning_count integer not null default 0 check (warning_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists clinical_daily_diet_counts (
  id uuid primary key default gen_random_uuid(),
  daily_demand_id uuid not null references clinical_daily_demands(id) on delete cascade,
  demand_date date not null,
  diet_type text not null,
  quantity numeric not null default 0 check (quantity >= 0),
  source_sheet text null,
  observation text null,
  created_at timestamptz not null default now()
);

create table if not exists clinical_daily_enteral_items (
  id uuid primary key default gen_random_uuid(),
  daily_demand_id uuid not null references clinical_daily_demands(id) on delete cascade,
  demand_date date not null,
  patient_ref text null,
  product_formula text not null,
  volume numeric not null default 0 check (volume >= 0),
  unit text null,
  schedule text null,
  route text null,
  observation text null,
  created_at timestamptz not null default now()
);

create table if not exists clinical_daily_supply_items (
  id uuid primary key default gen_random_uuid(),
  daily_demand_id uuid not null references clinical_daily_demands(id) on delete cascade,
  demand_date date not null,
  product_supply text not null,
  quantity numeric not null default 0 check (quantity >= 0),
  unit text null,
  service text null,
  observation text null,
  created_at timestamptz not null default now()
);

create table if not exists clinical_daily_import_errors (
  id uuid primary key default gen_random_uuid(),
  daily_demand_id uuid not null references clinical_daily_demands(id) on delete cascade,
  file_name text null,
  sheet_name text null,
  row_number integer null,
  cell_ref text null,
  warning_type text null,
  severity text not null default 'media' check (severity in ('baja', 'media', 'alta', 'info', 'warning', 'error')),
  message text not null,
  suggested_action text null,
  status text not null default 'pendiente' check (status in ('pendiente', 'revisada', 'ignorada')),
  reviewed_at timestamptz null,
  reviewed_by uuid null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table clinical_daily_import_errors add column if not exists file_name text null;
alter table clinical_daily_import_errors add column if not exists cell_ref text null;
alter table clinical_daily_import_errors add column if not exists warning_type text null;
alter table clinical_daily_import_errors add column if not exists suggested_action text null;
alter table clinical_daily_import_errors add column if not exists status text not null default 'pendiente';
alter table clinical_daily_import_errors add column if not exists reviewed_at timestamptz null;
alter table clinical_daily_import_errors add column if not exists reviewed_by uuid null references auth.users(id);
alter table clinical_daily_import_errors drop constraint if exists clinical_daily_import_errors_severity_check;
alter table clinical_daily_import_errors add constraint clinical_daily_import_errors_severity_check check (severity in ('baja', 'media', 'alta', 'info', 'warning', 'error'));
alter table clinical_daily_import_errors drop constraint if exists clinical_daily_import_errors_status_check;
alter table clinical_daily_import_errors add constraint clinical_daily_import_errors_status_check check (status in ('pendiente', 'revisada', 'ignorada'));

create table if not exists clinical_demand_product_links (
  id uuid primary key default gen_random_uuid(),
  detected_name text not null,
  detected_type text not null,
  producto_id uuid null references productos_insumos(id) on delete set null,
  match_status text not null default 'vinculado' check (match_status in ('vinculado', 'sugerido', 'sin coincidencia', 'conflicto', 'ignorado')),
  match_confidence numeric not null default 0 check (match_confidence >= 0 and match_confidence <= 100),
  match_method text null,
  ignored boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_clinical_demand_product_links_name_type_user
on clinical_demand_product_links(detected_name, detected_type, created_by);

create index if not exists idx_clinical_daily_demands_date on clinical_daily_demands(demand_date);
create index if not exists idx_clinical_daily_demands_uploaded_by on clinical_daily_demands(uploaded_by);
create index if not exists idx_clinical_daily_diet_counts_demand on clinical_daily_diet_counts(daily_demand_id);
create index if not exists idx_clinical_daily_diet_counts_date_type on clinical_daily_diet_counts(demand_date, diet_type);
create index if not exists idx_clinical_daily_enteral_items_demand on clinical_daily_enteral_items(daily_demand_id);
create index if not exists idx_clinical_daily_supply_items_demand on clinical_daily_supply_items(daily_demand_id);
create index if not exists idx_clinical_daily_import_errors_demand on clinical_daily_import_errors(daily_demand_id);
create index if not exists idx_clinical_daily_import_errors_status on clinical_daily_import_errors(status);
create index if not exists idx_clinical_demand_product_links_user on clinical_demand_product_links(created_by);
create index if not exists idx_clinical_demand_product_links_producto on clinical_demand_product_links(producto_id);

alter table clinical_daily_demands enable row level security;
alter table clinical_daily_diet_counts enable row level security;
alter table clinical_daily_enteral_items enable row level security;
alter table clinical_daily_supply_items enable row level security;
alter table clinical_daily_import_errors enable row level security;
alter table clinical_demand_product_links enable row level security;

drop policy if exists "clinical daily demands own all" on clinical_daily_demands;
drop policy if exists "clinical daily demands admin all" on clinical_daily_demands;
create policy "clinical daily demands own all"
on clinical_daily_demands
for all
to authenticated
using (uploaded_by = auth.uid())
with check (uploaded_by = auth.uid());
create policy "clinical daily demands admin all"
on clinical_daily_demands
for all
to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

drop policy if exists "clinical demand product links own all" on clinical_demand_product_links;
drop policy if exists "clinical demand product links admin all" on clinical_demand_product_links;
create policy "clinical demand product links own all"
on clinical_demand_product_links
for all
to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());
create policy "clinical demand product links admin all"
on clinical_demand_product_links
for all
to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

drop policy if exists "clinical daily diet counts own all" on clinical_daily_diet_counts;
drop policy if exists "clinical daily diet counts admin all" on clinical_daily_diet_counts;
create policy "clinical daily diet counts own all"
on clinical_daily_diet_counts
for all
to authenticated
using (exists (select 1 from clinical_daily_demands d where d.id = daily_demand_id and d.uploaded_by = auth.uid()))
with check (exists (select 1 from clinical_daily_demands d where d.id = daily_demand_id and d.uploaded_by = auth.uid()));
create policy "clinical daily diet counts admin all"
on clinical_daily_diet_counts
for all
to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

drop policy if exists "clinical daily enteral items own all" on clinical_daily_enteral_items;
drop policy if exists "clinical daily enteral items admin all" on clinical_daily_enteral_items;
create policy "clinical daily enteral items own all"
on clinical_daily_enteral_items
for all
to authenticated
using (exists (select 1 from clinical_daily_demands d where d.id = daily_demand_id and d.uploaded_by = auth.uid()))
with check (exists (select 1 from clinical_daily_demands d where d.id = daily_demand_id and d.uploaded_by = auth.uid()));
create policy "clinical daily enteral items admin all"
on clinical_daily_enteral_items
for all
to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

drop policy if exists "clinical daily supply items own all" on clinical_daily_supply_items;
drop policy if exists "clinical daily supply items admin all" on clinical_daily_supply_items;
create policy "clinical daily supply items own all"
on clinical_daily_supply_items
for all
to authenticated
using (exists (select 1 from clinical_daily_demands d where d.id = daily_demand_id and d.uploaded_by = auth.uid()))
with check (exists (select 1 from clinical_daily_demands d where d.id = daily_demand_id and d.uploaded_by = auth.uid()));
create policy "clinical daily supply items admin all"
on clinical_daily_supply_items
for all
to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

drop policy if exists "clinical daily import errors own all" on clinical_daily_import_errors;
drop policy if exists "clinical daily import errors admin all" on clinical_daily_import_errors;
create policy "clinical daily import errors own all"
on clinical_daily_import_errors
for all
to authenticated
using (exists (select 1 from clinical_daily_demands d where d.id = daily_demand_id and d.uploaded_by = auth.uid()))
with check (exists (select 1 from clinical_daily_demands d where d.id = daily_demand_id and d.uploaded_by = auth.uid()));
create policy "clinical daily import errors admin all"
on clinical_daily_import_errors
for all
to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());
