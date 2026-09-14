param([switch]$Build)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
& (Join-Path $PSScriptRoot 'init-local.ps1')
if ($Build) { & (Join-Path $PSScriptRoot 'build-p0.ps1') }
foreach ($module in @('mall-portal', 'mall-admin')) {
    if (-not (Test-Path (Join-Path $root "services/commerce/$module/target/$module-1.0-SNAPSHOT.jar"))) {
        throw 'Missing application jar. Run ./scripts/start-p0.ps1 -Build first.'
    }
}
docker compose --env-file "$root/.env" -f "$root/deploy/compose.p0.yml" up -d --wait --wait-timeout 180
if ($LASTEXITCODE -ne 0) { throw 'P0 services did not become healthy.' }
if ($Build) {
    docker compose --env-file "$root/.env" -f "$root/deploy/compose.p0.yml" up -d --force-recreate --wait --wait-timeout 180 portal admin
    if ($LASTEXITCODE -ne 0) { throw 'Rebuilt applications did not become healthy.' }
}
Write-Output 'Portal: http://127.0.0.1:18085 | Admin: http://127.0.0.1:18080'
