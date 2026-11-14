// Hidden King's Defense — Modlock TypeScript Entry Point
// Combines Modlock's Wasm runtime, VData definition overrides, combat hooks,
// bot driving, and Panorama JSX HUD.

import {
  type ChatEvent,
  command,
  every,
  findHero,
  ground,
  handedOff,
  handoff,
  holdModifierState,
  log,
  onAbilityCast,
  onChat,
  onDamage,
  onDamaged,
  onFrame,
  onKill,
  onPlayerJoin,
  onPlayerLeave,
  onSettingChanged,
  onSpawn,
  onStart,
  onWorld,
  type Player,
  players,
  precache,
  readField,
  serverCommand,
  toast,
  type Vector,
  writeField,
} from 'modlock'

import {
  BOSS_HERO_POOL,
  BOSS_WAVE_INTERVAL,
  canExecuteDevCommand,
  canPlayerRestartActiveMatch,
  DEFENDER_TEAM,
  deserializeTdHandoff,
  EMPTY_SERVER_SHUTDOWN_DELAY_SECONDS,
  type EmptyServerWatchState,
  evaluateDefenderRespawnDue,
  evaluateEmptyServerShutdown,
  hasClockSteppedBackward,
  HERO_RESPAWN_TIME_SECONDS,
  isDefenderOutOfBoundsOrBelowMap,
  isLocalDevModeArgs,
  MINOR_TOME_POOL,
  parseSlashCommandLine,
  parseTomeGrowthPerWave,
  PLAYER_SPAWN_ANGLES,
  serializeTdHandoff,
  TD_PRECACHE_RESOURCES,
} from './src/config'
import { GuardianManager } from './src/guardian'
import {
  consumeHeroReselectPlacementReset,
  consumeImmediateHudSync,
  handleHudClockBackstep,
  invalidateHudSettingCache,
  openHeroPickerForPlayer,
  pollNativeShopStateEveryFrame,
  renderTdHud,
  requestImmediateHudSync,
  resetHudTransientState,
  selectDefenderHero,
  toggleCompactHudForPlayer,
  toggleLeaderboardForPlayer,
  toggleLegendaryShopForPlayer,
} from './src/hud'
import { LeaderboardManager } from './src/leaderboard'
import { TdProbe } from './src/probe'
import { TomeManager } from './src/tomes'
import { WaveManager } from './src/wave'

const guardian = new GuardianManager()
const tomes = new TomeManager()
const leaderboard = new LeaderboardManager()
const waves = new WaveManager(
  (milestoneWave) => {
    tomes.offerMajorBoonForWave(milestoneWave)
    if (guardian.matchState === 'active') {
      leaderboard.checkpointAllPlayers(Math.max(1, waves.wave), tomes, {
        requireProgressOnWave1: true,
      })
    }
  },
  (startedWave) => {
    if (guardian.matchState === 'active' && startedWave >= 2) {
      leaderboard.checkpointAllPlayers(startedWave, tomes)
    }
  },
)

/** Isolates repeating timer errors so Modlock's `timer.ts` never permanently cancels a loop (#32). */
function runTimerSafely(name: string, fn: () => void): void {
  try {
    fn()
  } catch (err) {
    log(`Timer [${name}] error: ${String(err)}`)
  }
}

let probe: TdProbe | undefined
let localDevMode = false
let devCommandsRegistered = false
let nowSeconds = 0
let lastHudPollAt = -1
let skipInitialWorldReset = false
let emptyServerWatch: EmptyServerWatchState = {
  hasSeenHuman: false,
  emptySinceSeconds: undefined,
  quitIssued: false,
}
const placedHeroKeyBySlot = new Map<number, string>()
const ziplineFallbackKeyBySlot = new Map<number, string>()
const shopStateHeldEntities = new Set<number>()
const diedAtBySlot = new Map<number, number>()
const lastRespawnAttemptBySlot = new Map<number, number>()
const postSpawnVerifyAtBySlot = new Map<number, number>()

