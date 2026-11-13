// Wave state machine, per-entity creep scaling (never healing damaged creeps
// mid-fight), Center Lane zipline & varied wave neutral spawning, Graves Zombie
// kamikaze detonation, and Boss Hero waves.

import {
  addBot,
  Buttons,
  damage,
  type DamagedEvent,
  type DamageEvent,
  type DamageResult,
  emitSound,
  entityClass,
  entityPosition,
  findEntities,
  fireInput,
  holdModifierState,
  killEntity,
  Layers,
  log,
  Npc,
  type Player,
  players,
  readField,
  removeEntities,
  serverCommand,
  spawnNpc,
  toast,
  trace,
  type Vector,
  writeField,
} from 'modlock'

import {
  type BossAiState,
  type BossGuardianCandidate,
  type BossHeroCandidate,
  computeBossAbilityUpgradeMask,
  createBossAiState,
  distance3D,
  getBossWaypointsForObjective,
  planBossDriveStep,
} from './boss_ai'
import {
  BOSS_SPAWN_ANGLES,
  BOSS_SPAWN_ORIGIN,
  computeVanillaEffectiveHpDamageScale,
  computeWaveCreepDamageMult,
  computeWaveCreepHp,
  computeWaveCreepScale,
  computeWaveSoulReward,
  computeWaveSpawnIntervalSeconds,
  DEFENDER_TEAM,
  evaluateCreepHealthSync,
  getBossWaveSpec,
  getWaveCreepModifiers,
  getWaveNeutralSpawns,
  INITIAL_WAVE_DELAY_SECONDS,
  isBossWave,
  isExplodingZombieIdentity,
  isWithinZombieDetonationRange,
  MAX_ACTIVE_CREEPS_FOR_WAVE_NEUTRALS,
  selectUnscaledCreeps,
  TD_SERVER_CVARS,
  WAVE_INTERVAL_SECONDS,
  ZIPLINE_SQUAD_SIZE,
  ZOMBIE_ARM_FUSE_SECONDS,
  ZOMBIE_BASE_KAMIKAZE_DAMAGE,
} from './config'
import type { GuardianManager } from './guardian'
import type { TomeManager } from './tomes'

export interface CreepWaveSpec {
  readonly wave: number
  readonly targetHp: number
  readonly targetScale: number
  readonly damageMult: number
  readonly isExplodingZombie: boolean
}

interface LiveCreepSnapshot {
  readonly handle: number
  readonly health: number
  readonly maxHealth: number
  readonly position?: Vector
}

export interface ActiveBoss {
  readonly wave: number
  readonly tier: number
  readonly bot: Player
  readonly hero: string
  readonly modifier: string
  readonly targetMaxHp: number
  readonly endlessBoostStacks: number
  readonly extraSizeStacks: number
  readonly targetScale: number
  readonly damageMult: number
  readonly spawnOrigin: { readonly x: number; readonly y: number; readonly z: number }
  readonly ai: BossAiState
  pawnEntity: number
  configuredPawnEntity: number
  currentHp: number
  currentMaxHp: number
  vanillaMaxHpTarget: number
  appliedScale: number
  initialHealDone: boolean
}

interface SteeredWaveCreep {
  readonly npc: Npc
  readonly kind: 'ranged_neutral' | 'shambler'
  readonly routeIndex: 0 | 1
  waypointIndex: number
}

const BOSS_SPAWN_X_OFFSETS = [-165, -55, 55, 165] as const

export class WaveManager {
  wave = 0
  nextWaveTime = INITIAL_WAVE_DELAY_SECONDS
  waveInterval = WAVE_INTERVAL_SECONDS
  aliveCreepCount = 0
  waitingForDefenderHero = false
  readonly scaledCreeps = new Set<number>()
  readonly creepSpecs = new Map<number, CreepWaveSpec>()
  readonly explodingZombies = new Set<number>()
  readonly armedZombies = new Map<number, number>()
  readonly detonatedZombies = new Set<number>()
  readonly spawnedWaveNeutrals: Npc[] = []
  readonly activeBosses: ActiveBoss[] = []
  private readonly steeredWaveCreeps = new Map<number, SteeredWaveCreep>()
  private cachedBuildingTargets?: {
    readonly walkers: { readonly entity: number; readonly pos: Vector }[]
    readonly baseGuardians: { readonly entity: number; readonly pos: Vector }[]
    readonly shrines: { readonly entity: number; readonly pos: Vector }[]
    readonly patrons: { readonly entity: number; readonly pos: Vector }[]
  }
  private restoreIntervalAt = 0
  private readonly onMilestoneWaveCallback?: (wave: number) => void

  constructor(onMilestoneWave?: (wave: number) => void) {
    this.onMilestoneWaveCallback = onMilestoneWave
  }

  /** Applies server CVars for single-lane Tower Defense. */
  applyServerConfig(): void {
    for (const [cvar, val] of TD_SERVER_CVARS) {
      serverCommand(`${cvar} ${val}`)
    }
  }

  /**
   * Configures stock `dl_midtown` (or `hl_defense`) at runtime for Center Lane (Lane 4)
   * Tower Defense: removes all static neutral camps, disables spawning on all Team 2 and
   * side-lane (Lane 1 & Lane 6) `info_trooper_spawn` entities (keeping spawner handles
   * alive so C++ `CTrooperSpawnManager` wave controllers never dereference null), and
   * ensures the Friendly Blue T1 Guardian stands at `[0, -1792, 384]`.
   */
  configureWorldForSingleLaneDefense(guardian: GuardianManager): void {
    for (const camp of findEntities('info_neutral_trooper_camp')) {
      fireInput(camp, 'SetDisabled', { boolean: true })
      fireInput(camp, 'RemoveNeutrals')
      fireInput(camp, 'Kill')
    }
    removeEntities('info_neutral_trooper_camp')
    removeEntities('info_neutral_trooper_spawn')
    removeEntities('npc_trooper_neutral')

    let disabledTrooperSpawns = 0
    for (const sp of findEntities('info_trooper_spawn')) {
      const team = readField(sp, 'CBaseEntity', 'm_iTeamNum', 'int32')
      const lane = readField(sp, 'CInfoTrooperSpawn', 'm_iLane', 'int32')
      if (team === 3 && lane === 4) {
        fireInput(sp, 'SetSpawningEnabled', { boolean: true })
      } else {
        fireInput(sp, 'SetSpawningEnabled', { boolean: false })
        disabledTrooperSpawns += 1
      }
    }

    // Clear any stray friendly or side-lane troopers that spawned during initial map load
    for (const tr of findEntities('npc_trooper')) {
      const npc = new Npc(tr).read()
      if (npc && (npc.team !== 3 || Math.abs(npc.position.x) > 2800)) {
        killEntity({ victim: tr })
      }
    }

    const guardianEnt = guardian.ensureCenterLaneGuardianSpawned()
    if (disabledTrooperSpawns > 0) {
      log(
        `Configured single-lane defense world (disabled ${disabledTrooperSpawns} non-Center-Enemy trooper spawners, Guardian=${guardianEnt})`,
      )
    }
  }

