# JESUnutri Android Capturer

Aplicacion nativa Android para capturar etiquetas con camara trasera, linterna, ML Kit Barcode y ML Kit Text Recognition.

## Rol

- No crea SQLite local.
- No modifica inventario directo.
- No aprueba ingresos.
- Envia aprendizajes, imagenes y sesiones pendientes al backend local oficial de la tablet.

## Compilar

```powershell
cd android-capturer
gradle :app:assembleDebug
```

APK:

```text
android-capturer/app/build/outputs/apk/debug/app-debug.apk
```

## Uso

1. Levantar el backend oficial en la tablet.
2. Conectar el capturador al servidor, por ejemplo `http://192.168.1.132:8787`.
3. Usar `Aprender` para vincular codigo, OCR, imagen y regla de empaque.
4. Usar `Ingresar` para crear sesiones pendientes.
5. Revisar y aprobar solo desde la app principal/admin.
