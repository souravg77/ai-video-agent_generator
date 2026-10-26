@echo off
setlocal
call "%~dp0_env.cmd"
cd /d "%APP%"
echo.
echo   AI Video Agent - Setup
echo   ----------------------
echo   For each step you can connect a paid API or pick a free local tool.
echo   Your choices are saved to .env, then every credential is tested.
echo.
call "%NPM%" run setup
echo.
echo   Done. You can now use "Make a Video" from the Start menu.
echo.
pause