  /** Resets wave state for a new world or /restarttd. */
  reset(now: number): void {
    this.cleanupBosses()
    this.wave = 0
    this.nextWaveTime = now + INITIAL_WAVE_DELAY_SECONDS
    this.aliveCreepCount = 0
    this.waitingForDefenderHero = false
    this.scaledCreeps.clear()
    this.creepSpecs.clear()
    this.explodingZombies.clear()
    this.armedZombies.clear()
    this.detonatedZombies.clear()
    this.spawnedWaveNeutrals.length = 0
    this.steeredWaveCreeps.clear()
    this.cachedBuildingTargets = undefined
    this.restoreIntervalAt = 0
    this.applyServerConfig()
  }

  /** Restores state from Modlock hot-reload handoff. */
  restore(
    wave: number,
    nextWaveTime: number,
    scaledCreeps: readonly number[],
    explodingZombies: readonly number[] = [],
  ): void {
    this.wave = wave
    this.nextWaveTime = nextWaveTime
    this.waitingForDefenderHero = false
    this.scaledCreeps.clear()
    this.creepSpecs.clear()
    this.explodingZombies.clear()
    this.armedZombies.clear()
    this.detonatedZombies.clear()
    this.spawnedWaveNeutrals.length = 0
    this.steeredWaveCreeps.clear()
    this.cachedBuildingTargets = undefined
    this.restoreIntervalAt = 0

    const effectiveWave = Math.max(1, wave)
    for (const handle of scaledCreeps) {
      this.scaledCreeps.add(handle)
      this.creepSpecs.set(handle, {
        wave: effectiveWave,
        targetHp: computeWaveCreepHp(effectiveWave),
        targetScale: computeWaveCreepScale(effectiveWave),
        damageMult: computeWaveCreepDamageMult(effectiveWave),
        isExplodingZombie: false,
      })
    }
    void explodingZombies
    this.adoptOrphanedBossBots(0)
  }

  /** Lists live exploding zombie entity handles for hot-reload handoff persistence. */
  exportExplodingZombieHandles(): number[] {
    return [...this.explodingZombies]
  }

  /** Removes all active enemy Boss bots and leftover creeps on restart. */
  cleanupForRestart(now: number): void {
    this.cleanupBosses()
    for (const npc of this.spawnedWaveNeutrals) {
      npc.remove()
    }
    this.spawnedWaveNeutrals.length = 0
    for (const handle of this.collectLiveCreepHandles()) {
      killEntity({ victim: handle })
    }
    this.reset(now)
  }

  /** Reports whether at least one defender has spawned with a selected hero (`pawn.hero > 0`). */
  hasActiveDefenderHero(): boolean {
    const conns = players()
    const humanConns = conns.filter((c) => !c.bot && c.ready)
    if (humanConns.length > 0) {
      return humanConns.some((c) => (c.player.pawn()?.hero ?? 0) > 0)
    }
    return conns.some((c) => {
      const pawn = c.player.pawn()
      return Boolean(pawn && pawn.team === DEFENDER_TEAM && pawn.hero > 0)
    })
  }

  /** Advances wave timer, restores zipline interval after /skipwave, scales creeps, and ticks Bosses. */
  tick(now: number, matchActive: boolean, guardian?: GuardianManager): void {
    if (!matchActive) {
      return
    }

    // Hold Wave 1 while human defenders are still choosing their hero on the Hero Selection UI.
    if (this.wave === 0 && !this.hasActiveDefenderHero()) {
      this.waitingForDefenderHero = true
      this.nextWaveTime = now + INITIAL_WAVE_DELAY_SECONDS
      this.aliveCreepCount = 0
      for (const handle of this.collectLiveCreepHandles()) {
        killEntity({ victim: handle })
      }
      return
    }
    this.waitingForDefenderHero = false

    // Read wave interval preference from host player if configured; otherwise scale cadence by wave.
    const dynamicCadence = computeWaveSpawnIntervalSeconds(Math.max(1, this.wave))
    const hostConn = players()[0]
    const customSetting = hostConn
      ? Number(hostConn.player.setting('wave_interval') ?? '20')
      : 20
    this.waveInterval =
      customSetting !== 20 && customSetting >= 10 && customSetting <= 60
        ? customSetting
        : dynamicCadence

    if (this.restoreIntervalAt > 0 && now >= this.restoreIntervalAt) {
      this.restoreIntervalAt = 0
      this.syncEngineWaveInterval(this.waveInterval)
    }

    if (now >= this.nextWaveTime) {
      this.spawnNextWave(now, this.wave === 0)
    }

    this.scaleNewlySpawnedCreeps(now)
    this.tickActiveBosses(now, guardian)
  }

  /** Spawns/advances the next wave (used by timer, /skipwave, and Probe). */
  spawnNextWave(now: number, forceImmediateZipline = false): number {
    this.wave++
    this.waveInterval = computeWaveSpawnIntervalSeconds(this.wave)
    this.nextWaveTime = now + this.waveInterval

    const targetHp = computeWaveCreepHp(this.wave)
    const targetScale = computeWaveCreepScale(this.wave)
    const damageMult = computeWaveCreepDamageMult(this.wave)
    const soulReward = computeWaveSoulReward(this.wave)
    const { tier } = getWaveCreepModifiers(this.wave)

    // Keep squad size fixed at 4 (matching the 4 zipline seats so 0 skybase creeps strand)
    // and scale wave numbers by tightening the zipline spawn cadence (20s -> 7s).
    serverCommand(`citadel_trooper_squad_size ${ZIPLINE_SQUAD_SIZE}`)
    serverCommand(`citadel_trooper_gold_reward ${soulReward}`)

    if (forceImmediateZipline) {
      this.syncEngineWaveInterval(1)
      this.restoreIntervalAt = now + 1
    } else if (this.restoreIntervalAt === 0) {
      this.syncEngineWaveInterval(this.waveInterval)
    }

    // Spawn varied neutral creeps directly inside the Center Lane wave (static side camp disabled).
    const neutralCount = this.spawnWaveNeutralVariety(this.wave)

    log(
      `Wave ${this.wave} spawned (Tier ${tier}: every ${this.waveInterval}s, HP=${targetHp}, Dmg=${damageMult}x, Scale=${targetScale}x, Souls=${soulReward}, WaveNeutrals=${neutralCount})`,
    )

    if (isBossWave(this.wave)) {
      this.spawnBossForWave(this.wave, now)
    } else {
      for (const conn of players()) {
        if (!conn.ready) continue
        toast(
          conn.player,
          `Wave ${this.wave}: ${targetHp} HP · ${damageMult.toFixed(2)}x Dmg · ${targetScale.toFixed(2)}x Size · Every ${this.waveInterval}s`,
        )
      }
    }

    this.scaleNewlySpawnedCreeps(now)
    return this.wave
  }

