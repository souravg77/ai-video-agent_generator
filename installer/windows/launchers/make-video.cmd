@echo off
setlocal
call "%~dp0_env.cmd"
cd /d "%APP%"
set "TOPIC=%~1"
if "%TOPIC%"=="" set /p TOPIC="Enter a video topic: "
if "%TOPIC%"=="" (
  echo No topic given.
  pause
  exit /b 1
)
call "%NPM%" run make -- --topic "%TOPIC%"
echo.
echo   Finished video folders are under: %APP%\out
echo.
pause