/** Reconciles server timers and Panorama HUD caches when a dedicated host clock resets backward. */
function reconcileClockBackstep(prevNow: number, nextNow: number): void {
  log(
    `Detected server clock reset (${prevNow.toFixed(2)}s -> ${nextNow.toFixed(2)}s); reconciling timers & HUD state`,
  )
  diedAtBySlot.clear()
  lastRespawnAttemptBySlot.clear()
  postSpawnVerifyAtBySlot.clear()
  if (emptyServerWatch.emptySinceSeconds !== undefined) {
    emptyServerWatch = {
      ...emptyServerWatch,
      emptySinceSeconds: nextNow,
    }
  }
  lastHudPollAt = -1
  waves.handleClockBackstep(prevNow, nextNow)
  tomes.invalidateSettingCache()
  leaderboard.clearBoardCache()
  handleHudClockBackstep()
}

/** Ground-traces the target frontline anchor so defenders always spawn cleanly above the walkable floor mesh. */
function resolveSafeFrontlineOrigin(rawOrigin: Vector): Vector {
  const floor = ground(rawOrigin, { above: 220, below: 512 })
  if (floor) {
    return {
      x: rawOrigin.x,
      y: rawOrigin.y,
      z: Math.max(rawOrigin.z, floor.z + 12),
    }
  }
  return rawOrigin
}

/** Teleports a Team 2 defender onto the active frontline, falling back to `zipline('blue')` if teleport fails. */
function placeDefenderAtFrontline(
  player: Player,
  pawnKey: string,
  force = false,
): void {
  const spawnOrigin = resolveSafeFrontlineOrigin(guardian.getDefenderSpawnOrigin())
  if (player.teleport(spawnOrigin, PLAYER_SPAWN_ANGLES)) {
    placedHeroKeyBySlot.set(player.slot, pawnKey)
    ziplineFallbackKeyBySlot.delete(player.slot)
    postSpawnVerifyAtBySlot.set(player.slot, nowSeconds + 0.35)
    return
  }
  if (force || ziplineFallbackKeyBySlot.get(player.slot) !== pawnKey) {
    ziplineFallbackKeyBySlot.set(player.slot, pawnKey)
    if (player.zipline('blue')) {
      placedHeroKeyBySlot.set(player.slot, pawnKey)
      postSpawnVerifyAtBySlot.set(player.slot, nowSeconds + 0.35)
    }
  }
}

/**
 * Ensures defenders stay on Team 2, enforces the fixed 5-second respawn timer (#25),
 * recovers anyone spawned below the map mesh, and enables Buy Anywhere.
 */
