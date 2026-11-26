@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title ASTHEN BOT - Inicialização automática
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Execute INSTALAR.bat primeiro.
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows\install-autostart.ps1"
if errorlevel 1 (
  echo Nao foi possivel instalar a inicializacao automatica.
  pause
  exit /b 1
)
echo.
echo Inicializacao automatica instalada. O bot iniciara no proximo logon e tera reinicio automatico em caso de falha.
pause
