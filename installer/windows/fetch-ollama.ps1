#requires -Version 5
<#
.SYNOPSIS
  Download a portable Ollama into the app's runtime\ollama folder.

.DESCRIPTION
  Run by the installer at install time so the .exe stays small. Safe to re-run:
  it skips the download when ollama.exe is already present, and it never fails
  the install — if the download can't complete (e.g. offline), S.Gain Studio's
  readiness banner guides the user, and the Local Setup shortcut can retry.
#>
param([string]$AppDir = (Split-Path -Parent $MyInvocation.MyCommand.Definition))

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

try {
  $dst = Join-Path $AppDir "runtime\ollama"
  if (Test-Path (Join-Path $dst "ollama.exe")) { Write-Host "Ollama already present."; exit 0 }
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  New-Item -ItemType Directory -Force -Path $dst | Out-Null
  $zip = Join-Path $env:TEMP ("ollama-" + [guid]::NewGuid().ToString("N") + ".zip")
  Write-Host "Downloading Ollama (portable)..."
  Invoke-WebRequest -Uri "https://github.com/ollama/ollama/releases/latest/download/ollama-windows-amd64.zip" -OutFile $zip
  Expand-Archive -Path $zip -DestinationPath $dst -Force
  Remove-Item $zip -Force -ErrorAction SilentlyContinue
  if (-not (Test-Path (Join-Path $dst "ollama.exe"))) {
    $oexe = Get-ChildItem -Path $dst -Recurse -Filter "ollama.exe" | Select-Object -First 1
    if ($oexe) { Copy-Item (Join-Path $oexe.DirectoryName "*") $dst -Recurse -Force }
  }
  if (Test-Path (Join-Path $dst "ollama.exe")) { Write-Host "Ollama ready at $dst." }
  else { Write-Host "Ollama archive downloaded but ollama.exe wasn't found." }
} catch {
  Write-Host "Could not download Ollama now: $($_.Exception.Message). The app can still run offline samples; use the Local Setup shortcut to try again."
}
exit 0
