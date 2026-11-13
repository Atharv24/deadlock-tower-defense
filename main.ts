// Deadlock Tower Defense — Modlock TypeScript Entry Point
// Combines Modlock's Wasm runtime, VData definition overrides, combat hooks,
// bot driving, and Panorama JSX HUD.

import {
  type ChatEvent,
  command,
  every,
  findHero,
  handedOff,
  handoff,
  holdModifierState,
  log,
  onChat,
  onDamage,
  onDamaged,
  onFrame,
  onPlayerJoin,
  onPlayerLeave,
  onStart,
  onWorld,
  type Player,
  players,
  precache,
  serverCommand,
  toast,
} from 'modlock'

import {
  BOSS_HERO_POOL,
  BOSS_WAVE_INTERVAL,
  DEFENDER_TEAM,
  deserializeTdHandoff,
  EMPTY_SERVER_SHUTDOWN_DELAY_SECONDS,
  type EmptyServerWatchState,
  evaluateEmptyServerShutdown,
  MINOR_TOME_POOL,
  parseSlashCommandLine,
  PLAYER_SPAWN_ANGLES,
  PLAYER_SPAWN_ORIGIN,
  serializeTdHandoff,
  TD_PRECACHE_RESOURCES,
} from './src/config'
import { GuardianManager } from './src/guardian'
import {
  consumeHeroReselectPlacementReset,
  openHeroPickerForPlayer,
  renderTdHud,
  resetHudTransientState,
  selectDefenderHero,
  toggleLegendaryShopForPlayer,
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
let emptyServerWatch: EmptyServerWatchState = {
  hasSeenHuman: false,
  emptySinceSeconds: undefined,
  quitIssued: false,
}
const placedHeroKeyBySlot = new Map<number, string>()
const ziplineFallbackKeyBySlot = new Map<number, string>()
const shopStateHeldEntities = new Set<number>()

/** Teleports a Team 2 defender onto the active frontline, falling back to `zipline('blue')` if teleport fails. */
function placeDefenderAtFrontline(
  player: Player,
  pawnKey: string,
  force = false,
): void {
  const spawnOrigin = guardian.getDefenderSpawnOrigin()
  if (player.teleport(spawnOrigin, PLAYER_SPAWN_ANGLES)) {
    placedHeroKeyBySlot.set(player.slot, pawnKey)
    ziplineFallbackKeyBySlot.delete(player.slot)
    return
  }
  if (force || ziplineFallbackKeyBySlot.get(player.slot) !== pawnKey) {
    ziplineFallbackKeyBySlot.set(player.slot, pawnKey)
    if (player.zipline('blue')) {
      placedHeroKeyBySlot.set(player.slot, pawnKey)
    }
  }
}

/** Ensures newly spawned/respawned defenders are on Team 2, placed at the frontline, and able to buy anywhere. */
function syncDefenderPlacementAndShopAccess(): void {
  for (const conn of players()) {
    if (conn.bot) continue
    const p = conn.player
    if (consumeHeroReselectPlacementReset(p.slot)) {
      placedHeroKeyBySlot.delete(p.slot)
      ziplineFallbackKeyBySlot.delete(p.slot)
    }
    const pawn = p.pawn()
    if (!pawn || pawn.hero <= 0 || pawn.health <= 0) {
      // Source 2 reuses the same pawn handle across deaths, so clear placement keys while dead/unspawned.
      placedHeroKeyBySlot.delete(p.slot)
      ziplineFallbackKeyBySlot.delete(p.slot)
      if (pawn) {
        shopStateHeldEntities.delete(pawn.entity)
      }
      continue
    }
    const pawnKey = `${pawn.entity}:${pawn.hero}`
    if (conn.ready && pawn.team === 3) {
      p.changeTeam(DEFENDER_TEAM)
      placeDefenderAtFrontline(p, pawnKey, true)
      continue
    }
    if (pawn.team === DEFENDER_TEAM) {
      if (conn.ready && !shopStateHeldEntities.has(pawn.entity)) {
        holdModifierState(pawn.entity, 'MODIFIER_STATE_IN_SHOP', true)
        shopStateHeldEntities.add(pawn.entity)
      }
      const outOfBounds =
        pawn.position.z < -900 || Math.abs(pawn.position.y) > 11500
      if (placedHeroKeyBySlot.get(p.slot) !== pawnKey || outOfBounds) {
        placeDefenderAtFrontline(p, pawnKey, outOfBounds)
      }
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
      patronReachedStage2: guardian.patronReachedStage2,
      scaledCreeps: [...waves.scaledCreeps],
      explodingZombies: waves.exportExplodingZombieHandles(),
      rewardedCreeps: [...tomes.rewardedCreeps],
      playerTomes,
      playerKills,
    }),
  )
}

