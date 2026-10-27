param([string]$Serial = 'emulator-5580')
$ErrorActionPreference = 'Stop'
if ($Serial -notmatch '^emulator-\d+$') { throw 'This test installs a test APK. Use an isolated emulator, never a personal device.' }
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$env:JAVA_HOME = (Get-ChildItem .android-build/jdk -Directory | Select-Object -First 1).FullName
$env:ANDROID_HOME = (Resolve-Path .android-build/sdk).Path
$env:GRADLE_USER_HOME = (Resolve-Path .android-build/gradle).Path
$env:TEMP = (Resolve-Path .build-tmp).Path
$env:TMP = $env:TEMP
$env:EXPO_OFFLINE = '1'
$taskAdb = Join-Path $env:ANDROID_HOME 'platform-tools/adb.exe'
$taskTools = Join-Path $env:ANDROID_HOME 'build-tools/37.0.0'
$taskPlatform = Join-Path $env:ANDROID_HOME 'platforms/android-37.0/android.jar'
$taskRoot = Join-Path (Get-Location) '.build-tmp/planner-driver'
# Start the generated, local-only HLS fixture separately: node tests/dvr-fixture-server.mjs.
try { $null = Invoke-WebRequest 'http://127.0.0.1:8096/stats' -TimeoutSec 3 } catch { throw 'Start node tests/dvr-fixture-server.mjs before running this test.' }
& ./android/gradlew.bat --project-dir android :app:assembleRelease --console=plain --no-daemon --max-workers=2 '-PreactNativeArchitectures=x86_64' '-Pandroid.enableMinifyInReleaseBuilds=false' '-Pandroid.enableShrinkResourcesInReleaseBuilds=false' '-Pandroid.cmakeVersion=3.31.6' '-Dorg.gradle.jvmargs=-Xmx3072m -XX:MaxMetaspaceSize=768m'
if ($LASTEXITCODE -ne 0) { throw 'Unminified instrumentation build failed.' }
New-Item -ItemType Directory -Force -Path "$taskRoot/classes","$taskRoot/dex" | Out-Null
& "$env:JAVA_HOME/bin/javac.exe" -source 8 -target 8 -cp $taskPlatform -d "$taskRoot/classes" tests/android-planner/Driver.java
if ($LASTEXITCODE -ne 0) { throw 'Planner test Java compilation failed.' }
& "$taskTools/d8.bat" --lib $taskPlatform --output "$taskRoot/dex" "$taskRoot/classes/com/stillwave/plannerdriver/Driver.class"
if ($LASTEXITCODE -ne 0) { throw 'Planner test dex failed.' }
& "$taskTools/aapt2.exe" link --manifest tests/android-planner/AndroidManifest.xml -I $taskPlatform -o "$taskRoot/driver-unsigned.apk"
if ($LASTEXITCODE -ne 0) { throw 'Planner test manifest failed.' }
$taskZip = [System.IO.Compression.ZipFile]::Open("$taskRoot/driver-unsigned.apk",'Update')
try { [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($taskZip,"$taskRoot/dex/classes.dex",'classes.dex') | Out-Null } finally { $taskZip.Dispose() }
$taskSigning = Get-Content private/android-signing/credentials.json -Raw | ConvertFrom-Json
$env:STILLWAVE_SIGNING_PASSWORD = $taskSigning.password
try {
  foreach ($taskApk in @(@('android/app/build/outputs/apk/release/app-release.apk', '.build-tmp/planner-test.apk'), @("$taskRoot/driver-unsigned.apk", "$taskRoot/driver.apk"))) {
    & "$taskTools/apksigner.bat" sign --ks private/android-signing/stillwave-release.keystore --ks-key-alias $taskSigning.alias --ks-pass env:STILLWAVE_SIGNING_PASSWORD --key-pass env:STILLWAVE_SIGNING_PASSWORD --out $taskApk[1] $taskApk[0]
    if ($LASTEXITCODE -ne 0) { throw 'Test APK signing failed.' }
  }
} finally { Remove-Item Env:STILLWAVE_SIGNING_PASSWORD -ErrorAction SilentlyContinue }
& $taskAdb -s $Serial install -r .build-tmp/planner-test.apk
if ($LASTEXITCODE -ne 0) { throw 'Test app installation failed.' }
& $taskAdb -s $Serial install -r "$taskRoot/driver.apk"
if ($LASTEXITCODE -ne 0) { throw 'Test driver installation failed.' }
& $taskAdb -s $Serial reverse tcp:8096 tcp:8096
& $taskAdb -s $Serial shell appops set com.stillwave.player SCHEDULE_EXACT_ALARM allow
& $taskAdb -s $Serial shell am start -n com.stillwave.player/.MainActivity
$taskOutput = & $taskAdb -s $Serial shell am instrument -w com.stillwave.plannerdriver/com.stillwave.plannerdriver.Driver
$taskOutput | Set-Content .build-tmp/planner-integration.log
$taskMatch = [regex]::Match(($taskOutput -join "`n"),'evidence=(\{[^\r\n]+\})')
if (!$taskMatch.Success -or !(($taskMatch.Groups[1].Value | ConvertFrom-Json).passed)) { throw ($taskOutput -join "`n") }
$taskMatch.Groups[1].Value | Set-Content artifacts/planner-integration-check.json
Write-Output 'Background recording, conflict, cancellation, finalization, resume and series persistence passed.'