function syncDefenderPlacementAndShopAccess(): void {
  for (const conn of players()) {
    if (conn.bot) {
      if (probe) {
        const botPawn = conn.player.pawn()
        if (
          botPawn &&
          botPawn.hero > 0 &&
          botPawn.health > 0 &&
          botPawn.team === DEFENDER_TEAM
        ) {
          waves.ensureDefenderShopAccess(botPawn.entity, botPawn.position)
        }
      }
      continue
    }
    const p = conn.player
    if (consumeHeroReselectPlacementReset(p.slot)) {
      placedHeroKeyBySlot.delete(p.slot)
      ziplineFallbackKeyBySlot.delete(p.slot)
      postSpawnVerifyAtBySlot.delete(p.slot)
      diedAtBySlot.delete(p.slot)
      lastRespawnAttemptBySlot.delete(p.slot)
    }
    const pawn = p.pawn()
    const lifeState = pawn
      ? (readField(pawn.entity, 'CBaseEntity', 'm_lifeState', 'uint8') as
          | number
          | undefined)
      : undefined
    const hasHero = Boolean(pawn && pawn.hero > 0)
    const isAlive = Boolean(
      pawn &&
        pawn.hero > 0 &&
        pawn.health > 0 &&
        (lifeState === undefined || lifeState === 0),
    )

    const respawnEval = evaluateDefenderRespawnDue({
      alive: isAlive,
      hasHero,
      nowSeconds,
      diedAtSeconds: diedAtBySlot.get(p.slot),
      lastRespawnAttemptAt: lastRespawnAttemptBySlot.get(p.slot),
      respawnDelaySeconds: HERO_RESPAWN_TIME_SECONDS,
    })
    if (respawnEval.nextDiedAtSeconds === undefined) {
      diedAtBySlot.delete(p.slot)
    } else {
      diedAtBySlot.set(p.slot, respawnEval.nextDiedAtSeconds)
    }
    if (respawnEval.nextLastRespawnAttemptAt === undefined) {
      lastRespawnAttemptBySlot.delete(p.slot)
    } else {
      lastRespawnAttemptBySlot.set(p.slot, respawnEval.nextLastRespawnAttemptAt)
    }

    if (!isAlive || !pawn) {
      // Source 2 reuses the same pawn handle across deaths, so clear placement keys while dead/unspawned.
      placedHeroKeyBySlot.delete(p.slot)
      ziplineFallbackKeyBySlot.delete(p.slot)
      postSpawnVerifyAtBySlot.delete(p.slot)
      if (pawn) {
        shopStateHeldEntities.delete(pawn.entity)
        if (hasHero && respawnEval.nextDiedAtSeconds !== undefined) {
          const targetRespawnAt =
            respawnEval.nextDiedAtSeconds + HERO_RESPAWN_TIME_SECONDS
          const curRespawnTime = readField(
            pawn.entity,
            'CCitadelPlayerPawn',
            'm_flRespawnTime',
            'float32',
          ) as number | undefined
          if (
            typeof curRespawnTime === 'number' &&
            curRespawnTime > targetRespawnAt + 0.25
          ) {
            writeField(
              pawn.entity,
              'CCitadelPlayerPawn',
              'm_flRespawnTime',
              'float32',
              targetRespawnAt,
            )
          }
          if (respawnEval.shouldCallRespawn) {
            p.respawn()
          }
        }
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
      if (conn.ready) {
        if (!shopStateHeldEntities.has(pawn.entity)) {
          holdModifierState(pawn.entity, 'MODIFIER_STATE_IN_SHOP', true)
          shopStateHeldEntities.add(pawn.entity)
        }
        waves.ensureDefenderShopAccess(pawn.entity, pawn.position)
      }
      const outOfBounds = isDefenderOutOfBoundsOrBelowMap(pawn.position)
      const verifyAt = postSpawnVerifyAtBySlot.get(p.slot)
      let forceVerifyReplace = false
      if (verifyAt !== undefined && nowSeconds >= verifyAt) {
        postSpawnVerifyAtBySlot.delete(p.slot)
        if (pawn.position.y < -9200 || outOfBounds) {
          forceVerifyReplace = true
        }
      }
      const isNewPawnKey = placedHeroKeyBySlot.get(p.slot) !== pawnKey
      if (isNewPawnKey || outOfBounds || forceVerifyReplace) {
        placeDefenderAtFrontline(p, pawnKey, outOfBounds || forceVerifyReplace)
        if (isNewPawnKey && guardian.matchState === 'active') {
          tomes.syncHeroModifiers(p, pawn.entity)
        }
      }
    }
  }
}

/** Saves state across live Modlock hot-reloads (`modlock run`). */
function persistHandoff(): void {
  const { playerTomes, playerKills } = tomes.exportRecords()
  const lbCheckpoint = leaderboard.exportCheckpointState()
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
      runId: leaderboard.runId,
      runRankedEligible: leaderboard.rankedEligible,
      runDisqualifyReason: leaderboard.disqualifyReason,
      runSubmittedSlots: [...leaderboard.submittedSlots],
      runReportedBestBySlot: lbCheckpoint.reportedBestBySlot,
      runReportedKillsBySlot: lbCheckpoint.reportedKillsBySlot,
      runReportSeq: lbCheckpoint.reportSeq,
    }),
  )
}

