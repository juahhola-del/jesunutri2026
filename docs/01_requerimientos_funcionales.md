# PROYECTO JESU - REQUERIMIENTOS FUNCIONALES CONSOLIDADOS

## 1. Objetivo general

Construir un modulo de inventario conectado a Supabase/PostgreSQL que permita:
- Control de insumos.
- Control por lotes.
- Fechas de vencimiento.
- Alertas automaticas.
- Metodo FIFO.
- Historial completo de movimientos.
- Importacion desde foto o Excel.
- Ingreso rapido masivo.
- Base futura para costos, recetas y produccion.

El sistema debe estar optimizado para uso real de bodega, con interfaz rapida, clara y operativa tipo ERP.

## 2. Principio de stock
El sistema nunca debe depender de editar cantidades disponibles manualmente.
La fuente de verdad debe ser movimientos_inventario.

Toda modificacion de stock debe quedar registrada como movimiento:
- ingreso
- consumo
- ajuste_manual
- merma
- vencimiento
- eliminacion

## 3. Control de insumos
Cada insumo debe existir en un catalogo maestro llamado productos_insumos.
Los ingresos no deben guardar solo texto libre: deben relacionarse con producto_id.

### El catalogo debe permitir
- Crear productos.
- Editar nombre, categoria, unidad default y stock minimo.
- Desactivar productos sin perder historial.
- Evitar duplicados usando nombre_normalizado.

## 4. Control por lotes
Cada ingreso distinto debe crear un lote separado.

### Un lote se considera distinto si cambia
- producto
- fecha vencimiento
- fecha recepcion
- lote
- proveedor
- costo_unitario

El mismo insumo puede tener multiples lotes activos al mismo tiempo.

## 5. Alertas automaticas de vencimiento
El sistema debe detectar automaticamente lotes con vencimiento en 20 dias o menos.

### La alerta debe mostrar
- producto
- cantidad disponible
- unidad
- fecha vencimiento
- dias restantes
- lote
- proveedor
- observaciones
- fecha recepcion
- estado visual
- marca de revisada

### Estados
- vencido
- vence hoy
- vence en 1 a 20 dias
- vigente
- sin fecha

### Colores recomendados
- rojo: vencido
- amarillo: vence hoy
- naranjo: vence en 1 a 20 dias
- verde: vigente
- gris: sin fecha

### Accion
- Permitir marcar alerta como revisada.
- Revisar una alerta NO elimina, NO oculta del inventario y NO modifica stock.

## 6. Stock minimo
Cada producto debe tener stock_minimo configurable.
Si la cantidad disponible total baja de ese minimo, debe aparecer alerta automatica.

### La alerta debe mostrar
- producto
- stock actual
- stock minimo
- faltante
- unidad default

## 7. Cantidad disponible automatica
La cantidad disponible debe calcularse desde movimientos.

### Formula base
disponible = ingresos - consumos - mermas

### Donde mermas incluye
- merma
- vencimiento retirado de stock
- eliminacion logica con impacto en stock
- ajustes manuales negativos, si se implementan

## 8. FIFO
Al consumir insumos, el sistema debe descontar primero el lote que vence antes.
Si ese lote no alcanza, debe continuar con el siguiente.
Los lotes sin vencimiento deben quedar al final.

Cada lote afectado por un consumo debe generar su propio movimiento.

## 9. Selector predictivo
El campo Insumo debe permitir escribir letras o parte del nombre y mostrar sugerencias automaticamente.

### Debe buscar por
- nombre
- nombre_normalizado

### Debe permitir
- Seleccionar producto existente.
- Crear producto nuevo si no existe.
- Evitar duplicados.
- Advertir productos parecidos.
- Sugerir aunque el usuario escriba sin tilde.

### Ejemplos
- h -> Harina, Harina integral, Harina fuerza.
- az -> Azucar, Azucar flor, Azucar granulada.

## 10. Fechas rapidas

### Los campos de fecha deben aceptar

## - 01122026

## - 011226

## - 01/12/2026

## - 01-12-2026

## - 01.12.2026

Mientras el usuario escribe, el campo debe formatear visualmente:

## 01122026 -> 01-12-2026

### Formato visual
DD-MM-YYYY

### Formato base de datos
YYYY-MM-DD

### Validaciones
- dia valido
- mes valido
- ano valido
- anos bisiestos
- rechazar fechas imposibles como 32132026
- mostrar error claro

## 11. Modo ingreso masivo
Debe existir una pantalla tipo tabla rapida para cargar varias filas sin salir.

### Columnas
- producto
- cantidad
- unidad
- fecha vencimiento
- lote
- observacion

### Comportamiento
- Enter avanza al siguiente campo.
- Enter al final de fila crea una nueva fila.
- Tab mantiene navegacion natural.
- Filas invalidas muestran error sin borrar datos.

## 12. Importacion desde foto y Excel
Debe existir flujo de carga desde foto o Excel.

### Flujo
- subir imagen o Excel
- OCR o lectura del archivo
- detectar filas
- normalizar productos y fechas
- mostrar borrador editable
- corregir errores
- confirmar

### Regla critica
Nunca guardar automaticamente una importacion en inventario.
Solo al confirmar se deben crear productos, lotes y movimientos de ingreso.

## 13. Dashboard

### Debe mostrar
- total insumos
- productos vencidos
- proximos a vencer
- bajo stock
- valor inventario futuro
- alertas de vencimiento
- alertas de bajo stock
- ultimos movimientos

## 14. Preparacion futura

### La estructura debe dejar preparada la base para
- costos
- recetas
- produccion
- descuentos automaticos
- WhatsApp alertas
- multi sucursal
- timeline por lote
- OCR inteligente
- consumo automatico por receta
- reportes
- auditoria avanzada
- trazabilidad total
