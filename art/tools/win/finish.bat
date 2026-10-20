@echo off
chcp 65001 >nul
rem ===================================================================
rem  ASCII ONLY. Do not write Japanese in this file.
rem  cmd.exe mis-parses UTF-8 multibyte text in .bat: it loses the line
rem  break inside a rem comment and tries to run the rest as a command.
rem  All wording lives in the .ps1 next to this file (UTF-8 with BOM).
rem ===================================================================
rem  Primaries: do every remaining setup step in one go.
rem  1 pull tools, 2 install the 6am task, 3 get the YouTube key,
rem  4 upload any work not yet uploaded, 5 report the three conditions.
rem  Optional arg: output folder. Default %USERPROFILE%\Desktop\Claude Art Project.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0finish.ps1" %*
pause