/** Restarts the Tower Defense match from Wave 1 and respawns all Team 2 structures. */
function restartMatch(): void {
  if (guardian.matchState === 'active') {
    leaderboard.checkpointAllPlayers(waves.wave, tomes, {
      requireProgressOnWave1: true,
    })
  }
  placedHeroKeyBySlot.clear()
  ziplineFallbackKeyBySlot.clear()
  shopStateHeldEntities.clear()
  diedAtBySlot.clear()
  lastRespawnAttemptBySlot.clear()
  postSpawnVerifyAtBySlot.clear()
  resetHudTransientState()
  guardian.respawnAllStructures(waves.devCheatsEnabled)
  waves.configureWorldForSingleLaneDefense(guardian)
  tomes.reset()
  tomes.setGrowthRateOverride(undefined)
  leaderboard.startNewRun()
  if (localDevMode) {
    leaderboard.markUnranked('--arg dev')
  }
  waves.cleanupForRestart(nowSeconds)
  for (const conn of players()) {
    const p = conn.player
    const pawn = p.pawn()
    if (pawn && pawn.team === DEFENDER_TEAM && pawn.hero > 0) {
      placeDefenderAtFrontline(p, `${pawn.entity}:${pawn.hero}`, true)
    }
    p.announce(
      "HIDDEN KING'S DEFENSE RESTARTED",
      'Wave 1 begins in 5 seconds! Defend the Base from Blue Guardian down to the Patron!',
    )
  }
  persistHandoff()
}

onStart((args) => {
  localDevMode = isLocalDevModeArgs(args)
  leaderboard.isLocalDev = localDevMode
  waves.devCheatsEnabled = localDevMode
  guardian.devCheatsEnabled = localDevMode

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
    leaderboard.restore(
      restored.runId,
      restored.runRankedEligible,
      restored.runDisqualifyReason,
      restored.runSubmittedSlots,
      {
        reportedBestBySlot: restored.runReportedBestBySlot,
        reportedKillsBySlot: restored.runReportedKillsBySlot,
        reportSeq: restored.runReportSeq,
      },
    )
    log(
      `Restored Hidden King's Defense state at Wave ${waves.wave} from hot-reload handoff`,
    )
  } else {
    guardian.matchState = 'active'
  }

  if (localDevMode) {
    enableLocalDevCommands()
    leaderboard.markUnranked('--arg dev')
    log(
      'Enabled local developer commands (/skipwave, /boss, /souls, /granttome, /tomescale) & sv_cheats via --arg dev [Unranked]',
    )
  }

  if (args.includes('probe')) {
    probe = new TdProbe()
    leaderboard.isProbeMode = true
    log("Started Hidden King's Defense in automated Probe self-test mode")
  }
})

onWorld((mapName) => {
  log(`World loaded: ${mapName}`)
  waves.configureWorldForSingleLaneDefense(guardian)
  if (skipInitialWorldReset) {
    skipInitialWorldReset = false
    requestImmediateHudSync()
    return
  }
  nowSeconds = 0
  lastHudPollAt = -1
  emptyServerWatch = {
    hasSeenHuman: false,
    emptySinceSeconds: undefined,
    quitIssued: false,
  }
  placedHeroKeyBySlot.clear()
  ziplineFallbackKeyBySlot.clear()
  shopStateHeldEntities.clear()
  diedAtBySlot.clear()
  lastRespawnAttemptBySlot.clear()
  postSpawnVerifyAtBySlot.clear()
  resetHudTransientState()
  guardian.reset()
  tomes.reset()
  leaderboard.startNewRun()
  if (localDevMode) {
    leaderboard.markUnranked('--arg dev')
  }
  waves.reset(nowSeconds)
  waves.configureWorldForSingleLaneDefense(guardian)
  persistHandoff()
})

onPlayerJoin((joined) => {
  if (!joined.connection.bot) {
    waves.unlockAllPlayerFlexSlots()
    requestImmediateHudSync()
  }
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
    "HIDDEN KING'S DEFENSE",
    'Defend Guardian -> Walker -> Shrines -> Patron! Last-hit creeps for a 10% Tome drop.',
  )
})

