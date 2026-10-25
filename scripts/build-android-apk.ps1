param([string]$Architectures = 'armeabi-v7a,arm64-v8a')

$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $workspace
$toolsRoot = Join-Path $workspace '.android-build'
$jdk = Get-ChildItem -LiteralPath (Join-Path $toolsRoot 'jdk') -Directory -ErrorAction SilentlyContinue | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'bin\java.exe') } | Select-Object -First 1
if (-not $jdk) { throw 'Run scripts/setup-android-tools.ps1 -Component Jdk first.' }
$sdkRoot = Join-Path $toolsRoot 'sdk'
$buildTools = Join-Path $sdkRoot 'build-tools\37.0.0'
if (-not (Test-Path -LiteralPath (Join-Path $buildTools 'apksigner.bat'))) { throw 'Install the Android SDK packages documented in README.md first.' }

$env:JAVA_HOME = $jdk.FullName
$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot
$env:GRADLE_USER_HOME = Join-Path $toolsRoot 'gradle'
$env:EXPO_NO_TELEMETRY = '1'
$env:EXPO_OFFLINE = '1'
$env:NODE_ENV = 'production'
$temporary = Join-Path $workspace '.build-tmp'
New-Item -ItemType Directory -Path $temporary -Force | Out-Null
$env:TEMP = $temporary
$env:TMP = $temporary
$env:TMPDIR = $temporary
$env:PATH = (Join-Path $jdk.FullName 'bin') + [System.IO.Path]::PathSeparator + $env:PATH

if (-not (Test-Path -LiteralPath 'android\gradlew.bat')) {
    & node node_modules/expo/bin/cli prebuild --platform android --no-install
    if ($LASTEXITCODE -ne 0) { throw 'Android project generation failed.' }
}
$sdkProperty = $sdkRoot.Replace('\', '/')
[System.IO.File]::WriteAllText((Join-Path $workspace 'android\local.properties'), "sdk.dir=$sdkProperty`n")

Write-Output 'Building the standalone release APK with its JavaScript and assets embedded.'
$gradleArguments = @(
    '--project-dir', 'android', ':app:assembleRelease', '--console=plain', '--no-daemon', '--max-workers=3',
    "-PreactNativeArchitectures=$Architectures", '-Pandroid.cmakeVersion=3.31.6',
    '-Dorg.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m'
)
& '.\android\gradlew.bat' @gradleArguments
if ($LASTEXITCODE -ne 0) { throw 'The native Android release build failed.' }

$version = (Get-Content -LiteralPath 'app.json' -Raw | ConvertFrom-Json).expo.version
$artifactDirectory = Join-Path $workspace 'artifacts'
New-Item -ItemType Directory -Path $artifactDirectory -Force | Out-Null
$apk = Join-Path $artifactDirectory "Stillwave-$version.apk"
$unsignedInput = Join-Path $workspace 'android\app\build\outputs\apk\release\app-release.apk'
if (-not (Test-Path -LiteralPath $unsignedInput)) { throw 'Gradle did not produce the expected release APK.' }

# Preserve the personal signing key across builds so later APKs can update the
# installed app. Neither the private key nor its password is stored in Git.
$signingDirectory = Join-Path $workspace 'private\android-signing'
New-Item -ItemType Directory -Path $signingDirectory -Force | Out-Null
$credentialsFile = Join-Path $signingDirectory 'credentials.json'
$keystore = Join-Path $signingDirectory 'stillwave-release.keystore'
if (-not (Test-Path -LiteralPath $credentialsFile)) {
    if (Test-Path -LiteralPath $keystore) { throw 'The signing key exists but its credentials file is missing. Restore it instead of replacing the signing identity.' }
    $random = [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
    $credentials = @{ alias = 'stillwave'; password = [Convert]::ToHexString($random) }
    [System.IO.File]::WriteAllText($credentialsFile, ($credentials | ConvertTo-Json))
}
$credentials = Get-Content -LiteralPath $credentialsFile -Raw | ConvertFrom-Json
$env:STILLWAVE_SIGNING_PASSWORD = $credentials.password
try {
    if (-not (Test-Path -LiteralPath $keystore)) {
        & (Join-Path $jdk.FullName 'bin\keytool.exe') -genkeypair -keystore $keystore -storetype PKCS12 -storepass:env STILLWAVE_SIGNING_PASSWORD -keypass:env STILLWAVE_SIGNING_PASSWORD -alias $credentials.alias -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=Stillwave Personal Build' -noprompt
        if ($LASTEXITCODE -ne 0) { throw 'Could not generate the local app signing key.' }
    }
    & (Join-Path $buildTools 'apksigner.bat') sign --ks $keystore --ks-key-alias $credentials.alias --ks-pass env:STILLWAVE_SIGNING_PASSWORD --key-pass env:STILLWAVE_SIGNING_PASSWORD --v4-signing-enabled false --out $apk $unsignedInput
    if ($LASTEXITCODE -ne 0) { throw 'APK signing failed.' }
} finally { Remove-Item Env:STILLWAVE_SIGNING_PASSWORD -ErrorAction SilentlyContinue }

& (Join-Path $buildTools 'apksigner.bat') verify --verbose --print-certs $apk
if ($LASTEXITCODE -ne 0) { throw 'The APK signature did not verify.' }
& (Join-Path $buildTools 'zipalign.exe') -c -P 16 4 $apk
if ($LASTEXITCODE -ne 0) { throw 'The APK alignment check failed.' }

$archive = [System.IO.Compression.ZipFile]::OpenRead($apk)
try {
    if (-not $archive.GetEntry('assets/index.android.bundle')) { throw 'The APK is missing its embedded JavaScript bundle and would not be standalone.' }
} finally { $archive.Dispose() }

$hash = (Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash.ToLowerInvariant()
[System.IO.File]::WriteAllText("$apk.sha256", "$hash  $([System.IO.Path]::GetFileName($apk))`n")
Write-Output ('Standalone APK: ' + $apk)
Write-Output ('Size: ' + [Math]::Round((Get-Item -LiteralPath $apk).Length / 1MB, 1) + ' MiB')
Write-Output ('SHA-256: ' + $hash)
