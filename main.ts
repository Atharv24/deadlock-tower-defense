// Deadlock Tower Defense — Modlock TypeScript Entry Point
// Combines Modlock's Wasm runtime, `onDamaged` combat hooks, Panorama JSX HUD,
// and `ProbeRun` self-test with our Binary KV3 VData (`pak20_dir.vpk`) and
// patched Center Lane Map VPK (`maps/hl_defense.vpk` / `build/dl_defense.vpk`).

import {
  command,
  every,
  findHero,
  handedOff,
  handoff,
  holdModifierState,
  log,
  onDamage,
  onDamaged,
  onFrame,
  onPlayerJoin,
  onStart,
  onWorld,
  type Player,
  players,
  precache,
  toast,
} from 'modlock'

import {
  BOSS_HERO_POOL,
  BOSS_WAVE_INTERVAL,
  DEFENDER_TEAM,
  deserializeTdHandoff,
  MINOR_TOME_POOL,
  PLAYER_SPAWN_ANGLES,
  PLAYER_SPAWN_ORIGIN,
  serializeTdHandoff,
} from './src/config'
import { GuardianManager } from './src/guardian'
import {
  openHeroPickerForPlayer,
  renderTdHud,
  selectDefenderHero,
} from './src/hud'
import { TdProbe } from './src/probe'
import { TomeManager } from './src/tomes'
import { WaveManager } from './src/wave'

const guardian = new GuardianManager()
const tomes = new TomeManager()
const waves = new WaveManager((milestoneWave) => {
  tomes.offerMajorBoonForWave(milestoneWave)
})

let probe: TdProbe | undefined
let nowSeconds = 0
let skipInitialWorldReset = false
const placedHeroEntityBySlot = new Map<number, number>()
const shopStateHeldEntities = new Set<number>()

/** Ensures live Team 2 defender heroes can buy anywhere in Center Lane (`MODIFIER_STATE_IN_SHOP`). */
function ensureDefenderShopAccess(): void {
  for (const conn of players()) {
    if (conn.bot || !conn.ready) continue
    const pawn = conn.player.pawn()
    if (
      pawn &&
      pawn.team === DEFENDER_TEAM &&
      pawn.hero > 0 &&
      pawn.health > 0 &&
      !shopStateHeldEntities.has(pawn.entity)
    ) {
      holdModifierState(pawn.entity, 'MODIFIER_STATE_IN_SHOP', true)
      shopStateHeldEntities.add(pawn.entity)
    }
  }
}

/** Saves state across live Modlock hot-reloads (`modlock run`). */
function persistHandoff(): void {
  const { playerTomes, playerKills } = tomes.exportRecords()
  handoff(
    serializeTdHandoff({
      version: 1,
      wave: waves.wave,
      nextWaveTime: waves.nextWaveTime,
      matchState: guardian.matchState,
      guardianUpgradeLevel: guardian.upgradeLevel,
      guardianBonusMaxHp: guardian.bonusMaxHp,
      scaledCreeps: [...waves.scaledCreeps],
      rewardedCreeps: [...tomes.rewardedCreeps],
      playerTomes,
      playerKills,
    }),
  )
}

/** Restarts the Tower Defense match from Wave 1. */
function restartMatch(): void {
  placedHeroEntityBySlot.clear()
  shopStateHeldEntities.clear()
  guardian.reset()
  tomes.reset()
  waves.cleanupForRestart(nowSeconds)
  for (const conn of players()) {
    const p = conn.player
    const pawn = p.pawn()
    if (pawn && pawn.team === DEFENDER_TEAM && pawn.hero > 0) {
      p.teleport(PLAYER_SPAWN_ORIGIN, PLAYER_SPAWN_ANGLES)
      placedHeroEntityBySlot.set(p.slot, pawn.entity)
    }
    p.announce(
      'TOWER DEFENSE RESTARTED',
      'Wave 1 begins in 5 seconds! Defend the Blue T1 Guardian in Center Lane.',
    )
  }
  persistHandoff()
}

onStart((args) => {
  precache({
    heroes: [...BOSS_HERO_POOL, 'hero_inferno'],
  })
  waves.applyServerConfig()

  const restored = deserializeTdHandoff(handedOff())
  if (restored) {
    skipInitialWorldReset = true
    waves.restore(restored.wave, restored.nextWaveTime, restored.scaledCreeps)
    guardian.restore(
      restored.guardianUpgradeLevel,
      restored.guardianBonusMaxHp,
      restored.matchState,
    )
    tomes.restore(
      restored.rewardedCreeps,
      restored.playerTomes,
      restored.playerKills,
    )
    log(
      `Restored Tower Defense state at Wave ${waves.wave} from hot-reload handoff`,
    )
  } else {
    guardian.matchState = 'active'
  }

  if (args.includes('probe')) {
    probe = new TdProbe()
    log('Started Deadlock Tower Defense in automated Probe self-test mode')
  }
})