  /**
   * Wave neutral creeps (`npc_trooper_neutral`) and Graves Shamblers (`npc_necro_skele`)
   * are disabled in `v0.6.0` (zero-VPK release) until native lane pathing and death-explosion
   * behavior are restored via upstream Modlock entity/modifier hooks.
   */
  spawnWaveNeutralVariety(_wave: number): number {
    return 0
  }

  /**
   * Smoothly steers vanilla wave neutrals (`npc_trooper_neutral`) and Graves Shamblers
   * (`npc_necro_skele`) down Center Lane waypoints (`Npc.move`) until they enter combat
   * range of a Defender Hero or the active Team 2 structure. Runs in O(1) (0 host calls)
   * whenever `steeredWaveCreeps` is empty.
   */
  tickSteeredWaveCreeps(dtSeconds = 0.1, guardian?: GuardianManager): void {
    if (this.steeredWaveCreeps.size === 0) {
      return
    }
    const heroPositions: Vector[] = []
    for (const conn of players()) {
      const pawn = conn.player.pawn()
      if (pawn && pawn.team === DEFENDER_TEAM && pawn.hero > 0 && pawn.health > 0) {
        heroPositions.push(pawn.position)
      }
    }

    for (const [handle, entry] of [...this.steeredWaveCreeps.entries()]) {
      const st = entry.npc.read()
      if (!st || st.health <= 0) {
        this.steeredWaveCreeps.delete(handle)
        continue
      }
      const pos = st.position
      let minHeroDist = Infinity
      for (const hp of heroPositions) {
        const d = Math.hypot(hp.x - pos.x, hp.y - pos.y)
        if (d < minHeroDist) minHeroDist = d
      }
      const activeObj = guardian?.getActiveBossObjective(pos)
      const objDist = activeObj
        ? Math.hypot(activeObj.position.x - pos.x, activeObj.position.y - pos.y)
        : Infinity

      const heroEngageDist = entry.kind === 'shambler' ? 520 : 420
      const objEngageDist = entry.kind === 'shambler' ? 620 : 480
      if (minHeroDist <= heroEngageDist || objDist <= objEngageDist) {
        // Let native C++ ranged attack / melee charge AI take over in combat range!
        continue
      }

      const route = getBossWaypointsForObjective(
        entry.routeIndex,
        activeObj?.kind ?? 'guardian',
      )
      while (entry.waypointIndex < route.length - 1) {
        const wp = route[entry.waypointIndex]
        if (Math.hypot(wp.x - pos.x, wp.y - pos.y) <= 95) {
          entry.waypointIndex += 1
        } else {
          break
        }
      }
      const targetWp = route[Math.min(entry.waypointIndex, route.length - 1)] ??
        activeObj?.position ?? { x: 0, y: -1180, z: 384 }
      const dx = targetWp.x - pos.x
      const dy = targetWp.y - pos.y
      const dz = targetWp.z - pos.z
      const dist2D = Math.hypot(dx, dy)
      if (dist2D <= 24) {
        continue
      }
      const speed = entry.kind === 'shambler' ? 255 : 225
      const step = Math.min(dist2D, speed * dtSeconds)
      const nx = dx / dist2D
      const ny = dy / dist2D
      const nextPos: Vector = {
        x: pos.x + nx * step,
        y: pos.y + ny * step,
        z: pos.z + Math.max(-28, Math.min(28, dz * (step / dist2D))),
      }
      const yaw = (Math.atan2(dy, dx) * 180) / Math.PI
      entry.npc.move(
        nextPos,
        { pitch: 0, yaw, roll: 0 },
        { x: nx * speed, y: ny * speed, z: 0 },
      )
    }
  }

  /**
   * Scales newly dismounted creeps (`m_lifeState === 0`, `maxHealth > 1`, in lane),
   * attaches native C++ Colossus scaling (`holdEntityModifier`) on Elite/late waves,
   * and guards already-scaled creeps against engine `maxHealth` resets without ever
   * healing combat damage or calling `SetAbsScale` (which desyncs hitboxes, #16).
   */
  scaleNewlySpawnedCreeps(_now = 0): number {
    const snapshots = this.collectLiveCreepSnapshots()
    const liveHandles = snapshots.map((s) => s.handle)
    this.aliveCreepCount = liveHandles.length + this.activeBosses.length

    const snapByHandle = new Map<number, LiveCreepSnapshot>()
    for (const snap of snapshots) {
      snapByHandle.set(snap.handle, snap)
    }

    for (const trackedHandle of [...this.creepSpecs.keys()]) {
      if (!snapByHandle.has(trackedHandle)) {
        this.creepSpecs.delete(trackedHandle)
        this.scaledCreeps.delete(trackedHandle)
        this.explodingZombies.delete(trackedHandle)
        this.armedZombies.delete(trackedHandle)
        this.detonatedZombies.delete(trackedHandle)
        this.steeredWaveCreeps.delete(trackedHandle)
      }
    }
    for (const scaledHandle of [...this.scaledCreeps]) {
      if (!snapByHandle.has(scaledHandle)) {
        this.scaledCreeps.delete(scaledHandle)
        this.explodingZombies.delete(scaledHandle)
        this.armedZombies.delete(scaledHandle)
        this.detonatedZombies.delete(scaledHandle)
        this.steeredWaveCreeps.delete(scaledHandle)
      }
    }
    for (let i = this.spawnedWaveNeutrals.length - 1; i >= 0; i--) {
      if (!snapByHandle.has(this.spawnedWaveNeutrals[i].entity)) {
        const st = this.spawnedWaveNeutrals[i].read()
        if (!st || st.health <= 0) {
          this.steeredWaveCreeps.delete(this.spawnedWaveNeutrals[i].entity)
          this.spawnedWaveNeutrals.splice(i, 1)
        }
      }
    }

    const effectiveWave = Math.max(1, this.wave)
    const targetHp = computeWaveCreepHp(effectiveWave)
    const targetScale = computeWaveCreepScale(effectiveWave)
    const damageMult = computeWaveCreepDamageMult(effectiveWave)

    const newlySpawned = selectUnscaledCreeps(liveHandles, this.scaledCreeps)
    const newlySpawnedSet = new Set<number>(newlySpawned)

    for (const handle of newlySpawned) {
      const spec: CreepWaveSpec = {
        wave: effectiveWave,
        targetHp,
        targetScale,
        damageMult,
        isExplodingZombie: false,
      }
      this.creepSpecs.set(handle, spec)
      this.applyCreepHealth(handle, spec.targetHp, spec.targetHp)
    }

    // Check previously scaled live creeps for engine maxHealth resets (single-pass snapshot, 0 extra Npc.read calls).
    for (const snap of snapshots) {
      const handle = snap.handle
      if (newlySpawnedSet.has(handle)) {
        continue
      }
      let spec = this.creepSpecs.get(handle)
      if (!spec) {
        spec = {
          wave: effectiveWave,
          targetHp,
          targetScale,
          damageMult,
          isExplodingZombie: false,
        }
        this.creepSpecs.set(handle, spec)
        this.applyCreepHealth(handle, spec.targetHp, spec.targetHp)
        continue
      }

      const sync = evaluateCreepHealthSync(snap.health, snap.maxHealth, spec.targetHp)
      if (sync.needsApply) {
        this.applyCreepHealth(handle, sync.newHp, sync.newMaxHp)
      }
    }

    return newlySpawned.length
  }

