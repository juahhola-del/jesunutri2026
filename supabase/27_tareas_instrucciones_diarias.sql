-- JESUnutri - Tareas / Instrucciones Diarias.
-- Ejecutar en Supabase SQL Editor para persistir el checklist diario.

create table if not exists daily_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text null,
  scheduled_time time null,
  due_date date null,
  recurrence_type text not null default 'diaria'
    check (recurrence_type in ('diaria', 'puntual', 'semanal', 'mensual')),
  priority text not null default 'media'
    check (priority in ('alta', 'media', 'baja')),
  assigned_to text not null default 'equipo'
    check (assigned_to in ('nutricionista', 'alumna', 'equipo', 'otro')),
  status text not null default 'pendiente'
    check (status in ('pendiente', 'en_proceso', 'completada', 'no_realizada')),
  notes text null,
  created_by uuid null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz null
);

create index if not exists idx_daily_tasks_due_date on daily_tasks(due_date);
create index if not exists idx_daily_tasks_status on daily_tasks(status);
create index if not exists idx_daily_tasks_assigned_to on daily_tasks(assigned_to);
create index if not exists idx_daily_tasks_created_by on daily_tasks(created_by);

alter table daily_tasks enable row level security;

drop policy if exists "authenticated select daily_tasks" on daily_tasks;
drop policy if exists "authenticated insert daily_tasks" on daily_tasks;
drop policy if exists "authenticated update daily_tasks" on daily_tasks;
drop policy if exists "authenticated delete daily_tasks" on daily_tasks;

create policy "authenticated select daily_tasks"
on daily_tasks
for select
to authenticated
using (true);

create policy "authenticated insert daily_tasks"
on daily_tasks
for insert
to authenticated
with check (created_by = auth.uid() or created_by is null);

create policy "authenticated update daily_tasks"
on daily_tasks
for update
to authenticated
using (true)
with check (true);

create policy "authenticated delete daily_tasks"
on daily_tasks
for delete
to authenticated
using (true);
