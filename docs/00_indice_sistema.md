# PROYECTO JESU - INDICE CONSOLIDADO DEL SISTEMA

Objetivo
Construir un modulo serio de inventario y trazabilidad para bodega, conectado a Supabase/PostgreSQL, preparado para crecer hacia costos, recetas, produccion, automatizaciones, multi sucursal y auditoria avanzada.

Principio central
El sistema NO debe depender de editar cantidades manualmente.
La fuente de verdad del stock debe ser el historial de movimientos.

Archivos del proyecto

00_indice_sistema.txt
- Resumen general de la documentacion.

01_requerimientos_funcionales.txt
- Alcance funcional del modulo de inventario, alertas, FIFO, dashboard, importacion, ingreso masivo y futuro crecimiento.

02_modelo_datos.txt
- Modelo de tablas, campos, relaciones y reglas de persistencia.

03_reglas_negocio.txt
- Reglas de stock, vencimiento, FIFO, normalizacion, fechas, soft delete, importaciones y trazabilidad.

04_flujos_pantallas.txt
- Pantallas y flujos operativos para uso real de bodega.

05_criterios_aceptacion.txt
- Condiciones verificables para saber si el sistema cumple.

06_sql_base_supabase.txt
- SQL inicial para Supabase/PostgreSQL con tablas, indices y vistas base.

07_roles_seguridad_auditoria.txt
- Roles, permisos, auditoria, soft delete y trazabilidad.

08_roadmap_futuro.txt
- Crecimiento futuro: costos, recetas, produccion, WhatsApp, OCR inteligente, reportes y multi sucursal.

Arquitectura base
- Supabase
- PostgreSQL
- Frontend rapido tipo ERP
- Uso operativo para bodega
- Fechas visuales en DD-MM-YYYY
- Fechas guardadas en base de datos como YYYY-MM-DD

Modulos principales
- Catalogo maestro de insumos
- Lotes de insumos
- Movimientos de inventario
- Alertas de vencimiento
- Alertas de stock minimo
- Ingreso rapido individual
- Ingreso masivo
- Importacion desde foto o Excel
- Dashboard operativo
- Historial y auditoria
- Preparacion para costos, recetas y produccion
