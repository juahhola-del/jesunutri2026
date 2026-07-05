# Abastecimiento Clinico - Conciliacion central

La conciliacion ahora es una capa obligatoria para todo registro importado sin `producto_id` confiable. La tabla central es `clinical_product_links` y separa:

- datos importados crudos
- registros pendientes o sugeridos
- vinculos confirmados manualmente
- datos aptos para calculo

## Fuentes

`clinical_product_links.source_type` identifica el origen:

- `pac`
- `monthly_order`
- `daily_demand`
- `future_import`

La pantalla `Conciliacion` permite filtrar por `Todos`, `PAC`, `Pedido proveedor` y `Demanda diaria`, y por estados `Pendientes`, `Sugeridos`, `Vinculados`, `Ignorados` y `Conflictos`.

## Regla de resolucion

Para cada registro importado se intenta resolver en este orden:

1. `producto_id` explicito ya confiable.
2. codigo PAC exacto normalizado.
3. vinculo confirmado en `clinical_product_links`.
4. sugerencia por nombre con confianza >= 80%.
5. pendiente de conciliacion.

La sugerencia por nombre nunca crea un vinculo definitivo. Solo preselecciona el producto en la UI y queda con estado `sugerido` hasta confirmacion manual.

## Normalizacion

Los codigos se comparan normalizados. Ejemplos equivalentes:

- `ALIM - 0001`
- `ALIM-0001`
- `ALIM 0001`
- `alim-0001`

Todos quedan como `ALIM-0001`.

Los nombres se normalizan para sugerencias: minusculas, sin tildes, sin signos irrelevantes, sin parentesis/guiones y con equivalencias simples como `yogurth/yoghurt/yugurt/yogur -> yogurt`.

## Uso en calculos

Pedido proveedor sugerido/importado, demanda diaria y escenarios de quiebres solo usan productos con estado `vinculado`. Los estados `pendiente`, `sugerido` y `conflicto` se muestran para revision, pero no alimentan stock, consumo ni proyecciones.

El pedido proveedor es decision de compra y no equivale a stock recibido. El stock real se alimenta por ingreso masivo, lotes y movimientos de inventario.

## Revalidacion

La pantalla incluye:

- `Revalidar PAC`
- `Revalidar pedido proveedor`
- `Revalidar demanda diaria`
- `Revalidar todo`

Al revalidar se aplican vinculos confirmados, se recalculan pendientes/sugerencias, se actualizan `producto_id` donde corresponda y se refrescan los errores falsos.

## Diagnostico

**El importador mensual consulta la conciliacion PAC?**
Si. El pedido proveedor importado busca primero el codigo normalizado en el PAC y luego reutiliza el producto vinculado en `clinical_product_links`.

**Consulta por codigo PAC o solo por nombre?**
Consulta por codigo PAC normalizado como prioridad. El nombre queda como respaldo solo cuando no hay codigo.

**Los codigos PAC conciliados se guardan permanentemente?**
Si. Se guardan en `clinical_product_links` con `source_type = pac`, `normalized_code`, `producto_id`, `confirmed_by` y `confirmed_at`.

**El pedido proveedor reutiliza conciliaciones existentes?**
Si. Si el codigo del pedido proveedor coincide con un codigo PAC ya vinculado, toma ese `producto_id`. Si no hay PAC, crea o mantiene un pendiente `source_type = monthly_order`.

**Por que un producto con codigo valido aparecia como "requiere conciliacion"?**
Habia dos causas probables: la normalizacion no convertia `ALIM 0001` y `ALIM-0001` al mismo valor, y el importador podia caer a comparacion por nombre/PAC sin reutilizar un vinculo confirmado por codigo. Ambas reglas quedaron corregidas.
