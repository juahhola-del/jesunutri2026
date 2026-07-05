-- Auditoria y correccion segura de pedidos proveedor 2026.
-- Regla de negocio:
-- - Estos pedidos NO son stock.
-- - Solo registran decisiones de compra a proveedor.
-- - El stock real se mueve por ingreso masivo, lotes y movimientos de inventario.

-- 1) Ver importaciones proveedor cargadas y detectar si el mes no calza con el nombre del archivo.
with importaciones as (
  select
    id,
    year,
    month,
    filename,
    row_count,
    created_at,
    case
      when filename ilike '%ENERO%' then 1
      when filename ilike '%FEBRERO%' then 2
      when filename ilike '%MARZO%' then 3
      when filename ilike '%ABRIL%' then 4
      when filename ilike '%MAYO%' then 5
      when filename ilike '%JUNIO%' then 6
      when filename ilike '%JULIO%' then 7
      when filename ilike '%AGOSTO%' then 8
      when filename ilike '%SEPTIEMBRE%' or filename ilike '%SETIEMBRE%' then 9
      when filename ilike '%OCTUBRE%' then 10
      when filename ilike '%NOVIEMBRE%' then 11
      when filename ilike '%DICIEMBRE%' then 12
      else null
    end as mes_segun_archivo
  from clinical_real_order_imports
  where year = 2026
)
select
  year,
  month as mes_guardado,
  mes_segun_archivo,
  filename,
  row_count,
  created_at,
  case
    when mes_segun_archivo is null then 'sin mes detectable en archivo'
    when month = mes_segun_archivo then 'ok'
    else 'revisar/corregir mes'
  end as estado
from importaciones
order by created_at;

-- 2) Ver pedidos sugeridos/generados por mes.
select
  year,
  month,
  status,
  total_valued,
  created_at,
  updated_at
from clinical_monthly_orders
where year = 2026
order by month;

-- 3) Correccion puntual recomendada si PEDIDO MAYO 2026 CENTRAL.xlsx quedo guardado como Abril.
-- No borra informacion. Solo cambia la metadata del mes y libera enlaces al pedido sugerido de abril.
-- Ejecutar solo despues de revisar el resultado del bloque 1.
/*
begin;

with mayo as (
  update clinical_real_order_imports
  set
    month = 5,
    monthly_order_id = null
  where year = 2026
    and filename ilike '%PEDIDO MAYO 2026 CENTRAL%'
    and month <> 5
  returning id
)
update clinical_real_order_items
set monthly_order_item_id = null
where real_order_import_id in (select id from mayo);

commit;
*/
