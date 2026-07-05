-- JESUnutri - Conciliacion clinica central.
-- Ejecutar despues de 15_demanda_diaria_clinica.sql.

create table if not exists clinical_product_links (
  id uuid primary key default gen_random_uuid(),
  source_type text not null default 'pac',
  source_record_id text null,
  source_code text null,
  source_name text not null default '',
  source_category text not null default '',
  normalized_code text not null default '',
  normalized_name text not null default '',
  pac_year_id uuid null references clinical_pac_years(id) on delete cascade,
  pac_item_id uuid null references clinical_pac_items(id) on delete set null,
  pac_codigo text null,
  pac_producto text not null default '',
  producto_id uuid null references productos_insumos(id) on delete set null,
  match_status text not null default 'pendiente',
  match_confidence numeric not null default 0 check (match_confidence >= 0 and match_confidence <= 100),
  match_method text null,
  ignored boolean not null default false,
  confirmed_by uuid null references auth.users(id),
  confirmed_at timestamptz null,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table clinical_product_links add column if not exists source_type text not null default 'pac';
alter table clinical_product_links add column if not exists source_record_id text null;
alter table clinical_product_links add column if not exists source_code text null;
alter table clinical_product_links add column if not exists source_name text not null default '';
alter table clinical_product_links add column if not exists source_category text not null default '';
alter table clinical_product_links add column if not exists normalized_code text not null default '';
alter table clinical_product_links add column if not exists normalized_name text not null default '';
alter table clinical_product_links add column if not exists confirmed_by uuid null references auth.users(id);
alter table clinical_product_links add column if not exists confirmed_at timestamptz null;

update clinical_product_links
set
  source_type = coalesce(nullif(source_type, ''), 'pac'),
  source_record_id = coalesce(source_record_id, pac_item_id::text),
  source_code = coalesce(source_code, pac_codigo),
  source_name = coalesce(nullif(source_name, ''), pac_producto, ''),
  source_category = coalesce(source_category, ''),
  normalized_code = upper(regexp_replace(regexp_replace(coalesce(normalized_code, source_code, pac_codigo, ''), '\s*-\s*', '-', 'g'), '\s+', ' ', 'g')),
  normalized_name = regexp_replace(lower(coalesce(nullif(normalized_name, ''), source_name, pac_producto, '')), '[^a-z0-9]+', ' ', 'g'),
  match_status = case when match_status = 'sin coincidencia' then 'pendiente' else match_status end,
  confirmed_at = case when match_status = 'vinculado' and confirmed_at is null then updated_at else confirmed_at end,
  confirmed_by = case when match_status = 'vinculado' and confirmed_by is null then created_by else confirmed_by end;

alter table clinical_product_links alter column source_name set default '';
alter table clinical_product_links alter column source_name set not null;
alter table clinical_product_links alter column source_category set default '';
alter table clinical_product_links alter column source_category set not null;
alter table clinical_product_links alter column normalized_code set default '';
alter table clinical_product_links alter column normalized_code set not null;
alter table clinical_product_links alter column normalized_name set default '';
alter table clinical_product_links alter column normalized_name set not null;

alter table clinical_product_links drop constraint if exists clinical_product_links_match_status_check;
alter table clinical_product_links add constraint clinical_product_links_match_status_check
check (match_status in ('vinculado', 'sugerido', 'pendiente', 'conflicto', 'ignorado'));

alter table clinical_product_links drop constraint if exists clinical_product_links_source_type_check;
alter table clinical_product_links add constraint clinical_product_links_source_type_check
check (source_type in ('pac', 'monthly', 'demand', 'monthly_order', 'daily_demand', 'future_import'));

drop index if exists uq_clinical_product_links_year_code_user;
drop index if exists uq_clinical_product_links_source_user;
create unique index if not exists uq_clinical_product_links_source_user
on clinical_product_links(source_type, normalized_code, normalized_name, source_category, created_by);

create index if not exists idx_clinical_product_links_source_type on clinical_product_links(source_type);
create index if not exists idx_clinical_product_links_source_code on clinical_product_links(normalized_code);
create index if not exists idx_clinical_product_links_source_name on clinical_product_links(normalized_name);
create index if not exists idx_clinical_product_links_pac_year on clinical_product_links(pac_year_id);
create index if not exists idx_clinical_product_links_pac_item on clinical_product_links(pac_item_id);
create index if not exists idx_clinical_product_links_producto on clinical_product_links(producto_id);
create index if not exists idx_clinical_product_links_user on clinical_product_links(created_by);

alter table clinical_product_links enable row level security;

drop policy if exists "clinical product links own all" on clinical_product_links;
drop policy if exists "clinical product links admin all" on clinical_product_links;

create policy "clinical product links own all"
on clinical_product_links
for all
to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());

create policy "clinical product links admin all"
on clinical_product_links
for all
to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());
