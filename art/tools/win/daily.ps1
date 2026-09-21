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
#
# **必ず1本は出る**ように三段構えにしてある。
#   1. 印（.running）で重ならないようにする
#   2. claude に時間の上限を付ける（居座っても打ち切る）
#   3. できていなければ daily.mjs 単体で作り直す（できたかは物で見る）

try { [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false) } catch {}

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = (Resolve-Path (Join-Path $here '..\..\..')).Path
$out  = if ($args.Count -ge 1 -and $args[0]) { $args[0] } `
        else { Join-Path $env:USERPROFILE 'Desktop\Claude Art Project' }

# claude に与える時間（分）。ここを過ぎたら打ち切って、機械だけで作り直す。
# 予定の打ち切り（2時間）より必ず短くしておくこと。**でないと退避路が走れない。**
# 試すときは環境変数 PRIMARIES_CLAUDE_MINUTES で上書きできる。
$CLAUDE_MINUTES = if ($env:PRIMARIES_CLAUDE_MINUTES) { [int]$env:PRIMARIES_CLAUDE_MINUTES } else { 70 }

if (-not (Test-Path $out)) { New-Item -ItemType Directory -Path $out -Force | Out-Null }
$log = Join-Path $out 'daily.log'

# ---- ログ ---------------------------------------------------------------
# **UTF-8 の印（BOM）を先頭に置く。** これが無いと、PowerShell 5.1 の
# Get-Content が Shift-JIS として読んで日本語が化ける（実際に化けた）。
# 印の無い古いログは脇へ寄せて、新しく始める。
if (Test-Path $log) {
  $head = $null
  try { $head = Get-Content -LiteralPath $log -Encoding Byte -TotalCount 3 -ErrorAction Stop } catch {}
  if (-not ($head -and $head.Count -eq 3 -and $head[0] -eq 0xEF -and $head[1] -eq 0xBB -and $head[2] -eq 0xBF)) {
    try {
      Move-Item -LiteralPath $log -Destination (Join-Path $out 'daily-old.log') -Force
    } catch {}
  }
}
if (-not (Test-Path $log)) {
  # **印は .NET で書く。** Set-Content が印を付けるかは PowerShell の版で違う
  # （5.1 は付ける／7 は付けない）。どちらでも付くようにしておく。
  try {
    [System.IO.File]::WriteAllText($log, "# Primaries daily log (UTF-8)`r`n",
      (New-Object System.Text.UTF8Encoding($true)))
  } catch {}
}

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

# 時間の上限を付けて呼ぶ。**居座ったら木ごと止める。**
# 予定の打ち切り（2時間）に食われると退避路が走れないので、こちらで先に切る。
function RunLimited([string]$exe, [string[]]$a, [int]$minutes) {
  Say ('$ ' + $exe + ' ' + ($a -join ' ') + '   （上限 ' + $minutes + '分）')
  # 置場は .NET に聞く（$env:TEMP が入っていない環境で落ちた）
  $tmpdir = [System.IO.Path]::GetTempPath()
  $o = Join-Path $tmpdir ('primaries-o-' + [guid]::NewGuid().ToString('N') + '.txt')
  $e = Join-Path $tmpdir ('primaries-e-' + [guid]::NewGuid().ToString('N') + '.txt')
  $done = $false
  try {
    $p = Start-Process -FilePath $exe -ArgumentList $a -NoNewWindow -PassThru `
           -WorkingDirectory $repo -RedirectStandardOutput $o -RedirectStandardError $e
    $done = $p.WaitForExit($minutes * 60 * 1000)
    if (-not $done) {
      Say ('  ' + $minutes + '分たっても終わらないので打ち切ります')
      try { & taskkill /PID $p.Id /T /F 2>&1 | Out-Null } catch {}
      try { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } catch {}
    }
  } catch {
    Say ('  呼べませんでした: ' + $_.Exception.Message)
  }
  foreach ($f in @($o, $e)) {
    if (Test-Path $f) {
      try {
        Get-Content -LiteralPath $f -ErrorAction SilentlyContinue | ForEach-Object {
          $line = [string]$_
          try { Add-Content -LiteralPath $log -Value $line -Encoding UTF8 } catch {}
          Write-Host $line
        }
      } catch {}
      Remove-Item -LiteralPath $f -Force -ErrorAction SilentlyContinue
    }
  }
  return $done
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

