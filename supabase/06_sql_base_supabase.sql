-- PROYECTO JESU - SQL BASE SUPABASE/POSTGRESQLNota: SQL inicial para construir la base. Revisar politicas RLS y auth antes de produccion.

create extension if not exists pgcrypto;
create extension if not exists unaccent;

create table if not exists unidades_medida (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  tipo text not null check (tipo in ('peso', 'volumen', 'unidad')),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

insert into unidades_medida (codigo, nombre, tipo) values
  ('kg', 'Kilogramo', 'peso'),
  ('g', 'Gramo', 'peso'),
  ('lt', 'Litro', 'volumen'),
  ('ml', 'Mililitro', 'volumen'),
  ('unidad', 'Unidad', 'unidad'),
  ('caja', 'Caja', 'unidad'),
  ('paquete', 'Paquete', 'unidad')
on conflict (codigo) do nothing;

create table if not exists productos_insumos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  nombre_normalizado text not null unique,
  categoria text null,
  unidad_default text null references unidades_medida(codigo),
  stock_minimo numeric not null default 0 check (stock_minimo >= 0),
  activo boolean not null default true,
  deleted_at timestamptz null,
  deleted_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists insumo_lotes (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references productos_insumos(id),
  fecha_recepcion date not null default current_date,
  fecha_vencimiento date null,
  lote text null,
  proveedor text null,
  unidad text not null references unidades_medida(codigo),
  costo_unitario numeric null check (costo_unitario is null or costo_unitario >= 0),
  observaciones text null,
  alerta_vencimiento_revisada boolean not null default false,
  activo boolean not null default true,
  sucursal_id uuid null,
  deleted_at timestamptz null,
  deleted_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists movimientos_inventario (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references productos_insumos(id),
  lote_id uuid null references insumo_lotes(id),
  tipo_movimiento text not null check (tipo_movimiento in (
    'ingreso',
    'consumo',
    'ajuste_manual',
    'merma',
    'vencimiento',
    'eliminacion'
  )),
  cantidad numeric not null check (cantidad > 0),
  unidad text not null references unidades_medida(codigo),
  fecha_movimiento timestamptz not null default now(),
  usuario_id uuid null,
  motivo text null,
  observacion text null,
  ip inet null,
  dispositivo text null,
  created_at timestamptz not null default now()
);

create table if not exists importaciones_borrador (
  id uuid primary key default gen_random_uuid(),
  origen text not null check (origen in ('foto', 'excel')),
  estado text not null default 'pendiente_revision' check (estado in (
    'pendiente_revision',
    'corregido',
    'confirmado',
    'rechazado'
  )),
  archivo_url text null,
  usuario_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists importaciones_borrador_filas (
  id uuid primary key default gen_random_uuid(),
  importacion_id uuid not null references importaciones_borrador(id),
  numero_fila integer not null,
  producto_texto text null,
  producto_id_sugerido uuid null references productos_insumos(id),
  cantidad numeric null,
  unidad text null,
  fecha_vencimiento_texto text null,
  fecha_vencimiento date null,
  lote text null,
  proveedor text null,
  observacion text null,
  error_validacion text null,
  estado_revision text not null default 'pendiente',
  created_at timestamptz not null default now()
);

create table if not exists recetas_producto (
  id uuid primary key default gen_random_uuid(),
  producto_final_id uuid not null references productos_insumos(id),
  insumo_id uuid not null references productos_insumos(id),
  cantidad numeric not null check (cantidad > 0),
  unidad text not null references unidades_medida(codigo),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_productos_nombre_normalizado on productos_insumos(nombre_normalizado);
create index if not exists idx_productos_activo on productos_insumos(activo);
create index if not exists idx_lotes_producto on insumo_lotes(producto_id);
create index if not exists idx_lotes_vencimiento on insumo_lotes(fecha_vencimiento);
create index if not exists idx_lotes_activo on insumo_lotes(activo);
create index if not exists idx_movimientos_producto on movimientos_inventario(producto_id);
create index if not exists idx_movimientos_lote on movimientos_inventario(lote_id);
create index if not exists idx_movimientos_tipo on movimientos_inventario(tipo_movimiento);
create index if not exists idx_movimientos_fecha on movimientos_inventario(fecha_movimiento);
create index if not exists idx_importaciones_estado on importaciones_borrador(estado);

create or replace function normalizar_nombre_insumo(valor text)
returns text
language sql
immutable
as $$
  select trim(regexp_replace(lower(unaccent(coalesce(valor, ''))), '\s+', ' ', 'g'));
$$;

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
  coalesce(sum(case when m.tipo_movimiento = 'ingreso' then m.cantidad else 0 end), 0) as ingresos,
  coalesce(sum(case when m.tipo_movimiento = 'consumo' then m.cantidad else 0 end), 0) as consumos,
  coalesce(sum(case when m.tipo_movimiento in ('merma', 'vencimiento', 'eliminacion') then m.cantidad else 0 end), 0) as mermas,
  coalesce(sum(case when m.tipo_movimiento = 'ingreso' then m.cantidad else 0 end), 0)
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
  l.deleted_at
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

create or replace view dashboard_resumen as
select
  (select count(*) from productos_insumos where activo = true and deleted_at is null) as total_insumos,
  (select count(*) from alertas_vencimiento where estado_vencimiento = 'vencido') as productos_vencidos,
  (select count(*) from alertas_vencimiento where estado_vencimiento in ('vence_hoy', 'vence_1_a_20_dias')) as proximos_a_vencer,
  (select count(*) from alertas_stock_minimo) as productos_bajo_stock,
  (select coalesce(sum(cantidad_disponible * coalesce(costo_unitario, 0)), 0) from inventario_lotes_disponibles where cantidad_disponible > 0 and activo = true and deleted_at is null) as valor_estimado_inventario;
