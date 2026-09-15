$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
    $testArgs=@('run','--rm','--network','aster-p0_default','-e','ASTER_P3C_LIVE=true',
        '--mount',"type=bind,source=$root/services/agent,target=/app,readonly",
        '--mount',"type=bind,source=$root/.local/policy-index.key,target=/run/secrets/index_key,readonly",
        '--mount',"type=bind,source=$root/.local/p1-accounts.json,target=/run/secrets/test_accounts,readonly")
    docker @testArgs aster-agent:p2 python -m pytest tests/test_p3c_live.py -q -p no:cacheprovider
    if($LASTEXITCODE -ne 0){throw 'Live index lifecycle verification failed'}
    try {
        docker compose -f deploy/compose.retrieval.yml stop milvus
        if($LASTEXITCODE -ne 0){throw 'Could not inject Milvus outage'}
        docker @testArgs -e ASTER_P3C_OUTAGE=true aster-agent:p2 python -m pytest tests/test_p3c_live.py -k availability -q -p no:cacheprovider
        if($LASTEXITCODE -ne 0){throw 'Explicit fallback verification failed'}
    } finally {
        docker compose -f deploy/compose.retrieval.yml up -d --wait milvus
        if($LASTEXITCODE -ne 0){throw 'Could not restore Milvus'}
    }
    docker @testArgs aster-agent:p2 python -m pytest tests/test_p3c_live.py -k availability -q -p no:cacheprovider
    if($LASTEXITCODE -ne 0){throw 'Hybrid recovery verification failed'}
} finally {Pop-Location}
