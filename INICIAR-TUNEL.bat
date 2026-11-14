@echo off
setlocal
title ASTHEN BOT - Tunel HTTPS
cd /d "%~dp0"

echo.
echo ==========================================
echo   ASTHEN BOT - TUNEL HTTPS PARA TESTES
echo ==========================================
echo.
echo Antes de continuar, inicie o ASTHEN BOT.
echo No console do bot, confirme:
echo [Asthen Bridge] API ativa em http://127.0.0.1:8787
echo.
echo Este programa cria um endereco HTTPS temporario
echo para seu amigo acessar a API do bot pela internet.
echo Mantenha esta janela aberta durante os testes.
echo.

set "CLOUDFLARED="
if exist "%~dp0cloudflared.exe" set "CLOUDFLARED=%~dp0cloudflared.exe"

if not defined CLOUDFLARED (
  for /f "delims=" %%I in ('where cloudflared 2^>nul') do (
    if not defined CLOUDFLARED set "CLOUDFLARED=%%I"
  )
)

if not defined CLOUDFLARED (
  echo cloudflared.exe nao foi encontrado.
  echo.
  echo 1. Abra a pagina oficial:
  echo https://developers.cloudflare.com/tunnel/downloads/
  echo 2. Em Windows, baixe o Executable 64-bit.
  echo 3. Renomeie o arquivo para cloudflared.exe.
  echo 4. Coloque cloudflared.exe nesta mesma pasta.
  echo 5. Execute INICIAR-TUNEL.bat novamente.
  echo.
  pause
  exit /b 1
)

echo Iniciando o tunel. Copie o endereco https://...trycloudflare.com
echo que aparecera abaixo e envie ao amigo em conversa privada.
echo.
"%CLOUDFLARED%" tunnel --url http://127.0.0.1:8787

echo.
echo O tunel foi encerrado. O endereco temporario parou de funcionar.
pause
endlocal
