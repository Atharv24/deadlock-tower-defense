# Lua Scripting (VScript / LuaJIT) in Deadlock

Deadlock includes Source 2's full **LuaJIT (Lua 5.1) VScript virtual machine** (`game/bin/win64/vscript.dll`) and `CCitadelVScriptGameSystem` (`game/citadel/bin/win64/server.dll`), **but retail `server.dll` hardcodes the script language to `CNopVM` (Stub VM) unless patched.**

---

## 1. Why `addon_init.lua` Does Not Execute in Unpatched Retail `server.dll`

Disassembling both `vscript.dll` and `server.dll` revealed why Lua scripts silently no-op in stock retail Deadlock:

1. **`vscript.dll` (`CScriptManager::CreateVM`, RVA `0x3E800`):**
   - Inspects the `ScriptLanguage_t` parameter (`edx`):
     - `edx == 1` (`SL_LUA`): Allocates `0x88` bytes and instantiates **`CLuaVM`** (the full LuaJIT 5.1 VM).
     - `edx == 2`: Allocates `8` bytes and instantiates **`CNopVM`** (`"VM Capture Disabled Stub"`), a dummy stub VM whose virtual methods (`Init`, `CompileScript`, `ExecuteScript`, `RegisterFunction`, etc.) all return `true` / `0` without doing anything.
2. **`server.dll` (`CCitadelVScriptGameSystem::GetScriptLanguage`, vtable slot 23 at RVA `0xBEDAF0`, file offset `0xBECF0`):**
   - Hardcoded to `B8 02 00 00 00 C3` (`mov eax, 2; ret`).
   - When `CVScriptGameSystem::VScriptInit` (`RVA 0xFDA430`) calls `this->GetScriptLanguage()`, it receives `2` (`CNopVM`) instead of `1` (`CLuaVM`).
   - As a result, `VScriptInit` logs `"VSCRIPT: Started VScript virtual machine using script language 'Lua'\n"` and calls `RunScript("init")` and `RunScript("addon_init")` on `CNopVM`, which silently succeeds without executing any Lua bytecode.

### Implications for VAC-Safe Modding
- To enable `CLuaVM` in retail Deadlock, `server.dll` at file offset `0xBECF0` (`RVA 0xBEDAF0`) would have to be patched from `B8 02 00 00 00 C3` (`mov eax, 2; ret`) to `B8 01 00 00 00 C3` (`mov eax, 1; ret`).
- **However, modifying `server.dll` is not VAC-safe.**
- For 100% VAC-safe custom modes that never modify `.dll` or `.vpk` files, use **Source 2 Entity I/O chains** (`logic_timer`, `logic_relay`, `logic_case`, `point_clientcommand`, `point_broadcastclientcommand`, and `AddOutput`) inside `.cfg` files instead of Lua VScripts.

---

## 2. How VScript Startup Works (When `CLuaVM` Is Enabled)

In `CCitadelVScriptGameSystem::GameInit` (`server.dll+0x100EF20`):
1. Calls `CVScriptGameSystem::VScriptInit` (`server.dll+0xFDA430`).
2. Executes `scripts/vscripts/init.lua` (from `core/pak01_dir.vpk`).
3. Registers C++ global functions, classes (`Entities`, `Convars`, `ParticleManager`), and enums (`reference/vscript_bindings_clean.txt`).
4. Calls `this->RunScript("addon_init", false)` (`scripts/vscripts/addon_init.lua`).

---

## 3. Reference: Extracted VScript Bindings (`server.dll`)

All C++ VScript bindings registered by `server.dll` are cataloged in [`reference/vscript_bindings_clean.txt`](file:///d:/Projects/deadlock-custom-game/reference/vscript_bindings_clean.txt), including:
- `ListenToGameEvent(eventName, callbackFn, context)`
- `EntIndexToHScript(entindex)` / `GetListenServerHost()`
- `Entities:FindAllByClassname(classname)` / `SpawnEntityFromTableSynchronous(classname, keyValuesTable)`
- `DoEntFire(targetNameOrClass, inputAction, value, delay, activator, caller)`
- `Convars:RegisterCommand(name, callbackFn, helpString, flags)` / `Convars:RegisterConvar(...)`
- `RollPercentage(chanceInt)` / `RandomInt(min, max)` / `RandomFloat(min, max)`
