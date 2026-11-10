$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$viewer = Join-Path $repoRoot "tools\Source2Viewer-CLI.exe"
$buildDir = Join-Path $repoRoot "build"
$entsBin = "C:\Users\athar\.gemini\antigravity\brain\bc4be04f-aa74-4f2b-b4c1-e6569ea638df\scratch\dl_defense_default_ents.vents_c"

$passCount = 0
function Assert-True([bool]$cond, [string]$msg) {
    if (-not $cond) {
        throw "ASSET TEST FAILED: $msg"
    }
    $script:passCount++
    Write-Host "  [PASS] $msg" -ForegroundColor Green
}

Write-Host "=== Tier 2: Binary KV3 VData & Map VPK Asset Verification ===" -ForegroundColor Cyan

# 1. Verify pak20_dir.vpk structure
$pak20 = Join-Path $buildDir "pak20_dir.vpk"
Assert-True (Test-Path $pak20) "build/pak20_dir.vpk exists"
$pak20List = (& $viewer -i $pak20 --vpk_list) -join "`n"
Assert-True ($pak20List -match "scripts/modifiers\.vdata_c") "pak20_dir.vpk contains scripts/modifiers.vdata_c"
Assert-True ($pak20List -match "scripts/npc_units\.vdata_c") "pak20_dir.vpk contains scripts/npc_units.vdata_c"

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
Assert-True ($npcDecomp -match "necro_zombie_proximity_explode") "npc_units.vdata_c includes necro_zombie_proximity_explode"
Assert-True ($npcDecomp -match "necro_zombie_explode_on_death") "npc_units.vdata_c includes necro_zombie_explode_on_death"
Assert-True ($npcDecomp -match "models/npc_units/neutral_underhand_01/neutral_underhand_01\.vmdl") "npc_units.vdata_c converts trooper_medic to Neutral Underhand creep"
Assert-True ($npcDecomp -match "m_flSpawnTetherRadius = 1200") "npc_units.vdata_c expands neutral camp tether radius to 1200"

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
Assert-True ($entsDecomp -match '\[PR#\]td_lane_neutrals') "default_ents.vents_c spawns Center Lane neutral camp ([PR#]td_lane_neutrals)"
Assert-True ($entsDecomp -match 'origin = \[\s*0(\.0+)?,\s*-1950(\.0+)?,\s*390(\.0+)?\s*\]') "default_ents.vents_c relocates info_team_spawn to Center Lane surface [0, -1950, 390]"
Assert-True (-not ($entsDecomp -match 'classname = "point_template"')) "default_ents.vents_c disables all point_template entities"
Assert-True (-not ($entsDecomp -match 'exec td_wave_tick')) "default_ents.vents_c removes legacy hardcoded td_wave_tick outputs (Modlock drives waves)"

# 5. Verify Modlock bundle outputs
$modJs = Join-Path $buildDir "mod.js"
$modJson = Join-Path $buildDir "mod.json"
Assert-True (Test-Path $modJs) "build/mod.js bundle exists"
Assert-True (Test-Path $modJson) "build/mod.json manifest exists"

Write-Host "=== All $passCount Tier 2 Asset & Binary KV3 Checks Passed! ===" -ForegroundColor Green
