$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$scratchDir = Join-Path $repoRoot "reference\vdata_base"
if (-not (Test-Path $scratchDir)) {
    $scratchDir = "C:\Users\athar\.gemini\antigravity\brain\bc4be04f-aa74-4f2b-b4c1-e6569ea638df\scratch"
}
$buildDir = Join-Path $repoRoot "build"
$buildScriptsDir = Join-Path $buildDir "scripts"
if (-not (Test-Path $buildScriptsDir)) { New-Item -ItemType Directory -Path $buildScriptsDir -Force | Out-Null }

# 1. Patch modifiers.vdata_c.txt with Tier 1..10 Size & Strength Modifiers (Weaker Start -> Much Faster Scaling)
$modTxtPath = Join-Path $scratchDir "modifiers.vdata_c.txt"
$modTxt = [System.IO.File]::ReadAllText($modTxtPath)

$customModifiersKv3 = @"
	td_creep_size_1 = 
	{
		_class = "modifier_base"
		_my_subclass_name = "td_creep_size_1"
		m_nAttributes = "MODIFIER_ATTRIBUTE_PERMANENT | MODIFIER_ATTRIBUTE_CANNOT_BE_PURGED"
		m_bIsHidden = true
		m_vecScriptValues = 
		[
			{
				m_eModifierValue = "MODIFIER_VALUE_MODEL_SCALE"
				m_value = -0.05
			},
		]
	}
	td_creep_size_2 = 
	{
		_class = "modifier_base"
		_my_subclass_name = "td_creep_size_2"
		m_nAttributes = "MODIFIER_ATTRIBUTE_PERMANENT | MODIFIER_ATTRIBUTE_CANNOT_BE_PURGED"
		m_bIsHidden = true
		m_vecScriptValues = 
		[
			{
				m_eModifierValue = "MODIFIER_VALUE_MODEL_SCALE"
				m_value = 0.007
			},
		]
	}
	td_creep_size_3 = 
	{
		_class = "modifier_base"
		_my_subclass_name = "td_creep_size_3"
		m_nAttributes = "MODIFIER_ATTRIBUTE_PERMANENT | MODIFIER_ATTRIBUTE_CANNOT_BE_PURGED"
		m_bIsHidden = true
		m_vecScriptValues = 
		[
			{
				m_eModifierValue = "MODIFIER_VALUE_MODEL_SCALE"
				m_value = 0.007
			},
		]
	}
	td_creep_size_4 = 
	{
		_class = "modifier_base"
		_my_subclass_name = "td_creep_size_4"
		m_nAttributes = "MODIFIER_ATTRIBUTE_PERMANENT | MODIFIER_ATTRIBUTE_CANNOT_BE_PURGED"
		m_bIsHidden = true
		m_vecScriptValues = 
		[
			{
				m_eModifierValue = "MODIFIER_VALUE_MODEL_SCALE"
				m_value = 0.008
			},
		]
	}
	td_creep_size_5 = 
	{
		_class = "modifier_base"
		_my_subclass_name = "td_creep_size_5"
		m_nAttributes = "MODIFIER_ATTRIBUTE_PERMANENT | MODIFIER_ATTRIBUTE_CANNOT_BE_PURGED"
		m_bIsHidden = true
		m_vecScriptValues = 
		[
			{
				m_eModifierValue = "MODIFIER_VALUE_MODEL_SCALE"
				m_value = 0.008
			},
		]
	}
	td_creep_size_6 = 
	{
		_class = "modifier_base"
		_my_subclass_name = "td_creep_size_6"
		m_nAttributes = "MODIFIER_ATTRIBUTE_PERMANENT | MODIFIER_ATTRIBUTE_CANNOT_BE_PURGED"
		m_bIsHidden = true
		m_vecScriptValues = 
		[
			{
				m_eModifierValue = "MODIFIER_VALUE_MODEL_SCALE"
				m_value = 0.010
			},
		]
	}
	td_creep_size_7 = 
	{
		_class = "modifier_base"
		_my_subclass_name = "td_creep_size_7"
		m_nAttributes = "MODIFIER_ATTRIBUTE_PERMANENT | MODIFIER_ATTRIBUTE_CANNOT_BE_PURGED"
		m_bIsHidden = true
		m_vecScriptValues = 
		[
			{
				m_eModifierValue = "MODIFIER_VALUE_MODEL_SCALE"
				m_value = 0.010
			},
		]
	}
	td_creep_size_8 = 
	{
		_class = "modifier_base"
		_my_subclass_name = "td_creep_size_8"
		m_nAttributes = "MODIFIER_ATTRIBUTE_PERMANENT | MODIFIER_ATTRIBUTE_CANNOT_BE_PURGED"
		m_bIsHidden = true
		m_vecScriptValues = 
		[
			{
				m_eModifierValue = "MODIFIER_VALUE_MODEL_SCALE"
				m_value = 0.012
			},
		]
	}
	td_creep_size_9 = 
	{
		_class = "modifier_base"
		_my_subclass_name = "td_creep_size_9"
		m_nAttributes = "MODIFIER_ATTRIBUTE_PERMANENT | MODIFIER_ATTRIBUTE_CANNOT_BE_PURGED"
		m_bIsHidden = true
		m_vecScriptValues = 
		[
			{
				m_eModifierValue = "MODIFIER_VALUE_MODEL_SCALE"
				m_value = 0.012
			},
		]
	}
	td_creep_size_10 = 
	{
		_class = "modifier_base"
		_my_subclass_name = "td_creep_size_10"
		m_nAttributes = "MODIFIER_ATTRIBUTE_PERMANENT | MODIFIER_ATTRIBUTE_CANNOT_BE_PURGED"
		m_bIsHidden = true
		m_vecScriptValues = 
		[
			{
				m_eModifierValue = "MODIFIER_VALUE_MODEL_SCALE"
				m_value = 0.012
			},
		]
	}
	td_creep_strength_1 = 
	{
		_class = "modifier_base"
		_my_subclass_name = "td_creep_strength_1"
		m_nAttributes = "MODIFIER_ATTRIBUTE_PERMANENT | MODIFIER_ATTRIBUTE_CANNOT_BE_PURGED"
		m_bIsHidden = true
		m_vecScriptValues = 
		[
			{
				m_eModifierValue = "MODIFIER_VALUE_HEALTH_MAX"
				m_value = 0.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_HEALTH_MAX_PERCENT"
				m_value = 0.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_OUTGOING_DAMAGE_PERCENTAGE_CHANGE"
				m_value = 0.0
			},
		]
	}
	td_creep_strength_2 = 
	{
		_class = "modifier_base"
		_my_subclass_name = "td_creep_strength_2"
		m_nAttributes = "MODIFIER_ATTRIBUTE_PERMANENT | MODIFIER_ATTRIBUTE_CANNOT_BE_PURGED"
		m_bIsHidden = true
		m_vecScriptValues = 
		[
			{
				m_eModifierValue = "MODIFIER_VALUE_HEALTH_MAX"
				m_value = 1.4
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_HEALTH_MAX_PERCENT"
				m_value = 0.65
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_OUTGOING_DAMAGE_PERCENTAGE_CHANGE"
				m_value = 0.35
			},
		]
	}
	td_creep_strength_3 = 
	{
		_class = "modifier_base"
		_my_subclass_name = "td_creep_strength_3"
		m_nAttributes = "MODIFIER_ATTRIBUTE_PERMANENT | MODIFIER_ATTRIBUTE_CANNOT_BE_PURGED"
		m_bIsHidden = true
		m_vecScriptValues = 
		[
			{
				m_eModifierValue = "MODIFIER_VALUE_HEALTH_MAX"
				m_value = 3.5
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_HEALTH_MAX_PERCENT"
				m_value = 1.75
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_OUTGOING_DAMAGE_PERCENTAGE_CHANGE"
				m_value = 1.4
			},
		]
	}
	td_creep_strength_4 = 
	{
		_class = "modifier_base"
		_my_subclass_name = "td_creep_strength_4"
		m_nAttributes = "MODIFIER_ATTRIBUTE_PERMANENT | MODIFIER_ATTRIBUTE_CANNOT_BE_PURGED"
		m_bIsHidden = true
		m_vecScriptValues = 
		[
			{
				m_eModifierValue = "MODIFIER_VALUE_HEALTH_MAX"
				m_value = 6.9
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_HEALTH_MAX_PERCENT"
				m_value = 3.5
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_OUTGOING_DAMAGE_PERCENTAGE_CHANGE"
				m_value = 2.75
			},
		]
	}
	td_creep_strength_5 = 
	{
		_class = "modifier_base"
		_my_subclass_name = "td_creep_strength_5"
		m_nAttributes = "MODIFIER_ATTRIBUTE_PERMANENT | MODIFIER_ATTRIBUTE_CANNOT_BE_PURGED"
		m_bIsHidden = true
		m_vecScriptValues = 
		[
			{
				m_eModifierValue = "MODIFIER_VALUE_HEALTH_MAX"
				m_value = 12.5
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_HEALTH_MAX_PERCENT"
				m_value = 5.9
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_OUTGOING_DAMAGE_PERCENTAGE_CHANGE"
				m_value = 4.85
			},
		]
	}
	td_creep_strength_6 = 
	{
		_class = "modifier_base"
		_my_subclass_name = "td_creep_strength_6"
		m_nAttributes = "MODIFIER_ATTRIBUTE_PERMANENT | MODIFIER_ATTRIBUTE_CANNOT_BE_PURGED"
		m_bIsHidden = true
		m_vecScriptValues = 
		[
			{
				m_eModifierValue = "MODIFIER_VALUE_HEALTH_MAX"
				m_value = 20.9
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_HEALTH_MAX_PERCENT"
				m_value = 9.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_OUTGOING_DAMAGE_PERCENTAGE_CHANGE"
				m_value = 7.65
			},
		]
	}
	td_creep_strength_7 = 
	{
		_class = "modifier_base"
		_my_subclass_name = "td_creep_strength_7"
		m_nAttributes = "MODIFIER_ATTRIBUTE_PERMANENT | MODIFIER_ATTRIBUTE_CANNOT_BE_PURGED"
		m_bIsHidden = true
		m_vecScriptValues = 
		[
			{
				m_eModifierValue = "MODIFIER_VALUE_HEALTH_MAX"
				m_value = 33.4
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_HEALTH_MAX_PERCENT"
				m_value = 13.15
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_OUTGOING_DAMAGE_PERCENTAGE_CHANGE"
				m_value = 11.85
			},
		]
	}
	td_creep_strength_8 = 
	{
		_class = "modifier_base"
		_my_subclass_name = "td_creep_strength_8"
		m_nAttributes = "MODIFIER_ATTRIBUTE_PERMANENT | MODIFIER_ATTRIBUTE_CANNOT_BE_PURGED"
		m_bIsHidden = true
		m_vecScriptValues = 
		[
			{
				m_eModifierValue = "MODIFIER_VALUE_HEALTH_MAX"
				m_value = 52.1
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_HEALTH_MAX_PERCENT"
				m_value = 18.75
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_OUTGOING_DAMAGE_PERCENTAGE_CHANGE"
				m_value = 17.35
			},
		]
	}
	td_creep_strength_9 = 
	{
		_class = "modifier_base"
		_my_subclass_name = "td_creep_strength_9"
		m_nAttributes = "MODIFIER_ATTRIBUTE_PERMANENT | MODIFIER_ATTRIBUTE_CANNOT_BE_PURGED"
		m_bIsHidden = true
		m_vecScriptValues = 
		[
			{
				m_eModifierValue = "MODIFIER_VALUE_HEALTH_MAX"
				m_value = 79.9
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_HEALTH_MAX_PERCENT"
				m_value = 26.4
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_OUTGOING_DAMAGE_PERCENTAGE_CHANGE"
				m_value = 25.0
			},
		]
	}
	td_creep_strength_10 = 
	{
		_class = "modifier_base"
		_my_subclass_name = "td_creep_strength_10"
		m_nAttributes = "MODIFIER_ATTRIBUTE_PERMANENT | MODIFIER_ATTRIBUTE_CANNOT_BE_PURGED"
		m_bIsHidden = true
		m_vecScriptValues = 
		[
			{
				m_eModifierValue = "MODIFIER_VALUE_HEALTH_MAX"
				m_value = 121.5
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_HEALTH_MAX_PERCENT"
				m_value = 36.1
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_OUTGOING_DAMAGE_PERCENTAGE_CHANGE"
				m_value = 34.75
			},
		]
	}
	td_boss_hero_stats_1 = 
	{
		_class = "modifier_base"
		_my_subclass_name = "td_boss_hero_stats_1"
		m_nAttributes = "MODIFIER_ATTRIBUTE_PERMANENT | MODIFIER_ATTRIBUTE_CANNOT_BE_PURGED"
		m_bIsHidden = true
		m_vecScriptValues = 
		[
			{
				m_eModifierValue = "MODIFIER_VALUE_MODEL_SCALE"
				m_value = 0.55
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_HEALTH_MAX"
				m_value = 2500.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_HEALTH_REGEN_PER_SECOND"
				m_value = 20.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_WEAPON_DAMAGE_INCREASE"
				m_value = 100.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_TECH_POWER"
				m_value = 60.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_OUTGOING_DAMAGE_PERCENTAGE_CHANGE"
				m_value = 50.0
			},
		]
	}
	td_boss_hero_stats_2 = 
	{
		_class = "modifier_base"
		_my_subclass_name = "td_boss_hero_stats_2"
		m_nAttributes = "MODIFIER_ATTRIBUTE_PERMANENT | MODIFIER_ATTRIBUTE_CANNOT_BE_PURGED"
		m_bIsHidden = true
		m_vecScriptValues = 
		[
			{
				m_eModifierValue = "MODIFIER_VALUE_MODEL_SCALE"
				m_value = 0.90
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_HEALTH_MAX"
				m_value = 5500.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_HEALTH_REGEN_PER_SECOND"
				m_value = 35.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_WEAPON_DAMAGE_INCREASE"
				m_value = 175.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_TECH_POWER"
				m_value = 110.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_OUTGOING_DAMAGE_PERCENTAGE_CHANGE"
				m_value = 100.0
			},
		]
	}
	td_boss_hero_stats_3 = 
	{
		_class = "modifier_base"
		_my_subclass_name = "td_boss_hero_stats_3"
		m_nAttributes = "MODIFIER_ATTRIBUTE_PERMANENT | MODIFIER_ATTRIBUTE_CANNOT_BE_PURGED"
		m_bIsHidden = true
		m_vecScriptValues = 
		[
			{
				m_eModifierValue = "MODIFIER_VALUE_MODEL_SCALE"
				m_value = 1.25
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_HEALTH_MAX"
				m_value = 10000.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_HEALTH_REGEN_PER_SECOND"
				m_value = 50.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_WEAPON_DAMAGE_INCREASE"
				m_value = 250.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_TECH_POWER"
				m_value = 170.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_OUTGOING_DAMAGE_PERCENTAGE_CHANGE"
				m_value = 160.0
			},
		]
	}
	td_boss_hero_stats_4 = 
	{
		_class = "modifier_base"
		_my_subclass_name = "td_boss_hero_stats_4"
		m_nAttributes = "MODIFIER_ATTRIBUTE_PERMANENT | MODIFIER_ATTRIBUTE_CANNOT_BE_PURGED"
		m_bIsHidden = true
		m_vecScriptValues = 
		[
			{
				m_eModifierValue = "MODIFIER_VALUE_MODEL_SCALE"
				m_value = 1.60
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_HEALTH_MAX"
				m_value = 16000.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_HEALTH_REGEN_PER_SECOND"
				m_value = 70.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_WEAPON_DAMAGE_INCREASE"
				m_value = 350.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_TECH_POWER"
				m_value = 240.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_OUTGOING_DAMAGE_PERCENTAGE_CHANGE"
				m_value = 225.0
			},
		]
	}
	td_boss_hero_stats_5 = 
	{
		_class = "modifier_base"
		_my_subclass_name = "td_boss_hero_stats_5"
		m_nAttributes = "MODIFIER_ATTRIBUTE_PERMANENT | MODIFIER_ATTRIBUTE_CANNOT_BE_PURGED"
		m_bIsHidden = true
		m_vecScriptValues = 
		[
			{
				m_eModifierValue = "MODIFIER_VALUE_MODEL_SCALE"
				m_value = 1.95
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_HEALTH_MAX"
				m_value = 25000.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_HEALTH_REGEN_PER_SECOND"
				m_value = 100.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_WEAPON_DAMAGE_INCREASE"
				m_value = 500.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_TECH_POWER"
				m_value = 350.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_OUTGOING_DAMAGE_PERCENTAGE_CHANGE"
				m_value = 300.0
			},
		]
	}
	td_boss_size_step = 
	{
		_class = "modifier_base"
		_my_subclass_name = "td_boss_size_step"
		m_nAttributes = "MODIFIER_ATTRIBUTE_MULTIPLE | MODIFIER_ATTRIBUTE_PERMANENT | MODIFIER_ATTRIBUTE_CANNOT_BE_PURGED"
		m_bIsHidden = true
		m_vecScriptValues = 
		[
			{
				m_eModifierValue = "MODIFIER_VALUE_MODEL_SCALE"
				m_value = 0.35
			},
		]
	}
