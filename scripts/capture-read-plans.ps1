param([Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$out=[IO.Path]::GetFullPath($OutputDirectory)
$allowed=[IO.Path]::GetFullPath((Join-Path $root 'evaluation/runs/performance'))+[IO.Path]::DirectorySeparatorChar
if(-not $out.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $out)){throw 'Output must be an existing local performance run directory'}
if(Test-Path (Join-Path $out 'sql-plans.txt')){throw 'Do not overwrite an existing plan capture'}
$sourcePath=Join-Path $root 'services/commerce/aster-after-sale/src/main/java/com/macro/mall/aster/RefundDiagnostics.java'
$source=Get-Content -LiteralPath $sourcePath -Raw
$constants=@{}
$constants.SOURCE=[regex]::Match($source,'(?s)SOURCE="""(.*?)""";').Groups[1].Value
function Expand-Sql([string]$expression) {
    $parts=foreach($token in [regex]::Matches($expression,'"(?:\\.|[^"\\])*"|CLASSIFIED|SOURCE')) {
        if($token.Value.StartsWith('"')){ConvertFrom-Json $token.Value} else {$constants[$token.Value]}
    }
    return $parts -join ''
}
$constants.CLASSIFIED=Expand-Sql ([regex]::Match($source,'(?s)CLASSIFIED=(.*?);').Groups[1].Value)
$summary=Expand-Sql ([regex]::Match($source,'var summary=db.queryForMap\((.*?)\);').Groups[1].Value)
$page=(Expand-Sql ([regex]::Match($source,'var rows=db.queryForList\((.*?),before,before\);').Groups[1].Value)).Replace('?', '0')
if(-not $summary.StartsWith('SELECT COUNT(*)') -or -not $page.StartsWith('SELECT * FROM') -or -not $constants.SOURCE.Trim().StartsWith('SELECT ids.case_id')){throw 'Query extraction failed; review source changes'}
$mapperPath=Join-Path $root 'services/commerce/mall-mbg/src/main/resources/com/macro/mall/mapper/PmsProductMapper.xml'
$columns=[regex]::Match((Get-Content $mapperPath -Raw),'(?s)<sql id="Base_Column_List">(.*?)</sql>').Groups[1].Value.Trim()
if(-not $columns -or $columns.Contains('<')){throw 'Mapper projection extraction failed'}
$sql=@"
SET SESSION TRANSACTION READ ONLY;
SELECT VERSION() mysql_version,@@innodb_buffer_pool_size buffer_pool_bytes,@@max_connections max_connections;
SELECT 'pms_product' table_name,COUNT(*) row_count FROM pms_product UNION ALL SELECT 'aster_after_sale',COUNT(*) FROM aster_after_sale UNION ALL SELECT 'aster_refund_job',COUNT(*) FROM aster_refund_job UNION ALL SELECT 'aster_simulated_refund',COUNT(*) FROM aster_simulated_refund UNION ALL SELECT 'aster_after_sale_event',COUNT(*) FROM aster_after_sale_event;
SELECT 'catalog_count' plan_label;
EXPLAIN ANALYZE SELECT COUNT(*) FROM pms_product WHERE delete_status=0 AND publish_status=1;
SELECT 'catalog_page' plan_label;
EXPLAIN ANALYZE SELECT $columns FROM pms_product WHERE delete_status=0 AND publish_status=1 ORDER BY sort DESC,id DESC LIMIT 20;
SELECT 'refund_summary' plan_label;
EXPLAIN ANALYZE $summary;
SELECT 'refund_page' plan_label;
EXPLAIN ANALYZE $page;
"@
$sql | Set-Content -Encoding utf8 (Join-Path $out 'queries.sql')
$plans=$sql | docker compose --env-file "$root/.env" -f "$root/deploy/compose.p0.yml" exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysql --default-character-set=utf8mb4 -uaster -Daster --raw'
if($LASTEXITCODE -ne 0){throw 'Read-only execution plan capture failed'}
$plans | Set-Content -Encoding utf8 (Join-Path $out 'sql-plans.txt')
@{diagnostics_sha256=(Get-FileHash $sourcePath -Algorithm SHA256).Hash;mapper_sha256=(Get-FileHash $mapperPath -Algorithm SHA256).Hash;queries_sha256=(Get-FileHash (Join-Path $out 'queries.sql') -Algorithm SHA256).Hash;captured_at=[DateTime]::UtcNow.ToString('o');kind='EXPLAIN ANALYZE on existing local data; no slow query log enabled'} | ConvertTo-Json | Set-Content (Join-Path $out 'plans-manifest.json')
Write-Output 'Read-only query plans and data counts captured; no row payloads or credentials exported.'
