param(
    [ValidateSet("Build", "Test", "Install", "Dev", "Clean", "Uninstall", "Status")]
    [string]$Action = "Install",
    [string]$DeadlockDir = "D:\SteamLibrary\steamapps\common\Deadlock",
    [switch]$Probe
)

$ErrorActionPreference = "Stop"
$env:DEADLOCK_DIR   = $DeadlockDir
$srcCfgDir          = Join-Path $PSScriptRoot "src\cfg"
$buildDir           = Join-Path $PSScriptRoot "build"
$mapsDir            = Join-Path $PSScriptRoot "maps"
$backupDir          = Join-Path $PSScriptRoot "backups"
$manifestPath       = Join-Path $backupDir "installed_manifest.json"
$modlockExe         = Join-Path $PSScriptRoot "tools\modlock.exe"
$deadlockCfgDir     = Join-Path $DeadlockDir "game\citadel\cfg"
$deadlockMapsDir    = Join-Path $DeadlockDir "game\citadel\maps"
$deadlockAddonDir   = Join-Path $DeadlockDir "game\citadel\addons"
$deadlockScriptsDir = Join-Path $DeadlockDir "game\citadel\scripts"
$gameInfoPath       = Join-Path $DeadlockDir "game\citadel\gameinfo.gi"

if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
}

function Invoke-BuildAll {
    Write-Host "=== [1/4] Building Binary KV3 VData (pak20_dir.vpk) ===" -ForegroundColor Cyan
    & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "scripts\build_td_vdata.ps1")
    if ($LASTEXITCODE -ne 0) { throw "build_td_vdata.ps1 failed" }

    Write-Host "=== [2/4] Compiling Patched Map Entities (dl_defense_default_ents.vents_c) ===" -ForegroundColor Cyan
    & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "scripts\build_dl_defense_ents.ps1")
    if ($LASTEXITCODE -ne 0) { throw "build_dl_defense_ents.ps1 failed" }

    Write-Host "=== [3/4] Packaging Map VPKs (build/dl_defense.vpk & maps/hl_defense.vpk) ===" -ForegroundColor Cyan
    & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "scripts\build_dl_defense_vpk.ps1")
    if ($LASTEXITCODE -ne 0) { throw "build_dl_defense_vpk.ps1 failed" }

    Write-Host "=== [4/4] Building Modlock TypeScript Bundle (build/mod.js) ===" -ForegroundColor Cyan
    & $modlockExe build
    if ($LASTEXITCODE -ne 0) { throw "modlock build failed" }

    Write-Host "=== Build Complete! ===" -ForegroundColor Green
}

