# Shops, Items & Loot Mechanics

## 1. Shop Access & Legendary Items
The in-game item shop is fully enabled, and Legendary / Tier-4 items are unlocked:
```cfg
citadel_tutorial_close_shop 0
citadel_hero_testing_legendary_items 1
ent_fire trigger_item_shop Enable
ent_fire trigger_item_shop_safe_zone Enable
ent_fire citadel_trigger_shop_tunnel Enable
ent_fire shop_item_trigger Enable
```

---

## 2. Loot & Buff Mechanics

### Method 1: Direct Permanent Stat Buffs into Hero (`P`)
- **Command:** `citadel_give_permanent_buffs 1`
- **Behavior:** Directly applies a random permanent attribute tome into the hero's stats (+Weapon Damage %, +Health, +Spirit Power, +Cooldown Reduction).
- **Advantage:** 100% instant and reliable—does not depend on world physics or picking up objects.

### Method 2: Rotating Loot Roller & Automated Creep Death Hook (`K`)
- **Keybind:** `K` (manual roll)
- **Automated Trigger:** Runs automatically whenever any lane or jungle creep (`npc_trooper`, `npc_trooper_neutral`) dies!
- **Loot Table:**
  1. Weapon Damage Tome (+6%) & 250 Souls
  2. Health Tome (+30 Bonus HP) & 250 Souls
  3. Cooldown Reduction Tome & 250 Souls
  4. 500 Souls (Buy Tier-1 Shop Item)
  5. 1,250 Souls (Buy Tier-2 Shop Item)
  6. 3,000 Souls (Buy Tier-3 Shop Item)
  7. **6,200 Souls (Buy Tier-4 LEGENDARY Shop Item!)**
  8. Double Stat Tome (+2 Random Stat Buffs) & 500 Souls
- **Architecture:**
  - `point_servercommand` (`loot_cmd_server`): Executes aliases and commands directly on the server console buffer, completely avoiding client `InputService` FCVAR restrictions.
  - Direct `OnKilled>loot_cmd_server>Command>loot_roll_item>0>1`: Directly executes the loot roll on each creep death with no intermediate guards or debouncers that could lock up.
  - `logic_timer` (`loot_creep_hook_timer`): Runs every 3.0s to continuously tag incoming creep waves (`loot_hook_lane_troopers`, `loot_hook_neutral_troopers`).

### Method 3: Golden Breakable Loot Statues (`L`)
- **Command:** `ent_create citadel_breakable_item_container`
- **Behavior:** Spawns a golden breakable loot statue directly at the player's crosshair. When broken with weapon fire or melee, it drops tomes and powerups.

---

## 3. World Breakables (Zero Delay Spawning)
All world crates, vases, and statues spawn immediately at 0:00:
```cfg
citadel_breakable_prop_initial_spawn_time_override 0
citadel_pickup_spawner_initial_spawn_time_override 0
citadel_powerup_initial_spawn_time_override 0
citadel_respawn_all_breakables
```
