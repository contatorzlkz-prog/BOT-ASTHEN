@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"
title ASTHEN BOT - Restaurar backup
echo.
echo ==========================================
echo   ASTHEN BOT - RESTAURACAO DE BACKUP
echo ==========================================
echo.
echo Feche o bot antes de continuar.
echo A restauracao cria um backup dos dados atuais antes de substituir qualquer arquivo.
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Execute INSTALAR.bat primeiro.
  pause
  exit /b 1
)

schtasks /End /TN "ASTHEN BOT" >nul 2>nul
schtasks /Change /TN "ASTHEN BOT" /Disable >nul 2>nul

echo Backups disponiveis:
node src/maintenance-cli.js list
echo.
set "BACKUP_ID="
set /p "BACKUP_ID=Digite o identificador exato do backup: "
if "%BACKUP_ID%"=="" goto cancelled
echo.
echo A restauracao vai substituir .env, state.json e a fila da Bridge.
set "CONFIRM="
set /p "CONFIRM=Digite RESTAURAR para confirmar: "
if /i not "%CONFIRM%"=="RESTAURAR" goto cancelled

node src/maintenance-cli.js restore "%BACKUP_ID%"
if errorlevel 1 goto failed

echo.
echo Restauracao concluida. O backup anterior tambem foi preservado.
schtasks /Change /TN "ASTHEN BOT" /Enable >nul 2>nul
echo A tarefa automatica foi reativada, se estava instalada.
pause
exit /b 0

:failed
echo.
echo A restauracao nao foi concluida. Os dados anteriores foram preservados.
schtasks /Change /TN "ASTHEN BOT" /Enable >nul 2>nul
pause
exit /b 1

:cancelled
echo.
echo Restauracao cancelada.
schtasks /Change /TN "ASTHEN BOT" /Enable >nul 2>nul
pause
exit /b 0
