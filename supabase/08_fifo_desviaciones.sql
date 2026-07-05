-- Migracion para control de desviaciones FIFO.
-- Ejecutar en Supabase SQL Editor.

alter table movimientos_inventario
  add column if not exists desviacion_fifo boolean not null default false;

alter table movimientos_inventario
  add column if not exists lote_recomendado_id uuid null references insumo_lotes(id);

create or replace view desviaciones_fifo as
select
  m.fecha_movimiento,
  p.nombre as producto,
  lr.lote as lote_recomendado,
  lr.fecha_vencimiento as vencimiento_lote_recomendado,
  lu.lote as lote_usado,
  lu.fecha_vencimiento as vencimiento_lote_usado,
  m.usuario_id,
  m.motivo,
  m.observacion,
  m.cantidad,
  m.unidad
from movimientos_inventario m
join productos_insumos p on p.id = m.producto_id
left join insumo_lotes lr on lr.id = m.lote_recomendado_id
left join insumo_lotes lu on lu.id = m.lote_id
where m.tipo_movimiento = 'consumo'
  and m.desviacion_fifo = true
order by m.fecha_movimiento desc;
