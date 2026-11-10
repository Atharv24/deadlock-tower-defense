# Deadlock Tower Defense — Tuning & Recompile Guide

This guide explains where every gameplay number comes from, which file controls it, and which command to run after editing.
For a detailed log of the Creep-Death Boon / Tome experiments (what worked vs. what didn't), see [CREEP_DEATH_BUFF_EXPERIMENTS.md](file:///d:/Projects/deadlock-custom-game/CREEP_DEATH_BUFF_EXPERIMENTS.md).

---

## 1. Architecture Overview: The 3 Layers

Values in this custom game mode are picked up from three places, ordered from fastest to edit to deepest:

| Layer | Source File(s) | Compiled Output | Needs Recompile? | When Does It Take Effect? |
| :--- | :--- | :--- | :--- | :--- |
| **1. Config (`.cfg`)** | `src/cfg/td_scaling.cfg`<br>`src/cfg/td_postload.cfg`<br>`src/cfg/td_wave_tick.cfg` | None (plain text copied to `game/citadel/cfg/`) | **No** (just run `.\deploy.ps1 -Action Install`) | Immediately on `exec start_td` (or live mid-match via `exec td_scaling`) |
| **2. VData (`pak20_dir.vpk`)** | `scripts/build_td_vdata.ps1` | `build/scripts/modifiers.vdata_c`<br>`build/scripts/npc_units.vdata_c`<br>`build/pak20_dir.vpk` | **Yes (~2 sec)** via `build_td_vdata.ps1` | Requires restarting Deadlock (VData is loaded at game startup) |
| **3. Map Entities (`dl_defense.vpk`)** | `scripts/build_dl_defense_ents.ps1` | `build/dl_defense.vpk` | **Yes (~5 sec)** via `build_dl_defense_ents.ps1` + `build_dl_defense_vpk.ps1` | On next map load (`exec start_td`) |

---

## 2. Where Every Value Is Picked Up From

### A. Creep Health & Strength Scaling
Creep HP and damage are controlled by a combination of **Layer 1 (`src/cfg/td_scaling.cfg`)** and **Layer 2 (`scripts/build_td_vdata.ps1`)**:

1. **Sudden-Death Multiplier Cutoff (`src/cfg/td_scaling.cfg`, line 12):**
   * `citadel_trooper_health_mult_gametime 9999`
   * Prevents vanilla Deadlock from multiplying creep HP by `3.0x` until 9,999 seconds into the match.
2. **Base VData Stats (`scripts/build_td_vdata.ps1`, lines 385–396):**
   * Sets initial Wave 1 base health (`m_nMaxHealth = 150` for troopers/neutrals, `180` for melee zombies), sets initial base DPS (`m_flBaseDPS = 20.0`), zeroes out the 50% bullet / 45% ability armor on neutral creeps, and boosts passive DPS growth to `+83%` per minute (`m_flDPSPctGrowthPerMinute = 83.0`).
3. **10-Tier Base HP Overrides (`src/cfg/td_scaling.cfg`, lines 50–59):**
   * Uses `CAI_BaseNPC_API::OverrideHealth` + `SetHealth`, starting at **`150 HP`** on Tier 1 and scaling up to **`12,316 HP`** on Tier 10:
     ```cfg
     alias td_hp_tier1 "ent_fire npc_trooper OverrideHealth 150; ent_fire npc_trooper SetHealth 150; ent_fire npc_trooper_neutral OverrideHealth 150; ent_fire npc_trooper_neutral SetHealth 150"
     alias td_hp_tier2 "ent_fire npc_trooper OverrideHealth 316; ent_fire npc_trooper SetHealth 316; ent_fire npc_trooper_neutral OverrideHealth 316; ent_fire npc_trooper_neutral SetHealth 316"
     ...
     alias td_hp_tier10 "ent_fire npc_trooper OverrideHealth 12316; ent_fire npc_trooper SetHealth 12316; ent_fire npc_trooper_neutral OverrideHealth 12316; ent_fire npc_trooper_neutral SetHealth 12316"
     ```
   * **Tip:** You can edit those numbers (`150`, `316`, `566`, `941`, `1483`, `2316`, `3566`, `5441`, `8150`, `12316`) directly in `src/cfg/td_scaling.cfg` without recompiling VData or the map!
4. **10-Tier Cumulative Strength Modifiers (`scripts/build_td_vdata.ps1`, lines 153–372 & `src/cfg/td_scaling.cfg`):**
   * Applied cumulatively by `td_strength_mod1..10` (`AddModifier td_creep_strength_1..10` + `modifier_citadel_trooper_shrine_down_buff`).
   * Scales up to `+7,291` flat HP, `+2,166%` Max HP, and `+2,083%` outgoing damage by Tier 10.
5. **Post-Zipline Landing Buff Trigger (`src/cfg/td_apply_buffs.cfg` & `scripts/build_dl_defense_ents.ps1`):**
   * Because `citadel_spawn_trooper_wave` spawns a `trooper_zipline_container` that rides the zipline for ~11s before deploying the actual `npc_trooper` entities on the ground, `logic_auto` fires `exec td_apply_buffs` (`td_apply_creep_buffs`) `12.5s` after each wave tick so newly landed troopers immediately receive their tier's `OverrideHealth`, Size, and Strength.

---

### B. Creep Size Scaling (3D Model Scale)
1. **Which Modifiers Stack Per Tier (`src/cfg/td_scaling.cfg`, lines 26–35):**
   * `td_size_tier1` through `td_size_tier10` stack `td_creep_size_1..10` on `npc_trooper` and `npc_trooper_neutral`.
2. **Scale Value Per Modifier (`scripts/build_td_vdata.ps1`, lines 13–152):**
   * Starts at Tier 1 (`0.95x`) and grows across 10 tiers: `0.95x -> 0.985x -> 1.02x -> 1.06x -> 1.10x -> 1.15x -> 1.20x -> 1.26x -> 1.32x -> 1.375x`.

---

### C. Souls / Economy Scaling
Controlled entirely in **`src/cfg/td_scaling.cfg` (lines 103–107)** — no recompile needed:
* **Starting Soul Bounty per Creep:**
  `citadel_trooper_gold_reward 150`
* **Passive Soul Bounty Growth per Minute:**
  `citadel_trooper_gold_reward_bonus_per_minute 400`
* **Per-Wave Soul Bounty Growth (every 20s wave tick):**
  `alias td_grow_souls "incrementvar citadel_trooper_gold_reward 100 25000 200"`

---

### D. Creep Numbers / Squad Scaling
Controlled entirely in **`src/cfg/td_scaling.cfg` (lines 20 & 105–122)** — no recompile needed:
* **Maximum Creeps Allowed in Lane at Once (line 20):**
  `citadel_trooper_max_per_lane 120` (vanilla default is `16`).
* **Extra Squads Spawned Per Wave Tick (`td_numbers_tier1..8`):**
  Starts at `+1` extra squad (`+4` creeps) on Tiers 1–2 and scales up to `+6` extra squads (`+24` extra creeps per wave) by Tier 8.

---

### E. Phase 4: Mixed Horde (Troopers + Graves's Zombies + Neutral Creeps)
Every Center Lane wave now spawns a mixed horde of **Troopers**, **Graves's Zombies**, and **Neutral Creeps** across two systems:

1. **Marching Wave Squads (`scripts/build_td_vdata.ps1`, lines 234–264):**
   * Each 4-unit lane squad (`citadel_spawn_trooper_wave`) spawns upon landing from the Center Lane zipline capsule (`trooper_zipline_container`):
     * **2x Ranged Troopers (`trooper_normal`):** Standard enemy troopers.
     * **1x Graves's Zombie (`trooper_melee`):** Uses Graves's Zombie model (`models/heroes_wip/necro/necro_shambler.vmdl`), death particle (`particles/abilities/necro/necro_ghoul_death.vpcf`), and death sound (`Necro.Shambler.Destroy`). Charges directly into melee combat and attacks the player and Friendly Blue T1 Guardian.
     * **1x Marching Neutral Creep (`trooper_medic`):** Uses the Neutral Underhand creep model (`models/npc_units/neutral_underhand_01/neutral_underhand_01.vmdl`), neutral projectile tracer (`neutral_small_projectile.vpcf`), neutral muzzle flash (`neutral_muzzle_flash_small.vpcf`), and neutral fire sound (`Neutral.Camp.Bullet.Fire`). Marches down Center Lane alongside Troopers and Graves's Zombies.
   * *Why `trooper_melee` instead of raw `npc_necro_skele`?* In `server.dll`, `CNPC_NecroSkele` checks `m_hOwningAbility` (`[this + 0x1568]`) in `CNPC_NecroSkele::Spawn`; without a live Graves ability handle, `m_flSpawnDuration` remains `0.0` and the entity immediately self-destructs on its first Think tick. Running `necro_shambler.vmdl` on `trooper_melee` (`CNPC_Trooper`, which shares `CAI_CitadelNPC_GraphController`) gives full lane pathfinding, melee charge AI, and wave scaling without self-destructing.
2. **Center Lane Neutral Creep Camp (`scripts/build_dl_defense_ents.ps1`, lines 118–202 & `src/cfg/td_scaling.cfg`):**
   * All side-lane and underground `info_neutral_trooper_camp` / `info_neutral_trooper_spawn` entities are disabled so `npc_trooper_neutral` commands only affect Center Lane.
   * A custom `info_neutral_trooper_camp` (`[PR#]td_lane_neutrals`, `TetherRadiusOverride = 1200.0`) with 4 `info_neutral_trooper_spawn` points is placed directly in the Center Lane combat zone (`y = -1400..-1200`, `z = 140.0`) right in front of the Friendly Blue T1 Guardian (`[0.0, -1792.0, 384.0]`):
     * `neutral_drain_creature_normal` at `[-160.0, -1400.0, 140.0]`
     * `neutral_underground_normal` at `[160.0, -1400.0, 140.0]`
     * `neutral_lantern_normal` at `[-160.0, -1200.0, 140.0]`
     * `neutral_specimen_normal` at `[160.0, -1200.0, 140.0]`
   * Every 20s wave tick (`td_wave_tick_client` in `src/cfg/td_scaling.cfg`), `ent_fire info_neutral_trooper_camp SpawnNeutrals` respawns the camp and applies the active `td_size_tier1..5` and `td_strength_tier1..5` modifiers to both `npc_trooper` and `npc_trooper_neutral`.

---

### F. Wave Interval & Map Entity Timers
Controlled in **`scripts/build_dl_defense_ents.ps1`** — Requires Map Entity + VPK recompile:
* **Wave Scaling Interval (`line 206`):**
  * `$delay = "{0:F1}" -f ($w * 20.0)` (for `$w = 1..90`)
  * Executes `exec td_wave_tick` every **20 seconds** for 30 minutes (`1800s`). Change `20.0` to make waves scale faster or slower.

---

## 3. How to Recompile & Deploy After Editing

Run these commands from PowerShell in `d:\Projects\deadlock-custom-game`:

### Scenario 1: You only edited `src/cfg/*.cfg` (Fastest — 1 second)
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "d:\Projects\deadlock-custom-game\deploy.ps1" -Action Install
```
*(No game restart needed — just run `exec start_td` or `exec td_scaling` in the Deadlock console).*

### Scenario 2: You edited modifier or unit values in `scripts/build_td_vdata.ps1` (~2 seconds)
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "d:\Projects\deadlock-custom-game\scripts\build_td_vdata.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File "d:\Projects\deadlock-custom-game\deploy.ps1" -Action Install
```
*(Restart Deadlock so it reloads `pak20_dir.vpk` / `modifiers.vdata_c`).*

### Scenario 3: You edited map entities or timers in `scripts/build_dl_defense_ents.ps1` (~5 seconds)
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "d:\Projects\deadlock-custom-game\scripts\build_dl_defense_ents.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File "d:\Projects\deadlock-custom-game\scripts\build_dl_defense_vpk.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File "d:\Projects\deadlock-custom-game\deploy.ps1" -Action Install
```
*(No game restart needed if at the main menu — just run `exec start_td` in the console).*

### Scenario 4: Clean up before playing normal/Ranked Deadlock
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "d:\Projects\deadlock-custom-game\deploy.ps1" -Action Clean
```