onPlayerLeave((left) => {
  if (!left.connection.bot && left.disconnected && guardian.matchState === 'active') {
    leaderboard.checkpointPlayer(
      left.connection.player,
      waves.wave,
      tomes.getKills(left.connection.player.slot),
      { requireProgressOnWave1: true },
    )
  }
  if (!left.connection.bot && left.disconnected && !probe) {
    let remainingHumans = 0
    for (const conn of players()) {
      if (!conn.bot && conn.player.slot !== left.connection.player.slot) {
        remainingHumans += 1
      }
    }
    const shutdownEval = evaluateEmptyServerShutdown(
      { ...emptyServerWatch, hasSeenHuman: true },
      remainingHumans,
      nowSeconds,
      false,
    )
    emptyServerWatch = shutdownEval.nextState
    if (shutdownEval.shouldQuit) {
      log(
        'Last human player disconnected — ending match and shutting down server (quit)',
      )
      serverCommand('quit')
    } else if (
      remainingHumans === 0 &&
      emptyServerWatch.emptySinceSeconds !== undefined
    ) {
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
    tomes.onDamaged(
      hit,
      new Set([hit.victim]),
      guardian,
      Math.random(),
      Math.random(),
      Math.max(1, waves.wave),
    )
  }
})

onSpawn((player, pawn) => {
  runTimerSafely('on-spawn', () => {
    if (pawn.team !== DEFENDER_TEAM || pawn.hero <= 0) {
      return
    }
    syncDefenderPlacementAndShopAccess()
    if (guardian.matchState === 'active') {
      tomes.syncHeroModifiers(player, pawn.entity)
    }
    requestImmediateHudSync()
  })
})

onSettingChanged((player, key) => {
  if (key === 'hud_mode') {
    invalidateHudSettingCache(player.slot)
  } else if (key === 'tome_scaling') {
    tomes.invalidateSettingCache()
    requestImmediateHudSync()
  }
})

onAbilityCast((cast) => {
  runTimerSafely('on-ability-cast', () => {
    if (guardian.matchState === 'active') {
      tomes.onAbilityCast(cast, nowSeconds)
    }
  })
})

onKill((kill) => {
  runTimerSafely('on-kill', () => {
    if (guardian.matchState !== 'active') {
      return
    }
    if (
      kill.attacker > 0 &&
      !guardian.isFriendlyStructureEntity(kill.attacker) &&
      waves.isEnemyRewardVictim(kill.victim)
    ) {
      tomes.onKill(
        kill,
        new Set([kill.victim]),
        guardian,
        Math.random(),
        Math.random(),
        Math.max(1, waves.wave),
      )
    }
    waves.handleEntityKilled(kill)
  })
})

// Drive active Enemy Hero Bosses & vanilla steered Center Lane creeps at 10 Hz
// (decoupled from HUD rendering so combat exceptions or spikes cannot disturb UI updates).
every(0.1, () => {
  runTimerSafely('combat-10hz', () => {
    if (guardian.matchState === 'active' && !waves.waitingForDefenderHero) {
      waves.tickActiveBosses(nowSeconds, guardian)
      waves.tickSteeredWaveCreeps(0.1, guardian)
    }
  })
})

// Fast 250ms pass for defender spawn placement, Buy Anywhere shop access (#31),
// and Graves Zombie proximity checks (0 host calls when empty).
every(0.25, () => {
  runTimerSafely('world-4hz', () => {
    syncDefenderPlacementAndShopAccess()
    if (guardian.matchState === 'active') {
      waves.purgeFriendlyAndSideLaneTroopers()
    }
    if (guardian.matchState === 'active' && !waves.waitingForDefenderHero) {
      waves.tickExplodingZombies(nowSeconds, guardian)
    }
  })
})

// 500ms pass to sync newly dismounted creep HP & elite entity modifiers.
every(0.5, () => {
  runTimerSafely('creep-scale-2hz', () => {
    if (guardian.matchState === 'active' && !waves.waitingForDefenderHero) {
      waves.scaleNewlySpawnedCreeps(nowSeconds)
    }
  })
})

// 1-second tick for wave scheduling, Base Defense monitoring, and empty-server watch.
every(1, () => {
  runTimerSafely('wave-1hz', () => {
    guardian.poll(waves.wave, nowSeconds)
    if (guardian.matchState === 'defeat') {
      leaderboard.checkpointAllPlayers(waves.wave, tomes)
    }

    let humanCount = 0
    for (const conn of players()) {
      if (!conn.bot) {
        humanCount += 1
      }
    }
    if (guardian.matchState === 'active') {
      tomes.tickVanillaCooldowns(nowSeconds)
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
        'No human players remaining — ending match and shutting down server (quit)',
      )
      serverCommand('quit')
      return
    }

    waves.tick(nowSeconds, guardian.matchState === 'active', guardian)
  })
})

