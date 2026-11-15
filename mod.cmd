@echo off
setlocal
node --experimental-strip-types "%~dp0tools\mod.ts" %*
exit /b %ERRORLEVEL%
