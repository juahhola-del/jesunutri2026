# Ajuste, Historial, Exportacion y Etiquetas

## Ajuste de inventario

El boton **Ajuste inventario** permite corregir el stock real contado sin editar cantidades directas.

Reglas implementadas:

- Si el stock real es menor que el stock del sistema, se registra un movimiento de salida por la diferencia.
- Si el motivo es merma, queda como `merma`.
- Si el stock real es mayor, se registra un movimiento `ajuste_manual` positivo.
- El stock se recalcula desde `movimientos_inventario`.
- Despues de guardar se recarga inventario, dashboard, alertas e historial.

Mensaje de exito:

- `Ajustadito.`

## SQL necesario

Para que los ajustes positivos se reflejen en la vista de stock, ejecutar:

```sql
supabase/10_ajustes_historial_export.sql
```

Ese archivo actualiza:

- `inventario_lotes_disponibles`
- `alertas_vencimiento`
- `alertas_stock_minimo`
- `historial_movimientos_inventario`

## Historial

La seccion **Historial** muestra movimientos registrados con filtros por:

- producto
- tipo de movimiento
- fecha desde
- fecha hasta

Tipos contemplados:

- `ingreso`
- `consumo`
- `ajuste_manual`
- `merma`
- `vencimiento`
- `eliminacion`

Si un movimiento trae `desviacion_fifo = true`, se muestra el badge **Desviacion FIFO**.

## Exportacion CSV

El boton **Exportar** permite descargar CSV de:

- inventario actual
- productos criticos
- alertas de vencimiento
- historial movimientos

## Etiquetas imprimibles

El boton **Etiquetas** permite seleccionar lotes activos con stock disponible y generar una vista imprimible.

Cada etiqueta muestra:

- producto
- lote
- fecha de vencimiento
- mes/año con color operativo
- cantidad disponible
- unidad

## Usar primero

El panel **Usar primero** muestra lotes:

- vencidos
- que vencen hoy
- proximos a vencer

Se ordenan por fecha de vencimiento ascendente para apoyar rotacion FIFO visual.
