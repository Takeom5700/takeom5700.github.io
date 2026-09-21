@echo off
chcp 65001 >nul
set "TASK=Primaries daily"
schtasks /delete /tn "%TASK%" /f
echo 予定を消しました（道具とこれまでの作品はそのままです）。
pause
