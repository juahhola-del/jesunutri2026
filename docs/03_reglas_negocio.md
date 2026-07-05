# PROYECTO JESU - REGLAS DE NEGOCIO CONSOLIDADAS

## 1. Fuente de verdad
La fuente de verdad del inventario es movimientos_inventario.
No se debe editar cantidad_disponible directamente.

## 2. Calculo de disponible

### Formula base
disponible = ingresos - consumos - mermas

### Ingresos
- movimientos tipo ingreso.
- ajustes manuales positivos si se implementan como entrada.

### Consumos
- movimientos tipo consumo.

### Mermas/salidas
- merma
- vencimiento
- eliminacion
- ajustes manuales negativos si se implementan como salida.

## 3. Normalizacion de nombres

### Para evitar duplicados
- convertir a minusculas
- quitar tildes
- quitar espacios dobles
- recortar espacios al inicio y final
- quitar puntuacion no significativa si aplica

### Ejemplos
- Azucar -> azucar
- AzÃºcar -> azucar
- Harina   fuerza -> harina fuerza

## 4. Selector predictivo
Debe buscar por nombre visible y nombre_normalizado.
Debe sugerir productos aunque el usuario no escriba tildes.

### Antes de crear un producto nuevo
- normalizar nombre ingresado
- buscar coincidencia exacta en nombre_normalizado
- buscar coincidencias parciales cercanas
- advertir si existe producto parecido

## 5. Fechas rapidas

### Formatos aceptados

## - 01122026

## - 011226

## - 01/12/2026

## - 01-12-2026

## - 01.12.2026

### Regla visual
- mostrar DD-MM-YYYY

### Regla base de datos
- guardar YYYY-MM-DD

### Validaciones
- dia real del mes
- mes entre 1 y 12
- ano valido
- bisiestos
- rechazar fechas imposibles

### Ano corto
- 011226 se interpreta como 01-12-2026.
- Para vencimientos se recomienda interpretar YY como 20YY.

## 6. Lotes separados

### Cada ingreso crea lote separado si cambia
- producto
- fecha vencimiento
- fecha recepcion
- lote
- proveedor
- costo_unitario

## 7. FIFO

### Al consumir
- Validar producto activo.
- Calcular disponible total.
- Bloquear si no hay stock suficiente, salvo politica especial.
- Buscar lotes activos con disponible mayor que cero.
- Ordenar por fecha_vencimiento ascendente.
- Lotes sin fecha vencimiento al final.
- Crear movimiento de consumo por cada lote usado.

## 8. Vencimientos
Un lote vencido no desaparece automaticamente.
Debe mostrarse como vencido.
Si se retira del stock utilizable, crear movimiento tipo vencimiento.

## 9. Alertas revisadas
Marcar una alerta como revisada solo cambia alerta_vencimiento_revisada.
No modifica stock.
No borra el lote.
No elimina historial.

## 10. Stock minimo
Se calcula por producto, sumando lotes activos con disponible mayor que cero.
Si stock_total < stock_minimo, crear alerta visual.

## 11. Importaciones
Una importacion desde foto o Excel siempre debe entrar como borrador.
Nunca debe guardar automaticamente en inventario.

### Solo al confirmar
- crear productos nuevos aprobados
- crear lotes
- crear movimientos de ingreso

## 12. Ingreso masivo
Las filas invalidas deben conservar los datos ingresados.
El usuario corrige sin perder informacion.

## 13. Soft delete
Nunca borrar fisicamente productos, lotes o registros con historial.

### Usar
- activo = false
- deleted_at
- deleted_by

Si una eliminacion afecta stock disponible, crear movimiento tipo eliminacion.

## 14. Auditoria
Movimientos deben registrar, cuando sea posible:
- usuario_id
- fecha_movimiento
- ip
- dispositivo
- motivo
- observacion

## 15. Unidades
El sistema debe operar inicialmente con unidad declarada por lote/movimiento.
Las conversiones kg/g y lt/ml quedan preparadas para futuro.
No mezclar unidades incompatibles sin conversion configurada.
