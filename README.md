# Hidden King's Defense (`deadlock-td`)

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
- `/legendary` or `/t5` — Open the Tier-5 Legendary Armory (`9,600` Souls per item, official Deadlock item names, all 12 item slots unlocked)
- `/leaderboard` or `/lb` — Open the Hidden King's Defense Leaderboard (`All-Time`, `This Week`, `Today`)
- `/repair` — Repair all living Team 2 structures (`300` Souls)
- `/upgrade` — Fortify all Team 2 structures (+Max HP, +25% Dmg, +18% Atk Spd)
- `/boon 1|2|3` — Pick one of 3 Major Boons after a Boss Wave (scales with wave Tome multiplier)
- `/tomescale [%|reset]` — View or override per-wave Tome scaling (`tome_scaling` setting in [`mod.json`](mod.json), default `+6%/wave`; custom overrides mark the run unranked)
- `/skipwave` — Trigger the next wave immediately *(marks run unranked)*
- `/boss` — Jump to the next Boss Wave *(marks run unranked)*
- `/souls [amount]` — Grant Souls for testing *(marks run unranked)*
- `/granttome` — Grant a random wave-scaled Minor Tome for testing *(marks run unranked)*
- `/restarttd` — Restart Hidden King's Defense from Wave 1 as a fresh Ranked run

### Gameplay Rules (`v0.6.4`)
- **Ranked Leaderboards (`td.highest_wave`, `td.creeps_slain`):** Normal runs automatically report Highest Wave (tiebroken by Creep Last-Hits) and Creeps Slain to Hyperline on defeat, disconnect (Wave 2+), or `/restarttd` (Wave 2+). Using sandbox commands (`/skipwave`, `/boss`, `/souls`, `/granttome`, custom `/tomescale`) disqualifies the current run until `/restarttd`.
- **Co-op Slots & Flex Slots:** All **12** Team 2 co-op player slots and all **12** item slots (4 Flex Slots unlocked immediately) stay open.
- **Fixed Respawn:** Defenders respawn after a fixed **5 seconds** directly onto ground-checked Center Lane coordinates.
- **Wave Scaling & Economy:** Enemy creep HP grows `+4%/wave`, creep damage `+3.5%/wave`, and Raid Boss damage scales `1.15x` (+`0.20x` per Boss wave) alongside configurable wave-scaled Tomes. Soul income from troopers, bounties, Boss kills, and Soul Cache Tomes is reduced `3x` while `Patron Warchest` Boss Boons award full Souls.
- **Immediate Empty-Match End:** Matches automatically end and close the server instance as soon as the last human defender disconnects (after submitting any eligible Wave 2+ Ranked run).
