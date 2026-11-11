$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$viewer = Join-Path $repoRoot "tools\Source2Viewer-CLI.exe"
$buildDir = Join-Path $repoRoot "build"
$entsBin = Join-Path $buildDir "dl_defense_default_ents.vents_c"

$passCount = 0
function Assert-True([bool]$cond, [string]$msg) {
    if (-not $cond) {
        throw "ASSET TEST FAILED: $msg"
    }
    $script:passCount++
    Write-Host "  [PASS] $msg" -ForegroundColor Green
}

Write-Host "=== Tier 2: Binary KV3 VData & Map VPK Asset Verification ===" -ForegroundColor Cyan

# 1. Verify pak20_dir.vpk structure (installed as td_addons/pak01_dir.vpk ahead of addons/pak01_dir.vpk HUD++)
$pak20 = Join-Path $buildDir "pak20_dir.vpk"
$legacyPak00 = Join-Path $buildDir "pak00_dir.vpk"
Assert-True (Test-Path $pak20) "build/pak20_dir.vpk exists"
Assert-True (-not (Test-Path $legacyPak00)) "invalid build/pak00_dir.vpk is removed"
$pak20List = (& $viewer -i $pak20 --vpk_list) -join "`n"
Assert-True ($pak20List -match "scripts/modifiers\.vdata_c") "pak20_dir.vpk contains scripts/modifiers.vdata_c"
Assert-True ($pak20List -match "scripts/npc_units\.vdata_c") "pak20_dir.vpk contains scripts/npc_units.vdata_c"
Assert-True ($pak20List -match "materials/minimap/hl_defense\.vmat_c") "pak20_dir.vpk contains materials/minimap/hl_defense.vmat_c"
Assert-True ($pak20List -match "panorama/styles/hud\.vcss_c") "pak20_dir.vpk contains patched panorama/styles/hud.vcss_c"
Assert-True ($pak20List -match "panorama/styles/hud_minimap\.vcss_c") "pak20_dir.vpk contains patched panorama/styles/hud_minimap.vcss_c"
Assert-True ($pak20List -match "animgraphs/animgraph2/hero/necro/necro_shambler\.vnmgraph_c") "pak20_dir.vpk contains patched necro_shambler.vnmgraph_c"
$expectedNeutralGraphs = @(
    "npc_neutral.vnmgraph+library_watcher.vnmgraph_c",
    "npc_neutral.vnmgraph+lantern.vnmgraph_c",
    "npc_neutral.vnmgraph+puppeteer.vnmgraph_c",
    "npc_neutral.vnmgraph+bookmoth.vnmgraph_c",
    "npc_neutral.vnmgraph+mushroom_large.vnmgraph_c",
    "npc_neutral_movement_library_watcher.vnmgraph_c",
    "npc_neutral_movement_flying.vnmgraph+lantern.vnmgraph_c",
    "npc_neutral_movement_puppeteer.vnmgraph_c",
    "npc_neutral_movement_flying.vnmgraph+bookmoth.vnmgraph_c",
    "npc_neutral_movement_mushroom_small.vnmgraph_c",
    "npc_neutral_movement_mushroom_small.vnmgraph+mushroom_large.vnmgraph_c"
)
foreach ($ng in $expectedNeutralGraphs) {
    $escapedNg = [regex]::Escape("animgraphs/animgraph2/npc_units/neutrals/$ng")
    Assert-True ($pak20List -match $escapedNg) "pak20_dir.vpk contains patched $ng"
}

$mainHudCssBin = Join-Path $buildDir "td_panorama_overrides\styles\hud.vcss_c"
Assert-True (Test-Path $mainHudCssBin) "build/td_panorama_overrides/styles/hud.vcss_c exists"
$mainHudCssText = [System.Text.Encoding]::ASCII.GetString([System.IO.File]::ReadAllBytes($mainHudCssBin))
Assert-True (-not $mainHudCssText.Contains(".connectedToHeroTesting:not(.isDefaultMap)")) "hud.vcss_c neutralizes .connectedToHeroTesting:not(.isDefaultMap) #minimap_persp collapse rule"
Assert-True ($mainHudCssText.Contains(".connectedToHeroTestXng:not(.isDefaultMap)")) "hud.vcss_c preserves exact byte length via .connectedToHeroTestXng:not(.isDefaultMap)"

