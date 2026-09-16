$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$report = Get-Content (Join-Path $root '.local/p0-smoke.json') -Raw | ConvertFrom-Json
$orderId = [long]$report.orderId
$memberId = [long]$report.memberId
$sql = "SELECT COUNT(*) FROM oms_order WHERE id=$orderId AND member_id=$memberId AND pay_amount=99.80; SELECT COUNT(*) FROM oms_order_item WHERE order_id=$orderId AND product_quantity=2 AND product_price=49.90;"
$result = $sql | docker compose --env-file "$root/.env" -f "$root/deploy/compose.p0.yml" exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysql -ushop_agent_stack -Dshop_agent_stack -N'
if ($LASTEXITCODE -ne 0) { throw 'Database verification command failed.' }
$rows = @($result | ForEach-Object { $_.Trim() } | Where-Object { $_ })
if ($rows.Count -ne 2 -or $rows[0] -ne '1' -or $rows[1] -ne '1') { throw 'Persisted order or item does not match the smoke test.' }
Write-Output "PASS: persisted order $orderId belongs to customer $memberId, total 99.80, quantity 2, unit price 49.90."
