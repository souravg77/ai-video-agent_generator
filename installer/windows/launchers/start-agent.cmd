@echo off
setlocal
call "%~dp0_env.cmd"
cd /d "%APP%"
echo.
echo   Starting the agent. The review page opens at http://localhost:3000
echo   Leave this window open while the agent runs; close it to stop.
echo.
rem Open the review page a few seconds after the server has had time to start.
start "" cmd /c "ping -n 7 127.0.0.1 >nul & start http://localhost:3000"
call "%NPM%" run agent
