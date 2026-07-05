-- JESUnutri - Abastecimiento Clinico persistente.
-- Ejecutar despues de 13_roles_ingresos_pendientes.sql.

create table if not exists clinical_pac_years (
  id uuid primary key default gen_random_uuid(),
  year integer not null check (year between 2020 and 2100),
  approved_budget numeric not null default 0 check (approved_budget >= 0),
  requested_budget numeric not null default 0 check (requested_budget >= 0),
  total_valued numeric not null default 0 check (total_valued >= 0),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (year, created_by)
);

create table if not exists clinical_pac_items (
  id uuid primary key default gen_random_uuid(),
  pac_year_id uuid not null references clinical_pac_years(id) on delete cascade,
  code text null,
  product text not null,
  category text null,
  annual_quantity numeric not null default 0 check (annual_quantity >= 0),
  january numeric not null default 0 check (january >= 0),
  february numeric not null default 0 check (february >= 0),
  march numeric not null default 0 check (march >= 0),
  april numeric not null default 0 check (april >= 0),
  may numeric not null default 0 check (may >= 0),
  june numeric not null default 0 check (june >= 0),
  july numeric not null default 0 check (july >= 0),
  august numeric not null default 0 check (august >= 0),
  september numeric not null default 0 check (september >= 0),
  october numeric not null default 0 check (october >= 0),
  november numeric not null default 0 check (november >= 0),
  december numeric not null default 0 check (december >= 0),
  unit_price numeric not null default 0 check (unit_price >= 0),
  total_valued numeric not null default 0 check (total_valued >= 0),
  product_id uuid null references productos_insumos(id),
  validations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists clinical_monthly_orders (
  id uuid primary key default gen_random_uuid(),
  year integer not null check (year between 2020 and 2100),
  month integer not null check (month between 1 and 12),
  pac_year_id uuid not null references clinical_pac_years(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'generated', 'approved', 'exported')),
  total_valued numeric not null default 0 check (total_valued >= 0),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (year, month, created_by)
);

