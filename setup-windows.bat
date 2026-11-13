@echo off
setlocal
cd /d "%~dp0"
echo.
echo  ASTHEN BOT - INSTALACAO
echo =========================
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale Node.js 26 LTS em https://nodejs.org/
  pause
  exit /b 1
)
node -e "const [a,b]=process.versions.node.split('.').map(Number);if(a<24||(a===24&&b<17)||a>=27)process.exit(1)"
if errorlevel 1 (
  echo Versao de Node.js incompatível. Use Node.js 24.17+ ou 26 LTS.
  pause
  exit /b 1
)
echo Node:
node --version
echo.
echo Instalando dependencias...
call npm install
if errorlevel 1 (
  echo Falha ao instalar dependencias.
  pause
  exit /b 1
)
if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo Arquivo .env criado. Edite-o e configure seu token e Application ID.
)
if not exist "data" mkdir data
echo.
echo Instalacao concluida. Edite .env e execute start-windows.bat.
pause
