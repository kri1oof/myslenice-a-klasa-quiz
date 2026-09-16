@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0enrich_database.ps1" %*
exit /b %ERRORLEVEL%
