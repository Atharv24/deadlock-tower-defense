# VConsole2 TCP Protocol (`vconcomm.dll`)

Deadlock's engine (`engine2.dll` + `vconcomm.dll`) runs a local TCP server on `127.0.0.1` on a dynamic port (or `29000` in some Source 2 configurations).
- [`tools/controller.ps1`](file:///d:/Projects/deadlock-custom-game/tools/controller.ps1) automatically detects the exact listening port owned by `deadlock.exe` via `Get-NetTCPConnection -State Listen`.

## Packet Format (Big-Endian Header)
Every message sent or received over the VConsole2 socket starts with a **12-byte header**:
- `0..3` (4 bytes, ASCII): Chunk Type (`CMND`, `PRNT`, `AINF`, `ADON`, `CHAN`, `CVAR`, `PING`, `PONG`)
  - *Note:* In memory on little-endian x86, these appear reversed (`DNMC`, `TNRP`, `FNIA`, `NODA`, `NAHC`, `RAVC`). On the wire, they are 4-char ASCII (`C`,`M`,`N`,`D`).
- `4..7` (uint32 Big-Endian): Protocol Version (`0x00D40000` / `212`)
- `8..11` (uint32 Big-Endian): Total packet length in bytes (including the 12-byte header, so `12 + payload.Length`)
- `12..N`: Payload bytes

## Key Message Types
1. **`CMND` (Client -> Game):** Executes a console command string!
   - Payload: Null-terminated ASCII/UTF-8 command string (e.g., `"citadel_spawn_pickup_item\0"`).
2. **`PRNT` (Game -> Client):** Console log output from the game.
   - Header (12 bytes) + Channel ID / Color info (16 bytes) + Null-terminated log message string.
   - Because the server prints combat/event logs to console (or we can toggle verbose logging), an external script can read `PRNT` packets in real time and respond with `CMND` packets!

## Why This Matters for Our Custom Mode
Without needing to copy files into `D:\SteamLibrary\...` or inject C++ DLLs:
1. A lightweight PowerShell/Node/C# controller in our workspace connects to `127.0.0.1:29000`.
2. It automatically sends the Phase 1 setup commands (`citadel_one_on_one_match 1`, `citadel_active_lane 4`, `ent_fire trigger_item_shop Disable`, etc.).
3. For Phase 3 (10% creep item drop), it can monitor game events / trooper deaths and automatically send `citadel_spawn_pickup_item`!
