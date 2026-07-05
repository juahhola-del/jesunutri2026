-- Policies RLS temporales para desarrollo.
-- No usar tal cual en produccion.
-- Permiten probar la web estatica con anon key sin service_role.

alter table productos_insumos enable row level security;
alter table insumo_lotes enable row level security;
alter table movimientos_inventario enable row level security;

create policy "dev anon select productos_insumos"
on productos_insumos
for select
to anon
using (true);

create policy "dev anon insert productos_insumos"
on productos_insumos
for insert
to anon
with check (true);

create policy "dev anon select insumo_lotes"
on insumo_lotes
for select
to anon
using (true);

create policy "dev anon insert insumo_lotes"
on insumo_lotes
for insert
to anon
with check (true);

create policy "dev anon select movimientos_inventario"
on movimientos_inventario
for select
to anon
using (true);

create policy "dev anon insert movimientos_inventario"
on movimientos_inventario
for insert
to anon
with check (true);

create policy "dev anon update insumo_lotes"
on insumo_lotes
for update
to anon
using (true)
with check (true);

create policy "dev anon update productos_insumos"
on productos_insumos
for update
to anon
using (true)
with check (true);
