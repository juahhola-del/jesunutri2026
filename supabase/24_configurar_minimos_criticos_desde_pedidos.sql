-- JESUnutri - Sugerencia y configuracion de minimos para productos criticos.
-- Fuente: pedidos mensuales guardados, pedidos proveedor reales y PAC anual.
-- Uso recomendado:
-- 1) Ejecutar el bloque PREVIEW y revisar recomendado_stock_minimo / recomendado_consumo_diario.
-- 2) Ejecutar el UPDATE dentro de una transaccion si los valores calzan.

begin;

-- PREVIEW: productos criticos que hoy caen en "Detalles criticos"
-- porque les falta minimo/consumo o porque estan estables.
with stock_actual as (
  select
    i.producto_id,
    coalesce(sum(case when i.cantidad_disponible > 0 then i.cantidad_disponible else 0 end), 0) as stock_actual
  from inventario_lotes_disponibles i
  where i.activo = true
    and i.deleted_at is null
  group by i.producto_id
),
real_month as (
  select
    ri.product_id,
    imp.year,
    imp.month,
    sum(ri.quantity) as cantidad_mensual
  from clinical_real_order_items ri
  join clinical_real_order_imports imp on imp.id = ri.real_order_import_id
  where ri.product_id is not null
    and ri.quantity > 0
  group by ri.product_id, imp.year, imp.month
),
generated_month as (
  select
    oi.product_id,
    o.year,
    o.month,
    sum(coalesce(nullif(oi.final_order, 0), nullif(oi.suggested_order, 0), nullif(oi.pac_monthly, 0), 0)) as cantidad_mensual
  from clinical_monthly_order_items oi
  join clinical_monthly_orders o on o.id = oi.monthly_order_id
  where oi.product_id is not null
  group by oi.product_id, o.year, o.month
),
monthly_source as (
  select * from real_month
  union all
  select gm.*
  from generated_month gm
  where not exists (
    select 1
    from real_month rm
    where rm.product_id = gm.product_id
      and rm.year = gm.year
      and rm.month = gm.month
  )
),
monthly_stats as (
  select
    product_id,
    count(*) as meses_con_pedido,
    avg(cantidad_mensual) as promedio_pedido_mensual,
    percentile_cont(0.75) within group (order by cantidad_mensual) as p75_pedido_mensual,
    max(cantidad_mensual) as max_pedido_mensual
  from monthly_source
  where cantidad_mensual > 0
  group by product_id
),
pac_months as (
  select
    pi.product_id,
    v.cantidad_mensual
  from clinical_pac_items pi
  cross join lateral (values
    (pi.january), (pi.february), (pi.march), (pi.april),
    (pi.may), (pi.june), (pi.july), (pi.august),
    (pi.september), (pi.october), (pi.november), (pi.december)
  ) as v(cantidad_mensual)
  where pi.product_id is not null
    and v.cantidad_mensual > 0
),
pac_stats as (
  select
    product_id,
    count(*) as meses_pac,
    avg(cantidad_mensual) as promedio_pac_mensual,
    percentile_cont(0.75) within group (order by cantidad_mensual) as p75_pac_mensual
  from pac_months
  group by product_id
),
excel_hints as (
  -- Respaldo leido desde planillas locales enero-junio 2026 cuando aun no hay product_id vinculado.
  -- Huevos: pedidos 2400, 3600, 3000, 3000, 2400, 2400 -> promedio 2800.
  -- Jalea normal: pedidos 120, 100, 120, 120, 96, 96 -> promedio 108.67.
  -- Jalea dietetica: pedidos 200, 200, 200, 200, 160, 160 -> promedio 186.67.
  -- Cuchara sopera: pedidos 6000, 4600 -> promedio 5300.
  select * from (values
    ('huevos', 2800::numeric, 3000::numeric, 92::numeric, 750::numeric),
    ('jalea con azucar', 108.67::numeric, 120::numeric, 3.57::numeric, 30::numeric),
    ('jalea normal', 108.67::numeric, 120::numeric, 3.57::numeric, 30::numeric),
    ('jalea dietetica', 186.67::numeric, 200::numeric, 6.13::numeric, 50::numeric),
    ('althera', 21.5::numeric, 24::numeric, 0.71::numeric, 6::numeric),
    ('carne molida de pavo', 652::numeric, 700::numeric, 21.42::numeric, 175::numeric),
    ('chuno', 67::numeric, 70::numeric, 2.2::numeric, 18::numeric),
    ('cuchara sopera', 5300::numeric, 6000::numeric, 174.13::numeric, 1500::numeric),
    ('espirales', 440.83::numeric, 450::numeric, 14.48::numeric, 113::numeric),
    ('fideos', 280::numeric, 300::numeric, 9.2::numeric, 75::numeric),
    ('leche descremada', 215.33::numeric, 220::numeric, 7.07::numeric, 55::numeric),
    ('mct', 2::numeric, 2::numeric, 0.07::numeric, 1::numeric),
    ('mermelada sin azucar', 493.33::numeric, 500::numeric, 16.21::numeric, 124::numeric),
    ('nan 1', 32::numeric, 32::numeric, 1.05::numeric, 8::numeric),
    ('neocate', 19.33::numeric, 24::numeric, 0.64::numeric, 6::numeric),
    ('neosure', 129.5::numeric, 144::numeric, 4.25::numeric, 36::numeric),
    ('pediasure vainilla', 53::numeric, 58::numeric, 1.74::numeric, 15::numeric),
    ('similac sin lactosa', 45::numeric, 50::numeric, 1.48::numeric, 13::numeric),
    ('similac total confort', 19.33::numeric, 24::numeric, 0.64::numeric, 6::numeric),
    ('tallarines', 280::numeric, 300::numeric, 9.2::numeric, 75::numeric),
    ('te', 3733.33::numeric, 4000::numeric, 122.66::numeric, 1000::numeric),
    ('vasos', 20800::numeric, 24000::numeric, 683.37::numeric, 6000::numeric)
  ) as x(nombre_normalizado_hint, promedio_mensual, p75_mensual, consumo_diario, stock_minimo)
),
recommended as (
  select
    p.id,
    p.nombre,
    p.stock_minimo as stock_minimo_actual,
    p.consumo_promedio_diario as consumo_diario_actual,
    coalesce(sa.stock_actual, 0) as stock_actual,
    ms.meses_con_pedido,
    ps.meses_pac,
    coalesce(ms.promedio_pedido_mensual, eh.promedio_mensual, ps.promedio_pac_mensual, 0) as promedio_mensual_base,
    coalesce(ms.p75_pedido_mensual, eh.p75_mensual, ps.p75_pac_mensual, 0) as p75_mensual_base,
    ceiling(greatest(
      coalesce(ms.promedio_pedido_mensual, eh.promedio_mensual, ps.promedio_pac_mensual, 0) / 30.4375 * 7,
      coalesce(ms.promedio_pedido_mensual, eh.promedio_mensual, ps.promedio_pac_mensual, 0) * 0.25,
      coalesce(ms.p75_pedido_mensual, eh.p75_mensual, ps.p75_pac_mensual, 0) * 0.25,
      coalesce(eh.stock_minimo, 0)
    )) as recomendado_stock_minimo,
    round((greatest(
      coalesce(ms.promedio_pedido_mensual, eh.promedio_mensual, ps.promedio_pac_mensual, 0) / 30.4375,
      coalesce(eh.consumo_diario, 0)
    ))::numeric, 3) as recomendado_consumo_diario
  from productos_insumos p
  left join stock_actual sa on sa.producto_id = p.id
  left join monthly_stats ms on ms.product_id = p.id
  left join pac_stats ps on ps.product_id = p.id
  left join excel_hints eh
    on (
      case
        when length(eh.nombre_normalizado_hint) <= 3 then
          p.nombre_normalizado ~* ('(^|\\s)' || eh.nombre_normalizado_hint || '(\\s|$)')
          or lower(p.nombre) ~* ('(^|\\s)' || eh.nombre_normalizado_hint || '(\\s|$)')
        else
          p.nombre_normalizado ilike '%' || eh.nombre_normalizado_hint || '%'
          or lower(p.nombre) ilike '%' || eh.nombre_normalizado_hint || '%'
      end
    )
  where p.critico = true
    and p.activo = true
    and p.deleted_at is null
)
select
  nombre,
  stock_actual,
  stock_minimo_actual,
  consumo_diario_actual,
  meses_con_pedido,
  meses_pac,
  promedio_mensual_base,
  p75_mensual_base,
  recomendado_stock_minimo,
  recomendado_consumo_diario
