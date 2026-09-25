# できている作品を YouTube へ上げる。**投稿の道はここ1本だけ。**
#
#   art\tools\win\upload-latest.bat をダブルクリックするだけ。
#   （毎朝の daily.ps1 がこれを呼ぶので、普段は自分で動かす必要はない）
#
# なぜ要るのか:
#   1. 毎朝の daily.ps1 は、鍵（YT_REFRESH_TOKEN）が無い日は
#      **作るところまでで止まる**（上げない）。しかも「その日ぶんが既にあるなら
#      何もしない」ので、あとから daily.bat を叩いても上がらない。
#      つまり鍵を入れるより前に焼けた作品は、置場に残ったまま永久に上がらなかった。
#   2. さらに、記事を読んで作る本命の経路（claude）には
#      **そもそも投稿の処理が付いていなかった**（--upload は機械だけの経路にしか
#      無かった）。だから claude が作った日は一度も上がらない作りだった。
#
# **まだ上げていない作品を、古い順に上げる**（既定で3本まで）。
# 上げたフォルダに印（`.uploaded`）を置いて覚えるので二度上げない。
# 1本 1600 quota・1日の上限 10,000 なので **1日6本が限界**。3本で止めてある。

$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false) } catch {}

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = (Resolve-Path (Join-Path $here '..\..\..')).Path
Set-Location $repo

$out = if ($args.Count -ge 1 -and $args[0]) { $args[0] }
       else { Join-Path $env:USERPROFILE 'Desktop\Claude Art Project' }
$max = if ($args.Count -ge 2 -and $args[1]) { [int]$args[1] } else { 3 }

Write-Host '===== できている作品を YouTube へ上げる ====='
Write-Host ''

# **環境変数は開いている窓には届かない。** `setx` は「利用者の環境」に書くだけで、
# 走っている process には見えない。鍵を入れた直後の窓でここを動かすと
# 「鍵がありません」と出る（実際に出た）。だから利用者の環境から直に読み直す。
foreach ($k in 'YT_CLIENT_ID', 'YT_CLIENT_SECRET', 'YT_REFRESH_TOKEN', 'YT_CHANNEL') {
  $cur = [Environment]::GetEnvironmentVariable($k, 'Process')
  if ([string]::IsNullOrEmpty($cur)) {
    $v = [Environment]::GetEnvironmentVariable($k, 'User')
    if ($v) { [Environment]::SetEnvironmentVariable($k, $v, 'Process') }
  }
}

if (-not (Test-Path $out)) {
  Write-Host ('置場が見つかりません: ' + $out)
  Write-Host 'まだ1本も作れていないようです。art\tools\win\daily.bat を先に動かしてください。'
  exit 1
}

if ([string]::IsNullOrEmpty($env:YT_REFRESH_TOKEN)) {
  Write-Host 'YouTube の鍵がありません。'
  Write-Host '先に art\tools\win\setup-youtube.bat を動かしてください。'
  Write-Host '（art\tools\win\finish.bat なら、鍵の取得から投稿まで通しでやります）'
  exit 1
}

# 作品のフォルダは「日付 題名 番号」という名前で並んでいる。**古い順**に上げる
# （溜まっているとき、先に作ったものから順に出る方が並びとして自然）。
$dirs = @(Get-ChildItem -LiteralPath $out -Directory -ErrorAction SilentlyContinue |
  Sort-Object Name)
if ($dirs.Count -eq 0) { Write-Host '作品のフォルダがありません。'; exit 0 }

$todo = @()
foreach ($d in $dirs) {
  if (Test-Path (Join-Path $d.FullName '.uploaded')) { continue }
  $film = @(Get-ChildItem -LiteralPath $d.FullName -Filter '*.webm' -ErrorAction SilentlyContinue)
  if ($film.Count -eq 0) { continue }
  $todo += @{ dir = $d; film = $film[0] }
}

if ($todo.Count -eq 0) {
  Write-Host 'まだ上げていない作品はありません（全部上げ済みです）。'
  exit 0
}

$take = [Math]::Min($todo.Count, $max)
Write-Host ('まだ上げていない作品: ' + $todo.Count + ' 本（この回は ' + $take + ' 本まで）')
Write-Host '**審査を通すまで、上げた動画は非公開に固定されます**（YouTube 側の決まり）。'
Write-Host '公開は YouTube Studio から手で押してください。'
Write-Host ''

$done = 0
$fail = 0
foreach ($it in $todo) {
  if ($done -ge $max) { break }
  $film = $it.film
  $dir = $it.dir
  # 題名は映像のファイル名から取る（Zenith-683.webm → "Zenith 683"）
  $base = [IO.Path]::GetFileNameWithoutExtension($film.Name)
  $title = $base -replace '-', ' '
  $descFile = Join-Path $dir.FullName ($base + '.txt')

  Write-Host ('--- ' + $title + '（' + [math]::Round($film.Length / 1MB, 1) + ' MB）---')
  # **動画の番号をファイルに書かせる。** 棚（art/works/index.html）が
  # 「YouTube で見る」を出すのに要る。画面の文字を拾うと書式を変えた日に壊れる。
  $idFile = Join-Path $dir.FullName '.videoid'
  $a = @('art\tools\upload.mjs', $film.FullName, '--title', $title,
    '--privacy', 'private', '--id-file', $idFile)
  if (Test-Path $descFile) { $a += @('--desc-file', $descFile) }
  & node $a
  if ($LASTEXITCODE -eq 0) {
    Set-Content -LiteralPath (Join-Path $dir.FullName '.uploaded') -Value (Get-Date -Format 's') -Encoding UTF8
    $done++
    Write-Host ('  上がりました（' + $title + '）')
  } else {
    $fail++
    Write-Host ('  上がりませんでした（' + $title + '）')
    # **鍵の問題なら次の作品でも必ず同じところで落ちる。** 続けても quota を
    # 無駄に食うだけなので、1本落ちたらそこで止める。
    break
  }
  Write-Host ''
}

Write-Host ''
if ($done -gt 0) {
  Write-Host ('===== ' + $done + ' 本上がりました =====')
  Write-Host 'YouTube Studio の「コンテンツ」に非公開で入っています。'
  # 台帳へ動画の番号を書き足す（棚が「YouTube で見る」を出せるように）
  & node (Join-Path $repo 'art\tools\shelf.mjs') $out
}
if ($fail -gt 0) {
  Write-Host '===== 上がらなかったものがあります ====='
  Write-Host '上に出ている文言を見てください。よくあるのは:'
  Write-Host '  ・invalid_grant → 鍵が切れています（テスト中は7日で切れる）。'
  Write-Host '    art\tools\win\finish.bat を動かせば取り直して上げ直します'
  Write-Host '  ・違うチャンネルを指している → node art\tools\upload.mjs --whoami で確かめる'
  exit 1
}
