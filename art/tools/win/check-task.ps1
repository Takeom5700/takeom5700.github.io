# 配管を1枚で確かめる。**詰まったらこれを先に動かす。**
#
#   art\tools\win\check-task.bat をダブルクリックするだけ。
#
# 見るもの: 予定が入っているか／node と claude があるか／置場とログ／前回の結果。
# ここで出た数と文言をそのまま貼れば、どこで詰まったか分かるようにしてある。

try { [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false) } catch {}

$Task = 'Primaries daily'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Resolve-Path (Join-Path $here '..\..\..')
$out  = Join-Path $env:USERPROFILE 'Desktop\Claude Art Project'

Write-Host '===== Primaries 配管の確認 ====='
Write-Host ("リポジトリ : " + $repo)
$outNote = if (Test-Path $out) { '（あります）' } else { '（まだありません）' }
Write-Host ("置場       : " + $out + $outNote)
Write-Host ''

# ---- 1. 予定 -------------------------------------------------------------
try { $all = @(Get-ScheduledTask -ErrorAction Stop | Where-Object { $_.TaskName -eq $Task }) }
catch { $all = @(); Write-Host '[予定] 予定の一覧を引けませんでした（タスクスケジューラが使えない環境です）' }
if ($all.Count -eq 0) {
  Write-Host ("[予定] 入っていません（" + $Task + "）")
  Write-Host '  → art\tools\win\install-task.bat をダブルクリックしてください。'
} else {
  $info = Get-ScheduledTaskInfo -TaskName $Task
  Write-Host ("[予定] 入っています  件数 " + $all.Count + " / 状態 " + $all[0].State)
  if ($info.NextRunTime) { Write-Host ("  次に動く    : " + $info.NextRunTime.ToString('yyyy-MM-dd HH:mm')) }
  if ($info.LastRunTime -and $info.LastRunTime.Year -gt 1999) {
    Write-Host ("  前に動いた  : " + $info.LastRunTime.ToString('yyyy-MM-dd HH:mm'))
    Write-Host ("  前回の結果  : " + $info.LastTaskResult + "（0 なら成功）")
  } else {
    Write-Host '  前に動いた  : まだ一度も動いていません'
  }
  $act = ($all[0].Actions | Select-Object -First 1)
  Write-Host ("  叩くもの    : " + $act.Execute + " " + $act.Arguments)
}
Write-Host ''

# ---- 2. 道具 -------------------------------------------------------------
foreach ($cmd in 'node', 'git', 'claude') {
  $c = Get-Command $cmd -ErrorAction SilentlyContinue
  if ($c) { Write-Host ("[道具] " + $cmd + " : " + $c.Source) }
  else    { Write-Host ("[道具] " + $cmd + " : 見つかりません") }
}
# browser.mjs が見るところと同じ順（$env:CHROME が最優先）
$chrome = @(
  $env:CHROME,
  'C:\Program Files\Google\Chrome\Application\chrome.exe',
  'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
  $(if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe' })
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if ($chrome) { Write-Host ("[道具] chrome : " + $chrome) }
else {
  Write-Host '[道具] chrome : 見つかりません'
  Write-Host '  → 絵を焼くのに要ります。Chrome を入れるか、CHROME に exe の道を入れてください'
}
Write-Host ''

# ---- 3. 鍵（YouTube） ----------------------------------------------------
foreach ($k in 'YT_CLIENT_ID', 'YT_CLIENT_SECRET', 'YT_REFRESH_TOKEN', 'YT_API_KEY', 'YT_CHANNEL') {
  $v = [Environment]::GetEnvironmentVariable($k, 'User')
  if ([string]::IsNullOrEmpty($v)) { $v = [Environment]::GetEnvironmentVariable($k) }
  if ([string]::IsNullOrEmpty($v)) { Write-Host ("[鍵] " + $k + " : 未設定") }
  else { Write-Host ("[鍵] " + $k + " : 入っています（" + $v.Length + "文字）") }
}
Write-Host '  ※ 鍵が未設定でも作品は毎日できます（上げるところだけ飛ばします）。'
Write-Host ''

# ---- 4. これまでの作品とログ ---------------------------------------------
if (Test-Path $out) {
  $dirs = @(Get-ChildItem $out -Directory -ErrorAction SilentlyContinue)
  Write-Host ("[作品] フォルダ " + $dirs.Count + " 件")
  foreach ($d in ($dirs | Sort-Object Name -Descending | Select-Object -First 3)) {
    $mb = [math]::Round((@(Get-ChildItem $d.FullName -File) | Measure-Object Length -Sum).Sum / 1MB, 1)
    Write-Host ("  " + $d.Name + "  (" + $mb + "MB)")
  }
  $log = Join-Path $out 'daily.log'
  if (Test-Path $log) {
    Write-Host ''
    Write-Host '[ログ] daily.log の終わり20行:'
    Get-Content $log -Tail 20 | ForEach-Object { Write-Host ("  " + $_) }
  } else {
    Write-Host '[ログ] daily.log がありません（まだ一度も走っていません）'
  }
} else {
  Write-Host '[作品] 置場がまだありません（一度も作っていません）'
}
Write-Host ''
Write-Host '===== ここまで ====='
