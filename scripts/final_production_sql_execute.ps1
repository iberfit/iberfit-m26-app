[CmdletBinding()]
param(
  [switch]$Apply,
  [string]$Confirmation = '',
  [string]$WorkDir = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Repository = 'iberfit/iberfit-m26-app'
$ExpectedReleaseSha = '9cbe3ad29dfda0a552aa54c7e1404575b96786d4'
$ExpectedSqlSha256 = '30e4f4750a4df9a2c5ab8f710427aac0d2112a308309221b5188e5c09d1ea2db'
$ExpectedArtifactDigest = 'sha256:9879456becbcdc0f851c721a14da2a9646d49da588c0948f7fefe3f238f520d2'
$ExpectedPreflightBlobSha = 'bb3c8890986f2bb0aadcf0213d2772dbcbdaf8c4'
$ExpectedProjectRef = 'pjhmrhejsoofmouedavw'
$BundleRunId = 33656032685
$BundleArtifactName = 'final-production-promotion-sql'
$ReleaseBranch = 'prep/final-production-rc74-4'
$CanaryBranch = 'canary/rc74-4'
$ExpectedConfirmation = "APPLY IBERFIT PRODUCTION $ExpectedReleaseSha"

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

function Invoke-Checked([string]$File, [string[]]$Arguments, [string]$Label) {
  & $File @Arguments
  if ($LASTEXITCODE -ne 0) {
    Fail "$Label failed with exit code $LASTEXITCODE"
  }
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

function Assert-DatabaseTarget {
  foreach ($name in @('IBERFIT_PROD_PROJECT_REF','PGHOST','PGDATABASE','PGUSER','PGPASSWORD','PGSSLMODE')) {
    $value = [Environment]::GetEnvironmentVariable($name)
    if ([string]::IsNullOrWhiteSpace($value)) {
      Fail "Missing required environment variable: $name"
    }
  }

  if ($env:IBERFIT_PROD_PROJECT_REF -ne $ExpectedProjectRef) {
    Fail 'Production project ref mismatch'
  }
  if ($env:PGSSLMODE.ToLowerInvariant() -ne 'require') {
    Fail 'PGSSLMODE must be require'
  }

  $targetFingerprint = "$($env:PGHOST)|$($env:PGUSER)"
  if ($targetFingerprint -notmatch [regex]::Escape($ExpectedProjectRef)) {
    Fail 'Database host/user does not prove the expected Supabase project ref'
  }
}

Require-Command 'gh'
Require-Command 'psql'

Assert-ReleaseRefs
Assert-DatabaseTarget

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

$autoWorkDir = [string]::IsNullOrWhiteSpace($WorkDir)
if ($autoWorkDir) {
  $WorkDir = Join-Path ([IO.Path]::GetTempPath()) ("iberfit-final-production-" + [guid]::NewGuid().ToString('N'))
}
New-Item -ItemType Directory -Path $WorkDir -Force | Out-Null
$bundleDir = Join-Path $WorkDir 'bundle'
New-Item -ItemType Directory -Path $bundleDir -Force | Out-Null

Invoke-Checked 'gh' @('run','download',[string]$BundleRunId,'--repo',$Repository,'--name',$BundleArtifactName,'--dir',$bundleDir) 'Production bundle download'

$sqlPath = Join-Path $bundleDir 'backend/production/generated/FINAL_PRODUCTION_PROMOTION.sql'
$checksumPath = Join-Path $bundleDir 'FINAL_PRODUCTION_PROMOTION.sha256'
if (-not (Test-Path -LiteralPath $sqlPath -PathType Leaf)) {
  Fail 'Production SQL file missing from pinned artifact'
}
if (-not (Test-Path -LiteralPath $checksumPath -PathType Leaf)) {
  Fail 'Production SQL checksum file missing from pinned artifact'
}

$sqlHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $sqlPath).Hash.ToLowerInvariant()
if ($sqlHash -ne $ExpectedSqlSha256) {
  Fail 'Production SQL SHA-256 mismatch'
}
$declaredHash = ((Get-Content -LiteralPath $checksumPath -Raw).Trim() -split '\s+')[0].ToLowerInvariant()
if ($declaredHash -ne $ExpectedSqlSha256) {
  Fail 'Production artifact checksum declaration mismatch'
}

$sql = Get-Content -LiteralPath $sqlPath -Raw
foreach ($forbidden in @('m26-canary.iberfit.cl','gjztkdwfmunnzhtvxrsu','qa.rc74.')) {
  if ($sql.IndexOf($forbidden,[StringComparison]::OrdinalIgnoreCase) -ge 0) {
    Fail "Forbidden non-production marker in SQL: $forbidden"
  }
}
foreach ($required in @("'PRODUCTION'",'https://app.iberfit.cl','https://coach.iberfit.cl','FINAL PRODUCTION PREFLIGHT','FINAL PRODUCTION POSTCHECK')) {
  if ($sql.IndexOf($required,[StringComparison]::OrdinalIgnoreCase) -lt 0) {
    Fail "Required production marker missing from SQL: $required"
  }
}

$preflight = Read-GitHubJson @('api','--method','GET',"repos/$Repository/contents/backend/FINAL_PRODUCTION_PREFLIGHT_READONLY.sql",'-f',"ref=$ExpectedReleaseSha")
if ([string]$preflight.sha -ne $ExpectedPreflightBlobSha) {
  Fail 'Read-only preflight blob SHA mismatch'
}
try {
  $preflightBytes = [Convert]::FromBase64String(([string]$preflight.content -replace '\s',''))
} catch {
  Fail 'Could not decode pinned read-only preflight'
}
$preflightPath = Join-Path $WorkDir 'FINAL_PRODUCTION_PREFLIGHT_READONLY.sql'
[IO.File]::WriteAllBytes($preflightPath,$preflightBytes)

Write-Host '=== IBERFIT FINAL PRODUCTION · READ-ONLY PREFLIGHT ==='
Write-Host "ReleaseSHA=$ExpectedReleaseSha"
Write-Host "SqlSHA256=$ExpectedSqlSha256"
Write-Host "ProjectRef=$ExpectedProjectRef"
Write-Host 'DatabaseCredentialsPrinted=false'

$previousPgOptions = $env:PGOPTIONS
try {
  $env:PGOPTIONS = '-c default_transaction_read_only=on'
  Invoke-Checked 'psql' @('--no-password','--single-transaction','--set=ON_ERROR_STOP=1','--file',$preflightPath) 'Read-only production preflight'
} finally {
  $env:PGOPTIONS = $previousPgOptions
}

if (-not $Apply) {
  Write-Host 'PASS · READ-ONLY PREFLIGHT'
  Write-Host 'ProductionMutations=0'
  Write-Host 'To apply, an explicit -Apply plus the exact confirmation phrase is required.'
  exit 0
}

if ($Confirmation -cne $ExpectedConfirmation) {
  Fail 'Exact production confirmation phrase missing or incorrect'
}

# Re-check refs and bytes immediately before the only mutating command.
Assert-ReleaseRefs
$sqlHashBeforeApply = (Get-FileHash -Algorithm SHA256 -LiteralPath $sqlPath).Hash.ToLowerInvariant()
if ($sqlHashBeforeApply -ne $ExpectedSqlSha256) {
  Fail 'Production SQL changed after preflight'
}

Write-Host '=== IBERFIT FINAL PRODUCTION · SQL APPLY ==='
Write-Host 'Mode=single-transaction'
Write-Host 'OnErrorStop=true'
Write-Host 'CredentialsPrinted=false'

Invoke-Checked 'psql' @('--no-password','--single-transaction','--set=ON_ERROR_STOP=1','--file',$sqlPath) 'Production SQL promotion'

Write-Host 'PASS · PRODUCTION SQL PROMOTION'
Write-Host "ReleaseSHA=$ExpectedReleaseSha"
Write-Host "SqlSHA256=$ExpectedSqlSha256"
Write-Host 'TransactionAtomic=true'
Write-Host 'EdgeFunctionDeployed=false'
Write-Host 'FrontendDeployed=false'
