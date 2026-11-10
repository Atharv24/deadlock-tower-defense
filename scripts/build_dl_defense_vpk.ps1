$ErrorActionPreference = "Stop"

$srcVpk = "D:\SteamLibrary\steamapps\common\Deadlock\game\citadel\maps\dl_midtown.vpk"
$newEntsPath = "C:\Users\athar\.gemini\antigravity\brain\bc4be04f-aa74-4f2b-b4c1-e6569ea638df\scratch\dl_defense_default_ents.vents_c"
$worldVrmanPath = "C:\Users\athar\.gemini\antigravity\brain\bc4be04f-aa74-4f2b-b4c1-e6569ea638df\scratch\world.vrman_c"
$physVrmanPath = "C:\Users\athar\.gemini\antigravity\brain\bc4be04f-aa74-4f2b-b4c1-e6569ea638df\scratch\world_physics.vrman_c"
$vmapPath = "C:\Users\athar\.gemini\antigravity\brain\bc4be04f-aa74-4f2b-b4c1-e6569ea638df\scratch\dl_midtown.vmap_c"
$buildDir = "d:\Projects\deadlock-custom-game\build"
if (-not (Test-Path $buildDir)) { New-Item -ItemType Directory -Path $buildDir -Force | Out-Null }
$mapsDir = "d:\Projects\deadlock-custom-game\maps"
if (-not (Test-Path $mapsDir)) { New-Item -ItemType Directory -Path $mapsDir -Force | Out-Null }
$dstVpk = Join-Path $buildDir "dl_defense.vpk"
$dstHlVpk = Join-Path $mapsDir "hl_defense.vpk"

$code = @"
using System;
using System.IO;
using System.Text;
using System.Collections.Generic;

public class VpkPatcher2 {
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

    public static ulong CalcResourceHash(string s) {
        byte[] data = Encoding.ASCII.GetBytes(s);
        uint m = 0x5BD1E995;
        uint h1 = 0xEDABCDEF ^ (uint)data.Length;
        uint h2 = 0;
        int pos = 0;
        int len = data.Length;
        while (len >= 8) {
            uint k1 = BitConverter.ToUInt32(data, pos);
            uint k2 = BitConverter.ToUInt32(data, pos + 4);
            pos += 8; len -= 8;
            k1 *= m; k1 ^= k1 >> 24; k1 *= m; h1 *= m; h1 ^= k1;
            k2 *= m; k2 ^= k2 >> 24; k2 *= m; h2 *= m; h2 ^= k2;
        }
        if (len >= 4) {
            uint k1 = BitConverter.ToUInt32(data, pos);
            pos += 4; len -= 4;
            k1 *= m; k1 ^= k1 >> 24; k1 *= m; h1 *= m; h1 ^= k1;
        }
        if (len == 3) { h2 ^= (uint)data[pos + 2] << 16; h2 ^= (uint)data[pos + 1] << 8; h2 ^= data[pos]; h2 *= m; }
        else if (len == 2) { h2 ^= (uint)data[pos + 1] << 8; h2 ^= data[pos]; h2 *= m; }
        else if (len == 1) { h2 ^= data[pos]; h2 *= m; }
        h1 ^= h2 >> 18; h1 *= m;
        h2 ^= h1 >> 22; h2 *= m;
        h1 ^= h2 >> 17; h1 *= m;
        h2 ^= h1 >> 19; h2 *= m;
        return ((ulong)h1 << 32) | (ulong)h2;
    }

    public static void ReplaceAsciiInPlace(byte[] buf, string fromStr, string toStr) {
        byte[] f = Encoding.ASCII.GetBytes(fromStr);
        byte[] t = Encoding.ASCII.GetBytes(toStr);
        if (f.Length != t.Length) throw new Exception("Length mismatch");
        for (int i = 0; i <= buf.Length - f.Length; i++) {
            bool m = true;
            for (int j = 0; j < f.Length; j++) {
                if (buf[i + j] != f[j]) { m = false; break; }
            }
            if (m) {
                Array.Copy(t, 0, buf, i, t.Length);
                i += f.Length - 1;
            }
        }
    }

    private static string ReadCString(byte[] buf, ref int pos) {
        int start = pos;
        while (buf[pos] != 0) pos++;
        string s = Encoding.UTF8.GetString(buf, start, pos - start);
        pos++;
        return s;
    }

