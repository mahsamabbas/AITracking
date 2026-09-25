# Techlio connector runner
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$envFile = Join-Path $PSScriptRoot ".env"
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $eq = $line.IndexOf("=")
    if ($eq -lt 1) { return }
    $key = $line.Substring(0, $eq).Trim()
    $val = $line.Substring($eq + 1).Trim()
    Set-Item -Path "env:$key" -Value $val
  }
}
& node (Join-Path $PSScriptRoot "dist\index.js")
