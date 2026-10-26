#requires -Version 5
<#
.SYNOPSIS
  Download the AI builds for the AI Video Agent's free local mode on Windows:
  the Ollama writing model(s) and the Piper voice file(s).

.DESCRIPTION
  - Writing models are pulled with Ollama (`ollama pull`). Ollama keeps them in
    its own model store (not a loose folder) because the app talks to Ollama
    over HTTP, so there is nothing to copy to the Desktop for these.
  - Piper voices ARE plain files (.onnx + .onnx.json). They are downloaded into
    a folder on your Desktop, and optionally copied into the installed app's
    models\ folder so the agent uses them at the default PIPER_VOICE path.

  If Ollama is missing it offers to install it with winget.

.PARAMETER Models
  Ollama model ids to pull. Default: qwen3:14b.

.PARAMETER Voices
  Piper voice base names (without .onnx) to download. Default: en_US-lessac-medium.

.PARAMETER Dest
  Folder to download the voice files into. Default: a folder on your Desktop.

.PARAMETER All
  Pull the full recommended set of models and voices.

.PARAMETER InstallVoicesToApp
  Also copy the downloaded voices into the installed app's models\ folder.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File download-ai-builds.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File download-ai-builds.ps1 -Models qwen3:8b -Voices es_ES-davefx-medium -InstallVoicesToApp

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File download-ai-builds.ps1 -All
#>
param(
  [string[]]$Models = @("qwen3:14b"),
  [string[]]$Voices = @("en_US-lessac-medium"),
  [string]  $Dest   = (Join-Path ([Environment]::GetFolderPath("Desktop")) "AI Video Agent Builds"),
  [switch]  $All,
  [switch]  $InstallVoicesToApp
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$AllModels = @("qwen3:8b", "qwen3:14b", "qwen3:32b", "llama3.1:8b", "gemma3:12b")
$AllVoices = @("en_US-lessac-medium", "en_US-amy-medium", "en_GB-alba-medium",
               "es_ES-davefx-medium", "fr_FR-siwis-medium", "de_DE-thorsten-medium")
if ($All) { $Models = $AllModels; $Voices = $AllVoices }

$done = New-Object System.Collections.Generic.List[string]
$failed = New-Object System.Collections.Generic.List[string]
function Have($name) { [bool](Get-Command $name -ErrorAction SilentlyContinue) }

Write-Host ""
Write-Host "  AI Video Agent - download AI builds" -ForegroundColor Cyan
Write-Host "  ===================================="
Write-Host "  Models : $($Models -join ', ')"
Write-Host "  Voices : $($Voices -join ', ')"
Write-Host "  Voice folder: $Dest"
Write-Host ""

# ---------------------------------------------------------------------------
# 1. Writing models via Ollama
# ---------------------------------------------------------------------------
if ($Models.Count -gt 0) {
  if (-not (Have "ollama")) {
    Write-Host "  Ollama is not installed - it runs the writing model." -ForegroundColor Yellow
    if (Have "winget") {
      $ans = Read-Host "  Install Ollama now with winget? [Y/N]"
      if ($ans -match '^(y|yes)$') {
        winget install --id Ollama.Ollama -e --accept-package-agreements --accept-source-agreements
        Write-Host "  Giving Ollama a few seconds to start..."
        Start-Sleep -Seconds 8
      } else {
        Write-Host "  Skipping models. Install Ollama from https://ollama.com/download" -ForegroundColor Yellow
        $Models = @()
      }
    } else {
      Write-Host "  winget isn't available. Install Ollama from https://ollama.com/download, then re-run." -ForegroundColor Yellow
      $Models = @()
    }
  }
}

if ($Models.Count -gt 0) {
  # Make sure the Ollama server is reachable (a fresh install starts it in the background).
  $up = $false
  try { Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -TimeoutSec 5 | Out-Null; $up = $true } catch {}
  if (-not $up -and (Have "ollama")) {
    Write-Host "  Starting the Ollama server..."
    Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden -ErrorAction SilentlyContinue
    for ($i = 0; $i -lt 10 -and -not $up; $i++) {
      Start-Sleep -Seconds 2
      try { Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -TimeoutSec 5 | Out-Null; $up = $true } catch {}
    }
  }
  if (-not $up) {
    Write-Host "  Could not reach Ollama at http://localhost:11434. Start it and re-run." -ForegroundColor Yellow
  } else {
    foreach ($m in $Models) {
      Write-Host ""
      Write-Host "  Pulling model: $m" -ForegroundColor Cyan
      try {
        & ollama pull $m
        if ($LASTEXITCODE -eq 0) { $done.Add("model $m (in Ollama's store)") } else { $failed.Add("model $m (ollama pull exit $LASTEXITCODE)") }
      } catch { $failed.Add("model $m ($($_.Exception.Message))") }
    }
  }
}

# ---------------------------------------------------------------------------
# 2. Piper voices (plain files) -> Desktop folder
# ---------------------------------------------------------------------------
# Voices live at huggingface.co/rhasspy/piper-voices/<lang>/<lang_REGION>/<name>/<quality>/
function Get-PiperVoiceUrl([string]$file) {
  if ($file -notmatch '\.onnx$') { $file = "$file.onnx" }
  if ($file -match '^(?<locale>(?<lang>[a-z]{2,3})_[A-Z]{2})-(?<name>.+)-(?<q>x_low|low|medium|high)\.onnx$') {
    $locale = $matches['locale']; $lang = $matches['lang']; $name = $matches['name']; $q = $matches['q']
    return "https://huggingface.co/rhasspy/piper-voices/resolve/main/$lang/$locale/$name/$q/$file"
  }
  return $null
}

if ($Voices.Count -gt 0) {
  New-Item -ItemType Directory -Force -Path $Dest | Out-Null
  foreach ($v in $Voices) {
    $onnx = if ($v -match '\.onnx$') { $v } else { "$v.onnx" }
    $url = Get-PiperVoiceUrl $onnx
    if (-not $url) {
      $failed.Add("voice $v (name not in <lang>_<REGION>-<name>-<quality> form)")
      continue
    }
    Write-Host ""
    Write-Host "  Downloading voice: $onnx" -ForegroundColor Cyan
    try {
      Invoke-WebRequest -Uri $url -OutFile (Join-Path $Dest $onnx)
      Invoke-WebRequest -Uri "$url.json" -OutFile (Join-Path $Dest "$onnx.json")
      $done.Add("voice $onnx -> $Dest")
    } catch {
      $failed.Add("voice $v ($($_.Exception.Message))")
      continue
    }
  }

  # Optionally place voices where the installed app looks for them.
  if ($InstallVoicesToApp) {
    $appModels = Join-Path $env:LOCALAPPDATA "Programs\AI Video Agent\app\models"
    if (Test-Path (Split-Path $appModels -Parent)) {
      New-Item -ItemType Directory -Force -Path $appModels | Out-Null
      Copy-Item (Join-Path $Dest "*.onnx*") $appModels -Force
      Write-Host ""
      Write-Host "  Copied voices into the app: $appModels" -ForegroundColor Green
      Write-Host "  Set PIPER_VOICE=models/<name>.onnx in .env to use one."
    } else {
      Write-Host "  App folder not found - skipped copying into the app. Is AI Video Agent installed?" -ForegroundColor Yellow
    }
  }
}

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "  Summary" -ForegroundColor Cyan
Write-Host "  -------"
if ($done.Count)   { $done   | ForEach-Object { Write-Host "   [x] $_" -ForegroundColor Green } }
if ($failed.Count) { $failed | ForEach-Object { Write-Host "   [!] $_" -ForegroundColor Red } }
if (-not $done.Count -and -not $failed.Count) { Write-Host "   Nothing to do." }
Write-Host ""
Write-Host "  Voice files are in: $Dest"
Write-Host "  Models are in Ollama's store - the agent reaches them over http://localhost:11434"
Write-Host ""
if ($failed.Count) { exit 1 }
