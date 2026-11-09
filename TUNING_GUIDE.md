# Deadlock Tower Defense — Tuning & Recompile Guide

This guide explains where every gameplay number comes from, which file controls it, and which command to run after editing.

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

1. **Sudden-Death Multiplier Cutoff (`src/cfg/td_scaling.cfg`, line 13):**
   * `citadel_trooper_health_mult_gametime 9999`
   * Prevents vanilla Deadlock from multiplying creep HP by `3.0x` until 9,999 seconds into the match.
2. **Per-Tier Base HP Overrides (`src/cfg/td_scaling.cfg`, lines 46–50):**
   * Sets the creep's base `MaxHealth` and `Health` on each wave tier (base trooper HP is `300`):
     ```cfg
     alias td_hp_tier1 "ent_fire npc_trooper SetMaxHealth 315; ent_fire npc_trooper SetHealth 315"
     alias td_hp_tier2 "ent_fire npc_trooper SetMaxHealth 325; ent_fire npc_trooper SetHealth 325"
     alias td_hp_tier3 "ent_fire npc_trooper SetMaxHealth 340; ent_fire npc_trooper SetHealth 340"
     alias td_hp_tier4 "ent_fire npc_trooper SetMaxHealth 360; ent_fire npc_trooper SetHealth 360"
     alias td_hp_tier5 "ent_fire npc_trooper SetMaxHealth 390; ent_fire npc_trooper SetHealth 390"
     ```
   * **Tip:** You can edit those numbers (`315`, `325`, `340`, `360`, `390`) directly in `src/cfg/td_scaling.cfg` without recompiling VData or the map!
3. **Strength Modifiers (`scripts/build_td_vdata.ps1`, lines 83–192):**
   * Applied by `td_strength_tier1..5` (`AddModifier td_creep_strength_1..5`).
   * Each modifier adds flat HP (`MODIFIER_VALUE_HEALTH_MAX`), percentage HP (`MODIFIER_VALUE_HEALTH_MAX_PERCENT`), and outgoing damage (`MODIFIER_VALUE_OUTGOING_DAMAGE_PERCENTAGE_CHANGE`):
     * `td_creep_strength_1`: `+6` HP, `+0.8%` Max HP, `+5.0%` Damage
     * `td_creep_strength_2`: `+9` HP, `+1.0%` Max HP, `+7.5%` Damage
     * `td_creep_strength_3`: `+14` HP, `+1.5%` Max HP, `+10.0%` Damage
     * `td_creep_strength_4`: `+20` HP, `+2.0%` Max HP, `+15.0%` Damage
     * `td_creep_strength_5`: `+30` HP, `+3.0%` Max HP, `+20.0%` Damage
4. **Super-Trooper & Per-Minute Passive Growth (`scripts/build_td_vdata.ps1`, lines 344–346):**
   * Patches `npc_units.vdata_c`:
     * `modifier_citadel_trooper_shrine_down_buff`: `m_flModelScale = 1.15`, `m_flHealthScale = 1.04` (+4% HP), `m_flDamageScale = 6.0`
     * `m_flDPSPctGrowthPerMinute = 4.5` (+4.5% DPS per minute)

---

### B. Creep Size Scaling (3D Model Scale)
1. **Which Modifiers Stack Per Tier (`src/cfg/td_scaling.cfg`, lines 27–31):**
   * `td_size_tier1` through `td_size_tier5` stack `td_creep_size_1..5` on `npc_trooper`.
   * Because each tier calls the previous tier (`alias td_size_tier2 "td_size_tier1; ent_fire npc_trooper AddModifier td_creep_size_2"`), their scale bonuses add together.
2. **Scale Value Per Modifier (`scripts/build_td_vdata.ps1`, lines 13–82):**
   * `td_creep_size_1`: `MODIFIER_VALUE_MODEL_SCALE = 0.25` (1.25x total)
   * `td_creep_size_2`: `MODIFIER_VALUE_MODEL_SCALE = 0.35` (1.60x cumulative)
   * `td_creep_size_3`: `MODIFIER_VALUE_MODEL_SCALE = 0.45` (2.05x cumulative)
   * `td_creep_size_4`: `MODIFIER_VALUE_MODEL_SCALE = 0.55` (2.60x cumulative)
   * `td_creep_size_5`: `MODIFIER_VALUE_MODEL_SCALE = 0.65` (3.25x cumulative)

---

### C. Souls / Economy Scaling
Controlled entirely in **`src/cfg/td_scaling.cfg` (lines 70–74)** — no recompile needed:
* **Starting Soul Bounty per Creep:**
  `citadel_trooper_gold_reward 300`
* **Passive Soul Bounty Growth per Minute:**
  `citadel_trooper_gold_reward_bonus_per_minute 150`
* **Per-Wave Soul Bounty Growth (every 20s wave tick):**
  `alias td_grow_souls "incrementvar citadel_trooper_gold_reward 100 10000 25"`
  *(Format: `incrementvar <cvar> <minValue> <maxValue> <deltaPerWave>` — change `25` to adjust how many extra Souls creeps grant after each wave).*

---

