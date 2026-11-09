# `.vdata` Files Reference

Decompiled `.vdata` files are located in [`reference/scripts/`](file:///d:/Projects/deadlock-custom-game/reference/scripts).

| File | Root Type | What It Controls |
| :--- | :--- | :--- |
| [`generic_data.vdata`](file:///d:/Projects/deadlock-custom-game/reference/scripts/generic_data.vdata) | `CitadelGenericData_t` | Global rules: lane info (`m_LaneInfo`), item prices per tier (`m_nItemPricePerTier`), soul share fractions (`m_flTrooperKillGoldShareFrac`), objective rewards (`m_ObjectiveParams`), breakable loot decks (`m_BreakablePowerupLootParams`), shop groups, and `m_StreetBrawl` round configs. |
| [`misc.vdata`](file:///d:/Projects/deadlock-custom-game/reference/scripts/misc.vdata) | `CEntitySubclassVDataBase` | Entity subclasses for breakable props (`citadel_breakable_prop_*`), powerup spawners, soul orbs (`dropped_soul_orb`, `xp_orb_*`), medic health packs (`medic_trooper_aoe_health_pickup_*`), permanent stat pickups (`*_permanent_pickup`), and item pickups (`citadel_item_pickup`). |
| [`npc_units.vdata`](file:///d:/Projects/deadlock-custom-game/reference/scripts/npc_units.vdata) | `CAI_CitadelNPCVData` | Troopers (`trooper_base`, `trooper_normal`, `trooper_medic`, `trooper_melee`, `trooper_zipline_container`), Guardians, Walkers, Patrons, and neutral creeps. |
| [`modifiers.vdata`](file:///d:/Projects/deadlock-custom-game/reference/scripts/modifiers.vdata) | `CModifierVData` | Global status effects and state modifiers (`modifier_citadel_in_shop`, `modifier_citadel_in_fountain`, `modifier_streetbrawl_*`, neutral creep attacks). |
| [`heroes.vdata`](file:///d:/Projects/deadlock-custom-game/reference/scripts/heroes.vdata) | `CitadelHeroData_t` | Hero base stats, movement speeds, health, stamina, and bound abilities. |
| [`abilities.vdata`](file:///d:/Projects/deadlock-custom-game/reference/scripts/abilities.vdata) | `CEntitySubclassVDataBase` | All hero abilities and all purchasable shop upgrades (`upgrade_*`). |
