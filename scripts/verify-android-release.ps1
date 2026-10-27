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
  if (@($archive.Entries | Where-Object { $_.FullName -match '(?i)credentials\.json|\.keystore$|android-signing' }).Count) { throw 'Signing files were packaged.' }
} finally { $archive.Dispose() }
if ($bundleBytes -lt 1000000 -or 'armeabi-v7a' -notin $abis -or 'arm64-v8a' -notin $abis) { throw 'Missing standalone bundle/ARM binaries.' }
$builtBundleHash = (Get-FileHash android/app/build/generated/assets/react/release/index.android.bundle -Algorithm SHA256).Hash.ToLowerInvariant()
if ($builtBundleHash -ne $bundleHash) { throw 'Packaged JavaScript differs from the verified build output.' }
$report = [ordered]@{
  package = $packageName; versionName = $versionName; versionCode = [int]$versionCode
  minSdk = $manifest.manifest.'uses-sdk'.GetAttribute('minSdkVersion', $namespace)
  debuggable = $debuggable; mainActivitySupportsPip = $pip; dvrServicePrivate = $true; dvrServiceType = 'dataSync'
  embeddedBundleBytes = $bundleBytes; embeddedBundleSha256 = $bundleHash; packagedBundleMatchesBuild = $true; nativeAbis = $abis
  signingCertificateMatchesOriginalKey = $true; signingCertificateSha256 = $certificate
  signatureAndAlignmentVerified = $true; containsSigningFiles = $false
  apkBytes = (Get-Item $apkPath).Length; apkSha256 = (Get-FileHash $apkPath -Algorithm SHA256).Hash.ToLowerInvariant()
}
$report | ConvertTo-Json | Set-Content "artifacts/release-v$($Version.Replace('.',''))-check.json"
$report | ConvertTo-Json
