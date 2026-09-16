param([switch]$Build, [switch]$TestMode)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
& "$PSScriptRoot/init-p1.ps1"
$indexKey=Join-Path $root '.local/policy-index.key'
if(-not (Test-Path -LiteralPath $indexKey)) {
    [IO.File]::WriteAllText($indexKey,[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)))
}
$keyFile=Join-Path $root '.local/agent-encryption.key'
if(-not (Test-Path -LiteralPath $keyFile)) {
    $keyBytes=[Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
    [IO.File]::WriteAllText($keyFile,[Convert]::ToBase64String($keyBytes).Replace('+','-').Replace('/','_'))
}
Get-Content -Raw -Encoding utf8 "$root/deploy/mysql/migrations/004-p2.sql" | docker compose --env-file "$root/.env" -f "$root/deploy/compose.p0.yml" exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysql --default-character-set=utf8mb4 -ushop_agent_stack -Dshop_agent_stack'
if($LASTEXITCODE -ne 0){throw 'P2 migration failed'}
Get-Content -Raw -Encoding utf8 "$root/deploy/mysql/migrations/005-p3-policies.sql" | docker compose --env-file "$root/.env" -f "$root/deploy/compose.p0.yml" exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysql --default-character-set=utf8mb4 -ushop_agent_stack -Dshop_agent_stack'
if($LASTEXITCODE -ne 0){throw 'P3 policy migration failed'}
Get-Content -Raw -Encoding utf8 "$root/deploy/mysql/migrations/006-p3c-index-outbox.sql" | docker compose --env-file "$root/.env" -f "$root/deploy/compose.p0.yml" exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysql --default-character-set=utf8mb4 -ushop_agent_stack -Dshop_agent_stack'
if($LASTEXITCODE -ne 0){throw 'P3c index migration failed'}
docker compose -f "$root/deploy/compose.retrieval.yml" up -d --wait milvus
if($LASTEXITCODE -ne 0){throw 'Milvus startup failed'}
$compose=@('compose','--env-file',"$root/.env",'-f',"$root/deploy/compose.p0.yml",'-f',"$root/deploy/compose.p1.yml",'-f',"$root/deploy/compose.p2.yml",'-f',"$root/deploy/compose.p3c.yml")
if($TestMode){$compose+=@('-f',"$root/deploy/compose.p2-test.yml")}
if($Build){
    & "$PSScriptRoot/build-p0.ps1"
    docker @compose build agent
    if($LASTEXITCODE -ne 0){throw 'Agent image build failed'}
    Push-Location "$root/apps/web"
    try{npm ci; if($LASTEXITCODE -ne 0){throw 'npm ci failed'}; npm run build; if($LASTEXITCODE -ne 0){throw 'Web build failed'}} finally{Pop-Location}
}
docker @compose up -d --wait --wait-timeout 180
if($LASTEXITCODE -ne 0){throw 'P2 startup failed'}
docker @compose restart web
if($LASTEXITCODE -ne 0){throw 'Proxy restart failed'}
Write-Output 'P2: http://127.0.0.1:18030/app/assistant'
