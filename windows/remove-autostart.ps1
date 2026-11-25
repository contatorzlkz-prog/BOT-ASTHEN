$ErrorActionPreference = "Stop"
$task = Get-ScheduledTask -TaskName "ASTHEN BOT" -ErrorAction SilentlyContinue
if ($null -eq $task) {
  Write-Host "A tarefa ASTHEN BOT nao estava instalada."
  exit 0
}
Stop-ScheduledTask -TaskName "ASTHEN BOT" -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName "ASTHEN BOT" -Confirm:$false
Write-Host "Tarefa ASTHEN BOT removida."
