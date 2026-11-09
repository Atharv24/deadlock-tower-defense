$ErrorActionPreference = "Stop"

$srcTxtPath = "C:\Users\athar\.gemini\antigravity\brain\bc4be04f-aa74-4f2b-b4c1-e6569ea638df\scratch\dl_midtown_default_ents.vents_c.txt"
$dstTxtPath = "C:\Users\athar\.gemini\antigravity\brain\bc4be04f-aa74-4f2b-b4c1-e6569ea638df\scratch\dl_defense_default_ents.vents_c.txt"
$origBinPath = "C:\Users\athar\.gemini\antigravity\brain\bc4be04f-aa74-4f2b-b4c1-e6569ea638df\scratch\dl_midtown_default_ents.vents_c"
$dstBinPath = "C:\Users\athar\.gemini\antigravity\brain\bc4be04f-aa74-4f2b-b4c1-e6569ea638df\scratch\dl_defense_default_ents.vents_c"

Write-Output "Reading $srcTxtPath..."
$text = [System.IO.File]::ReadAllText($srcTxtPath)

# Helper to find the entity values block { ... } containing "compile_source_id = <id>"
function Get-EntityValuesBlock([string]$fullText, [int]$compileId) {
    $marker = "compile_source_id = $compileId`n"
    $idx = $fullText.IndexOf($marker)
    if ($idx -lt 0) {
        $marker = "compile_source_id = $compileId`r`n"
        $idx = $fullText.IndexOf($marker)
    }
    if ($idx -lt 0) { throw "Could not find compile_source_id = $compileId" }
    $valStart = $fullText.LastIndexOf("values = ", $idx)
    $braceStart = $fullText.IndexOf("{", $valStart)
    # Find matching closing brace for values = { ... }
    $depth = 0
    $pos = $braceStart
    while ($pos -lt $fullText.Length) {
        $c = $fullText[$pos]
        if ($c -eq '{') { $depth++ }
        elseif ($c -eq '}') {
            $depth--
            if ($depth -eq 0) {
                return [PSCustomObject]@{
                    Start = $braceStart
                    End = $pos + 1
                    Length = ($pos + 1 - $braceStart)
                    Content = $fullText.Substring($braceStart, $pos + 1 - $braceStart)
                }
            }
        }
        $pos++
    }
    throw "Unclosed brace for compile_source_id = $compileId"
}

function Replace-EntityValuesBlock([ref]$fullTextRef, [int]$compileId, [scriptblock]$transform) {
    $blk = Get-EntityValuesBlock $fullTextRef.Value $compileId
    $newContent = & $transform $blk.Content
    $fullTextRef.Value = $fullTextRef.Value.Substring(0, $blk.Start) + $newContent + $fullTextRef.Value.Substring($blk.End)
}

# 1A. Convert Team 2 Center Lane (Lane 4) Friendly Blue T1 Guardian spawner (compile_source_id = 14019)
# directly into npc_trooper_boss (subclass_name = "npc_boss_tier1") so our Friendly Blue T1 Guardian
# spawns at [0.0, -1792.0, 384.0] WITHOUT registering an empty-wave info_super_trooper_spawn.
Replace-EntityValuesBlock ([ref]$text) 14019 {
    param($c)
    $c = $c -replace 'targetname = ""', 'targetname = "[PR#]boss_rebel_t1_blue"'
    $c = $c -replace 'classname = "info_super_trooper_spawn"', "LagCompensate = true`n`t`t`t`t`tspawnflags = `"1024`"`n`t`t`t`t`tsubclass_name = `"npc_boss_tier1`"`n`t`t`t`t`tclassname = `"npc_trooper_boss`""
    return $c
}
Write-Output "Converted compile_source_id = 14019 (boss_rebel_t1_blue) to direct npc_trooper_boss (subclass_name = npc_boss_tier1) in Center Lane."

