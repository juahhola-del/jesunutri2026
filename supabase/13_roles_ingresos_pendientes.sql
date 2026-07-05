-- Roles y aprobaciones para ingresos pendientes.
-- Crear usuarios en Supabase Auth antes de insertarlos en usuarios_app.

create table if not exists usuarios_app (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  nombre text,
  rol text not null default 'operador',
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table usuarios_app
  add column if not exists nombre text;

insert into usuarios_app (id, email, nombre, rol, activo)
select
  u.id,
  u.email,
  'Jesu',
  'admin',
  true
from auth.users u
where lower(u.email) = 'jesu@nutri.cl'
on conflict (id) do update set
  email = excluded.email,
  nombre = excluded.nombre,
  rol = 'admin',
  activo = true;

create table if not exists ingresos_pendientes (
  id uuid primary key default gen_random_uuid(),
  creado_por uuid references auth.users(id) on delete set null,
  creado_por_email text,
  creado_por_nombre text,
  estado text not null default 'pendiente',
  fecha_recepcion date not null default current_date,
  observacion_general text,
  aprobado_por uuid references auth.users(id) on delete set null,
  aprobado_por_email text,
  aprobado_at timestamptz,
  rechazado_por uuid references auth.users(id) on delete set null,
  rechazado_por_email text,
  rechazado_at timestamptz,
  motivo_rechazo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ingresos_pendientes_estado_check check (estado in ('pendiente', 'aprobado', 'rechazado'))
);

create table if not exists ingresos_pendientes_detalle (
  id uuid primary key default gen_random_uuid(),
  ingreso_pendiente_id uuid not null references ingresos_pendientes(id) on delete cascade,
  nombre text not null,
  nombre_normalizado text not null,
  cantidad numeric not null check (cantidad > 0),
  unidad text not null,
  fecha_vencimiento date,
  lote text,
  critico boolean not null default false,
  observaciones text,
  created_at timestamptz not null default now()
);

create or replace function touch_ingresos_pendientes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_ingresos_pendientes_updated_at on ingresos_pendientes;
create trigger trg_ingresos_pendientes_updated_at
before update on ingresos_pendientes
for each row execute function touch_ingresos_pendientes_updated_at();

alter table usuarios_app enable row level security;
alter table ingresos_pendientes enable row level security;
alter table ingresos_pendientes_detalle enable row level security;

create or replace function public.is_current_user_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios_app u
    where u.id = auth.uid()
      and u.rol = 'admin'
      and u.activo = true
  );
$$;

drop policy if exists "usuarios_app self select" on usuarios_app;
drop policy if exists "usuarios_app admin select all" on usuarios_app;
drop policy if exists "ingresos pendientes insert own" on ingresos_pendientes;
drop policy if exists "ingresos pendientes select own" on ingresos_pendientes;
drop policy if exists "ingresos pendientes admin select all" on ingresos_pendientes;
drop policy if exists "ingresos pendientes admin update" on ingresos_pendientes;
drop policy if exists "ingresos detalle insert own pending" on ingresos_pendientes_detalle;
drop policy if exists "ingresos detalle select own" on ingresos_pendientes_detalle;
drop policy if exists "ingresos detalle admin all" on ingresos_pendientes_detalle;

create policy "usuarios_app self select"
on usuarios_app
for select
to authenticated
using (auth.uid() = id);

create policy "usuarios_app admin select all"
on usuarios_app
for select
to authenticated
using (public.is_current_user_admin());

create policy "ingresos pendientes insert own"
on ingresos_pendientes
for insert
to authenticated
with check (creado_por = auth.uid());

create policy "ingresos pendientes select own"
on ingresos_pendientes
for select
to authenticated
using (creado_por = auth.uid());

create policy "ingresos pendientes admin select all"
on ingresos_pendientes
for select
to authenticated
using (public.is_current_user_admin());

create policy "ingresos pendientes admin update"
on ingresos_pendientes
for update
to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

create policy "ingresos detalle insert own pending"
on ingresos_pendientes_detalle
for insert
to authenticated
with check (
  exists (
    select 1 from ingresos_pendientes ip
    where ip.id = ingreso_pendiente_id
      and ip.creado_por = auth.uid()
      and ip.estado = 'pendiente'
  )
);

create policy "ingresos detalle select own"
on ingresos_pendientes_detalle
for select
to authenticated
using (
  exists (
    select 1 from ingresos_pendientes ip
    where ip.id = ingreso_pendiente_id
      and ip.creado_por = auth.uid()
  )
);

create policy "ingresos detalle admin all"
on ingresos_pendientes_detalle
for all
to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

-- Policies necesarias para que usuarios autenticados usen el inventario existente.
-- Operador solo lee catalogo para sugerencias; admin administra inventario real.
drop policy if exists "authenticated select productos_insumos" on productos_insumos;
drop policy if exists "admin all productos_insumos" on productos_insumos;
drop policy if exists "admin all insumo_lotes" on insumo_lotes;
drop policy if exists "admin all movimientos_inventario" on movimientos_inventario;

create policy "authenticated select productos_insumos"
on productos_insumos
for select
to authenticated
using (activo = true and deleted_at is null);

create policy "admin all productos_insumos"
on productos_insumos
for all
to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

create policy "admin all insumo_lotes"
on insumo_lotes
for all
to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

create policy "admin all movimientos_inventario"
on movimientos_inventario
for all
to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

insert into usuarios_app (id, email, nombre, rol, activo)
select
  u.id,
  u.email,
  datos.nombre,
  datos.rol,
  true
from (
  values
    ('juancarlos@bod.cl', 'Juan Carlos', 'operador'),
    ('patricia@bod.cl', 'Patricia', 'operador')
) as datos(email, nombre, rol)
join auth.users u on lower(u.email) = datos.email
on conflict (id) do update set
  email = excluded.email,
  nombre = excluded.nombre,
  rol = excluded.rol,
  activo = excluded.activo;
