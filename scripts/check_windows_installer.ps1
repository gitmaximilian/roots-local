param(
    [Parameter(Mandatory)][string] $BundleDirectory,
    [Parameter(Mandatory)][string] $Target
)

$ErrorActionPreference = 'Stop'
$setup = @(Get-ChildItem -LiteralPath (Join-Path $BundleDirectory 'nsis') -Filter '*-setup.exe')
if ($setup.Count -ne 1) {
    throw 'Expected one NSIS setup file.'
}

$install = Join-Path $env:RUNNER_TEMP 'roots-local-installer-check'
$app = Join-Path $install 'roots-local.exe'
$typst = Join-Path $install 'typst.exe'
$uninstaller = Join-Path $install 'uninstall.exe'

function Invoke-Installer([string] $Executable, [string] $Flags) {
    $process = Start-Process -FilePath $Executable -ArgumentList $Flags -Wait -PassThru
    if ($process.ExitCode -ne 0) {
        throw "Installer action failed with exit code $($process.ExitCode)."
    }
}

try {
    foreach ($step in 'install', 'reinstall') {
        Invoke-Installer $setup[0].FullName "/S /NS /D=$install"
        if (!(Test-Path -LiteralPath $app) -or !(Test-Path -LiteralPath $typst) -or !(Test-Path -LiteralPath $uninstaller)) {
            throw "Installed files are incomplete after $step."
        }
        & $typst --version
        if ($LASTEXITCODE -ne 0) {
            throw 'Installed Typst executable failed.'
        }
    }
    $desktop = Start-Process -FilePath $app -WorkingDirectory $install -PassThru
    try {
        Start-Sleep -Seconds 4
        if ($desktop.HasExited) {
            throw "Installed app exited during startup with exit code $($desktop.ExitCode)."
        }
    } finally {
        if (!$desktop.HasExited) {
            Stop-Process -InputObject $desktop
            $desktop.WaitForExit()
        }
    }
    $report = Join-Path $env:RUNNER_TEMP 'roots-local-installed-report.pdf'
    cargo run --locked --manifest-path src-tauri/Cargo.toml --no-default-features --target $Target --example roots-check -- fixtures/synthetic-myheritage.txt $report $typst --synthetic
    if ($LASTEXITCODE -ne 0) {
        throw 'Report generation with the installed compiler failed.'
    }
    python scripts/verify_pdf.py $report
    if ($LASTEXITCODE -ne 0) {
        throw 'Installed compiler report verification failed.'
    }
    Invoke-Installer $uninstaller '/S'
    if ((Test-Path -LiteralPath $app) -or (Test-Path -LiteralPath $typst)) {
        throw 'Uninstall left executable files behind.'
    }
} finally {
    if ((Test-Path -LiteralPath $app) -and (Test-Path -LiteralPath $uninstaller)) {
        Invoke-Installer $uninstaller '/S'
    }
}
