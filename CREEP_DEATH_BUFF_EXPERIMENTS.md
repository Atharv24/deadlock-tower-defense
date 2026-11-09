# Creep-Death Buff / Tome Experiments (`phase3-cp1` – `phase3-cp5`)

This document records all approaches we tested to grant direct-to-player permanent stat buffs ("Tomes" / "Boons") in Deadlock without modifying game binaries (`server.dll`), including what worked, what didn't work, and the underlying engine reasons discovered via `server.dll` disassembly.

---

## Summary Table

| Approach | Git Tag | Mechanism | Result | Why It Worked / Failed |
| :--- | :--- | :--- | :--- | :--- |
| **1. Custom VData Modifiers + Console Grant** | `phase3-cp1`<br>`phase3-cp2` | Compile `td_tome_*` (`modifier_base` with `MODIFIER_ATTRIBUTE_MULTIPLE \| MODIFIER_ATTRIBUTE_PERMANENT`) into `modifiers.vdata_c` (`pak20_dir.vpk`) and grant via `subclass_create td_tome_*; addmodifier td_tome_*` | **Worked 100%** | `addmodifier` and `subclass_create` execute cleanly on the local player hero from `point_servercommand -> exec <cfg>` and stack indefinitely when `MODIFIER_ATTRIBUTE_MULTIPLE` is set. |
| **2. Direct `npc_trooper` `OnDeath` -> `logic_relay` -> `point_servercommand`** | `phase3-cp3` | Periodically run `ent_fire npc_trooper AddOutput OnDeath>[PR#]td_tome_gate>Trigger>>0>1` and have `[PR#]td_tome_gate` run `exec td_grant_tome` | **Partially Worked (Fired on death, but noisy)** | `OnDeath` DOES fire when `npc_trooper` dies, **but**:<br>1. `OnDeath` fires regardless of who killed the trooper (including Friendly Towers/Walkers).<br>2. Periodic `AddOutput OnDeath` every 4s stacks duplicate `OnDeath` connections onto surviving creeps, causing a single creep death to fire multiple times and advance multiple steps in a `.cfg` probability counter. |
| **3. `OnDamagedByPlayer` Gate Window on `npc_trooper`** | `phase3-cp4` | Start `[PR#]td_tome_gate` disabled (`StartDisabled = true`), hook `OnDamagedByPlayer>[PR#]td_tome_gate>Enable>>0>-1` on `npc_trooper`, and disable 1.0s later | **Failed (0 Tomes Granted)** | In `server.dll`, `m_OnDamagedByPlayer` (`offset 0x1078`) is only fired in `CAI_BaseNPC::OnTakeDamage_Alive` (`0x607FB3`). Deadlock's `CAI_CitadelNPC` / `CNPC_Trooper` overrides `OnTakeDamage_Alive` (`0xD3E620`) and **never calls** `CAI_BaseNPC::OnTakeDamage_Alive`. Thus `OnDamagedByPlayer` never fires on Deadlock troopers. |
| **4. `OnDeath` -> `filter_activator_name` (`OnFail`) -> `logic_relay`** | `phase3-cp5` | Route `OnDeath` through two `filter_activator_name` entities (`[PR#]td_filter_no_walker` and `[PR#]td_filter_no_guardian`) to reject tower kills and forward `OnFail` to `[PR#]td_tome_gate` | **Failed (0 Tomes Granted)** | While `CNPC_Trooper::Event_Killed` passes `pAttacker` to `CleanupOnDeath`, chaining `AddOutput OnDeath>...>TestActivator` into `filter_activator_name` did not trigger `OnFail -> [PR#]td_tome_gate` in live gameplay. |

---

## Detailed Breakdown