  /**
   * Scales outgoing damage dealt by fortified Team 2 structures (`+25%` per level),
   * enemy wave creeps, Enemy Hero Bosses, and (on vanilla servers) Defender Tomes &
   * Boss/Hero Effective-HP ratios in Modlock's `onDamage` hook.
   */
  modifyIncomingDamage(
    hit: DamageEvent,
    guardian?: GuardianManager,
    tomes?: TomeManager,
  ): DamageResult | undefined {
    if (hit.amount <= 0) {
      return undefined
    }
    let totalMult = 1

    if (hit.attacker > 0) {
      if (
        guardian &&
        guardian.upgradeLevel > 0 &&
        guardian.isFriendlyStructureEntity(hit.attacker)
      ) {
        totalMult *= guardian.damageMultiplier()
      } else {
        const spec = this.creepSpecs.get(hit.attacker)
        if (spec) {
          totalMult *= spec.damageMult
        } else {
          for (const boss of this.activeBosses) {
            if (boss.pawnEntity > 0 && boss.pawnEntity === hit.attacker) {
              totalMult *= boss.damageMult
              break
            }
          }
          if (tomes && tomes.playerTomes.size > 0) {
            for (const conn of players()) {
              const pawn = conn.player.pawn()
              if (pawn && pawn.entity === hit.attacker && pawn.team === DEFENDER_TEAM) {
                const bonuses = tomes.getVanillaBonuses(conn.player.slot)
                totalMult *=
                  hit.ability > 0 ? bonuses.abilityDamageMult : bonuses.weaponDamageMult
                break
              }
            }
          }
        }
      }
    }

    if (hit.victim > 0) {
      for (const boss of this.activeBosses) {
        if (
          boss.pawnEntity > 0 &&
          boss.pawnEntity === hit.victim &&
          boss.vanillaMaxHpTarget > 0
        ) {
          const pawn = boss.bot.pawn()
          const engineMax = Math.max(1, pawn?.effectiveMaxHealth ?? pawn?.maxHealth ?? 1000)
          if (boss.vanillaMaxHpTarget > engineMax) {
            totalMult *= engineMax / boss.vanillaMaxHpTarget
          }
          break
        }
      }
      if (tomes && tomes.playerTomes.size > 0) {
        for (const conn of players()) {
          const pawn = conn.player.pawn()
          if (pawn && pawn.entity === hit.victim && pawn.team === DEFENDER_TEAM) {
            const bonuses = tomes.getVanillaBonuses(conn.player.slot)
            if (bonuses.bonusMaxHp > 0) {
              const baseMax = Math.max(1, pawn.effectiveMaxHealth ?? pawn.maxHealth)
              totalMult *= computeVanillaEffectiveHpDamageScale(baseMax, bonuses.bonusMaxHp)
            }
            break
          }
        }
      }
    }

    if (Math.abs(totalMult - 1) < 0.001) {
      return undefined
    }
    return {
      amount: hit.amount * totalMult,
    }
  }

  /**
   * Self-destructs Graves Zombies (`trooper_melee`) immediately after their
   * proximity explosion, melee strike, or kamikaze objective hit lands on an
   * enemy (`hit.dealt > 0 && hit.victim !== hit.attacker`). Uses environmental
   * `killEntity` (no attacker credit) so `necro_zombie_explode_on_death` plays
   * without granting free last-hit Souls or Tomes.
   */
  handleCreepPostDamage(
    hit: DamagedEvent,
    guardian?: GuardianManager,
    now = 0,
  ): boolean {
    if (
      hit.attacker <= 0 ||
      hit.victim <= 0 ||
      hit.attacker === hit.victim ||
      hit.dealt <= 0
    ) {
      return false
    }
    this.handleBossDamaged(hit, now)
    if (this.detonatedZombies.has(hit.attacker)) {
      return false
    }
    const spec = this.creepSpecs.get(hit.attacker)
    if (!spec || !spec.isExplodingZombie) {
      return false
    }
    const hp = this.readEntityHealth(hit.attacker)
    if (hp <= 0) {
      return false
    }
    const hitStructureTarget =
      guardian && guardian.isFriendlyStructureEntity(hit.victim) ? hit.victim : 0
    return this.detonateZombie(hit.attacker, spec, guardian, hitStructureTarget, false)
  }

  /** Records provocation aggro when a Defender damages a Boss, and awards Major Boon on Boss kill. */
  handleBossDamaged(hit: DamagedEvent, now: number): void {
    if (this.activeBosses.length === 0 || hit.dealt <= 0) {
      return
    }
    const bossIdx = this.activeBosses.findIndex((b) => b.pawnEntity === hit.victim)
    if (bossIdx < 0) {
      return
    }
    const boss = this.activeBosses[bossIdx]
    if (
      boss.configuredPawnEntity > 0 &&
      hit.healthBefore > 0 &&
      hit.healthLost >= hit.healthBefore
    ) {
      this.rewardAndRetireBoss(bossIdx)
      return
    }
    if (hit.attacker <= 0) {
      return
    }
    const isDefenderHero = players().some((c) => {
      const p = c.player.pawn()
      return Boolean(p && p.entity === hit.attacker && p.team === DEFENDER_TEAM && p.hero > 0)
    })
    if (isDefenderHero) {
      boss.ai.provokedHeroEntity = hit.attacker
      boss.ai.provokedUntil = now + 8.0
    }
  }

  private getStaticBuildingTargets(): {
    readonly walkers: { readonly entity: number; readonly pos: Vector }[]
    readonly baseGuardians: { readonly entity: number; readonly pos: Vector }[]
    readonly shrines: { readonly entity: number; readonly pos: Vector }[]
    readonly patrons: { readonly entity: number; readonly pos: Vector }[]
  } {
    if (this.cachedBuildingTargets) {
      return this.cachedBuildingTargets
    }
    const collect = (cls: string) => {
      const list: { readonly entity: number; readonly pos: Vector }[] = []
      for (const ent of findEntities(cls)) {
        const team = readField(ent, 'CBaseEntity', 'm_iTeamNum', 'int32')
        const pos = new Npc(ent).read()?.position ?? entityPosition(ent)?.position
        if (team === DEFENDER_TEAM && pos) {
          list.push({ entity: ent, pos })
        }
      }
      return list
    }
    this.cachedBuildingTargets = {
      walkers: collect('npc_boss_tier2'),
      baseGuardians: collect('npc_barrack_boss'),
      shrines: collect('destroyable_building'),
      patrons: collect('npc_boss_tier3'),
    }
    return this.cachedBuildingTargets
  }

