$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$source = Join-Path $root 'services/commerce'
# Docker Desktop on Windows can lock mounted jars. Release only application containers before packaging.
if (Test-Path (Join-Path $root '.env')) {
    docker compose --env-file "$root/.env" -f "$root/deploy/compose.p0.yml" rm -s -f portal admin
    if ($LASTEXITCODE -ne 0) { throw 'Could not release application jars before build.' }
}
# Run focused Aster tests; upstream context-load tests need a separately provisioned test profile.
docker run --rm --mount "type=bind,source=$source,target=/workspace" --mount type=volume,source=aster_maven_cache,target=/root/.m2 -w /workspace maven:3.9.9-eclipse-temurin-17 mvn -B -ntp '-Ddocker.skip=true' '-DskipTests=false' '-Dtest=OrderOwnershipTest,CartPricingTest,AgentOperationTest,RefundServiceTest,ProductQueryServiceTest,SupportServiceTest,CatalogManagementServiceTest,FulfillmentServiceTest' '-Dsurefire.failIfNoSpecifiedTests=false' -pl 'mall-portal,mall-admin' -am package
if ($LASTEXITCODE -ne 0) { throw 'P0 build or focused tests failed.' }
