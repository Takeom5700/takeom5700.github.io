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

& git pull --ff-only
$code = $LASTEXITCODE
Write-Host ''

if ($code -ne 0) {
  Write-Host '取り込めませんでした。上に出ている文言を見てください。'
  Write-Host 'よくあるのは「手元で何かを直していて競合している」。そのときは:'
  Write-Host '  git stash   （直しかけを脇に置く）'
  Write-Host '  git pull'
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