"@

$tomeAndGuardianModifiersKv3 = @"

	td_tome_spirit = 
	{
		_class = "modifier_base"
		_my_subclass_name = "td_tome_spirit"
		m_nAttributes = "MODIFIER_ATTRIBUTE_MULTIPLE|MODIFIER_ATTRIBUTE_PERMANENT|MODIFIER_ATTRIBUTE_CANNOT_BE_PURGED"
		m_bIsHidden = true
		m_sStartSound = soundevent:"Powerup.Pickup.Generic"
		m_vecScriptValues = 
		[
			{
				m_eModifierValue = "MODIFIER_VALUE_TECH_POWER"
				m_value = 8.0
			},
		]
	}
	td_tome_weapon_dmg = 
	{
		_class = "modifier_base"
		_my_subclass_name = "td_tome_weapon_dmg"
		m_nAttributes = "MODIFIER_ATTRIBUTE_MULTIPLE|MODIFIER_ATTRIBUTE_PERMANENT|MODIFIER_ATTRIBUTE_CANNOT_BE_PURGED"
		m_bIsHidden = true
		m_sStartSound = soundevent:"Powerup.Pickup.Generic"
		m_vecScriptValues = 
		[
			{
				m_eModifierValue = "MODIFIER_VALUE_WEAPON_DAMAGE_INCREASE"
				m_value = 10.0
			},
		]
	}
	td_tome_weapon = 
	{
		_class = "modifier_base"
		_my_subclass_name = "td_tome_weapon"
		m_nAttributes = "MODIFIER_ATTRIBUTE_MULTIPLE|MODIFIER_ATTRIBUTE_PERMANENT|MODIFIER_ATTRIBUTE_CANNOT_BE_PURGED"
		m_bIsHidden = true
		m_sStartSound = soundevent:"Powerup.Pickup.Generic"
		m_vecScriptValues = 
		[
			{
				m_eModifierValue = "MODIFIER_VALUE_WEAPON_DAMAGE_INCREASE"
				m_value = 10.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_AMMO_CLIP_SIZE_PERCENT"
				m_value = 6.0
			},
		]
	}
	td_tome_fire_rate = 
	{
		_class = "modifier_base"
		_my_subclass_name = "td_tome_fire_rate"
		m_nAttributes = "MODIFIER_ATTRIBUTE_MULTIPLE|MODIFIER_ATTRIBUTE_PERMANENT|MODIFIER_ATTRIBUTE_CANNOT_BE_PURGED"
		m_bIsHidden = true
		m_sStartSound = soundevent:"Powerup.Pickup.Generic"
		m_vecScriptValues = 
		[
			{
				m_eModifierValue = "MODIFIER_VALUE_FIRE_RATE"
				m_value = 5.0
			},
		]
	}
	td_tome_firerate = 
	{
		_class = "modifier_base"
		_my_subclass_name = "td_tome_firerate"
		m_nAttributes = "MODIFIER_ATTRIBUTE_MULTIPLE|MODIFIER_ATTRIBUTE_PERMANENT|MODIFIER_ATTRIBUTE_CANNOT_BE_PURGED"
		m_bIsHidden = true
		m_sStartSound = soundevent:"Powerup.Pickup.Generic"
		m_vecScriptValues = 
		[
			{
				m_eModifierValue = "MODIFIER_VALUE_FIRE_RATE"
				m_value = 5.0
			},
		]
	}
	td_tome_ammo = 
	{
		_class = "modifier_base"
		_my_subclass_name = "td_tome_ammo"
		m_nAttributes = "MODIFIER_ATTRIBUTE_MULTIPLE|MODIFIER_ATTRIBUTE_PERMANENT|MODIFIER_ATTRIBUTE_CANNOT_BE_PURGED"
		m_bIsHidden = true
		m_sStartSound = soundevent:"Powerup.Pickup.Generic"
		m_vecScriptValues = 
		[
			{
				m_eModifierValue = "MODIFIER_VALUE_AMMO_CLIP_SIZE_PERCENT"
				m_value = 8.0
			},
		]
	}
	td_tome_max_hp = 
	{
		_class = "modifier_base"
		_my_subclass_name = "td_tome_max_hp"
		m_nAttributes = "MODIFIER_ATTRIBUTE_MULTIPLE|MODIFIER_ATTRIBUTE_PERMANENT|MODIFIER_ATTRIBUTE_CANNOT_BE_PURGED"
		m_bIsHidden = true
		m_sStartSound = soundevent:"Powerup.Pickup.Generic"
		m_vecScriptValues = 
		[
			{
				m_eModifierValue = "MODIFIER_VALUE_HEALTH_MAX"
				m_value = 80.0
			},
		]
	}
	td_tome_hp_regen = 
	{
		_class = "modifier_base"
		_my_subclass_name = "td_tome_hp_regen"
		m_nAttributes = "MODIFIER_ATTRIBUTE_MULTIPLE|MODIFIER_ATTRIBUTE_PERMANENT|MODIFIER_ATTRIBUTE_CANNOT_BE_PURGED"
		m_bIsHidden = true
		m_sStartSound = soundevent:"Powerup.Pickup.Generic"
		m_vecScriptValues = 
		[
			{
				m_eModifierValue = "MODIFIER_VALUE_HEALTH_REGEN_PER_SECOND"
				m_value = 3.0
			},
		]
	}
	td_tome_health = 
	{
		_class = "modifier_base"
		_my_subclass_name = "td_tome_health"
		m_nAttributes = "MODIFIER_ATTRIBUTE_MULTIPLE|MODIFIER_ATTRIBUTE_PERMANENT|MODIFIER_ATTRIBUTE_CANNOT_BE_PURGED"
		m_bIsHidden = true
		m_sStartSound = soundevent:"Powerup.Pickup.Generic"
		m_vecScriptValues = 
		[
			{
				m_eModifierValue = "MODIFIER_VALUE_HEALTH_MAX"
				m_value = 80.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_HEALTH_REGEN_PER_SECOND"
				m_value = 2.0
			},
		]
	}
	td_tome_cdr = 
	{
		_class = "modifier_base"
		_my_subclass_name = "td_tome_cdr"
		m_nAttributes = "MODIFIER_ATTRIBUTE_MULTIPLE|MODIFIER_ATTRIBUTE_PERMANENT|MODIFIER_ATTRIBUTE_CANNOT_BE_PURGED"
		m_bIsHidden = true
		m_sStartSound = soundevent:"Powerup.Pickup.Generic"
		m_vecScriptValues = 
		[
			{
				m_eModifierValue = "MODIFIER_VALUE_COOLDOWN_REDUCTION_PERCENTAGE"
				m_value = 3.0
			},
		]
	}
	td_tome_cooldown = 
	{
		_class = "modifier_base"
		_my_subclass_name = "td_tome_cooldown"
		m_nAttributes = "MODIFIER_ATTRIBUTE_MULTIPLE|MODIFIER_ATTRIBUTE_PERMANENT|MODIFIER_ATTRIBUTE_CANNOT_BE_PURGED"
		m_bIsHidden = true
		m_sStartSound = soundevent:"Powerup.Pickup.Generic"
		m_vecScriptValues = 
		[
			{
				m_eModifierValue = "MODIFIER_VALUE_COOLDOWN_REDUCTION_PERCENTAGE"
				m_value = 3.0
			},
		]
	}
	td_tome_tech_range = 
	{
		_class = "modifier_base"
		_my_subclass_name = "td_tome_tech_range"
		m_nAttributes = "MODIFIER_ATTRIBUTE_MULTIPLE|MODIFIER_ATTRIBUTE_PERMANENT|MODIFIER_ATTRIBUTE_CANNOT_BE_PURGED"
		m_bIsHidden = true
		m_sStartSound = soundevent:"Powerup.Pickup.Generic"
		m_vecScriptValues = 
		[
			{
				m_eModifierValue = "MODIFIER_VALUE_TECH_RANGE_PERCENT"
				m_value = 4.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_TECH_RADIUS_PERCENT"
				m_value = 4.0
			},
		]
	}
	td_tome_range = 
	{
		_class = "modifier_base"
		_my_subclass_name = "td_tome_range"
		m_nAttributes = "MODIFIER_ATTRIBUTE_MULTIPLE|MODIFIER_ATTRIBUTE_PERMANENT|MODIFIER_ATTRIBUTE_CANNOT_BE_PURGED"
		m_bIsHidden = true
		m_sStartSound = soundevent:"Powerup.Pickup.Generic"
		m_vecScriptValues = 
		[
			{
				m_eModifierValue = "MODIFIER_VALUE_TECH_RANGE_PERCENT"
				m_value = 4.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_TECH_RADIUS_PERCENT"
				m_value = 4.0
			},
		]
	}
	td_tome_omni = 
	{
		_class = "modifier_base"
		_my_subclass_name = "td_tome_omni"
		m_nAttributes = "MODIFIER_ATTRIBUTE_MULTIPLE|MODIFIER_ATTRIBUTE_PERMANENT|MODIFIER_ATTRIBUTE_CANNOT_BE_PURGED"
		m_bIsHidden = true
		m_sStartSound = soundevent:"Powerup.Pickup.Generic"
		m_vecScriptValues = 
		[
			{
				m_eModifierValue = "MODIFIER_VALUE_TECH_POWER"
				m_value = 4.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_WEAPON_DAMAGE_INCREASE"
				m_value = 5.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_FIRE_RATE"
				m_value = 2.5
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_HEALTH_MAX"
				m_value = 40.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_COOLDOWN_REDUCTION_PERCENTAGE"
				m_value = 1.5
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_TECH_RANGE_PERCENT"
				m_value = 2.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_TECH_RADIUS_PERCENT"
				m_value = 2.0
			},
		]
	}
	td_guardian_armor_buff = 
	{
		_class = "modifier_base"
		_my_subclass_name = "td_guardian_armor_buff"
		m_nAttributes = "MODIFIER_ATTRIBUTE_MULTIPLE|MODIFIER_ATTRIBUTE_PERMANENT|MODIFIER_ATTRIBUTE_CANNOT_BE_PURGED"
		m_bIsHidden = true
		m_vecScriptValues = 
		[
			{
				m_eModifierValue = "MODIFIER_VALUE_HEALTH_MAX"
				m_value = 1200.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_HEALTH_REGEN_PER_SECOND"
				m_value = 15.0
			},
		]
	}
	td_guardian_damage_buff = 
	{
		_class = "modifier_base"
		_my_subclass_name = "td_guardian_damage_buff"
		m_nAttributes = "MODIFIER_ATTRIBUTE_MULTIPLE|MODIFIER_ATTRIBUTE_PERMANENT|MODIFIER_ATTRIBUTE_CANNOT_BE_PURGED"
		m_bIsHidden = true
		m_vecScriptValues = 
		[
			{
				m_eModifierValue = "MODIFIER_VALUE_OUTGOING_DAMAGE_PERCENTAGE_CHANGE"
				m_value = 35.0
			},
		]
	}
