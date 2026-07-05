# PROYECTO JESU - FLUJOS Y PANTALLAS OPERATIVAS

## 1. Estilo general
Frontend rapido, claro y operativo tipo ERP.

### Debe estar optimizado para uso real de bodega
- pocos pasos
- teclado fluido
- tablas densas y legibles
- alertas visibles
- busqueda rapida
- confirmaciones claras

## 2. Dashboard

### Indicadores superiores
- total insumos activos
- productos vencidos
- proximos a vencer
- bajo stock
- valor inventario futuro

### Paneles
- alertas vencimiento
- bajo stock
- ultimos movimientos

### Acciones rapidas
- ingreso rapido
- ingreso masivo
- consumir insumo
- registrar merma
- importar Excel
- importar foto

## 3. Catalogo maestro
Pantalla productos_insumos.

### Columnas
- nombre
- categoria
- unidad default
- stock minimo
- activo
- updated_at

### Acciones
- crear
- editar
- desactivar
- ver lotes
- ver movimientos

## 4. Ingreso rapido individual

### Campos
- insumo con selector predictivo
- cantidad
- unidad
- fecha recepcion
- fecha vencimiento
- lote
- proveedor
- costo unitario
- observaciones

### Al guardar
- crear producto si corresponde y fue confirmado
- crear lote
- crear movimiento tipo ingreso

## 5. Ingreso masivo
Tabla editable.

### Columnas
- producto
- cantidad
- unidad
- fecha vencimiento
- lote
- observacion

### Comportamiento teclado
- Enter avanza al siguiente campo.
- Enter al final crea nueva fila.
- Tab funciona de forma natural.
- Esc cancela edicion del campo actual, no borra la fila.

### Validaciones visuales
- producto obligatorio
- cantidad mayor a cero
- fecha valida si existe
- unidad obligatoria o autocompletada

### Guardar masivo
- validar todas las filas
- mostrar errores por fila
- guardar solo filas validas si se define guardado parcial, o bloquear hasta corregir si se prefiere politica estricta

## 6. Consumo FIFO

### Campos
- producto
- cantidad
- unidad
- motivo
- observacion

### Antes de confirmar
- mostrar stock disponible
- mostrar lotes que se descontaran
- mostrar fecha vencimiento de cada lote

### Al confirmar
- crear movimientos tipo consumo por lote afectado

## 7. Merma

### Campos
- producto
- lote opcional
- cantidad
- unidad
- motivo
- observacion

### Puede usar
- seleccion manual de lote
- FIFO si no se selecciona lote

## 8. Vencimiento retirado

### Flujo para retirar stock vencido
- listar lotes vencidos con stock disponible
- seleccionar lote(s)
- confirmar retiro
- crear movimiento tipo vencimiento

## 9. Importacion Excel

### Flujo
- subir archivo
- leer columnas
- mapear columnas
- crear borrador
- mostrar tabla editable
- validar
- confirmar

## 10. Importacion foto

### Flujo
- subir imagen
- OCR o servicio externo
- detectar filas candidatas
- crear borrador
- revisar y corregir
- confirmar

## 11. Historial de movimientos

### Filtros
- producto
- lote
- tipo movimiento
- fecha desde/hasta
- usuario

### Columnas
- fecha
- producto
- lote
- tipo
- cantidad
- unidad
- motivo
- observacion
- usuario
- ip
- dispositivo

## 12. Timeline por lote, futuro

### Vista de trazabilidad completa
- fecha recepcion
- movimientos de ingreso
- consumos parciales
- mermas
- vencimientos
- eliminaciones
- usuario responsable