$hudCssBin = Join-Path $buildDir "td_panorama_overrides\styles\hud_minimap.vcss_c"
Assert-True (Test-Path $hudCssBin) "build/td_panorama_overrides/styles/hud_minimap.vcss_c exists"
$hudCssText = [System.Text.Encoding]::ASCII.GetString([System.IO.File]::ReadAllBytes($hudCssBin))
Assert-True (-not $hudCssText.Contains(".connectedToHeroTesting:not(.isDefaultMap)")) "hud_minimap.vcss_c neutralizes .connectedToHeroTesting:not(.isDefaultMap) collapse rule"
Assert-True ($hudCssText.Contains(".connectedToHeroTestXng:not(.isDefaultMap)")) "hud_minimap.vcss_c preserves exact byte length via .connectedToHeroTestXng:not(.isDefaultMap)"
Assert-True (-not $hudCssText.Contains(".NewMinimapBackgroundsContainer,.HideOldZiplines")) "hud_minimap.vcss_c neutralizes .NewMinimapBackgroundsContainer default collapse rule on hl_defense"
Assert-True ($hudCssText.Contains(".NewMinimapBackgroundsContainXX,.HideOldZiplines")) "hud_minimap.vcss_c preserves exact byte length on .NewMinimapBackgroundsContainXX"
Assert-True ($hudCssText.Contains(".NewMinimapBackgroundsContainer{height: 100%;width: 100%;}")) "hud_minimap.vcss_c retains 100%x100% sizing on .NewMinimapBackgroundsContainer"
Assert-True (-not $hudCssText.Contains(".dl_midtown")) "hud_minimap.vcss_c replaces .dl_midtown sublayer selector with .HudMinimap"
Assert-True ($hudCssText.Contains(".HudMinimap .backgroundImage2")) "hud_minimap.vcss_c hides underground sublayers cleanly on hl_defense"

$shamblerBin = Join-Path $buildDir "td_panorama_overrides\animgraphs\animgraph2\hero\necro\necro_shambler.vnmgraph_c"
Assert-True (Test-Path $shamblerBin) "build/td_panorama_overrides/animgraphs/animgraph2/hero/necro/necro_shambler.vnmgraph_c exists"
$shamblerDecomp = (& $viewer -i $shamblerBin -b DATA) -join "`n"
Assert-True (-not ($shamblerDecomp -match "\bm_nInputValueNodeIdx = 9\b")) "necro_shambler.vnmgraph_c replaces all forward_speed (9) checks with run_speed (12)"
Assert-True ($shamblerDecomp -match '"run_speed"') "necro_shambler.vnmgraph_c renames move_speed -> run_speed for CNPC_Trooper"
Assert-True ($shamblerDecomp -match '"attack"') "necro_shambler.vnmgraph_c renames action_melee -> attack for CNPC_Trooper"
Assert-True ($shamblerDecomp -match '"in_air_forced"') "necro_shambler.vnmgraph_c renames in_air -> in_air_forced for CNPC_Trooper"
Assert-True ($shamblerDecomp -match '"trooper_action"') "necro_shambler.vnmgraph_c renames base_action -> trooper_action for CNPC_Trooper"
Assert-True ($shamblerDecomp -match "m_nNodeIdx = 17[\s\S]{1,2500}?m_nDefaultStateIndex = 1") "necro_shambler.vnmgraph_c starts Shambler Locomotion (Node 17) directly in State 1 (MOVEMENT)"
Assert-True ($shamblerDecomp -match "m_nNodeIdx = 19[\s\S]{1,300}?m_bAllowLooping = false") "necro_shambler.vnmgraph_c disables looping on Spawn clip (Node 19)"

