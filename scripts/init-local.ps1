$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$file = Join-Path $root '.env'
if (Test-Path -LiteralPath $file) { Write-Output '.env already exists; left unchanged.'; return }
function New-LocalSecret {
    $bytes = New-Object byte[] 48
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return [Convert]::ToBase64String($bytes)
}
$names = 'SHOP_AGENT_STACK_DB_PASSWORD','SHOP_AGENT_STACK_DB_ROOT_PASSWORD','SHOP_AGENT_STACK_MQ_PASSWORD','SHOP_AGENT_STACK_PORTAL_JWT_SECRET','SHOP_AGENT_STACK_ADMIN_JWT_SECRET'
$lines = @('# Local generated credentials; never commit this file.')
foreach ($name in $names) { $lines += "$name=$(New-LocalSecret)" }
[IO.File]::WriteAllLines($file, $lines, [Text.UTF8Encoding]::new($false))
Write-Output 'Created ignored .env with randomly generated local credentials.'
