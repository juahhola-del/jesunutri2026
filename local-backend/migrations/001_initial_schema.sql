create table if not exists unidades_medida (
  id text primary key,
  codigo text not null unique,
  nombre text not null,
  tipo text not null,
  activo integer not null default 1,
  created_at text not null default (datetime('now'))
);

insert or ignore into unidades_medida (id, codigo, nombre, tipo) values
  ('unit-kg', 'kg', 'Kilogramo', 'peso'),
  ('unit-g', 'g', 'Gramo', 'peso'),
  ('unit-lt', 'lt', 'Litro', 'volumen'),
  ('unit-ml', 'ml', 'Mililitro', 'volumen'),
  ('unit-unidad', 'unidad', 'Unidad', 'unidad'),
  ('unit-caja', 'caja', 'Caja', 'unidad'),
  ('unit-paquete', 'paquete', 'Paquete', 'unidad');

create table if not exists usuarios_app (
  id text primary key,
  email text not null unique,
  nombre text,
  rol text not null default 'operador',
  activo integer not null default 1,
  created_at text not null default (datetime('now'))
);

create table if not exists local_auth_users (
  user_id text primary key references usuarios_app(id) on delete cascade,
  password_salt text not null,
  password_hash text not null,
  updated_at text not null default (datetime('now'))
);

create table if not exists productos_insumos (
  id text primary key,
  nombre text not null,
  nombre_normalizado text not null unique,
  categoria text,
  unidad_default text references unidades_medida(codigo),
  stock_minimo real not null default 0,
  consumo_promedio_diario real not null default 0,
  critico integer not null default 0,
  favorito integer not null default 0,
  activo integer not null default 1,
  deleted_at text,
  deleted_by text,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now'))
);

create table if not exists insumo_lotes (
  id text primary key,
  producto_id text not null references productos_insumos(id),
  fecha_recepcion text not null default (date('now')),
  fecha_vencimiento text,
  lote text,
  proveedor text,
  unidad text not null references unidades_medida(codigo),
  costo_unitario real,
  cantidad_por_caja real,
  observaciones text,
  alerta_vencimiento_revisada integer not null default 0,
  activo integer not null default 1,
  sucursal_id text,
  deleted_at text,
  deleted_by text,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now'))
);

create table if not exists movimientos_inventario (
  id text primary key,
  producto_id text not null references productos_insumos(id),
  lote_id text references insumo_lotes(id),
  tipo_movimiento text not null,
  cantidad real not null,
  unidad text not null references unidades_medida(codigo),
  fecha_movimiento text not null default (datetime('now')),
  usuario_id text,
  motivo text,
  observacion text,
  desviacion_fifo integer not null default 0,
  lote_recomendado_id text,
  ip text,
  dispositivo text,
  created_at text not null default (datetime('now'))
);

create table if not exists importaciones_borrador (
  id text primary key,
  origen text not null,
  estado text not null default 'pendiente_revision',
  archivo_url text,
  usuario_id text,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now'))
);

create table if not exists importaciones_borrador_filas (
  id text primary key,
  importacion_id text not null references importaciones_borrador(id) on delete cascade,
  numero_fila integer not null,
  producto_texto text,
  producto_id_sugerido text references productos_insumos(id),
  cantidad real,
  unidad text,
  fecha_vencimiento_texto text,
  fecha_vencimiento text,
  lote text,
  proveedor text,
  observacion text,
  error_validacion text,
  estado_revision text not null default 'pendiente',
  created_at text not null default (datetime('now'))
);

create table if not exists recetas_producto (
  id text primary key,
  producto_final_id text not null references productos_insumos(id),
  insumo_id text not null references productos_insumos(id),
  cantidad real not null,
  unidad text not null references unidades_medida(codigo),
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now'))
);

create table if not exists ingresos_pendientes (
  id text primary key,
  creado_por text,
  creado_por_email text,
  creado_por_nombre text,
  estado text not null default 'pendiente',
  fecha_recepcion text not null default (date('now')),
  observacion_general text,
  aprobado_por text,
  aprobado_por_email text,
  aprobado_at text,
  rechazado_por text,
  rechazado_por_email text,
  rechazado_at text,
  motivo_rechazo text,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now'))
);

