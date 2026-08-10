param([switch]$AllowDownload)
$ErrorActionPreference="Stop"
$Root=Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

$java=(Get-Command java -ErrorAction SilentlyContinue)
if(-not $java){Write-Host "ANDROID_BUILD_SKIPPED=JDK_NOT_FOUND";exit 0}
$javaText=(& java -version 2>&1 | Out-String)
if($javaText -notmatch 'version "(17|1[89]|2[0-9])'){Write-Host "ANDROID_BUILD_SKIPPED=JDK17_REQUIRED";exit 0}

$sdk=$env:ANDROID_SDK_ROOT
if(-not $sdk){$sdk=$env:ANDROID_HOME}
if(-not $sdk -or -not (Test-Path $sdk)){Write-Host "ANDROID_BUILD_SKIPPED=ANDROID_SDK_NOT_FOUND";exit 0}

$gradle=(Get-Command gradle -ErrorAction SilentlyContinue)
if($gradle){
  & gradle --no-daemon :iberfit-native:compileDebugKotlin
  if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
  Write-Host "ANDROID_COMPILE_RUN=TRUE"
  exit 0
}

if(-not $AllowDownload){Write-Host "ANDROID_BUILD_SKIPPED=GRADLE_NOT_FOUND";exit 0}

$Version="9.5.0"
$Cache=Join-Path $env:TEMP "iberfit-gradle-$Version"
$Zip=Join-Path $env:TEMP "gradle-$Version-bin.zip"
$Dist=Join-Path $Cache "gradle-$Version"
if(-not (Test-Path (Join-Path $Dist "bin\gradle.bat"))){
  New-Item -ItemType Directory -Force -Path $Cache|Out-Null
  Invoke-WebRequest "https://services.gradle.org/distributions/gradle-$Version-bin.zip" -OutFile $Zip
  Expand-Archive -Path $Zip -DestinationPath $Cache -Force
}
& (Join-Path $Dist "bin\gradle.bat") --no-daemon :iberfit-native:compileDebugKotlin
if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
Write-Host "ANDROID_COMPILE_RUN=TRUE"
