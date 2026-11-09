param(
    [string]$DeadlockDir = "D:\SteamLibrary\steamapps\common\Deadlock",
    [string]$OutVpk = (Join-Path $PSScriptRoot "build\pak20_dir.vpk")
)

$ErrorActionPreference = "Stop"
$binDir = Join-Path $DeadlockDir "game\bin\win64"
$env:PATH = "$binDir;$env:PATH"

Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Collections.Generic;
using System.Text;

public class Kv3VdataCompiler
{
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr LoadLibrary(string lpFileName);

    [DllImport("tier0.dll", EntryPoint = "??0CUtlBuffer@@QEAA@HHH@Z", CallingConvention = CallingConvention.Cdecl)]
    public static extern IntPtr CUtlBuffer_Ctor(IntPtr thisPtr, int growSize, int initSize, int flags);

    [DllImport("tier0.dll", EntryPoint = "?LoadKV3Text_NoHeader@@YA_NPEAVCKV3Arena@@PEBDAEBUKV3ID_t@@PEAVCUtlString@@1I@Z", CallingConvention = CallingConvention.Cdecl)]
    [return: MarshalAs(UnmanagedType.I1)]
    public static extern bool LoadKV3Text_NoHeader(IntPtr pArena, IntPtr pText, ref Guid formatId, IntPtr pErrorStr, string fileName, uint flags);

    [DllImport("tier0.dll", EntryPoint = "?SaveKV3@@YA_NAEBUKV3ID_t@@0PEAVCUtlBuffer@@PEBVKeyValues3@@PEAVCUtlString@@I@Z", CallingConvention = CallingConvention.Cdecl)]
    [return: MarshalAs(UnmanagedType.I1)]
    public static extern bool SaveKV3(ref Guid encodingId, ref Guid formatId, IntPtr pUtlBuf, IntPtr pKVRoot, IntPtr pErrorStr, uint flags);

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    public delegate IntPtr CKV3Arena_Ctor_Del(IntPtr thisPtr, int a2);

    public static byte[] CompileTextToKv3Binary(string resDllPath, string textPath)
    {
        IntPtr hRes = LoadLibrary(resDllPath);
        IntPtr fnCtor = IntPtr.Add(hRes, 0x405E0);
        CKV3Arena_Ctor_Del arenaCtor = (CKV3Arena_Ctor_Del)Marshal.GetDelegateForFunctionPointer(fnCtor, typeof(CKV3Arena_Ctor_Del));

        IntPtr pArena = Marshal.AllocHGlobal(8192);
        for (int i = 0; i < 8192; i++) Marshal.WriteByte(pArena, i, 0);
        arenaCtor(pArena, 0);

        byte[] textBytes = File.ReadAllBytes(textPath);
        IntPtr pText = Marshal.AllocHGlobal(textBytes.Length + 1);
        Marshal.Copy(textBytes, 0, pText, textBytes.Length);
        Marshal.WriteByte(pText, textBytes.Length, 0);

        IntPtr pErr = Marshal.AllocHGlobal(64);
        for (int i = 0; i < 64; i++) Marshal.WriteByte(pErr, i, 0);

        Guid formatId = new Guid("7412167c-06e9-4698-aff2-e63eb59037e7"); // generic
        Guid encodingId = new Guid("1b860500-f7d8-40c1-ad82-75a48267e714"); // binary

        bool loaded = LoadKV3Text_NoHeader(pArena, pText, ref formatId, pErr, textPath, 0);
        if (!loaded)
        {
            IntPtr pErrStr = Marshal.ReadIntPtr(pErr);
            string errMsg = pErrStr != IntPtr.Zero ? Marshal.PtrToStringAnsi(pErrStr) : "Unknown KV3 parse error";
            throw new Exception("LoadKV3Text_NoHeader failed for " + textPath + ": " + errMsg);
        }

        IntPtr pRoot = Marshal.ReadIntPtr(pArena, 0x10);
        IntPtr pUtlBuf = Marshal.AllocHGlobal(256);
        for (int i = 0; i < 256; i++) Marshal.WriteByte(pUtlBuf, i, 0);
        CUtlBuffer_Ctor(pUtlBuf, 0, 8 * 1024 * 1024, 0);

        bool saved = SaveKV3(ref encodingId, ref formatId, pUtlBuf, pRoot, pErr, 0);
        if (!saved)
        {
            throw new Exception("SaveKV3 failed for " + textPath);
        }

        IntPtr pOutMem = Marshal.ReadIntPtr(pUtlBuf, 0);
        int putOffset = Marshal.ReadInt32(pUtlBuf, 0x18);
        byte[] outBytes = new byte[putOffset];
        Marshal.Copy(pOutMem, outBytes, 0, putOffset);
        return outBytes;
    }

