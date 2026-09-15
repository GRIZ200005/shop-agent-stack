$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
    New-Item -ItemType Directory -Force -Path "$root/evaluation/runs" | Out-Null
    $revision=git rev-parse HEAD
    if($LASTEXITCODE -ne 0){throw 'Cannot identify code revision'}
    docker run --rm --network aster-p0_default --mount "type=bind,source=$root,target=/workspace,readonly" --mount "type=bind,source=$root/evaluation/runs,target=/workspace/evaluation/runs" --workdir /workspace aster-agent:p2 python scripts/benchmark-read-api.py --revision $revision
    if($LASTEXITCODE -ne 0){throw 'Read baseline stopped; inspect partial artifacts'}
} finally {Pop-Location}
