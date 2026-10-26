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

rem If free local mode was chosen, the writing/voice tools (Ollama, Piper) aren't
rem bundled - point the user to Local Setup, which installs them.
findstr /I /R /C:"AGENT_MODE=local" /C:"LLM_PROVIDER=ollama" /C:"TTS_PROVIDER=piper" .env >nul 2>&1
if not errorlevel 1 (
  echo.
  echo   You chose free local mode. If the checks above show Ollama or Piper
  echo   missing, run "AI Video Agent - Local Setup" from the Start menu to
  echo   install them and finish.
)
echo.
echo   Done. You can now use "Make a Video" from the Start menu.
echo.
pause
