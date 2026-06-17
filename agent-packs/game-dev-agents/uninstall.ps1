[CmdletBinding()]
param(
    [string]$Project,
    [switch]$Force,
    [switch]$Backup
)

$ErrorActionPreference = "Stop"

function Get-PackRoot {
    return Split-Path -Parent $PSCommandPath
}

function Get-TargetAgentsDir {
    param([string]$ProjectPath)

    if ($ProjectPath) {
        $resolved = Resolve-Path -LiteralPath $ProjectPath
        return Join-Path $resolved.ProviderPath ".opencode\agents"
    }

    return Join-Path ([Environment]::GetFolderPath("UserProfile")) ".config\opencode\agents"
}

function Get-Sha256 {
    param([string]$Path)
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

$packRoot = Get-PackRoot
$manifestPath = Join-Path $packRoot "manifest.json"

if (-not (Test-Path -LiteralPath $manifestPath)) {
    throw "manifest.json not found: $manifestPath"
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$targetAgentsDir = Get-TargetAgentsDir -ProjectPath $Project

if (-not (Test-Path -LiteralPath $targetAgentsDir)) {
    Write-Host "Target agents directory does not exist: $targetAgentsDir"
    exit 0
}

$conflicts = @()
$toRemove = @()

foreach ($agent in $manifest.agents) {
    $target = Join-Path $targetAgentsDir $agent.file
    if (-not (Test-Path -LiteralPath $target)) {
        continue
    }

    $targetHash = Get-Sha256 -Path $target
    $expectedHash = ([string]$agent.sha256).ToLowerInvariant()
    if ($targetHash -ne $expectedHash -and -not $Force) {
        $conflicts += $agent.file
        continue
    }

    $toRemove += [pscustomobject]@{
        File = $agent.file
        Path = $target
    }
}

if ($conflicts.Count -gt 0) {
    $list = $conflicts -join ", "
    throw "Refusing to uninstall locally modified agent file(s): $list. Re-run with -Force, optionally -Backup."
}

$backupDir = $null
if ($Backup -and $toRemove.Count -gt 0) {
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backupDir = Join-Path $targetAgentsDir ".backup\game-dev-agents-uninstall\$timestamp"
    New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
}

foreach ($item in $toRemove) {
    if ($backupDir) {
        Copy-Item -LiteralPath $item.Path -Destination (Join-Path $backupDir $item.File) -Force
    }

    Remove-Item -LiteralPath $item.Path -Force
}

Write-Host "Pack: $($manifest.id) $($manifest.version)"
Write-Host "Target: $targetAgentsDir"
Write-Host "Removed: $($toRemove.Count)"
if ($backupDir) {
    Write-Host "Backup: $backupDir"
}
