@echo off
chcp 65001 >nul
setlocal
rem ===================================================================
rem  Primaries — 毎日1本つくる（タスクスケジューラから呼ばれる）
rem
rem  置き場所はここのまま（art\tools\win\daily.bat）。
rem  リポジトリの場所は自分で割り出すので、どこに clone してあってもよい。
rem  手で試すときは、このファイルをダブルクリックするだけでよい。
rem ===================================================================

rem このファイルから3つ上がリポジトリの根
set "REPO=%~dp0..\..\.."
set "OUTDIR=%USERPROFILE%\Desktop\Claude Art Project"
if not "%~1"=="" set "OUTDIR=%~1"

if not exist "%OUTDIR%" mkdir "%OUTDIR%"
set "LOG=%OUTDIR%\daily.log"

cd /d "%REPO%"
if errorlevel 1 goto norepo

echo.>> "%LOG%"
echo ===== %date% %time% =====>> "%LOG%"

rem 道具を最新にする（失敗しても止めない。ネットが無い日もあるので）
git pull --ff-only >> "%LOG%" 2>&1

rem Claude Code があれば、記事を読ませて作る（本命）。
rem 無ければ機械だけで作る（記事の URL から種を決める受け皿）。
where claude >nul 2>&1
if errorlevel 1 goto machine

echo [claude] 記事を読んで作ります>> "%LOG%"
claude -p "art/DAILY-PROMPT.md の『毎日のプロンプト』を最後まで実行してください。置き場は %OUTDIR% です。その日ぶんが既にあるなら何もしないでください。" --allowedTools "Bash(node *)" "Bash(git *)" Read Edit Write WebFetch >> "%LOG%" 2>&1
if errorlevel 1 goto fallback
goto done

:fallback
echo [claude] 失敗したので、機械だけで作り直します>> "%LOG%"
goto machine

:machine
echo [node] 機械だけで作ります>> "%LOG%"
rem YouTube の鍵がまだ無い日は、作るところまでやって上げない
rem （チャンネルを作る前でも作品は毎日溜まる）
if "%YT_REFRESH_TOKEN%"=="" goto nokey
node art\tools\daily.mjs --out "%OUTDIR%" --skip-if-done --upload >> "%LOG%" 2>&1
goto done

:nokey
echo [node] YouTube の鍵が無いので、作るところまで（上げません）>> "%LOG%"
node art\tools\daily.mjs --out "%OUTDIR%" --skip-if-done >> "%LOG%" 2>&1
goto done

:norepo
echo リポジトリが見つかりません: %REPO%
exit /b 1

:done
echo ----- 終わり %date% %time% ----->> "%LOG%"
endlocal
exit /b 0