$watcherParentBin = Join-Path $buildDir "td_panorama_overrides\animgraphs\animgraph2\npc_units\neutrals\npc_neutral.vnmgraph+library_watcher.vnmgraph_c"
$watcherParentDecomp = (& $viewer -i $watcherParentBin -b DATA) -join "`n"
Assert-True ($watcherParentDecomp -match "m_nNodeIdx = 16[\s\S]{1,3500}?m_nDefaultStateIndex = 3") "npc_neutral.vnmgraph+library_watcher.vnmgraph_c starts SM_Neutral_NPC (Node 16) in State 3 (Active)"
Assert-True ($watcherParentDecomp -match '"run_speed"') "npc_neutral.vnmgraph+library_watcher.vnmgraph_c maps move_speed -> run_speed"
Assert-True ($watcherParentDecomp -match '"trooper_action"') "npc_neutral.vnmgraph+library_watcher.vnmgraph_c maps movement_type -> trooper_action"
Assert-True ($watcherParentDecomp -match '"RUN"') "npc_neutral.vnmgraph+library_watcher.vnmgraph_c accepts CNPC_Trooper uppercase RUN"

$bookmothMoveBin = Join-Path $buildDir "td_panorama_overrides\animgraphs\animgraph2\npc_units\neutrals\npc_neutral_movement_flying.vnmgraph+bookmoth.vnmgraph_c"
$bookmothMoveDecomp = (& $viewer -i $bookmothMoveBin -b DATA) -join "`n"
Assert-True ($bookmothMoveDecomp -match "m_nInputParameterNodeIdx1 = 2") "npc_neutral_movement_flying.vnmgraph+bookmoth.vnmgraph_c drives Blend2D +Y axis from run_speed (node 2)"
Assert-True ($bookmothMoveDecomp -match '"RUN"') "npc_neutral_movement_flying.vnmgraph+bookmoth.vnmgraph_c enters running state on CNPC_Trooper RUN"

# 2. Decompile and verify modifiers.vdata_c
$modBin = Join-Path $buildDir "scripts\modifiers.vdata_c"
Assert-True (Test-Path $modBin) "build/scripts/modifiers.vdata_c exists"
$modDecomp = (& $viewer -i $modBin -b DATA) -join "`n"

for ($i = 1; $i -le 10; $i++) {
    Assert-True ($modDecomp -match "td_creep_size_$i\b") "modifiers.vdata_c defines td_creep_size_$i"
    Assert-True ($modDecomp -match "td_creep_strength_$i\b") "modifiers.vdata_c defines td_creep_strength_$i"
}
for ($b = 1; $b -le 5; $b++) {
    Assert-True ($modDecomp -match "td_boss_hero_stats_$b\b") "modifiers.vdata_c defines td_boss_hero_stats_$b"
}
Assert-True ($modDecomp -match "td_boss_size_step\b") "modifiers.vdata_c defines stackable td_boss_size_step"
$expectedTomes = @(
    "td_tome_spirit", "td_tome_weapon", "td_tome_firerate", "td_tome_health",
    "td_tome_cooldown", "td_tome_range", "td_tome_omni",
    "td_tome_weapon_dmg", "td_tome_fire_rate", "td_tome_ammo",
    "td_tome_max_hp", "td_tome_hp_regen", "td_tome_cdr", "td_tome_tech_range",
    "td_guardian_armor_buff", "td_guardian_damage_buff"
)
foreach ($tome in $expectedTomes) {
    Assert-True ($modDecomp -match "$tome\b") "modifiers.vdata_c defines stackable modifier $tome"
}
Assert-True ($modDecomp -match "MODIFIER_ATTRIBUTE_MULTIPLE") "modifiers.vdata_c includes MODIFIER_ATTRIBUTE_MULTIPLE for stacking"

