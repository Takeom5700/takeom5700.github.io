@echo off
chcp 65001 >nul
rem ===================================================================
rem  ASCII ONLY. Do not write Japanese in this file.
rem  cmd.exe mis-parses UTF-8 multibyte text in .bat: it loses the line
rem  break inside a rem comment and tries to run the rest as a command.
rem  All wording lives in the .ps1 next to this file (UTF-8 with BOM).
rem ===================================================================
rem  Primaries: upload the newest already-made work to YouTube.
rem  Use this for works baked BEFORE the YouTube key was set up:
rem  daily.ps1 skips a day it already made, so daily.bat will not upload them.
rem  Optional arg: output folder. Default %USERPROFILE%\Desktop\Claude Art Project.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0upload-latest.ps1" %*
pause
