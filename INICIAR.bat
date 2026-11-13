@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"
title ASTHEN BOT
where node >nul 2>nul
if errorlevel 1 goto need_install
node -e "process.exit(Number(process.versions.node.split('.')[0]) >=22?0:1)" >nul 2>nul
if errorlevel 1 goto old_node
if not exist node_modules goto need_install
if not exist ".env" goto need_install
findstr /c:"COLOQUE_SEU_TOKEN_AQUI" ".env" >nul 2>nul
if not errorlevel 1 goto need_token
findstr /c:"COLOQUE_O_APPLICATION_ID_AQUI" ".env" >nul 2>nul
if not errorlevel 1 goto need_token

echo Iniciando o ASTHEN BOT... (feche esta janela para desligar o bot)
echo.
node src/index.js
echo.
echo O bot foi encerrado. Se apareceu um erro acima, leia a mensagem.
pause
exit /b 0

:old_node
echo Node.js 22 ou mais recente e necessario. Execute INSTALAR.bat para atualizar.
pause
exit /b 1

:need_install
echo Falta instalar o bot. Execute o INSTALAR.bat primeiro.
pause
exit /b 1

:need_token
echo O arquivo .env ainda tem o texto de exemplo.
echo Abra o .env com o Bloco de Notas e preencha DISCORD_TOKEN e CLIENT_ID.
pause
exit /b 1
