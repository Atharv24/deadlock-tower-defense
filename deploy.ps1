param(
    [ValidateSet("Install", "Clean", "Uninstall", "Status")]
    [string]$Action = "Install",
    [string]$DeadlockDir = "D:\SteamLibrary\steamapps\common\Deadlock"
)

$ErrorActionPreference = "Stop"
$srcCfgDir        = Join-Path $PSScriptRoot "src\cfg"
$buildDir         = Join-Path $PSScriptRoot "build"
$backupDir        = Join-Path $PSScriptRoot "backups"
$manifestPath     = Join-Path $backupDir "installed_manifest.json"
$deadlockCfgDir   = Join-Path $DeadlockDir "game\citadel\cfg"
$deadlockMapsDir  = Join-Path $DeadlockDir "game\citadel\maps"
$deadlockAddonDir = Join-Path $DeadlockDir "game\citadel\addons"

if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
}

if ($Action -eq "Install") {
    $installedFiles = @()

    # 1. Remove legacy test cfg files if present
    foreach ($legacyCfg in @("listenserver.cfg", "custom_1v1_loot.cfg", "start_1v1_loot.cfg")) {
        $legacyPath = Join-Path $deadlockCfgDir $legacyCfg
        if (Test-Path $legacyPath) {
            Remove-Item -Path $legacyPath -Force
            Write-Host "[Cleaned Legacy CFG] $legacyPath" -ForegroundColor Yellow
        }
    }

    # 1b. Clean persisted custom keybinds from user_keys_0_slot0.vcfg
    $cleanUserKeys = @"
"config"
{
	"bindings"
	{
		"F7"		"toggleconsole"
	}
}
"@
    foreach ($ukFile in @("user_keys_0_slot0.vcfg", "user_keys_0_slot0.vcfg_lastclouded")) {
        $ukPath = Join-Path $deadlockCfgDir $ukFile
        if (Test-Path $ukPath) {
            [System.IO.File]::WriteAllText($ukPath, $cleanUserKeys)
            Write-Host "[Cleaned Custom Keybinds] $ukPath" -ForegroundColor Green
        }
    }

    # 2. Install .cfg files
    if (Test-Path $srcCfgDir) {
        $cfgFiles = Get-ChildItem -Path $srcCfgDir -Filter "*.cfg"
        foreach ($file in $cfgFiles) {
            $destPath = Join-Path $deadlockCfgDir $file.Name
            Copy-Item -Path $file.FullName -Destination $destPath -Force
            $installedFiles += $destPath
            Write-Host "[Installed CFG] $($file.Name) -> $destPath" -ForegroundColor Green
        }
    }

    # 2. Install custom map VPK (dl_defense.vpk)
    $mapVpkSrc = Join-Path $buildDir "dl_defense.vpk"
    if (Test-Path $mapVpkSrc) {
        $mapVpkDst = Join-Path $deadlockMapsDir "dl_defense.vpk"
        Copy-Item -Path $mapVpkSrc -Destination $mapVpkDst -Force
        $installedFiles += $mapVpkDst
        Write-Host "[Installed Map VPK] dl_defense.vpk -> $mapVpkDst" -ForegroundColor Green
    }

    # 3. Install custom addon VPK (pak20_dir.vpk) if present (Phase 2+)
    $addonVpkSrc = Join-Path $buildDir "pak20_dir.vpk"
    if (Test-Path $addonVpkSrc) {
        if (-not (Test-Path $deadlockAddonDir)) {
            New-Item -ItemType Directory -Path $deadlockAddonDir -Force | Out-Null
        }
        $addonVpkDst = Join-Path $deadlockAddonDir "pak20_dir.vpk"
        Copy-Item -Path $addonVpkSrc -Destination $addonVpkDst -Force
        $installedFiles += $addonVpkDst
        Write-Host "[Installed Addon VPK] pak20_dir.vpk -> $addonVpkDst" -ForegroundColor Green
    } else {
        foreach ($oldVpk in @("pak02_dir.vpk", "pak20_dir.vpk")) {
            $oldPath = Join-Path $deadlockAddonDir $oldVpk
            if (Test-Path $oldPath) {
                Remove-Item -Path $oldPath -Force
                Write-Host "[Cleaned Old Addon VPK] $oldPath" -ForegroundColor Yellow
            }
        }
    }

    $installedFiles | ConvertTo-Json | Set-Content -Path $manifestPath -Encoding UTF8
    Write-Host "`nDone! All stock game files (dl_midtown.vpk, pak01_dir.vpk, DLLs) are 100% untouched." -ForegroundColor Cyan
    Write-Host "To remove all custom files before Ranked, run: .\deploy.ps1 -Action Clean" -ForegroundColor Cyan
}
elseif ($Action -eq "Clean" -or $Action -eq "Uninstall") {
    $candidates = @(
        (Join-Path $deadlockMapsDir "dl_defense.vpk"),
        (Join-Path $deadlockAddonDir "pak20_dir.vpk"),
        (Join-Path $deadlockCfgDir "start_td.cfg"),
        (Join-Path $deadlockCfgDir "td_postload.cfg")
    )
    if (Test-Path $manifestPath) {
        $fromManifest = Get-Content $manifestPath | ConvertFrom-Json
        foreach ($f in $fromManifest) {
            if ($candidates -notcontains $f) { $candidates += $f }
        }
    }
    foreach ($filePath in $candidates) {
        if (Test-Path $filePath) {
            Remove-Item -Path $filePath -Force
            Write-Host "[Removed] $filePath" -ForegroundColor Yellow
        }
    }
    if (Test-Path $manifestPath) {
        Remove-Item -Path $manifestPath -Force
    }
    Write-Host "`nClean complete! Deadlock installation is 100% stock and ready for Ranked." -ForegroundColor Green
}
elseif ($Action -eq "Status") {
    if (Test-Path $manifestPath) {
        Write-Host "Installed custom files (stock game files untouched):" -ForegroundColor Yellow
        Get-Content $manifestPath | ConvertFrom-Json | ForEach-Object { Write-Host "  - $_" }
    } else {
        Write-Host "No custom files currently installed (100% Stock)." -ForegroundColor Green
    }
}