create table if not exists ingresos_pendientes_detalle (
  id text primary key,
  ingreso_pendiente_id text not null references ingresos_pendientes(id) on delete cascade,
  nombre text not null,
  nombre_normalizado text not null,
  cantidad real not null,
  unidad text not null,
  fecha_vencimiento text,
  lote text,
  critico integer not null default 0,
  observaciones text,
  created_at text not null default (datetime('now'))
);

create trigger if not exists trg_ingresos_pendientes_updated_at
after update on ingresos_pendientes
for each row
begin
  update ingresos_pendientes set updated_at = datetime('now') where id = old.id;
end;

create table if not exists daily_tasks (
  id text primary key,
  title text not null,
  description text,
  scheduled_time text,
  due_date text,
  recurrence_type text not null default 'diaria',
  priority text not null default 'media',
  assigned_to text not null default 'equipo',
  status text not null default 'pendiente',
  notes text,
  created_by text,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now')),
  completed_at text
);

create table if not exists clinical_pac_years (
  id text primary key,
  year integer not null,
  approved_budget real not null default 0,
  requested_budget real not null default 0,
  total_valued real not null default 0,
  created_by text not null default 'local-admin',
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now')),
  unique (year, created_by)
);

create table if not exists clinical_pac_items (
  id text primary key,
  pac_year_id text not null references clinical_pac_years(id) on delete cascade,
  code text,
  product text not null,
  category text,
  annual_quantity real not null default 0,
  january real not null default 0,
  february real not null default 0,
  march real not null default 0,
  april real not null default 0,
  may real not null default 0,
  june real not null default 0,
  july real not null default 0,
  august real not null default 0,
  september real not null default 0,
  october real not null default 0,
  november real not null default 0,
  december real not null default 0,
  unit_price real not null default 0,
  total_valued real not null default 0,
  product_id text references productos_insumos(id),
  validations text not null default '[]',
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now'))
);

create table if not exists clinical_monthly_orders (
  id text primary key,
  year integer not null,
  month integer not null,
  pac_year_id text not null references clinical_pac_years(id) on delete cascade,
  status text not null default 'draft',
  total_valued real not null default 0,
  created_by text not null default 'local-admin',
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now')),
  unique (year, month, created_by)
);

create table if not exists clinical_monthly_order_items (
  id text primary key,
  monthly_order_id text not null references clinical_monthly_orders(id) on delete cascade,
  pac_item_id text references clinical_pac_items(id) on delete set null,
  product_id text references productos_insumos(id),
  code text,
  product text not null,
  category text,
  stock_current_snapshot real not null default 0,
  stock_min_snapshot real not null default 0,
  avg_daily_consumption_snapshot real not null default 0,
  expected_monthly_consumption real not null default 0,
  pac_monthly real not null default 0,
  suggested_order real not null default 0,
  final_order real not null default 0,
  unit_price real not null default 0,
  total real not null default 0,
  risk text,
  observation text,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now'))
);

create table if not exists clinical_real_order_imports (
  id text primary key,
  year integer not null,
  month integer not null,
  pac_year_id text references clinical_pac_years(id) on delete set null,
  monthly_order_id text references clinical_monthly_orders(id) on delete set null,
  filename text,
  row_count integer not null default 0,
  imported_by text not null default 'local-admin',
  created_at text not null default (datetime('now'))
);

create table if not exists clinical_real_order_items (
  id text primary key,
  real_order_import_id text not null references clinical_real_order_imports(id) on delete cascade,
  product_id text references productos_insumos(id),
  pac_item_id text references clinical_pac_items(id) on delete set null,
  monthly_order_item_id text references clinical_monthly_order_items(id) on delete set null,
  code text,
  product text not null,
  quantity real not null default 0,
  unit_price real not null default 0,
  total real not null default 0,
  comparison text not null default '{}',
  validations text not null default '[]',
  created_at text not null default (datetime('now'))
);

create table if not exists clinical_budget_snapshots (
  id text primary key,
  pac_year_id text not null references clinical_pac_years(id) on delete cascade,
  monthly_order_id text references clinical_monthly_orders(id) on delete set null,
  year integer not null,
  month integer,
  approved_budget real not null default 0,
  requested_budget real not null default 0,
  pac_total_valued real not null default 0,
  order_total_valued real not null default 0,
  available_budget real not null default 0,
  snapshot_data text not null default '{}',
  created_by text not null default 'local-admin',
  created_at text not null default (datetime('now'))
);

