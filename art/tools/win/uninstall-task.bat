@echo off
chcp 65001 >nul
rem 予定を消す（道具とこれまでの作品はそのまま残る）。
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall-task.ps1"
echo.
pause