// Persist hot-reload state every 5 seconds (instead of on every kill/second).
every(5, () => {
  runTimerSafely('handoff-5s', () => {
    persistHandoff()
  })
})

onFrame((frame) => {
  if (hasClockSteppedBackward(nowSeconds, frame.timeSeconds)) {
    reconcileClockBackstep(nowSeconds, frame.timeSeconds)
  }
  nowSeconds = frame.timeSeconds
  probe?.tick(nowSeconds, waves, guardian, tomes)
  try {
    pollNativeShopStateEveryFrame(nowSeconds)
  } catch (err) {
    log('shop-poll error:', String(err))
  }
  const forceHud = consumeImmediateHudSync()
  if (
    forceHud ||
    lastHudPollAt < 0 ||
    nowSeconds < lastHudPollAt ||
    nowSeconds - lastHudPollAt >= 0.25
  ) {
    lastHudPollAt = nowSeconds
    runTimerSafely('hud-frame', () => {
      renderTdHud(
        nowSeconds,
        waves,
        guardian,
        tomes,
        leaderboard,
        restartMatch,
      )
    })
  }
})

// Register slash commands for BOTH All-Chat/console (`command()`) and Team Chat (`onChat` with `!line.all`).
type TdCommandHandler = (player: Player, args: string) => void
const teamChatCommandHandlers = new Map<string, TdCommandHandler>()

function registerTdCommand(name: string, handler: TdCommandHandler): void {
  const key = name.toLowerCase()
  teamChatCommandHandlers.set(key, handler)
  command(key, handler)
}

function canPlayerUseDevCommands(player: Player): boolean {
  const conn = player.connection()
  return canExecuteDevCommand({
    devModeEnabled: localDevMode,
    isBot: conn?.bot ?? true,
    roles: conn?.roles ?? [],
  })
}

function registerDevCommand(name: string, handler: TdCommandHandler): void {
  registerTdCommand(name, (player: Player, args: string) => {
    if (!canPlayerUseDevCommands(player)) {
      toast(
        player,
        'Dev commands are disabled. Run locally with --arg dev to test.',
      )
      return
    }
    handler(player, args)
  })
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
  tomes.chooseMajorBoon(player, idx, guardian, Math.max(1, waves.wave))
  persistHandoff()
})

