param([Parameter(Mandatory)][string] $BundleDirectory)

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
    Invoke-Installer $uninstaller '/S'
    if ((Test-Path -LiteralPath $app) -or (Test-Path -LiteralPath $typst)) {
        throw 'Uninstall left executable files behind.'
    }
} finally {
    if ((Test-Path -LiteralPath $app) -and (Test-Path -LiteralPath $uninstaller)) {
        Invoke-Installer $uninstaller '/S'
    }
}
