@echo off
chcp 65001 >nul
rem ===================================================================
rem  ASCII ONLY. Do not write Japanese in this file.
rem  cmd.exe mis-parses UTF-8 multibyte text in .bat: it loses the line
rem  break inside a rem comment and tries to run the rest as a command.
rem  All wording lives in update.ps1 (UTF-8 with BOM).
rem ===================================================================
rem  Pull the latest tools. Double-click this instead of typing git pull.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0update.ps1"
echo.
pause
