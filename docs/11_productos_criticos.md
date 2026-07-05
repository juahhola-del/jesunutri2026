# Productos Criticos

Productos criticos son insumos que no pueden faltar, como huevo, carne o pollo.

Campo nuevo:

```sql
alter table productos_insumos
add column if not exists critico boolean not null default false;
```

Reglas:

- El atributo critico pertenece al producto maestro, no al lote.
- Si el producto ya existe y se marca critico, se actualiza `productos_insumos.critico = true`.
- Si el producto ya era critico y en un ingreso no se marca, no se desmarca automaticamente.
- El calculo de stock critico suma todos los lotes activos con cantidad disponible.

UI:

- Seccion compacta Productos criticos cerca del dashboard superior.
- Estado OK, Bajo stock o Sin stock.
- Si `stock_minimo` es 0, mostrar advertencia de configuracion.
