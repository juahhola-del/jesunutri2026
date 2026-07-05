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
echo Preparando base SQLite local...
npm run install-local
if errorlevel 1 (
  echo.
  echo La preparacion local termino con errores.
  pause
  exit /b 1
)

echo.
echo Base local preparada. Para usarla, ejecuta iniciar-backend-local.cmd y deja esa ventana abierta.
pause
