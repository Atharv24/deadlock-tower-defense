$ErrorActionPreference = "Stop"

$scratchDir = "C:\Users\athar\.gemini\antigravity\brain\bc4be04f-aa74-4f2b-b4c1-e6569ea638df\scratch"
$buildDir = "d:\Projects\deadlock-custom-game\build"
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
				m_value = 17.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_HEALTH_MAX_PERCENT"
				m_value = 8.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_OUTGOING_DAMAGE_PERCENTAGE_CHANGE"
				m_value = 4.0
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
				m_value = 42.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_HEALTH_MAX_PERCENT"
				m_value = 21.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_OUTGOING_DAMAGE_PERCENTAGE_CHANGE"
				m_value = 17.0
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
				m_value = 83.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_HEALTH_MAX_PERCENT"
				m_value = 42.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_OUTGOING_DAMAGE_PERCENTAGE_CHANGE"
				m_value = 33.0
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
				m_value = 150.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_HEALTH_MAX_PERCENT"
				m_value = 71.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_OUTGOING_DAMAGE_PERCENTAGE_CHANGE"
				m_value = 58.0
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
				m_value = 250.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_HEALTH_MAX_PERCENT"
				m_value = 108.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_OUTGOING_DAMAGE_PERCENTAGE_CHANGE"
				m_value = 92.0
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
				m_value = 400.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_HEALTH_MAX_PERCENT"
				m_value = 158.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_OUTGOING_DAMAGE_PERCENTAGE_CHANGE"
				m_value = 142.0
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
				m_value = 625.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_HEALTH_MAX_PERCENT"
				m_value = 225.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_OUTGOING_DAMAGE_PERCENTAGE_CHANGE"
				m_value = 208.0
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
				m_value = 958.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_HEALTH_MAX_PERCENT"
				m_value = 317.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_OUTGOING_DAMAGE_PERCENTAGE_CHANGE"
				m_value = 300.0
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
				m_value = 1458.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_HEALTH_MAX_PERCENT"
				m_value = 433.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_OUTGOING_DAMAGE_PERCENTAGE_CHANGE"
				m_value = 417.0
			},
		]
	}
"@

$modInsertPos = $modTxt.LastIndexOf("}")
$modPatchedTxt = $modTxt.Substring(0, $modInsertPos) + $customModifiersKv3 + "`n}`n"

# 2. Patch npc_units.vdata_c.txt with 150 HP initial stats + 5x reduced per-minute growth (16.6%/min) + Phase 4 Graves Zombies & Neutral Creeps
$npcTxtPath = Join-Path $scratchDir "npc_units.vdata_c.txt"
$npcTxt = [System.IO.File]::ReadAllText($npcTxtPath)

$npcPatchedTxt = [regex]::Replace($npcTxt, '(_class = "modifier_citadel_trooper_shrine_down_buff"\s+_my_subclass_name = "modifier_citadel_trooper_shrine_down_buff"\s+)m_flModelScale = 1\.1\s+m_flHealthScale = 1\.4\s+m_flDamageScale = 60\.0', '${1}m_flModelScale = 1.02' + "`n`t`t`t" + 'm_flHealthScale = 1.05' + "`n`t`t`t" + 'm_flDamageScale = 5.0')
$npcPatchedTxt = $npcPatchedTxt -replace 'm_flDPSPctGrowthPerMinute = 0\.0', 'm_flDPSPctGrowthPerMinute = 16.6'
$npcPatchedTxt = $npcPatchedTxt -replace 'm_flDPSPctGrowthPerMinute = 3\.0', 'm_flDPSPctGrowthPerMinute = 16.6'
$npcPatchedTxt = $npcPatchedTxt -replace 'm_flDamageGrowthPctPerMin = 0\.5', 'm_flDamageGrowthPctPerMin = 16.6'

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

# 2A. Convert trooper_melee into Graves's Zombie (necro_shambler.vmdl) so every wave spawns Graves's zombies charging down Center Lane with troopers
$npcPatchedTxt = Update-UnitBlock $npcPatchedTxt "trooper_melee" {
    param($b)
    $b = $b -replace 'models/npc_units/troopers/amber_trooper_01_melee/amber_trooper_01_melee\.vmdl', 'models/heroes_wip/necro/necro_shambler.vmdl'
    $b = $b -replace 'models/npc_units/troopers/sapphire_trooper_01_melee/sapphire_trooper_01_melee\.vmdl', 'models/heroes_wip/necro/necro_shambler.vmdl'
    $b = $b -replace 'm_sDefaultMaterialGroupName = "Friendly"', 'm_sDefaultMaterialGroupName = ""'
    $b = $b -replace 'm_sEnemyMaterialGroupName = "Enemy"', 'm_sEnemyMaterialGroupName = ""'
    $b = $b -replace 'm_sTeam1MaterialGroupName = "Amber"', 'm_sTeam1MaterialGroupName = ""'
    $b = $b -replace 'm_sTeam2MaterialGroupName = "Sapphire"', 'm_sTeam2MaterialGroupName = ""'
    $b = $b -replace 'm_DeathParticle = resource_name:"particles/trooper/trooper_death_sn\.vpcf"', 'm_DeathParticle = resource_name:"particles/abilities/necro/necro_ghoul_death.vpcf"'
    $b = $b -replace 'm_DeathSound = soundevent:"Damage\.Receive\.Lethal\.NPC"', 'm_DeathSound = soundevent:"Necro.Shambler.Destroy"'
    $b = $b -replace 'm_bSpawnBreakablesOnDeath = true', 'm_bSpawnBreakablesOnDeath = false'
    return $b
}

