# 予定を消す（道具とこれまでの作品はそのまま残る）。
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false) } catch {}

$Task = 'Primaries daily'
$all = @(Get-ScheduledTask | Where-Object { $_.TaskName -eq $Task })
if ($all.Count -eq 0) {
  Write-Host ("予定はもう入っていません: " + $Task)
  exit 0
}
Unregister-ScheduledTask -TaskName $Task -Confirm:$false
Write-Host '予定を消しました（道具とこれまでの作品はそのままです）。'