onWorld((mapName) => {
  log(`World loaded: ${mapName}`)
  if (skipInitialWorldReset) {
    skipInitialWorldReset = false
    return
  }
  placedHeroEntityBySlot.clear()
  shopStateHeldEntities.clear()
  guardian.reset()
  tomes.reset()
  waves.reset(nowSeconds)
  persistHandoff()
})

onPlayerJoin((joined) => {
  joined.connection.player.announce(
    'DEADLOCK TOWER DEFENSE',
    'Defend the Blue T1 Guardian in Center Lane! Last-hit creeps for a 10% Tome drop.',
  )
})

onDamage((hit) => {
  if (guardian.matchState !== 'active') {
    return
  }
  return waves.modifyIncomingDamage(hit)
})

onDamaged((hit) => {
  if (guardian.matchState !== 'active') {
    return
  }
  const evalResult = tomes.onDamaged(hit, waves.validEnemyEntities(), guardian)
  if (evalResult.isPlayerKill) {
    persistHandoff()
  }
})

// Fast 250ms pass so newly dismounted zipline creeps and Boss Heroes get scaled immediately
// and newly spawned defender heroes immediately receive Buy Anywhere (`MODIFIER_STATE_IN_SHOP`).
every(0.25, () => {
  ensureDefenderShopAccess()
  if (guardian.matchState === 'active' && !waves.waitingForDefenderHero) {
    waves.scaleNewlySpawnedCreeps()
    waves.tickActiveBosses()
  }
})

// 1-second tick for wave scheduling, defender spawn safety, and Guardian monitoring.
every(1, () => {
  // Ensure newly spawned Team 2 defender heroes (pawn.hero > 0) stand on Center Lane surface behind Blue Guardian.
  for (const conn of players()) {
    if (conn.bot) continue
    const p = conn.player
    const pawn = p.pawn()
    if (pawn && pawn.team === DEFENDER_TEAM && pawn.hero > 0 && pawn.health > 0) {
      const outOfBounds =
        pawn.position.z < -100 || Math.abs(pawn.position.y) > 4500
      if (placedHeroEntityBySlot.get(p.slot) !== pawn.entity || outOfBounds) {
        p.teleport(PLAYER_SPAWN_ORIGIN, PLAYER_SPAWN_ANGLES)
        placedHeroEntityBySlot.set(p.slot, pawn.entity)
      }
    }
  }

  guardian.poll(waves.wave)
  waves.tick(nowSeconds, guardian.matchState === 'active')
  persistHandoff()
})

onFrame((frame) => {
  nowSeconds = frame.timeSeconds
  renderTdHud(nowSeconds, waves, guardian, tomes, restartMatch)
  probe?.tick(nowSeconds, waves, guardian, tomes)
})

// Player chat & console commands:
command('repair', (player: Player) => {
  guardian.repairByPlayer(player)
  persistHandoff()
})

command('upgrade', (player: Player) => {
  guardian.upgradeByPlayer(player)
  persistHandoff()
})

command('boon', (player: Player, args: string) => {
  const idx = Number(args.trim()) - 1
  if (Number.isNaN(idx) || idx < 0 || idx > 2) {
    toast(player, 'Usage: /boon 1, /boon 2, or /boon 3')
    return
  }
  tomes.chooseMajorBoon(player, idx, guardian)
  persistHandoff()
})

command('skipwave', (player: Player) => {
  if (guardian.matchState !== 'active') {
    toast(player, 'Match is not active. Type /restarttd first.')
    return
  }
  const spawnedWave = waves.spawnNextWave(nowSeconds, true)
  toast(player, `Forced Wave ${spawnedWave} early!`)
  persistHandoff()
})

command('boss', (player: Player) => {
  if (guardian.matchState !== 'active') {
    toast(player, 'Match is not active. Type /restarttd first.')
    return
  }
  const nextBossWave =
    (Math.floor(waves.wave / BOSS_WAVE_INTERVAL) + 1) * BOSS_WAVE_INTERVAL
  waves.wave = nextBossWave - 1
  const spawnedWave = waves.spawnNextWave(nowSeconds, true)
  toast(player, `Jumped to Boss Wave ${spawnedWave}!`)
  persistHandoff()
})

command('granttome', (player: Player) => {
  const randomTome =
    MINOR_TOME_POOL[Math.floor(Math.random() * MINOR_TOME_POOL.length)]
  tomes.applyMinorTome(player, randomTome)
  persistHandoff()
})

command('souls', (player: Player, args: string) => {
  const amount = Number(args.trim()) || 10_000
  player.adjustSouls(amount)
  toast(player, `Granted +${amount} Souls for testing!`)
})

command('hero', (player: Player, args: string) => {
  const query = args.trim()
  if (!query) {
    openHeroPickerForPlayer(player)
    toast(player, 'Opened Hero Selection UI.')
    return
  }
  const found = findHero(query)
  if (!found) {
    toast(player, `Unknown hero "${query}". Type /hero to open the Hero Picker.`)
    return
  }
  selectDefenderHero(player, found, nowSeconds)
})

command('restarttd', () => {
  restartMatch()
})
