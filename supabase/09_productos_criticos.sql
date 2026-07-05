-- Producto critico para control operacional.
-- Ejecutar en Supabase SQL Editor.

alter table productos_insumos
  add column if not exists critico boolean not null default false;

-- Vista opcional de productos criticos con stock total.
create or replace view productos_criticos_stock as
select
  p.id as producto_id,
  p.nombre,
  p.unidad_default,
  p.stock_minimo,
  p.critico,
  coalesce(sum(case when i.cantidad_disponible > 0 then i.cantidad_disponible else 0 end), 0) as stock_actual,
  case
    when coalesce(sum(case when i.cantidad_disponible > 0 then i.cantidad_disponible else 0 end), 0) <= 0 then 'sin_stock'
    when p.stock_minimo > 0 and coalesce(sum(case when i.cantidad_disponible > 0 then i.cantidad_disponible else 0 end), 0) < p.stock_minimo then 'bajo_stock'
    else 'ok'
  end as estado_operativo
from productos_insumos p
left join inventario_lotes_disponibles i on i.producto_id = p.id and i.activo = true and i.deleted_at is null
where p.critico = true
  and p.activo = true
  and p.deleted_at is null
group by p.id
order by estado_operativo desc, p.nombre asc;
