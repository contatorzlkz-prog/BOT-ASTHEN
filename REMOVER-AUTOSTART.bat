@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title ASTHEN BOT - Remover inicialização automática
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows\remove-autostart.ps1"
if errorlevel 1 (
  echo Nao foi possivel remover a tarefa automatica.
  pause
  exit /b 1
)
echo.
echo Inicializacao automatica removida.
pause