  private isStructureAliveForZombie(ent: number): boolean {
    if (ent <= 0) return false
    const lifeState = readField(ent, 'CBaseEntity', 'm_lifeState', 'uint8')
    if (typeof lifeState === 'number' && lifeState !== 0) {
      return false
    }
    return this.readEntityHealth(ent) > 0
  }

  /**
   * Polls live Graves Zombies (`trooper_melee`) every 250ms, arming (`0.2s` warning)
   * and detonating (`killEntity` -> `necro_zombie_explode_on_death` + wave-scaled
   * splash) whenever a zombie reaches a Defender Hero or any LIVE Team 2 defense
   * structure (`Guardian`, `Walker`, `Base Guardians`, `Shrines`, or `Patron`).
   * Exits in O(1) with 0 host calls whenever `explodingZombies` is empty (#18).
   */
  tickExplodingZombies(nowSeconds: number, guardian: GuardianManager): number {
    if (this.explodingZombies.size === 0) {
      return 0
    }

    const heroTargets: { readonly entity: number; readonly pos: { x: number; y: number; z: number } }[] =
      []
    for (const conn of players()) {
      const pawn = conn.player.pawn()
      if (pawn && pawn.team === DEFENDER_TEAM && pawn.hero > 0 && pawn.health > 0) {
        heroTargets.push({ entity: pawn.entity, pos: pawn.position })
      }
    }

    const guardianEnt = guardian.matchState === 'active' ? guardian.locateEntity() : 0
    const hasLiveGuardian = guardianEnt > 0 && guardian.health > 0
    const guardianPos = hasLiveGuardian ? guardian.position() : undefined
    const staticTargets = this.getStaticBuildingTargets()
    const walkerTargets = staticTargets.walkers.filter((w) =>
      this.isStructureAliveForZombie(w.entity),
    )
    const baseGuardianTargets = staticTargets.baseGuardians.filter((bg) =>
      this.isStructureAliveForZombie(bg.entity),
    )
    const shrineTargets = staticTargets.shrines.filter((s) =>
      this.isStructureAliveForZombie(s.entity),
    )
    const patronTargets = staticTargets.patrons.filter((p) =>
      this.isStructureAliveForZombie(p.entity),
    )

    let detonatedCount = 0
    for (const handle of [...this.explodingZombies]) {
      const spec = this.creepSpecs.get(handle)
      if (!spec || !spec.isExplodingZombie || this.detonatedZombies.has(handle)) {
        this.explodingZombies.delete(handle)
        continue
      }
      const npcState = new Npc(handle).read()
      const lifeState = readField(handle, 'CBaseEntity', 'm_lifeState', 'uint8')
      const hp = npcState?.health ?? this.readEntityHealth(handle)
      const zPos = npcState?.position ?? entityPosition(handle)?.position
      if ((typeof lifeState === 'number' && lifeState !== 0) || hp <= 0 || !zPos) {
        this.armedZombies.delete(handle)
        this.explodingZombies.delete(handle)
        continue
      }

      const nearHero = heroTargets.some((h) =>
        isWithinZombieDetonationRange(zPos, h.pos, 'hero'),
      )
      const nearGuardian = Boolean(
        guardianPos && isWithinZombieDetonationRange(zPos, guardianPos, 'guardian'),
      )
      const nearWalker = walkerTargets.find((w) =>
        isWithinZombieDetonationRange(zPos, w.pos, 'walker'),
      )
      const nearBaseGuardian = baseGuardianTargets.find((bg) =>
        isWithinZombieDetonationRange(zPos, bg.pos, 'base_guardian'),
      )
      const nearShrine = shrineTargets.find((s) =>
        isWithinZombieDetonationRange(zPos, s.pos, 'shrine'),
      )
      const nearPatron = patronTargets.find((p) =>
        isWithinZombieDetonationRange(zPos, p.pos, 'patron'),
      )

      const nearStructureEntity = nearGuardian
        ? guardianEnt
        : (nearWalker?.entity ??
          nearBaseGuardian?.entity ??
          nearShrine?.entity ??
          nearPatron?.entity ??
          0)

      const armDeadline = this.armedZombies.get(handle)
      if (armDeadline === undefined && !nearHero && nearStructureEntity <= 0) {
        continue
      }

      if (armDeadline === undefined) {
        this.armedZombies.set(handle, nowSeconds + ZOMBIE_ARM_FUSE_SECONDS)
        emitSound(handle, 'Necro.Shambler.Warning')
        continue
      }

      if (nowSeconds < armDeadline) {
        continue
      }

      if (this.detonateZombie(handle, spec, guardian, nearStructureEntity, true)) {
        detonatedCount++
      }
    }

    return detonatedCount
  }

  private detonateZombie(
    handle: number,
    spec: CreepWaveSpec,
    guardian: GuardianManager | undefined,
    structureTargetEntity: number,
    applyHeroSplash: boolean,
  ): boolean {
    if (this.detonatedZombies.has(handle)) {
      return false
    }
    this.detonatedZombies.add(handle)
    this.explodingZombies.delete(handle)
    this.armedZombies.delete(handle)

    const scaledDmg = Math.max(
      1,
      Math.round(ZOMBIE_BASE_KAMIKAZE_DAMAGE * spec.damageMult),
    )
    const zPos = new Npc(handle).read()?.position ?? entityPosition(handle)?.position

    if (applyHeroSplash && zPos) {
      for (const conn of players()) {
        const pawn = conn.player.pawn()
        if (pawn && pawn.team === DEFENDER_TEAM && pawn.hero > 0 && pawn.health > 0) {
          const dx = pawn.position.x - zPos.x
          const dy = pawn.position.y - zPos.y
          if (dx * dx + dy * dy <= 250 * 250 && Math.abs(pawn.position.z - zPos.z) <= 180) {
            damage({ victim: pawn.entity, amount: scaledDmg })
          }
        }
      }
    }

    if (structureTargetEntity > 0 && guardian) {
      guardian.applyKamikazeDamageToStructure(structureTargetEntity, scaledDmg, spec.wave)
    }

    // Force lethal environmental death through the game's damage path so
    // necro_zombie_explode_on_death + necro_corpse_explosion.vpcf fire AND the zombie dies!
    killEntity({ victim: handle })
    return true
  }

  private readEntityHealth(handle: number): number {
    const npcState = new Npc(handle).read()
    if (npcState) {
      return npcState.health
    }
    const rawHp = readField(handle, 'CBaseEntity', 'm_iHealth', 'int32')
    return typeof rawHp === 'number' ? rawHp : 0
  }

  private detectExplodingZombie(handle: number, unscaledMaxHp: number): boolean {
    const cls = entityClass(handle)
    const rawModel = readField(handle, 'CModelState', 'm_ModelName', 'string')
    const modelName = typeof rawModel === 'string' ? rawModel : undefined
    return isExplodingZombieIdentity(cls?.designerName, modelName, unscaledMaxHp)
  }