from recommended
where recomendado_stock_minimo > 0
  and recomendado_consumo_diario > 0
  and (
    stock_minimo_actual <= 0
    or consumo_diario_actual <= 0
    or stock_actual >= stock_minimo_actual
  )
order by nombre;

-- UPDATE: deja configurados los criticos de Detalles con minimos/consumo desde data.
-- Conserva valores existentes si ya son mayores que la recomendacion.
with stock_actual as (
  select
    i.producto_id,
    coalesce(sum(case when i.cantidad_disponible > 0 then i.cantidad_disponible else 0 end), 0) as stock_actual
  from inventario_lotes_disponibles i
  where i.activo = true
    and i.deleted_at is null
  group by i.producto_id
),
real_month as (
  select ri.product_id, imp.year, imp.month, sum(ri.quantity) as cantidad_mensual
  from clinical_real_order_items ri
  join clinical_real_order_imports imp on imp.id = ri.real_order_import_id
  where ri.product_id is not null and ri.quantity > 0
  group by ri.product_id, imp.year, imp.month
),
generated_month as (
  select
    oi.product_id,
    o.year,
    o.month,
    sum(coalesce(nullif(oi.final_order, 0), nullif(oi.suggested_order, 0), nullif(oi.pac_monthly, 0), 0)) as cantidad_mensual
  from clinical_monthly_order_items oi
  join clinical_monthly_orders o on o.id = oi.monthly_order_id
  where oi.product_id is not null
  group by oi.product_id, o.year, o.month
),
monthly_source as (
  select * from real_month
  union all
  select gm.*
  from generated_month gm
  where not exists (
    select 1 from real_month rm
    where rm.product_id = gm.product_id and rm.year = gm.year and rm.month = gm.month
  )
),
monthly_stats as (
  select
    product_id,
    avg(cantidad_mensual) as promedio_pedido_mensual,
    percentile_cont(0.75) within group (order by cantidad_mensual) as p75_pedido_mensual
  from monthly_source
  where cantidad_mensual > 0
  group by product_id
),
pac_months as (
  select pi.product_id, v.cantidad_mensual
  from clinical_pac_items pi
  cross join lateral (values
    (pi.january), (pi.february), (pi.march), (pi.april),
    (pi.may), (pi.june), (pi.july), (pi.august),
    (pi.september), (pi.october), (pi.november), (pi.december)
  ) as v(cantidad_mensual)
  where pi.product_id is not null and v.cantidad_mensual > 0
),
pac_stats as (
  select
    product_id,
    avg(cantidad_mensual) as promedio_pac_mensual,
    percentile_cont(0.75) within group (order by cantidad_mensual) as p75_pac_mensual
  from pac_months
  group by product_id
),
excel_hints as (
  select * from (values
    ('huevos', 2800::numeric, 3000::numeric, 92::numeric, 750::numeric),
    ('jalea con azucar', 108.67::numeric, 120::numeric, 3.57::numeric, 30::numeric),
    ('jalea normal', 108.67::numeric, 120::numeric, 3.57::numeric, 30::numeric),
    ('jalea dietetica', 186.67::numeric, 200::numeric, 6.13::numeric, 50::numeric),
    ('althera', 21.5::numeric, 24::numeric, 0.71::numeric, 6::numeric),
    ('carne molida de pavo', 652::numeric, 700::numeric, 21.42::numeric, 175::numeric),
    ('chuno', 67::numeric, 70::numeric, 2.2::numeric, 18::numeric),
    ('cuchara sopera', 5300::numeric, 6000::numeric, 174.13::numeric, 1500::numeric),
    ('espirales', 440.83::numeric, 450::numeric, 14.48::numeric, 113::numeric),
    ('fideos', 280::numeric, 300::numeric, 9.2::numeric, 75::numeric),
    ('leche descremada', 215.33::numeric, 220::numeric, 7.07::numeric, 55::numeric),
    ('mct', 2::numeric, 2::numeric, 0.07::numeric, 1::numeric),
    ('mermelada sin azucar', 493.33::numeric, 500::numeric, 16.21::numeric, 124::numeric),
    ('nan 1', 32::numeric, 32::numeric, 1.05::numeric, 8::numeric),
    ('neocate', 19.33::numeric, 24::numeric, 0.64::numeric, 6::numeric),
    ('neosure', 129.5::numeric, 144::numeric, 4.25::numeric, 36::numeric),
    ('pediasure vainilla', 53::numeric, 58::numeric, 1.74::numeric, 15::numeric),
    ('similac sin lactosa', 45::numeric, 50::numeric, 1.48::numeric, 13::numeric),
    ('similac total confort', 19.33::numeric, 24::numeric, 0.64::numeric, 6::numeric),
    ('tallarines', 280::numeric, 300::numeric, 9.2::numeric, 75::numeric),
    ('te', 3733.33::numeric, 4000::numeric, 122.66::numeric, 1000::numeric),
    ('vasos', 20800::numeric, 24000::numeric, 683.37::numeric, 6000::numeric)
  ) as x(nombre_normalizado_hint, promedio_mensual, p75_mensual, consumo_diario, stock_minimo)
),
recommended as (
  select
    p.id,
    p.stock_minimo as stock_minimo_actual,
    p.consumo_promedio_diario as consumo_diario_actual,
    coalesce(sa.stock_actual, 0) as stock_actual,
    ceiling(greatest(
      coalesce(ms.promedio_pedido_mensual, eh.promedio_mensual, ps.promedio_pac_mensual, 0) / 30.4375 * 7,
      coalesce(ms.promedio_pedido_mensual, eh.promedio_mensual, ps.promedio_pac_mensual, 0) * 0.25,
      coalesce(ms.p75_pedido_mensual, eh.p75_mensual, ps.p75_pac_mensual, 0) * 0.25,
      coalesce(eh.stock_minimo, 0)
    )) as recomendado_stock_minimo,
    round((greatest(
      coalesce(ms.promedio_pedido_mensual, eh.promedio_mensual, ps.promedio_pac_mensual, 0) / 30.4375,
      coalesce(eh.consumo_diario, 0)
    ))::numeric, 3) as recomendado_consumo_diario
  from productos_insumos p
  left join stock_actual sa on sa.producto_id = p.id
  left join monthly_stats ms on ms.product_id = p.id
  left join pac_stats ps on ps.product_id = p.id
  left join excel_hints eh
    on (
      case
        when length(eh.nombre_normalizado_hint) <= 3 then
          p.nombre_normalizado ~* ('(^|\\s)' || eh.nombre_normalizado_hint || '(\\s|$)')
          or lower(p.nombre) ~* ('(^|\\s)' || eh.nombre_normalizado_hint || '(\\s|$)')
        else
          p.nombre_normalizado ilike '%' || eh.nombre_normalizado_hint || '%'
          or lower(p.nombre) ilike '%' || eh.nombre_normalizado_hint || '%'
      end
    )
  where p.critico = true
    and p.activo = true
    and p.deleted_at is null
)
update productos_insumos p
set
  stock_minimo = greatest(p.stock_minimo, r.recomendado_stock_minimo),
  consumo_promedio_diario = greatest(p.consumo_promedio_diario, r.recomendado_consumo_diario),
  updated_at = now()
from recommended r
where p.id = r.id
  and r.recomendado_stock_minimo > 0
  and r.recomendado_consumo_diario > 0
  and (
    r.stock_minimo_actual <= 0
    or r.consumo_diario_actual <= 0
    or r.stock_actual >= r.stock_minimo_actual
  );

-- Si el preview se ve mal, cambiar commit por rollback.
-- rollback;
commit;
