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
2. **Per-Tier Base HP Overrides (`src/cfg/td_scaling.cfg`, lines 44–48):**
   * Sets the creep's base `MaxHealth` and `Health` on each wave tier (base trooper HP is `300`, scaling bonus cut in half to `+7 -> +45` HP):
     ```cfg
     alias td_hp_tier1 "ent_fire npc_trooper SetMaxHealth 307; ent_fire npc_trooper SetHealth 307"
     alias td_hp_tier2 "ent_fire npc_trooper SetMaxHealth 312; ent_fire npc_trooper SetHealth 312"
     alias td_hp_tier3 "ent_fire npc_trooper SetMaxHealth 320; ent_fire npc_trooper SetHealth 320"
     alias td_hp_tier4 "ent_fire npc_trooper SetMaxHealth 330; ent_fire npc_trooper SetHealth 330"
     alias td_hp_tier5 "ent_fire npc_trooper SetMaxHealth 345; ent_fire npc_trooper SetHealth 345"
     ```
   * **Tip:** You can edit those numbers (`307`, `312`, `320`, `330`, `345`) directly in `src/cfg/td_scaling.cfg` without recompiling VData or the map!
3. **Strength Modifiers (`scripts/build_td_vdata.ps1`, lines 83–192):**
   * Applied by `td_strength_tier1..5` (`AddModifier td_creep_strength_1..5`).
   * Each modifier adds flat HP (`MODIFIER_VALUE_HEALTH_MAX`), percentage HP (`MODIFIER_VALUE_HEALTH_MAX_PERCENT`), and outgoing damage (`MODIFIER_VALUE_OUTGOING_DAMAGE_PERCENTAGE_CHANGE`):
     * `td_creep_strength_1`: `+3.0` HP, `+0.4%` Max HP, `+2.5%` Damage
     * `td_creep_strength_2`: `+4.5` HP, `+0.5%` Max HP, `+3.75%` Damage
     * `td_creep_strength_3`: `+7.0` HP, `+0.75%` Max HP, `+5.0%` Damage
     * `td_creep_strength_4`: `+10.0` HP, `+1.0%` Max HP, `+7.5%` Damage
     * `td_creep_strength_5`: `+15.0` HP, `+1.5%` Max HP, `+10.0%` Damage
4. **Super-Trooper & Per-Minute Passive Growth (`scripts/build_td_vdata.ps1`, lines 201–203):**
   * Patches `npc_units.vdata_c`:
     * `modifier_citadel_trooper_shrine_down_buff`: `m_flModelScale = 1.075`, `m_flHealthScale = 1.02` (+2% HP), `m_flDamageScale = 3.0`
     * `m_flDPSPctGrowthPerMinute = 2.25` (+2.25% DPS per minute)

---

### B. Creep Size Scaling (3D Model Scale)
1. **Which Modifiers Stack Per Tier (`src/cfg/td_scaling.cfg`, lines 25–29):**
   * `td_size_tier1` through `td_size_tier5` stack `td_creep_size_1..5` on `npc_trooper`.
   * Because each tier calls the previous tier (`alias td_size_tier2 "td_size_tier1; ent_fire npc_trooper AddModifier td_creep_size_2"`), their scale bonuses add together.
2. **Scale Value Per Modifier (`scripts/build_td_vdata.ps1`, lines 13–82):**
   * `td_creep_size_1`: `MODIFIER_VALUE_MODEL_SCALE = 0.125` (`1.125x` total)
   * `td_creep_size_2`: `MODIFIER_VALUE_MODEL_SCALE = 0.175` (`1.30x` cumulative)
   * `td_creep_size_3`: `MODIFIER_VALUE_MODEL_SCALE = 0.225` (`1.525x` cumulative)
   * `td_creep_size_4`: `MODIFIER_VALUE_MODEL_SCALE = 0.275` (`1.80x` cumulative)
   * `td_creep_size_5`: `MODIFIER_VALUE_MODEL_SCALE = 0.325` (`2.125x` cumulative)

---

### C. Souls / Economy Scaling
Controlled entirely in **`src/cfg/td_scaling.cfg` (lines 68–72)** — no recompile needed:
* **Starting Soul Bounty per Creep:**
  `citadel_trooper_gold_reward 300`
* **Passive Soul Bounty Growth per Minute:**
  `citadel_trooper_gold_reward_bonus_per_minute 150`
* **Per-Wave Soul Bounty Growth (every 20s wave tick):**
  `alias td_grow_souls "incrementvar citadel_trooper_gold_reward 100 10000 25"`
  *(Format: `incrementvar <cvar> <minValue> <maxValue> <deltaPerWave>` — change `25` to adjust how many extra Souls creeps grant after each wave).*

---

### D. Creep Numbers / Squad Scaling
Controlled entirely in **`src/cfg/td_scaling.cfg` (lines 20 & 82–91)** — no recompile needed:
* **Maximum Creeps Allowed in Lane at Once (line 20):**
  `citadel_trooper_max_per_lane 120` (vanilla default is `16`).
* **Extra Squads Spawned Per Wave Tick (lines 82–85):**
  Each `citadel_spawn_trooper_wave` call spawns **+4 creeps** in Center Lane:
  ```cfg
  alias td_numbers_tier1 "citadel_spawn_trooper_wave"
  alias td_numbers_tier2 "citadel_spawn_trooper_wave"
  alias td_numbers_tier3 "citadel_spawn_trooper_wave; citadel_spawn_trooper_wave"
  alias td_numbers_tier4 "citadel_spawn_trooper_wave; citadel_spawn_trooper_wave"
  ```

---

### E. Wave Interval & Map Entity Timers
Controlled in **`scripts/build_dl_defense_ents.ps1`** — Requires Map Entity + VPK recompile:
* **Wave Scaling Interval (`line 113`):**
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
