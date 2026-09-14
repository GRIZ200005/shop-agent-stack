param([switch]$Build)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
& "$PSScriptRoot/init-p1.ps1"
if ($Build) {
    & "$PSScriptRoot/build-p0.ps1"
    Push-Location "$root/apps/web"
    try {
        npm ci
        if ($LASTEXITCODE -ne 0) { throw 'Frontend dependencies failed.' }
        npm run build
        if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
    } finally { Pop-Location }
}
if (-not (Test-Path "$root/apps/web/dist/index.html")) { throw 'Run start-p1.ps1 -Build first.' }
docker compose --env-file "$root/.env" -f "$root/deploy/compose.p0.yml" -f "$root/deploy/compose.p1.yml" up -d --wait --wait-timeout 180
if ($LASTEXITCODE -ne 0) { throw 'P1 services did not become healthy.' }
# Refresh nginx upstream addresses after application containers are recreated.
docker compose --env-file "$root/.env" -f "$root/deploy/compose.p0.yml" -f "$root/deploy/compose.p1.yml" restart web
if ($LASTEXITCODE -ne 0) { throw 'Frontend proxy restart failed.' }
Write-Output 'Open http://127.0.0.1:18030/app | /service | /admin'
