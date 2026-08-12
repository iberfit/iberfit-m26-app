param(
  [switch]$AllowDownload
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root
. (Join-Path $Root "toolchain.ps1")

$toolchain = Get-IberfitAndroidToolchain
Write-IberfitAndroidToolchain $toolchain

if(-not $toolchain.Jdk17Ready){ throw "JDK17_REQUIRED" }
if(-not $toolchain.Sdk.Found){ throw "ANDROID_SDK_NOT_FOUND" }
if(-not $toolchain.Sdk.Platform36){ throw "ANDROID_PLATFORM_36_NOT_FOUND" }
if(-not $toolchain.Sdk.BuildTools36){ throw "BUILD_TOOLS_36_0_0_NOT_FOUND" }

$gradleExe = $null
if($toolchain.Gradle.Found){
  $versionCapture = Invoke-IberfitNativeCapture -FilePath $toolchain.Gradle.Path -ArgumentList @("--version")
  $versionMatch = [regex]::Match($versionCapture.Combined, 'Gradle\s+(?<v>\d+\.\d+(?:\.\d+)?)')
  if($versionCapture.ExitCode -eq 0 -and $versionMatch.Success){
    try {
      if(([version]$versionMatch.Groups["v"].Value) -ge [version]"9.5.0"){
        $gradleExe = $toolchain.Gradle.Path
      }
    } catch {}
  }
}

if(-not $gradleExe -and -not $AllowDownload){
  throw "GRADLE_9_5_REQUIRED"
}

if(-not $gradleExe){
  $Version = "9.5.0"
  $Cache = Join-Path $env:TEMP "iberfit-gradle-$Version"
  $Zip = Join-Path $env:TEMP "gradle-$Version-bin.zip"
  $ShaFile = Join-Path $env:TEMP "gradle-$Version-bin.zip.sha256"
  $Dist = Join-Path $Cache "gradle-$Version"
  $GradleBat = Join-Path $Dist "bin\gradle.bat"

  if(-not(Test-Path $GradleBat)){
    New-Item -ItemType Directory -Force -Path $Cache | Out-Null
    Invoke-WebRequest "https://services.gradle.org/distributions/gradle-$Version-bin.zip" -OutFile $Zip
    Invoke-WebRequest "https://services.gradle.org/distributions/gradle-$Version-bin.zip.sha256" -OutFile $ShaFile

    $expectedHash = ((Get-Content $ShaFile -Raw).Trim() -split '\s+')[0].ToLowerInvariant()
    $actualHash = (Get-FileHash -Algorithm SHA256 $Zip).Hash.ToLowerInvariant()
    if($expectedHash -ne $actualHash){ throw "GRADLE_DISTRIBUTION_SHA256_MISMATCH" }

    Expand-Archive -Path $Zip -DestinationPath $Cache -Force
  }

  $gradleExe = $GradleBat
  Write-Host "GRADLE_TEMP_DOWNLOAD=TRUE"
  Write-Host "GRADLE_SHA256_VERIFIED=TRUE"
}

$oldJavaHome = $env:JAVA_HOME
$oldSdkRoot = $env:ANDROID_SDK_ROOT
$oldAndroidHome = $env:ANDROID_HOME

try {
  $env:JAVA_HOME = $toolchain.Java.Home
  $env:ANDROID_SDK_ROOT = $toolchain.Sdk.Root
  $env:ANDROID_HOME = $toolchain.Sdk.Root

  $build = Invoke-IberfitNativeCapture `
    -FilePath $gradleExe `
    -ArgumentList @(
      "--no-daemon",
      ":phone-app:assembleDebug",
      ":wear-app:assembleDebug"
    )

  if($build.StdOut){ Write-Host $build.StdOut.TrimEnd() }
  if($build.StdErr){ Write-Host $build.StdErr.TrimEnd() }
  if($build.ExitCode -ne 0){ throw "RC57_APK_BUILD_FAILED:$($build.ExitCode)" }

  $phoneApk = Join-Path $Root "phone-app\build\outputs\apk\debug\phone-app-debug.apk"
  $wearApk = Join-Path $Root "wear-app\build\outputs\apk\debug\wear-app-debug.apk"

  if(-not(Test-Path $phoneApk)){ throw "PHONE_APK_NOT_FOUND" }
  if(-not(Test-Path $wearApk)){ throw "WEAR_APK_NOT_FOUND" }

  $phoneHash = (Get-FileHash -Algorithm SHA256 $phoneApk).Hash.ToLowerInvariant()
  $wearHash = (Get-FileHash -Algorithm SHA256 $wearApk).Hash.ToLowerInvariant()

  Write-Host "PHONE_APK=$phoneApk"
  Write-Host "PHONE_APK_SHA256=$phoneHash"
  Write-Host "WEAR_APK=$wearApk"
  Write-Host "WEAR_APK_SHA256=$wearHash"

  $apksigner = Join-Path $toolchain.Sdk.Root "build-tools\36.0.0\apksigner.bat"
  if(-not(Test-Path $apksigner)){ throw "APKSIGNER_NOT_FOUND" }

  $phoneSig = Invoke-IberfitNativeCapture -FilePath $apksigner -ArgumentList @("verify","--print-certs",$phoneApk)
  $wearSig = Invoke-IberfitNativeCapture -FilePath $apksigner -ArgumentList @("verify","--print-certs",$wearApk)
  if($phoneSig.ExitCode -ne 0){ throw "PHONE_APK_SIGNATURE_VERIFY_FAILED" }
  if($wearSig.ExitCode -ne 0){ throw "WEAR_APK_SIGNATURE_VERIFY_FAILED" }

  $pattern = 'Signer #1 certificate SHA-256 digest:\s*(?<sha>[0-9a-fA-F]+)'
  $phoneMatch = [regex]::Match($phoneSig.Combined, $pattern)
  $wearMatch = [regex]::Match($wearSig.Combined, $pattern)
  if(-not $phoneMatch.Success){ throw "PHONE_CERT_SHA256_NOT_FOUND" }
  if(-not $wearMatch.Success){ throw "WEAR_CERT_SHA256_NOT_FOUND" }

  $phoneCert = $phoneMatch.Groups["sha"].Value.ToLowerInvariant()
  $wearCert = $wearMatch.Groups["sha"].Value.ToLowerInvariant()
  if($phoneCert -ne $wearCert){ throw "PHONE_WEAR_SIGNATURE_MISMATCH" }

  Write-Host "PHONE_CERT_SHA256=$phoneCert"
  Write-Host "WEAR_CERT_SHA256=$wearCert"
  Write-Host "PHONE_WEAR_SIGNATURE_MATCH=TRUE"
  Write-Host "PHONE_WEAR_APPLICATION_ID=cl.iberfit.m26"
  Write-Host "PHONE_APK_BUILD=PASS"
  Write-Host "WEAR_APK_BUILD=PASS"
  Write-Host "RC57_INSTALLABLE_APKS=PASS"
} finally {
  $env:JAVA_HOME = $oldJavaHome
  $env:ANDROID_SDK_ROOT = $oldSdkRoot
  $env:ANDROID_HOME = $oldAndroidHome
}