"@

$modInsertPos = $modTxt.LastIndexOf("}")
$modPatchedTxt = $modTxt.Substring(0, $modInsertPos) + $customModifiersKv3 + $tomeAndGuardianModifiersKv3 + "`n}`n"

# 2. Patch npc_units.vdata_c.txt with 150 HP initial stats + halved per-minute growth (1.38%/min) + Phase 4 Graves Zombies & Neutral Creeps
$npcTxtPath = Join-Path $scratchDir "npc_units.vdata_c.txt"
$npcTxt = [System.IO.File]::ReadAllText($npcTxtPath)

$npcPatchedTxt = [regex]::Replace($npcTxt, '(_class = "modifier_citadel_trooper_shrine_down_buff"\s+_my_subclass_name = "modifier_citadel_trooper_shrine_down_buff"\s+)m_flModelScale = 1\.1\s+m_flHealthScale = 1\.4\s+m_flDamageScale = 60\.0', '${1}m_flModelScale = 1.01' + "`n`t`t`t" + 'm_flHealthScale = 1.01' + "`n`t`t`t" + 'm_flDamageScale = 1.5')
$npcPatchedTxt = $npcPatchedTxt -replace 'm_flDPSPctGrowthPerMinute = 0\.0', 'm_flDPSPctGrowthPerMinute = 1.38'
$npcPatchedTxt = $npcPatchedTxt -replace 'm_flDPSPctGrowthPerMinute = 3\.0', 'm_flDPSPctGrowthPerMinute = 1.38'
$npcPatchedTxt = $npcPatchedTxt -replace 'm_flDamageGrowthPctPerMin = 0\.5', 'm_flDamageGrowthPctPerMin = 1.38'

