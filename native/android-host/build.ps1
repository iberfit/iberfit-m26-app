param(
  [switch]$AllowDownload,
  [switch]$DoctorOnly
)
$ErrorActionPreference="Stop"
$Root=Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root
. (Join-Path $Root "toolchain.ps1")

$toolchain = Get-IberfitAndroidToolchain
Write-IberfitAndroidToolchain $toolchain

if($DoctorOnly){ exit 0 }

if(-not $toolchain.Jdk17Ready){
  Write-Host "ANDROID_BUILD_SKIPPED=JDK17_REQUIRED"
  exit 0
}
if(-not $toolchain.Sdk.Found){
  Write-Host "ANDROID_BUILD_SKIPPED=ANDROID_SDK_NOT_FOUND"
  exit 0
}
if(-not $toolchain.Sdk.Platform36){
  Write-Host "ANDROID_BUILD_SKIPPED=ANDROID_PLATFORM_36_NOT_FOUND"
  exit 0
}
if(-not $toolchain.Sdk.BuildTools36){
  Write-Host "ANDROID_BUILD_SKIPPED=BUILD_TOOLS_36_0_0_NOT_FOUND"
  exit 0
}

$gradleExe = $null
if($toolchain.Gradle.Found){
  $versionText = (& $toolchain.Gradle.Path --version 2>&1 | Out-String)
  $versionMatch = [regex]::Match($versionText, 'Gradle\s+(?<v>\d+\.\d+(?:\.\d+)?)')
  if($versionMatch.Success){
    try {
      $foundVersion = [version]$versionMatch.Groups["v"].Value
      if($foundVersion -ge [version]"9.5.0"){
        $gradleExe = $toolchain.Gradle.Path
      }
    } catch {}
  }
}

if(-not $gradleExe -and -not $AllowDownload){
  Write-Host "ANDROID_BUILD_SKIPPED=GRADLE_9_5_REQUIRED"
  exit 0
}

if(-not $gradleExe){
  $Version="9.5.0"
  $Cache=Join-Path $env:TEMP "iberfit-gradle-$Version"
  $Zip=Join-Path $env:TEMP "gradle-$Version-bin.zip"
  $ShaFile=Join-Path $env:TEMP "gradle-$Version-bin.zip.sha256"
  $Dist=Join-Path $Cache "gradle-$Version"
  $GradleBat=Join-Path $Dist "bin\gradle.bat"

  if(-not (Test-Path $GradleBat)){
    New-Item -ItemType Directory -Force -Path $Cache|Out-Null
    Invoke-WebRequest "https://services.gradle.org/distributions/gradle-$Version-bin.zip" -OutFile $Zip
    Invoke-WebRequest "https://services.gradle.org/distributions/gradle-$Version-bin.zip.sha256" -OutFile $ShaFile

    $expectedHash = ((Get-Content $ShaFile -Raw).Trim() -split '\s+')[0].ToLowerInvariant()
    $actualHash = (Get-FileHash -Algorithm SHA256 $Zip).Hash.ToLowerInvariant()
    if($expectedHash -ne $actualHash){
      throw "GRADLE_DISTRIBUTION_SHA256_MISMATCH"
    }

    Expand-Archive -Path $Zip -DestinationPath $Cache -Force
  }
  $gradleExe = $GradleBat
  Write-Host "GRADLE_TEMP_DOWNLOAD=TRUE"
  Write-Host "GRADLE_SHA256_VERIFIED=TRUE"
}

$oldJavaHome=$env:JAVA_HOME
$oldSdkRoot=$env:ANDROID_SDK_ROOT
$oldAndroidHome=$env:ANDROID_HOME

try {
  $env:JAVA_HOME=$toolchain.Java.Home
  $env:ANDROID_SDK_ROOT=$toolchain.Sdk.Root
  $env:ANDROID_HOME=$toolchain.Sdk.Root

  & $gradleExe --no-daemon :iberfit-native:compileDebugKotlin
  if($LASTEXITCODE -ne 0){ exit $LASTEXITCODE }
  Write-Host "ANDROID_COMPILE_RUN=TRUE"
} finally {
  $env:JAVA_HOME=$oldJavaHome
  $env:ANDROID_SDK_ROOT=$oldSdkRoot
  $env:ANDROID_HOME=$oldAndroidHome
}
