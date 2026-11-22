$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$NodePath = (Get-Command node -ErrorAction Stop).Source
$LogDirectory = Join-Path $ProjectRoot "data\logs"
$LogFile = Join-Path $LogDirectory "runtime.log"
New-Item -ItemType Directory -Path $LogDirectory -Force | Out-Null

$rootSafe = $ProjectRoot.Replace("'", "''")
$nodeSafe = $NodePath.Replace("'", "''")
$logSafe = $LogFile.Replace("'", "''")
$command = "Set-Location -LiteralPath '$rootSafe'; & '$nodeSafe' 'src/index.js' >> '$logSafe' 2>&1; exit " + '$LASTEXITCODE'
$arguments = '-NoProfile -NonInteractive -WindowStyle Hidden -Command "' + $command + '"'

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arguments -WorkingDirectory $ProjectRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName "ASTHEN BOT" -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "Inicia o ASTHEN BOT no logon e reinicia o processo após falhas." -Force | Out-Null

Start-ScheduledTask -TaskName "ASTHEN BOT"
Write-Host "Tarefa ASTHEN BOT instalada e iniciada."
Write-Host "Logs do processo: $LogFile"