# Set initial base health (150 HP) & base DPS of troopers and neutral creeps
$npcPatchedTxt = $npcPatchedTxt -replace 'm_nMaxHealth = 300', 'm_nMaxHealth = 150'
$npcPatchedTxt = $npcPatchedTxt -replace 'm_nMaxHealth = 350', 'm_nMaxHealth = 150'
$npcPatchedTxt = $npcPatchedTxt -replace 'm_nMaxHealth = 354', 'm_nMaxHealth = 150'
$npcPatchedTxt = $npcPatchedTxt -replace 'm_nMaxHealth = 142', 'm_nMaxHealth = 130'
$npcPatchedTxt = $npcPatchedTxt -replace 'm_nMaxHealth = 400', 'm_nMaxHealth = 180'
$npcPatchedTxt = $npcPatchedTxt -replace 'm_flBaseDPS = 28\.0', 'm_flBaseDPS = 20.0'
$npcPatchedTxt = $npcPatchedTxt -replace 'm_flBulletDamage = 36', 'm_flBulletDamage = 24'
$npcPatchedTxt = $npcPatchedTxt -replace 'm_flBulletDamage = 61\.8', 'm_flBulletDamage = 35.0'
$npcPatchedTxt = [regex]::Replace($npcPatchedTxt, '(m_eModifierValue = "MODIFIER_VALUE_BULLET_DAMAGE_REDUCTION_PERCENT"\s+m_value = )\d+(\.\d+)?', '${1}0.0')
$npcPatchedTxt = [regex]::Replace($npcPatchedTxt, '(m_eModifierValue = "MODIFIER_VALUE_ABILITY_DAMAGE_REDUCTION_PERCENT"\s+m_value = )\d+(\.\d+)?', '${1}0.0')

# Helper to transform a top-level unit block in npc_units.vdata_c.txt
function Update-UnitBlock([string]$fullText, [string]$unitName, [scriptblock]$transform) {
    $marker = "`n`t$unitName = `n`t{"
    $idx = $fullText.IndexOf($marker)
    if ($idx -lt 0) {
        $marker = "`r`n`t$unitName = `r`n`t{"
        $idx = $fullText.IndexOf($marker)
    }
    if ($idx -lt 0) { throw "Could not find unit block: $unitName" }
    $braceStart = $fullText.IndexOf("{", $idx)
    $depth = 0
    $pos = $braceStart
    while ($pos -lt $fullText.Length) {
        $c = $fullText[$pos]
        if ($c -eq '{') { $depth++ }
        elseif ($c -eq '}') {
            $depth--
            if ($depth -eq 0) {
                $blk = $fullText.Substring($braceStart, $pos + 1 - $braceStart)
                $newBlk = & $transform $blk
                return $fullText.Substring(0, $braceStart) + $newBlk + $fullText.Substring($pos + 1)
            }
        }
        $pos++
    }
    throw "Unclosed unit block: $unitName"
}

function Get-UnitBlock([string]$fullText, [string]$unitName) {
    $marker = "`n`t$unitName = `n`t{"
    $idx = $fullText.IndexOf($marker)
    if ($idx -lt 0) {
        $marker = "`r`n`t$unitName = `r`n`t{"
        $idx = $fullText.IndexOf($marker)
    }
    if ($idx -lt 0) { throw "Could not find unit block: $unitName" }
    $braceStart = $fullText.IndexOf("{", $idx)
    $depth = 0
    $pos = $braceStart
    while ($pos -lt $fullText.Length) {
        $c = $fullText[$pos]
        if ($c -eq '{') { $depth++ }
        elseif ($c -eq '}') {
            $depth--
            if ($depth -eq 0) {
                return $fullText.Substring($braceStart, $pos + 1 - $braceStart)
            }
        }
        $pos++
    }
    throw "Unclosed unit block: $unitName"
}

