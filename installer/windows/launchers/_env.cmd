@echo off
rem Shared environment for the AI Video Agent launchers.
rem Points Node, npm and FFmpeg at the copies the installer bundled, so nothing
rem has to be installed separately for the core app. Sourced with: call "%~dp0_env.cmd"
set "ROOT=%~dp0"
set "APP=%ROOT%app"
set "NODE_DIR=%ROOT%runtime\node"
set "FFMPEG_DIR=%ROOT%runtime\ffmpeg\bin"
set "PATH=%NODE_DIR%;%FFMPEG_DIR%;%PATH%"
set "FFMPEG_PATH=%FFMPEG_DIR%\ffmpeg.exe"
set "FFPROBE_PATH=%FFMPEG_DIR%\ffprobe.exe"
set "NPM=%NODE_DIR%\npm.cmd"
