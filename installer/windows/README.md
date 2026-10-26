# Windows installer build

Builds a self-contained `.exe` that installs the AI Video Agent on Windows 11
with no prerequisites for the end user. End-user instructions are in
[docs/windows-install.md](../../docs/windows-install.md).

## What's here

| File | Purpose |
| --- | --- |
| `build.ps1` | Downloads a portable Node.js, static FFmpeg, portable Ollama and Piper (with a voice), runs `npm ci`, lays out `payload\`, then compiles the installer |
| `ai-video-agent.iss` | Inno Setup script: files, shortcuts, per-user install, uninstall cleanup |
| `launchers\*.cmd` | The scripts the Start-menu shortcuts point to; they put the bundled Node and FFmpeg on `PATH`. `local-setup.cmd` also offers to install Ollama/Python with winget for free mode |
| `launchers\studio.vbs` | Windowless launcher for **AI Video Agent Studio**: starts the local server hidden (no console) and opens it in an Edge app window (falls back to the default browser) |

The build produces, under `payload\`:

```
app\                 the repo + its node_modules (installed with the bundled Node)
runtime\node\        portable Node.js (node.exe, npm.cmd, ...)
runtime\ffmpeg\bin\  ffmpeg.exe, ffprobe.exe
runtime\ollama\      portable Ollama (ollama.exe) — writing model runtime
runtime\piper\       portable Piper (piper.exe) + voices\ — voice-over
*.cmd, *.vbs         the launchers, copied to the install root
```

The writing model itself is **not** bundled — S.Gain Studio downloads it on first
run (into `{app}\models`). Bundling Ollama + Piper makes the installer roughly
1.5 GB.

`payload\` and `dist\` are build output and are git-ignored.

## Build locally (on Windows)

1. Install [Inno Setup 6](https://jrsoftware.org/isdl.php) (so `ISCC` is
   available).
2. From the repo root, in PowerShell:

   ```powershell
   pwsh installer\windows\build.ps1 -AppVersion 0.1.0
   ```

   Override the bundled Node with `-NodeVersion`, or point at a specific
   compiler with `-Iscc "C:\Path\To\ISCC.exe"`.
3. The installer is written to `installer\windows\dist\ai-video-agent-setup-<version>.exe`.

The dependencies are installed with the bundled Node on Windows, so
platform-specific binaries (such as esbuild, used by `tsx`) match the target.
Build on Windows, not by copying a `node_modules` from another OS.

## Build in CI

[`.github/workflows/windows-installer.yml`](../../.github/workflows/windows-installer.yml)
runs the same script on a `windows-latest` runner. Trigger it from the Actions
tab (**Run workflow**, with a version), or push a `v*` tag to build the
installer and attach it to that release.

## Code signing (optional)

The installer isn't signed, so SmartScreen shows an "unrecognised app" warning.
To sign it, add a signing step after the build with `signtool` and your
certificate, or set Inno Setup's `SignTool` directive. Keep certificates and
passwords in CI secrets, never in the repo.
