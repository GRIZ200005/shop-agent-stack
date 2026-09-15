param([switch]$Build, [int]$Repeats=3)
$ErrorActionPreference='Stop'
if($Repeats -lt 1 -or $Repeats -gt 10){throw 'Repeats must be 1–10'}
$root=Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
    docker compose -f deploy/compose.retrieval.yml up -d --wait milvus
    if($LASTEXITCODE -ne 0){throw 'Milvus startup failed'}
    if($Build){
        docker compose -f deploy/compose.retrieval.yml build evaluation
        if($LASTEXITCODE -ne 0){throw 'Evaluation image build failed'}
    }
    docker compose -f deploy/compose.retrieval.yml run --rm evaluation python scripts/evaluate-retrieval-matrix.py --repeats $Repeats
    if($LASTEXITCODE -ne 0){throw 'Retrieval evaluation failed; inspect run manifest and logs'}
} finally {Pop-Location}
