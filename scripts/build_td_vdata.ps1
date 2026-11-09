$ErrorActionPreference = "Stop"

$scratchDir = "C:\Users\athar\.gemini\antigravity\brain\bc4be04f-aa74-4f2b-b4c1-e6569ea638df\scratch"
$buildDir = "d:\Projects\deadlock-custom-game\build"
$buildScriptsDir = Join-Path $buildDir "scripts"
if (-not (Test-Path $buildScriptsDir)) { New-Item -ItemType Directory -Path $buildScriptsDir -Force | Out-Null }

# 1. Patch modifiers.vdata_c.txt with Tier 1..5 Size & Strength Modifiers
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
				m_value = 0.125
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
				m_value = 0.175
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
				m_value = 0.225
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
				m_value = 0.275
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
				m_value = 0.325
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
				m_value = 3.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_HEALTH_MAX_PERCENT"
				m_value = 0.4
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_OUTGOING_DAMAGE_PERCENTAGE_CHANGE"
				m_value = 2.5
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
				m_value = 4.5
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_HEALTH_MAX_PERCENT"
				m_value = 0.5
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_OUTGOING_DAMAGE_PERCENTAGE_CHANGE"
				m_value = 3.75
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
				m_value = 7.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_HEALTH_MAX_PERCENT"
				m_value = 0.75
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_OUTGOING_DAMAGE_PERCENTAGE_CHANGE"
				m_value = 5.0
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
				m_value = 10.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_HEALTH_MAX_PERCENT"
				m_value = 1.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_OUTGOING_DAMAGE_PERCENTAGE_CHANGE"
				m_value = 7.5
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
				m_value = 15.0
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_HEALTH_MAX_PERCENT"
				m_value = 1.5
			},
			{
				m_eModifierValue = "MODIFIER_VALUE_OUTGOING_DAMAGE_PERCENTAGE_CHANGE"
				m_value = 10.0
			},
		]
	}
"@

$modInsertPos = $modTxt.LastIndexOf("}")
$modPatchedTxt = $modTxt.Substring(0, $modInsertPos) + $customModifiersKv3 + "`n}`n"

# 2. Patch npc_units.vdata_c.txt with halved scaling values
$npcTxtPath = Join-Path $scratchDir "npc_units.vdata_c.txt"
$npcTxt = [System.IO.File]::ReadAllText($npcTxtPath)

$npcPatchedTxt = [regex]::Replace($npcTxt, '(_class = "modifier_citadel_trooper_shrine_down_buff"\s+_my_subclass_name = "modifier_citadel_trooper_shrine_down_buff"\s+)m_flModelScale = 1\.1\s+m_flHealthScale = 1\.4\s+m_flDamageScale = 60\.0', '${1}m_flModelScale = 1.075' + "`n`t`t`t" + 'm_flHealthScale = 1.02' + "`n`t`t`t" + 'm_flDamageScale = 3.0')
$npcPatchedTxt = $npcPatchedTxt -replace 'm_flDPSPctGrowthPerMinute = 0\.0', 'm_flDPSPctGrowthPerMinute = 2.25'
$npcPatchedTxt = $npcPatchedTxt -replace 'm_flDPSPctGrowthPerMinute = 3\.0', 'm_flDPSPctGrowthPerMinute = 2.25'

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