# 1B. Disable all remaining Team 2 (Amber) info_super_trooper_spawn (14015, 14016, 14290, 14299, 14300)
# and all 12 Team 2 info_trooper_spawn (14291..14298, 14301..14304) so 0 friendly lane creeps spawn
# and no Team 2 info_super_trooper_spawn ever calls SpawnWave with 0 trooper spawners.
$team2DisableIds = @(14015, 14016, 14290, 14299, 14300, 14291, 14292, 14293, 14294, 14295, 14296, 14297, 14298, 14301, 14302, 14303, 14304)
foreach ($id in $team2DisableIds) {
    Replace-EntityValuesBlock ([ref]$text) $id {
        param($c)
        $c = $c -replace 'classname = "info_(?:super_)?trooper_spawn"', 'classname = "info_target_server_only"'
        return $c
    }
}
Write-Output "Disabled $($team2DisableIds.Count) Team 2 (Amber) super/trooper spawners."

# 2. Disable all Team 3 (Sapphire) Lane 1 (Yellow) and Lane 6 (Purple) info_super_trooper_spawn (14017, 14018, 14323, 14324)
# and info_trooper_spawn (14051, 14052, 14054, 14316, 14317, 14320, 14321, 14322).
# This leaves ONLY Team 3's Center Lane (Lane 4) super spawners (14020, 14325) and all 4 of their trooper spawners (14053, 14315, 14318, 14319) active!
$team3SideLanesDisableIds = @(14017, 14018, 14323, 14324, 14051, 14052, 14054, 14316, 14317, 14320, 14321, 14322)
foreach ($id in $team3SideLanesDisableIds) {
    Replace-EntityValuesBlock ([ref]$text) $id {
        param($c)
        $c = $c -replace 'classname = "info_(?:super_)?trooper_spawn"', 'classname = "info_target_server_only"'
        return $c
    }
}
Write-Output "Disabled $($team3SideLanesDisableIds.Count) Team 3 side-lane (Lane 1 & Lane 6) super/trooper spawners."

# 3. Relocate all info_team_spawn entities (Team 2: 14288, 14289, 14329, 14424, 14425, 14426; Team 1: 14047; Team 3: 14308..14313)
# to the Center Lane surface [0.0, -1950.0, 390.0] right behind our Friendly Blue T1 Guardian ([0.0, -1792.0, 384.0])
# facing North [0.0, 90.0, 0.0] in Center Lane (LaneNum = "4") instead of inside the subterranean Mid-Boss pit.
$teamSpawnIds = @(14047, 14288, 14289, 14329, 14424, 14425, 14426, 14308, 14309, 14310, 14311, 14312, 14313)
foreach ($id in $teamSpawnIds) {
    Replace-EntityValuesBlock ([ref]$text) $id {
        param($c)
        $c = $c -replace 'origin = \[[^\]]+\]', 'origin = [ 0.0, -1950.0, 390.0 ]'
        $c = $c -replace 'angles = \[[^\]]+\]', 'angles = [ 0.0, 90.0, 0.0 ]'
        $c = $c -replace 'LaneNum = "\d+"', 'LaneNum = "4"'
        return $c
    }
}
Write-Output "Relocated all $($teamSpawnIds.Count) info_team_spawn entities to Center Lane surface [0.0, -1950.0, 390.0]."

# 4. Disable the 6 point_template entities and their basketball_hoop.vpulse / souls_dealer.vpulse callers
# so CPointTemplate never attempts to spawn nonresident child-lump props (e.g. caution_tape_02.vmdl) at Curtime=2.03s.
$text = [regex]::Replace($text, 'm_childLumps\s*=\s*\[[^\]]*\]', "m_childLumps = `n`t[`n`t]")
$text = $text -replace 'classname = "point_template"', 'classname = "info_target_server_only"'
$text = [regex]::Replace($text, '(graph_def = resource_name:"pulse/maps/prefabs/gameplay/(?:souls_dealer|basketball_hoop)\.vpulse"[\s\S]{1,200}?)classname = "point_pulse"', '$1classname = "info_target_server_only"')
Write-Output "Disabled point_template and souls_dealer/basketball_hoop point_pulse entities."

