@echo off
chcp 65001 >nul
rem ===================================================================
rem  ASCII ONLY. Do not write Japanese in this file.
rem  cmd.exe mis-parses UTF-8 multibyte text in .bat: it loses the line
rem  break inside a rem comment and tries to run the rest as a command
rem  ("'...' is not recognized as an internal or external command").
rem  All wording lives in the .ps1 next to this file (UTF-8 with BOM).
rem ===================================================================
rem  Register the daily 06:00 task. Double-click this file. No admin needed.
rem  Running it twice is safe: it overwrites, so the task never duplicates.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-task.ps1"
echo.
pause
