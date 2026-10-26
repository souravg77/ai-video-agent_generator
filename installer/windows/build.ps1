#requires -Version 5
<#
.SYNOPSIS
  Builds the Windows .exe installer for the AI Video Agent.

.DESCRIPTION
  Downloads a portable Node.js and a static FFmpeg, installs the app's
  dependencies with that bundled Node, lays everything out under payload\,
  then compiles installer\windows\ai-video-agent.iss with Inno Setup into
  installer\windows\dist\.

  Run on Windows (PowerShell 5+). Needs Inno Setup 6 installed (the GitHub
  Actions workflow installs it with Chocolatey; locally, get it from
  https://jrsoftware.org/isdl.php).

.EXAMPLE
  pwsh installer\windows\build.ps1 -AppVersion 0.1.0
#>
param(
  [string]$NodeVersion = "20.18.1",
  [string]$AppVersion  = "0.1.0",
  [string]$Iscc        = "iscc"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"   # much faster Invoke-WebRequest downloads

$here    = Split-Path -Parent $MyInvocation.MyCommand.Definition
$repo    = (Resolve-Path (Join-Path $here "..\..")).Path
$payload = Join-Path $here "payload"
$work    = Join-Path $here ".work"
$dist    = Join-Path $here "dist"

function Resolve-Iscc {
  param([string]$Name)
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  foreach ($p in @(
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "${env:ProgramFiles}\Inno Setup 6\ISCC.exe"
  )) { if (Test-Path $p) { return $p } }
  throw "Inno Setup compiler (ISCC) not found. Install Inno Setup 6, or pass -Iscc with its full path."
}

Write-Host "==> Cleaning previous build output"
foreach ($d in @($payload, $work)) { if (Test-Path $d) { Remove-Item $d -Recurse -Force } }
New-Item -ItemType Directory -Force -Path $payload, $work, $dist | Out-Null

# ---- 1. Portable Node.js ----------------------------------------------------
$nodeZipName = "node-v$NodeVersion-win-x64"
$nodeZip     = Join-Path $work "$nodeZipName.zip"
Write-Host "==> Downloading Node.js $NodeVersion"
Invoke-WebRequest -Uri "https://nodejs.org/dist/v$NodeVersion/$nodeZipName.zip" -OutFile $nodeZip
Expand-Archive -Path $nodeZip -DestinationPath $work -Force
$nodeDir = Join-Path $payload "runtime\node"
New-Item -ItemType Directory -Force -Path $nodeDir | Out-Null
Copy-Item -Path (Join-Path $work "$nodeZipName\*") -Destination $nodeDir -Recurse -Force
$npm  = Join-Path $nodeDir "npm.cmd"
$node = Join-Path $nodeDir "node.exe"

# ---- 2. Static FFmpeg (ffmpeg.exe + ffprobe.exe) ----------------------------
Write-Host "==> Downloading FFmpeg (static build)"
$ffZip = Join-Path $work "ffmpeg.zip"
Invoke-WebRequest -Uri "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip" -OutFile $ffZip
Expand-Archive -Path $ffZip -DestinationPath (Join-Path $work "ffmpeg") -Force
$ffBinSrc = Get-ChildItem -Path (Join-Path $work "ffmpeg") -Recurse -Filter "ffmpeg.exe" | Select-Object -First 1
if (-not $ffBinSrc) { throw "ffmpeg.exe not found in the downloaded archive." }
$ffBinDst = Join-Path $payload "runtime\ffmpeg\bin"
New-Item -ItemType Directory -Force -Path $ffBinDst | Out-Null
Copy-Item (Join-Path $ffBinSrc.DirectoryName "ffmpeg.exe")  $ffBinDst -Force
Copy-Item (Join-Path $ffBinSrc.DirectoryName "ffprobe.exe") $ffBinDst -Force

# Ollama is NOT bundled (it is ~1.5 GB) — the installer downloads it at install
# time with fetch-ollama.ps1, which keeps the installer small.

# ---- 2c. Portable Piper (voice) + a default voice --------------------------
Write-Host "==> Downloading Piper (portable)"
$piperZip = Join-Path $work "piper.zip"
Invoke-WebRequest -Uri "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip" -OutFile $piperZip
Expand-Archive -Path $piperZip -DestinationPath (Join-Path $work "piper") -Force
$piperExe = Get-ChildItem -Path (Join-Path $work "piper") -Recurse -Filter "piper.exe" | Select-Object -First 1
if (-not $piperExe) { throw "piper.exe not found in the Piper archive." }
$piperDst = Join-Path $payload "runtime\piper"
New-Item -ItemType Directory -Force -Path $piperDst | Out-Null
Copy-Item (Join-Path $piperExe.DirectoryName "*") $piperDst -Recurse -Force
Write-Host "==> Downloading a Piper voice"
$voiceDir = Join-Path $piperDst "voices"
New-Item -ItemType Directory -Force -Path $voiceDir | Out-Null
$voiceUrl = "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx"
Invoke-WebRequest -Uri $voiceUrl        -OutFile (Join-Path $voiceDir "en_US-lessac-medium.onnx")
Invoke-WebRequest -Uri "$voiceUrl.json" -OutFile (Join-Path $voiceDir "en_US-lessac-medium.onnx.json")

# ---- 3. App sources + dependencies -----------------------------------------
Write-Host "==> Copying app sources"
$appDst = Join-Path $payload "app"
New-Item -ItemType Directory -Force -Path $appDst | Out-Null
# robocopy mirrors the repo, skipping things the installer should never ship.
$excludeDirs = @("node_modules", "out", ".git", ".github", "installer", "dist", ".work")
$roboArgs = @($repo, $appDst, "/E", "/NFL", "/NDL", "/NJH", "/NJS", "/NP", "/XD") + ($excludeDirs | ForEach-Object { Join-Path $repo $_ }) + @("/XF", (Join-Path $repo ".env"))
robocopy @roboArgs | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed copying app sources (exit $LASTEXITCODE)." }

Write-Host "==> Installing dependencies with bundled Node (npm ci)"
Push-Location $appDst
try {
  & $npm "ci" "--no-audit" "--no-fund"
  if ($LASTEXITCODE -ne 0) { throw "npm ci failed (exit $LASTEXITCODE)." }
} finally { Pop-Location }

# ---- 4. Launchers at the install root --------------------------------------
Write-Host "==> Adding launchers"
Copy-Item -Path (Join-Path $here "launchers\*.cmd") -Destination $payload -Force
Copy-Item -Path (Join-Path $here "launchers\*.vbs") -Destination $payload -Force
# Record the build version so S.Gain Studio can check GitHub Releases for updates.
Set-Content -Path (Join-Path $appDst "VERSION") -Value $AppVersion -NoNewline -Encoding ASCII

# ---- 5. Compile the installer ----------------------------------------------
$isccPath = Resolve-Iscc $Iscc
Write-Host "==> Compiling installer with $isccPath"
& $isccPath "/DMyAppVersion=$AppVersion" (Join-Path $here "ai-video-agent.iss")
if ($LASTEXITCODE -ne 0) { throw "Inno Setup compile failed (exit $LASTEXITCODE)." }

$exe = Get-ChildItem -Path $dist -Filter "*.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Write-Host ""
Write-Host "Done. Installer: $($exe.FullName)" -ForegroundColor Green