### D. Creep Numbers / Squad Scaling
Controlled entirely in **`src/cfg/td_scaling.cfg` (lines 21 & 84–93)** — no recompile needed:
* **Maximum Creeps Allowed in Lane at Once (line 21):**
  `citadel_trooper_max_per_lane 120` (vanilla default is `16`).
* **Extra Squads Spawned Per Wave Tick (lines 84–87):**
  Each `citadel_spawn_trooper_wave` call spawns **+4 creeps** in Center Lane:
  ```cfg
  alias td_numbers_tier1 "citadel_spawn_trooper_wave"
  alias td_numbers_tier2 "citadel_spawn_trooper_wave; citadel_spawn_trooper_wave"
  alias td_numbers_tier3 "citadel_spawn_trooper_wave; citadel_spawn_trooper_wave; citadel_spawn_trooper_wave"
  alias td_numbers_tier4 "citadel_spawn_trooper_wave; citadel_spawn_trooper_wave; citadel_spawn_trooper_wave; citadel_spawn_trooper_wave"
  ```

---

### E. Player Boon / Tome Rewards & Drop Probability
1. **Boon Drop Probability (`src/cfg/td_scaling.cfg`, line 104) — No recompile needed:**
   * A 10-step counter (`td_boon_rng_1` -> `td_boon_rng_10`) advances by 1 each time a creep dies within `1.0s` of taking damage from your hero. Step 10 grants a Boon and resets the counter via `td_boon_reset`.
   * Edit `td_boon_reset` on line 104 to change the drop chance:
     * **10% (1 in 10 kills — Default):** `alias td_boon_reset "alias td_try_grant_tome td_boon_rng_1"`
     * **20% (1 in 5 kills):** `alias td_boon_reset "alias td_try_grant_tome td_boon_rng_6"`
     * **25% (1 in 4 kills):** `alias td_boon_reset "alias td_try_grant_tome td_boon_rng_7"`
     * **50% (1 in 2 kills):** `alias td_boon_reset "alias td_try_grant_tome td_boon_rng_9"`
     * **100% (Every kill):** `alias td_boon_reset "alias td_try_grant_tome td_boon_rng_10"`
2. **Which Tomes Are in the Rotation (`src/cfg/td_scaling.cfg`, lines 106–112):**
   * Cycles through `td_tome_1` -> `td_tome_6` (`td_tome_spirit`, `td_tome_weapon`, `td_tome_firerate`, `td_tome_health`, `td_tome_cooldown` + `giveap 1`, `td_tome_range` + `givelevelupgold`).
3. **Stat Values Granted by Each Tome (`scripts/build_td_vdata.ps1`, lines 193–333) — Requires VData recompile:**
   * `td_tome_spirit`: `MODIFIER_VALUE_TECH_POWER = 8.0` (+8 Spirit Power)
   * `td_tome_weapon`: `MODIFIER_VALUE_WEAPON_DAMAGE_INCREASE = 10.0` (+10% Weapon Damage), `MODIFIER_VALUE_AMMO_CLIP_SIZE_PERCENT = 6.0` (+6% Ammo)
   * `td_tome_firerate`: `MODIFIER_VALUE_FIRE_RATE = 5.0` (+5% Fire Rate)
   * `td_tome_health`: `MODIFIER_VALUE_HEALTH_MAX = 80.0` (+80 Max HP), `MODIFIER_VALUE_HEALTH_REGEN_PER_SECOND = 2.0` (+2 HP/s Regen)
   * `td_tome_cooldown`: `MODIFIER_VALUE_COOLDOWN_REDUCTION_PERCENTAGE = 3.0` (+3% Cooldown Reduction)
   * `td_tome_range`: `MODIFIER_VALUE_TECH_RANGE_PERCENT = 4.0` (+4% Range), `MODIFIER_VALUE_TECH_RADIUS_PERCENT = 4.0` (+4% Radius)
   * `td_tome_omni`: All-stats bonus (`+4` Spirit, `+5%` Weapon, `+2.5%` Fire Rate, `+40` HP, `+1.5%` CDR, `+2%` Range/Radius)

---

### F. Wave Interval & Map Entity Timers
Controlled in **`scripts/build_dl_defense_ents.ps1`** — Requires Map Entity + VPK recompile:
* **Wave Scaling Interval (`line 120`):**
  * `$delay = "{0:F1}" -f ($w * 20.0)` (for `$w = 1..90`)
  * Executes `exec td_wave_tick` every **20 seconds** for 30 minutes (`1800s`). Change `20.0` to make waves scale faster or slower.
* **Trooper Hook Interval (`line 136`):**
  * `for ($t = 4; $t -le 1800; $t += 4)`
  * Every **4 seconds**, attaches `OnDamagedByPlayer` and `OnDeath` outputs to newly spawned `npc_trooper` entities.
* **Player-Damage Boon Window (`line 154`):**
  * `m_overrideParam = "OnDamagedByPlayer>[PR#]td_tome_gate>Disable>>1.0>-1"`
  * When you damage a creep, `[PR#]td_tome_gate` opens for **1.0 second**. If the creep dies within 1.0s of your hit, it counts as a player kill and rolls for a Boon.

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
