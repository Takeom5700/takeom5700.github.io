@echo off
chcp 65001 >nul
rem ===================================================================
rem  毎朝6時に daily.bat を起こす予定を登録する。
rem  **このファイルをダブルクリックするだけ。** 管理者権限は要らない。
rem
rem  中身は install-task.ps1（PowerShell）。何度やっても上書きなので、
rem  二度叩いても予定は増えない。やめたいときは uninstall-task.bat。
rem ===================================================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-task.ps1"
echo.
pause