create table if not exists clinical_daily_demands (
  id text primary key,
  demand_date text not null,
  filename text,
  uploaded_by text not null default 'local-admin',
  status text not null default 'cargada',
  observations text,
  total_patients real not null default 0,
  diet_special_total real not null default 0,
  enteral_total integer not null default 0,
  supply_total integer not null default 0,
  warning_count integer not null default 0,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now'))
);

create table if not exists clinical_daily_diet_counts (
  id text primary key,
  daily_demand_id text not null references clinical_daily_demands(id) on delete cascade,
  demand_date text not null,
  diet_type text not null,
  quantity real not null default 0,
  source_sheet text,
  observation text,
  created_at text not null default (datetime('now'))
);

create table if not exists clinical_daily_enteral_items (
  id text primary key,
  daily_demand_id text not null references clinical_daily_demands(id) on delete cascade,
  demand_date text not null,
  patient_ref text,
  product_formula text not null,
  volume real not null default 0,
  unit text,
  schedule text,
  route text,
  observation text,
  created_at text not null default (datetime('now'))
);

create table if not exists clinical_daily_supply_items (
  id text primary key,
  daily_demand_id text not null references clinical_daily_demands(id) on delete cascade,
  demand_date text not null,
  product_supply text not null,
  quantity real not null default 0,
  unit text,
  service text,
  observation text,
  created_at text not null default (datetime('now'))
);

create table if not exists clinical_daily_import_errors (
  id text primary key,
  daily_demand_id text not null references clinical_daily_demands(id) on delete cascade,
  file_name text,
  sheet_name text,
  row_number integer,
  cell_ref text,
  warning_type text,
  severity text not null default 'media',
  message text not null,
  suggested_action text,
  status text not null default 'pendiente',
  reviewed_at text,
  reviewed_by text,
  created_at text not null default (datetime('now'))
);

create table if not exists clinical_product_links (
  id text primary key,
  source_type text not null default 'pac',
  source_record_id text,
  source_code text,
  source_name text not null default '',
  source_category text not null default '',
  normalized_code text not null default '',
  normalized_name text not null default '',
  pac_year_id text references clinical_pac_years(id) on delete cascade,
  pac_item_id text references clinical_pac_items(id) on delete set null,
  pac_codigo text,
  pac_producto text not null default '',
  producto_id text references productos_insumos(id) on delete set null,
  match_status text not null default 'pendiente',
  match_confidence real not null default 0,
  match_method text,
  ignored integer not null default 0,
  confirmed_by text,
  confirmed_at text,
  created_by text not null default 'local-admin',
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now')),
  unique (source_type, normalized_code, normalized_name, source_category, created_by)
);

