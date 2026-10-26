@echo off
setlocal enabledelayedexpansion
call "%~dp0_env.cmd"
cd /d "%APP%"
echo.
echo   AI Video Agent - Local Setup (free mode)
echo   ========================================
echo   Free mode writes with Ollama and speaks with Piper. This checks they're
echo   installed (offering to install them), then downloads the model and voice.
echo.

set "HAVE_WINGET="
where winget >nul 2>&1 && set "HAVE_WINGET=1"

rem --- Ollama: writes the scripts ---
where ollama >nul 2>&1
if errorlevel 1 (
  echo   [ ] Ollama is not installed - it writes the scripts.
  if defined HAVE_WINGET (
    choice /C YN /N /M "      Install Ollama now with winget? [Y/N] "
    if !errorlevel! equ 1 (
      winget install --id Ollama.Ollama -e --accept-package-agreements --accept-source-agreements
      echo       Giving Ollama a few seconds to start...
      timeout /t 8 >nul
    ) else (
      echo       Skipped. Install it from https://ollama.com/download
    )
  ) else (
    echo       winget isn't available. Install Ollama from https://ollama.com/download
  )
) else (
  echo   [x] Ollama is installed.
)

rem --- Python 3: Piper needs it for the voice ---
where python >nul 2>&1
if errorlevel 1 (
  echo   [ ] Python 3 is not installed - Piper needs it for the voice.
  if defined HAVE_WINGET (
    choice /C YN /N /M "      Install Python 3 now with winget? [Y/N] "
    if !errorlevel! equ 1 (
      winget install --id Python.Python.3.12 -e --accept-package-agreements --accept-source-agreements
    ) else (
      echo       Skipped. Install it from https://www.python.org/downloads/
    )
  ) else (
    echo       winget isn't available. Install Python 3 from https://www.python.org/downloads/
  )
) else (
  echo   [x] Python 3 is installed.
)

echo.
echo   Downloading the writing model, Piper and a voice...
call "%NPM%" run local:setup
echo.
echo   If a step above failed, close this window, make sure Ollama is running,
echo   then open "AI Video Agent - Local Setup" again. A fresh Ollama or Python
echo   install may need you to sign out and back in first.
echo.
pause
