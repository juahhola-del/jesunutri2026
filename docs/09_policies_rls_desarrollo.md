# Policies RLS de Desarrollo

Para desarrollo, si Supabase tiene Row Level Security activo, el rol `anon` necesita policies temporales de `select` e `insert` para poder probar el flujo web sin usar `service_role`.

Tablas requeridas:

- `productos_insumos`
- `insumo_lotes`
- `movimientos_inventario`

Estas policies son solo para desarrollo. Antes de produccion deben reemplazarse por reglas por usuario autenticado, rol y sucursal.

SQL sugerido:

```sql
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
```

## Nota para editar y eliminar ingresos

Las mejoras operativas de edicion, marcar alertas revisadas y eliminacion logica requieren tambien `update` temporal sobre `insumo_lotes` durante desarrollo.

```sql
create policy "dev anon update insumo_lotes"
on insumo_lotes
for update
to anon
using (true)
with check (true);
```

## Nota para productos criticos

Marcar un producto existente como critico requiere `update` temporal sobre `productos_insumos` durante desarrollo.

```sql
create policy "dev anon update productos_insumos"
on productos_insumos
for update
to anon
using (true)
with check (true);
```
