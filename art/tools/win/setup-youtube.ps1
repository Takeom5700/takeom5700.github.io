# YouTube の鍵を用意する。**一度だけ。**
#
#   art\tools\win\setup-youtube.bat をダブルクリックするだけ。
#
# やること: クライアントIDと秘密を尋ねて、ブラウザで許可を取り、
# 投稿先が合っているか確かめて、環境変数に入れる。
#
# **Google Cloud のプロジェクトと OAuth クライアントは持ち主が作るしかない。**
# あれは持ち主の Google アカウントでブラウザから操作するもので、
# 鍵を持たない側からは作れない。下に画面の順番を出すので、それに沿って作る。

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false) } catch {}

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = (Resolve-Path (Join-Path $here '..\..\..')).Path
Set-Location $repo

$WANT = '@yama-ha-i-zo'

Write-Host '===== YouTube の鍵を用意する（一度だけ）====='
Write-Host ''
Write-Host ("投稿先: primaries  " + $WANT)
Write-Host ''

# すでに入っているなら、確かめるだけにする
$has = [Environment]::GetEnvironmentVariable('YT_REFRESH_TOKEN', 'User')
if (-not [string]::IsNullOrEmpty($has)) {
  Write-Host '鍵はもう入っています。いまの投稿先を確かめます…'
  Write-Host ''
  & node (Join-Path $repo 'art\tools\upload.mjs') --whoami
  Write-Host ''
  $again = Read-Host '入れ直しますか（y で入れ直す／Enter でやめる）'
  if ($again -ne 'y') { Write-Host 'そのままにします。'; exit 0 }
}

Write-Host '--- 先に作っておくもの（ブラウザで。10分ほど）---'
Write-Host '  1. https://console.cloud.google.com/ でプロジェクトを作る'
Write-Host '  2. 「API とサービス」→ ライブラリ → YouTube Data API v3 → 有効にする'
Write-Host '  3. 「OAuth 同意画面」を作る → **「本番」に上げる**'
Write-Host '     （テストのままだと、取った鍵が7日で切れます）'
Write-Host '  4. 「認証情報」→ 認証情報を作成 → OAuth クライアント ID'
Write-Host '     → アプリの種類は **デスクトップ アプリ**'
Write-Host '  5. 出てきた「クライアント ID」と「クライアント シークレット」を下に貼る'
Write-Host ''
Write-Host '  ※ コメントを読むための「APIキー」も同じ画面で作れます（あとで足せます）'
Write-Host ''

$id = Read-Host 'クライアント ID'
if ([string]::IsNullOrWhiteSpace($id)) { Write-Host 'やめました。'; exit 1 }
$sec = Read-Host 'クライアント シークレット'
if ([string]::IsNullOrWhiteSpace($sec)) { Write-Host 'やめました。'; exit 1 }

Write-Host ''
Write-Host '--- ブラウザが開きます ---'
Write-Host ('**「チャンネルを選択」が出たら ' + $WANT + '（primaries）を選んでください。**')
Write-Host '個人のチャンネルを選ぶと、作品はそちらに上がります。'
Write-Host '（違う方を選んでも、この道具が気づいて止めます）'
Write-Host ''

& node (Join-Path $repo 'art\tools\auth.mjs') --id $id.Trim() --secret $sec.Trim() --channel $WANT --setx
$code = $LASTEXITCODE

Write-Host ''
if ($code -eq 0) {
  Write-Host '===== できました ====='
  Write-Host '**端末を開き直してから**、これで確かめてください:'
  Write-Host '  node art\tools\upload.mjs --whoami'
  Write-Host ''
  Write-Host '明日の朝6時から、作品が自動で上がります。'
  Write-Host '**API 審査が通るまで、上がった動画は非公開に固定されます**（YouTube 側の決まり）。'
  Write-Host '公開は手で押してください（1本30秒）。審査は Google Cloud から申請します。'
} else {
  Write-Host '===== 通りませんでした ====='
  Write-Host '上に出ている文言を見てください。よくあるのは次の4つ:'
  Write-Host '  ・EADDRINUSE（口が塞がっている） → 前回の許可取りが残っています。'
  Write-Host '    開いている cmd の窓を全部閉じるか、次を打ってから、もう一度動かす:'
  Write-Host '      taskkill /F /IM node.exe'
  Write-Host '  ・403 access_denied（テスト中です と出る） → Google Cloud の'
  Write-Host '    「Google 認証プラットフォーム」→「対象」→「テストユーザー」に'
  Write-Host '    自分のアドレスを足す'
  Write-Host '  ・違うチャンネルを選んだ → https://myaccount.google.com/permissions で'
  Write-Host '    許可を取り消して、もう一度この道具を動かす'
  Write-Host '  ・鍵が7日で切れた（invalid_grant） → 公開ステータスが「テスト中」の'
  Write-Host '    あいだは7日で切れます。この道具をもう一度動かせば直ります'
}