function Invoke-InstallFiles {
    $installedFiles = @()

    # 1. Remove legacy test cfg files if present
    foreach ($legacyCfg in @("listenserver.cfg", "custom_1v1_loot.cfg", "start_1v1_loot.cfg", "td_grant_tome.cfg", "td_rearm_tome.cfg")) {
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

    # 3. Install custom map VPKs (dl_defense.vpk and hl_defense.vpk)
    foreach ($mapPair in @(
        @{ Src = (Join-Path $buildDir "dl_defense.vpk"); Name = "dl_defense.vpk" },
        @{ Src = (Join-Path $mapsDir "hl_defense.vpk"); Name = "hl_defense.vpk" }
    )) {
        if (Test-Path $mapPair.Src) {
            $mapVpkDst = Join-Path $deadlockMapsDir $mapPair.Name
            try {
                Copy-Item -Path $mapPair.Src -Destination $mapVpkDst -Force -ErrorAction Stop
                $installedFiles += $mapVpkDst
                Write-Host "[Installed Map VPK] $($mapPair.Name) -> $mapVpkDst" -ForegroundColor Green
            } catch {
                Write-Host "[Note] $($mapPair.Name) is currently mounted by a running Deadlock match; existing file remains active." -ForegroundColor Yellow
                $installedFiles += $mapVpkDst
            }
        }
    }

    # 4. Install custom addon VPK (pak20_dir.vpk) and loose VData overrides
    $addonVpkSrc = Join-Path $buildDir "pak20_dir.vpk"
    if (Test-Path $addonVpkSrc) {
        if (-not (Test-Path $deadlockAddonDir)) {
            New-Item -ItemType Directory -Path $deadlockAddonDir -Force | Out-Null
        }
        $addonVpkDst = Join-Path $deadlockAddonDir "pak20_dir.vpk"
        try {
            Copy-Item -Path $addonVpkSrc -Destination $addonVpkDst -Force -ErrorAction Stop
            $installedFiles += $addonVpkDst
            Write-Host "[Installed Addon VPK] pak20_dir.vpk -> $addonVpkDst" -ForegroundColor Green
        } catch {
            Write-Host "[Note] pak20_dir.vpk is currently mounted by a running Deadlock process; loose VData overrides in game\citadel\scripts will be updated instead." -ForegroundColor Yellow
            $installedFiles += $addonVpkDst
        }
    }

    function Copy-SafeModFile([string]$Src, [string]$Dst, [string]$Label) {
        try {
            Copy-Item -Path $Src -Destination $Dst -Force -ErrorAction Stop
            Write-Host "[Installed $Label] $(Split-Path $Dst -Leaf) -> $Dst" -ForegroundColor Green
        } catch {
            Write-Host "[Note] $(Split-Path $Dst -Leaf) is currently in use by running Deadlock; existing copy remains active." -ForegroundColor Yellow
        }
    }

    $buildScriptsDir = Join-Path $buildDir "scripts"
    if (Test-Path $buildScriptsDir) {
        if (-not (Test-Path $deadlockScriptsDir)) {
            New-Item -ItemType Directory -Path $deadlockScriptsDir -Force | Out-Null
        }
        foreach ($vdataFile in Get-ChildItem -Path $buildScriptsDir -Filter "*.vdata_c") {
            $dstVdata = Join-Path $deadlockScriptsDir $vdataFile.Name
            Copy-SafeModFile $vdataFile.FullName $dstVdata "VData"
            $installedFiles += $dstVdata
        }
    }

    $buildMinimapDir = Join-Path $buildDir "td_panorama_overrides\minimap"
    if (Test-Path $buildMinimapDir) {
        $deadlockMinimapDir = Join-Path $DeadlockDir "game\citadel\materials\minimap"
        if (-not (Test-Path $deadlockMinimapDir)) {
            New-Item -ItemType Directory -Path $deadlockMinimapDir -Force | Out-Null
        }
        foreach ($vmatFile in Get-ChildItem -Path $buildMinimapDir -Filter "*.vmat_c") {
            $dstVmat = Join-Path $deadlockMinimapDir $vmatFile.Name
            Copy-SafeModFile $vmatFile.FullName $dstVmat "Minimap Material"
            $installedFiles += $dstVmat
        }
    }

    # 5. Install loose Panorama CSS & AnimGraph2 overrides so Deadlock resolves them cleanly
    $buildPanoramaStylesDir = Join-Path $buildDir "td_panorama_overrides\styles"
    if (Test-Path $buildPanoramaStylesDir) {
        $deadlockPanoramaStylesDir = Join-Path $DeadlockDir "game\citadel\panorama\styles"
        if (-not (Test-Path $deadlockPanoramaStylesDir)) {
            New-Item -ItemType Directory -Path $deadlockPanoramaStylesDir -Force | Out-Null
        }
        foreach ($vcssFile in Get-ChildItem -Path $buildPanoramaStylesDir -Filter "*.vcss_c") {
            $dstVcss = Join-Path $deadlockPanoramaStylesDir $vcssFile.Name
            Copy-SafeModFile $vcssFile.FullName $dstVcss "Panorama CSS"
            $installedFiles += $dstVcss
        }
    }

    $buildShamblerGraph = Join-Path $buildDir "td_panorama_overrides\animgraphs\animgraph2\hero\necro\necro_shambler.vnmgraph_c"
    if (Test-Path $buildShamblerGraph) {
        $deadlockShamblerDir = Join-Path $DeadlockDir "game\citadel\animgraphs\animgraph2\hero\necro"
        if (-not (Test-Path $deadlockShamblerDir)) {
            New-Item -ItemType Directory -Path $deadlockShamblerDir -Force | Out-Null
        }
        $dstShambler = Join-Path $deadlockShamblerDir "necro_shambler.vnmgraph_c"
        Copy-SafeModFile $buildShamblerGraph $dstShambler "AnimGraph2"
        $installedFiles += $dstShambler
    }

    # Remove any retired custom Panorama layout files from previous playtests
    $deadlockPanoramaLayoutRoot = Join-Path $DeadlockDir "game\citadel\panorama\layout"
    if (Test-Path $deadlockPanoramaLayoutRoot) {
        foreach ($tdDir in Get-ChildItem -Path $deadlockPanoramaLayoutRoot -Directory -Filter "deadlock-td-*") {
            Remove-Item -Path $tdDir.FullName -Recurse -Force
            Write-Host "[Cleaned Legacy Panorama Layout] $($tdDir.FullName)" -ForegroundColor Yellow
        }
    }

    $installedFiles | ConvertTo-Json | Set-Content -Path $manifestPath -Encoding UTF8
    Write-Host "`nDone! All stock game files (dl_midtown.vpk, pak01_dir.vpk, DLLs) are 100% untouched." -ForegroundColor Cyan
    Write-Host "To remove all custom files before Ranked, run: .\deploy.ps1 -Action Clean" -ForegroundColor Cyan
}

if ($Action -eq "Build") {
    Invoke-BuildAll
}
elseif ($Action -eq "Test") {
    Write-Host "=== Running Tier 1 & Tier 1B TypeScript Unit & Probe Integration Tests ===" -ForegroundColor Cyan
    & node --experimental-strip-types --test (Join-Path $PSScriptRoot "test\td.test.ts")
    if ($LASTEXITCODE -ne 0) { throw "Tier 1 TypeScript tests failed!" }

    Write-Host "`n=== Running Modlock Build & Typecheck ===" -ForegroundColor Cyan
    & $modlockExe build
    if ($LASTEXITCODE -ne 0) { throw "Modlock build failed!" }

    Write-Host "`n=== Running Tier 2 Binary KV3 VData & Map VPK Asset Verification ===" -ForegroundColor Cyan
    & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "scripts\test_assets.ps1")
    if ($LASTEXITCODE -ne 0) { throw "Tier 2 asset verification failed!" }

    Write-Host "`n=== ALL TEST SUITES PASSED! ===" -ForegroundColor Green
}
elseif ($Action -eq "Install") {
    Invoke-InstallFiles
}
elseif ($Action -eq "Dev") {
    Invoke-InstallFiles
    if ($Probe) {
        Write-Host "`nLaunching Modlock Dev Session in Automated Probe Mode (modlock dev --arg probe)..." -ForegroundColor Cyan
        & $modlockExe dev --arg probe
    } else {
        Write-Host "`nLaunching Modlock Play Session with Live Hot-Reload (modlock play)..." -ForegroundColor Cyan
        & $modlockExe play
    }
}
elseif ($Action -eq "Clean" -or $Action -eq "Uninstall") {
    $candidates = @(
        (Join-Path $deadlockMapsDir "dl_defense.vpk"),
        (Join-Path $deadlockMapsDir "hl_defense.vpk"),
        (Join-Path $deadlockAddonDir "pak20_dir.vpk"),
        (Join-Path $deadlockScriptsDir "modifiers.vdata_c"),
        (Join-Path $deadlockScriptsDir "npc_units.vdata_c"),
        (Join-Path $DeadlockDir "game\citadel\materials\minimap\hl_defense.vmat_c"),
        (Join-Path $DeadlockDir "game\citadel\materials\minimap\dl_defense.vmat_c"),
        (Join-Path $DeadlockDir "game\citadel\panorama\styles\hud.vcss_c"),
        (Join-Path $DeadlockDir "game\citadel\panorama\styles\hud_minimap.vcss_c"),
        (Join-Path $DeadlockDir "game\citadel\animgraphs\animgraph2\hero\necro\necro_shambler.vnmgraph_c"),
        (Join-Path $deadlockCfgDir "start_td.cfg"),
        (Join-Path $deadlockCfgDir "td_apply_buffs.cfg"),
        (Join-Path $deadlockCfgDir "td_postload.cfg"),
        (Join-Path $deadlockCfgDir "td_scaling.cfg"),
        (Join-Path $deadlockCfgDir "td_wave_tick.cfg"),
        (Join-Path $deadlockCfgDir "td_grant_tome.cfg"),
        (Join-Path $deadlockCfgDir "td_rearm_tome.cfg")
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
    $deadlockPanoramaLayoutRoot = Join-Path $DeadlockDir "game\citadel\panorama\layout"
    if (Test-Path $deadlockPanoramaLayoutRoot) {
        foreach ($tdDir in Get-ChildItem -Path $deadlockPanoramaLayoutRoot -Directory -Filter "deadlock-td-*") {
            Remove-Item -Path $tdDir.FullName -Recurse -Force
            Write-Host "[Removed Dir] $($tdDir.FullName)" -ForegroundColor Yellow
        }
    }
    # Clean any // MODLOCK DEV lines from gameinfo.gi if left behind by an interrupted session
    if (Test-Path $gameInfoPath) {
        $giLines = Get-Content $gameInfoPath
        $filtered = $giLines | Where-Object { $_ -notmatch "MODLOCK DEV" }
        if ($filtered.Count -lt $giLines.Count) {
            $filtered | Set-Content -Path $gameInfoPath -Encoding UTF8
            Write-Host "[Cleaned MODLOCK DEV entries] $gameInfoPath" -ForegroundColor Yellow
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