# 2A. Convert trooper_melee into Graves's Zombie (necro_shambler.vmdl) with navigable Guardian/Walker ranges + Corpse Explosion
$npcPatchedTxt = Update-UnitBlock $npcPatchedTxt "trooper_melee" {
    param($b)
    $b = $b -replace 'm_nMaxHealth = \d+', 'm_nMaxHealth = 413'
    $b = $b -replace 'models/npc_units/troopers/amber_trooper_01_melee/amber_trooper_01_melee\.vmdl', 'models/heroes_wip/necro/necro_shambler.vmdl'
    $b = $b -replace 'models/npc_units/troopers/sapphire_trooper_01_melee/sapphire_trooper_01_melee\.vmdl', 'models/heroes_wip/necro/necro_shambler.vmdl'
    $b = $b -replace 'm_sDefaultMaterialGroupName = "Friendly"', 'm_sDefaultMaterialGroupName = ""'
    $b = $b -replace 'm_sEnemyMaterialGroupName = "Enemy"', 'm_sEnemyMaterialGroupName = ""'
    $b = $b -replace 'm_sTeam1MaterialGroupName = "Amber"', 'm_sTeam1MaterialGroupName = ""'
    $b = $b -replace 'm_sTeam2MaterialGroupName = "Sapphire"', 'm_sTeam2MaterialGroupName = ""'
    $b = $b -replace 'm_HeadHealthChangeAmberParticle = resource_name:"[^"]*"', 'm_HeadHealthChangeAmberParticle = resource_name:""'
    $b = $b -replace 'm_HeadHealthChangeSapphireParticle = resource_name:"[^"]*"', 'm_HeadHealthChangeSapphireParticle = resource_name:""'
    $b = $b -replace 'm_DeathParticle = resource_name:"particles/trooper/trooper_death_sn\.vpcf"', 'm_DeathParticle = resource_name:"particles/abilities/necro/necro_corpse_explosion.vpcf"'
    $b = $b -replace 'm_DeathSound = soundevent:"Damage\.Receive\.Lethal\.NPC"', 'm_DeathSound = soundevent:"Necro.Shambler.Explode"'
    $b = $b -replace 'm_MeleeHitSound = soundevent:"Trooper\.Melee\.Damage\.Hit"', 'm_MeleeHitSound = soundevent:"Necro.Shambler.Explode"'
    $b = $b -replace 'm_strMeleeAttackSound = soundevent:"Trooper\.Super\.Melee\.Swing"', 'm_strMeleeAttackSound = soundevent:"Necro.Shambler.Warning"'
    $b = $b -replace 'm_MeleeSwingParticle = resource_name:"particles/npc/npc_melee_swing\.vpcf"', 'm_MeleeSwingParticle = resource_name:"particles/abilities/necro/necro_corpse_explosion.vpcf"'
    $b = $b -replace 'm_MeleeActivateParticle = resource_name:""', 'm_MeleeActivateParticle = resource_name:"particles/abilities/necro/necro_ghoul_warning.vpcf"'
    $b = $b -replace 'm_szBulletTravelTracerParticle = resource_name:"particles/weapon_fx/trooper/trooper_bullet_travel\.vpcf"', 'm_szBulletTravelTracerParticle = resource_name:""'
    $b = $b -replace 'm_szMuzzleFlashEffectName = resource_name:"particles/weapon_fx/trooper/trooper_muzzle_flash\.vpcf"', 'm_szMuzzleFlashEffectName = resource_name:""'
    $b = $b -replace 'm_strShootSound = soundevent:"TrooperRifle\.Fire"', 'm_strShootSound = soundevent:"Necro.Shambler.Explode"'
    $b = $b -replace 'particles/trooper/trooper_lob_impact\.vpcf', 'particles/abilities/necro/necro_corpse_explosion.vpcf'
    $b = $b -replace 'm_flMeleeChargeRange = 1000\.0', 'm_flMeleeChargeRange = 1600.0'
    $b = $b -replace 'm_flMeleeAttemptRange = 120', 'm_flMeleeAttemptRange = 140'
    $b = $b -replace 'm_flMeleeHitRange = 120', 'm_flMeleeHitRange = 150'
    $b = [regex]::Replace($b, '(m_VSPlayer\s*=\s*\{\s*m_flBaseDPS\s*=\s*20\.0\s*)m_flMaxRange\s*=\s*700\.0', '${1}m_flMaxRange = 140.0')
    $b = [regex]::Replace($b, '(m_VSTrooper\s*=\s*\{\s*m_flBaseDPS\s*=\s*35\.0\s*)m_flMaxRange\s*=\s*700\.0', '${1}m_flMaxRange = 140.0')
    # Keep stock navigable approach radii (472.441u Guardian, 700.0u Walker) so CNPC_Trooper NEVER skips
    # the Guardian pedestal or Walker hull to run straight to Shrines!
    $b = [regex]::Replace($b, 'm_VSWalker\s*=\s*\{[\s\S]*?\}', @"
m_VSWalker = 
		{
			m_flBaseDPS = 100.0
			m_flEndDPS = 140.0
			m_flEndDPSTimeInSeconds = 1200.0
			m_flMaxRange = 700.0
			m_flDamageResist = 80.0
		}
"@)
    $b = [regex]::Replace($b, 'm_VSGuardian\s*=\s*\{[\s\S]*?\}', @"
m_VSGuardian = 
		{
			m_flBaseDPS = 85.0
			m_flEndDPS = 125.0
			m_flEndDPSTimeInSeconds = 600.0
			m_flMaxRange = 472.441
		}
"@)
    $b = [regex]::Replace($b, 'm_VSShrine\s*=\s*\{[\s\S]*?\}', @"
m_VSShrine = 
		{
			m_flBaseDPS = 100.0
			m_flMaxRange = 350.0
		}
"@)
    $b = $b -replace 'm_bSpawnBreakablesOnDeath = true', 'm_bSpawnBreakablesOnDeath = false'
    $zombieModifiers = @"
		m_BossWeaponName = "boss"
		m_vecIntrinsicModifiers = 
		[
			subclass:
			{
				_class = "modifier_neutral_spore_aura"
				_my_subclass_name = "necro_zombie_proximity_explode"
				m_strParticleEffect = resource_name:"particles/abilities/necro/necro_ghoul_warning.vpcf"
				m_ExplodeParticle = resource_name:"particles/abilities/necro/necro_corpse_explosion.vpcf"
				m_ExplodeSound = soundevent:"Necro.Shambler.Explode"
				m_flModifierProvidedByAuraDuration = 3.0
				m_flAuraRadius = 180.0
				m_flExplodeDamage = 65.0
				m_iAuraSearchType = "CITADEL_UNIT_TARGET_ALL_ENEMY"
				m_bRemoveProvidedModifierOnAuraRemoval = false
				m_flArmTime = 0.25
				m_flDetonateTime = 0.25
				m_modifierProvidedByAura = subclass:
				{
					_class = "modifier_neutral_dot_debuff"
					_my_subclass_name = "necro_zombie_blight_debuff"
					m_bIsHidden = true
					m_flDuration = 3.0
					m_strParticleStatusEffect = resource_name:"particles/status_fx/status_fx_neutral_spore_aura_debuff.vpcf"
					m_strParticleEffect = resource_name:"particles/npc/neutrals/neutral_mushroom/neutral_spore_aura_tag_enemy.vpcf"
					m_flTickRate = 0.5
					m_flDPS = 0
					m_vecScriptValues = 
					[
						{
							m_eModifierValue = "MODIFIER_VALUE_MOVEMENT_SPEED_SLOW_PERCENT"
							m_value = 25.0
						},
					]
				}
			},
			subclass:
			{
				_class = "modifier_neutral_attack_explode_on_death"
				_my_subclass_name = "necro_zombie_explode_on_death"
				m_flExplodeDamage = 75.0
				m_flExplodeRadius = 540.0
				m_ExplodeParticle = resource_name:"particles/abilities/necro/necro_corpse_explosion.vpcf"
				m_ExplodeSound = soundevent:"Necro.Shambler.Explode"
				m_ExplodeDebuffModifier = subclass:
				{
					_class = "modifier_base"
					_my_subclass_name = "necro_zombie_explode_slow"
					m_bIsHidden = true
					m_flDuration = 3.0
					m_strParticleStatusEffect = resource_name:"particles/status_fx/status_fx_inferno_flame_dash_debuff.vpcf"
					m_strParticleEffect = resource_name:"particles/abilities/inferno/inferno_flame_dash_tag_enemy.vpcf"
					m_vecScriptValues = 
					[
						{
							m_eModifierValue = "MODIFIER_VALUE_MOVEMENT_SPEED_SLOW_PERCENT"
							m_value = 30.0
						},
					]
				}
			},
		]
		m_bSpawnBreakablesOnDeath = false
"@
    $b = $b -replace 'm_bSpawnBreakablesOnDeath = false', $zombieModifiers.Trim()
    return $b
}

# 2B. Convert trooper_medic into Library Watcher neutral creep (valid npc_neutral.vnmgraph_c, zero missing pve_underhand warnings)
$npcPatchedTxt = Update-UnitBlock $npcPatchedTxt "trooper_medic" {
    param($b)
    $b = $b -replace 'models/npc_units/troopers/amber_medic_01/amber_medic_01\.vmdl', 'models/npc_units/neutral_library_watcher_01/neutral_library_watcher_01.vmdl'
    $b = $b -replace 'models/npc_units/troopers/sapphire_medic_01/sapphire_medic_01\.vmdl', 'models/npc_units/neutral_library_watcher_01/neutral_library_watcher_01.vmdl'
    $b = $b -replace 'm_sDefaultMaterialGroupName = "FriendlyMedic"', 'm_sDefaultMaterialGroupName = "Neutral_Normal"'
    $b = $b -replace 'm_sEnemyMaterialGroupName = "EnemyMedic"', 'm_sEnemyMaterialGroupName = "Neutral_Normal"'
    $b = $b -replace 'm_sTeam1MaterialGroupName = "Amber"', 'm_sTeam1MaterialGroupName = "Neutral_Normal"'
    $b = $b -replace 'm_sTeam2MaterialGroupName = "Sapphire"', 'm_sTeam2MaterialGroupName = "Neutral_Normal"'
    $b = $b -replace 'm_HeadHealthChangeAmberParticle = resource_name:"[^"]*"', 'm_HeadHealthChangeAmberParticle = resource_name:""'
    $b = $b -replace 'm_HeadHealthChangeSapphireParticle = resource_name:"[^"]*"', 'm_HeadHealthChangeSapphireParticle = resource_name:""'
    $b = $b -replace 'm_szBulletTravelTracerParticle = resource_name:"particles/weapon_fx/trooper/trooper_bullet_travel\.vpcf"', 'm_szBulletTravelTracerParticle = resource_name:"particles/npc/neutrals/generic_neutral/neutral_small_projectile.vpcf"'
    $b = $b -replace 'm_szMuzzleFlashEffectName = resource_name:"particles/weapon_fx/trooper/trooper_muzzle_flash\.vpcf"', 'm_szMuzzleFlashEffectName = resource_name:"particles/npc/neutrals/generic_neutral/neutral_muzzle_flash_small.vpcf"'
    $b = $b -replace 'm_strShootSound = soundevent:"TrooperRifle\.Fire"', 'm_strShootSound = soundevent:"Neutral.Camp.Bullet.Fire"'
    $b = $b -replace 'm_DeathParticle = resource_name:"particles/trooper/trooper_death_sn\.vpcf"', 'm_DeathParticle = resource_name:"particles/npc/neutral_trooper_death.vpcf"'
    $b = $b -replace 'm_bSpawnBreakablesOnDeath = true', 'm_bSpawnBreakablesOnDeath = false'
    return $b
}

# 2C. Add 4 custom lane-marching neutral creep variants (_class = "npc_trooper") so waves include varied neutral creeps!
$baseMarchingNeutralBlk = Get-UnitBlock $npcPatchedTxt "trooper_medic"
function New-MarchingNeutralVariant([string]$name, [string]$modelPath, [string]$matGroup, [string]$tracerVpcf, [int]$walkSpeed) {
    $blk = $baseMarchingNeutralBlk
    $blk = $blk -replace 'models/npc_units/neutral_library_watcher_01/neutral_library_watcher_01\.vmdl', $modelPath
    $blk = $blk -replace '"Neutral_Normal"', "`"$matGroup`""
    $blk = $blk -replace 'm_TrooperType = "TROOPER_MEDIC"', 'm_TrooperType = "TROOPER_NORMAL"'
    $blk = $blk -replace 'm_MedicHealActiveParticle = resource_name:"[^"]*"', 'm_MedicHealActiveParticle = resource_name:""'
    if ($tracerVpcf -ne "") {
        $blk = $blk -replace 'particles/npc/neutrals/generic_neutral/neutral_small_projectile\.vpcf', $tracerVpcf
    }
    $blk = $blk -replace 'm_flWalkSpeed = \d+', "m_flWalkSpeed = $walkSpeed"
    return "`t$name = `n`t$blk"
}

$extraWaveNeutralsKv3 = @(
    (New-MarchingNeutralVariant "td_neutral_lantern" "models/npc_units/neutral_ct_lanterns/neutral_ct_lantern.vmdl" "Neutral_Normal" "particles/npc/neutrals/lantern/lantern_neutral_tracer.vpcf" 275),
    (New-MarchingNeutralVariant "td_neutral_puppeteer" "models/npc_units/neutral_theatre_puppeteer_02/neutral_theatre_puppeteer_02.vmdl" "Neutral_Normal" "" 255),
    (New-MarchingNeutralVariant "td_neutral_pigeon" "models/npc_units/neutral_pigeon_cerberus/neutral_pigeon_cerberus.vmdl" "Neutral_Normal" "" 290),
    (New-MarchingNeutralVariant "td_neutral_mushroom" "models/npc_units/neutral_mushroom_large_01/neutral_mushroom_large_01.vmdl" "Neutral_Strong" "" 235)
) -join "`n"

$lastNpcBrace = $npcPatchedTxt.LastIndexOf("}")
if ($lastNpcBrace -lt 0) { throw "Could not find closing brace in npc_units.vdata_c.txt" }
$npcPatchedTxt = $npcPatchedTxt.Substring(0, $lastNpcBrace) + $extraWaveNeutralsKv3 + "`n}`n"

# 2D. Keep neutral camp defaults clean
$npcPatchedTxt = $npcPatchedTxt -replace 'm_nEnabledStateMask = "MODIFIER_STATE_IGNORED_BY_NPC_TARGETING"', 'm_nEnabledStateMask = ""'
$npcPatchedTxt = $npcPatchedTxt -replace 'm_nEnabledStateMask = "MODIFIER_STATE_LOCK_ENTITY_FACING"', 'm_nEnabledStateMask = ""'
$npcPatchedTxt = $npcPatchedTxt -replace 'm_flSpawnTetherRadius = 300\.0', 'm_flSpawnTetherRadius = 1200.0'

$code = @"
using System;
using System.IO;
using System.Text;
using System.Runtime.InteropServices;

public class VDataCompiler {
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr LoadLibrary(string lpFileName);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr GetProcAddress(IntPtr hModule, string lpProcName);

    [StructLayout(LayoutKind.Sequential)]
    public struct KV3ID_t {
        public IntPtr name;
        public Guid guid;
    }

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    public delegate void CKV3Arena_Ctor_Del(IntPtr thisPtr, int flags);

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    public delegate void CUtlBuffer_Ctor_Grow_Del(IntPtr thisPtr, int growSize, int initSize, int flags);

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    public delegate byte LoadKV3Text_NoHeader_Del(IntPtr pKV, IntPtr pErrStr, [MarshalAs(UnmanagedType.LPUTF8Str)] string text, ref KV3ID_t format, string fileName, uint flags);

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    public delegate byte SaveKV3_Del(ref KV3ID_t encoding, ref KV3ID_t format, IntPtr pKV, IntPtr pErrStr, IntPtr pOutUtlBuf, uint flags);

    public static byte[] CompileKv3Data(string binDir, string text) {
        IntPtr hTier0 = LoadLibrary(binDir + "\\tier0.dll");
        IntPtr hRes = LoadLibrary(binDir + "\\resourcesystem.dll");

        var arenaCtor = Marshal.GetDelegateForFunctionPointer<CKV3Arena_Ctor_Del>(new IntPtr(hRes.ToInt64() + 0x405E0));
        var bufCtorGrow = Marshal.GetDelegateForFunctionPointer<CUtlBuffer_Ctor_Grow_Del>(GetProcAddress(hTier0, "??0CUtlBuffer@@QEAA@HHW4BufferFlags_t@0@@Z"));
        var loadText = Marshal.GetDelegateForFunctionPointer<LoadKV3Text_NoHeader_Del>(GetProcAddress(hTier0, "?LoadKV3Text_NoHeader@@YA_NPEAVKeyValues3@@PEAVCUtlString@@PEBDAEBUKV3ID_t@@2I@Z"));
        var saveKv3 = Marshal.GetDelegateForFunctionPointer<SaveKV3_Del>(GetProcAddress(hTier0, "?SaveKV3@@YA_NAEBUKV3ID_t@@0PEBVKeyValues3@@PEAVCUtlString@@PEAVCUtlBuffer@@I@Z"));

        IntPtr arena = Marshal.AllocHGlobal(16384);
        for (int i = 0; i < 16384; i++) Marshal.WriteByte(arena, i, 0);
        arenaCtor(arena, 0);
        IntPtr rootKv = new IntPtr(arena.ToInt64() + 0x78);

        IntPtr errStr = Marshal.AllocHGlobal(64);
        for (int i = 0; i < 64; i++) Marshal.WriteByte(errStr, i, 0);

        KV3ID_t fmt = new KV3ID_t();
        fmt.name = Marshal.StringToHGlobalAnsi("generic");
        fmt.guid = new Guid("7412167c-06e9-4698-aff2-e63eb59037e7");

        byte loadOk = loadText(rootKv, errStr, text, ref fmt, "vdata", 0);
        if (loadOk == 0) {
            IntPtr errPtr = Marshal.ReadIntPtr(errStr);
            throw new Exception("LoadKV3Text failed: " + (errPtr != IntPtr.Zero ? Marshal.PtrToStringAnsi(errPtr) : "unknown"));
        }

        IntPtr outBuf = Marshal.AllocHGlobal(256);
        for (int i = 0; i < 256; i++) Marshal.WriteByte(outBuf, i, 0);
        bufCtorGrow(outBuf, 0, 1048576, 0);

        KV3ID_t enc = new KV3ID_t();
        enc.name = Marshal.StringToHGlobalAnsi("binary");
        enc.guid = new Guid("1b860500-f7d8-40c1-ad82-75a48267e714");

        byte saveOk = saveKv3(ref enc, ref fmt, rootKv, errStr, outBuf, 0);
        if (saveOk == 0) {
            IntPtr errPtr = Marshal.ReadIntPtr(errStr);
            throw new Exception("SaveKV3 failed: " + (errPtr != IntPtr.Zero ? Marshal.PtrToStringAnsi(errPtr) : "unknown"));
        }

        IntPtr memPtr = Marshal.ReadIntPtr(outBuf, 0x08);
        int size = Marshal.ReadInt32(outBuf, 0x20);
        byte[] result = new byte[size];
        Marshal.Copy(memPtr, result, 0, size);
        return result;
    }

    public static byte[] RebuildVDataContainer(byte[] origBytes, byte[] newData, int dataBlockIndex) {
        int blkOff = 8 + BitConverter.ToInt32(origBytes, 8);
        int blkCnt = BitConverter.ToInt32(origBytes, 12);

        int dataEntOff = blkOff + dataBlockIndex * 12;
        int origDataOffset = (dataEntOff + 4) + BitConverter.ToInt32(origBytes, dataEntOff + 4);

        int flciEntOff = blkOff + (dataBlockIndex + 1) * 12;
        int origFlciOffset = (flciEntOff + 4) + BitConverter.ToInt32(origBytes, flciEntOff + 4);
        int origFlciLen = BitConverter.ToInt32(origBytes, flciEntOff + 8);

        int newFlciOffset = (origDataOffset + newData.Length + 15) & ~15;
        int totalLen = newFlciOffset + origFlciLen;

        byte[] outBytes = new byte[totalLen];
        Array.Copy(origBytes, 0, outBytes, 0, origDataOffset);
        Array.Copy(newData, 0, outBytes, origDataOffset, newData.Length);
        Array.Copy(origBytes, origFlciOffset, outBytes, newFlciOffset, origFlciLen);

        // Update total file size at 0x00
        Array.Copy(BitConverter.GetBytes((uint)totalLen), 0, outBytes, 0, 4);
        // Update DATA block length
        Array.Copy(BitConverter.GetBytes((uint)newData.Length), 0, outBytes, dataEntOff + 8, 4);
        // Update FLCI relative offset
        int newFlciRel = newFlciOffset - (flciEntOff + 4);
        Array.Copy(BitConverter.GetBytes(newFlciRel), 0, outBytes, flciEntOff + 4, 4);

        return outBytes;
    }

    public static byte[] RebuildLastBlockContainer(byte[] origBytes, byte[] newData, int dataBlockIndex) {
        int blkOff = 8 + BitConverter.ToInt32(origBytes, 8);
        int dataEntOff = blkOff + dataBlockIndex * 12;
        int origDataOffset = (dataEntOff + 4) + BitConverter.ToInt32(origBytes, dataEntOff + 4);
        int totalLen = origDataOffset + newData.Length;

        byte[] outBytes = new byte[totalLen];
        Array.Copy(origBytes, 0, outBytes, 0, origDataOffset);
        Array.Copy(newData, 0, outBytes, origDataOffset, newData.Length);

        // Update total file size at 0x00 and DATA block length at dataEntOff + 8
        Array.Copy(BitConverter.GetBytes((uint)totalLen), 0, outBytes, 0, 4);
        Array.Copy(BitConverter.GetBytes((uint)newData.Length), 0, outBytes, dataEntOff + 8, 4);

        return outBytes;
    }

    private static uint[] CrcTable = MakeCrcTable();
    private static uint[] MakeCrcTable() {
        uint[] t = new uint[256];
        for (uint i = 0; i < 256; i++) {
            uint c = i;
            for (int k = 0; k < 8; k++) c = ((c & 1) != 0) ? (0xEDB88320 ^ (c >> 1)) : (c >> 1);
            t[i] = c;
        }
        return t;
    }
    public static uint ComputeCrc32(byte[] data) {
        uint c = 0xFFFFFFFF;
        for (int i = 0; i < data.Length; i++) c = CrcTable[(c ^ data[i]) & 0xFF] ^ (c >> 8);
        return c ^ 0xFFFFFFFF;
    }

    private static void WriteCString(BinaryWriter bw, string s) {
        byte[] b = Encoding.UTF8.GetBytes(s);
        bw.Write(b);
        bw.Write((byte)0);
    }

    public static void BuildMultiEntryVpk(string vpkPath, string[] exts, string[] paths, string[] names, byte[][] contents) {
        using (MemoryStream msTree = new MemoryStream())
        using (BinaryWriter bwTree = new BinaryWriter(msTree)) {
            uint curOffset = 0;
            var uniqueExts = new System.Collections.Generic.List<string>();
            for (int i = 0; i < exts.Length; i++) {
                if (!uniqueExts.Contains(exts[i])) uniqueExts.Add(exts[i]);
            }
            var orderedContents = new System.Collections.Generic.List<byte[]>();
            foreach (string ext in uniqueExts) {
                WriteCString(bwTree, ext);
                var uniquePaths = new System.Collections.Generic.List<string>();
                for (int i = 0; i < exts.Length; i++) {
                    if (exts[i] == ext && !uniquePaths.Contains(paths[i])) uniquePaths.Add(paths[i]);
                }
                foreach (string p in uniquePaths) {
                    WriteCString(bwTree, p);
                    for (int i = 0; i < exts.Length; i++) {
                        if (exts[i] == ext && paths[i] == p) {
                            WriteCString(bwTree, names[i]);
                            bwTree.Write(ComputeCrc32(contents[i]));
                            bwTree.Write((ushort)0); // preload
                            bwTree.Write((ushort)0x7FFF); // embedded in _dir.vpk
                            bwTree.Write(curOffset);
                            bwTree.Write((uint)contents[i].Length);
                            bwTree.Write((ushort)0xFFFF);
                            curOffset += (uint)contents[i].Length;
                            orderedContents.Add(contents[i]);
                        }
                    }
                    bwTree.Write((byte)0); // end files in path
                }
                bwTree.Write((byte)0); // end paths in ext
            }
            bwTree.Write((byte)0); // end exts

            byte[] treeBytes = msTree.ToArray();
            using (FileStream fs = new FileStream(vpkPath, FileMode.Create, FileAccess.Write))
            using (BinaryWriter bw = new BinaryWriter(fs)) {
                bw.Write((uint)0x55AA1234);
                bw.Write((uint)2);
                bw.Write((uint)treeBytes.Length);
                bw.Write(curOffset);
                bw.Write((uint)0);
                bw.Write((uint)0);
                bw.Write((uint)0);
                bw.Write(treeBytes);
                foreach (byte[] chunk in orderedContents) {
                    bw.Write(chunk);
                }
            }
        }
    }
}
"@

Add-Type -TypeDefinition $code
$binDir = "D:\SteamLibrary\steamapps\common\Deadlock\game\bin\win64"

Write-Output "Compiling modifiers.vdata_c..."
$modDataBin = [VDataCompiler]::CompileKv3Data($binDir, $modPatchedTxt)
$modOrigBytes = [System.IO.File]::ReadAllBytes((Join-Path $scratchDir "modifiers.vdata_c"))
$modOutBytes = [VDataCompiler]::RebuildVDataContainer($modOrigBytes, $modDataBin, 1)
$modOutPath = Join-Path $buildScriptsDir "modifiers.vdata_c"
[System.IO.File]::WriteAllBytes($modOutPath, $modOutBytes)
Write-Output "Wrote $modOutPath ($($modOutBytes.Length) bytes)."

Write-Output "Compiling npc_units.vdata_c..."
$npcDataBin = [VDataCompiler]::CompileKv3Data($binDir, $npcPatchedTxt)
$npcOrigBytes = [System.IO.File]::ReadAllBytes((Join-Path $scratchDir "npc_units.vdata_c"))
$npcOutBytes = [VDataCompiler]::RebuildVDataContainer($npcOrigBytes, $npcDataBin, 2)
$npcOutPath = Join-Path $buildScriptsDir "npc_units.vdata_c"
[System.IO.File]::WriteAllBytes($npcOutPath, $npcOutBytes)
Write-Output "Wrote $npcOutPath ($($npcOutBytes.Length) bytes)."

# Include Midtown minimap material aliases for hl_defense and dl_defense so the minimap canvas renders cleanly
$minimapBasePath = Join-Path $scratchDir "materials\minimap\dl_midtown.vmat_c"
$minimapBytes = [System.IO.File]::ReadAllBytes($minimapBasePath)
$buildMinimapDir = Join-Path $buildDir "td_panorama_overrides\minimap"
if (-not (Test-Path $buildMinimapDir)) { New-Item -ItemType Directory -Path $buildMinimapDir -Force | Out-Null }
[System.IO.File]::WriteAllBytes((Join-Path $buildMinimapDir "hl_defense.vmat_c"), $minimapBytes)
[System.IO.File]::WriteAllBytes((Join-Path $buildMinimapDir "dl_defense.vmat_c"), $minimapBytes)

# Patch hud.vcss_c and hud_minimap.vcss_c in-place so citadel_hero_testing_enabled 1 (needed for T5 Legendary shop items)
# never collapses #minimap_persp, #ObjectivesMap, .midImage, #canvas, or .map_button on hl_defense / dl_defense (zero JS timer flicker!).
function Patch-AsciiBytesInPlace([byte[]]$buf, [string]$target, [string]$replacement) {
    $targetAscii = [System.Text.Encoding]::ASCII.GetBytes($target)
    $replaceAscii = [System.Text.Encoding]::ASCII.GetBytes($replacement)
    if ($targetAscii.Length -ne $replaceAscii.Length) {
        throw "In-place ASCII patch byte-length mismatch: '$target' ($($targetAscii.Length)) vs '$replacement' ($($replaceAscii.Length))"
    }
    $count = 0
    for ($i = 0; $i -le ($buf.Length - $targetAscii.Length); $i++) {
        $matched = $true
        for ($j = 0; $j -lt $targetAscii.Length; $j++) {
            if ($buf[$i + $j] -ne $targetAscii[$j]) {
                $matched = $false
                break
            }
        }
        if ($matched) {
            [Array]::Copy($replaceAscii, 0, $buf, $i, $replaceAscii.Length)
            $count++
            $i += $replaceAscii.Length - 1
        }
    }
    return $count
}

$buildPanoramaStylesDir = Join-Path $buildDir "td_panorama_overrides\styles"
if (-not (Test-Path $buildPanoramaStylesDir)) { New-Item -ItemType Directory -Path $buildPanoramaStylesDir -Force | Out-Null }

$hudCssBasePath = Join-Path $scratchDir "panorama\styles\hud.vcss_c"
$hudCssBytes = [System.IO.File]::ReadAllBytes($hudCssBasePath)
$hudPatchCount = Patch-AsciiBytesInPlace $hudCssBytes ".connectedToHeroTesting:not(.isDefaultMap)" ".connectedToHeroTestXng:not(.isDefaultMap)"
if ($hudPatchCount -lt 2) { throw "Expected >= 2 .connectedToHeroTesting:not(.isDefaultMap) rules in hud.vcss_c, patched $hudPatchCount" }
$hudCssOutPath = Join-Path $buildPanoramaStylesDir "hud.vcss_c"
[System.IO.File]::WriteAllBytes($hudCssOutPath, $hudCssBytes)
Write-Output "Wrote $hudCssOutPath ($($hudCssBytes.Length) bytes, patched $hudPatchCount rules)."

$hudMinimapCssBasePath = Join-Path $scratchDir "panorama\styles\hud_minimap.vcss_c"
$hudMinimapCssBytes = [System.IO.File]::ReadAllBytes($hudMinimapCssBasePath)
$cssPatchCount = Patch-AsciiBytesInPlace $hudMinimapCssBytes ".connectedToHeroTesting:not(.isDefaultMap)" ".connectedToHeroTestXng:not(.isDefaultMap)"
if ($cssPatchCount -lt 3) { throw "Expected >= 3 .connectedToHeroTesting:not(.isDefaultMap) rules in hud_minimap.vcss_c, patched $cssPatchCount" }
$midtownClassPatchCount = Patch-AsciiBytesInPlace $hudMinimapCssBytes ".dl_midtown" ".HudMinimap"
if ($midtownClassPatchCount -ne 6) { throw "Expected 6 .dl_midtown rules in hud_minimap.vcss_c, patched $midtownClassPatchCount" }
$hudMinimapCssOutPath = Join-Path $buildPanoramaStylesDir "hud_minimap.vcss_c"
[System.IO.File]::WriteAllBytes($hudMinimapCssOutPath, $hudMinimapCssBytes)
Write-Output "Wrote $hudMinimapCssOutPath ($($hudMinimapCssBytes.Length) bytes, patched $cssPatchCount heroTesting + $midtownClassPatchCount layer rules)."

# Compile patched necro_shambler.vnmgraph_c so Graves zombies (trooper_melee) start directly in MOVEMENT -> Walk_Loop
# and read omnidirectional move_speed (node 12) instead of getting trapped in Spawn (forward_speed <= 1.0)!
function Update-GraphNode([string]$graphTxt, [int]$nodeIdx, [scriptblock]$mutator) {
    $needle = "m_nNodeIdx = $nodeIdx"
    $m = [regex]::Match($graphTxt, "(?m)^\s*m_nNodeIdx = $nodeIdx\s*$")
    if (-not $m.Success) { throw "Could not find $needle in necro_shambler.vnmgraph_c.txt" }
    $openIdx = $graphTxt.LastIndexOf("{", $m.Index)
    if ($openIdx -lt 0) { throw "Could not find opening brace for $needle" }
    $depth = 0
    $closeIdx = -1
    for ($k = $openIdx; $k -lt $graphTxt.Length; $k++) {
        $ch = $graphTxt[$k]
        if ($ch -eq '{') { $depth++ }
        elseif ($ch -eq '}') {
            $depth--
            if ($depth -eq 0) { $closeIdx = $k; break }
        }
    }
    if ($closeIdx -lt 0) { throw "Could not find closing brace for $needle" }
    $origBlock = $graphTxt.Substring($openIdx, $closeIdx - $openIdx + 1)
    $newBlock = & $mutator $origBlock
    if ($newBlock -eq $origBlock) { throw "Update-GraphNode made no changes on $needle" }
    return $graphTxt.Substring(0, $openIdx) + $newBlock + $graphTxt.Substring($closeIdx + 1)
}

Write-Output "Compiling necro_shambler.vnmgraph_c..."
$shamblerTxtPath = Join-Path $scratchDir "animgraphs\animgraph2\hero\necro\necro_shambler.vnmgraph_c.txt"
$shamblerPatchedTxt = [System.IO.File]::ReadAllText($shamblerTxtPath)
$shamblerPatchedTxt = Update-GraphNode $shamblerPatchedTxt 17 { param($b) $b -replace 'm_nDefaultStateIndex = 0', 'm_nDefaultStateIndex = 1' }
$shamblerPatchedTxt = Update-GraphNode $shamblerPatchedTxt 19 { param($b) $b -replace 'm_bAllowLooping = true', 'm_bAllowLooping = false' }
$shamblerPatchedTxt = Update-GraphNode $shamblerPatchedTxt 91 { param($b) $b -replace 'm_flComparisonValue = 1\.0', 'm_flComparisonValue = 99999.0' }
$fwdMatches = ([regex]::Matches($shamblerPatchedTxt, '\bm_nInputValueNodeIdx = 9\b')).Count
if ($fwdMatches -ne 11) { throw "Expected 11 m_nInputValueNodeIdx = 9 occurrences in necro_shambler.vnmgraph_c.txt, found $fwdMatches" }
$shamblerPatchedTxt = [regex]::Replace($shamblerPatchedTxt, '\bm_nInputValueNodeIdx = 9\b', 'm_nInputValueNodeIdx = 12')

$shamblerDataBin = [VDataCompiler]::CompileKv3Data($binDir, $shamblerPatchedTxt)
$shamblerOrigBytes = [System.IO.File]::ReadAllBytes((Join-Path $scratchDir "animgraphs\animgraph2\hero\necro\necro_shambler.vnmgraph_c"))
$shamblerOutBytes = [VDataCompiler]::RebuildLastBlockContainer($shamblerOrigBytes, $shamblerDataBin, 2)
$buildShamblerDir = Join-Path $buildDir "td_panorama_overrides\animgraphs\animgraph2\hero\necro"
if (-not (Test-Path $buildShamblerDir)) { New-Item -ItemType Directory -Path $buildShamblerDir -Force | Out-Null }
$shamblerOutPath = Join-Path $buildShamblerDir "necro_shambler.vnmgraph_c"
[System.IO.File]::WriteAllBytes($shamblerOutPath, $shamblerOutBytes)
Write-Output "Wrote $shamblerOutPath ($($shamblerOutBytes.Length) bytes)."

$pak20Path = Join-Path $buildDir "pak20_dir.vpk"
[VDataCompiler]::BuildMultiEntryVpk(
    $pak20Path,
    @("vdata_c", "vdata_c", "vmat_c", "vmat_c", "vcss_c", "vcss_c", "vnmgraph_c"),
    @("scripts", "scripts", "materials/minimap", "materials/minimap", "panorama/styles", "panorama/styles", "animgraphs/animgraph2/hero/necro"),
    @("modifiers", "npc_units", "dl_defense", "hl_defense", "hud", "hud_minimap", "necro_shambler"),
    @($modOutBytes, $npcOutBytes, $minimapBytes, $minimapBytes, $hudCssBytes, $hudMinimapCssBytes, $shamblerOutBytes)
)
Write-Output "Wrote $pak20Path ($((Get-Item $pak20Path).Length) bytes)."
