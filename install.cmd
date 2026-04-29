@echo off
setlocal
cd /d "%~dp0"
node scripts\run-init-then-bun-install.mjs %*
exit /b %ERRORLEVEL%
