# Deadlock Tower Defense (`deadlock-td`)

Endless single-lane wave survival on `dl_midtown` built with [Modlock](https://modlock.dev) TypeScript & Panorama JSX.

Defend the Center Lane progression chain from **Blue T1 Guardian -> Blue Walker -> Twin Base Guardians -> Twin Amber Shrines -> Patron Stage 1 -> Weakened Patron Stage 2** against exponentially scaling trooper waves and Colossus Raid Bosses every 5 waves.

---

## Development & Testing (No `deploy.ps1` Needed)

Set `DEADLOCK_DIR` if Deadlock is not installed in the default Steam path:

```powershell
$env:DEADLOCK_DIR = "D:\SteamLibrary\steamapps\common\Deadlock"
```

| Task | Command |
| :--- | :--- |
| **Run locally + launch Deadlock** | `.\tools\modlock.exe dev` |
| **Run locally with hot-reload on save** | `.\tools\modlock.exe dev --watch` |
| **Automated server Probe test (headless)** | `.\tools\modlock.exe dev --no-game --arg probe` |
| **Unit & state-machine integration tests** | `node --experimental-strip-types --test test/td.test.ts` |
| **Build bundle & check types** | `.\tools\modlock.exe build` |
| **Publish update to Hyperline** | `.\tools\modlock.exe publish` |

---

## Repository Layout

- [`main.ts`](main.ts) — Modlock entry point, lifecycle hooks, combat/damage hooks, slash commands, and hot-reload handoff
- [`mod.json`](mod.json) — Modlock manifest (`dl_midtown`, settings, metrics, leaderboard, definition overrides)
- [`src/config.ts`](src/config.ts) — Pure scaling math, CVars (`TD_SERVER_CVARS`), Tome/Boon definitions, Legendary pricing, and handoff serializer
- [`src/wave.ts`](src/wave.ts) — Center Lane wave state machine, per-creep scaling, zipline/dismount sync, and Colossus Raid Boss waves
- [`src/guardian.ts`](src/guardian.ts) — Full 6-stage Base Defense tracker, `/repair`, and `/upgrade` fortification scaling
- [`src/boss_ai.ts`](src/boss_ai.ts) — Navigation waypoints, aim math, ability casting, and anti-kite logic for Enemy Hero Bosses
- [`src/tomes.ts`](src/tomes.ts) — 10% last-hit Minor Tomes & milestone 1-of-3 Major Boons
- [`src/hud.tsx`](src/hud.tsx) — Panorama JSX HUD (`HeroPickerModal`, `TopStrip`, `DefenseSidePanel`, `BossHealthPanel`, `MajorBoonModal`, `LegendaryArmoryModal`, `DefeatOverlay`)
- [`src/probe.ts`](src/probe.ts) — Automated `probe` mode self-test harness
- [`test/td.test.ts`](test/td.test.ts) — Unit and mock-host integration test suite
- [`docs/`](docs/README.md) — Deadlock reverse-engineering and modding reference notes

---

## In-Game Commands

Works in both Team Chat and All-Chat:

- `/hero [name]` — Open Hero Selection UI (or switch hero directly)
- `/unstuck` — Teleport hero to the active Center Lane frontline if stuck in spawn
- `/legendary` or `/t5` — Open the Tier-5 Legendary Armory (`9,600` Souls per item)
- `/repair` — Repair all living Team 2 structures (`300` Souls)
- `/upgrade` — Fortify all Team 2 structures (+Max HP, +25% Dmg, +18% Atk Spd)
- `/boon 1|2|3` — Pick one of 3 Major Boons after a Boss Wave
- `/skipwave` — Trigger the next wave immediately
- `/boss` — Jump to the next Boss Wave
- `/souls [amount]` — Grant Souls for testing
- `/granttome` — Grant a random Minor Tome for testing
- `/restarttd` — Restart the Tower Defense match from Wave 1
