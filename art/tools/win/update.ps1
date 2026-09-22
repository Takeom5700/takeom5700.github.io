# 道具を最新にする。**ダブルクリックするだけ。**
#
#   art\tools\win\update.bat
#
# `git pull` を打つためだけに端末を開くのが手間だったので、
# フォルダから叩けるようにした（毎朝の自動実行も同じことを先にやっている）。
# 何が新しく来たかを最後に並べる。

$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false) } catch {}

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = (Resolve-Path (Join-Path $here '..\..\..')).Path
Set-Location $repo

Write-Host ('リポジトリ: ' + $repo)
$before = (& git rev-parse HEAD 2>$null)
$branch = (& git rev-parse --abbrev-ref HEAD 2>$null)
Write-Host ('ブランチ  : ' + $branch)
Write-Host ''

# **手元の直しかけを先に脇へ置く。** 毎朝の自動実行（claude）が
# art/js/score.js などを書き換えてコミットせずに残すので、そのままだと
# 「Your local changes would be overwritten by merge」で止まる
# （実際に持ち主のパソコンで止まった）。stash なので捨てずに取っておける。
# **台帳だけは写しを取ってから。** stash して pop しないので、
# 前の晩に書いた台帳が一緒に棚上げされて消える（実際に消えていた）。
$ledger = Join-Path $repo 'art\works\ledger.json'
$ledgerSave = Join-Path $env:TEMP 'primaries-ledger-save.json'
if (Test-Path $ledger) { Copy-Item $ledger $ledgerSave -Force }

$dirty = @(& git status --porcelain 2>$null | Where-Object { $_ -notmatch '^\?\?' })
if ($dirty.Count) {
  Write-Host ('手元の直しかけが ' + $dirty.Count + ' 件あります。脇へ置きます（git stash）:')
  foreach ($d in $dirty) { Write-Host ('  ' + $d) }
  & git stash push -m ('auto ' + (Get-Date -Format 'yyyy-MM-dd HH:mm')) | Out-Null
  Write-Host '（戻したいときは git stash list → git stash pop）'
  Write-Host ''
}

& git pull --ff-only
$code = $LASTEXITCODE
Write-Host ''

if ($code -eq 0 -and (Test-Path $ledgerSave)) {
  & node (Join-Path $repo 'art\tools\ledger-merge.mjs') $ledgerSave
  Write-Host ''
}

if ($code -ne 0) {
  Write-Host '取り込めませんでした。上に出ている文言を見てください。'
  exit 1
}

$after = (& git rev-parse HEAD 2>$null)
if ($before -eq $after) {
  Write-Host 'もう最新です（新しいものはありません）。'
  exit 0
}

Write-Host '--- 新しく来たもの ---'
& git diff --name-status $before $after | ForEach-Object { Write-Host ('  ' + $_) }
Write-Host ''
Write-Host '--- 何をした変更か ---'
& git log --oneline --no-decorate "$before..$after" | ForEach-Object { Write-Host ('  ' + $_) }
Write-Host ''

# 今日いちばん使うものが届いたなら、名指しで知らせる
if (Test-Path (Join-Path $repo 'art\tools\win\setup-youtube.bat')) {
  Write-Host 'YouTube の鍵を用意する道具が入っています:'
  Write-Host '  art\tools\win\setup-youtube.bat   ← ダブルクリック'
}
