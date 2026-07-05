-- Respaldo y limpieza de pedidos clinicos.
-- Objetivo:
-- - Dejar el stock real controlado solo por ingreso masivo, lotes y movimientos.
-- - Sacar de la base los pedidos proveedor mensuales y planillas diarias de nutris.
-- - No tocar inventario real: productos_insumos, insumo_lotes, movimientos_inventario.
--
-- IMPORTANTE:
-- 1) Ejecuta primero el bloque de RESPALDO.
-- 2) Verifica que las tablas backup_* tengan filas.
-- 3) Recien ahi ejecuta el bloque de LIMPIEZA.

-- =========================================================
-- 1) RESPALDO
-- =========================================================

create table if not exists backup_20260608_clinical_monthly_orders as
select * from clinical_monthly_orders;

create table if not exists backup_20260608_clinical_monthly_order_items as
select * from clinical_monthly_order_items;

create table if not exists backup_20260608_clinical_real_order_imports as
select * from clinical_real_order_imports;

create table if not exists backup_20260608_clinical_real_order_items as
select * from clinical_real_order_items;

create table if not exists backup_20260608_clinical_daily_demands as
select * from clinical_daily_demands;

create table if not exists backup_20260608_clinical_daily_diet_counts as
select * from clinical_daily_diet_counts;

create table if not exists backup_20260608_clinical_daily_enteral_items as
select * from clinical_daily_enteral_items;

create table if not exists backup_20260608_clinical_daily_supply_items as
select * from clinical_daily_supply_items;

create table if not exists backup_20260608_clinical_daily_import_errors as
select * from clinical_daily_import_errors;

create table if not exists backup_20260608_clinical_budget_snapshots as
select * from clinical_budget_snapshots;

create table if not exists backup_20260608_clinical_product_links as
select * from clinical_product_links;

create table if not exists backup_20260608_clinical_demand_product_links as
select * from clinical_demand_product_links;

-- Verificacion de respaldo.
select 'backup monthly orders' as bloque, count(*) as filas from backup_20260608_clinical_monthly_orders
union all select 'backup monthly items', count(*) from backup_20260608_clinical_monthly_order_items
union all select 'backup provider imports', count(*) from backup_20260608_clinical_real_order_imports
union all select 'backup provider items', count(*) from backup_20260608_clinical_real_order_items
union all select 'backup daily demands', count(*) from backup_20260608_clinical_daily_demands
union all select 'backup daily diets', count(*) from backup_20260608_clinical_daily_diet_counts
union all select 'backup daily enterals', count(*) from backup_20260608_clinical_daily_enteral_items
union all select 'backup daily supplies', count(*) from backup_20260608_clinical_daily_supply_items
union all select 'backup daily errors', count(*) from backup_20260608_clinical_daily_import_errors
union all select 'backup budget snapshots', count(*) from backup_20260608_clinical_budget_snapshots
union all select 'backup product links', count(*) from backup_20260608_clinical_product_links
union all select 'backup demand links', count(*) from backup_20260608_clinical_demand_product_links;

-- =========================================================
-- 2) LIMPIEZA
-- =========================================================
-- Ejecutar SOLO despues de confirmar el respaldo.
-- No toca stock real.

/*
begin;

truncate table
  clinical_daily_import_errors,
  clinical_daily_supply_items,
  clinical_daily_enteral_items,
  clinical_daily_diet_counts,
  clinical_daily_demands,
  clinical_real_order_items,
  clinical_real_order_imports,
  clinical_monthly_order_items,
  clinical_monthly_orders,
  clinical_budget_snapshots,
  clinical_demand_product_links,
  clinical_product_links
restart identity cascade;

commit;
*/

-- =========================================================
-- 3) VERIFICACION POST-LIMPIEZA
-- =========================================================

/*
select 'clinical_monthly_orders' as tabla, count(*) as filas from clinical_monthly_orders
union all select 'clinical_monthly_order_items', count(*) from clinical_monthly_order_items
union all select 'clinical_real_order_imports', count(*) from clinical_real_order_imports
union all select 'clinical_real_order_items', count(*) from clinical_real_order_items
union all select 'clinical_daily_demands', count(*) from clinical_daily_demands
union all select 'clinical_daily_diet_counts', count(*) from clinical_daily_diet_counts
union all select 'clinical_daily_enteral_items', count(*) from clinical_daily_enteral_items
union all select 'clinical_daily_supply_items', count(*) from clinical_daily_supply_items
union all select 'clinical_daily_import_errors', count(*) from clinical_daily_import_errors
union all select 'clinical_product_links', count(*) from clinical_product_links
union all select 'clinical_demand_product_links', count(*) from clinical_demand_product_links;
*/
