# Abastecimiento Clinico - Fase 1

## Alcance

Modulo independiente agregado a la app JESUnutri existente para apoyar PAC anual, pedidos a proveedor, escenarios de quiebres, presupuesto y reportes.

No reemplaza ni reconstruye inventario, FIFO, ingresos, aprobaciones, ajustes, historial, vencimientos, productos criticos ni exportaciones existentes.

## Archivos tocados

- `index.html`: acceso principal y vistas del modulo Abastecimiento Clinico.
- `script.js`: estado local, importacion PAC/pedido proveedor, validaciones, calculo de pedido, quiebres, presupuesto y exportaciones.
- `styles.css`: estilos del modulo, tabs, tablas, resumenes y responsive.
- `service-worker.js`: version de cache `v7` para publicar los nuevos assets.
- `docs/15_abastecimiento_clinico_fase_1.md`: esta nota tecnica.

## Tablas y vistas Supabase existentes identificadas

- `usuarios_app`
- `productos_insumos`
- `insumo_lotes`
- `movimientos_inventario`
- `ingresos_pendientes`
- `ingresos_pendientes_detalle`
- `inventario_lotes_disponibles`
- `alertas_stock_minimo`
- `historial_movimientos_inventario`
- `productos_criticos_stock`
- `productos_criticos_cobertura`

## Datos reutilizados

- Productos: `productos_insumos`
- Stock actual por producto: inventario ya cargado desde `inventario_lotes_disponibles`
- Stock minimo: `productos_insumos.stock_minimo`
- Producto critico: `productos_insumos.critico`
- Consumo promedio diario: `productos_insumos.consumo_promedio_diario`
- Bajo stock y criticos: vistas/funciones existentes de la app
- Exportacion CSV: `downloadCsv`

## Persistencia Fase 1

PAC, pedidos mensuales/proveedor y pedido proveedor importado se guardan en `localStorage` con clave propia:

`jesunutri_clinical_supply_v1_{usuario}`

Esto hace la fase reversible y evita tocar las tablas de inventario actuales. Para Fase 2 se puede migrar esta estructura a tablas Supabase dedicadas sin cambiar los flujos actuales.

## Persistencia Fase 2

El modulo ahora usa Supabase como fuente oficial cuando las tablas de `supabase/14_abastecimiento_clinico.sql` estan instaladas:

- `clinical_pac_years`
- `clinical_pac_items`
- `clinical_monthly_orders`
- `clinical_monthly_order_items`
- `clinical_real_order_imports`
- `clinical_real_order_items`
- `clinical_budget_snapshots`

`localStorage` queda como respaldo temporal por usuario. Si Supabase falla o la migracion no esta aplicada, el flujo clinico puede seguir localmente sin interrumpir inventario, ingresos, FIFO, aprobaciones ni ajustes.

Los pedidos mensuales/proveedor son registro de decisiones de compra y comparacion contra PAC. No representan stock real ni deben interpretarse como mercaderia recibida. El stock real se actualiza por ingreso masivo, lotes y movimientos de inventario.

Los pedidos mensuales/proveedor guardan snapshots de stock actual, stock minimo y consumo promedio diario usados al momento de calcular o comparar la decision de compra. Por eso un pedido ya generado no cambia automaticamente cuando cambia el inventario despues.

La arquitectura deja espacio en `clinical_budget_snapshots.snapshot_data.phase2_ready` para demanda diaria por ficha nutricional, consumo por tipo de dieta, proyeccion por pacientes/dietas, reemplazos nutricionales y simulador presupuestario avanzado.

## Funciones nuevas principales

- `loadClinicalSupplyState`
- `saveClinicalSupplyState`
- `importClinicalPacFile`
- `importClinicalRealOrderFile`
- `getClinicalPacValidations`
- `buildClinicalOrderRows`
- `generateClinicalOrder`
- `getClinicalBreakRows`
- `getClinicalBudgetRows`
- `exportClinicalReport`
- `renderClinicalSupply`

## Limitaciones conocidas

- El catalogo actual no tiene campo codigo; por eso el match contra inventario se hace por nombre normalizado. El codigo PAC se valida para duplicados y se conserva en reportes.
- La importacion `.xlsx` usa la libreria de navegador SheetJS desde CDN. Si no esta cargada, el modulo avisa y limita el flujo a CSV/TXT.
- Las tablas Supabase nuevas tienen RLS para usuarios autenticados dueños de sus registros y acceso total para admin mediante `public.is_current_user_admin()`.
