# Roles y Aprobaciones de Operadores

## Roles

- `admin`: acceso completo, aprueba/rechaza ingresos pendientes y modifica inventario real.
- `operador`: acceso solo a ingreso masivo pendiente y lectura de sus propios envios.

## Flujo operador

1. Inicia sesion.
2. Ve solo la pantalla **Ingreso pendiente**.
3. Escribe o pega filas desde Excel.
4. Presiona **Enviar a revision**.
5. El inventario real no cambia.

## Flujo admin

1. Inicia sesion.
2. Ve dashboard normal.
3. Revisa la seccion **Ingresos pendientes**.
4. Abre un ingreso con **Ver / Revisar**.
5. Puede editar filas, quitar filas o agregar filas antes de aprobar.
6. Al aprobar, se ejecuta la misma logica de ingreso real:
   - crear producto si no existe
   - crear lote
   - crear movimiento tipo `ingreso`
7. Al rechazar, debe indicar motivo obligatorio.

## SQL

Ejecutar:

```sql
supabase/13_roles_ingresos_pendientes.sql
```

Ese archivo crea:

- `usuarios_app`
- `ingresos_pendientes`
- `ingresos_pendientes_detalle`
- policies RLS base
- admin `jesu@nutri.cl`
- operadores `juancarlos@bod.cl` y `patricia@bod.cl`

## Seguridad UI

El frontend valida rol antes de acciones admin con `requireAdminAction()`.

Las acciones protegidas incluyen:

- crear inventario real
- editar lote
- eliminar lote
- stock consumido
- ajuste inventario
- configurar producto
- aprobar o rechazar pendientes
