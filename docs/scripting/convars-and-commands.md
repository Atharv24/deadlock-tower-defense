# Useful ConVars, Console Commands & Entity I/O

Full list of 1,629 extracted strings is in [`reference/server_citadel_strings.txt`](file:///d:/Projects/deadlock-custom-game/reference/server_citadel_strings.txt).

## 1. Match & Lane Setup
- `sv_cheats 1` — Required for spawning entities, `ent_fire`, and dev ConVars.
- `citadel_one_on_one_match 1` — Enables 1v1 match rules.
- `citadel_active_lane 4` — Activates only Mid Lane (Blue lane).
- `citadel_allow_duplicate_heroes 1` — Allows both players to pick the same hero.
- `citadel_solo_bot_match 1` — Configures match for solo player vs bot(s).
- `citadel_spawn_practice_bots 1` — Spawns practice bots.
  - **Important Timing Note:** `citadel_spawn_practice_bots_count` is evaluated **per team**. Set `citadel_spawn_practice_bots 0` during map load, and set `citadel_spawn_practice_bots 1` **after** the human player has spawned onto Team 2 so only 1 enemy bot (`Bot2`) is created.
- `citadel_spawn_practice_bots_count 1` — Number of players per team to fill with bots.
- `citadel_bot_kick <bot_name>` — Kicks a specific bot (e.g., `citadel_bot_kick Bot2`).

## 2. Economy & Troopers
- `citadel_trooper_spawn_enabled 1` — Toggle trooper wave spawning.
- `citadel_trooper_spawn_interval <sec>` — Override wave spawn interval.
- `citadel_crate_respawn_interval 0` — Disables crate respawning (`0` in `citadel_1v1_match.cfg`).
- `citadel_give_gold <amount>` — Grants souls/gold.

## 3. Spawning Pickups, Subclasses & Entities (`ent_create` vs `subclass_create`)
Disassembling the shared handler at `server.dll+0x1D42E20` revealed the critical difference between `ent_create` (`bIsSubclassCreate = 0`) and `subclass_create` (`bIsSubclassCreate = 1`):

- **`ent_create <classname_or_subclass> [{ key1 value1 key2 value2 }]`** — **Use this to spawn all world entities and `.vdata` subclasses!**
  - Has `flags = 0x00804004` (`FCVAR_CLIENT_CAN_EXECUTE | FCVAR_CHEAT | FCVAR_GAMEDLL`), so the server receives the client's player slot and crosshair trace hit position.
  - Works for `.vdata` subclasses in `scripts/misc.vdata` and `scripts/npc_units.vdata`:
    - `ent_create wp_permanent_pickup_lv3` (+6% Weapon Damage Tome)
    - `ent_create hp_permanent_pickup_lv3` (+30 Bonus Health Tome)
    - `ent_create cd_permanent_pickup_lv3` (Cooldown Reduction Tome)
    - `ent_create movespeed_permanent_pickup_lv3` (Move Speed Tome)
    - `ent_create spiritresist_permanent_pickup_lv3` (Spirit Resist Tome)
    - `ent_create bulletresist_permanent_pickup_lv3` (Bullet Resist Tome)
    - `ent_create range_permanent_pickup_lv3` (Ability Range Tome)
    - `ent_create gold_vault_pickup_250` (+250 Souls Orb)
    - `ent_create citadel_breakable_item_container` (Breakable Golden Loot Statue)
  - Also works for standard C++ designer entity classes (`logic_relay`, `logic_case`, `logic_timer`, `point_clientcommand`, `point_broadcastclientcommand`).
  - **Keyvalue Syntax (`0x1D43400`):** Additional keyvalues **must** be wrapped in `{ ... }` curly braces (e.g., `ent_create logic_relay { targetname loot_drop_relay }`); if `argv[2]` does not start with `{`, `ent_create` ignores all extra arguments.
- **`subclass_create <modifier_subclass> [ent_index]`** — **Only works for modifiers (`scripts/modifiers.vdata`, `m_nType == 2`)!**
  - At `server.dll+0x1D43179` (`cmp byte ptr [rbp+158h], 0; jnz exit`), `subclass_create` immediately exits without doing anything if the subclass is not a modifier (`m_nType != 2`).
- **`citadel_spawn_pickup` / `citadel_spawn_pickup_item`** — Registered with `flags = 0x0` (missing `FCVAR_CLIENT_CAN_EXECUTE`), so they fail when invoked from client console or keybinds on a listen server (`UTIL_GetCommandClient` returns `NULL`).

## 4. Source 2 Entity I/O (`ent_fire` & `AddOutput`)
- **`AddOutput` Delimiter Format (`CBaseEntity::InputAddOutput` at `server.dll+0x24D9180`):**
  - Source 2 `InputAddOutput` parses `>` (`0x3E`) delimiters (not spaces/commas from Source 1):
    ```text
    <output_name>><target_name>><input_name>><parameter>><delay>><max_times_to_fire>
    ```
  - Example:
    ```cfg
    ent_fire npc_trooper AddOutput OnKilled>loot_drop_relay>Trigger>>0>1
    ```
- **Useful Logic & Command Entities for `.cfg` Game Modes:**
  - `point_servercommand` (input `Command`) — Executes a console command or alias directly on the server console buffer. Does not pass through client `InputService`, so user aliases and cheat ConVars run without `FCVAR_SERVER_CAN_EXECUTE` restrictions.
  - `point_clientcommand` & `point_broadcastclientcommand` (input `Command`) — Sends client commands to the client's `InputService`. In Deadlock / Source 2, `InputService` blocks any command received from the server that lacks the `FCVAR_SERVER_CAN_EXECUTE` flag (such as user-defined `alias`es, returning `[InputService] Cannot execute concommand '...', missing required FCVAR flag`). Use `point_servercommand` instead for custom game mode scripts.
  - `logic_relay` (inputs `Trigger`, `Enable`, `Disable`, output `OnTrigger`) — Supports automatic `m_bWaitForRefire` debouncing when an `OnTrigger` output has a positive delay.
  - `logic_case` (input `PickRandom`, outputs `OnCase01`..`OnCase10`) — Chooses randomly with equal probability among all connected `OnCaseXX` outputs (connect `OnCase01` to drop and `OnCase02`..`OnCase10` to a no-drop message for an exact 10% roll).
  - `logic_timer` (keyvalue `RefireTime`, input `Enable`, output `OnTimer`) — Fires `OnTimer` periodically on the server.
