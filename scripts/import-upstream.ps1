param([string]$Source = '')
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
if (-not $Source) { $Source = Join-Path $root '.local/upstream-mall' }
$pin = '9bfc2fd2c4aaa4ac519e9152e65d673a5380de1a'
$actual = git -C $Source rev-parse HEAD
if ($LASTEXITCODE -ne 0 -or $actual -ne $pin) { throw 'Upstream commit mismatch.' }
$target = Join-Path $root 'services/commerce'
if (Test-Path $target) { throw 'Target exists. Import is one-shot to protect local modifications.' }
New-Item -ItemType Directory -Path $target -Force | Out-Null
$modules = @('mall-common','mall-mbg','mall-security','mall-admin','mall-portal')
Copy-Item -LiteralPath (Join-Path $Source 'LICENSE') -Destination (Join-Path $target 'LICENSE')
Copy-Item -LiteralPath (Join-Path $Source 'pom.xml') -Destination $target
foreach ($module in $modules) {
    $moduleTarget = Join-Path $target $module
    New-Item -ItemType Directory -Path $moduleTarget | Out-Null
    Copy-Item -LiteralPath (Join-Path $Source "$module/pom.xml") -Destination $moduleTarget
    Copy-Item -LiteralPath (Join-Path $Source "$module/src") -Destination $moduleTarget -Recurse
}
# Remove only copied deployment/generator settings; source copyright remains intact.
Get-ChildItem -LiteralPath $target -Recurse -File | Where-Object {
    $_.Name -match '^application-(dev|prod)\.yml$|^generatorConfig\.xml$|^generator\.properties$'
} | ForEach-Object { Remove-Item -LiteralPath $_.FullName }
$pomPath = Join-Path $target 'pom.xml'
$pom = Get-Content -LiteralPath $pomPath -Raw
$pom = $pom -replace '\s*<module>mall-(demo|search)</module>', ''
$pom = $pom -replace '<docker.host>.*?</docker.host>', '<docker.host>http://localhost:2375</docker.host>'
$pom = $pom -replace '<skipTests>true</skipTests>', '<skipTests>false</skipTests>'
$pom = $pom.Replace('<modelVersion>', '<!-- Modified by Aster Commerce: P0 module subset and safe build defaults. -->' + "`n    <modelVersion>")
[IO.File]::WriteAllText($pomPath, $pom, [Text.UTF8Encoding]::new($false))
foreach ($module in @('mall-admin','mall-portal')) {
    $configPath = Join-Path $target "$module/src/main/resources/application.yml"
    $config = Get-Content -LiteralPath $configPath -Raw
    $config = $config -replace 'active: dev.*', 'active: aster'
    $config = $config -replace 'secret: mall-(admin|portal)-secret.*', 'secret: ${ASTER_JWT_SECRET}'
    $config = "# Modified by Aster Commerce: environment-only JWT key and isolated local profile.`n" + $config
    [IO.File]::WriteAllText($configPath, $config, [Text.UTF8Encoding]::new($false))
}
$sql = Get-Content -LiteralPath (Join-Path $Source 'document/sql/mall.sql') -Raw
$tables = [regex]::Matches($sql, '(?ms)^CREATE TABLE .*?^\) ENGINE.*?;')
if ($tables.Count -lt 50) { throw 'DDL extraction unexpectedly small.' }
$ddl = "-- Derived from macrozheng/mall $pin, Apache-2.0.`n-- Modified by Aster Commerce: schema only; all upstream sample rows and export metadata excluded.`nSET NAMES utf8mb4;`n"
foreach ($table in $tables) { $ddl += ($table.Value -replace 'AUTO_INCREMENT = \d+', 'AUTO_INCREMENT = 1') + "`n`n" }
$sqlDir = Join-Path $root 'deploy/mysql/init'
New-Item -ItemType Directory -Path $sqlDir -Force | Out-Null
[IO.File]::WriteAllText((Join-Path $sqlDir '01-schema.sql'), $ddl, [Text.UTF8Encoding]::new($false))
Write-Output "Imported $($modules.Count) modules and $($tables.Count) table definitions; no upstream sample rows."
