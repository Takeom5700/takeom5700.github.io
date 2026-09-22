# できている作品を YouTube へ上げる。**鍵を入れる前に焼いた作品を拾うための道具。**
#
#   art\tools\win\upload-latest.bat をダブルクリックするだけ。
#
# 毎朝の `daily.ps1` は、鍵（YT_REFRESH_TOKEN）が無い日は
# **作るところまでで止まる**（上げない）。だから鍵を入れるより前の日に
# 焼けた作品は、置場のフォルダに残ったまま上がらない。
# `daily.ps1` は「その日ぶんが既にあるなら何もしない」ので、
# あとから `daily.bat` を叩いても上がらない。これがその抜け道。
#
# 上げるのは**いちばん新しい作品1本**。すでに上げたものは印（.uploaded）で覚える。

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false) } catch {}

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = (Resolve-Path (Join-Path $here '..\..\..')).Path
Set-Location $repo

$out = if ($args.Count -ge 1 -and $args[0]) { $args[0] }
       else { Join-Path $env:USERPROFILE 'Desktop\Claude Art Project' }

Write-Host '===== できている作品を YouTube へ上げる ====='
Write-Host ''

if (-not (Test-Path $out)) {
  Write-Host ('置場が見つかりません: ' + $out)
  Write-Host 'まだ1本も作れていないようです。art\tools\win\daily.bat を先に動かしてください。'
  exit 1
}

if ([string]::IsNullOrEmpty($env:YT_REFRESH_TOKEN)) {
  Write-Host 'YouTube の鍵がありません。'
  Write-Host '先に art\tools\win\setup-youtube.bat を動かしてください。'
  Write-Host '（鍵を入れたあとは**端末を開き直す**こと。開いたままだと環境変数が届きません）'
  exit 1
}

# 作品のフォルダは「日付 題名 番号」という名前で並んでいる。新しい順に見る。
$dirs = @(Get-ChildItem -LiteralPath $out -Directory -ErrorAction SilentlyContinue |
  Sort-Object Name -Descending)
if ($dirs.Count -eq 0) { Write-Host '作品のフォルダがありません。'; exit 1 }

$target = $null
foreach ($d in $dirs) {
  $mark = Join-Path $d.FullName '.uploaded'
  if (Test-Path $mark) { continue }
  $film = @(Get-ChildItem -LiteralPath $d.FullName -Filter '*.webm' -ErrorAction SilentlyContinue)
  if ($film.Count -eq 0) { continue }
  $target = @{ dir = $d; film = $film[0] }
  break
}

if (-not $target) {
  Write-Host 'まだ上げていない作品は見つかりませんでした（全部上げ済みのようです）。'
  Write-Host ('見た場所: ' + $out)
  exit 0
}

$film = $target.film
$dir = $target.dir
# 題名は映像のファイル名から取る（Zenith-683.webm → "Zenith 683"）
$base = [IO.Path]::GetFileNameWithoutExtension($film.Name)
$title = $base -replace '-', ' '
$descFile = Join-Path $dir.FullName ($base + '.txt')

Write-Host ('作品  : ' + $film.FullName)
Write-Host ('題名  : ' + $title)
Write-Host ('大きさ: ' + [math]::Round($film.Length / 1MB, 1) + ' MB')
Write-Host ''
Write-Host '**審査を通すまで、上げた動画は非公開に固定されます**（YouTube 側の決まり）。'
Write-Host '公開は YouTube Studio から手で押してください。'
Write-Host ''

$a = @('art\tools\upload.mjs', $film.FullName, '--title', $title, '--privacy', 'private')
if (Test-Path $descFile) { $a += @('--desc-file', $descFile) }

& node $a
$code = $LASTEXITCODE
Write-Host ''
if ($code -eq 0) {
  Set-Content -LiteralPath (Join-Path $dir.FullName '.uploaded') `
    -Value ((Get-Date -Format 's')) -Encoding UTF8
  Write-Host '===== 上がりました ====='
  Write-Host 'YouTube Studio の「コンテンツ」に非公開で入っています。'
  Write-Host '明日からは毎朝6時に自動で上がります。'
} else {
  Write-Host '===== 上がりませんでした ====='
  Write-Host '上に出ている文言を見てください。よくあるのは:'
  Write-Host '  ・invalid_grant → 鍵が切れています（テスト中は7日で切れる）。'
  Write-Host '    art\tools\win\setup-youtube.bat をもう一度動かす'
  Write-Host '  ・違うチャンネルを指している → node art\tools\upload.mjs --whoami で確かめる'
}