/** Restarts the Tower Defense match from Wave 1 and respawns all Team 2 structures. */
function restartMatch(): void {
  placedHeroKeyBySlot.clear()
  ziplineFallbackKeyBySlot.clear()
  shopStateHeldEntities.clear()
  resetHudTransientState()
  guardian.respawnAllStructures()
  waves.configureWorldForSingleLaneDefense(guardian)
  tomes.reset()
  waves.cleanupForRestart(nowSeconds)
  for (const conn of players()) {
    const p = conn.player
    const pawn = p.pawn()
    if (pawn && pawn.team === DEFENDER_TEAM && pawn.hero > 0) {
      placeDefenderAtFrontline(p, `${pawn.entity}:${pawn.hero}`, true)
    }
    p.announce(
      'TOWER DEFENSE RESTARTED',
      'Wave 1 begins in 5 seconds! Defend the Base from Blue Guardian down to the Patron!',
    )
  }
  persistHandoff()
}

onStart((args) => {
  precache({
    heroes: [...BOSS_HERO_POOL, 'hero_inferno'],
    resources: TD_PRECACHE_RESOURCES,
  })
  waves.applyServerConfig()

  const restored = deserializeTdHandoff(handedOff())
  if (restored) {
    skipInitialWorldReset = true
    waves.restore(
      restored.wave,
      restored.nextWaveTime,
      restored.scaledCreeps,
      restored.explodingZombies ?? [],
    )
    guardian.restore(
      restored.guardianUpgradeLevel,
      restored.guardianBonusMaxHp,
      restored.matchState,
      restored.patronReachedStage2 ?? false,
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
  waves.configureWorldForSingleLaneDefense(guardian)
  if (skipInitialWorldReset) {
    skipInitialWorldReset = false
    return
  }
  placedHeroKeyBySlot.clear()
  ziplineFallbackKeyBySlot.clear()
  shopStateHeldEntities.clear()
  resetHudTransientState()
  guardian.reset()
  tomes.reset()
  waves.reset(nowSeconds)
  waves.configureWorldForSingleLaneDefense(guardian)
  persistHandoff()
})

onPlayerJoin((joined) => {
  if (!joined.connection.bot && !probe) {
    if (emptyServerWatch.emptySinceSeconds !== undefined) {
      log('Human player reconnected — cancelled empty-server shutdown timer')
    }
    emptyServerWatch = {
      hasSeenHuman: true,
      emptySinceSeconds: undefined,
      quitIssued: false,
    }
  }
  joined.connection.player.announce(
    'DEADLOCK TOWER DEFENSE',
    'Defend Guardian -> Walker -> Shrines -> Patron! Last-hit creeps for a 10% Tome drop.',
  )
})

onPlayerLeave((left) => {
  if (!left.connection.bot && left.disconnected && !probe) {
    let remainingHumans = 0
    for (const conn of players()) {
      if (!conn.bot && conn.player.slot !== left.connection.player.slot) {
        remainingHumans += 1
      }
    }
    if (
      remainingHumans === 0 &&
      emptyServerWatch.hasSeenHuman &&
      emptyServerWatch.emptySinceSeconds === undefined
    ) {
      emptyServerWatch = {
        ...emptyServerWatch,
        emptySinceSeconds: nowSeconds,
      }
      log(
        `All human players disconnected — shutting down server in ${EMPTY_SERVER_SHUTDOWN_DELAY_SECONDS}s unless someone reconnects`,
      )
    }
  }
})

onDamage((hit) => {
  if (guardian.matchState !== 'active') {
    return
  }
  return waves.modifyIncomingDamage(hit, guardian, tomes)
})

onDamaged((hit) => {
  if (guardian.matchState !== 'active') {
    return
  }
  waves.handleCreepPostDamage(hit, guardian, nowSeconds)
  // Gate Tome evaluation strictly on lethal enemy kills so non-lethal bullets,
  // pellets, and burn ticks execute 0 entity scans (#18).
  if (
    hit.healthBefore > 0 &&
    hit.healthLost >= hit.healthBefore &&
    hit.attacker > 0 &&
    !guardian.isFriendlyStructureEntity(hit.attacker) &&
    waves.isEnemyRewardVictim(hit.victim)
  ) {
    tomes.onDamaged(hit, new Set([hit.victim]), guardian)
  }
})

// Refresh Panorama JSX HUD (memoized on state change) and drive active Enemy Hero
// Bosses & vanilla steered Center Lane creeps at 10 Hz.
every(0.1, () => {
  if (guardian.matchState === 'active' && !waves.waitingForDefenderHero) {
    waves.tickActiveBosses(nowSeconds, guardian)
    waves.tickSteeredWaveCreeps(0.1, guardian)
  }
  renderTdHud(nowSeconds, waves, guardian, tomes, restartMatch)
})

// Fast 250ms pass for defender spawn placement, Buy Anywhere shop state,
// Graves Zombie proximity checks (0 host calls when empty), and Tome CDR.
every(0.25, () => {
  syncDefenderPlacementAndShopAccess()
  if (guardian.matchState === 'active' && !waves.waitingForDefenderHero) {
    waves.tickExplodingZombies(nowSeconds, guardian)
    tomes.tickVanillaCooldowns(nowSeconds)
  }
})

// 500ms pass to sync newly dismounted creep HP & elite entity modifiers.
every(0.5, () => {
  if (guardian.matchState === 'active' && !waves.waitingForDefenderHero) {
    waves.scaleNewlySpawnedCreeps(nowSeconds)
  }
})

// 1-second tick for wave scheduling, Base Defense monitoring, and empty-server watch.
every(1, () => {
  guardian.poll(waves.wave, nowSeconds)

  let humanCount = 0
  for (const conn of players()) {
    if (!conn.bot) {
      humanCount += 1
    }
  }
  if (guardian.matchState === 'active') {
    tomes.tickVanillaRegen()
  }

  const prevEmptySince = emptyServerWatch.emptySinceSeconds
  const shutdownEval = evaluateEmptyServerShutdown(
    emptyServerWatch,
    humanCount,
    nowSeconds,
    probe !== undefined,
  )
  emptyServerWatch = shutdownEval.nextState
  if (
    prevEmptySince === undefined &&
    emptyServerWatch.emptySinceSeconds !== undefined &&
    !shutdownEval.shouldQuit
  ) {
    log(
      `All human players disconnected — shutting down server in ${EMPTY_SERVER_SHUTDOWN_DELAY_SECONDS}s unless someone reconnects`,
    )
  } else if (
    prevEmptySince !== undefined &&
    emptyServerWatch.emptySinceSeconds === undefined
  ) {
    log('Human player reconnected — cancelled empty-server shutdown timer')
  }
  if (shutdownEval.shouldQuit) {
    log(
      `No human players connected for ${EMPTY_SERVER_SHUTDOWN_DELAY_SECONDS}s — shutting down server (quit)`,
    )
    serverCommand('quit')
    return
  }

  waves.tick(nowSeconds, guardian.matchState === 'active', guardian)
})

// Persist hot-reload state every 5 seconds (instead of on every kill/second).
every(5, () => {
  persistHandoff()
})

onFrame((frame) => {
  nowSeconds = frame.timeSeconds
  probe?.tick(nowSeconds, waves, guardian, tomes)
})

// Register slash commands for BOTH All-Chat/console (`command()`) and Team Chat (`onChat` with `!line.all`).
type TdCommandHandler = (player: Player, args: string) => void
const teamChatCommandHandlers = new Map<string, TdCommandHandler>()

function registerTdCommand(name: string, handler: TdCommandHandler): void {
  const key = name.toLowerCase()
  teamChatCommandHandlers.set(key, handler)
  command(key, handler)
}

onChat((line: ChatEvent) => {
  if (line.all) {
    return
  }
  const parsed = parseSlashCommandLine(line.text)
  if (!parsed) {
    return
  }
  const handler = teamChatCommandHandlers.get(parsed.name)
  if (handler) {
    handler(line.player, parsed.args)
  }
})

// Player chat & console commands (available in both Team Chat and All-Chat):
registerTdCommand('repair', (player: Player) => {
  guardian.repairByPlayer(player)
  persistHandoff()
})

registerTdCommand('upgrade', (player: Player) => {
  guardian.upgradeByPlayer(player)
  persistHandoff()
})

registerTdCommand('boon', (player: Player, args: string) => {
  const idx = Number(args.trim()) - 1
  if (Number.isNaN(idx) || idx < 0 || idx > 2) {
    toast(player, 'Usage: /boon 1, /boon 2, or /boon 3')
    return
  }
  tomes.chooseMajorBoon(player, idx, guardian)
  persistHandoff()
})

registerTdCommand('skipwave', (player: Player) => {
  if (guardian.matchState !== 'active') {
    toast(player, 'Match is not active. Type /restarttd first.')
    return
  }
  const spawnedWave = waves.spawnNextWave(nowSeconds, true)
  toast(player, `Forced Wave ${spawnedWave} early!`)
  persistHandoff()
})

registerTdCommand('boss', (player: Player) => {
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

registerTdCommand('granttome', (player: Player) => {
  const randomTome =
    MINOR_TOME_POOL[Math.floor(Math.random() * MINOR_TOME_POOL.length)]
  tomes.applyMinorTome(player, randomTome)
  persistHandoff()
})

registerTdCommand('souls', (player: Player, args: string) => {
  const amount = Number(args.trim()) || 10_000
  player.adjustSouls(amount)
  toast(player, `Granted +${amount} Souls for testing!`)
})

registerTdCommand('hero', (player: Player, args: string) => {
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

registerTdCommand('legendary', (player: Player) => {
  const opened = toggleLegendaryShopForPlayer(player)
  toast(
    player,
    opened ? 'Opened Legendary Armory (Tier 5).' : 'Closed Legendary Armory.',
  )
})

registerTdCommand('t5', (player: Player) => {
  const opened = toggleLegendaryShopForPlayer(player)
  toast(
    player,
    opened ? 'Opened Legendary Armory (Tier 5).' : 'Closed Legendary Armory.',
  )
})

registerTdCommand('unstuck', (player: Player) => {
  const pawn = player.pawn()
  if (!pawn || pawn.hero <= 0 || pawn.health <= 0) {
    toast(player, 'Spawn a living hero first.')
    return
  }
  if (pawn.team !== DEFENDER_TEAM) {
    player.changeTeam(DEFENDER_TEAM)
  }
  placeDefenderAtFrontline(player, `${pawn.entity}:${pawn.hero}`, true)
  toast(player, 'Moved hero to active defense frontline!')
})

registerTdCommand('restarttd', () => {
  restartMatch()
})
