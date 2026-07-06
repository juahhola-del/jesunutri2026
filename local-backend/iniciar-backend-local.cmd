@echo off
setlocal
cd /d "%~dp0"

if not exist node_modules (
  echo Instalando dependencias del backend local...
  npm install
  if errorlevel 1 (
    echo No se pudieron instalar las dependencias.
    pause
    exit /b 1
  )
)

if not exist data mkdir data
if not exist backups mkdir backups

echo.
echo Backend local JESUnutri
echo En este dispositivo: http://127.0.0.1:8787
echo Desde celular/tablet en la misma red: http://IP-DE-ESTE-DISPOSITIVO:8787
echo.
echo Deja esta ventana abierta mientras uses la app.
echo.
npm start

pause
