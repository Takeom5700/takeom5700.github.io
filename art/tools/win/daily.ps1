# Primaries — 毎日1本つくる。**中身はこちら**（daily.bat はこれを呼ぶだけ）。
#
#   art\tools\win\daily.bat            置場は既定（デスクトップの Claude Art Project）
#   art\tools\win\daily.bat "D:\別の場所"
#
# **なぜ .bat を薄くして .ps1 に移したか。**
# cmd.exe は UTF-8 の日本語を含む .bat を読み損なう。rem コメントの途中で
# 行の切れ目を見失い、続きをコマンドとして実行しようとして
# 「'…は6分だが、余裕を見る）' is not recognized」を出す（実際に出た）。
# **.bat には ASCII しか書かない。日本語はこの .ps1 に置く**（BOM 付きなので安全）。

try { [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false) } catch {}

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = (Resolve-Path (Join-Path $here '..\..\..')).Path
$out  = if ($args.Count -ge 1 -and $args[0]) { $args[0] } `
        else { Join-Path $env:USERPROFILE 'Desktop\Claude Art Project' }

if (-not (Test-Path $out)) { New-Item -ItemType Directory -Path $out -Force | Out-Null }
$log = Join-Path $out 'daily.log'

function Say([string]$s) {
  try { Add-Content -LiteralPath $log -Value $s -Encoding UTF8 } catch {}
  Write-Host $s
}
# 外の道具を呼んで、出てきたものを画面とログの両方へ流す
function Run([string]$exe, [string[]]$a) {
  Say ('$ ' + $exe + ' ' + ($a -join ' '))
  & $exe @a 2>&1 | ForEach-Object {
    $line = [string]$_
    try { Add-Content -LiteralPath $log -Value $line -Encoding UTF8 } catch {}
    Write-Host $line
  }
}

# **その日ぶんができたかを、終了コードではなく物で見る。**
# claude は .ps1 や .cmd の包みを通って呼ばれるので、終了コードが素直に
# 返ってこないことがある（未ログインで失敗したのに退避路へ落ちなかった）。
# フォルダと .state.json を見れば、できたかどうかは確実に分かる。
function MadeToday([string]$dir) {
  $today = Get-Date -Format 'yyyy-MM-dd'
  $stamp = $today.Replace('-', '')
  $hit = @(Get-ChildItem $dir -Directory -ErrorAction SilentlyContinue |
           Where-Object { $_.Name.StartsWith($today) -or $_.Name.StartsWith($stamp) })
  if ($hit.Count) { return $true }
  $st = Join-Path $dir '.state.json'
  if (Test-Path $st) {
    try {
      $j = Get-Content -LiteralPath $st -Raw -Encoding UTF8 | ConvertFrom-Json
      if (@($j.works | Where-Object { $_.date -eq $today }).Count) { return $true }
    } catch {}
  }
  return $false
}

Set-Location $repo
Say ''
Say ('===== ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' =====')
Say ('リポジトリ: ' + $repo)
Say ('置場      : ' + $out)

# 道具とスキルを最新にする（失敗しても止めない。ネットが無い日もある）
Run 'git' @('pull', '--ff-only') | Out-Null

# その日ぶんが既にあるなら何もしない（遅れて起きた日に2本焼かないため）
if (MadeToday $out) {
  Say '今日のぶんはもう作ってあります。何もしません。'
  Say ('----- 終わり ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' -----')
  exit 0
}

# claude があれば記事を読ませて作る（本命）。無ければ／出来ていなければ機械だけで作る。
$claude = Get-Command claude -ErrorAction SilentlyContinue
if ($claude) {
  Say '[claude] 記事を読んで作ります'
  # **この一行は ASCII で書く。** 日本語の指示は art/DAILY-PROMPT.md の中にある
  # （長い日本語を命令行に載せると、端末の文字集合で化ける端末がある）。
  $prompt = 'Follow art/DAILY-PROMPT.md and complete today''s work. ' +
            'Output folder: "' + $out + '". ' +
            'If today''s work already exists in that folder, do nothing.'
  Run $claude.Source @('-p', $prompt,
    '--allowedTools', 'Bash(node *)', 'Bash(git *)', 'Read', 'Edit', 'Write', 'WebFetch')
} else {
  Say '[claude] claude が見つかりません'
}

# **できたかどうかは物で見る。** claude が黙って失敗しても、ここで拾う。
if (MadeToday $out) {
  Say '[claude] できました'
} else {
  if ($claude) { Say '[claude] 今日のぶんができていません。機械だけで作り直します' }
  Say '  （claude が「Not logged in」と言っていたら、一度 claude を手で立ち上げて'
  Say '   /login を通してください。それまでは記事を読まずに作ります）'
  $a = @('art\tools\daily.mjs', '--out', $out, '--skip-if-done')
  if ($env:YT_REFRESH_TOKEN) {
    Say '[node] 作って YouTube まで上げます'
    $a += '--upload'
  } else {
    Say '[node] YouTube の鍵が無いので、作るところまで（上げません）'
  }
  Run 'node' $a
  if (MadeToday $out) { Say '[node] できました' }
  else { Say '[node] できませんでした。上のログを見てください' }
}

Say ('----- 終わり ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' -----')
