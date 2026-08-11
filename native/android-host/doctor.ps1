param([switch]$Json)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $Root "toolchain.ps1")

$toolchain = Get-IberfitAndroidToolchain

$deviceCount = 0
$hardwareCount = 0
$wearDetected = $false
$deviceSummaries = @()

if($toolchain.Sdk.AdbFound){
  # Canonical RC56 command contract: $toolchain.Sdk.AdbPath devices -l
  $adbDevices = Invoke-IberfitNativeCapture -FilePath $toolchain.Sdk.AdbPath -ArgumentList @("devices","-l")

  if($adbDevices.ExitCode -eq 0){
    $lines = @($adbDevices.StdOut -split "`r?`n")
    $connected = @($lines | Where-Object { $_ -match '^\S+\s+device(?:\s|$)' })
    $deviceCount = $connected.Count

    $index = 0
    foreach($line in $connected){
      $index++
      $serial = (($line -split '\s+')[0]).Trim()
      if($serial -notmatch '^emulator-'){ $hardwareCount++ }

      $characteristicsResult = Invoke-IberfitNativeCapture -FilePath $toolchain.Sdk.AdbPath -ArgumentList @("-s",$serial,"shell","getprop","ro.build.characteristics")
      $modelResult = Invoke-IberfitNativeCapture -FilePath $toolchain.Sdk.AdbPath -ArgumentList @("-s",$serial,"shell","getprop","ro.product.model")
      $releaseResult = Invoke-IberfitNativeCapture -FilePath $toolchain.Sdk.AdbPath -ArgumentList @("-s",$serial,"shell","getprop","ro.build.version.release")

      $characteristics = if($characteristicsResult.ExitCode -eq 0){ $characteristicsResult.StdOut.Trim() }else{ "" }
      $model = if($modelResult.ExitCode -eq 0){ $modelResult.StdOut.Trim() }else{ "" }
      $release = if($releaseResult.ExitCode -eq 0){ $releaseResult.StdOut.Trim() }else{ "" }

      if($characteristics -match 'watch'){ $wearDetected = $true }

      $deviceSummaries += [pscustomobject]@{
        Index = $index
        Model = $model
        Android = $release
        Characteristics = $characteristics
        IsHardware = [bool]($serial -notmatch '^emulator-')
        IsWatch = [bool]($characteristics -match 'watch')
      }
    }
  }
}

$result = [pscustomobject]@{
  AndroidStudioFound = $toolchain.AndroidStudio.Found
  JavaFound = $toolchain.Java.Found
  JavaMajor = $toolchain.Java.Major
  Jdk17Ready = $toolchain.Jdk17Ready
  AndroidSdkFound = $toolchain.Sdk.Found
  AndroidPlatform36 = $toolchain.Sdk.Platform36
  AndroidBuildTools3600 = $toolchain.Sdk.BuildTools36
  SdkManagerFound = $toolchain.Sdk.SdkManagerFound
  AdbFound = $toolchain.Sdk.AdbFound
  GradleSystemFound = $toolchain.Gradle.Found
  AndroidCompileReady = $toolchain.CompileReady
  DeviceCount = $deviceCount
  HardwareDeviceCount = $hardwareCount
  WearOsDeviceDetected = $wearDetected
  AppleXcodeLocalAvailable = [bool](Get-Command xcodebuild -ErrorAction SilentlyContinue)
  Devices = $deviceSummaries
}

if($Json){
  $result | ConvertTo-Json -Depth 5
  exit 0
}

Write-IberfitAndroidToolchain $toolchain
Write-Host ("ADB_DEVICE_COUNT=" + $deviceCount)
Write-Host ("ADB_HARDWARE_DEVICE_COUNT=" + $hardwareCount)
Write-Host ("WEAR_OS_DEVICE_DETECTED=" + (ConvertTo-IberfitBool $wearDetected))

foreach($device in $deviceSummaries){
  Write-Host ("DEVICE_" + $device.Index + "_MODEL=" + $device.Model)
  Write-Host ("DEVICE_" + $device.Index + "_ANDROID=" + $device.Android)
  Write-Host ("DEVICE_" + $device.Index + "_CHARACTERISTICS=" + $device.Characteristics)
}

$apple = [bool](Get-Command xcodebuild -ErrorAction SilentlyContinue)
Write-Host ("APPLE_XCODE_LOCAL_AVAILABLE=" + (ConvertTo-IberfitBool $apple))
if(-not $apple){
  Write-Host "APPLE_COMPILE_REASON=MACOS_XCODE_REQUIRED"
}

if(-not $toolchain.Jdk17Ready){
  Write-Host "MISSING_ANDROID_REQUIREMENT=JDK_17"
}
if(-not $toolchain.Sdk.Found){
  Write-Host "MISSING_ANDROID_REQUIREMENT=ANDROID_SDK"
}elseif(-not $toolchain.Sdk.Platform36){
  Write-Host "MISSING_ANDROID_REQUIREMENT=PLATFORMS_ANDROID_36"
}
if($toolchain.Sdk.Found -and -not $toolchain.Sdk.BuildTools36){
  Write-Host "MISSING_ANDROID_REQUIREMENT=BUILD_TOOLS_36_0_0"
}
