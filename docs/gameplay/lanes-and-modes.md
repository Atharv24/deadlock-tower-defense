# Lanes, Bots & Match Modes

## 1. Mid-Lane Only Restriction
- `citadel_active_lane 4` restricts trooper wave spawning and lane objectives strictly to the **Mid Lane (Blue Lane)**.
- `citadel_crate_respawn_interval 0` prevents world crates from cluttering inactive lanes.

---

## 2. Preventing Mutual Hero Respawns (1v1 Death Rules)
- Set **`citadel_one_on_one_match 0`** while keeping `citadel_active_lane 4`.
  - When a hero dies, only that hero waits on their respawn timer.
  - The game does not restart or force mutual resets.

---

## 3. Bot Spawning (Disabled)
- Practice bots are completely disabled for solo sandbox play:
  ```cfg
  citadel_solo_bot_match 0
  citadel_spawn_practice_bots 0
  citadel_spawn_practice_bots_count 0
  citadel_bot_kick all
  ```

---

## 4. Friendly Creep Suppression (Solo vs Creep Waves)
- **Mechanism:** Friendly (Team 2 / Amber) creeps are automatically despawned as they touch the spawn tube exit detector:
  ```cfg
  ent_fire amber_trooper_detector AddOutput OnStartTouch>!activator>Kill>>0>-1
  ```
  - `Kill` removes the entity without triggering `OnKilled`, so no free loot rolls are awarded.
  - You fight solo against oncoming opponent waves without friendly creep interference.

---

## 5. Opponent Creep Progression & Strength Scaling
- **Server Bridge Execution:** Scaled ConVars (`citadel_trooper_health_mult`, `citadel_trooper_squad_size`) are server-only (`server.dll`), so they are executed via `loot_cmd_server` (`point_servercommand`) and direct entity I/O to avoid client console warnings.
- **Progressive Staged Upgrades (every 60 seconds via `loot_creep_scale_timer`):**
  - **Minute 1 (Stage 1):** +25% HP (600 HP) and +8% Model Scale.
  - **Minute 2 (Stage 2):** +50% HP (800 HP), +15% Model Scale, and Squad Size increased to 5.
  - **Minute 3 (Stage 3):** +85% HP (1,100 HP), +22% Model Scale (Mini-Bosses).
  - **Minute 4 (Stage 4):** +130% HP (1,500 HP), +30% Model Scale, Squad Size 6 (Raid Boss Wave).
  - **Minute 5+ (Stage 5):** +200% HP (2,000 HP), +40% Model Scale (Titanic Wave).

---

## 6. Single Config Launch (Zero-Key Automation)
- Run `exec start_1v1_loot` from the console (F7).
- The map loads, hero selection completes, and the very first time you take a step (`W`) or jump (`SPACE`), all world hooks, friendly creep suppressors, and creep scaling timers initialize automatically.
- No need to press `O`.
