# Deadlock Tower Defense — Tuning & Recompile Guide

This guide explains where every gameplay number comes from, which file controls it, and which command to run after editing.
For a detailed log of the Creep-Death Boon / Tome experiments (what worked vs. what didn't), see [CREEP_DEATH_BUFF_EXPERIMENTS.md](file:///d:/Projects/deadlock-custom-game/CREEP_DEATH_BUFF_EXPERIMENTS.md).

---

## 1. Architecture Overview: The Hybrid 3-Layer Stack

Values in this custom game mode are organized across three complementary layers:

| Layer | Source File(s) | Compiled Output | Needs Recompile? | When Does It Take Effect? |
| :--- | :--- | :--- | :--- | :--- |
| **1. Modlock TypeScript Runtime** | `src/config.ts`<br>`src/wave.ts`<br>`src/tomes.ts`<br>`src/guardian.ts`<br>`src/hud.tsx`<br>`src/probe.ts`<br>`main.ts` | `build/mod.js`<br>`build/mod.json` | **Fast (~1 sec)** via `.\tools\modlock.exe build` | Immediately hot-reloads in `modlock run` (preserving state via `handoff()`) |
| **2. Binary KV3 VData (`pak20_dir.vpk`)** | `scripts/build_td_vdata.ps1` | `build/scripts/modifiers.vdata_c`<br>`build/scripts/npc_units.vdata_c`<br>`build/pak20_dir.vpk` | **Yes (~2 sec)** via `build_td_vdata.ps1` | Requires restarting Deadlock (VData is loaded at game startup) |
| **3. Map Entities (`hl_defense.vpk` / `dl_defense.vpk`)** | `scripts/build_dl_defense_ents.ps1` | `maps/hl_defense.vpk`<br>`build/dl_defense.vpk` | **Yes (~5 sec)** via `build_dl_defense_ents.ps1` + `build_dl_defense_vpk.ps1` | On next map load (`hl_defense` / `dl_defense`) |
| **4. Legacy Console Fallback (`.cfg`)** | `src/cfg/td_scaling.cfg`<br>`src/cfg/td_postload.cfg`<br>`src/cfg/td_wave_tick.cfg` | None (plain text copied to `game/citadel/cfg/`) | **No** (just run `.\deploy.ps1 -Action Install`) | When running standalone `exec start_td` without Modlock |

---

## 2. Where Every Value Is Picked Up From

### A. Creep Health & Strength Scaling
Creep HP and damage are controlled by a combination of **Layer 1 (`src/cfg/td_scaling.cfg`)** and **Layer 2 (`scripts/build_td_vdata.ps1`)**:

1. **Sudden-Death Multiplier Cutoff (`src/cfg/td_scaling.cfg`, line 12):**
   * `citadel_trooper_health_mult_gametime 9999`
   * Prevents vanilla Deadlock from multiplying creep HP by `3.0x` until 9,999 seconds into the match.
2. **Base VData Stats (`scripts/build_td_vdata.ps1`, lines 385–396):**
   * Sets initial Wave 1 base health (`m_nMaxHealth = 150` for troopers/neutrals, `180` for melee zombies), sets initial base DPS (`m_flBaseDPS = 20.0`), zeroes out the 50% bullet / 45% ability armor on neutral creeps, and sets passive DPS growth to `+1.38%` per minute (`m_flDPSPctGrowthPerMinute = 1.38`).
3. **10-Tier Base HP Overrides (`src/cfg/td_scaling.cfg`, lines 58–67):**
   * Uses `CAI_BaseNPC_API::OverrideHealth` + `SetHealth` (without `modifier_citadel_trooper_shrine_down_buff`), starting at **`150 HP`** on Tier 1 and scaling up to **`1,231 HP`** on Tier 10:
     ```cfg
     alias td_hp_tier1 "ent_fire npc_trooper OverrideHealth 150; ent_fire npc_trooper SetHealth 150; ent_fire npc_trooper_neutral OverrideHealth 150; ent_fire npc_trooper_neutral SetHealth 150"
     alias td_hp_tier2 "ent_fire npc_trooper OverrideHealth 156; ent_fire npc_trooper SetHealth 156; ent_fire npc_trooper_neutral OverrideHealth 156; ent_fire npc_trooper_neutral SetHealth 156"
     ...
     alias td_hp_tier10 "ent_fire npc_trooper OverrideHealth 1231; ent_fire npc_trooper SetHealth 1231; ent_fire npc_trooper_neutral OverrideHealth 1231; ent_fire npc_trooper_neutral SetHealth 1231"
     ```
   * **Tip:** You can edit those numbers (`150`, `156`, `164`, `180`, `206`, `252`, `332`, `476`, `741`, `1231`) directly in `src/cfg/td_scaling.cfg` without recompiling VData or the map!
4. **10-Tier Strength Modifiers (`scripts/build_td_vdata.ps1`, lines 153–372 & `src/cfg/td_scaling.cfg`):**
   * Applied by `td_strength_tier1..10` (`AddModifier td_creep_strength_1..10`).
   * Scales up to `+121.5` flat HP, `+36.1%` Max HP, and `+34.75%` outgoing damage by Tier 10.

---

### B. Creep Size Scaling (3D Model Scale)
1. **Which Modifiers Stack Per Tier (`src/cfg/td_scaling.cfg`, lines 26–35):**
   * `td_size_tier1` through `td_size_tier10` stack `td_creep_size_1..10` on `npc_trooper` and `npc_trooper_neutral`.
2. **Scale Value Per Modifier (`scripts/build_td_vdata.ps1`, lines 13–152):**
   * Starts at Tier 1 (`0.95x`) and grows across 10 tiers: `0.95x -> 0.957x -> 0.964x -> 0.972x -> 0.980x -> 0.990x -> 1.000x -> 1.012x -> 1.024x -> 1.035x`.

---

### C. Souls / Economy Scaling
Controlled entirely in **`src/cfg/td_scaling.cfg` (lines 95–99)** — no recompile needed:
* **Starting Soul Bounty per Creep:**
  `citadel_trooper_gold_reward 150`
* **Passive Soul Bounty Growth per Minute:**
  `citadel_trooper_gold_reward_bonus_per_minute 100`
* **Per-Wave Soul Bounty Growth (every 20s wave tick):**
  `alias td_grow_souls "incrementvar citadel_trooper_gold_reward 50 10000 25"`

---

### D. Creep Numbers / Squad Scaling
Controlled entirely in **`src/cfg/td_scaling.cfg` (lines 20 & 105–122)** — no recompile needed:
* **Maximum Creeps Allowed in Lane at Once (line 20):**
  `citadel_trooper_max_per_lane 120` (vanilla default is `16`).
* **Extra Squads Spawned Per Wave Tick (`td_numbers_tier1..8`):**
  Starts at `+1` extra squad (`+4` creeps) on Tiers 1–4 and scales up to `+2` extra squads (`+8` extra creeps per wave) on Tiers 5–8.

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

### F. Phase 5: Giant Enemy Hero Boss Waves (Every 10th Wave)
Every **10th wave** (Wave 10 at `200s`, Wave 20 at `400s`, Wave 30 at `600s`, Wave 40 at `800s`, Wave 50+ at `1000s+`), a **Giant Enemy Hero Boss** (`CCitadelPlayerPawn` on Team 3 Sapphire with all 4 hero abilities unlocked and Hard AI active) spawns into Center Lane:

1. **Where the Boss Roster & 10-Wave Cycle Are Controlled (`src/cfg/td_scaling.cfg`, lines 127–172):**
   * Uses `citadel_create_unit <hero_name> enemy` (which works on custom map `dl_defense` without the `dl_midtown` map-name restriction of `citadel_spawn_practice_bots` and initializes the bot brain `[bot + 0x4BA0] = 1`).
   * Applies the Giant Boss modifier exclusively to the Enemy Hero Boss by firing `ent_fire player AddModifier td_boss_hero_stats_<1..5>` followed immediately in the same tick by `ent_fire !player RemoveModifier td_boss_hero_stats_<1..5>`.
   * **Boss Progression Roster:**
     * **Wave 10 (`td_boss_wave_10`):** Giant **Abrams (`hero_atlas`)** — `1.65x` Scale, `+2,500` HP (`~3,200+` total HP), `+20` HP/s Regen, `+100%` Gun Damage, `+60` Spirit Power, `+50%` Outgoing Damage.
     * **Wave 20 (`td_boss_wave_20`):** Giant **Warden (`hero_warden`)** — `1.75x` Scale, `+5,500` HP (`~6,200+` total HP), `+35` HP/s Regen, `+175%` Gun Damage, `+110` Spirit Power, `+100%` Outgoing Damage.
     * **Wave 30 (`td_boss_wave_30`):** Giant **Seven (`hero_gigawatt`)** — `1.85x` Scale, `+10,000` HP (`~10,700+` total HP), `+50` HP/s Regen, `+250%` Gun Damage, `+170` Spirit Power, `+160%` Outgoing Damage.
     * **Wave 40 (`td_boss_wave_40`):** Giant **Bebop (`hero_bebop`)** — `1.95x` Scale, `+16,000` HP (`~16,700+` total HP), `+70` HP/s Regen, `+350%` Gun Damage, `+240` Spirit Power, `+225%` Outgoing Damage.
     * **Wave 50+ (`td_boss_wave_50`):** Colossal **Mo & Krill (`hero_krill`)** — `2.10x` Scale, `+25,000` HP (`~25,700+` total HP), `+100` HP/s Regen, `+500%` Gun Damage, `+350` Spirit Power, `+300%` Outgoing Damage.
   * **Manual Console Test Commands:**
     * Run `td_spawn_boss` in the console at any time to immediately spawn the next Giant Enemy Hero Boss tier, or run `td_boss_wave_10`, `td_boss_wave_20`, `td_boss_wave_30`, `td_boss_wave_40`, or `td_boss_wave_50` directly.
2. **Where the Boss Size, HP & Damage Numbers Are Controlled (`scripts/build_td_vdata.ps1`, lines 373–542):**
   * Defined in `td_boss_hero_stats_1` through `td_boss_hero_stats_5` inside `modifiers.vdata_c`.

---

### G. Wave Interval & Map Entity Timers
Controlled in **`scripts/build_dl_defense_ents.ps1`** — Requires Map Entity + VPK recompile:
* **Wave Scaling Interval (`line 206`):**
  * `$delay = "{0:F1}" -f ($w * 20.0)` (for `$w = 1..90`)
  * Executes `exec td_wave_tick` every **20 seconds** for 30 minutes (`1800s`). Change `20.0` to make waves scale faster or slower.

---

## 3. How to Build, Test, & Deploy

Run these commands from PowerShell in `d:\Projects\deadlock-custom-game`:

### Full Build (VData + Map VPKs + Modlock TypeScript Bundle)
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "d:\Projects\deadlock-custom-game\deploy.ps1" -Action Build
```

### Run All Automated Tests (Tier 1 Unit + Tier 1B Probe Integration + Tier 2 Binary KV3/VPK Verification)
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "d:\Projects\deadlock-custom-game\deploy.ps1" -Action Test
```

### Launch Live Modlock Dev Session (or In-Engine Tier 3 Probe Self-Test)
```powershell
# Live hot-reload dev session:
powershell -NoProfile -ExecutionPolicy Bypass -File "d:\Projects\deadlock-custom-game\deploy.ps1" -Action Dev

# Automated in-engine Tier 3 ProbeRun verification:
powershell -NoProfile -ExecutionPolicy Bypass -File "d:\Projects\deadlock-custom-game\deploy.ps1" -Action Dev -Probe
```

### Clean Up Before Playing Normal/Ranked Deadlock
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "d:\Projects\deadlock-custom-game\deploy.ps1" -Action Clean
```