create table if not exists clinical_monthly_order_items (
  id uuid primary key default gen_random_uuid(),
  monthly_order_id uuid not null references clinical_monthly_orders(id) on delete cascade,
  pac_item_id uuid null references clinical_pac_items(id) on delete set null,
  product_id uuid null references productos_insumos(id),
  code text null,
  product text not null,
  category text null,
  stock_current_snapshot numeric not null default 0 check (stock_current_snapshot >= 0),
  stock_min_snapshot numeric not null default 0 check (stock_min_snapshot >= 0),
  avg_daily_consumption_snapshot numeric not null default 0 check (avg_daily_consumption_snapshot >= 0),
  expected_monthly_consumption numeric not null default 0 check (expected_monthly_consumption >= 0),
  pac_monthly numeric not null default 0 check (pac_monthly >= 0),
  suggested_order numeric not null default 0 check (suggested_order >= 0),
  final_order numeric not null default 0 check (final_order >= 0),
  unit_price numeric not null default 0 check (unit_price >= 0),
  total numeric not null default 0 check (total >= 0),
  risk text null,
  observation text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists clinical_real_order_imports (
  id uuid primary key default gen_random_uuid(),
  year integer not null check (year between 2020 and 2100),
  month integer not null check (month between 1 and 12),
  pac_year_id uuid null references clinical_pac_years(id) on delete set null,
  monthly_order_id uuid null references clinical_monthly_orders(id) on delete set null,
  filename text null,
  row_count integer not null default 0 check (row_count >= 0),
  imported_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists clinical_real_order_items (
  id uuid primary key default gen_random_uuid(),
  real_order_import_id uuid not null references clinical_real_order_imports(id) on delete cascade,
  product_id uuid null references productos_insumos(id),
  pac_item_id uuid null references clinical_pac_items(id) on delete set null,
  monthly_order_item_id uuid null references clinical_monthly_order_items(id) on delete set null,
  code text null,
  product text not null,
  quantity numeric not null default 0 check (quantity >= 0),
  unit_price numeric not null default 0 check (unit_price >= 0),
  total numeric not null default 0 check (total >= 0),
  comparison jsonb not null default '{}'::jsonb,
  validations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists clinical_budget_snapshots (
  id uuid primary key default gen_random_uuid(),
  pac_year_id uuid not null references clinical_pac_years(id) on delete cascade,
  monthly_order_id uuid null references clinical_monthly_orders(id) on delete set null,
  year integer not null check (year between 2020 and 2100),
  month integer null check (month between 1 and 12),
  approved_budget numeric not null default 0 check (approved_budget >= 0),
  requested_budget numeric not null default 0 check (requested_budget >= 0),
  pac_total_valued numeric not null default 0 check (pac_total_valued >= 0),
  order_total_valued numeric not null default 0 check (order_total_valued >= 0),
  available_budget numeric not null default 0,
  snapshot_data jsonb not null default '{}'::jsonb,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_clinical_pac_items_pac_year on clinical_pac_items(pac_year_id);
create index if not exists idx_clinical_pac_items_product_id on clinical_pac_items(product_id);
create index if not exists idx_clinical_monthly_orders_year_month on clinical_monthly_orders(year, month);
create index if not exists idx_clinical_order_items_order on clinical_monthly_order_items(monthly_order_id);
create index if not exists idx_clinical_real_imports_year_month on clinical_real_order_imports(year, month);
create index if not exists idx_clinical_real_items_import on clinical_real_order_items(real_order_import_id);
create index if not exists idx_clinical_budget_snapshots_pac_year on clinical_budget_snapshots(pac_year_id);

alter table clinical_pac_years enable row level security;
alter table clinical_pac_items enable row level security;
alter table clinical_monthly_orders enable row level security;
alter table clinical_monthly_order_items enable row level security;
alter table clinical_real_order_imports enable row level security;
alter table clinical_real_order_items enable row level security;
alter table clinical_budget_snapshots enable row level security;

drop policy if exists "clinical pac years own all" on clinical_pac_years;
drop policy if exists "clinical pac years admin all" on clinical_pac_years;
create policy "clinical pac years own all"
on clinical_pac_years
for all
to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());
create policy "clinical pac years admin all"
on clinical_pac_years
for all
to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

drop policy if exists "clinical pac items own all" on clinical_pac_items;
drop policy if exists "clinical pac items admin all" on clinical_pac_items;
create policy "clinical pac items own all"
on clinical_pac_items
for all
to authenticated
using (exists (select 1 from clinical_pac_years y where y.id = pac_year_id and y.created_by = auth.uid()))
with check (exists (select 1 from clinical_pac_years y where y.id = pac_year_id and y.created_by = auth.uid()));
create policy "clinical pac items admin all"
on clinical_pac_items
for all
to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

drop policy if exists "clinical monthly orders own all" on clinical_monthly_orders;
drop policy if exists "clinical monthly orders admin all" on clinical_monthly_orders;
create policy "clinical monthly orders own all"
on clinical_monthly_orders
for all
to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());
create policy "clinical monthly orders admin all"
on clinical_monthly_orders
for all
to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

drop policy if exists "clinical monthly order items own all" on clinical_monthly_order_items;
drop policy if exists "clinical monthly order items admin all" on clinical_monthly_order_items;
create policy "clinical monthly order items own all"
on clinical_monthly_order_items
for all
to authenticated
using (exists (select 1 from clinical_monthly_orders o where o.id = monthly_order_id and o.created_by = auth.uid()))
with check (exists (select 1 from clinical_monthly_orders o where o.id = monthly_order_id and o.created_by = auth.uid()));
create policy "clinical monthly order items admin all"
on clinical_monthly_order_items
for all
to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

drop policy if exists "clinical real imports own all" on clinical_real_order_imports;
drop policy if exists "clinical real imports admin all" on clinical_real_order_imports;
create policy "clinical real imports own all"
on clinical_real_order_imports
for all
to authenticated
using (imported_by = auth.uid())
with check (imported_by = auth.uid());
create policy "clinical real imports admin all"
on clinical_real_order_imports
for all
to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

drop policy if exists "clinical real items own all" on clinical_real_order_items;
drop policy if exists "clinical real items admin all" on clinical_real_order_items;
create policy "clinical real items own all"
on clinical_real_order_items
for all
to authenticated
using (exists (select 1 from clinical_real_order_imports i where i.id = real_order_import_id and i.imported_by = auth.uid()))
with check (exists (select 1 from clinical_real_order_imports i where i.id = real_order_import_id and i.imported_by = auth.uid()));
create policy "clinical real items admin all"
on clinical_real_order_items
for all
to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

drop policy if exists "clinical budget snapshots own all" on clinical_budget_snapshots;
drop policy if exists "clinical budget snapshots admin all" on clinical_budget_snapshots;
create policy "clinical budget snapshots own all"
on clinical_budget_snapshots
for all
to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());
create policy "clinical budget snapshots admin all"
on clinical_budget_snapshots
for all
to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());
