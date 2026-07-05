# Abastecimiento Clinico - Demanda Diaria

Se agrego la pestaña `Demanda Diaria` dentro del modulo Abastecimiento Clinico para cargar fichas diarias de nutricion en Excel o CSV.

## Archivos modificados

- `index.html`: nueva pestaña, carga de ficha diaria, vista resumen, correccion manual y exportes.
- `script.js`: parser flexible de fichas, guardado local/Supabase, vista diaria, vista mensual y reportes CSV.
- `styles.css`: estilos del formulario y tablas de demanda.
- `supabase/15_demanda_diaria_clinica.sql`: tablas persistentes y policies RLS.

## Tablas nuevas

- `clinical_daily_demands`
- `clinical_daily_diet_counts`
- `clinical_daily_enteral_items`
- `clinical_daily_supply_items`
- `clinical_daily_import_errors`

## Lectura flexible

El importador revisa todas las hojas del Excel y busca palabras clave para:

- total de usuarios/pacientes
- dietas frecuentes y especiales
- enterales, formulas, modulos, volumen, horario, GTT y via oral
- pan, once, desayuno, colaciones, menu, preparaciones e insumos

Si no detecta una seccion, guarda advertencias en vez de detener la importacion.

## Alcance

Esta fase solo deja la base de demanda diaria lista y persistente. No modifica el calculo automatico del pedido proveedor. La estructura queda preparada para cruzar demanda real con PAC, decisiones de compra, stock real y consumo promedio diario en una fase posterior.

## Importacion masiva mensual

El boton `Importar mes completo` permite seleccionar varios archivos `.xlsx`, `.xls`, `.csv` o `.txt` en una sola operacion. La fecha se reconoce desde nombres como `02_06_2026.xlsx`, `02-06-2026.xlsx`, `02.06.2026.xlsx`, `02 06 2026.xlsx`, `2026-06-02.xlsx`, `ficha_02_06_2026.xlsx` o `nutricion_02-06-2026.xlsx`.

La politica de duplicados se escoge antes de importar: saltar duplicados, reemplazar duplicados o crear version nueva. El diagnostico mensual muestra archivo, fecha detectada, estado, pacientes, dietas, enterales/modulos, insumos y advertencias.

## Control de lecturas sospechosas

El parser no suma cualquier numero de la hoja. Solo lee cantidades cercanas a etiquetas confiables y aplica limites:

- pacientes diarios: maximo 1000
- dietas especiales: maximo 1000
- enterales/modulos: maximo 500
- insumos: maximo 5000

Si una lectura supera estos limites, queda como `Lectura sospechosa, requiere revision manual`, no se usa para promedios mensuales y debe corregirse manualmente.

## Correccion y revision

La ficha seleccionada permite editar total de pacientes, observaciones y cantidades por tipo de dieta. El boton `Marcar ficha como revisada` cambia el estado a `revisada` para excluirla de pendientes.

## Advertencias accionables y conciliacion

Las advertencias de importacion ahora guardan detalle accionable: archivo, fecha, hoja, fila, celda, tipo, mensaje, severidad, accion sugerida y estado (`pendiente`, `revisada`, `ignorada`). Si una ficha queda `con errores` o `con advertencias`, debe existir al menos una advertencia visible; si no hay detalle, se muestra como `cargada`.

La pestaña `Demanda Diaria` incluye el panel `Advertencias de importacion` con filtros por archivo, severidad, tipo y estado. Desde cada advertencia se puede marcar revisada, ignorar, corregir manualmente o ir a conciliacion cuando el problema sea un producto no conciliado.

La pestaña `Conciliacion` ahora tiene dos modos:

- `Conciliacion PAC`
- `Conciliacion Demanda Diaria`

La conciliacion de demanda agrega enterales, modulos e insumos detectados durante el mes, su frecuencia, cantidad total, sugerencia de producto inventario, confianza y acciones para vincular, crear producto, ignorar o desvincular. Las sugerencias de 80% o mas quedan preseleccionadas, pero no se vinculan automaticamente.

Nueva tabla Supabase: `clinical_demand_product_links`. Tambien se expandio `clinical_daily_import_errors` con columnas de detalle y revision.
