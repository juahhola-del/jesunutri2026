# PROYECTO JESU - CRITERIOS DE ACEPTACION

## 1. Stock por movimientos
- Al ingresar stock, se crea movimiento tipo ingreso.
- Al consumir stock, se crea movimiento tipo consumo.
- Al registrar merma, se crea movimiento tipo merma.
- Al retirar vencido, se crea movimiento tipo vencimiento.
- Al eliminar stock disponible, se crea movimiento tipo eliminacion.
- La cantidad disponible se calcula desde movimientos.

## 2. Lotes
- El mismo producto con distinta fecha de vencimiento crea lote separado.
- El mismo producto con distinto lote proveedor o costo crea lote separado.
- Cada lote conserva su fecha recepcion, vencimiento, proveedor, observacion y costo.

## 3. Alertas vencimiento
- Un lote vencido aparece como vencido.
- Un lote que vence hoy aparece como vence hoy.
- Un lote que vence en 1 a 20 dias aparece como vence en 1 a 20 dias.
- Un lote vigente aparece como vigente.
- Un lote sin fecha aparece como sin fecha si corresponde.
- Las alertas se ordenan por fecha de vencimiento ascendente.
- Marcar como revisada no modifica stock.

## 4. Stock minimo
- Si stock disponible total del producto baja de stock_minimo, aparece alerta.
- Si stock_minimo es 0, no genera alerta.
- La alerta muestra stock actual, minimo y faltante.

## 5. FIFO
- Al consumir, se descuenta primero el lote con vencimiento mas cercano.
- Si el primer lote no alcanza, se descuenta del siguiente.
- Los lotes sin vencimiento quedan al final.
- Se crea un movimiento por cada lote afectado.

## 6. Selector predictivo
- Al escribir h, sugiere productos como Harina.
- Al escribir az, sugiere Azucar aunque exista como AzÃºcar.
- Si se intenta crear Azucar y ya existe AzÃºcar, advierte duplicado.
- Permite crear producto nuevo si no hay coincidencia real.

## 7. Fechas rapidas
- 01122026 se interpreta como 01-12-2026 y se guarda como 2026-12-01.
- 011226 se interpreta como 01-12-2026 y se guarda como 2026-12-01.
- 01/12/2026, 01-12-2026 y 01.12.2026 son aceptadas.
- 32132026 se rechaza con error claro.
- Fechas imposibles por calendario se rechazan.

## 8. Ingreso masivo
- Enter avanza campo por campo.
- Enter al final crea una nueva fila.
- Las filas invalidas muestran error.
- Las filas invalidas no pierden datos.
- Al confirmar, se crean lotes y movimientos de ingreso.

## 9. Importaciones
- Excel o foto crea borrador pendiente_revision.
- No se guarda inventario automaticamente.
- El usuario puede corregir antes de confirmar.
- Al confirmar, se crean productos aprobados, lotes y movimientos.

## 10. Dashboard
- Muestra total de insumos activos.
- Muestra productos vencidos.
- Muestra proximos a vencer.
- Muestra bajo stock.
- Muestra ultimos movimientos.
- Prepara valor inventario usando costo_unitario.

## 11. Soft delete
- Desactivar producto no borra historial.
- Eliminar lote no borra historial.
- deleted_at y deleted_by quedan registrados.

## 12. Roles
- Operador puede ingresar y consumir segun permisos.
- Supervisor puede revisar alertas y aprobar correcciones.
- Administrador puede configurar catalogos, usuarios y stock minimo.
- Solo lectura no puede modificar datos.
