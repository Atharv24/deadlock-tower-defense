# Deadlock (`citadel`) Architecture Overview

## Install & Paths
- **Install Path:** `D:\SteamLibrary\steamapps\common\Deadlock`
- **Main Mod Directory:** `game/citadel/`
- **Engine / Core Directory:** `game/core/`
- **Binaries:**
  - Engine & Tools: `game/bin/win64/` (`deadlock.exe`, `vconsole2.exe`, `resourcecompiler.dll`, `pulse_system.dll`, `vscript.dll`)
  - Game Logic: `game/citadel/bin/win64/` (`server.dll`, `client.dll`, `host.dll`)

## Asset Packaging (`pak01_dir.vpk`)
- Compiled assets live in `game/citadel/pak01_dir.vpk` (and archive chunks `pak01_000.vpk`..`pak01_325.vpk`).
- Compiled Source 2 files have `_c` suffixes (e.g., `.vdata_c`, `.vpulse_c`, `.vmap_c`) using the `RED2` binary container format and Binary KV3 (`7412167c-06e9-4698-aff2-e63eb59037e7`).
- We use [`tools/Source2Viewer-CLI.exe`](file:///d:/Projects/deadlock-custom-game/tools/Source2Viewer-CLI.exe) to decompile `_c` files into readable text KeyValues3 in [`reference/`](file:///d:/Projects/deadlock-custom-game/reference).

## Search Paths & Loose File Loading
- Configured in [`game/citadel/gameinfo.gi`](file:///D:/SteamLibrary/steamapps/common/Deadlock/game/citadel/gameinfo.gi) under `FileSystem -> SearchPaths` (`Game citadel`).
- **No `gameinfo.gi` edits needed:** Because `Game citadel` is already mounted by default:
  - Loose `.cfg` files placed in `game/citadel/cfg/` can be executed directly with `exec <name>` from console.
  - Loose `.lua` VScript files placed in `game/citadel/scripts/vscripts/` (such as `addon_init.lua`) are loaded automatically by the server's `CCitadelVScriptGameSystem` on map start or via `script_reload_code <name>`.
