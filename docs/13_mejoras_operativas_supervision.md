# Mejoras Operativas de Supervision

## SQL requerido

Ejecutar en Supabase:

```sql
alter table productos_insumos
add column if not exists consumo_promedio_diario numeric not null default 0;

alter table productos_insumos
add column if not exists favorito boolean not null default false;
```

Archivo incluido:

```sql
supabase/11_productos_operacion_rapida.sql
```

## Stock minimo editable

El stock minimo se edita desde el producto maestro, no desde el lote.

Campos:

- stock minimo
- unidad default
- consumo promedio diario
- producto critico
- producto favorito

## Dias de cobertura

Formula:

```text
dias_cobertura = stock_actual_total / consumo_promedio_diario
```

Si `consumo_promedio_diario` es 0, se muestra:

```text
Sin consumo configurado
```

## Productos rapidos

Los productos con `favorito = true` aparecen como botones rapidos.

Al presionar un favorito, se abre **Stock consumido** con el producto precargado.

## Consumo rapido

Cada lote muestra botones:

- Usar 1
- Usar 5
- Usar 10

Primera version:

- abre el modal **Stock consumido**
- precarga producto y cantidad
- no registra directo

## Modo pantalla

Oculta acciones y tablas de detalle para dejar visibles:

- dashboard
- productos criticos
- usar primero
- vencimientos principales

## Mini analytics

Calcula ultimos 30 dias desde `movimientos_inventario`:

- mas consumidos
- mas ajustes
- mas mermas
- mas desviaciones FIFO

## Backup CSV

Genera CSV separados para:

- inventario
- productos
- movimientos
- criticos
