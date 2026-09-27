# **残りの支度を1回で全部やる。** ダブルクリックするのはこれだけでよい。
#
#   art\tools\win\finish.bat
#
# やること（足りないものだけを順に埋める）:
#   1. 道具を最新にする（git pull／台帳は写しを取って足し戻す）
#   2. 毎朝6時の予定が入っているか見て、無ければ入れる
#   3. YouTube の鍵が「効く」か確かめ、効かなければ取り直す
#      → **ここだけはブラウザで「許可」を押す必要がある**（人しか押せない）
#   4. まだ上げていない作品を YouTube へ上げる
#   5. 最後に「毎朝の投稿が動く条件3つ」の合否を出す
#
# **環境変数は開いている窓には届かない**という落とし穴を、ここで潰してある。
# `setx` は「利用者の環境」に書くだけなので、走っている process には見えない。
# だから利用者の環境から**直に読み直して**この process に載せる。
# これで端末を開き直さずに、鍵を取った直後そのまま投稿まで進める
# （開き直しを忘れて「鍵が無い」と出るのを、実際に踏んだ）。

$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false) } catch {}

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = (Resolve-Path (Join-Path $here '..\..\..')).Path
Set-Location $repo

$Task = 'Primaries daily'
$out = if ($args.Count -ge 1 -and $args[0]) { $args[0] }
       else { Join-Path $env:USERPROFILE 'Desktop\Claude Art Project' }

function Head($t) { Write-Host ''; Write-Host ('===== ' + $t + ' =====') }

# 利用者の環境から鍵を読み直して、この process に載せる
function LoadKeys {
  foreach ($k in 'YT_CLIENT_ID', 'YT_CLIENT_SECRET', 'YT_REFRESH_TOKEN', 'YT_CHANNEL') {
    $v = [Environment]::GetEnvironmentVariable($k, 'User')
    if ($v) { [Environment]::SetEnvironmentVariable($k, $v, 'Process') }
  }
}

Write-Host '===== Primaries - 残りの支度を全部やります ====='
Write-Host ('リポジトリ: ' + $repo)
Write-Host ('置場      : ' + $out)

# ---- 1. 道具を最新にする ------------------------------------------------
Head '1/5 道具を最新にする'
# **台帳だけは写しを取ってから。** stash して pop しないので、書き込みが消える。
$ledger = Join-Path $repo 'art\works\ledger.json'
$ledgerSave = Join-Path $env:TEMP 'primaries-ledger-save.json'
if (Test-Path $ledger) { Copy-Item $ledger $ledgerSave -Force -ErrorAction SilentlyContinue }

$dirty = @(& git status --porcelain 2>$null | Where-Object { $_ -notmatch '^\?\?' })
if ($dirty.Count) {
  Write-Host ('手元の直しかけ ' + $dirty.Count + ' 件を脇へ置きます（git stash）')
  & git stash push -m ('finish ' + (Get-Date -Format 'yyyy-MM-dd HH:mm')) | Out-Null
}
& git pull --ff-only
if ($LASTEXITCODE -eq 0) {
  Write-Host '最新にしました。'
  if (Test-Path $ledgerSave) {
    & node (Join-Path $repo 'art\tools\ledger-merge.mjs') $ledgerSave
  }
} else {
  Write-Host '引けませんでした（ネットが無い日かもしれません）。先へ進みます。'
}

# ---- 2. 毎朝6時の予定 ---------------------------------------------------
Head '2/5 毎朝6時の予定'
$haveTask = $false
try {
  $all = @(Get-ScheduledTask -ErrorAction Stop | Where-Object { $_.TaskName -eq $Task })
  if ($all.Count -ge 1) {
    $haveTask = $true
    Write-Host ('入っています（' + $all.Count + ' 件）')
    $info = Get-ScheduledTaskInfo -TaskName $Task -ErrorAction SilentlyContinue
    if ($info) { Write-Host ('  次に動くのは: ' + $info.NextRunTime) }
    if ($all.Count -gt 1) {
      Write-Host '  **二重に入っています。** uninstall-task.bat → install-task.bat で直せます'
    }
  }
} catch { }
if (-not $haveTask) {
  Write-Host '入っていないので、入れます...'
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $here 'install-task.ps1')
}