# 2B. Convert trooper_medic into a marching Neutral Creep (neutral_underhand_01.vmdl) so every wave squad includes a Neutral Creep alongside Troopers & Graves's Zombies
$npcPatchedTxt = Update-UnitBlock $npcPatchedTxt "trooper_medic" {
    param($b)
    $b = $b -replace 'models/npc_units/troopers/amber_medic_01/amber_medic_01\.vmdl', 'models/npc_units/neutral_underhand_01/neutral_underhand_01.vmdl'
    $b = $b -replace 'models/npc_units/troopers/sapphire_medic_01/sapphire_medic_01\.vmdl', 'models/npc_units/neutral_underhand_01/neutral_underhand_01.vmdl'
    $b = $b -replace 'm_sDefaultMaterialGroupName = "FriendlyMedic"', 'm_sDefaultMaterialGroupName = "Neutral_Normal"'
    $b = $b -replace 'm_sEnemyMaterialGroupName = "EnemyMedic"', 'm_sEnemyMaterialGroupName = "Neutral_Normal"'
    $b = $b -replace 'm_sTeam1MaterialGroupName = "Amber"', 'm_sTeam1MaterialGroupName = "Neutral_Normal"'
    $b = $b -replace 'm_sTeam2MaterialGroupName = "Sapphire"', 'm_sTeam2MaterialGroupName = "Neutral_Normal"'
    $b = $b -replace 'm_szBulletTravelTracerParticle = resource_name:"particles/weapon_fx/trooper/trooper_bullet_travel\.vpcf"', 'm_szBulletTravelTracerParticle = resource_name:"particles/npc/neutrals/generic_neutral/neutral_small_projectile.vpcf"'
    $b = $b -replace 'm_szMuzzleFlashEffectName = resource_name:"particles/weapon_fx/trooper/trooper_muzzle_flash\.vpcf"', 'm_szMuzzleFlashEffectName = resource_name:"particles/npc/neutrals/generic_neutral/neutral_muzzle_flash_small.vpcf"'
    $b = $b -replace 'm_strShootSound = soundevent:"TrooperRifle\.Fire"', 'm_strShootSound = soundevent:"Neutral.Camp.Bullet.Fire"'
    $b = $b -replace 'm_DeathParticle = resource_name:"particles/trooper/trooper_death_sn\.vpcf"', 'm_DeathParticle = resource_name:"particles/npc/neutral_trooper_death.vpcf"'
    $b = $b -replace 'm_bSpawnBreakablesOnDeath = true', 'm_bSpawnBreakablesOnDeath = false'
    return $b
}

# 2C. Make neutral camp creeps (npc_trooper_neutral) active in Center Lane (larger tether radius, not ignored by NPC targeting, unlocked facing)
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

    public static void BuildSingleVpk(string vpkPath, string[] names, byte[][] contents) {
        using (MemoryStream msTree = new MemoryStream())
        using (BinaryWriter bwTree = new BinaryWriter(msTree)) {
            WriteCString(bwTree, "vdata_c");
            WriteCString(bwTree, "scripts");
            uint curOffset = 0;
            for (int i = 0; i < names.Length; i++) {
                WriteCString(bwTree, names[i]);
                bwTree.Write(ComputeCrc32(contents[i]));
                bwTree.Write((ushort)0); // preload
                bwTree.Write((ushort)0x7FFF); // embedded in _dir.vpk
                bwTree.Write(curOffset);
                bwTree.Write((uint)contents[i].Length);
                bwTree.Write((ushort)0xFFFF);
                curOffset += (uint)contents[i].Length;
            }
            bwTree.Write((byte)0); // end files in path
            bwTree.Write((byte)0); // end paths in ext
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
                for (int i = 0; i < contents.Length; i++) {
                    bw.Write(contents[i]);
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

$pak20Path = Join-Path $buildDir "pak20_dir.vpk"
[VDataCompiler]::BuildSingleVpk($pak20Path, @("modifiers", "npc_units"), @($modOutBytes, $npcOutBytes))
Write-Output "Wrote $pak20Path ($((Get-Item $pak20Path).Length) bytes)."
