$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
& "$PSScriptRoot/init-local.ps1"
$envFile = Join-Path $root '.env'
$content = Get-Content $envFile
$accounts = @()
foreach ($entry in @(@{key='ASTER_BOOTSTRAP_ADMIN_PASSWORD';user='aster_admin';role='ADMIN'},@{key='ASTER_BOOTSTRAP_SERVICE_PASSWORD';user='aster_service';role='SERVICE'})) {
    $line = $content | Where-Object { $_.StartsWith($entry.key + '=') } | Select-Object -First 1
    if (-not $line) {
        $password = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
        Add-Content $envFile "$($entry.key)=$password"
    } else { $password = $line.Substring($entry.key.Length+1) }
    $accounts += @{username=$entry.user;password=$password;role=$entry.role}
}
New-Item -ItemType Directory -Force "$root/.local" | Out-Null
$accounts | ConvertTo-Json | Set-Content -Encoding utf8 "$root/.local/p1-accounts.json"
Write-Output 'Local staff credentials are saved to .local/p1-accounts.json (Git ignored).'
docker compose --env-file "$root/.env" -f "$root/deploy/compose.p0.yml" up -d --wait mysql redis rabbitmq mongo
if ($LASTEXITCODE -ne 0) { throw 'Infrastructure startup failed.' }
Get-Content -Raw -Encoding utf8 "$root/deploy/mysql/migrations/003-p1.sql" | docker compose --env-file "$root/.env" -f "$root/deploy/compose.p0.yml" exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysql --default-character-set=utf8mb4 -uaster -Daster'
if ($LASTEXITCODE -ne 0) { throw 'P1 migration failed.' }
Write-Output 'P1 migration applied; rebuild and start the applications next.'
Get-Content -Raw -Encoding utf8 "$root/deploy/mysql/migrations/007-p4-refund-outbox.sql" | docker compose --env-file "$root/.env" -f "$root/deploy/compose.p0.yml" exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysql --default-character-set=utf8mb4 -uaster -Daster'
if ($LASTEXITCODE -ne 0) { throw 'P4 refund migration failed.' }
Get-Content -Raw -Encoding utf8 "$root/deploy/mysql/migrations/008-support.sql" | docker compose --env-file "$root/.env" -f "$root/deploy/compose.p0.yml" exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysql --default-character-set=utf8mb4 -uaster -Daster'
if ($LASTEXITCODE -ne 0) { throw 'Support migration failed.' }
Get-Content -Raw -Encoding utf8 "$root/deploy/mysql/migrations/009-catalog-management.sql" | docker compose --env-file "$root/.env" -f "$root/deploy/compose.p0.yml" exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysql --default-character-set=utf8mb4 -uaster -Daster'
if ($LASTEXITCODE -ne 0) { throw 'Catalog migration failed.' }
Get-Content -Raw -Encoding utf8 "$root/deploy/mysql/migrations/010-order-fulfillment.sql" | docker compose --env-file "$root/.env" -f "$root/deploy/compose.p0.yml" exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysql --default-character-set=utf8mb4 -uaster -Daster'
if ($LASTEXITCODE -ne 0) { throw 'Fulfillment migration failed.' }
