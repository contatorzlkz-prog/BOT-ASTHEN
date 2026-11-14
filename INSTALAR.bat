@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"
title ASTHEN BOT - Instalador
echo.
echo  ==========================================
echo    ASTHEN BOT - INSTALADOR AUTOMATICO
echo  ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 goto install_node
node -e "process.exit(Number(process.versions.node.split('.')[0]) >=22?0:1)" >nul 2>nul
if errorlevel 1 goto install_node
goto have_node

:install_node
echo Node.js 22 ou mais recente nao encontrado. Instalando Node.js LTS...
where winget >nul 2>nul
if errorlevel 1 goto install_node_manual
winget install -e --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
goto after_node_install

:install_node_manual
echo winget indisponivel. Baixe Node.js LTS em https://nodejs.org/
start "" "https://nodejs.org/"
pause
exit /b 1

:after_node_install
set "PATH=%PATH%;%ProgramFiles%\nodejs;%LocalAppData%\Programs\nodejs"
where node >nul 2>nul
if errorlevel 1 goto node_failed
goto have_node

:node_failed
echo Nao consegui instalar Node.js automaticamente. Instale em https://nodejs.org/ e execute novamente.
pause
exit /b 1

:have_node
for /f "delims=" %%v in ('node --version') do set "NODEV=%%v"
echo Node.js OK (%NODEV%)

echo.
echo Instalando dependencias...
call npm install --no-audit --no-fund
if errorlevel 1 goto deps_failed

echo.
echo Verificando os arquivos...
call npm run check --silent
if errorlevel 1 goto check_failed
call npm run check:commands --silent
if errorlevel 1 goto check_failed
call npm test --silent
if errorlevel 1 goto check_failed

if not exist data mkdir data
if exist ".env" goto env_exists

echo.
echo Configure seu proprio bot Discord.
set "TOKEN="
set "CLIENTID="
set "GUILDID="
set /p "TOKEN=Cole o TOKEN do bot: "
set /p "CLIENTID=Cole o APPLICATION ID: "
set /p "GUILDID=ID do servidor de teste (opcional): "
if "%TOKEN%"=="" goto env_missing
if "%CLIENTID%"=="" goto env_missing

> ".env" echo DISCORD_TOKEN=%TOKEN%
>> ".env" echo CLIENT_ID=%CLIENTID%
>> ".env" echo GUILD_ID=%GUILDID%
>> ".env" echo DKB_HOST=127.0.0.1
>> ".env" echo DKB_PORT=8787
>> ".env" echo SUPABASE_URL=
>> ".env" echo SUPABASE_SECRET_KEY=
>> ".env" echo SUPABASE_TABLE=asthen_bot_state
>> ".env" echo SUPABASE_KITS_TABLE=asthen_bot_kits
goto done

:env_missing
echo.
echo A configuracao nao foi concluida. Execute INSTALAR.bat novamente e informe TOKEN e APPLICATION ID.
pause
exit /b 1

:env_exists
echo O arquivo .env ja existe; foi mantido sem alteracoes.

:done
echo.
echo Instalacao concluida. Execute INICIAR.bat para ligar o bot.
pause
exit /b 0

:deps_failed
echo Nao foi possivel instalar as dependencias. Verifique a internet e tente novamente.
pause
exit /b 1

:check_failed
echo A validacao falhou. Confira os arquivos e tente novamente.
pause
exit /b 1