create table if not exists clinical_demand_product_links (
  id text primary key,
  detected_name text not null,
  detected_type text not null,
  producto_id text references productos_insumos(id) on delete set null,
  match_status text not null default 'vinculado',
  match_confidence real not null default 0,
  match_method text,
  ignored integer not null default 0,
  created_by text not null default 'local-admin',
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now')),
  unique (detected_name, detected_type, created_by)
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
create index if not exists idx_daily_tasks_due_date on daily_tasks(due_date);
create index if not exists idx_daily_tasks_status on daily_tasks(status);
create index if not exists idx_daily_tasks_assigned_to on daily_tasks(assigned_to);
create index if not exists idx_clinical_pac_items_pac_year on clinical_pac_items(pac_year_id);
create index if not exists idx_clinical_monthly_orders_year_month on clinical_monthly_orders(year, month);
create index if not exists idx_clinical_order_items_order on clinical_monthly_order_items(monthly_order_id);
create index if not exists idx_clinical_real_imports_year_month on clinical_real_order_imports(year, month);
create index if not exists idx_clinical_real_items_import on clinical_real_order_items(real_order_import_id);
create index if not exists idx_clinical_daily_demands_date on clinical_daily_demands(demand_date);
create index if not exists idx_clinical_daily_demands_uploaded_by on clinical_daily_demands(uploaded_by);
create index if not exists idx_clinical_daily_import_errors_status on clinical_daily_import_errors(status);
create index if not exists idx_clinical_product_links_user on clinical_product_links(created_by);
create index if not exists idx_clinical_demand_product_links_user on clinical_demand_product_links(created_by);

drop view if exists inventario_lotes_disponibles;
create view inventario_lotes_disponibles as
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
  l.cantidad_por_caja,
  coalesce(sum(case when m.tipo_movimiento in ('ingreso', 'ajuste_manual') then m.cantidad else 0 end), 0) as ingresos,
  coalesce(sum(case when m.tipo_movimiento = 'consumo' then m.cantidad else 0 end), 0) as consumos,
  coalesce(sum(case when m.tipo_movimiento in ('merma', 'vencimiento', 'eliminacion') then m.cantidad else 0 end), 0) as mermas,
  coalesce(sum(case when m.tipo_movimiento in ('ingreso', 'ajuste_manual') then m.cantidad else 0 end), 0)
    - coalesce(sum(case when m.tipo_movimiento = 'consumo' then m.cantidad else 0 end), 0)
    - coalesce(sum(case when m.tipo_movimiento in ('merma', 'vencimiento', 'eliminacion') then m.cantidad else 0 end), 0)
    as cantidad_disponible,
  case
    when l.fecha_vencimiento is null then 'sin_fecha'
    when date(l.fecha_vencimiento) < date('now', 'localtime') then 'vencido'
    when date(l.fecha_vencimiento) = date('now', 'localtime') then 'vence_hoy'
    when date(l.fecha_vencimiento) <= date('now', 'localtime', '+20 days') then 'vence_1_a_20_dias'
    else 'vigente'
  end as estado_vencimiento,
  case
    when l.fecha_vencimiento is null then null
    else cast(julianday(date(l.fecha_vencimiento)) - julianday(date('now', 'localtime')) as integer)
  end as dias_restantes,
  l.alerta_vencimiento_revisada,
  l.activo,
  l.sucursal_id,
  l.deleted_at,
  p.stock_minimo,
  p.consumo_promedio_diario,
  p.critico,
  p.favorito
from insumo_lotes l
join productos_insumos p on p.id = l.producto_id
left join movimientos_inventario m on m.lote_id = l.id
group by l.id, p.id;

drop view if exists alertas_vencimiento;
create view alertas_vencimiento as
select *
from inventario_lotes_disponibles
where cantidad_disponible > 0
  and deleted_at is null
  and activo = 1
  and fecha_vencimiento is not null
  and estado_vencimiento in ('vencido', 'vence_hoy', 'vence_1_a_20_dias')
order by fecha_vencimiento asc;

drop view if exists alertas_stock_minimo;
create view alertas_stock_minimo as
select
  p.id as producto_id,
  p.nombre,
  p.unidad_default,
  p.stock_minimo,
  coalesce(sum(case when i.cantidad_disponible > 0 then i.cantidad_disponible else 0 end), 0) as stock_actual,
  p.stock_minimo - coalesce(sum(case when i.cantidad_disponible > 0 then i.cantidad_disponible else 0 end), 0) as faltante
from productos_insumos p
left join inventario_lotes_disponibles i on i.producto_id = p.id and i.activo = 1 and i.deleted_at is null
where p.activo = 1 and p.deleted_at is null
group by p.id
having p.stock_minimo > 0
   and coalesce(sum(case when i.cantidad_disponible > 0 then i.cantidad_disponible else 0 end), 0) < p.stock_minimo;

drop view if exists historial_movimientos_inventario;
create view historial_movimientos_inventario as
select
  m.id,
  m.producto_id,
  m.lote_id,
  m.fecha_movimiento,
  p.nombre as producto,
  l.lote,
  l.fecha_vencimiento,
  m.tipo_movimiento,
  m.cantidad,
  m.unidad,
  m.motivo,
  m.observacion,
  m.desviacion_fifo,
  m.lote_recomendado_id,
  m.usuario_id,
  m.created_at
from movimientos_inventario m
left join productos_insumos p on p.id = m.producto_id
left join insumo_lotes l on l.id = m.lote_id;
