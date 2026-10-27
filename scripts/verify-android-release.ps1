param([string]$Version = '0.2.0')
$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $workspace
$env:JAVA_HOME = (Get-ChildItem .android-build/jdk -Directory | Select-Object -First 1).FullName
$apkPath = (Resolve-Path "artifacts/Stillwave-$Version.apk").Path
$tools = Join-Path $workspace '.android-build/sdk/build-tools/37.0.0'
$manifestFile = Join-Path $workspace '.build-tmp/release-manifest-check.xml'
& ./.android-build/sdk/cmdline-tools/latest/bin/apkanalyzer.bat manifest print $apkPath > $manifestFile
if ($LASTEXITCODE -ne 0) { throw 'Packaged manifest check failed.' }
[xml]$manifest = Get-Content -LiteralPath $manifestFile -Raw
$namespace = 'http://schemas.android.com/apk/res/android'
$main = $manifest.manifest.application.activity | Where-Object { $_.GetAttribute('name', $namespace) -match '\.MainActivity$' }
$service = $manifest.manifest.application.service | Where-Object { $_.GetAttribute('name', $namespace) -match '\.DvrService$' }
$configuration = Get-Content app.json -Raw | ConvertFrom-Json
$packageName = $manifest.manifest.GetAttribute('package')
$versionName = $manifest.manifest.GetAttribute('versionName', $namespace)
$versionCode = $manifest.manifest.GetAttribute('versionCode', $namespace)
$pip = $main.GetAttribute('supportsPictureInPicture', $namespace) -eq 'true'
$debuggable = $manifest.manifest.application.GetAttribute('debuggable', $namespace) -eq 'true'
$orientationValue = $main.GetAttribute('screenOrientation', $namespace)
# apkanalyzer can decode Android's landscape enum as its integer value (0).
$orientation = if ($orientationValue -in @('landscape', '0', '0x0')) { 'landscape' } else { $orientationValue }
$launchTheme = $main.GetAttribute('theme', $namespace)
$resourceTable = & "$tools/aapt2.exe" dump resources $apkPath
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect compiled splash resources.' }
$resourceText = $resourceTable -join "`n"
$splashStyleId = [regex]::Match($resourceText, 'resource (0x[0-9a-f]+) style/Theme\.App\.SplashScreen\b').Groups[1].Value
if (!$splashStyleId -or ($launchTheme -notmatch 'SplashScreen' -and $launchTheme -ne "@ref/$splashStyleId")) { throw 'The launch activity is missing its branded splash theme.' }
# Release optimization shortens ZIP paths. Resolve the drawable names through
# the resource table rather than expecting their source filenames in the APK.
function Get-PackagedDrawableFiles([string]$name) {
  $pattern = '(?s)drawable/' + [regex]::Escape($name) + '\s+(.*?)(?=\s+resource 0x|\z)'
  $block = [regex]::Match($resourceText, $pattern).Groups[1].Value
  return @([regex]::Matches($block, '\(file\) (\S+) type=PNG') | ForEach-Object { $_.Groups[1].Value })
}
if ($orientation -ne 'landscape') { throw 'The shared Android TV interface must launch in landscape.' }
if ($packageName -ne 'com.stillwave.player' -or $versionName -ne $Version -or [int]$versionCode -ne $configuration.expo.android.versionCode -or !$pip -or $debuggable) { throw 'Unexpected APK version/capabilities.' }
if (!$service -or $service.GetAttribute('exported', $namespace) -ne 'false' -or $service.GetAttribute('foregroundServiceType', $namespace) -notin @('dataSync', '0x1')) { throw 'DVR service missing or misconfigured.' }
$permissions = @($manifest.manifest.'uses-permission' | ForEach-Object { $_.GetAttribute('name', $namespace) })
foreach ($permission in @('FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_DATA_SYNC', 'WAKE_LOCK', 'POST_NOTIFICATIONS')) {
  if ("android.permission.$permission" -notin $permissions) { throw "Missing permission: $permission" }
}
$signature = & "$tools/apksigner.bat" verify --verbose --print-certs $apkPath
if ($LASTEXITCODE -ne 0) { throw 'Signature verification failed.' }
$certificate = [regex]::Match(($signature -join "`n"), 'certificate SHA-256 digest: ([a-f0-9]+)').Groups[1].Value
if ($certificate -ne '0ba646c4573a26633392f443c9891b371891fb655a863fedfcdefb59fe732060') { throw 'Original signing identity changed.' }
& "$tools/zipalign.exe" -c -P 16 4 $apkPath
if ($LASTEXITCODE -ne 0) { throw 'APK alignment failed.' }
$archive = [System.IO.Compression.ZipFile]::OpenRead($apkPath)
try {
  $bundle = $archive.GetEntry('assets/index.android.bundle')
  $bundleBytes = $bundle.Length
  $stream = $bundle.Open()
  try { $bundleHash = [Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData($stream)).ToLowerInvariant() } finally { $stream.Dispose() }
  $abis = @($archive.Entries | Where-Object { $_.FullName -match '^lib/[^/]+/.+\.so$' } | ForEach-Object { $_.FullName.Split('/')[1] } | Sort-Object -Unique)
  $splashAssets = @(Get-PackagedDrawableFiles 'splashscreen_logo')
  $brandAssets = @(Get-PackagedDrawableFiles 'assets_branding_stillwavemarkv2')
  if (!$splashAssets.Count -or !$brandAssets.Count) { throw 'The native splash or approved version-2 logo asset is missing.' }
  foreach ($asset in @($splashAssets) + @($brandAssets)) {
    if (!$archive.GetEntry($asset)) { throw "Packaged splash image missing: $asset" }
  }
  if (@($archive.Entries | Where-Object { $_.FullName -match '(?i)credentials\.json|\.keystore$|android-signing' }).Count) { throw 'Signing files were packaged.' }
} finally { $archive.Dispose() }
if ($bundleBytes -lt 1000000 -or 'armeabi-v7a' -notin $abis -or 'arm64-v8a' -notin $abis) { throw 'Missing standalone bundle/ARM binaries.' }
$builtBundleHash = (Get-FileHash android/app/build/generated/assets/react/release/index.android.bundle -Algorithm SHA256).Hash.ToLowerInvariant()
if ($builtBundleHash -ne $bundleHash) { throw 'Packaged JavaScript differs from the verified build output.' }
$report = [ordered]@{
  package = $packageName; versionName = $versionName; versionCode = [int]$versionCode
  minSdk = $manifest.manifest.'uses-sdk'.GetAttribute('minSdkVersion', $namespace)
  debuggable = $debuggable; mainActivitySupportsPip = $pip; dvrServicePrivate = $true; dvrServiceType = 'dataSync'
  mainActivityOrientation = $orientation
  mainActivityLaunchTheme = $launchTheme; nativeSplashStyleId = $splashStyleId; nativeSplashAssets = $splashAssets; approvedBrandAssets = $brandAssets
  embeddedBundleBytes = $bundleBytes; embeddedBundleSha256 = $bundleHash; packagedBundleMatchesBuild = $true; nativeAbis = $abis
  signingCertificateMatchesOriginalKey = $true; signingCertificateSha256 = $certificate
  signatureAndAlignmentVerified = $true; containsSigningFiles = $false
  apkBytes = (Get-Item $apkPath).Length; apkSha256 = (Get-FileHash $apkPath -Algorithm SHA256).Hash.ToLowerInvariant()
}
$report | ConvertTo-Json | Set-Content "artifacts/release-v$($Version.Replace('.',''))-check.json"
$report | ConvertTo-Json