  /**
   * Single-pass snapshot of ONLY active, landed enemy troopers & neutrals in Center Lane.
   * Fast-rejects 1/1 zipline passengers and skybase pooled units (`y > 3500` or `z > 650`)
   * in 1 `Npc.read()` call before checking `m_lifeState` (#18).
   */
  private collectLiveCreepSnapshots(): LiveCreepSnapshot[] {
    const out: LiveCreepSnapshot[] = []
    const troopers = findEntities('npc_trooper')
    const neutrals =
      this.spawnedWaveNeutrals.length > 0 ? findEntities('npc_trooper_neutral') : []
    const shamblers =
      this.spawnedWaveNeutrals.length > 0 ? findEntities('npc_necro_skele') : []

    for (const ent of [...troopers, ...neutrals, ...shamblers]) {
      const npc = new Npc(ent).read()
      if (npc) {
        if (npc.health <= 0 || npc.maxHealth <= 1) {
          continue
        }
        if (npc.team === DEFENDER_TEAM || Math.abs(npc.position.x) > 2800) {
          killEntity({ victim: ent })
          continue
        }
        if (npc.position.y > 3500 || npc.position.z > 650) {
          continue
        }
        const lifeState = readField(ent, 'CBaseEntity', 'm_lifeState', 'uint8')
        if (typeof lifeState === 'number' && lifeState !== 0) {
          continue
        }
        out.push({
          handle: ent,
          health: npc.health,
          maxHealth: npc.maxHealth,
          position: npc.position,
        })
        continue
      }

      const lifeState = readField(ent, 'CBaseEntity', 'm_lifeState', 'uint8')
      if (typeof lifeState === 'number' && lifeState !== 0) {
        continue
      }
      const pos = entityPosition(ent)?.position
      if (pos && (pos.y > 3500 || pos.z > 650)) {
        continue
      }
      const team = readField(ent, 'CBaseEntity', 'm_iTeamNum', 'int32') as number | undefined
      if (team === DEFENDER_TEAM) {
        continue
      }
      const hp = readField(ent, 'CBaseEntity', 'm_iHealth', 'int32') as number | undefined
      const maxHp = readField(ent, 'CBaseEntity', 'm_iMaxHealth', 'int32') as number | undefined
      if (typeof hp === 'number' && hp > 0 && typeof maxHp === 'number' && maxHp > 1) {
        out.push({ handle: ent, health: hp, maxHealth: maxHp, position: pos })
      }
    }
    return out
  }

  /** Collects ONLY active, landed enemy troopers & neutrals fighting in Center Lane. */
  collectLiveCreepHandles(): number[] {
    return this.collectLiveCreepSnapshots().map((s) => s.handle)
  }

  /**
   * Fast O(1) enemy victim check for `onDamaged` lethal last-hit Tome evaluation (#18).
   * Avoids scanning `findEntities('npc_trooper')` on every bullet/pellet/burn tick!
   */
  isEnemyRewardVictim(victim: number): boolean {
    if (victim <= 0) {
      return false
    }
    if (this.scaledCreeps.has(victim)) {
      return true
    }
    for (const boss of this.activeBosses) {
      if (boss.pawnEntity === victim) {
        return true
      }
    }
    const cls = entityClass(victim)
    if (
      cls &&
      (cls.designerName === 'npc_trooper' ||
        cls.designerName === 'npc_trooper_neutral' ||
        cls.designerName === 'npc_necro_skele')
    ) {
      const team = readField(victim, 'CBaseEntity', 'm_iTeamNum', 'int32')
      return team !== DEFENDER_TEAM
    }
    return false
  }

  /** Returns the set of all valid enemy creep & Boss pawn entities for last-hit checks. */
  validEnemyEntities(): Set<number> {
    const set = new Set<number>(this.scaledCreeps)
    for (const h of this.collectLiveCreepHandles()) {
      set.add(h)
    }
    for (const boss of this.activeBosses) {
      if (boss.pawnEntity > 0) {
        set.add(boss.pawnEntity)
      }
    }
    return set
  }

  private spawnBossForWave(wave: number, now = 0): void {
    const spec = getBossWaveSpec(wave)
    const bossIndex = Math.max(0, Math.floor(wave / 5) - 1)
    const spawnOrigin = {
      x: BOSS_SPAWN_X_OFFSETS[bossIndex % BOSS_SPAWN_X_OFFSETS.length],
      y: BOSS_SPAWN_ORIGIN.y,
      z: BOSS_SPAWN_ORIGIN.z,
    }
    const bot = addBot({
      name: `Wave ${wave} Boss`,
      team: 3,
      hero: spec.hero,
      position: spawnOrigin,
    })
    for (const conn of players()) {
      if (conn.bot || !conn.ready) continue
      conn.player.announce(
        `BOSS WAVE ${wave}`,
        `Enemy ${spec.hero.replace('hero_', '').toUpperCase()} (${spec.targetScale.toFixed(2)}x Size · +${spec.bonusHp} HP) enters Center Lane!`,
      )
    }
    if (!bot) {
      log(`Boss bot slot unavailable on Wave ${wave}`)
      this.onMilestoneWaveCallback?.(wave)
      return
    }
    this.activeBosses.push({
      wave,
      tier: spec.tier,
      bot,
      hero: spec.hero,
      modifier: spec.modifier,
      targetMaxHp: spec.bonusHp,
      endlessBoostStacks: spec.endlessBoostStacks,
      extraSizeStacks: spec.extraSizeStacks,
      targetScale: spec.targetScale,
      damageMult: spec.damageMult,
      spawnOrigin,
      ai: createBossAiState(spawnOrigin, now),
      pawnEntity: 0,
      configuredPawnEntity: 0,
      currentHp: 0,
      currentMaxHp: 0,
      vanillaMaxHpTarget: 0,
      appliedScale: spec.targetScale,
      initialHealDone: false,
    })
  }

  private rewardAndRetireBoss(index: number): void {
    const boss = this.activeBosses[index]
    if (!boss) {
      return
    }
    const defeatedWave = boss.wave
    if ((boss.bot.pawn()?.health ?? 0) > 0) {
      boss.bot.drive()
    }
    boss.bot.removeBot()
    this.activeBosses.splice(index, 1)
    for (const conn of players()) {
      if (conn.bot || !conn.ready) continue
      conn.player.addMetric('td.bosses_slain', 1)
      toast(conn.player, `Wave ${defeatedWave} Boss defeated! +400 Souls & Major Boon unlocked!`)
      conn.player.adjustSouls(400, false)
    }
    this.onMilestoneWaveCallback?.(defeatedWave)
  }

