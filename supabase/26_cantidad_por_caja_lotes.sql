-- JESUnutri - cantidad por caja para etiquetas.
-- Ejecutar una vez en Supabase antes de guardar "Por caja" desde el modulo de etiquetas.

alter table insumo_lotes
add column if not exists cantidad_por_caja numeric null
check (cantidad_por_caja is null or cantidad_por_caja >= 0);

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
  p.critico,
  l.cantidad_por_caja
from insumo_lotes l
join productos_insumos p on p.id = l.producto_id
left join movimientos_inventario m on m.lote_id = l.id
group by l.id, p.id;
