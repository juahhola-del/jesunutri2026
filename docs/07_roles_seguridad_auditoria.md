# PROYECTO JESU - ROLES, SEGURIDAD Y AUDITORIA

## 1. Roles

### Roles base
- administrador
- supervisor
- operador
- solo lectura

## 2. Administrador

### Puede
- configurar catalogo maestro
- configurar stock minimo
- crear, editar y desactivar productos
- gestionar unidades
- ver todo el historial
- corregir configuraciones
- administrar usuarios y roles

## 3. Supervisor

### Puede
- ingresar stock
- consumir stock
- registrar merma
- revisar alertas
- aprobar importaciones
- ver dashboard e historial
- corregir borradores

## 4. Operador

### Puede
- usar ingreso rapido
- usar ingreso masivo
- consumir insumos si tiene permiso
- registrar observaciones
- ver alertas operativas

## 5. Solo lectura

### Puede
- ver dashboard
- ver inventario
- ver movimientos
- exportar reportes si se habilita
No puede modificar datos.

## 6. Soft delete
Nunca borrar fisicamente datos importantes.

### Usar
- activo = false
- deleted_at
- deleted_by

### Aplica a
- productos_insumos
- insumo_lotes

Si una eliminacion afecta stock, crear movimiento tipo eliminacion.

## 7. Auditoria minima

### Cada movimiento debe registrar
- usuario_id
- fecha_movimiento
- tipo_movimiento
- cantidad
- unidad
- producto_id
- lote_id si aplica
- motivo
- observacion
- ip si esta disponible
- dispositivo si esta disponible

## 8. Trazabilidad por lote

### Cada lote debe permitir reconstruir
- cuando entro
- quien lo ingreso
- proveedor
- vencimiento
- cuanto se consumio
- cuanto se perdio por merma
- cuanto se retiro por vencimiento
- cuanto queda disponible

## 9. RLS futuro en Supabase
Preparar politicas Row Level Security por rol.

### Reglas sugeridas
- solo lectura: select
- operador: select + insert movimientos permitidos
- supervisor: select + insert + update controlado
- administrador: control total funcional, evitando delete fisico

## 10. Multi sucursal futuro
insumo_lotes incluye sucursal_id futuro.

### Cuando se active multi sucursal
- inventario se calcula por sucursal
- alertas se filtran por sucursal
- consumos FIFO se hacen dentro de la sucursal
- usuarios ven solo sucursales permitidas
