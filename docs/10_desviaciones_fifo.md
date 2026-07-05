# Desviaciones FIFO

El modulo Registrar uso descuenta por defecto usando FIFO automatico por fecha de vencimiento.

Si el operador usa la opcion avanzada Usar lote especifico y elige un lote distinto al recomendado, el sistema exige motivo y registra trazabilidad en `movimientos_inventario`.

Campos nuevos requeridos:

- `desviacion_fifo boolean default false`
- `lote_recomendado_id uuid references insumo_lotes(id)`

Vista de supervision:

- `desviaciones_fifo`

Muestra:

- fecha
- producto
- lote recomendado
- lote usado
- usuario
- motivo
- observacion

Ejecutar migracion:

```sql
supabase/08_fifo_desviaciones.sql
```