    public static void BuildDefenseVpk(string srcVpkPath, string newEntsPath, string worldVrmanPath, string physVrmanPath, string vmapPath, string mapName, string dstVpkPath) {
        if (mapName.Length != 10) throw new Exception("mapName must be 10 characters to match dl_midtown");
        byte[] newEnts = File.ReadAllBytes(newEntsPath);
        uint newEntsCrc = ComputeCrc32(newEnts);

        // Patch world.vrman_c
        byte[] worldVrman = File.ReadAllBytes(worldVrmanPath);
        Array.Copy(BitConverter.GetBytes(CalcResourceHash("maps/" + mapName + "/world.vwrld")), 0, worldVrman, 0x40, 8);
        Array.Copy(BitConverter.GetBytes(CalcResourceHash("maps/" + mapName + "/world_physics.vrman")), 0, worldVrman, 0x50, 8);
        Array.Copy(BitConverter.GetBytes(CalcResourceHash("maps/" + mapName + "/world_visibility.vvis")), 0, worldVrman, 0x60, 8);
        ReplaceAsciiInPlace(worldVrman, "dl_midtown", mapName);
        uint worldVrmanCrc = ComputeCrc32(worldVrman);

        // Patch world_physics.vrman_c
        byte[] physVrman = File.ReadAllBytes(physVrmanPath);
        Array.Copy(BitConverter.GetBytes(CalcResourceHash("maps/" + mapName + "/world_physics.vmdl")), 0, physVrman, 0x40, 8);
        ReplaceAsciiInPlace(physVrman, "dl_midtown", mapName);
        uint physVrmanCrc = ComputeCrc32(physVrman);

        // Patch dl_midtown.vmap_c RERL entries [984..989]
        byte[] vmap = File.ReadAllBytes(vmapPath);
        string[] vmapNewPaths = new string[] {
            "maps/" + mapName + "/pve_nav_cache.vdata",
            "maps/" + mapName + "/world.vrman",
            "maps/" + mapName + "/world.vwrld",
            "maps/" + mapName + "/world_physics.vmdl",
            "maps/" + mapName + "/world_physics.vrman",
            "maps/" + mapName + "/world_visibility.vvis"
        };
        for (int k = 0; k < 6; k++) {
            int idx = 984 + k;
            int entryOff = 0x40 + idx * 16;
            int strRel = BitConverter.ToInt32(vmap, entryOff + 8);
            int strPos = entryOff + 8 + strRel;
            ulong newHash = CalcResourceHash(vmapNewPaths[k]);
            Array.Copy(BitConverter.GetBytes(newHash), 0, vmap, entryOff, 8);
            byte[] newStrBytes = Encoding.ASCII.GetBytes(vmapNewPaths[k]);
            Array.Copy(newStrBytes, 0, vmap, strPos, newStrBytes.Length);
        }
        uint vmapCrc = ComputeCrc32(vmap);

        using (FileStream fsIn = new FileStream(srcVpkPath, FileMode.Open, FileAccess.Read, FileShare.Read, 16 * 1024 * 1024))
        using (BinaryReader br = new BinaryReader(fsIn)) {
            uint sig = br.ReadUInt32();
            uint ver = br.ReadUInt32();
            uint treeSize = br.ReadUInt32();
            uint fileDataSize = br.ReadUInt32();
            uint archiveMd5Size = br.ReadUInt32();
            uint otherMd5Size = br.ReadUInt32();
            uint sigSize = br.ReadUInt32();

            byte[] tree = br.ReadBytes((int)treeSize);
            int pos = 0;
            int renamedTopCount = 0;
            int renamedDirCount = 0;
            bool patchedEnts = false;
            bool patchedWorldVrman = false;
            bool patchedPhysVrman = false;
            bool patchedVmap = false;

            uint offEnts = fileDataSize;
            uint offWorldVrman = offEnts + (uint)newEnts.Length;
            uint offPhysVrman = offWorldVrman + (uint)worldVrman.Length;
            uint offVmap = offPhysVrman + (uint)physVrman.Length;
            uint newFileDataSize = offVmap + (uint)vmap.Length;

            while (pos < tree.Length) {
                string ext = ReadCString(tree, ref pos);
                if (ext.Length == 0) break;
                while (pos < tree.Length) {
                    int pathStart = pos;
                    string path = ReadCString(tree, ref pos);
                    if (path.Length == 0) break;

                    if (path == "maps/dl_midtown") {
                        byte[] replPath = Encoding.UTF8.GetBytes("maps/" + mapName);
                        Array.Copy(replPath, 0, tree, pathStart, replPath.Length);
                        renamedDirCount++;
                    }

                    while (pos < tree.Length) {
                        int nameStart = pos;
                        string name = ReadCString(tree, ref pos);
                        if (name.Length == 0) break;

                        if (path == "maps" && name.StartsWith("dl_midtown")) {
                            byte[] repl = Encoding.UTF8.GetBytes(mapName);
                            Array.Copy(repl, 0, tree, nameStart, repl.Length);
                            renamedTopCount++;
                        }

                        int metaPos = pos;
                        uint crc = BitConverter.ToUInt32(tree, pos); pos += 4;
                        ushort preload = BitConverter.ToUInt16(tree, pos); pos += 2;
                        ushort archIdx = BitConverter.ToUInt16(tree, pos); pos += 2;
                        uint offset = BitConverter.ToUInt32(tree, pos); pos += 4;
                        uint len = BitConverter.ToUInt32(tree, pos); pos += 4;
                        ushort term = BitConverter.ToUInt16(tree, pos); pos += 2;
                        pos += preload;

                        if (path == "maps/dl_midtown/entities" && name == "default_ents" && ext == "vents_c") {
                            Array.Copy(BitConverter.GetBytes(newEntsCrc), 0, tree, metaPos, 4);
                            Array.Copy(BitConverter.GetBytes(offEnts), 0, tree, metaPos + 8, 4);
                            Array.Copy(BitConverter.GetBytes((uint)newEnts.Length), 0, tree, metaPos + 12, 4);
                            patchedEnts = true;
                        }
                        else if (path == "maps/dl_midtown" && name == "world" && ext == "vrman_c") {
                            Array.Copy(BitConverter.GetBytes(worldVrmanCrc), 0, tree, metaPos, 4);
                            Array.Copy(BitConverter.GetBytes(offWorldVrman), 0, tree, metaPos + 8, 4);
                            Array.Copy(BitConverter.GetBytes((uint)worldVrman.Length), 0, tree, metaPos + 12, 4);
                            patchedWorldVrman = true;
                        }
                        else if (path == "maps/dl_midtown" && name == "world_physics" && ext == "vrman_c") {
                            Array.Copy(BitConverter.GetBytes(physVrmanCrc), 0, tree, metaPos, 4);
                            Array.Copy(BitConverter.GetBytes(offPhysVrman), 0, tree, metaPos + 8, 4);
                            Array.Copy(BitConverter.GetBytes((uint)physVrman.Length), 0, tree, metaPos + 12, 4);
                            patchedPhysVrman = true;
                        }
                        else if (path == "maps" && name == "dl_midtown" && ext == "vmap_c") {
                            Array.Copy(BitConverter.GetBytes(vmapCrc), 0, tree, metaPos, 4);
                            Array.Copy(BitConverter.GetBytes(offVmap), 0, tree, metaPos + 8, 4);
                            Array.Copy(BitConverter.GetBytes((uint)vmap.Length), 0, tree, metaPos + 12, 4);
                            patchedVmap = true;
                        }
                    }
                }
            }

            if (!patchedEnts || !patchedWorldVrman || !patchedPhysVrman || !patchedVmap) {
                throw new Exception("Missing expected VPK entries during patch!");
            }
            Console.WriteLine("[" + mapName + "] Renamed " + renamedTopCount + " top-level files, " + renamedDirCount + " maps/" + mapName + " dir entries, and patched default_ents.vents_c + world.vrman_c + world_physics.vrman_c + " + mapName + ".vmap_c.");

            using (FileStream fsOut = new FileStream(dstVpkPath, FileMode.Create, FileAccess.Write, FileShare.None, 16 * 1024 * 1024))
            using (BinaryWriter bw = new BinaryWriter(fsOut)) {
                bw.Write(sig);
                bw.Write(ver);
                bw.Write(treeSize);
                bw.Write(newFileDataSize);
                bw.Write((uint)0);
                bw.Write((uint)0);
                bw.Write((uint)0);
                bw.Write(tree);

                byte[] copyBuf = new byte[16 * 1024 * 1024];
                long remaining = fileDataSize;
                while (remaining > 0) {
                    int toRead = (int)Math.Min(copyBuf.Length, remaining);
                    int read = fsIn.Read(copyBuf, 0, toRead);
                    if (read <= 0) throw new EndOfStreamException();
                    fsOut.Write(copyBuf, 0, read);
                    remaining -= read;
                }

                fsOut.Write(newEnts, 0, newEnts.Length);
                fsOut.Write(worldVrman, 0, worldVrman.Length);
                fsOut.Write(physVrman, 0, physVrman.Length);
                fsOut.Write(vmap, 0, vmap.Length);
            }
        }
    }
}
"@

Add-Type -TypeDefinition $code
Write-Output "Building $dstVpk..."
[VpkPatcher2]::BuildDefenseVpk($srcVpk, $newEntsPath, $worldVrmanPath, $physVrmanPath, $vmapPath, "dl_defense", $dstVpk)
Write-Output "Successfully built $dstVpk ($((Get-Item $dstVpk).Length) bytes)."

Write-Output "Building $dstHlVpk..."
[VpkPatcher2]::BuildDefenseVpk($srcVpk, $newEntsPath, $worldVrmanPath, $physVrmanPath, $vmapPath, "hl_defense", $dstHlVpk)
Write-Output "Successfully built $dstHlVpk ($((Get-Item $dstHlVpk).Length) bytes)."