# ---- 3. YouTube の鍵 ----------------------------------------------------
Head '3/5 YouTube の鍵'
# **鍵が「有る」ことと「効く」ことは別。**
#   ・テスト中の同意画面だと7日で切れる（invalid_grant）
#   ・許可を取り消したあとも環境変数だけは残る
# だから有無で判断せず、**実際に投稿先を聞いてみて**、通らなければ取り直す。
$whoami = 1
for ($try = 1; $try -le 2; $try++) {
  LoadKeys
  if (-not [string]::IsNullOrEmpty($env:YT_REFRESH_TOKEN)) {
    Write-Host '鍵があります。効くかどうか、投稿先を聞いてみます...'
    & node (Join-Path $repo 'art\tools\upload.mjs') --whoami
    $whoami = $LASTEXITCODE
    if ($whoami -eq 0) { break }
    Write-Host ''
    Write-Host 'いまの鍵は効きませんでした（切れている／取り消された）。取り直します。'
  } else {
    Write-Host '鍵がありません。これから許可を取りに行きます。'
  }
  if ($try -ge 2) { break }
  Write-Host ''
  Write-Host '**ここだけは人が押す必要があります。**'
  Write-Host '  ・ブラウザが開いたら primaries（@yama-ha-i-zo）を選ぶ'
  Write-Host '  ・「Google で確認されていません」と出たら'
  Write-Host '    「詳細」→「Primaries（安全ではないページ）に移動」'
  Write-Host '  ・ブラウザが開かなければ、窓に出るファイルの場所をダブルクリック'
  Write-Host ''
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $here 'setup-youtube.ps1')
  # 取れたぶんは次の回し（$try=2）で LoadKeys が拾う。端末を開き直さなくてよい
}
if ($whoami -ne 0) {
  Write-Host ''
  Write-Host '鍵が使える状態になりませんでした。上のログを見てください。'
  Write-Host 'ここから先（投稿）は進めないので、いったん終わります。'
  Write-Host '**作品を作るところまでは、明日の朝6時に自動で動きます**（上がらないだけ）。'
  Write-Host 'あとでこの道具をもう一度動かせば、溜まったぶんもまとめて上がります。'
  exit 1
}

# ---- 4. まだ上げていない作品を上げる ------------------------------------
Head '4/5 まだ上げていない作品を YouTube へ'
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $here 'upload-latest.ps1') $out 3

# ---- 5. 合否 ------------------------------------------------------------
Head '5/5 毎朝の投稿が動く条件'
$ok1 = $false
try { $ok1 = @(Get-ScheduledTask -ErrorAction Stop | Where-Object { $_.TaskName -eq $Task }).Count -ge 1 } catch {}
$ok2 = ($whoami -eq 0)
$branch = (& git rev-parse --abbrev-ref HEAD 2>$null)
$behind = (& git rev-list --count 'HEAD..@{u}' 2>$null)
$ok3 = ([string]::IsNullOrEmpty($behind) -or $behind -eq '0')

Write-Host (' 1. 毎朝6時の予定 : ' + $(if ($ok1) { 'OK 入っている' } else { 'NG 入っていない' }))
Write-Host (' 2. YouTube の鍵  : ' + $(if ($ok2) { 'OK 正しいチャンネルを指している' } else { 'NG 無い／効かない' }))
Write-Host (' 3. 道具が最新    : ' + $(if ($ok3) { 'OK 最新' } else { 'NG 引けていない' }) + '（枝: ' + $branch + '）')
Write-Host ''
if ($ok1 -and $ok2 -and $ok3) {
  Write-Host '===== 支度は全部そろいました ====='
  Write-Host '明日の朝6時から、記事を読んで1本作って YouTube へ上げます。'
  Write-Host '**API 審査が通るまで、上がった動画は非公開に固定されます**（YouTube 側の決まり）。'
  Write-Host '公開は YouTube Studio から手で押してください。'
} else {
  Write-Host '===== まだ足りないものがあります ====='
  Write-Host '上の NG を見てください。もう一度この道具を動かせば、続きから埋めます。'
}
