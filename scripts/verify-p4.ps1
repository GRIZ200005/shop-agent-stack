# Run separately from other tests: deliberately stops RabbitMQ and restarts the admin worker.
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
Push-Location $root
$compose=@('compose','--env-file',"$root/.env",'-f',"$root/deploy/compose.p0.yml")
function Query([string]$sql) {
    $result=$sql | docker @compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysql -ushop_agent_stack -Dshop_agent_stack -N'
    if($LASTEXITCODE -ne 0){throw 'P4 database assertion failed'}
    return @($result | ForEach-Object {$_.Trim()} | Where-Object {$_})
}
function Fixture([string]$phase) {
    docker run --rm --network shop_agent_stack-p0_default --mount "type=bind,source=$root,target=/workspace,readonly" --mount "type=bind,source=$root/.local,target=/workspace/.local" --workdir /workspace shop_agent_stack-agent:p2 python scripts/refund-fixture.py $phase
    if($LASTEXITCODE -ne 0){throw "P4 $phase failed"}
}
try {
    Fixture prepare
    $fixture=Get-Content .local/p4-fixture.json -Raw | ConvertFrom-Json
    $caseId=[long]$fixture.case_id
    $orderId=[long]$fixture.order_id
    try {
        docker @compose stop rabbitmq
        if($LASTEXITCODE -ne 0){throw 'Cannot inject broker outage'}
        Fixture approve
        $before=Query "SELECT COUNT(*) FROM shop_agent_stack_refund_job WHERE case_id=$caseId AND status='PENDING'; SELECT COUNT(*) FROM shop_agent_stack_simulated_refund WHERE case_id=$caseId; SELECT status FROM oms_order WHERE id=$orderId;"
        if(($before -join ',') -ne '1,0,1'){throw 'Outbox was lost or refund completed during broker outage'}
        docker @compose stop admin
        if($LASTEXITCODE -ne 0){throw 'Cannot stop refund worker'}
    } finally {
        docker @compose up -d --wait --wait-timeout 180 rabbitmq admin
        if($LASTEXITCODE -ne 0){throw 'Cannot restore broker and refund worker'}
    }
    $done=$false
    for($i=0;$i -lt 45;$i++) {
        $state=Query "SELECT status FROM shop_agent_stack_refund_job WHERE case_id=$caseId;"
        if(($state -join '') -eq 'DONE'){$done=$true;break}
        Start-Sleep -Seconds 2
    }
    if(-not $done){throw 'Pending refund did not recover after worker restart'}
    # Publish the same business identifier twice using container-owned credentials, never print them.
    $publish='rabbitmqadmin -u "$RABBITMQ_DEFAULT_USER" -p "$RABBITMQ_DEFAULT_PASS" -V /shop_agent_stack publish exchange=amq.default routing_key=shop_agent_stack.refunds.v1 payload='+$caseId
    1..2 | ForEach-Object {
        docker @compose exec -T rabbitmq sh -c $publish
        if($LASTEXITCODE -ne 0){throw 'Could not inject duplicate delivery'}
    }
    $drained=$false
    for($i=0;$i -lt 15;$i++) {
        Start-Sleep -Seconds 2
        $raw=docker @compose exec -T rabbitmq sh -c 'rabbitmqadmin -u "$RABBITMQ_DEFAULT_USER" -p "$RABBITMQ_DEFAULT_PASS" -V /shop_agent_stack -f raw_json list queues name messages_ready messages_unacknowledged'
        if($LASTEXITCODE -ne 0){throw 'Cannot verify queue drain'}
        $queue=($raw | ConvertFrom-Json) | Where-Object {$_.name -eq 'shop_agent_stack.refunds.v1'}
        if($queue -and $queue.messages_ready -eq 0 -and $queue.messages_unacknowledged -eq 0){$drained=$true;break}
    }
    if(-not $drained){throw 'Duplicate deliveries were not consumed'}
    $after=Query "SELECT COUNT(*) FROM shop_agent_stack_simulated_refund WHERE case_id=$caseId AND order_id=$orderId; SELECT COUNT(*) FROM shop_agent_stack_after_sale_event WHERE case_id=$caseId AND action='REFUNDED'; SELECT COUNT(*) FROM shop_agent_stack_after_sale a JOIN oms_order o ON o.id=a.order_id JOIN shop_agent_stack_refund_job j ON j.case_id=a.id WHERE a.id=$caseId AND a.status='REFUNDED' AND o.status=4 AND j.status='DONE' AND a.amount=o.pay_amount;"
    if(($after -join ',') -ne '1,1,1'){throw 'Duplicate delivery changed refund outcome'}
    @{case_id=$caseId;order_id=$orderId;broker_outage_pending=$true;worker_restart_recovered=$true;duplicate_deliveries=2;ledger_rows=1;refund_events=1;timestamp=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json | Set-Content .local/p4-verification.json
    Write-Output 'PASS: concurrent claim/approval, broker outage, worker restart, duplicate delivery, one refund ledger and event.'
} finally {Pop-Location}
