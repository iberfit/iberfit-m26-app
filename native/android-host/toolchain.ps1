$ErrorActionPreference = "Stop"

function ConvertTo-IberfitBool([bool]$Value) {
  if($Value){ return "TRUE" }
  return "FALSE"
}

function ConvertTo-IberfitCmdArg([string]$Value) {
  if($null -eq $Value){ return '""' }
  if($Value -notmatch '[\s"&|<>^]'){ return $Value }
  return '"' + $Value.Replace('"','""') + '"'
}

function Invoke-IberfitNativeCapture {
  param(
    [Parameter(Mandatory=$true)][string]$FilePath,
    [string[]]$ArgumentList = @()
  )

  $id = [guid]::NewGuid().ToString("N")
  $cmdFile = Join-Path $env:TEMP ("iberfit-native-" + $id + ".cmd")

  try {
    $argsText = (($ArgumentList | ForEach-Object { ConvertTo-IberfitCmdArg ([string]$_) }) -join " ")
    $extension = [IO.Path]::GetExtension($FilePath).ToLowerInvariant()

    if($extension -eq ".bat" -or $extension -eq ".cmd"){
      $invoke = 'call "' + $FilePath + '"'
    } else {
      $invoke = '"' + $FilePath + '"'
    }
    if($argsText){ $invoke += " " + $argsText }

    $cmdLines = New-Object System.Collections.Generic.List[string]
    $cmdLines.Add("@echo off")
    $cmdLines.Add($invoke)
    $cmdLines.Add("exit /b %errorlevel%")
    [IO.File]::WriteAllLines($cmdFile, $cmdLines.ToArray(), [Text.Encoding]::Default)

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $env:ComSpec
    $psi.Arguments = ('/d /c ""' + $cmdFile + '""')
    $psi.WorkingDirectory = (Get-Location).Path
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $psi

    try {
      if(-not $process.Start()){
        throw "NATIVE_PROCESS_START_FAILED"
      }

      $stdoutTask = $process.StandardOutput.ReadToEndAsync()
      $stderrTask = $process.StandardError.ReadToEndAsync()
      $process.WaitForExit()

      $stdout = $stdoutTask.Result
      $stderr = $stderrTask.Result

      return [pscustomobject]@{
        ExitCode = [int]$process.ExitCode
        StdOut = $stdout
        StdErr = $stderr
        Combined = (($stdout + "`n" + $stderr).Trim())
      }
    } finally {
      $process.Dispose()
    }
  } finally {
    Remove-Item $cmdFile -Force -ErrorAction SilentlyContinue
  }
}

function Get-IberfitJavaInfo {
  $candidates = New-Object System.Collections.Generic.List[string]

  if($env:JAVA_HOME){
    $candidates.Add((Join-Path $env:JAVA_HOME "bin\java.exe"))
  }

  $cmd = Get-Command java.exe -ErrorAction SilentlyContinue
  if(-not $cmd){ $cmd = Get-Command java -ErrorAction SilentlyContinue }
  if($cmd -and $cmd.Source){ $candidates.Add($cmd.Source) }

  if($env:ProgramFiles){
    $candidates.Add((Join-Path $env:ProgramFiles "Android\Android Studio\jbr\bin\java.exe"))
    $candidates.Add((Join-Path $env:ProgramFiles "Android\Android Studio\jre\bin\java.exe"))
  }
  if($env:LOCALAPPDATA){
    $candidates.Add((Join-Path $env:LOCALAPPDATA "Programs\Android Studio\jbr\bin\java.exe"))
  }

  foreach($candidate in ($candidates | Select-Object -Unique)){
    if(-not $candidate -or -not (Test-Path $candidate)){ continue }
    $javaResult = Invoke-IberfitNativeCapture -FilePath $candidate -ArgumentList @("-version")
    if($javaResult.ExitCode -ne 0){ continue }
    $text = $javaResult.Combined
    $match = [regex]::Match($text, 'version\s+"(?<major>\d+)(?:\.(?<minor>\d+))?')
    $major = 0
    if($match.Success){
      $major = [int]$match.Groups["major"].Value
      if($major -eq 1 -and $match.Groups["minor"].Success){
        $major = [int]$match.Groups["minor"].Value
      }
    }
    return [pscustomobject]@{
      Found = $true
      Path = (Resolve-Path $candidate).Path
      Home = (Split-Path -Parent (Split-Path -Parent (Resolve-Path $candidate).Path))
      Major = $major
      VersionText = ($text.Trim() -replace "`r?`n"," | ")
    }
  }

  return [pscustomobject]@{
    Found = $false
    Path = $null
    Home = $null
    Major = 0
    VersionText = ""
  }
}

