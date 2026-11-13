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
node -e "process.exit(Number(process.versions.node.split('.')[0])>=20?0:1)" >nul 2>nul
if errorlevel 1 goto install_node
goto have_node

:install_node
echo Node.js 20 ou mais recente nao encontrado. Instalando Node.js LTS...
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
if "%TOKEN%"=="" goto env_template
if "%CLIENTID%"=="" goto env_template
> ".env" echo DISCORD_TOKEN=%TOKEN%
>> ".env" echo CLIENT_ID=%CLIENTID%
>> ".env" echo GUILD_ID=%GUILDID%
goto done

:env_template
copy ".env.example" ".env" >nul
echo Abra o arquivo .env e preencha DISCORD_TOKEN e CLIENT_ID.
goto done

:env_exists
echo O arquivo .env ja existe; foi mantido.

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
