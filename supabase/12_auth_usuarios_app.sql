-- Control de acceso de Jesunutri con Supabase Auth.
-- Crear primero el usuario en Authentication -> Users.

create table if not exists usuarios_app (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  rol text not null default 'operador',
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

insert into usuarios_app (id, email, rol, activo)
select
  u.id,
  u.email,
  'admin',
  true
from auth.users u
where lower(u.email) = 'jesu@nutri.cl'
on conflict (id) do update set
  email = excluded.email,
  rol = 'admin',
  activo = true;

alter table usuarios_app enable row level security;

drop policy if exists "usuarios_app self select" on usuarios_app;

create policy "usuarios_app self select"
on usuarios_app
for select
to authenticated
using (auth.uid() = id);
