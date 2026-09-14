$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$report = Get-Content "$root/.local/p1-flow.json" -Raw | ConvertFrom-Json
$caseId = [long]$report.caseId
$orderId = [long]$report.orderId
$sql = "SELECT COUNT(*) FROM aster_after_sale a JOIN oms_order o ON o.id=a.order_id WHERE a.id=$caseId AND o.id=$orderId AND a.status='REFUNDED' AND o.status=4 AND a.amount=o.pay_amount AND a.amount=49.90 AND a.refund_reference='SIM-ASTER-$caseId'; SELECT COUNT(*) FROM aster_after_sale_event WHERE case_id=$caseId AND action='REFUNDED'; SELECT COUNT(*) FROM aster_after_sale_event WHERE case_id=$caseId;"
$result = $sql | docker compose --env-file "$root/.env" -f "$root/deploy/compose.p0.yml" exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysql -uaster -Daster -N'
if ($LASTEXITCODE -ne 0) { throw 'Database query failed.' }
$rows=@($result | ForEach-Object {$_.Trim()} | Where-Object {$_})
if ($rows.Count -ne 3 -or $rows[0] -ne '1' -or $rows[1] -ne '1' -or $rows[2] -ne '4') { throw 'Refund state or event persistence does not match the completed browser flow.' }
Write-Output "PASS: case $caseId, order $orderId, amount 49.90, closed order, one simulated refund, four audit events."