  /**
   * Re-adopts any live Team 3 Boss bot pawn (`conn.bot && pawn.team === 3`) after a
   * Modlock Wasm hot-reload so active Bosses never stop moving or fighting mid-wave.
   */
  adoptOrphanedBossBots(now: number): void {
    const trackedSlots = new Set<number>(this.activeBosses.map((b) => b.bot.slot))
    const bossWave = Math.max(5, Math.floor(Math.max(5, this.wave) / 5) * 5)
    const spec = getBossWaveSpec(bossWave)

    for (const conn of players()) {
      if (!conn.bot || trackedSlots.has(conn.player.slot)) {
        continue
      }
      const pawn = conn.player.pawn()
      if (!pawn || pawn.team !== 3 || pawn.hero <= 0 || pawn.health <= 0) {
        continue
      }
      const abilNames = conn.player
        .abilities()
        .map((a) => a.name)
        .join(' ')
      const inferredHero = abilNames.includes('bull_')
        ? 'hero_atlas'
        : abilNames.includes('warden') || abilNames.includes('alchemical')
          ? 'hero_warden'
          : abilNames.includes('bebop') || abilNames.includes('uppercut')
            ? 'hero_bebop'
            : abilNames.includes('shiv')
              ? 'hero_shiv'
              : abilNames.includes('chrono')
                ? 'hero_chrono'
                : abilNames.includes('forge') || abilNames.includes('turret')
                  ? 'hero_forge'
                  : spec.hero

      const estMaxHp = Math.max(
        pawn.effectiveMaxHealth ?? 0,
        pawn.maxHealth,
        pawn.health,
        750 + spec.bonusHp,
      )
      holdModifierState(pawn.entity, 'MODIFIER_STATE_VISIBLE_TO_ENEMY', true)
      conn.player.holdModifier('upgrade_colossus/modifier_colossus_active', true)
      this.activeBosses.push({
        wave: bossWave,
        tier: spec.tier,
        bot: conn.player,
        hero: inferredHero,
        modifier: spec.modifier,
        targetMaxHp: spec.bonusHp,
        endlessBoostStacks: spec.endlessBoostStacks,
        extraSizeStacks: spec.extraSizeStacks,
        targetScale: spec.targetScale,
        damageMult: spec.damageMult,
        spawnOrigin: pawn.position,
        ai: createBossAiState(pawn.position, now),
        pawnEntity: pawn.entity,
        configuredPawnEntity: pawn.entity,
        currentHp: pawn.health,
        currentMaxHp: estMaxHp,
        vanillaMaxHpTarget: estMaxHp,
        appliedScale: 1.38,
        initialHealDone: true,
      })
      log(
        `Adopted live Enemy Boss bot after hot-reload (${inferredHero}, ent=${pawn.entity}, wave=${bossWave})`,
      )
    }
  }

