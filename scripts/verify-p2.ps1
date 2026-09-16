param([switch]$Build)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
    & "$PSScriptRoot/start-p2.ps1" -Build:$Build -TestMode
    docker run --rm --network shop_agent_stack-p0_default -e SHOP_AGENT_STACK_INTEGRATION=true --mount "type=bind,source=$root/services/agent,target=/app,readonly" shop_agent_stack-agent:p2 python -m pytest tests -q -p no:cacheprovider
    if($LASTEXITCODE -ne 0){throw 'P2 Python/MCP verification failed'}
    Push-Location "$root/apps/web"
    try { npx playwright test; if($LASTEXITCODE -ne 0){throw 'Browser verification failed'} }
    finally { Pop-Location }
    & "$PSScriptRoot/smoke-p0.ps1"
    & "$PSScriptRoot/verify-p1-data.ps1"
} finally {
    # Never leave the deterministic engine available in ordinary local use.
    & "$PSScriptRoot/start-p2.ps1"
    Pop-Location
}
