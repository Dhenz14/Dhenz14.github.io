<#
.SYNOPSIS
Verifies, installs, launches, closes, and uninstalls the exact public Hive IDE
tester release on a fresh GitHub-hosted Windows runner.

.DESCRIPTION
This script is intentionally public-channel-only. It refuses non-hosted
machines, pre-existing Hive IDE installs, non-canonical release URLs, hash or
size drift, and installed executable drift. Cleanup is limited to the exact
process, uninstall entry, and runner-temp directory created by this run.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$LatestUrl,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-fA-F0-9]{40}$')]
    [string]$ExpectedSourceCommit,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$OutPath,

    [ValidateRange(10, 180)]
    [int]$WindowTimeoutSeconds = 90,

    [ValidateRange(15, 120)]
    [int]$CloseTimeoutSeconds = 60
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$ProgressPreference = 'SilentlyContinue'

$ExpectedLatestUrl = 'https://dhenz14.github.io/downloads/hive-ide/latest.json'
$ExpectedProductName = 'Hive IDE'
$ExpectedInstallerName = 'Hive-IDE-OneClick-Windows-x64.exe'
$ExpectedReleaseRepository = 'Dhenz14/Dhenz14.github.io'
$RunId = [Guid]::NewGuid().ToString('n')
$RepoRoot = Split-Path -Parent $PSScriptRoot
$RunnerTempInput = [string]$env:RUNNER_TEMP
$RunnerTemp = if ($RunnerTempInput) {
    [IO.Path]::GetFullPath($RunnerTempInput)
} else {
    [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
}
$WorkRoot = Join-Path $RunnerTemp "hive-ide-public-smoke-$RunId"
$LatestPath = Join-Path $WorkRoot 'latest.json'
$ManifestPath = Join-Path $WorkRoot 'hive-ide-release-manifest.json'
$ProvenancePath = Join-Path $WorkRoot 'windows-installer-provenance.json'
$InstallerPath = Join-Path $WorkRoot $ExpectedInstallerName
$CheckedLatestPath = Join-Path $RepoRoot 'downloads\hive-ide\latest.json'
$CheckedManifestPath = Join-Path $RepoRoot 'downloads\hive-ide\hive-ide-release-manifest.json'
$startedProcess = $null
$uninstallEntry = $null
$installAttemptOwned = $false
$failure = $null
$receipt = [ordered]@{
    schema = 'hive.ide.public_windows_smoke_receipt.v1'
    ok = $false
    runId = $RunId
    startedAtUtc = [DateTime]::UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'")
    finishedAtUtc = $null
    host = [ordered]@{
        githubActions = $env:GITHUB_ACTIONS -eq 'true'
        runnerEnvironment = [string]$env:RUNNER_ENVIRONMENT
        runnerImage = [string]$env:ImageOS
        freshHostedRunner = $false
    }
    channel = $null
    install = $null
    launch = $null
    uninstall = $null
    errors = @()
    claimBoundary = 'FRESH_GITHUB_HOSTED_WINDOWS_INSTALL_LAUNCH_UNINSTALL_OF_EXACT_PUBLIC_BYTES'
}

function Get-Sha256 {
    param([Parameter(Mandatory = $true)][string]$Path)
    return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
}

function Get-HiveUninstallEntries {
    $roots = @(
        'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKCU:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
    )
    return @($roots | ForEach-Object {
        Get-ItemProperty -Path $_ -ErrorAction SilentlyContinue |
            Where-Object { $_.DisplayName -eq $ExpectedProductName }
    })
}

function Get-SafeLocalAppDataCommand {
    param(
        [Parameter(Mandatory = $true)][string]$Command,
        [Parameter(Mandatory = $true)][string]$Label
    )
    $trimmed = $Command.Trim()
    if ($trimmed -match '^"([^"]+)"') { $candidate = $Matches[1] }
    elseif ($trimmed -match '^([^\s]+)') { $candidate = $Matches[1] }
    else { throw "$Label command is malformed" }
    $resolved = (Resolve-Path -LiteralPath $candidate).Path
    $localRoot = [IO.Path]::GetFullPath([Environment]::GetFolderPath('LocalApplicationData')).TrimEnd('\') + '\'
    if (-not $resolved.StartsWith($localRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw "$Label executable escaped LocalAppData: $resolved"
    }
    return $resolved
}

function Assert-CanonicalReleaseAsset {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [Parameter(Mandatory = $true)][string]$FileName,
        [Parameter(Mandatory = $true)][string]$Tag
    )
    $uri = [Uri]$Url
    $escapedTag = [Regex]::Escape($Tag)
    $escapedFile = [Regex]::Escape($FileName)
    $expectedPath = "^/Dhenz14/Dhenz14\.github\.io/releases/download/$escapedTag/$escapedFile$"
    if ($uri.Scheme -ne 'https' -or $uri.Host -ne 'github.com' -or $uri.UserInfo -or
        $uri.Port -ne 443 -or $uri.Query -or $uri.Fragment -or $uri.AbsolutePath -notmatch $expectedPath) {
        throw "$FileName URL escaped the canonical central release tag"
    }
}

function Download-Bounded {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [Parameter(Mandatory = $true)][string]$OutFile,
        [Parameter(Mandatory = $true)][long]$MaximumBytes,
        [Parameter(Mandatory = $true)][string]$Label
    )
    Invoke-WebRequest -Uri $Url -OutFile $OutFile -MaximumRedirection 6
    $item = Get-Item -LiteralPath $OutFile
    if (-not $item.Exists -or $item.Length -lt 1 -or $item.Length -gt $MaximumBytes) {
        throw "$Label size is outside its bounded range: $($item.Length)"
    }
    return $item
}

function Wait-ResponsiveMainWindow {
    param([Parameter(Mandatory = $true)][Diagnostics.Process]$Process)
    $timer = [Diagnostics.Stopwatch]::StartNew()
    while ($timer.Elapsed.TotalSeconds -lt $WindowTimeoutSeconds) {
        if ($Process.HasExited) { return $null }
        $Process.Refresh()
        if ($Process.MainWindowHandle -ne 0 -and $Process.Responding) {
            return [ordered]@{
                responsive = $true
                mainWindowHandleObserved = $true
                readyMs = [math]::Round($timer.Elapsed.TotalMilliseconds, 3)
                pid = $Process.Id
            }
        }
        Start-Sleep -Milliseconds 125
    }
    return $null
}

function Write-SmokeReceipt {
    $absolute = [IO.Path]::GetFullPath($OutPath)
    $parent = Split-Path -Parent $absolute
    [IO.Directory]::CreateDirectory($parent) | Out-Null
    if ([IO.File]::Exists($absolute)) { throw "Refusing to replace smoke receipt: $absolute" }
    $temporary = "$absolute.tmp-$PID-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
    $bytes = [Text.UTF8Encoding]::new($false).GetBytes(($receipt | ConvertTo-Json -Depth 14) + "`n")
    $stream = [IO.File]::Open($temporary, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try {
        $stream.Write($bytes, 0, $bytes.Length)
        $stream.Flush($true)
    }
    finally { $stream.Dispose() }
    [IO.File]::Move($temporary, $absolute)
}

try {
    $freshHostedRunner = (
        $env:GITHUB_ACTIONS -eq 'true' -and
        [string]$env:GITHUB_RUN_ID -and
        [string]$env:RUNNER_NAME -and
        [string]$env:RUNNER_TEMP -and
        [string]$env:ImageOS -and
        (-not [string]$env:RUNNER_ENVIRONMENT -or $env:RUNNER_ENVIRONMENT -eq 'github-hosted')
    )
    $receipt.host.freshHostedRunner = [bool]$freshHostedRunner
    if (-not $freshHostedRunner) { throw 'A fresh GitHub-hosted Windows runner is required' }
    if ($LatestUrl -ne $ExpectedLatestUrl) { throw 'LatestUrl is not the canonical central Hive IDE feed' }
    $ExpectedSourceCommit = $ExpectedSourceCommit.ToLowerInvariant()
    if (@(Get-HiveUninstallEntries).Count -ne 0) { throw 'Fresh runner unexpectedly contains a Hive IDE install' }
    foreach ($required in @($CheckedLatestPath, $CheckedManifestPath)) {
        if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw "Checked-in release document is missing: $required" }
    }

    [IO.Directory]::CreateDirectory($WorkRoot) | Out-Null
    [void](Download-Bounded -Url $LatestUrl -OutFile $LatestPath -MaximumBytes 65536 -Label 'latest feed')
    if ((Get-Sha256 $LatestPath) -ne (Get-Sha256 $CheckedLatestPath)) {
        throw 'Live latest feed differs from the landed central hub document'
    }
    $latest = Get-Content -Raw -LiteralPath $LatestPath | ConvertFrom-Json
    if ($latest.schema -ne 'hive.ide.public_release_latest.v1' -or
        $latest.product -ne $ExpectedProductName -or
        $latest.sourceCommit -ne $ExpectedSourceCommit -or
        $latest.stage -ne 'tester' -or
        $latest.channel -ne 'unsigned-public-tester' -or
        $latest.publisherAuthenticated -ne $false -or
        $latest.smartScreenWarningExpected -ne $true -or
        $latest.readyForPublicFunctionalTesting -ne $true -or
        [int64]$latest.installerSizeBytes -lt 1MB -or
        [int64]$latest.installerSizeBytes -gt 2GB -or
        [string]$latest.installerSha256 -notmatch '^[a-f0-9]{64}$' -or
        [string]$latest.manifestSha256 -notmatch '^[a-f0-9]{64}$') {
        throw 'Live latest feed identity or claim boundary is invalid'
    }
    $releaseTag = ([Uri]$latest.installerUrl).Segments[-2].TrimEnd('/')
    if ($releaseTag -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$') { throw 'Release tag is malformed' }
    Assert-CanonicalReleaseAsset -Url $latest.installerUrl -FileName $ExpectedInstallerName -Tag $releaseTag
    Assert-CanonicalReleaseAsset -Url $latest.manifestUrl -FileName 'hive-ide-release-manifest.json' -Tag $releaseTag

    [void](Download-Bounded -Url $latest.manifestUrl -OutFile $ManifestPath -MaximumBytes 524288 -Label 'release manifest')
    if ((Get-Sha256 $ManifestPath) -ne [string]$latest.manifestSha256 -or
        (Get-Sha256 $ManifestPath) -ne (Get-Sha256 $CheckedManifestPath)) {
        throw 'Release manifest differs from the live feed or landed mirror'
    }
    $manifest = Get-Content -Raw -LiteralPath $ManifestPath | ConvertFrom-Json
    if ($manifest.schema -ne 'hive.ide.public_release_manifest.v1' -or
        $manifest.release.tag -ne $releaseTag -or
        $manifest.release.repository -ne $ExpectedReleaseRepository -or
        $manifest.source.hiveIde.commit -ne $ExpectedSourceCommit -or
        $manifest.artifact.name -ne $ExpectedInstallerName -or
        $manifest.artifact.sha256 -ne $latest.installerSha256 -or
        [int64]$manifest.artifact.sizeBytes -ne [int64]$latest.installerSizeBytes -or
        $manifest.artifact.publisherAuthenticated -ne $false -or
        $manifest.testerPolicy.readyForPublicFunctionalTesting -ne $true -or
        $manifest.testerPolicy.testCreditsHaveMonetaryValue -ne $false) {
        throw 'Release manifest does not bind the exact unsigned tester channel'
    }
    Assert-CanonicalReleaseAsset -Url $manifest.release.provenanceUrl -FileName 'windows-installer-provenance.json' -Tag $releaseTag
    [void](Download-Bounded -Url $manifest.release.provenanceUrl -OutFile $ProvenancePath -MaximumBytes 8388608 -Label 'installer provenance')
    if ((Get-Sha256 $ProvenancePath) -ne [string]$manifest.runtime.installerProvenanceReceipt.sha256) {
        throw 'Installer provenance hash differs from the release manifest'
    }
    $provenance = Get-Content -Raw -LiteralPath $ProvenancePath | ConvertFrom-Json
    if ($provenance.schemaVersion -ne 'hive.ide.windows_installer_artifact_receipt.v3' -or
        $provenance.hiveIdeCommit -ne $ExpectedSourceCommit -or
        $provenance.installer.sha256 -ne $latest.installerSha256 -or
        $provenance.appExecutable.sha256 -ne $manifest.artifact.installedApplication.sha256 -or
        $provenance.installerPayloadExecutable.exactTauriNsisBundleTypePatchVerified -ne $true) {
        throw 'Installer provenance does not bind the release and installed executable'
    }

    [void](Download-Bounded -Url $latest.installerUrl -OutFile $InstallerPath -MaximumBytes 2GB -Label 'installer')
    $installerSize = (Get-Item -LiteralPath $InstallerPath).Length
    $installerSha256 = Get-Sha256 $InstallerPath
    if ($installerSize -ne [int64]$latest.installerSizeBytes -or $installerSha256 -ne [string]$latest.installerSha256) {
        throw 'Downloaded installer bytes differ from the public release identity'
    }
    $receipt.channel = [ordered]@{
        latestUrl = $LatestUrl
        version = $latest.version
        releaseTag = $releaseTag
        sourceCommit = $ExpectedSourceCommit
        manifestSha256 = Get-Sha256 $ManifestPath
        provenanceSha256 = Get-Sha256 $ProvenancePath
        installerSizeBytes = $installerSize
        installerSha256 = $installerSha256
        fullBodyHashed = $true
        publisherAuthenticated = $false
    }

    $installAttemptOwned = $true
    $install = Start-Process -FilePath $InstallerPath -ArgumentList '/S' -PassThru -Wait
    if ($install.ExitCode -ne 0) { throw "Silent installer exited $($install.ExitCode)" }
    $entries = @(Get-HiveUninstallEntries)
    if ($entries.Count -ne 1) { throw "Expected one Hive IDE uninstall entry; found $($entries.Count)" }
    $uninstallEntry = $entries[0]
    if (-not $uninstallEntry.UninstallString) { throw 'Hive IDE uninstall entry omitted UninstallString' }
    $uninstallExe = Get-SafeLocalAppDataCommand -Command $uninstallEntry.UninstallString -Label 'uninstaller'
    $installedRoot = Split-Path -Parent $uninstallExe
    $expectedApplication = [string]$manifest.artifact.installedApplication.name
    $applications = @(Get-ChildItem -LiteralPath $installedRoot -Filter $expectedApplication -File -Recurse -ErrorAction SilentlyContinue)
    if ($applications.Count -ne 1) { throw "Expected one installed $expectedApplication; found $($applications.Count)" }
    $application = $applications[0]
    $applicationSha256 = Get-Sha256 $application.FullName
    if ($applicationSha256 -ne [string]$manifest.artifact.installedApplication.sha256) {
        throw 'Installed application hash differs from the release manifest'
    }
    $receipt.install = [ordered]@{
        installerExitCode = $install.ExitCode
        currentUser = $true
        uninstallEntryCount = $entries.Count
        installRoot = $installedRoot
        applicationPath = $application.FullName
        applicationSha256 = $applicationSha256
        applicationHashMatchesManifest = $true
    }

    $startedProcess = Start-Process -FilePath $application.FullName -PassThru
    $window = Wait-ResponsiveMainWindow -Process $startedProcess
    if (-not $window) { throw 'Responsive Hive IDE main window was not observed before timeout' }
    $receipt.launch = $window
    [void]$startedProcess.CloseMainWindow()
    if (-not $startedProcess.WaitForExit($CloseTimeoutSeconds * 1000)) {
        throw "Hive IDE did not close within the bounded $CloseTimeoutSeconds-second runtime shutdown window"
    }
    $receipt.launch['gracefulMainWindowClose'] = $true
    $receipt.launch['gracefulExitTimeoutSeconds'] = $CloseTimeoutSeconds
    $receipt.launch['exitCode'] = $startedProcess.ExitCode

    $uninstall = Start-Process -FilePath $uninstallExe -ArgumentList '/S' -PassThru -Wait
    Start-Sleep -Seconds 2
    $remainingEntries = @(Get-HiveUninstallEntries)
    $applicationRemoved = -not (Test-Path -LiteralPath $application.FullName)
    $receipt.uninstall = [ordered]@{
        exitCode = $uninstall.ExitCode
        uninstallEntryCountAfter = $remainingEntries.Count
        installedApplicationRemoved = $applicationRemoved
        unrelatedProcessesTerminated = $false
    }
    if ($uninstall.ExitCode -ne 0 -or $remainingEntries.Count -ne 0 -or -not $applicationRemoved) {
        throw 'Bounded uninstall did not remove the exact current-user product'
    }
    $uninstallEntry = $null
    $receipt.ok = $true
}
catch {
    $failure = $_.Exception
    $receipt.errors = @($receipt.errors) + @($_.Exception.Message)
}
finally {
    if ($startedProcess -and -not $startedProcess.HasExited) {
        Stop-Process -Id $startedProcess.Id -Force -ErrorAction SilentlyContinue
        $receipt.errors = @($receipt.errors) + @('exact_app_pid_required_forced_cleanup')
        $receipt.ok = $false
    }
    if ($installAttemptOwned) {
        $cleanupEntries = @(Get-HiveUninstallEntries)
        if ($cleanupEntries.Count -eq 1) {
            try {
                $cleanupExe = Get-SafeLocalAppDataCommand -Command $cleanupEntries[0].UninstallString -Label 'cleanup uninstaller'
                $cleanup = Start-Process -FilePath $cleanupExe -ArgumentList '/S' -PassThru -Wait
                if ($cleanup.ExitCode -ne 0) { throw "cleanup uninstaller exited $($cleanup.ExitCode)" }
            }
            catch {
                $receipt.errors = @($receipt.errors) + @("cleanup_failed: $($_.Exception.Message)")
                $receipt.ok = $false
            }
        }
        elseif ($cleanupEntries.Count -gt 1) {
            $receipt.errors = @($receipt.errors) + @("cleanup_refused_multiple_entries_$($cleanupEntries.Count)")
            $receipt.ok = $false
        }
    }
    $resolvedWorkRoot = [IO.Path]::GetFullPath($WorkRoot)
    $expectedTempPrefix = $RunnerTemp.TrimEnd('\') + '\'
    if (-not $resolvedWorkRoot.StartsWith($expectedTempPrefix, [StringComparison]::OrdinalIgnoreCase) -or
        [IO.Path]::GetFileName($resolvedWorkRoot) -notlike 'hive-ide-public-smoke-*') {
        $cleanupError = [InvalidOperationException]::new("Refusing unsafe cleanup path: $resolvedWorkRoot")
        $receipt.errors = @($receipt.errors) + @($cleanupError.Message)
        $receipt.ok = $false
        if (-not $failure) { $failure = $cleanupError }
    }
    elseif (Test-Path -LiteralPath $resolvedWorkRoot) {
        try { Remove-Item -LiteralPath $resolvedWorkRoot -Recurse -Force }
        catch {
            $receipt.errors = @($receipt.errors) + @("temporary_cleanup_failed: $($_.Exception.Message)")
            $receipt.ok = $false
            if (-not $failure) { $failure = $_.Exception }
        }
    }
    $receipt.finishedAtUtc = [DateTime]::UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'")
    try { Write-SmokeReceipt }
    catch {
        if (-not $failure) { $failure = $_.Exception }
        $receipt.ok = $false
    }
}

if ($failure) { throw $failure }
if (-not $receipt.ok) { throw 'Hive IDE public Windows smoke did not complete successfully' }
$receipt | ConvertTo-Json -Depth 14
