# Proyecto Jesu - Inventario y Trazabilidad

Sistema de inventario operativo para bodega, disenado sobre Supabase/PostgreSQL y preparado para crecer hacia costos, recetas, produccion, automatizaciones y trazabilidad completa.

El principio central del proyecto es que el stock no se edita manualmente como fuente de verdad. Toda entrada, consumo, merma, vencimiento, ajuste o eliminacion debe quedar registrada en el historial de movimientos.

## Modulos Principales

- Catalogo maestro de insumos.
- Control de insumos por lotes.
- Fechas de vencimiento y alertas automaticas.
- Stock minimo por producto.
- Historial de movimientos como fuente de verdad.
- Consumo FIFO por fecha de vencimiento.
- Ingreso rapido individual.
- Ingreso masivo tipo tabla.
- Importacion desde foto o Excel como borrador pendiente de revision.
- Dashboard operativo para bodega.
- Base futura para costos, recetas y produccion.

## Stack Tecnologico

- Backend local Node/Express + SQLite como prioridad operativa en el PC de Jesu.
- Supabase como respaldo remoto y futura sincronizacion.
- PostgreSQL remoto por Supabase.
- Frontend futuro tipo ERP operativo.
- Vercel para despliegue futuro.
- OCR o lectura de Excel para importaciones futuras.

## Modo local

La carpeta `local-backend/` contiene el backend local recomendado para operar sin depender de Supabase.

Uso rapido en Windows:

1. Ejecutar `local-backend/preparar-backend-local.cmd` una vez.
2. Ejecutar `local-backend/iniciar-backend-local.cmd` cada vez que se use la app.
3. En la app, usar el panel `Modo local` y el boton `Preparar modo local`.
4. Si hay datos reales en Supabase, usar `Importar desde Supabase` para copiarlos a SQLite local sin duplicar filas.

Para importar datos reales desde Supabase hacia SQLite local, el boton `Importar desde Supabase` reutiliza la configuracion que ya usa la app. Si existe `.env` en la raiz del proyecto, el backend local tambien lo lee; si existe `local-backend/.env`, lo usa solo como configuracion local ignorada por Git.

Solo si las politicas de Supabase bloquean la lectura con usuario normal, configura la variable estandar ya usada por el proyecto:

```text
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<opcional-si-rls-bloquea-la-lectura>
```

El archivo `.env` no debe subirse a GitHub. Tampoco deben incluirse bases SQLite, backups, logs ni credenciales. El `.gitignore` excluye `.env`, `local-backend/data/`, `local-backend/backups/`, `*.log`, planillas reales y outputs generados.

Antes de usar el modo local como sistema real, valida:

- `POST /api/import-from-supabase` sin errores criticos por tabla.
- Conteos de Supabase vs SQLite para inventario, usuarios, ingresos pendientes, tareas y tablas clinicas.
- Login local, inventario, ingresos, consumos, ajustes, etiquetas, tareas, abastecimiento clinico y prediccion de pedidos.
- Arranque de la app con backend local activo aunque Supabase este inaccesible.

Credencial local inicial:

```text
Email: jesu@nutri.cl
Password: jesu-local
```

Durante la importacion, si Supabase entrega filas en `usuarios_app`, se importan esos usuarios y no se fuerza el seed local. El usuario `jesu@nutri.cl` se crea solo cuando la tabla local queda vacia, para que el sistema pueda iniciar sin depender de Supabase.

## Arquitectura

- `productos_insumos`: catalogo maestro de productos.
- `insumo_lotes`: lotes separados por ingreso, vencimiento, proveedor, lote y costo.
- `movimientos_inventario`: fuente de verdad del stock.
- `unidades_medida`: unidades base y preparacion para conversiones.
- `importaciones_borrador`: cargas desde foto o Excel antes de confirmar.
- `recetas_producto`: estructura preparada para costos y produccion futura.

## Roadmap Resumido

- Costos por insumo, lote, receta y produccion.
- Consumo automatico por receta.
- Produccion y rendimiento real vs teorico.
- Alertas por WhatsApp o correo.
- OCR inteligente para documentos fisicos.
- Multi sucursal.
- Reportes operativos y auditoria avanzada.
- Timeline completo por lote.

## Estructura de Carpetas

```text
/
|-- docs/
|   |-- 00_indice_sistema.md
|   |-- 01_requerimientos_funcionales.md
|   |-- 02_modelo_datos.md
|   |-- 03_reglas_negocio.md
|   |-- 04_flujos_pantallas.md
|   |-- 05_criterios_aceptacion.md
|   |-- 07_roles_seguridad_auditoria.md
|   `-- 08_roadmap_futuro.md
|-- supabase/
|   `-- 06_sql_base_supabase.sql
|-- README.md
`-- .gitignore
```

## Instrucciones Basicas Futuras

1. Crear un proyecto en Supabase.
2. Ejecutar el archivo `supabase/06_sql_base_supabase.sql` en el SQL Editor de Supabase.
3. Configurar variables de entorno para el frontend futuro.
4. Conectar el repositorio a GitHub.
5. Conectar el proyecto a Vercel.
6. Comenzar el desarrollo del ERP de inventario usando la documentacion de `docs/` como guia funcional y tecnica.

## Estado del Proyecto

Documentacion base consolidada y lista para iniciar desarrollo.
