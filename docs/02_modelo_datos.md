# PROYECTO JESU - MODELO DE DATOS CONSOLIDADO

Base recomendada: Supabase/PostgreSQL.
Formato visual de fecha: DD-MM-YYYY.
Formato en base de datos: YYYY-MM-DD.

## 1. productos_insumos
Catalogo maestro de productos o insumos.

### Campos
- id: uuid primary key
- nombre: text not null
- nombre_normalizado: text not null unique
- categoria: text null
- unidad_default: text null
- stock_minimo: numeric default 0
- activo: boolean default true
- deleted_at: timestamptz null
- deleted_by: uuid null
- created_at: timestamptz default now()
- updated_at: timestamptz default now()

### Reglas
- nombre_normalizado evita duplicados.
- activo permite desactivar sin perder historial.
- deleted_at y deleted_by permiten soft delete.
- No borrar fisicamente productos con historial.

## 2. insumo_lotes
Cada ingreso distinto crea un lote separado.

### Campos
- id: uuid primary key
- producto_id: uuid not null references productos_insumos(id)
- fecha_recepcion: date not null
- fecha_vencimiento: date null
- lote: text null
- proveedor: text null
- unidad: text not null
- costo_unitario: numeric null
- observaciones: text null
- alerta_vencimiento_revisada: boolean default false
- activo: boolean default true
- sucursal_id: uuid null, futuro
- deleted_at: timestamptz null
- deleted_by: uuid null
- created_at: timestamptz default now()
- updated_at: timestamptz default now()

### Reglas

### Un lote es distinto si cambia
- producto_id
- fecha_vencimiento
- fecha_recepcion
- lote
- proveedor
- costo_unitario

## 3. movimientos_inventario
Fuente de verdad del stock.

### Campos
- id: uuid primary key
- producto_id: uuid not null references productos_insumos(id)
- lote_id: uuid null references insumo_lotes(id)
- tipo_movimiento: text not null
- cantidad: numeric not null
- unidad: text not null
- fecha_movimiento: timestamptz default now()
- usuario_id: uuid null
- motivo: text null
- observacion: text null
- ip: inet null
- dispositivo: text null
- created_at: timestamptz default now()

### Tipos
- ingreso
- consumo
- ajuste_manual
- merma
- vencimiento
- eliminacion

### Reglas
- Nunca modificar stock directo.
- Todo cambio debe crear movimiento.
- Los ingresos deben estar asociados a lote_id.
- Los consumos por FIFO deben crear un movimiento por cada lote afectado.
- Las mermas, vencimientos y eliminaciones deben conservar trazabilidad.

### Nota importante sobre ajuste_manual
Para una implementacion robusta se recomienda agregar un campo futuro llamado efecto_stock con valores entrada/salida, o modelar ajustes positivos como ingreso y ajustes negativos como merma/ajuste_salida. En esta version se mantiene el campo tipo_movimiento solicitado y se documenta la regla en logica de aplicacion.

## 4. unidades_medida
Catalogo de unidades.

### Campos
- id: uuid primary key
- codigo: text unique not null
- nombre: text not null
- tipo: text not null
- activo: boolean default true
- created_at: timestamptz default now()

### Ejemplos
- kg, Kilogramo, peso
- g, Gramo, peso
- lt, Litro, volumen
- ml, Mililitro, volumen
- unidad, Unidad, unidad
- caja, Caja, unidad
- paquete, Paquete, unidad

### Tipos
- peso
- volumen
- unidad

## 5. conversiones_unidad, futuro recomendado
Preparar conversiones futuras.

### Campos sugeridos
- id
- unidad_origen
- unidad_destino
- factor
- tipo

### Ejemplos
- 1 kg = 1000 g
- 1 lt = 1000 ml

## 6. importaciones_borrador
Encabezado de cargas desde foto o Excel.

### Campos
- id: uuid primary key
- origen: text not null
- estado: text not null
- archivo_url: text null
- usuario_id: uuid null
- created_at: timestamptz default now()
- updated_at: timestamptz default now()

### Estados
- pendiente_revision
- corregido
- confirmado
- rechazado

## 7. importaciones_borrador_filas
Filas detectadas desde importacion.

### Campos
- id: uuid primary key
- importacion_id: uuid not null references importaciones_borrador(id)
- numero_fila: integer not null
- producto_texto: text null
- producto_id_sugerido: uuid null references productos_insumos(id)
- cantidad: numeric null
- unidad: text null
- fecha_vencimiento_texto: text null
- fecha_vencimiento: date null
- lote: text null
- proveedor: text null
- observacion: text null
- error_validacion: text null
- estado_revision: text default pendiente
- created_at: timestamptz default now()

## 8. recetas_producto, futuro preparado
Permitira costos, produccion, consumo automatico y calculo de rentabilidad.

### Campos
- id: uuid primary key
- producto_final_id: uuid not null references productos_insumos(id)
- insumo_id: uuid not null references productos_insumos(id)
- cantidad: numeric not null
- unidad: text not null
- created_at: timestamptz default now()
- updated_at: timestamptz default now()

## 9. Vistas principales
- inventario_lotes_disponibles
- alertas_vencimiento
- alertas_stock_minimo
- dashboard_resumen, recomendado

## 10. Cache operativo
Mantener movimientos como verdad, pero preparar cache rapido para dashboard.

### Opciones
- vistas SQL al inicio
- materialized views cuando crezca
- tabla inventario_cache actualizada por triggers o jobs
