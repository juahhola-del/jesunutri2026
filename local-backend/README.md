# Backend local JESUnutri

Backend local liviano para operar la app aunque Supabase no responda.

## Uso en Windows

1. Ejecuta `preparar-backend-local.cmd` una vez para instalar dependencias y crear la base SQLite.
2. Ejecuta `iniciar-backend-local.cmd` cada vez que uses la app.
3. Deja la ventana abierta mientras JESUnutri este en uso.

URL local por defecto:

```text
http://127.0.0.1:8787
```

Desde un celular en la misma red, abre la app con la IP del dispositivo principal:

```text
http://IP-DE-LA-TABLET-O-PC:8787
```

El backend escucha la red local por defecto para que el celular funcione como capturador. La base SQLite, imagenes de etiquetas y sesiones quedan guardadas solo en este dispositivo principal.

## Credenciales locales iniciales

Por defecto se crea un usuario administrador local:

```text
Email: jesu@nutri.cl
Password: jesu-local
```

El seed local se crea solo si `usuarios_app` queda vacia. Si Supabase entrega usuarios durante la importacion, se importan esos registros y no se fuerza un usuario duplicado.

Para cambiarlo, copia `.env.example` a `.env`, cambia `JESUNUTRI_LOCAL_ADMIN_PASSWORD` y ejecuta:

```powershell
$env:JESUNUTRI_LOCAL_ADMIN_PASSWORD_RESET="1"; npm run install-local
```

## Endpoints base

- `GET /api/health`
- `GET /api/status`
- `POST /api/install`
- `POST /api/backup`
- `POST /api/import-from-supabase`

## Importar datos reales

Desde la app, usa el boton `Importar desde Supabase` cuando el backend local este activo. El backend copia tabla por tabla hacia SQLite, mantiene los IDs originales cuando no existe conflicto local, actualiza filas ya existentes por `id` y protege duplicados por claves unicas conocidas.

El resumen devuelve registros leidos, insertados, actualizados, duplicados protegidos, saltados y errores por tabla.

El importador reutiliza la configuracion que ya usa la app. El backend local lee `.env` y `.env.local` desde la raiz del proyecto, y tambien `local-backend/.env` si necesitas overrides locales ignorados por Git.

Si las politicas de Supabase bloquean la lectura con usuario normal, configura la variable estandar del proyecto:

```text
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<opcional-si-rls-bloquea-la-lectura>
```

Esa clave queda solo en el backend local; no se envia al navegador.

## Datos locales

- Base SQLite: `data/jesunutri-local.sqlite`
- Backups: `backups/`
- Migraciones: `migrations/`