# 3. Decompile and verify npc_units.vdata_c
$npcBin = Join-Path $buildDir "scripts\npc_units.vdata_c"
Assert-True (Test-Path $npcBin) "build/scripts/npc_units.vdata_c exists"
$npcDecomp = (& $viewer -i $npcBin -b DATA) -join "`n"
Assert-True ($npcDecomp -match "models/heroes_wip/necro/necro_shambler\.vmdl") "npc_units.vdata_c converts trooper_melee to Graves's Zombie (necro_shambler.vmdl)"
Assert-True ($npcDecomp -match "m_nMaxHealth = 413") "npc_units.vdata_c sets trooper_melee m_nMaxHealth = 413 for zombie identification"
Assert-True ($npcDecomp -match "necro_zombie_proximity_explode") "npc_units.vdata_c includes necro_zombie_proximity_explode"
Assert-True ($npcDecomp -match "necro_zombie_explode_on_death") "npc_units.vdata_c includes necro_zombie_explode_on_death"
Assert-True ($npcDecomp -match "models/npc_units/neutral_library_watcher_01/neutral_library_watcher_01\.vmdl") "npc_units.vdata_c converts trooper_medic to Library Watcher neutral creep"
$trooperMedicSlice = $npcDecomp.Substring($npcDecomp.IndexOf("trooper_medic ="), 6500)
Assert-True (-not ($trooperMedicSlice -match "neutral_underhand_01")) "trooper_medic block has zero broken pve_underhand neutral_underhand_01 references"
Assert-True ($trooperMedicSlice -match 'm_sAnimGraphIdentifier = "Neutrals"') "trooper_medic sets m_sAnimGraphIdentifier = Neutrals (inherited by all td_neutral_* variants)"
Assert-True ($npcDecomp -match "models/npc_units/neutral_library_bookmoth/neutral_library_bookmoth\.vmdl") "td_neutral_pigeon uses fully-animated neutral_library_bookmoth.vmdl"
foreach ($neutralVariant in @("td_neutral_lantern", "td_neutral_puppeteer", "td_neutral_pigeon", "td_neutral_mushroom")) {
    Assert-True ($npcDecomp -match "$neutralVariant\b") "npc_units.vdata_c defines custom wave neutral variant $neutralVariant"
}

# 4. Verify Map VPKs (maps/hl_defense.vpk and build/dl_defense.vpk) & default_ents.vents_c
$hlVpk = Join-Path $repoRoot "maps\hl_defense.vpk"
$dlVpk = Join-Path $buildDir "dl_defense.vpk"
Assert-True (Test-Path $hlVpk) "maps/hl_defense.vpk exists for Modlock custom map loader"
Assert-True (Test-Path $dlVpk) "build/dl_defense.vpk exists"

$hlList = (& $viewer -i $hlVpk --vpk_list) -join "`n"
Assert-True ($hlList -match "maps/hl_defense\.vmap_c") "maps/hl_defense.vpk contains maps/hl_defense.vmap_c"
Assert-True ($hlList -match "maps/hl_defense/world\.vrman_c") "maps/hl_defense.vpk contains maps/hl_defense/world.vrman_c"
Assert-True ($hlList -match "maps/dl_midtown/entities/default_ents\.vents_c") "maps/hl_defense.vpk contains patched default_ents.vents_c"

Assert-True (Test-Path $entsBin) "compiled dl_defense_default_ents.vents_c exists"
$entsDecomp = (& $viewer -i $entsBin -b DATA) -join "`n"
Assert-True ($entsDecomp -match '\[PR#\]boss_rebel_t1_blue') "default_ents.vents_c spawns Friendly Blue T1 Guardian ([PR#]boss_rebel_t1_blue)"
Assert-True (-not ($entsDecomp -match 'classname = "info_neutral_trooper_camp"')) "default_ents.vents_c disables all static info_neutral_trooper_camp entities"
Assert-True (-not ($entsDecomp -match 'classname = "info_neutral_trooper_spawn"')) "default_ents.vents_c disables all static info_neutral_trooper_spawn entities"
Assert-True ($entsDecomp -match 'origin = \[\s*0(\.0+)?,\s*-1950(\.0+)?,\s*390(\.0+)?\s*\]') "default_ents.vents_c relocates info_team_spawn to Center Lane surface [0, -1950, 390]"
Assert-True (-not ($entsDecomp -match 'classname = "point_template"')) "default_ents.vents_c disables all point_template entities"
Assert-True (-not ($entsDecomp -match 'exec td_wave_tick')) "default_ents.vents_c removes legacy hardcoded td_wave_tick outputs (Modlock drives waves)"

# 5. Verify Modlock bundle outputs
$modJs = Join-Path $buildDir "mod.js"
$modJson = Join-Path $buildDir "mod.json"
Assert-True (Test-Path $modJs) "build/mod.js bundle exists"
Assert-True (Test-Path $modJson) "build/mod.json manifest exists"

Write-Host "=== All $passCount Tier 2 Asset & Binary KV3 Checks Passed! ===" -ForegroundColor Green
