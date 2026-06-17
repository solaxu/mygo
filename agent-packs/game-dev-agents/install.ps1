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
$sourceAgentsDir = Join-Path $packRoot "agents"

if (-not (Test-Path -LiteralPath $manifestPath)) {
    throw "manifest.json not found: $manifestPath"
}

if (-not (Test-Path -LiteralPath $sourceAgentsDir)) {
    throw "agents directory not found: $sourceAgentsDir"
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$targetAgentsDir = Get-TargetAgentsDir -ProjectPath $Project

$conflicts = @()
$toInstall = @()
$same = @()

foreach ($agent in $manifest.agents) {
    $source = Join-Path $sourceAgentsDir $agent.file
    if (-not (Test-Path -LiteralPath $source)) {
        throw "Source agent missing: $source"
    }

    $sourceHash = Get-Sha256 -Path $source
    $expectedHash = [string]$agent.sha256
    if ($sourceHash -ne $expectedHash.ToLowerInvariant()) {
        throw "Source agent hash mismatch: $($agent.file)"
    }

    $destination = Join-Path $targetAgentsDir $agent.file
    if (Test-Path -LiteralPath $destination) {
        $destinationHash = Get-Sha256 -Path $destination
        if ($destinationHash -eq $sourceHash) {
            $same += $agent.file
            continue
        }

        if (-not $Force) {
            $conflicts += $agent.file
            continue
        }
    }

    $toInstall += [pscustomobject]@{
        File = $agent.file
        Source = $source
        Destination = $destination
        Exists = Test-Path -LiteralPath $destination
    }
}

if ($conflicts.Count -gt 0) {
    $list = $conflicts -join ", "
    throw "Conflicting agent file(s) already exist with different content: $list. Re-run with -Force, optionally -Backup."
}

New-Item -ItemType Directory -Force -Path $targetAgentsDir | Out-Null

$backupDir = $null
if ($Backup -and $toInstall.Where({ $_.Exists }).Count -gt 0) {
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backupDir = Join-Path $targetAgentsDir ".backup\game-dev-agents\$timestamp"
    New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
}

foreach ($item in $toInstall) {
    if ($item.Exists -and $backupDir) {
        Copy-Item -LiteralPath $item.Destination -Destination (Join-Path $backupDir $item.File) -Force
    }

    Copy-Item -LiteralPath $item.Source -Destination $item.Destination -Force
}

Write-Host "Pack: $($manifest.id) $($manifest.version)"
Write-Host "Target: $targetAgentsDir"
Write-Host "Installed or updated: $($toInstall.Count)"
Write-Host "Already identical: $($same.Count)"
if ($backupDir) {
    Write-Host "Backup: $backupDir"
}
