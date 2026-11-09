# Pulse Visual Scripting & Game Events

## Pulse Files (`.vpulse`)
Decompiled Pulse files are in [`reference/pulse/`](file:///d:/Projects/deadlock-custom-game/reference/pulse).
- [`pulse/maps/dl_midtown.vpulse`](file:///d:/Projects/deadlock-custom-game/reference/pulse/maps/dl_midtown.vpulse) — Attached to `point_pulse` in `dl_midtown`. Listens to:
  - `CPulseGraphInstance_ServerEntity::GraphStart`
  - `CCitadelPointPulseAPI::OnGameStateChanged`
  - `CCitadelPointPulseAPI::OnStreetBrawlEnterState`
  - Fires `Enable` / `Disable` on `amber_spawn_block_brush` and `sapphire_spawn_block_brush`.
- [`pulse/maps/prefabs/shop.vpulse`](file:///d:/Projects/deadlock-custom-game/reference/pulse/maps/prefabs/shop.vpulse) — Controls underground/lane shops (`shop_item_trigger`, `shop_prop`, `CCitadel_ShopProp_API::SetShopOpen`).

## Useful Pulse C++ Functions (`CPulseServerFuncs`)
Found in `server.dll`:
- `CPulseServerFuncs::ConCommand` — Executes a server console command from a Pulse graph!
- `CPulseServerFuncs::AddNewModifier` / `RemoveModifier` / `HasModifier`
- `CPulseServerFuncs::FindAllEntitiesWithinRadius` / `FindEntityByClassnameWithinRadius`
- `CPulseServerFuncs::TeleportEntity` / `DealDamage`
- `CPulseCell_Outflow_ListenForEntityOutput` — Listens to any entity output.

## Game Events ([`resource/game.gameevents`](file:///d:/Projects/deadlock-custom-game/reference/resource/game.gameevents))
- `player_death`, `player_hurt`, `player_respawned`
- `game_state_changed` (`game_state_new`)
- `item_pickup` (`userid`, `item`)
- Server-side stat/combat log strings in `server.dll`: `trooper_killed` (`Killer: %s, Dying: %s, Number of Assisters: %d`).
