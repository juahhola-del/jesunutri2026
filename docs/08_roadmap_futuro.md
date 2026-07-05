# PROYECTO JESU - ROADMAP FUTURO

## 1. Costos
Base ya preparada con costo_unitario en insumo_lotes.

### Permitira
- valor estimado de inventario
- costo historico de consumo
- costo de merma
- costo por receta
- margen y rentabilidad

## 2. Recetas
Tabla preparada: recetas_producto.

### Permitira
- definir producto final
- definir insumos usados
- cantidades por insumo
- consumo automatico al producir
- calculo de costo teorico

## 3. Produccion

### Modulo futuro
- ordenes de produccion
- consumo automatico FIFO por receta
- rendimiento real vs teorico
- mermas de produccion
- trazabilidad del lote producido

## 4. Automatizaciones

### Futuras alertas
- WhatsApp cuando haya productos vencidos
- WhatsApp cuando haya productos por vencer
- correo diario de resumen
- alerta de stock minimo
- tareas programadas de cierre diario

## 5. OCR inteligente

### Importacion desde foto puede crecer a
- lectura de boletas/facturas
- deteccion automatica de columnas
- sugerencia de proveedor
- deteccion de lote y vencimiento
- aprendizaje desde correcciones

## 6. Reportes

### Reportes futuros
- inventario actual
- vencimientos por rango
- consumo por periodo
- merma por producto
- movimientos por usuario
- valorizacion de inventario
- productos con mayor rotacion
- stock critico

## 7. Auditoria avanzada

### Futuro
- bitacora de cambios por tabla
- aprobaciones para ajustes manuales
- comentarios por movimiento
- bloqueo de ediciones sensibles
- exportacion para revision

## 8. Timeline por lote

### Vista futura donde se vea toda la vida de un lote
- ingreso
- alertas
- consumos
- mermas
- vencimiento
- eliminacion logica

## 9. Multi sucursal
Preparado con sucursal_id futuro.

### Permitira
- stock por sucursal
- transferencias entre sucursales
- alertas por sucursal
- dashboard por sucursal o consolidado

## 10. Cache operativo

### Cuando crezca el volumen
- mantener movimientos como fuente de verdad
- crear cache de inventario por lote
- crear cache de dashboard
- actualizar cache por triggers o jobs
- usar materialized views si conviene
