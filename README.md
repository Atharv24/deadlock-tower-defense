# Deadlock Custom Game Workspace

This workspace contains extracted reference data, tools, and custom game mode scripts for **Deadlock** (`D:\SteamLibrary\steamapps\common\Deadlock`).

## Directory Structure

- `tools/` — Contains `Source2Viewer-CLI.exe` (ValveResourceFormat v20.1) for decompiling and inspecting `.vpk`, `.vdata_c`, `.vpulse_c`, and other Source 2 assets.
- `reference/` — Decompiled human-readable game data from Deadlock's `pak01_dir.vpk`:
  - `reference/scripts/generic_data.vdata` — Core game rules, economy, objective rewards, item shop groups, and **Street Brawl** (`m_StreetBrawl`) round-based parameters.
  - `reference/scripts/heroes.vdata` — Hero stats, base attributes, starting stats, and ability loadouts.
  - `reference/scripts/abilities.vdata` — All hero abilities and shop items/upgrades (~18 MB).
  - `reference/scripts/modifiers.vdata` — Status effects and modifiers.
  - `reference/scripts/npc_units.vdata` — Troopers, Guardians, Walkers, Patrons, and neutral creeps.
  - `reference/scripts/misc.vdata` — Breakables, powerup spawners, runes, and soul orbs.
  - `reference/pulse/maps/dl_midtown.vpulse` — Pulse visual script logic for Midtown (`OnStreetBrawlEnterState`, `OnGameStateChanged`, spawn brushes).
  - `reference/resource/game.gameevents` — Networked and server game events (`player_death`, `player_hurt`, `street_brawl_state_changed`, etc.).
  - `reference/server_citadel_strings.txt` — All 1,629 `citadel_*` ConVars, commands, and entity class names extracted from `server.dll`.
  - `reference/vscript_bindings_clean.txt` — Global Lua / VScript API functions, classes, and enums bound in `server.dll`.
- `src/` — Source files for our custom game mode (`src/cfg/*.cfg` and `src/vscripts/addon_init.lua`), deployed as loose files without modifying any stock game files.
- `deploy.ps1` — Installs or cleans up loose custom `.cfg` and `.lua` files (`.\deploy.ps1 -Action Clean` before Ranked).
