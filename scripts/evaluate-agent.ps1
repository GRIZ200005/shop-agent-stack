param(
    [switch]$Live,
    [ValidateSet('deepseek','openai','kimi','custom')][string]$Provider='deepseek',
    [ValidateRange(1,10)][int]$Repeats=1,
    [ValidateRange(1,1000)][int]$MaxModelCalls=100,
    [int]$SavedMember=0,
    [switch]$RequirePass
)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$runs=Join-Path $root 'evaluation/runs'
New-Item -ItemType Directory -Force -Path $runs | Out-Null
$dockerArgs=@('run','--rm','--mount',"type=bind,source=$root,target=/workspace,readonly",'--mount',"type=bind,source=$runs,target=/workspace/evaluation/runs",'--workdir','/workspace')
if($Live){
    if($SavedMember -gt 0){
        $dockerArgs+=@('--volumes-from','shop_agent_stack-p0-agent-1:ro')
    } else {
    $config=Join-Path $root '.local/agent-eval.env'
    if(-not (Test-Path -LiteralPath $config)){throw 'Live evaluation needs the dedicated ignored .local/agent-eval.env. See docs/testing.md.'}
    $dockerArgs+=@('--env-file',$config)
    }
}
$dockerArgs+=@('shop_agent_stack-agent:p2','python','scripts/evaluate-agent.py','--provider',$Provider,'--repeats',"$Repeats",'--max-model-calls',"$MaxModelCalls")
if($Live){$dockerArgs+='--live'}
if($SavedMember -gt 0){$dockerArgs+=@('--saved-member',"$SavedMember")}
if($RequirePass){$dockerArgs+='--fail-on-contract'}
docker @dockerArgs
if($LASTEXITCODE -ne 0){throw "Agent evaluation exited with code $LASTEXITCODE; local partial artifacts are retained."}
