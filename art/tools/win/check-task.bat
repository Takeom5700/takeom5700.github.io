@echo off
chcp 65001 >nul
rem ===================================================================
rem  ASCII ONLY. Do not write Japanese in this file.
rem  cmd.exe mis-parses UTF-8 multibyte text in .bat: it loses the line
rem  break inside a rem comment and tries to run the rest as a command
rem  ("'...' is not recognized as an internal or external command").
rem  All wording lives in the .ps1 next to this file (UTF-8 with BOM).
rem ===================================================================
rem  One-page health check. Double-click this when something looks wrong.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0check-task.ps1"
echo.
pause