function Get-IberfitAndroidSdkInfo {
  $candidates = New-Object System.Collections.Generic.List[string]
  if($env:ANDROID_SDK_ROOT){ $candidates.Add($env:ANDROID_SDK_ROOT) }
  if($env:ANDROID_HOME){ $candidates.Add($env:ANDROID_HOME) }
  if($env:LOCALAPPDATA){ $candidates.Add((Join-Path $env:LOCALAPPDATA "Android\Sdk")) }

  $root = $null
  foreach($candidate in ($candidates | Select-Object -Unique)){
    if($candidate -and (Test-Path $candidate)){
      $root = (Resolve-Path $candidate).Path
      break
    }
  }

  if(-not $root){
    return [pscustomobject]@{
      Found = $false
      Root = $null
      Platform36 = $false
      BuildTools36 = $false
      AdbFound = $false
      AdbPath = $null
      SdkManagerFound = $false
      SdkManagerPath = $null
    }
  }

  $platform36 = Test-Path (Join-Path $root "platforms\android-36\android.jar")
  $buildTools36 = Test-Path (Join-Path $root "build-tools\36.0.0\aapt2.exe")
  $adb = Join-Path $root "platform-tools\adb.exe"
  $adbFound = Test-Path $adb

  $sdkManagerCandidates = New-Object System.Collections.Generic.List[string]
  $sdkManagerCandidates.Add((Join-Path $root "cmdline-tools\latest\bin\sdkmanager.bat"))
  $cmdlineRoot = Join-Path $root "cmdline-tools"
  if(Test-Path $cmdlineRoot){
    Get-ChildItem $cmdlineRoot -Directory -ErrorAction SilentlyContinue |
      Sort-Object Name -Descending |
      ForEach-Object {
        $sdkManagerCandidates.Add((Join-Path $_.FullName "bin\sdkmanager.bat"))
      }
  }

  $sdkManager = $null
  foreach($candidate in ($sdkManagerCandidates | Select-Object -Unique)){
    if(Test-Path $candidate){
      $sdkManager = (Resolve-Path $candidate).Path
      break
    }
  }

  return [pscustomobject]@{
    Found = $true
    Root = $root
    Platform36 = $platform36
    BuildTools36 = $buildTools36
    AdbFound = $adbFound
    AdbPath = $(if($adbFound){ (Resolve-Path $adb).Path }else{ $null })
    SdkManagerFound = [bool]$sdkManager
    SdkManagerPath = $sdkManager
  }
}

function Get-IberfitAndroidStudioInfo {
  $candidates = New-Object System.Collections.Generic.List[string]
  if($env:ProgramFiles){ $candidates.Add((Join-Path $env:ProgramFiles "Android\Android Studio")) }
  if($env:LOCALAPPDATA){ $candidates.Add((Join-Path $env:LOCALAPPDATA "Programs\Android Studio")) }

  foreach($candidate in ($candidates | Select-Object -Unique)){
    if($candidate -and (Test-Path $candidate)){
      return [pscustomobject]@{ Found=$true; Path=(Resolve-Path $candidate).Path }
    }
  }
  return [pscustomobject]@{ Found=$false; Path=$null }
}

function Get-IberfitGradleInfo {
  $cmd = Get-Command gradle.bat -ErrorAction SilentlyContinue
  if(-not $cmd){ $cmd = Get-Command gradle -ErrorAction SilentlyContinue }
  if(-not $cmd -and $env:GRADLE_HOME){
    $candidate = Join-Path $env:GRADLE_HOME "bin\gradle.bat"
    if(Test-Path $candidate){
      return [pscustomobject]@{ Found=$true; Path=(Resolve-Path $candidate).Path }
    }
  }
  if($cmd -and $cmd.Source){
    return [pscustomobject]@{ Found=$true; Path=$cmd.Source }
  }
  return [pscustomobject]@{ Found=$false; Path=$null }
}

function Get-IberfitAndroidToolchain {
  $java = Get-IberfitJavaInfo
  $sdk = Get-IberfitAndroidSdkInfo
  $studio = Get-IberfitAndroidStudioInfo
  $gradle = Get-IberfitGradleInfo

  return [pscustomobject]@{
    Java = $java
    Sdk = $sdk
    AndroidStudio = $studio
    Gradle = $gradle
    Jdk17Ready = [bool]($java.Found -and $java.Major -ge 17)
    CompileReady = [bool](
      $java.Found -and $java.Major -ge 17 -and
      $sdk.Found -and $sdk.Platform36 -and $sdk.BuildTools36
    )
  }
}

function Write-IberfitAndroidToolchain($Toolchain) {
  Write-Host ("ANDROID_STUDIO_FOUND=" + (ConvertTo-IberfitBool $Toolchain.AndroidStudio.Found))
  Write-Host ("JAVA_FOUND=" + (ConvertTo-IberfitBool $Toolchain.Java.Found))
  Write-Host ("JAVA_MAJOR=" + $Toolchain.Java.Major)
  Write-Host ("JDK17_READY=" + (ConvertTo-IberfitBool $Toolchain.Jdk17Ready))
  Write-Host ("ANDROID_SDK_FOUND=" + (ConvertTo-IberfitBool $Toolchain.Sdk.Found))
  Write-Host ("ANDROID_PLATFORM_36=" + (ConvertTo-IberfitBool $Toolchain.Sdk.Platform36))
  Write-Host ("ANDROID_BUILD_TOOLS_36_0_0=" + (ConvertTo-IberfitBool $Toolchain.Sdk.BuildTools36))
  Write-Host ("SDKMANAGER_FOUND=" + (ConvertTo-IberfitBool $Toolchain.Sdk.SdkManagerFound))
  Write-Host ("ADB_FOUND=" + (ConvertTo-IberfitBool $Toolchain.Sdk.AdbFound))
  Write-Host ("GRADLE_SYSTEM_FOUND=" + (ConvertTo-IberfitBool $Toolchain.Gradle.Found))
  Write-Host ("ANDROID_COMPILE_READY=" + (ConvertTo-IberfitBool $Toolchain.CompileReady))
}
