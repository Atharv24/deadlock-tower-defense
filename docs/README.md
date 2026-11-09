# Deadlock Modding Knowledge Base

Brief, human-readable reference documentation built as we reverse-engineer and develop our custom game mode.

## Structure

- [`architecture/overview.md`](file:///d:/Projects/deadlock-custom-game/docs/architecture/overview.md) — Deadlock (`citadel`) file layout, VPK structure, and how assets/addons are mounted.
- [`architecture/vconsole-protocol.md`](file:///d:/Projects/deadlock-custom-game/docs/architecture/vconsole-protocol.md) — How to automate Deadlock in real time over TCP (`127.0.0.1:29000`) via the VConsole2 (`CMND` / `PRNT`) protocol.
- [`data/vdata-files.md`](file:///d:/Projects/deadlock-custom-game/docs/data/vdata-files.md) — Guide to `scripts/*.vdata` files (`generic_data`, `misc`, `npc_units`, `modifiers`, `heroes`, `abilities`).
- [`gameplay/lanes-and-modes.md`](file:///d:/Projects/deadlock-custom-game/docs/gameplay/lanes-and-modes.md) — How lanes (`1`, `4`, `6`), 1v1, bot matches, and Street Brawl work.
- [`gameplay/shops-and-items.md`](file:///d:/Projects/deadlock-custom-game/docs/gameplay/shops-and-items.md) — How item shops, item tiers, and world item pickups (`citadel_pickup_item`) work.
- [`scripting/convars-and-commands.md`](file:///d:/Projects/deadlock-custom-game/docs/scripting/convars-and-commands.md) — Useful `citadel_*` ConVars, console commands, and entity inputs (`ent_fire`).
- [`scripting/lua-vscript.md`](file:///d:/Projects/deadlock-custom-game/docs/scripting/lua-vscript.md) — How Deadlock's LuaJIT VScript engine (`vscript.dll`, `addon_init.lua`) works and its global Lua API.
- [`scripting/pulse-and-events.md`](file:///d:/Projects/deadlock-custom-game/docs/scripting/pulse-and-events.md) — How Pulse visual scripts (`.vpulse`) and `game.gameevents` hook into server logic.