    public static byte[] RebuildVdataContainer(byte[] origContainer, byte[] newDataBlock)
    {
        uint blockOffsetRel = BitConverter.ToUInt32(origContainer, 8);
        uint blockCount = BitConverter.ToUInt32(origContainer, 12);
        int blockTablePos = 8 + (int)blockOffsetRel;

        string[] tags = new string[blockCount];
        byte[][] blocks = new byte[blockCount][];

        for (int i = 0; i < blockCount; i++)
        {
            int entryPos = blockTablePos + (i * 12);
            tags[i] = Encoding.ASCII.GetString(origContainer, entryPos, 4);
            int relOff = BitConverter.ToInt32(origContainer, entryPos + 4);
            uint size = BitConverter.ToUInt32(origContainer, entryPos + 8);
            int absOff = entryPos + 4 + relOff;

            if (tags[i] == "DATA")
            {
                blocks[i] = newDataBlock;
            }
            else
            {
                blocks[i] = new byte[size];
                Buffer.BlockCopy(origContainer, absOff, blocks[i], 0, (int)size);
            }
        }

        using (MemoryStream ms = new MemoryStream())
        using (BinaryWriter bw = new BinaryWriter(ms))
        {
            int headerAndTableSize = blockTablePos + ((int)blockCount * 12);
            bw.Write(new byte[headerAndTableSize]);

            int[] absOffsets = new int[blockCount];
            for (int i = 0; i < blockCount; i++)
            {
                while (ms.Position % 16 != 0) bw.Write((byte)0);
                absOffsets[i] = (int)ms.Position;
                bw.Write(blocks[i]);
            }

            uint totalFileSize = (uint)ms.Length;
            ms.Position = 0;
            bw.Write(totalFileSize);
            bw.Write(BitConverter.ToUInt16(origContainer, 4)); // headerVersion (12)
            bw.Write(BitConverter.ToUInt16(origContainer, 6)); // version (0)
            bw.Write(blockOffsetRel);
            bw.Write(blockCount);

            for (int i = 0; i < blockCount; i++)
            {
                int entryPos = blockTablePos + (i * 12);
                ms.Position = entryPos;
                bw.Write(Encoding.ASCII.GetBytes(tags[i]));
                int relOff = absOffsets[i] - (entryPos + 4);
                bw.Write(relOff);
                bw.Write((uint)blocks[i].Length);
            }

            return ms.ToArray();
        }
    }

    public static void PackVpk(string outVpkPath, Dictionary<string, byte[]> files)
    {
        // Organize by extension -> directory -> filename
        var tree = new Dictionary<string, Dictionary<string, Dictionary<string, byte[]>>>(StringComparer.Ordinal);
        foreach (var kvp in files)
        {
            string norm = kvp.Key.Replace('\\', '/').TrimStart('/');
            int lastSlash = norm.LastIndexOf('/');
            string dir = lastSlash >= 0 ? norm.Substring(0, lastSlash) : " ";
            string fullFile = lastSlash >= 0 ? norm.Substring(lastSlash + 1) : norm;
            int dot = fullFile.IndexOf('.');
            string fileName = dot >= 0 ? fullFile.Substring(0, dot) : fullFile;
            string ext = dot >= 0 ? fullFile.Substring(dot + 1) : " ";

            if (!tree.ContainsKey(ext)) tree[ext] = new Dictionary<string, Dictionary<string, byte[]>>(StringComparer.Ordinal);
            if (!tree[ext].ContainsKey(dir)) tree[ext][dir] = new Dictionary<string, byte[]>(StringComparer.Ordinal);
            tree[ext][dir][fileName] = kvp.Value;
        }

        using (MemoryStream dataStream = new MemoryStream())
        using (MemoryStream treeStream = new MemoryStream())
        using (BinaryWriter treeWriter = new BinaryWriter(treeStream))
        {
            foreach (var extPair in tree)
            {
                WriteNullTermString(treeWriter, extPair.Key);
                foreach (var dirPair in extPair.Value)
                {
                    WriteNullTermString(treeWriter, dirPair.Key);
                    foreach (var filePair in dirPair.Value)
                    {
                        WriteNullTermString(treeWriter, filePair.Key);
                        byte[] payload = filePair.Value;
                        uint crc = ComputeCrc32(payload);
                        uint offset = (uint)dataStream.Position;
                        uint length = (uint)payload.Length;
                        dataStream.Write(payload, 0, payload.Length);

                        treeWriter.Write(crc);
                        treeWriter.Write((ushort)0);      // PreloadBytes = 0
                        treeWriter.Write((ushort)0x7FFF); // ArchiveIndex = 0x7FFF (embedded in _dir.vpk)
                        treeWriter.Write(offset);
                        treeWriter.Write(length);
                        treeWriter.Write((ushort)0xFFFF); // Terminator
                    }
                    treeWriter.Write((byte)0); // End of files in dir
                }
                treeWriter.Write((byte)0); // End of dirs in ext
            }
            treeWriter.Write((byte)0); // End of extensions

            byte[] treeBytes = treeStream.ToArray();
            byte[] dataBytes = dataStream.ToArray();

            string outDir = Path.GetDirectoryName(outVpkPath);
            if (!Directory.Exists(outDir)) Directory.CreateDirectory(outDir);

            using (FileStream fs = new FileStream(outVpkPath, FileMode.Create, FileAccess.Write))
            using (BinaryWriter bw = new BinaryWriter(fs))
            {
                bw.Write((uint)0x55AA1234);         // Signature
                bw.Write((uint)2);                  // Version 2
                bw.Write((uint)treeBytes.Length);   // TreeSize
                bw.Write((uint)dataBytes.Length);   // FileDataSectionSize
                bw.Write((uint)0);                  // ArchiveMD5SectionSize
                bw.Write((uint)0);                  // OtherMD5SectionSize
                bw.Write((uint)0);                  // SignatureSectionSize
                bw.Write(treeBytes);
                bw.Write(dataBytes);
            }
        }
    }

    private static void WriteNullTermString(BinaryWriter bw, string s)
    {
        byte[] bytes = Encoding.ASCII.GetBytes(s);
        bw.Write(bytes);
        bw.Write((byte)0);
    }

    private static uint ComputeCrc32(byte[] data)
    {
        uint crc = 0xFFFFFFFF;
        for (int i = 0; i < data.Length; i++)
        {
            crc ^= data[i];
            for (int j = 0; j < 8; j++)
            {
                if ((crc & 1) != 0) crc = (crc >> 1) ^ 0xEDB88320;
                else crc >>= 1;
            }
        }
        return ~crc;
    }
}
"@

Write-Host "Kv3VdataCompiler initialized successfully." -ForegroundColor Cyan