# 5. Add point_servercommand and logic_auto:
# - Runs exec td_postload at 1.0s
# - Runs exec td_wave_tick every 20s via [PR#]td_servercmd (zero FCVAR warnings)
$waveTickConnections = ""
for ($w = 1; $w -le 90; $w++) {
    $delay = "{0:F1}" -f ($w * 20.0)
    $waveTickConnections += @"
				{
					m_outputName = "OnMapSpawn"
					m_targetType = 7
					m_targetName = "[PR#]td_servercmd"
					m_inputName = "Command"
					m_overrideParam = "exec td_wave_tick"
					m_flDelay = $delay
					m_nTimesToFire = 1
					m_paramMap = null
				},

"@
}

$autoEnts = @"
		{
			m_connections = [  ]
			m_keyValuesData = #[  ]
			keyValues3Data = 
			{
				version = 1
				values = 
				{
					targetname = "[PR#]td_servercmd"
					classname = "point_servercommand"
					origin = [ 0.0, 0.0, 500.0 ]
					angles = [ 0.0, 0.0, 0.0 ]
					scales = [ 1.0, 1.0, 1.0 ]
				}
				attributes = 
				{
				}
			}
		},
		{
			m_connections = 
			[
				{
					m_outputName = "OnMapSpawn"
					m_targetType = 7
					m_targetName = "[PR#]td_servercmd"
					m_inputName = "Command"
					m_overrideParam = "exec td_postload"
					m_flDelay = 1.0
					m_nTimesToFire = 1
					m_paramMap = null
				},
$waveTickConnections			]
			m_keyValuesData = #[  ]
			keyValues3Data = 
			{
				version = 1
				values = 
				{
					spawnflags = 1
					classname = "logic_auto"
					origin = [ 0.0, 0.0, 500.0 ]
					angles = [ 0.0, 0.0, 0.0 ]
					scales = [ 1.0, 1.0, 1.0 ]
				}
				attributes = 
				{
				}
			}
		},
"@

$insertPos = $text.LastIndexOf("`t]")
$text = $text.Substring(0, $insertPos) + $autoEnts + "`n" + $text.Substring($insertPos)

[System.IO.File]::WriteAllText($dstTxtPath, $text)
Write-Output "Saved patched KV3 text to $dstTxtPath ($($text.Length) chars)."

# 6. Compile KV3 text to binary using tier0.dll + resourcesystem.dll
$code = @"
using System;
using System.Runtime.InteropServices;

public class Kv3EntsCompiler {
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

    public static byte[] CompileKv3Text(string binDir, string text) {
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

        byte loadOk = loadText(rootKv, errStr, text, ref fmt, "vents", 0);
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
}
"@

Add-Type -TypeDefinition $code
Write-Output "Compiling KV3 binary..."
$kv3Bin = [Kv3EntsCompiler]::CompileKv3Text("D:\SteamLibrary\steamapps\common\Deadlock\game\bin\win64", $text)
Write-Output "Compiled KV3 DATA size: $($kv3Bin.Length) bytes"

# Rebuild vents_c container preserving header + RERL + RED2 up to DATA offset 0x28A0
$origBytes = [System.IO.File]::ReadAllBytes($origBinPath)
$dataOffset = 0x28A0
$outBytes = New-Object byte[] ($dataOffset + $kv3Bin.Length)
[Array]::Copy($origBytes, 0, $outBytes, 0, $dataOffset)
[Array]::Copy($kv3Bin, 0, $outBytes, $dataOffset, $kv3Bin.Length)

# Update total file size at 0x00 and DATA block size at 0x30 (3rd block entry: 0x10 + 2*12 + 8 = 0x30)
[Array]::Copy([BitConverter]::GetBytes([uint32]$outBytes.Length), 0, $outBytes, 0, 4)
[Array]::Copy([BitConverter]::GetBytes([uint32]$kv3Bin.Length), 0, $outBytes, 0x30, 4)

[System.IO.File]::WriteAllBytes($dstBinPath, $outBytes)
Write-Output "Wrote $dstBinPath ($($outBytes.Length) bytes)"
