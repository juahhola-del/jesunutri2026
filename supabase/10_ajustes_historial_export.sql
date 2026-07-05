-- Ajustes operativos, historial y soporte de stock positivo por ajuste_manual.
-- Ejecutar en Supabase SQL Editor despues de 06, 08 y 09.

create or replace view inventario_lotes_disponibles as
select
  l.id as lote_id,
  p.id as producto_id,
  p.nombre,
  p.nombre_normalizado,
  p.categoria,
  l.unidad,
  l.fecha_recepcion,
  l.fecha_vencimiento,
  l.lote,
  l.proveedor,
  l.observaciones,
  l.costo_unitario,
  coalesce(sum(case when m.tipo_movimiento in ('ingreso', 'ajuste_manual') then m.cantidad else 0 end), 0) as ingresos,
  coalesce(sum(case when m.tipo_movimiento = 'consumo' then m.cantidad else 0 end), 0) as consumos,
  coalesce(sum(case when m.tipo_movimiento in ('merma', 'vencimiento', 'eliminacion') then m.cantidad else 0 end), 0) as mermas,
  coalesce(sum(case when m.tipo_movimiento in ('ingreso', 'ajuste_manual') then m.cantidad else 0 end), 0)
    - coalesce(sum(case when m.tipo_movimiento = 'consumo' then m.cantidad else 0 end), 0)
    - coalesce(sum(case when m.tipo_movimiento in ('merma', 'vencimiento', 'eliminacion') then m.cantidad else 0 end), 0)
    as cantidad_disponible,
  case
    when l.fecha_vencimiento is null then 'sin_fecha'
    when l.fecha_vencimiento < current_date then 'vencido'
    when l.fecha_vencimiento = current_date then 'vence_hoy'
    when l.fecha_vencimiento <= current_date + interval '20 days' then 'vence_1_a_20_dias'
    else 'vigente'
  end as estado_vencimiento,
  case
    when l.fecha_vencimiento is null then null
    else (l.fecha_vencimiento - current_date)
  end as dias_restantes,
  l.alerta_vencimiento_revisada,
  l.activo,
  l.sucursal_id,
  l.deleted_at,
  p.stock_minimo,
  p.critico
from insumo_lotes l
join productos_insumos p on p.id = l.producto_id
left join movimientos_inventario m on m.lote_id = l.id
group by l.id, p.id;

create or replace view alertas_vencimiento as
select *
from inventario_lotes_disponibles
where cantidad_disponible > 0
  and deleted_at is null
  and activo = true
  and fecha_vencimiento is not null
  and estado_vencimiento in ('vencido', 'vence_hoy', 'vence_1_a_20_dias')
order by fecha_vencimiento asc;

create or replace view alertas_stock_minimo as
select
  p.id as producto_id,
  p.nombre,
  p.unidad_default,
  p.stock_minimo,
  coalesce(sum(case when i.cantidad_disponible > 0 then i.cantidad_disponible else 0 end), 0) as stock_actual,
  p.stock_minimo - coalesce(sum(case when i.cantidad_disponible > 0 then i.cantidad_disponible else 0 end), 0) as faltante
from productos_insumos p
left join inventario_lotes_disponibles i on i.producto_id = p.id and i.activo = true and i.deleted_at is null
where p.activo = true and p.deleted_at is null
group by p.id
having p.stock_minimo > 0
   and coalesce(sum(case when i.cantidad_disponible > 0 then i.cantidad_disponible else 0 end), 0) < p.stock_minimo;

create or replace view historial_movimientos_inventario as
select
  m.id,
  m.fecha_movimiento,
  p.nombre as producto,
  l.lote,
  m.tipo_movimiento,
  m.cantidad,
  m.unidad,
  m.motivo,
  m.observacion,
  coalesce(m.desviacion_fifo, false) as desviacion_fifo,
  m.lote_recomendado_id,
  m.usuario_id,
  m.created_at
from movimientos_inventario m
left join productos_insumos p on p.id = m.producto_id
left join insumo_lotes l on l.id = m.lote_id
order by m.fecha_movimiento desc, m.created_at desc;