### 1. What Worked: Custom Stackable VData Modifiers (`phase3-cp1` & `phase3-cp2`)
Compiling custom `modifier_base` subclasses into `scripts/modifiers.vdata_c` (packed into `addons/pak20_dir.vpk` and `game/citadel/scripts/modifiers.vdata_c`) works reliably:
* Using `m_nAttributes = "MODIFIER_ATTRIBUTE_MULTIPLE|MODIFIER_ATTRIBUTE_PERMANENT|MODIFIER_ATTRIBUTE_CANNOT_BE_PURGED"` allows infinite stacking of the same modifier on a hero.
* Using `m_sStartSound = soundevent:"Powerup.Pickup.Generic"` plays an audible pickup sound when applied.
* Executing `addmodifier <modifier_name>` (or `subclass_create <modifier_name>`) inside a `.cfg` triggered by `point_servercommand` (`Command "exec ..."`) applies the buff directly to the player's hero without any `FCVAR_CLIENTCMD_CAN_EXECUTE` console errors.
* Confirmed working `m_eModifierValue` enums:
  * `MODIFIER_VALUE_TECH_POWER` (Spirit Power)
  * `MODIFIER_VALUE_WEAPON_DAMAGE_INCREASE` (% Weapon Damage)
  * `MODIFIER_VALUE_AMMO_CLIP_SIZE_PERCENT` (% Max Ammo)
  * `MODIFIER_VALUE_FIRE_RATE` (% Fire Rate)
  * `MODIFIER_VALUE_HEALTH_MAX` (Flat Max HP)
  * `MODIFIER_VALUE_HEALTH_REGEN_PER_SECOND` (HP/s Regen)
  * `MODIFIER_VALUE_COOLDOWN_REDUCTION_PERCENTAGE` (% Cooldown Reduction)
  * `MODIFIER_VALUE_TECH_RANGE_PERCENT` & `MODIFIER_VALUE_TECH_RADIUS_PERCENT` (% Ability Range/Radius)
* Confirmed working console progression commands:
  * `giveap 1` (+1 Ability Point)
  * `givelevelupgold` (grants Souls required for the next Hero Power Level)

---

### 2. What Partially Worked (With Caveats): Direct `OnDeath` Hook (`phase3-cp3`)
In `phase3-cp3`, `logic_auto` and `td_scaling.cfg` executed:
```cfg
ent_fire npc_trooper AddOutput OnDeath>[PR#]td_tome_gate>Trigger>>0>1
```
where `[PR#]td_tome_gate` (`logic_relay`, `StartDisabled = false`, `FastRetrigger = true`) fired `Command "exec td_grant_tome"` on `[PR#]td_servercmd`.

* **What Worked:** Killing creeps reliably fired `OnDeath` -> `[PR#]td_tome_gate` -> `exec td_grant_tome` and granted Tomes to the player.
* **What Didn't Work / Bugs Observed:**
  1. **Tower / Non-Player Kills Also Fired `OnDeath`:** Because `m_OnDeath` fires whenever any `npc_trooper` dies on the map, creeps killed by friendly towers (`npc_boss_tier2` / `npc_boss_tier1`) also triggered `td_grant_tome` even when the player was not shooting creeps.
  2. **Duplicate `AddOutput` Stacking Broke the 10% Probability Ring:** Because `ent_fire npc_trooper AddOutput OnDeath>...` was re-applied every 4 seconds (and every 20s wave tick) so newly spawned waves would be hooked, any creep that lived longer than 4–20 seconds accumulated multiple identical `OnDeath` outputs. When that creep died, all stacked `OnDeath` outputs fired on the same server tick (`0.0s`), before a delayed `Disable` input on `logic_relay` was processed from the Entity IO queue, advancing the 10-step alias ring multiple times per creep death.

---

### 3. What Didn't Work: `OnDamagedByPlayer` (`phase3-cp4`) & `filter_activator_name` (`phase3-cp5`)
1. **`OnDamagedByPlayer` (`phase3-cp4`):**
   * Standard Source 2 `CAI_BaseNPC` entities have an `OnDamagedByPlayer` (`m_OnDamagedByPlayer` at `+0x1078`) output that fires when damaged by a player.
   * However, disassembly of Deadlock's `server.dll` showed that `CAI_CitadelNPC` (`CNPC_Trooper`'s base class) completely overrides `OnTakeDamage_Alive` (`vtable[0x6F8]` at `0xD3E620`) and never calls `CAI_BaseNPC::OnTakeDamage_Alive` (`0x607FB3`). As a result, `OnDamagedByPlayer` never fires on `npc_trooper`.
2. **`filter_activator_name` on `OnDeath` (`phase3-cp5`):**
   * Routing `OnDeath>[PR#]td_filter_no_walker>TestActivator>>0>1` through `filter_activator_name` entities (`OnFail`) to filter out tower targetnames did not fire `[PR#]td_tome_gate` in-game.

---

### Future Alternatives If Re-Visiting Player Boons
If we ever want to re-introduce periodic or milestone Boons without relying on per-creep death filtering:
1. **Per-Wave or Every-N-Waves Milestone Boons:** Trigger `td_roll_tome` directly inside `td_wave_tick.cfg` (e.g. every 3rd wave / every 60 seconds of survival), which is 100% deterministic, requires zero entity IO hooks on `npc_trooper`, and never fires from tower kills.
2. **Physical Pickup Trigger (`trigger_multiple`) in Lane:** Place a `trigger_multiple` in Center Lane that enables periodically and grants a Boon (`OnStartTouch`) when the player hero walks over a powerup spot.