  /**
   * Configures newly spawned Boss Hero pawns ONLY after their real hero pawn
   * (`pawn.hero > 0`) and abilities (`abilities().length > 0`) exist, AND
   * drives all live Bosses at 10 Hz (`Player.drive`) down Center Lane into combat!
   */
  tickActiveBosses(now = 0, guardian?: GuardianManager): void {
    if (this.activeBosses.length === 0) {
      return
    }

    const liveDefenderPawns = players()
      .map((c) => c.player.pawn())
      .filter((p): p is NonNullable<typeof p> =>
        Boolean(
          p &&
            p.team === DEFENDER_TEAM &&
            p.hero > 0 &&
            p.health > 0 &&
            Math.abs(p.position.y) < 10500,
        ),
      )

    for (let i = this.activeBosses.length - 1; i >= 0; i--) {
      const boss = this.activeBosses[i]
      const pawn = boss.bot.pawn()
      if (!pawn || pawn.hero === 0) {
        continue
      }
      boss.pawnEntity = pawn.entity

      if (
        boss.configuredPawnEntity > 0 &&
        (pawn.health <= 0 || boss.configuredPawnEntity !== pawn.entity)
      ) {
        // Real Boss hero pawn was defeated!
        this.rewardAndRetireBoss(i)
        continue
      }

      let justConfigured = false
      if (boss.configuredPawnEntity === 0 && pawn.health > 0) {
        const abils = boss.bot.abilities()
        if (abils.length === 0) {
          continue
        }

        boss.bot.teleport(boss.spawnOrigin, BOSS_SPAWN_ANGLES)
        // Grant stock `upgrade_colossus` + hold `modifier_colossus_active` via `Player.holdModifier`
        // (tuned to 1.38x in `mod.json`) for native C++ model + skeletal hitbox scaling, Tier-4 Boss
        // items, and wave-scaled Effective Max HP (`3,500` -> `26,000+` HP)!
        boss.bot.giveItem('upgrade_colossus')
        boss.bot.giveModifier('upgrade_colossus/modifier_colossus_active', -1)
        boss.bot.holdModifier('upgrade_colossus/modifier_colossus_active', true)
        if (boss.tier >= 2) boss.bot.giveItem('upgrade_titan_round')
        if (boss.tier >= 3) boss.bot.giveItem('upgrade_boundless_spirit')
        if (boss.tier >= 4) boss.bot.giveItem('upgrade_juggernaut')
        if (boss.tier >= 5) boss.bot.giveItem('upgrade_damage_recycler')
        boss.appliedScale = 1.38
        boss.vanillaMaxHpTarget = 1000 + boss.targetMaxHp

        const upgradeMask = computeBossAbilityUpgradeMask(boss.tier)
        for (const abil of abils) {
          if (abil.slot >= 0 && abil.slot <= 3) {
            boss.bot.setAbility({ ability: abil.name, upgrades: upgradeMask })
            boss.bot.refreshAbility(abil.name)
          }
        }

        // Reveal Boss through fog-of-war so Deadlock always draws its 3D overhead HP bar!
        holdModifierState(pawn.entity, 'MODIFIER_STATE_VISIBLE_TO_ENEMY', true)
        boss.bot.heal(1_000_000)
        boss.ai.waypointIndex = 0
        boss.ai.stuckCount = 0
        boss.ai.lastCheckPos = {
          x: boss.spawnOrigin.x,
          y: boss.spawnOrigin.y,
          z: boss.spawnOrigin.z,
        }
        boss.ai.lastCheckAt = now
        boss.configuredPawnEntity = pawn.entity
        boss.initialHealDone = false
        justConfigured = true
        log(
          `Configured Wave ${boss.wave} Boss (${boss.hero}, ent=${pawn.entity}, mode=colossus_no_vpk, scale=${boss.appliedScale}x, maxHp=${boss.vanillaMaxHpTarget}, dmgMult=${boss.damageMult}x)`,
        )
      }

      const activePawn = (justConfigured ? boss.bot.pawn() : pawn) ?? pawn
      if (boss.configuredPawnEntity === activePawn.entity && activePawn.health > 0) {
        if (!justConfigured && !boss.initialHealDone) {
          // Ensure HP filled to 100% once CCitadelPlayerPawn::GetMaxHealth expands from modifiers/items.
          const targetEngineMax = activePawn.effectiveMaxHealth ?? activePawn.maxHealth
          if (activePawn.health < targetEngineMax) {
            boss.bot.heal(1_000_000)
          }
          boss.initialHealDone = true
        }

        if (boss.vanillaMaxHpTarget > 0) {
          const engineMax = Math.max(
            1,
            activePawn.effectiveMaxHealth ?? activePawn.maxHealth,
          )
          const effectiveTotalMax = Math.max(engineMax, boss.vanillaMaxHpTarget)
          const hpFraction = Math.max(0, Math.min(1, activePawn.health / engineMax))
          boss.currentMaxHp = Math.round(effectiveTotalMax)
          boss.currentHp = Math.max(
            1,
            Math.round(hpFraction * boss.currentMaxHp),
          )
          if (activePawn.maxHealth < engineMax) {
            writeField(
              activePawn.entity,
              'CBaseEntity',
              'm_iMaxHealth',
              'int32',
              Math.round(engineMax),
            )
          }
        } else {
          // Sync networked CBaseEntity.m_iMaxHealth (which otherwise omits modifier maxHP until respawn)
          // so both native 3D unit_status bars and our top-center Raid Boss HUD show accurate HP!
          const trueMaxHp = Math.max(
            activePawn.effectiveMaxHealth ?? 0,
            activePawn.maxHealth,
            activePawn.health,
            boss.currentMaxHp,
          )
          boss.currentHp = Math.max(0, Math.round(activePawn.health))
          boss.currentMaxHp = Math.round(trueMaxHp)
          if (activePawn.maxHealth < boss.currentMaxHp) {
            writeField(
              activePawn.entity,
              'CBaseEntity',
              'm_iMaxHealth',
              'int32',
              boss.currentMaxHp,
            )
          }
        }

        const bossPos: Vector = justConfigured ? boss.spawnOrigin : activePawn.position
        const rawEye = justConfigured ? undefined : activePawn.eyePosition
        // Deadlock's C++ weapon ray starts at EyePosition() (unscaled ~z+76..100) and angles
        // bullets from the scaled muzzle bone to that hit point (#17).
        const unscaledEyePos: Vector =
          rawEye && rawEye.z > bossPos.z + 20
            ? rawEye
            : {
                x: bossPos.x,
                y: bossPos.y,
                z: bossPos.z + 76,
              }
        const scaledEyePos: Vector = {
          x: bossPos.x,
          y: bossPos.y,
          z: bossPos.z + 78 * boss.appliedScale,
        }

        const heroCandidates: BossHeroCandidate[] = liveDefenderPawns.map((hpawn) => {
          const heroTorso: Vector = {
            x: hpawn.position.x,
            y: hpawn.position.y,
            z: hpawn.position.z + 54,
          }
          const heroHead: Vector = {
            x: hpawn.position.x,
            y: hpawn.position.y,
            z: hpawn.position.z + 74,
          }
          let rawLoS = false
          let aimHeightOffset = 54
          if (distance3D(unscaledEyePos, heroTorso) <= 1900) {
            // Trace ONLY against staticLevel world walls/floors so creeps, zombies,
            // Guardian, and props never blind the Boss from aiming at the player (#17)!
            const unscaledTorsoHit = trace({
              start: unscaledEyePos,
              end: heroTorso,
              layers: Layers.staticLevel,
            })
            if (
              !unscaledTorsoHit ||
              distance3D(unscaledTorsoHit.position, heroTorso) <= 36
            ) {
              rawLoS = true
            } else {
              const unscaledHeadHit = trace({
                start: unscaledEyePos,
                end: heroHead,
                layers: Layers.staticLevel,
              })
              const unscaledHeadClear =
                !unscaledHeadHit ||
                distance3D(unscaledHeadHit.position, heroHead) <= 36
              const scaledHit = unscaledHeadClear
                ? undefined
                : trace({
                    start: scaledEyePos,
                    end: heroTorso,
                    layers: Layers.staticLevel,
                  })
              if (
                unscaledHeadClear ||
                !scaledHit ||
                distance3D(scaledHit.position, heroTorso) <= 36
              ) {
                rawLoS = true
                aimHeightOffset = 74
              }
            }
          }
          if (rawLoS) {
            boss.ai.heroSeenUntil[hpawn.entity] = now + 1.2
          }
          const hasLineOfSight =
            rawLoS || (boss.ai.heroSeenUntil[hpawn.entity] ?? 0) > now

          return {
            entity: hpawn.entity,
            position: hpawn.position,
            velocity: hpawn.velocity,
            health: hpawn.health,
            maxHealth: hpawn.effectiveMaxHealth ?? hpawn.maxHealth,
            hasLineOfSight,
            aimHeightOffset,
          }
        })

        const activeObjective = guardian?.getActiveBossObjective(bossPos)
        const guardianCandidate: BossGuardianCandidate | undefined = activeObjective
          ? {
              entity: activeObjective.entity,
              position: activeObjective.position,
              alive: activeObjective.alive,
              objectiveKind: activeObjective.kind,
              siegeRange: activeObjective.siegeRange,
              minStandoff: activeObjective.minStandoff,
              aimOffsetZ: activeObjective.aimOffsetZ,
            }
          : undefined

        const plan = planBossDriveStep({
          hero: boss.hero,
          bossPos,
          bossEyePos: unscaledEyePos,
          bossHealth: activePawn.health,
          bossMaxHealth: activePawn.effectiveMaxHealth ?? activePawn.maxHealth,
          abilities: boss.bot.abilities(),
          heroes: heroCandidates,
          guardian: guardianCandidate,
          state: boss.ai,
          now,
          buttons: Buttons,
        })

        if (plan.unstuckTeleport) {
          boss.bot.teleport(plan.unstuckTeleport, plan.drive.facing)
          boss.ai.lastCheckPos = plan.unstuckTeleport
        }
        boss.bot.drive(plan.drive)
      }
    }
  }

  private syncEngineWaveInterval(seconds: number): void {
    serverCommand(`citadel_trooper_spawn_interval_early ${seconds}`)
    serverCommand(`citadel_trooper_spawn_interval_late ${seconds}`)
    serverCommand(`citadel_trooper_spawn_interval_very_late ${seconds}`)
  }

  private applyCreepHealth(handle: number, hp: number, maxHp: number): void {
    fireInput(handle, 'OverrideHealth', { integer: maxHp })
    fireInput(handle, 'SetHealth', { integer: hp })
    new Npc(handle).setHealth(hp, maxHp)
    writeField(handle, 'CBaseEntity', 'm_iMaxHealth', 'int32', maxHp)
    writeField(handle, 'CBaseEntity', 'm_iHealth', 'int32', hp)
  }

  private cleanupBosses(): void {
    for (const boss of this.activeBosses) {
      if ((boss.bot.pawn()?.health ?? 0) > 0) {
        boss.bot.drive()
      }
      boss.bot.removeBot()
    }
    this.activeBosses.length = 0
  }
}
