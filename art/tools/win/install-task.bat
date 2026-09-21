@echo off
chcp 65001 >nul
rem ===================================================================
rem  毎朝6時に daily.bat を起こす予定を登録する。
rem  **このファイルをダブルクリックするだけ。** 管理者権限は要らない。
rem
rem  時刻を変えたいときは、下の TIME を 06:00 から書き換える。
rem  やめたいときは uninstall-task.bat を叩く。
rem ===================================================================

set "TASK=Primaries daily"
set "TIME=06:00"
set "DAILY=%~dp0daily.bat"

echo 予定を登録します: %TASK%  毎日 %TIME%
echo 叩くもの: %DAILY%
echo.

schtasks /create /tn "%TASK%" /tr "\"%DAILY%\"" /sc daily /st %TIME% /f
if errorlevel 1 (
  echo.
  echo 登録に失敗しました。コマンドプロンプトから実行して、出ている文言を見てください。
  pause
  exit /b 1
)

rem スリープしていても起こす／時刻を逃したら次に起きたときに実行する／
rem 電池でも動かす／2時間で打ち切る（録画は6分だが、余裕を見る）
powershell -NoProfile -Command ^
  "$t = Get-ScheduledTask -TaskName '%TASK%';" ^
  "$t.Settings.WakeToRun = $true;" ^
  "$t.Settings.StartWhenAvailable = $true;" ^
  "$t.Settings.DisallowStartIfOnBatteries = $false;" ^
  "$t.Settings.StopIfGoingOnBatteries = $false;" ^
  "$t.Settings.ExecutionTimeLimit = 'PT2H';" ^
  "Set-ScheduledTask -InputObject $t | Out-Null;" ^
  "Write-Host '細かい設定も入れました（スリープ解除・取りこぼしの拾い直し）'"

echo.
echo できました。次の実行予定:
schtasks /query /tn "%TASK%" /fo list | findstr /i "次回 Next"
echo.
echo いますぐ1回試すなら:  schtasks /run /tn "%TASK%"
echo ログ: %USERPROFILE%\Desktop\Claude Art Project\daily.log
pause
