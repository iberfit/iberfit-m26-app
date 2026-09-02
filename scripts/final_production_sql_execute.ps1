[CmdletBinding()]
param(
  [switch]$Apply,
  [string]$Confirmation = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Repository = 'iberfit/iberfit-m26-app'
$ExpectedReleaseSha = '9cbe3ad29dfda0a552aa54c7e1404575b96786d4'
$ExpectedSqlSha256 = '30e4f4750a4df9a2c5ab8f710427aac0d2112a308309221b5188e5c09d1ea2db'
$ExpectedArtifactDigest = 'sha256:9879456becbcdc0f851c721a14da2a9646d49da588c0948f7fefe3f238f520d2'
$ExpectedProjectRef = 'pjhmrhejsoofmouedavw'
$BundleRunId = 33656032685
$BundleArtifactName = 'final-production-promotion-sql'
$ReleaseBranch = 'prep/final-production-rc74-4'
$CanaryBranch = 'canary/rc74-4'
$SupersededAt = '2026-09-02'
$ObservedMigrationFloor = '20260831163404'
$ObservedMigrationCeiling = '20260902033214'
$SupersededReason = 'Live production already contains the RC74.4/RC65/P0 production migration sequence that this bundle expects to apply from an older baseline.'

function Fail([string]$Message) {
  throw "IBERFIT_FINAL_PRODUCTION_FAIL_CLOSED: $Message"
}

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    Fail "Missing required command: $Name"
  }
}

function Invoke-Capture([string]$File, [string[]]$Arguments) {
  $output = & $File @Arguments 2>$null | Out-String
  if ($LASTEXITCODE -ne 0) {
    Fail "$File failed while reading release evidence"
  }
  return $output
}

function Read-GitHubJson([string[]]$Arguments) {
  $raw = Invoke-Capture 'gh' $Arguments
  try {
    return $raw | ConvertFrom-Json
  } catch {
    Fail 'GitHub returned invalid JSON'
  }
}

function Assert-ReleaseRefs {
  foreach ($branch in @($ReleaseBranch, $CanaryBranch)) {
    $ref = Read-GitHubJson @('api', "repos/$Repository/git/ref/heads/$branch")
    if ([string]$ref.object.sha -ne $ExpectedReleaseSha) {
      Fail "Release ref moved: $branch"
    }
  }
}

Require-Command 'gh'
Assert-ReleaseRefs

$run = Read-GitHubJson @('api', "repos/$Repository/actions/runs/$BundleRunId")
if ([string]$run.head_sha -ne $ExpectedReleaseSha -or
    [string]$run.head_branch -ne $ReleaseBranch -or
    [string]$run.status -ne 'completed' -or
    [string]$run.conclusion -ne 'success') {
  Fail 'Pinned production bundle run is not the exact successful release run'
}

$artifacts = Read-GitHubJson @('api', "repos/$Repository/actions/runs/$BundleRunId/artifacts")
$artifact = @($artifacts.artifacts | Where-Object { $_.name -eq $BundleArtifactName })
if ($artifact.Count -ne 1) {
  Fail 'Expected production bundle artifact is missing or ambiguous'
}
if ([bool]$artifact[0].expired) {
  Fail 'Pinned production bundle artifact has expired'
}
if ([string]$artifact[0].digest -ne $ExpectedArtifactDigest) {
  Fail 'Production bundle ZIP digest mismatch'
}

if ($Apply -or -not [string]::IsNullOrWhiteSpace($Confirmation)) {
  Fail 'SQL apply is disabled: the pinned production SQL bundle is superseded by the live production migration state. Do not execute it.'
}

Write-Host 'BLOCKED · PRODUCTION SQL BUNDLE SUPERSEDED'
Write-Host "ReleaseSHA=$ExpectedReleaseSha"
Write-Host "SqlSHA256=$ExpectedSqlSha256"
Write-Host "ProjectRef=$ExpectedProjectRef"
Write-Host "SupersededAt=$SupersededAt"
Write-Host "ObservedMigrationFloor=$ObservedMigrationFloor"
Write-Host "ObservedMigrationCeiling=$ObservedMigrationCeiling"
Write-Host "Reason=$SupersededReason"
Write-Host 'ApplyDisabled=true'
Write-Host 'ProductionMutations=0'
Write-Host 'NextAction=Recover current provider/frontend deployment state and build any future database delta from the live production baseline.'
exit 0
