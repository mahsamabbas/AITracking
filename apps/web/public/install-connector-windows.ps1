# Techlio local connector — Node.js only, no repo clone.
#Requires -Version 5.1
$ErrorActionPreference = "Stop"

$TechlioSite = if ($env:TECHLIO_SITE) { $env:TECHLIO_SITE } else { "https://ai-tracking-bhgg.vercel.app" }
$InstallDir = if ($env:TECHLIO_INSTALL_DIR) { $env:TECHLIO_INSTALL_DIR } else { Join-Path $env:USERPROFILE ".techlio\connector" }
$BundleUrl = "$TechlioSite/downloads/techlio-connector.zip"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "Install Node.js 20 or newer from https://nodejs.org then run this script again."
}

$TaskName = "TechlioConnector"
try { Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue } catch {}
try { Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue } catch {}

Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like "*techlio*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Write-Host "Installing Techlio connector to $InstallDir"
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
$EnvBackup = $null
$ExistingEnv = Join-Path $InstallDir ".env"
if (Test-Path $ExistingEnv) {
  $EnvBackup = Join-Path $env:TEMP "techlio-connector.env.bak"
  Copy-Item $ExistingEnv $EnvBackup -Force
}
$TmpZip = Join-Path $env:TEMP "techlio-connector.zip"
Invoke-WebRequest -Uri $BundleUrl -OutFile $TmpZip -UseBasicParsing
if (Test-Path $InstallDir) {
  Get-ChildItem $InstallDir | Remove-Item -Recurse -Force
}
Expand-Archive -Path $TmpZip -DestinationPath $InstallDir -Force
Remove-Item $TmpZip -Force
$Nested = Join-Path $InstallDir "techlio-connector"
if (Test-Path $Nested) {
  Get-ChildItem $Nested | Move-Item -Destination $InstallDir -Force
  Remove-Item $Nested -Recurse -Force
}

$EnvFile = Join-Path $InstallDir ".env"
if ($EnvBackup -and (Test-Path $EnvBackup)) {
  Copy-Item $EnvBackup $EnvFile -Force
  Remove-Item $EnvBackup -Force
} elseif (-not (Test-Path $EnvFile)) {
  Copy-Item (Join-Path $InstallDir ".env.example") $EnvFile
}

$Runner = Join-Path $InstallDir "run.ps1"
if (-not (Test-Path $Runner)) {
  Write-Error "Download did not include run.ps1. Redeploy the dashboard, then download the installer again."
}
$LogDir = Join-Path $env:USERPROFILE ".techlio-connector"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$PsArgs = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Runner`""

$Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $PsArgs -WorkingDirectory $InstallDir
$Trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$Settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -RunLevel Limited | Out-Null
Start-ScheduledTask -TaskName $TaskName

$healthy = $false
for ($i = 0; $i -lt 12; $i++) {
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:9477/health" -UseBasicParsing -TimeoutSec 2
    if ($r.StatusCode -eq 200) { $healthy = $true; break }
  } catch {}
  Start-Sleep -Milliseconds 500
}
if (-not $healthy) {
  $errLog = Join-Path $LogDir "connector.err.log"
  Write-Error "The connector did not start. Check $errLog"
}

Write-Host ""
Write-Host "Done. Connector runs at http://127.0.0.1:9477"
Write-Host "Open your Techlio dashboard -> My connectors -> Activate your key."
Write-Host "Config: $EnvFile"
