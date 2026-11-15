# Deadlock Custom Game Workspace (`deadlock-td` & Shared Layers)

Chromium-style 5-layer TypeScript & Panorama JSX workspace for [Modlock](https://github.com/paralin/modlock) Deadlock custom game modes with zero external npm dependencies.

---

## Architecture & Strict `DEPS` Matrix

Dependencies flow strictly downward and across allowed seams, automatically enforced by [deps_check_test.ts](testing/deps_check_test.ts):

| Layer | Alias | Allowed Imports | Purpose |
| :--- | :--- | :--- | :--- |
| [`base/`](base/index.ts) | `@base` | `import type` from `'modlock'`, relative in `base/` | Pure math, formatting, slash-command parsing, clock/shutdown watch |
| [`engine/`](engine/index.ts) | `@engine` | `'modlock'`, `@base`, relative in `engine/` | 13 stock VData definition overrides, entity modifiers, `ShopZoneController`, respawn math, `dl_midtown` map helpers, item titles |
| [`components/`](components/) | `@components/<name>` | `'modlock'`, `@base`, `@engine`, relative within same component | Reusable game systems (`bot_ai`, `roguelite`, `scores`); zero `@ui`, `mods`, or cross-component imports |
| [`ui/`](ui/index.ts) | `@ui` | `'modlock'`, `@base`, `@engine`, `@components/scores`, relative in `ui/` | Generic Panorama JSX `HudController`, `HudStateStore`, cursor/throttle, native Buy Menu collapse sync, shared modals |
| [`mods/<slug>/`](mods/deadlock_td/main.ts) | — | `'modlock'`, `@base`, `@engine`, `@ui`, `@components/*`, relative in `mods/<slug>/` | Standalone Modlock mod projects (`mod.json`, `tsconfig.json`, `main.ts`) |
| [`testing/`](testing/mock_modlock_host.ts) | `@testing/*` | Node built-ins + workspace modules | Mock Modlock runtime, Node ESM alias hook (`register.ts`), ambient `node_shims.d.ts`, architecture hygiene checks |
| [`tools/mod.ts`](tools/mod.ts) / [`mod.cmd`](mod.cmd) | — | Node built-ins only | Unified multi-mod CLI (`list`, `dev`, `play`, `build`, `test`, `probe`, `publish`, `new`) |

Cross-layer relative imports (`../`) across boundaries are forbidden; always use layer aliases (`@base`, `@engine`, `@ui`, `@components/*`).

---

## Development & Multi-Mod CLI (`.\mod`)

Use **`.\mod`** in PowerShell / Windows Terminal ([`mod.cmd`](mod.cmd)) or **`./tools/mod.sh`** in Git Bash / WSL / POSIX shells. Shorthand mod names like `td` resolve automatically to `mods/deadlock_td` (and `--cheats` expands to `--arg dev`).

Set `DEADLOCK_DIR` if Deadlock is not installed in the default Steam path (`D:\SteamLibrary\steamapps\common\Deadlock`):

```powershell
$env:DEADLOCK_DIR = "D:\SteamLibrary\steamapps\common\Deadlock"
```

| Task | Command |
| :--- | :--- |
| **List workspace mods** | `.\mod list` |
| **Run locally + launch Deadlock (hot-reload across shared layers)** | `.\mod td` *(or `.\mod dev td`)* |
| **Run locally WITH dev commands enabled (`--arg dev`)** | `.\mod td --cheats` *(or `.\mod dev td --cheats`)* |
| **Play / host for friends via Hyperline lobby (`modlock play`)** | `.\mod play td --lobby` *(or `--host`)* |
| **Automated headless Probe self-test** | `.\mod probe td` |
| **All layer + mod tests & `tsgo` typechecks** | `.\mod test` |
| **Filter tests by pattern** | `.\mod test roguelite` |
| **Build all mods (`mods/*/mod.json`)** | `.\mod build` |
| **Release build check for one mod** | `.\mod build td --release` |
| **Scaffold a new mod under `mods/<slug>`** | `.\mod new <slug>` |
| **Publish update to Hyperline** | `.\mod publish td` |

---

## Included Game: Hidden King's Defense (`mods/deadlock_td`)

Endless single-lane wave survival on `dl_midtown`. Defend the Center Lane progression chain from **Blue T1 Guardian -> Blue Walker -> Twin Base Guardians -> Twin Amber Shrines -> Patron Stage 1 -> Weakened Patron Stage 2** against exponentially scaling trooper waves and Colossus Raid Bosses every 5 waves.

### Layout (`mods/deadlock_td/`)

- [`mods/deadlock_td/main.ts`](mods/deadlock_td/main.ts) — Entry point, lifecycle hooks, combat/damage hooks, slash commands, hot-reload handoff, UI integration
- [`mods/deadlock_td/mod.json`](mods/deadlock_td/mod.json) — Modlock manifest (`dl_midtown`, settings, metrics, leaderboard, definition overrides)
- [`mods/deadlock_td/td_config.ts`](mods/deadlock_td/td_config.ts) — TD scaling math, `TD_SERVER_CVARS`, Tome/Boon pools, handoff serializer
- [`mods/deadlock_td/wave.ts`](mods/deadlock_td/wave.ts) — Center Lane wave state machine, per-creep scaling, zipline/dismount sync, Colossus Raid Boss waves
- [`mods/deadlock_td/guardian.ts`](mods/deadlock_td/guardian.ts) — 6-stage Base Defense tracker, `/repair`, and `/upgrade` fortification scaling
- [`mods/deadlock_td/td_hud.tsx`](mods/deadlock_td/td_hud.tsx) — Panorama JSX TD HUD wrapper & Boon Picker integration
- [`mods/deadlock_td/probe.ts`](mods/deadlock_td/probe.ts) — Automated `probe` self-test harness
- [`mods/deadlock_td/td_test.ts`](mods/deadlock_td/td_test.ts) — TD unit and mock-host integration test suite

### In-Game Commands

Works in both Team Chat and All-Chat:

- `/hero [name]` — Open Hero Selection UI (or switch hero directly)
- `/unstuck` — Teleport hero to the active Center Lane frontline if stuck in spawn
- `/legendary` or `/t5` — Open the Tier-5 Legendary Armory (`9,600` Souls per item, official Deadlock item names, all 12 item slots unlocked)
- `/leaderboard` or `/lb` — Open the Hidden King's Defense Leaderboard (`All-Time`, `This Week`, `Today`)
- `/repair` — Repair all living Team 2 structures (`300` Souls)
- `/upgrade` — Fortify all Team 2 structures (+Max HP, +25% Dmg, +18% Atk Spd)
- `/boon 1|2|3` — Pick one of 3 Major Boons after a Boss Wave (scales with wave Tome multiplier)
- `/restarttd` — Restart Hidden King's Defense from Wave 1 as a fresh Ranked run (blocked mid-run in co-op while defenders are still fighting)

#### Local Developer Commands (`--cheats` / `--arg dev` Only)

Disabled in all public, `hyperline.gg`, and default local matches (`sv_cheats 0`). Pass `--cheats` (or `--arg dev`) when starting your local server (`.\mod td --cheats`) to enable them for your local `developer` connection (runs are automatically marked unranked):

- `/skipwave` — Trigger the next wave immediately
- `/boss` — Jump to the next Boss Wave
- `/souls [amount]` — Grant Souls for testing
- `/granttome` — Grant a random wave-scaled Minor Tome for testing
- `/tomescale [%|reset]` — View or override per-wave Tome scaling at runtime

### Gameplay Rules (`v0.7.7`)

- **Ranked Leaderboards (`td.highest_wave`, `td.creeps_slain`) & Cheat Protection:** Developer slash commands and `sv_cheats` are completely disabled in all public and default matches. Normal runs checkpoint progressively on each wave (`Wave 2+` or `Wave 1` with kills) and submit final results on defeat, disconnect, or `/restarttd`.
- **Co-op Slots & Flex Slots:** All **12** Team 2 co-op player slots and all **12** item slots (4 Flex Slots unlocked immediately) stay open.
- **Fixed Respawn:** Defenders respawn after a fixed **5 seconds** directly onto ground-checked Center Lane coordinates.
- **Immediate Idle Reset:** Hosted servers automatically reset cleanly after a 3s flush grace when empty, while local `--arg dev` servers auto-quit cleanly.
