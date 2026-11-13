@echo off
setlocal
cd /d "%~dp0"
if not exist ".env" (
  echo Arquivo .env nao encontrado. Execute setup-windows.bat primeiro.
  pause
  exit /b 1
)
call npm start
if errorlevel 1 (
  echo.
  echo O bot foi encerrado com erro. Confira a mensagem acima.
  pause
)