# ---- 重ならないようにする ------------------------------------------------
# 予定の側にも「走っている最中は重ねない」を入れてあるが、手で2回起こすと
# すり抜けることがあった（実際に22:09に2回入った）。こちらでも印を置く。
# **印に書いた PID が生きているかを見る。** 時刻だけで見ていると、
# 手で止めた（Stop-ScheduledTask）ときに印が残って、次の回が
# 「走っている」と誤判定して何もしなくなる。
$lock = Join-Path $out '.running'
if (Test-Path $lock) {
  # -Force が要る。名前が . で始まるものは隠しものとして扱われ、無いと言われる
  $t = $null
  try { $t = (Get-Item -LiteralPath $lock -Force).LastWriteTime } catch {}
  $txt = ''
  try { $txt = Get-Content -LiteralPath $lock -Force -Raw -ErrorAction Stop } catch {}
  $alive = $false
  if ($txt -match 'pid=(\d+)') {
    $alive = [bool](Get-Process -Id ([int]$Matches[1]) -ErrorAction SilentlyContinue)
  }
  $fresh = $t -and ((Get-Date) - $t) -lt (New-TimeSpan -Hours 3)
  if ($alive -and $fresh) {
    Say ('もう1つ走っています（' + $t.ToString('HH:mm') + ' に始まったもの）。何もしません。')
    exit 0
  }
  if ($alive) { Say '前の回がまだ居ますが、3時間を超えているので置いていきます' }
  else { Say '前の回の印が残っていますが、もう走っていないので置いていきます' }
}

try {
  Set-Content -LiteralPath $lock -Force -Value ('pid=' + $PID + ' start=' + (Get-Date -Format 's')) -Encoding UTF8

  Set-Location $repo
  Say ''
  Say ('===== ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' =====')
  Say ('リポジトリ: ' + $repo)
  Say ('置場      : ' + $out)

  # 道具とスキルを最新にする（失敗しても止めない。ネットが無い日もある）
  Run 'git' @('pull', '--ff-only')

  # その日ぶんが既にあるなら何もしない（遅れて起きた日に2本焼かないため）
  if (MadeToday $out) {
    Say '今日のぶんはもう作ってあります。何もしません。'
    Say ('----- 終わり ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' -----')
    exit 0
  }

  # claude があれば記事を読ませて作る（本命）。無ければ／出来ていなければ機械だけで作る。
  $c = Get-Command claude -ErrorAction SilentlyContinue
  if ($c) {
    # **この一行は ASCII で書く。** 日本語の指示は art/DAILY-PROMPT.md の中にある
    # （長い日本語を命令行に載せると、端末の文字集合で化ける端末がある）。
    $prompt = 'Follow art/DAILY-PROMPT.md and complete today''s work. ' +
              'Output folder: "' + $out + '". ' +
              'If today''s work already exists in that folder, do nothing.'
    $cargs = @('-p', $prompt,
      '--allowedTools', 'Bash(node *)', 'Bash(git *)', 'Read', 'Edit', 'Write', 'WebFetch')

    # npm の入れ方によって claude は .cmd / .ps1 / .exe のどれかで来る。
    # Start-Process は .ps1 を直に起こせないので、そのときは powershell を通す。
    $exe = $c.Source
    $argv = $cargs
    if ($exe -like '*.ps1') {
      $sib = Join-Path (Split-Path -Parent $exe) 'claude.cmd'
      if (Test-Path $sib) {
        $exe = $sib
      } else {
        $argv = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $exe) + $cargs
        $exe  = 'powershell'
      }
    }
    Say '[claude] 記事を読んで作ります'
    RunLimited $exe $argv $CLAUDE_MINUTES | Out-Null
  } else {
    Say '[claude] claude が見つかりません'
  }

  # **できたかどうかは物で見る。** claude が黙って失敗しても、ここで拾う。
  if (MadeToday $out) {
    Say '[claude] できました'
  } else {
    if ($c) { Say '[claude] 今日のぶんができていません。機械だけで作り直します' }
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
} finally {
  Remove-Item -LiteralPath $lock -Force -ErrorAction SilentlyContinue
}
