-- Campos operativos para supervision de bodega.
-- Ejecutar en Supabase SQL Editor.

alter table productos_insumos
  add column if not exists consumo_promedio_diario numeric not null default 0;

alter table productos_insumos
  add column if not exists favorito boolean not null default false;

-- Vista opcional de productos criticos con cobertura.
create or replace view productos_criticos_cobertura as
select
  p.id as producto_id,
  p.nombre,
  p.unidad_default,
  p.stock_minimo,
  p.consumo_promedio_diario,
  p.favorito,
  p.critico,
  coalesce(sum(case when i.cantidad_disponible > 0 then i.cantidad_disponible else 0 end), 0) as stock_actual,
  case
    when p.consumo_promedio_diario > 0 then
      coalesce(sum(case when i.cantidad_disponible > 0 then i.cantidad_disponible else 0 end), 0) / p.consumo_promedio_diario
    else null
  end as dias_cobertura
from productos_insumos p
left join inventario_lotes_disponibles i on i.producto_id = p.id and i.activo = true and i.deleted_at is null
where p.critico = true
  and p.activo = true
  and p.deleted_at is null
group by p.id
order by p.nombre asc;
