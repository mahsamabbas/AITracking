import { spawn } from "node:child_process";

/**
 * Windows notification-area ("tray") icon for the connector — the Windows
 * counterpart of apps/connector/macos/TechlioStatus.swift.
 *
 * `techlio-connector.exe --tray` is started at sign-in by the hidden task
 * "TechlioConnectorTray" (install-service.ts). It runs a small WinForms
 * NotifyIcon in PowerShell, which ships with every Windows 10/11, so no extra
 * runtime is installed. The script is passed with -EncodedCommand (no .ps1 on
 * disk, not subject to script execution policy) and PowerShell is started with
 * CREATE_NO_WINDOW, so no console ever appears.
 *
 * The tray only reads this user's connector /health and calls /pause, /resume
 * and /stop; collection itself stays in the background service.
 */

const TRAY_SCRIPT = String.raw`
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'SilentlyContinue'
[System.Windows.Forms.Application]::EnableVisualStyles()

$exe = $env:TECHLIO_EXE
$dashboard = $env:TECHLIO_DASHBOARD
$parentPid = [int]$env:TECHLIO_PARENT_PID
$dataDir = Join-Path $env:USERPROFILE '.techlio-connector'
$logPath = Join-Path $dataDir 'connector.log'

# This user's connector (each Windows user has their own port).
function Get-Base {
  $port = 9477
  try {
    $text = (Get-Content -Path (Join-Path $dataDir 'port') -Raw).Trim()
    if ([int]$text -gt 0) { $port = [int]$text }
  } catch {}
  return "http://127.0.0.1:$port"
}

function New-StateIcon([System.Drawing.Color]$color) {
  $bmp = New-Object System.Drawing.Bitmap 16, 16
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)
  $brush = New-Object System.Drawing.SolidBrush $color
  $g.FillEllipse($brush, 1, 1, 14, 14)
  $font = New-Object System.Drawing.Font 'Segoe UI', 7, ([System.Drawing.FontStyle]::Bold)
  $g.DrawString('T', $font, [System.Drawing.Brushes]::White, 3.5, 1.5)
  $g.Dispose()
  return [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
}

$icons = @{
  collecting = New-StateIcon ([System.Drawing.Color]::FromArgb(79, 70, 229))
  attention  = New-StateIcon ([System.Drawing.Color]::FromArgb(217, 119, 6))
  inactive   = New-StateIcon ([System.Drawing.Color]::FromArgb(128, 128, 128))
}

$tray = New-Object System.Windows.Forms.NotifyIcon
$menu = New-Object System.Windows.Forms.ContextMenuStrip
$tray.ContextMenuStrip = $menu
$tray.Icon = $icons.inactive
$tray.Text = 'Techlio Connector'
$tray.Visible = $true
$script:state = 'notRunning'
$script:health = $null

function Invoke-Local([string]$path) {
  try { Invoke-RestMethod -Method Post -Uri ((Get-Base) + $path) -TimeoutSec 8 | Out-Null } catch {}
}

function Update-State {
  try { $script:health = Invoke-RestMethod -Uri ((Get-Base) + '/health') -TimeoutSec 3 } catch { $script:health = $null }
  $h = $script:health
  if (-not $h) {
    if (Test-Path (Join-Path $dataDir 'stopped-at')) { $script:state = 'stopped' } else { $script:state = 'notRunning' }
  } elseif (-not $h.paired) { $script:state = 'notActivated' }
  elseif ($h.paused) { $script:state = 'paused' }
  else { $script:state = 'collecting' }

  switch ($script:state) {
    'collecting'   { $tray.Icon = $icons.collecting; $tray.Text = 'Techlio: collecting AI agent activity' }
    'paused'       { $tray.Icon = $icons.attention;  $tray.Text = 'Techlio: collection paused' }
    'notActivated' { $tray.Icon = $icons.attention;  $tray.Text = 'Techlio: running, not activated' }
    'stopped'      { $tray.Icon = $icons.inactive;   $tray.Text = 'Techlio: stopped' }
    default        { $tray.Icon = $icons.inactive;   $tray.Text = 'Techlio: not running' }
  }
}

function Add-Item([string]$text, [bool]$enabled, [scriptblock]$onClick) {
  $item = New-Object System.Windows.Forms.ToolStripMenuItem $text
  $item.Enabled = $enabled
  if ($onClick) { $item.add_Click($onClick) }
  [void]$menu.Items.Add($item)
}

function Start-Connector {
  Remove-Item -Path (Join-Path $dataDir 'stopped-at') -ErrorAction SilentlyContinue
  $p = Start-Process -FilePath 'schtasks.exe' -ArgumentList '/Run', '/TN', 'TechlioConnector' -WindowStyle Hidden -PassThru -Wait
  if ($p.ExitCode -ne 0 -and $exe) { Start-Process -FilePath $exe -ArgumentList '--service' -WindowStyle Hidden }
  Start-Sleep -Seconds 3
  Update-State
}

function Stop-Connector {
  $answer = [System.Windows.Forms.MessageBox]::Show(
    "Stop the Techlio connector?" + [Environment]::NewLine + [Environment]::NewLine +
    "AI agent activity on this computer will not be recorded until you start it again or sign in again. The stop is shown on the dashboard as a period when collection was off.",
    'Techlio Connector', 'YesNo', 'Question')
  if ($answer -ne 'Yes') { return }
  Invoke-Local '/stop'
  Start-Sleep -Seconds 2
  Update-State
}

function Build-Menu {
  $menu.Items.Clear()
  $h = $script:health
  $name = if ($h -and $h.displayName) { " for $($h.displayName)" } else { '' }
  switch ($script:state) {
    'collecting'   { Add-Item 'Techlio Connector - Running' $false $null; Add-Item "Collecting AI agent activity$name" $false $null }
    'paused'       { Add-Item 'Techlio Connector - Paused' $false $null; Add-Item "Collection paused$name" $false $null }
    'notActivated' { Add-Item 'Techlio Connector - Running' $false $null; Add-Item 'Not activated on this computer yet' $false $null }
    'stopped'      { Add-Item 'Techlio Connector - Stopped' $false $null; Add-Item 'Stopped by you; nothing is recorded' $false $null }
    default        { Add-Item 'Techlio Connector - Not running' $false $null }
  }
  if ($h -and $h.version) { Add-Item "Version $($h.version)" $false $null }
  [void]$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))

  switch ($script:state) {
    'collecting'   { Add-Item 'Pause collection' $true { Invoke-Local '/pause'; Update-State } }
    'paused'       { Add-Item 'Resume collection' $true { Invoke-Local '/resume'; Update-State } }
    'notActivated' { Add-Item 'Activate this computer...' $true { Start-Process "$dashboard/my-connectors" } }
  }
  if ($script:state -eq 'stopped' -or $script:state -eq 'notRunning') {
    Add-Item 'Start connector' $true { Start-Connector }
  } else {
    Add-Item 'Stop connector' $true { Stop-Connector }
  }
  [void]$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))
  Add-Item 'Open Techlio dashboard' $true { Start-Process $dashboard }
  Add-Item 'Show log' $true { if (Test-Path $logPath) { Start-Process notepad.exe $logPath } }
  [void]$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))
  Add-Item 'Hide tray icon' $true { $tray.Visible = $false; [System.Windows.Forms.Application]::Exit() }
}

$menu.add_Opening({ param($sender, $e) Build-Menu; $e.Cancel = $false })
$tray.add_DoubleClick({ Start-Process $dashboard })

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 5000
$timer.add_Tick({
  # Leave with the launching techlio-connector.exe --tray process (e.g. on uninstall).
  if ($parentPid -and -not (Get-Process -Id $parentPid -ErrorAction SilentlyContinue)) {
    $tray.Visible = $false
    [System.Windows.Forms.Application]::Exit()
    return
  }
  Update-State
})
$timer.Start()
Update-State
Build-Menu
[System.Windows.Forms.Application]::Run()
$tray.Visible = $false
$tray.Dispose()
`;

export async function runWindowsTray(): Promise<void> {
  if (process.platform !== "win32") {
    console.error("--tray is for Windows; macOS uses the menu-bar app installed by the .pkg.");
    process.exitCode = 1;
    return;
  }
  const { DASHBOARD_URL } = await import("./install-service.js");
  const encoded = Buffer.from(TRAY_SCRIPT, "utf16le").toString("base64");
  await new Promise<void>((resolve) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-STA", "-WindowStyle", "Hidden", "-EncodedCommand", encoded],
      {
        stdio: "ignore",
        windowsHide: true, // CREATE_NO_WINDOW: no console flash
        env: {
          ...process.env,
          TECHLIO_EXE: process.execPath,
          TECHLIO_DASHBOARD: DASHBOARD_URL,
          TECHLIO_PARENT_PID: String(process.pid),
        },
      },
    );
    child.on("exit", () => resolve());
    child.on("error", () => resolve());
  });
}
