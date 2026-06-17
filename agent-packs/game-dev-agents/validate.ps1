[CmdletBinding()]
param(
    [string]$Project,
    [switch]$PackOnly,
    [switch]$SkipOpenCode
)

$ErrorActionPreference = "Stop"
$failed = $false

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

function Fail {
    param([string]$Message)
    Write-Host "FAIL: $Message" -ForegroundColor Red
    $script:failed = $true
}

function Pass {
    param([string]$Message)
    Write-Host "OK: $Message" -ForegroundColor Green
}

$packRoot = Get-PackRoot
$manifestPath = Join-Path $packRoot "manifest.json"
$sourceAgentsDir = Join-Path $packRoot "agents"

if (-not (Test-Path -LiteralPath $manifestPath)) {
    Fail "manifest.json not found: $manifestPath"
    exit 1
}

if (-not (Test-Path -LiteralPath $sourceAgentsDir)) {
    Fail "agents directory not found: $sourceAgentsDir"
    exit 1
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json

foreach ($agent in $manifest.agents) {
    $source = Join-Path $sourceAgentsDir $agent.file
    if (-not (Test-Path -LiteralPath $source)) {
        Fail "Package source missing: $($agent.file)"
        continue
    }

    $sourceHash = Get-Sha256 -Path $source
    $expectedHash = ([string]$agent.sha256).ToLowerInvariant()
    if ($sourceHash -ne $expectedHash) {
        Fail "Package source hash mismatch: $($agent.file)"
    }
}

if (-not $failed) {
    Pass "Package manifest matches source agents ($($manifest.agents.Count) files)"
}

if (-not $PackOnly) {
    $targetAgentsDir = Get-TargetAgentsDir -ProjectPath $Project
    if (-not (Test-Path -LiteralPath $targetAgentsDir)) {
        Fail "Target agents directory not found: $targetAgentsDir"
    } else {
        foreach ($agent in $manifest.agents) {
            $target = Join-Path $targetAgentsDir $agent.file
            if (-not (Test-Path -LiteralPath $target)) {
                Fail "Target agent missing: $($agent.file)"
                continue
            }

            $targetHash = Get-Sha256 -Path $target
            $expectedHash = ([string]$agent.sha256).ToLowerInvariant()
            if ($targetHash -ne $expectedHash) {
                Fail "Target agent hash mismatch: $($agent.file)"
            }
        }

        if (-not $failed) {
            Pass "Target agents match package: $targetAgentsDir"
        }
    }

    if (-not $SkipOpenCode) {
        $opencode = Get-Command opencode -ErrorAction SilentlyContinue
        if (-not $opencode) {
            Fail "opencode command not found"
        } else {
            $originalLocation = Get-Location
            try {
                if ($Project) {
                    Set-Location -LiteralPath (Resolve-Path -LiteralPath $Project).ProviderPath
                }

                $agentList = & opencode agent list 2>&1
                if ($LASTEXITCODE -ne 0) {
                    Fail "opencode agent list failed: $agentList"
                } else {
                    foreach ($agent in $manifest.agents) {
                        $pattern = "^" + [regex]::Escape([string]$agent.id) + " \(subagent\)"
                        if (-not ($agentList | Select-String -Pattern $pattern -Quiet)) {
                            Fail "OpenCode did not list subagent: $($agent.id)"
                        }
                    }

                    if (-not $failed) {
                        Pass "OpenCode lists all package agents as subagents"
                    }
                }
            } finally {
                Set-Location $originalLocation
            }
        }
    }
}

if ($failed) {
    exit 1
}

Pass "Validation complete"
