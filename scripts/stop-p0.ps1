$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
# Preserve all named volumes and local credentials for the next start.
docker compose --env-file "$root/.env" -f "$root/deploy/compose.p0.yml" -f "$root/deploy/compose.p1.yml" -f "$root/deploy/compose.p2.yml" -f "$root/deploy/compose.p3c.yml" down
if ($LASTEXITCODE -ne 0) { throw 'P0 shutdown failed.' }
docker compose -f "$root/deploy/compose.retrieval.yml" down
if ($LASTEXITCODE -ne 0) { throw 'Retrieval shutdown failed.' }