// Developer/sandbox commands are registered ONLY when started with `--arg dev`.
function enableLocalDevCommands(): void {
  if (devCommandsRegistered) {
    return
  }
  devCommandsRegistered = true

  registerDevCommand('skipwave', (player: Player) => {
    if (guardian.matchState !== 'active') {
      toast(player, 'Match is not active. Type /restarttd first.')
      return
    }
    const newlyUnranked = leaderboard.markUnranked('/skipwave')
    const spawnedWave = waves.spawnNextWave(nowSeconds, true)
    toast(
      player,
      `Forced Wave ${spawnedWave} early!${newlyUnranked ? ' [Unranked sandbox run]' : ''}`,
    )
    persistHandoff()
  })

  registerDevCommand('boss', (player: Player) => {
    if (guardian.matchState !== 'active') {
      toast(player, 'Match is not active. Type /restarttd first.')
      return
    }
    const newlyUnranked = leaderboard.markUnranked('/boss')
    const nextBossWave =
      (Math.floor(waves.wave / BOSS_WAVE_INTERVAL) + 1) * BOSS_WAVE_INTERVAL
    waves.wave = nextBossWave - 1
    const spawnedWave = waves.spawnNextWave(nowSeconds, true)
    toast(
      player,
      `Jumped to Boss Wave ${spawnedWave}!${newlyUnranked ? ' [Unranked sandbox run]' : ''}`,
    )
    persistHandoff()
  })

  registerDevCommand('granttome', (player: Player) => {
    const newlyUnranked = leaderboard.markUnranked('/granttome')
    const randomTome =
      MINOR_TOME_POOL[Math.floor(Math.random() * MINOR_TOME_POOL.length)]
    tomes.applyMinorTome(player, randomTome, Math.max(1, waves.wave))
    if (newlyUnranked) {
      toast(player, 'Run marked unranked sandbox (/granttome).')
    }
    persistHandoff()
  })

  registerDevCommand('tomescale', (player: Player, args: string) => {
    const trimmed = args.trim().toLowerCase()
    const wave = Math.max(1, waves.wave)
    if (!trimmed) {
      const rate = tomes.getGrowthRate(nowSeconds)
      const mult = tomes.getWaveMultiplier(wave, nowSeconds)
      toast(
        player,
        `Tome scaling: +${(rate * 100).toFixed(1).replace(/\.0$/, '')}%/wave (Wave ${wave} = ${mult.toFixed(2)}x). Usage: /tomescale <0..50> or /tomescale reset`,
      )
      return
    }
    if (trimmed === 'reset' || trimmed === 'default') {
      tomes.setGrowthRateOverride(undefined)
      const rate = tomes.getGrowthRate(nowSeconds)
      const mult = tomes.getWaveMultiplier(wave, nowSeconds)
      toast(
        player,
        `Reset Tome scaling to lobby setting (+${(rate * 100).toFixed(1).replace(/\.0$/, '')}%/wave · Wave ${wave} = ${mult.toFixed(2)}x).`,
      )
      return
    }
    const newlyUnranked = leaderboard.markUnranked('/tomescale')
    const rate = parseTomeGrowthPerWave(trimmed)
    tomes.setGrowthRateOverride(rate)
    const mult = tomes.getWaveMultiplier(wave, nowSeconds)
    toast(
      player,
      `Set Tome scaling to +${(rate * 100).toFixed(1).replace(/\.0$/, '')}%/wave (Wave ${wave} = ${mult.toFixed(2)}x)!${newlyUnranked ? ' [Unranked sandbox run]' : ''}`,
    )
    persistHandoff()
  })

  registerDevCommand('souls', (player: Player, args: string) => {
    const newlyUnranked = leaderboard.markUnranked('/souls')
    const amount = Number(args.trim()) || 10_000
    player.adjustSouls(amount)
    toast(
      player,
      `Granted +${amount} Souls for testing!${newlyUnranked ? ' [Unranked sandbox run]' : ''}`,
    )
    persistHandoff()
  })
}

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

registerTdCommand('leaderboard', (player: Player) => {
  const opened = toggleLeaderboardForPlayer(player)
  toast(
    player,
    opened
      ? "Opened Hidden King's Defense Leaderboard."
      : "Closed Hidden King's Defense Leaderboard.",
  )
})

registerTdCommand('lb', (player: Player) => {
  const opened = toggleLeaderboardForPlayer(player)
  toast(
    player,
    opened
      ? "Opened Hidden King's Defense Leaderboard."
      : "Closed Hidden King's Defense Leaderboard.",
  )
})

registerTdCommand('t5', (player: Player) => {
  const opened = toggleLegendaryShopForPlayer(player)
  toast(
    player,
    opened ? 'Opened Legendary Armory (Tier 5).' : 'Closed Legendary Armory.',
  )
})

registerTdCommand('hud', (player: Player) => {
  toggleCompactHudForPlayer(player)
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

registerTdCommand('restarttd', (player: Player) => {
  let humanPlayerCount = 0
  for (const conn of players()) {
    if (!conn.bot) {
      humanPlayerCount += 1
    }
  }
  if (
    !canPlayerRestartActiveMatch({
      matchState: guardian.matchState === 'defeat' ? 'defeat' : 'active',
      humanPlayerCount,
      isLocalDevPlayer: canPlayerUseDevCommands(player),
    })
  ) {
    toast(player, 'Cannot /restarttd while co-op defenders are still fighting!')
    return
  }
  restartMatch()
})
