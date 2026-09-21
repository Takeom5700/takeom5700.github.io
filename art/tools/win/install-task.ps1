# 毎朝6時に daily.bat を起こす予定を登録する。
#
#   art\tools\win\install-task.bat をダブルクリックするだけ（これを呼ぶ）。
#   PowerShell から直に打つなら:
#     powershell -NoProfile -ExecutionPolicy Bypass -File art\tools\win\install-task.ps1
#
# 時刻を変えたいときは下の $At を書き換える。やめたいときは uninstall-task.bat。
#
# **schtasks ではなく Register-ScheduledTask を使っている。**
# schtasks は成功しても失敗しても文言が Windows の言語で変わるので、
# 「登録できたのか分からない」という事が起きた（実際に起きた）。
# こちらは物として引き直して、状態と次の日時を数で出す。

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false) } catch {}

$Task = 'Primaries daily'
$At   = '06:00'

$here  = Split-Path -Parent $MyInvocation.MyCommand.Path
$daily = Join-Path $here 'daily.bat'
if (-not (Test-Path $daily)) {
  Write-Host "daily.bat が見つかりません: $daily"
  Write-Host 'このファイルは art\tools\win\ の中に置いたまま使ってください。'
  exit 1
}

Write-Host "予定を登録します: $Task  毎日 $At"
Write-Host "叩くもの: $daily"
Write-Host ''

# cmd 経由で叩く（daily.bat は .bat なので、直に Execute できない環境がある）
$action  = New-ScheduledTaskAction -Execute $env:ComSpec `
             -Argument ('/c "' + $daily + '"') -WorkingDirectory $here
$trigger = New-ScheduledTaskTrigger -Daily -At $At

# スリープしていても起こす／時刻を逃したら次に起きたときに拾う／電池でも動かす／
# 2時間で打ち切る（録画は6分だが余裕を見る）／走っている最中に重ねない
$settings = New-ScheduledTaskSettingsSet -WakeToRun -StartWhenAvailable `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2) -MultipleInstances IgnoreNew

try {
  Register-ScheduledTask -TaskName $Task -Action $action -Trigger $trigger `
    -Settings $settings -Description 'Primaries: note の記事から1日1本の映像作品を作る' `
    -Force | Out-Null
} catch {
  Write-Host '登録できませんでした:'
  Write-Host ("  " + $_.Exception.Message)
  Write-Host ''
  Write-Host '会社や学校のパソコンだと、予定の登録が禁じられていることがあります。'
  Write-Host 'その場合は毎朝 art\tools\win\daily.bat をダブルクリックしてください（同じものが動きます）。'
  exit 1
}

# ---- 本当に入ったか、物を引き直して確かめる -----------------------------
$all = @(Get-ScheduledTask | Where-Object { $_.TaskName -eq $Task })
if ($all.Count -eq 0) {
  Write-Host '登録したはずの予定が見つかりません。入っていません。'
  exit 1
}
$info = Get-ScheduledTaskInfo -TaskName $Task
Write-Host '--------------------------------------------'
Write-Host ("登録できました  : " + $all[0].TaskName)
Write-Host ("同じ名前の予定  : " + $all.Count + " 件（1 件なら重複なし）")
Write-Host ("状態            : " + $all[0].State)
if ($info.NextRunTime) {
  Write-Host ("次に動く日時    : " + $info.NextRunTime.ToString('yyyy-MM-dd HH:mm'))
} else {
  Write-Host '次に動く日時    : （まだ決まっていません。State が Disabled なら有効にしてください）'
}
Write-Host '--------------------------------------------'
Write-Host ''
Write-Host 'いますぐ1回試すなら:'
Write-Host ("  Start-ScheduledTask -TaskName '" + $Task + "'")
Write-Host ''
Write-Host ("ログ: " + (Join-Path $env:USERPROFILE 'Desktop\Claude Art Project\daily.log'))
