param(
    [ValidateSet('Jdk', 'Sdk')]
    [Parameter(Mandatory = $true)]
    [string]$Component
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$workspace = Split-Path -Parent $PSScriptRoot
$toolsRoot = Join-Path $workspace '.android-build'
$downloads = Join-Path $toolsRoot 'downloads'
New-Item -ItemType Directory -Path $downloads -Force | Out-Null

function Get-VerifiedArchive([string]$Url, [string]$Destination, [string]$Checksum) {
    if (Test-Path -LiteralPath $Destination) {
        if ((Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash -eq $Checksum) { return }
        Remove-Item -LiteralPath $Destination
    }
    Write-Output ('Downloading ' + [System.IO.Path]::GetFileName($Destination))
    Invoke-WebRequest -Uri $Url -OutFile $Destination -TimeoutSec 900
    if ((Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash -ne $Checksum) {
        throw 'The downloaded tool archive did not match the vendor SHA-256 checksum.'
    }
}

if ($Component -eq 'Jdk') {
    $jdkRoot = Join-Path $toolsRoot 'jdk'
    $existing = Get-ChildItem -LiteralPath $jdkRoot -Directory -ErrorAction SilentlyContinue | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'bin\java.exe') } | Select-Object -First 1
    if ($existing) { Write-Output ('JDK ready: ' + $existing.FullName); exit 0 }
    $metadataUrl = 'https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse'
    $metadata = @(Invoke-RestMethod -Uri $metadataUrl -TimeoutSec 60)[0]
    $package = $metadata.binary.package
    if (-not $package.link -or -not $package.checksum) { throw 'The official JDK metadata did not contain a download and checksum.' }
    $archive = Join-Path $downloads 'temurin-21-windows-x64.zip'
    Get-VerifiedArchive $package.link $archive $package.checksum
    New-Item -ItemType Directory -Path $jdkRoot -Force | Out-Null
    Expand-Archive -LiteralPath $archive -DestinationPath $jdkRoot -Force
    $jdk = Get-ChildItem -LiteralPath $jdkRoot -Directory | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'bin\java.exe') } | Select-Object -First 1
    if (-not $jdk) { throw 'The downloaded JDK did not contain java.exe.' }
    & (Join-Path $jdk.FullName 'bin\java.exe') -version
    if ($LASTEXITCODE -ne 0) { throw 'Java verification failed.' }
    Write-Output ('JDK ready: ' + $jdk.FullName)
}

if ($Component -eq 'Sdk') {
    $sdkRoot = Join-Path $toolsRoot 'sdk'
    $latest = Join-Path $sdkRoot 'cmdline-tools\latest'
    if (Test-Path -LiteralPath (Join-Path $latest 'bin\sdkmanager.bat')) { Write-Output ('SDK tools ready: ' + $latest); exit 0 }
    $archive = Join-Path $downloads 'android-command-line-tools.zip'
    Get-VerifiedArchive 'https://dl.google.com/android/repository/commandlinetools-win-15859902_latest.zip' $archive '90ae805d20434428bffcb699c290860f19bb5f66a67e6b330067e3de801fb04a'
    $unpacked = Join-Path $toolsRoot 'sdk-unpacked'
    New-Item -ItemType Directory -Path $unpacked -Force | Out-Null
    Expand-Archive -LiteralPath $archive -DestinationPath $unpacked -Force
    New-Item -ItemType Directory -Path (Split-Path -Parent $latest) -Force | Out-Null
    $source = [System.IO.Path]::GetFullPath((Join-Path $unpacked 'cmdline-tools'))
    $destination = [System.IO.Path]::GetFullPath($latest)
    $allowedRoot = [System.IO.Path]::GetFullPath($toolsRoot) + [System.IO.Path]::DirectorySeparatorChar
    if (-not $source.StartsWith($allowedRoot, [StringComparison]::OrdinalIgnoreCase) -or -not $destination.StartsWith($allowedRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'SDK extraction paths must stay inside this project tool directory.'
    }
    Move-Item -LiteralPath $source -Destination $destination
    Write-Output ('SDK tools ready: ' + $latest)
}
