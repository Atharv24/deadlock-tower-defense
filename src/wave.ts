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
  killEntity,
  Layers,
  log,
  Npc,
  type Player,
  players,
  readField,
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
  planBossDriveStep,
} from './boss_ai'
import {
  BOSS_SPAWN_ANGLES,
  BOSS_SPAWN_ORIGIN,
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
  isExplodingZombieBaseMaxHp,
  isWithinZombieDetonationRange,
  selectUnscaledCreeps,
  TD_SERVER_CVARS,
  WAVE_INTERVAL_SECONDS,
  ZIPLINE_SQUAD_SIZE,
  ZOMBIE_ARM_FUSE_SECONDS,
  ZOMBIE_BASE_KAMIKAZE_DAMAGE,
} from './config'
import type { GuardianManager } from './guardian'

export interface CreepWaveSpec {
  readonly wave: number
  readonly targetHp: number
  readonly targetScale: number
  readonly damageMult: number
  readonly isExplodingZombie: boolean
}

export interface ActiveBoss {
  readonly wave: number
  readonly tier: number
  readonly bot: Player
  readonly hero: string
  readonly modifier: string
  readonly targetMaxHp: number
  readonly extraHealthStacks: number
  readonly extraSizeStacks: number
  readonly targetScale: number
  readonly damageMult: number
  readonly spawnOrigin: { readonly x: number; readonly y: number; readonly z: number }
  readonly ai: BossAiState
  pawnEntity: number
  configuredPawnEntity: number
  initialHealDone: boolean
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
  readonly armedZombies = new Map<number, number>()
  readonly detonatedZombies = new Set<number>()
  readonly spawnedWaveNeutrals: Npc[] = []
  readonly activeBosses: ActiveBoss[] = []
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

  /** Resets wave state for a new world or /restarttd. */
  reset(now: number): void {
    this.cleanupBosses()
    this.wave = 0
    this.nextWaveTime = now + INITIAL_WAVE_DELAY_SECONDS
    this.aliveCreepCount = 0
    this.waitingForDefenderHero = false
    this.scaledCreeps.clear()
    this.creepSpecs.clear()
    this.armedZombies.clear()
    this.detonatedZombies.clear()
    this.spawnedWaveNeutrals.length = 0
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
    this.armedZombies.clear()
    this.detonatedZombies.clear()
    this.spawnedWaveNeutrals.length = 0
    this.restoreIntervalAt = 0

    const zombieSet = new Set<number>(explodingZombies)
    const effectiveWave = Math.max(1, wave)
    for (const handle of scaledCreeps) {
      this.scaledCreeps.add(handle)
      this.creepSpecs.set(handle, {
        wave: effectiveWave,
        targetHp: computeWaveCreepHp(effectiveWave),
        targetScale: computeWaveCreepScale(effectiveWave),
        damageMult: computeWaveCreepDamageMult(effectiveWave),
        isExplodingZombie: zombieSet.has(handle),
      })
    }
    this.adoptOrphanedBossBots(0)
  }

  /** Lists live exploding zombie entity handles for hot-reload handoff persistence. */
  exportExplodingZombieHandles(): number[] {
    const out: number[] = []
    for (const [handle, spec] of this.creepSpecs.entries()) {
      if (spec.isExplodingZombie) {
        out.push(handle)
      }
    }
    return out
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
  tick(now: number, matchActive: boolean): void {
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

    this.scaleNewlySpawnedCreeps()
    this.tickActiveBosses(now)
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
      this.onMilestoneWaveCallback?.(this.wave)
    } else {
      for (const conn of players()) {
        if (!conn.ready) continue
        toast(
          conn.player,
          `Wave ${this.wave}: ${targetHp} HP · ${damageMult.toFixed(2)}x Dmg · ${targetScale.toFixed(2)}x Size · Every ${this.waveInterval}s`,
        )
      }
    }

    this.scaleNewlySpawnedCreeps()
    return this.wave
  }

  /** Spawns varied custom lane-marching neutral creeps (`td_neutral_*`) on Enemy Center Lane. */
  spawnWaveNeutralVariety(wave: number): number {
    const spawns = getWaveNeutralSpawns(wave)
    const damageMult = computeWaveCreepDamageMult(wave)
    let spawned = 0
    for (const spawn of spawns) {
      const npc = spawnNpc({
        className: 'npc_trooper',
        unit: spawn.unit,
        team: 3,
        lane: 4,
        position: spawn.origin,
        facing: { pitch: 0, yaw: 270, roll: 0 },
        health: spawn.targetHp,
        maxHealth: spawn.targetHp,
      })
      if (npc && npc.entity > 0) {
        this.spawnedWaveNeutrals.push(npc)
        this.scaledCreeps.add(npc.entity)
        this.creepSpecs.set(npc.entity, {
          wave,
          targetHp: spawn.targetHp,
          targetScale: spawn.targetScale,
          damageMult,
          isExplodingZombie: false,
        })
        this.applyCreepScale(npc.entity, spawn.targetScale)
        spawned++
      }
    }
    return spawned
  }

  /**
   * Scales newly dismounted creeps (`m_lifeState === 0`, `maxHealth > 1`, in lane)
   * within 250ms of landing AND guards already-scaled creeps against engine
   * `maxHealth` / `m_flScale` resets without ever healing combat damage.
   */
  scaleNewlySpawnedCreeps(): number {
    const liveHandles = this.collectLiveCreepHandles()
    this.aliveCreepCount = liveHandles.length + this.activeBosses.length

    const liveSet = new Set<number>(liveHandles)
    for (const trackedHandle of [...this.creepSpecs.keys()]) {
      if (!liveSet.has(trackedHandle)) {
        this.creepSpecs.delete(trackedHandle)
        this.scaledCreeps.delete(trackedHandle)
        this.armedZombies.delete(trackedHandle)
        this.detonatedZombies.delete(trackedHandle)
      }
    }
    for (const scaledHandle of [...this.scaledCreeps]) {
      if (!liveSet.has(scaledHandle)) {
        this.scaledCreeps.delete(scaledHandle)
        this.armedZombies.delete(scaledHandle)
        this.detonatedZombies.delete(scaledHandle)
      }
    }

    const effectiveWave = Math.max(1, this.wave)
    const targetHp = computeWaveCreepHp(effectiveWave)
    const targetScale = computeWaveCreepScale(effectiveWave)
    const damageMult = computeWaveCreepDamageMult(effectiveWave)

    const newlySpawned = selectUnscaledCreeps(liveHandles, this.scaledCreeps)
    const newlySpawnedSet = new Set<number>(newlySpawned)

    for (const handle of newlySpawned) {
      const initialMaxHp =
        new Npc(handle).read()?.maxHealth ??
        (readField(handle, 'CBaseEntity', 'm_iMaxHealth', 'int32') as
          | number
          | undefined) ??
        0
      const spec: CreepWaveSpec = {
        wave: effectiveWave,
        targetHp,
        targetScale,
        damageMult,
        isExplodingZombie: this.detectExplodingZombie(handle, initialMaxHp),
      }
      this.creepSpecs.set(handle, spec)
      this.applyCreepHealth(handle, spec.targetHp, spec.targetHp)
      this.applyCreepScale(handle, spec.targetScale)
    }

    // Check previously scaled live creeps for engine maxHealth or scale resets.
    for (const handle of liveHandles) {
      if (newlySpawnedSet.has(handle)) {
        continue
      }
      let spec = this.creepSpecs.get(handle)
      if (!spec) {
        const curMax =
          new Npc(handle).read()?.maxHealth ??
          (readField(handle, 'CBaseEntity', 'm_iMaxHealth', 'int32') as
            | number
            | undefined) ??
          0
        spec = {
          wave: effectiveWave,
          targetHp,
          targetScale,
          damageMult,
          isExplodingZombie: this.detectExplodingZombie(handle, curMax),
        }
        this.creepSpecs.set(handle, spec)
        this.applyCreepHealth(handle, spec.targetHp, spec.targetHp)
        this.applyCreepScale(handle, spec.targetScale)
        continue
      }

      const npcState = new Npc(handle).read()
      const currentHp =
        npcState?.health ??
        (readField(handle, 'CBaseEntity', 'm_iHealth', 'int32') as number | undefined) ??
        0
      const currentMaxHp =
        npcState?.maxHealth ??
        (readField(handle, 'CBaseEntity', 'm_iMaxHealth', 'int32') as number | undefined) ??
        0

      const sync = evaluateCreepHealthSync(currentHp, currentMaxHp, spec.targetHp)
      if (sync.needsApply) {
        this.applyCreepHealth(handle, sync.newHp, sync.newMaxHp)
      }

      const curScale = readField(handle, 'CGameSceneNode', 'm_flScale', 'float32')
      if (typeof curScale === 'number' && Math.abs(curScale - spec.targetScale) > 0.02) {
        this.applyCreepScale(handle, spec.targetScale)
      }
    }

    return newlySpawned.length
  }

  /** Scales outgoing damage dealt by enemy wave creeps and Boss Heroes in Modlock's `onDamage` hook. */
  modifyIncomingDamage(hit: DamageEvent): DamageResult | undefined {
    if (hit.attacker <= 0 || hit.amount <= 0) {
      return undefined
    }
    const spec = this.creepSpecs.get(hit.attacker)
    if (spec) {
      if (Math.abs(spec.damageMult - 1) < 0.001) {
        return undefined
      }
      return {
        amount: hit.amount * spec.damageMult,
      }
    }
    for (const boss of this.activeBosses) {
      if (boss.pawnEntity > 0 && boss.pawnEntity === hit.attacker) {
        if (Math.abs(boss.damageMult - 1) < 0.001) {
          return undefined
        }
        return {
          amount: hit.amount * boss.damageMult,
        }
      }
    }
    return undefined
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
    const hitGuardian = Boolean(guardian && guardian.isGuardianEntity(hit.victim))
    return this.detonateZombie(hit.attacker, spec, guardian, hitGuardian, false)
  }

  /** Records provocation aggro when a live Team 2 Defender Hero damages an Enemy Boss. */
  handleBossDamaged(hit: DamagedEvent, now: number): void {
    if (this.activeBosses.length === 0 || hit.dealt <= 0 || hit.attacker <= 0) {
      return
    }
    const boss = this.activeBosses.find((b) => b.pawnEntity === hit.victim)
    if (!boss) {
      return
    }
    const isDefenderHero = players().some((c) => {
      const p = c.player.pawn()
      return Boolean(p && p.entity === hit.attacker && p.team === DEFENDER_TEAM && p.hero > 0)
    })
    if (isDefenderHero) {
      boss.ai.provokedHeroEntity = hit.attacker
      boss.ai.provokedUntil = now + 6.0
    }
  }

  /**
   * Polls live Graves Zombies (`trooper_melee`) every 250ms, arming (`0.2s` warning)
   * and detonating (`killEntity` -> `necro_zombie_explode_on_death` + wave-scaled
   * splash) whenever a zombie reaches a Defender Hero, Guardian, Walker, or Shrine.
   * Guarantees Graves Zombies ALWAYS die on explosion and never linger alive!
   */
  tickExplodingZombies(nowSeconds: number, guardian: GuardianManager): number {
    if (this.creepSpecs.size === 0) {
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

    const hasLiveGuardian =
      guardian.matchState === 'active' &&
      guardian.locateEntity() > 0 &&
      guardian.health > 0
    const guardianPos = hasLiveGuardian ? guardian.position() : undefined

    const walkerTargets: { readonly entity: number; readonly pos: { x: number; y: number; z: number } }[] =
      []
    for (const walker of findEntities('npc_boss_tier2')) {
      const team = readField(walker, 'CBaseEntity', 'm_iTeamNum', 'int32')
      const hp = this.readEntityHealth(walker)
      const pos = entityPosition(walker)?.position
      if (team === DEFENDER_TEAM && hp > 0 && pos) {
        walkerTargets.push({ entity: walker, pos })
      }
    }

    const shrineTargets: { readonly entity: number; readonly pos: { x: number; y: number; z: number } }[] =
      []
    for (const shrine of findEntities('destroyable_building')) {
      const team = readField(shrine, 'CBaseEntity', 'm_iTeamNum', 'int32')
      const hp = this.readEntityHealth(shrine)
      const pos = entityPosition(shrine)?.position
      if (team === DEFENDER_TEAM && hp > 0 && pos) {
        shrineTargets.push({ entity: shrine, pos })
      }
    }

    let detonatedCount = 0
    for (const [handle, spec] of [...this.creepSpecs.entries()]) {
      if (!spec.isExplodingZombie || this.detonatedZombies.has(handle)) {
        continue
      }
      const lifeState = readField(handle, 'CBaseEntity', 'm_lifeState', 'uint8')
      const hp = this.readEntityHealth(handle)
      const zPos = new Npc(handle).read()?.position ?? entityPosition(handle)?.position
      if ((typeof lifeState === 'number' && lifeState !== 0) || hp <= 0 || !zPos) {
        this.armedZombies.delete(handle)
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
      const nearShrine = shrineTargets.find((s) =>
        isWithinZombieDetonationRange(zPos, s.pos, 'shrine'),
      )

      const armDeadline = this.armedZombies.get(handle)
      if (
        armDeadline === undefined &&
        !nearHero &&
        !nearGuardian &&
        !nearWalker &&
        !nearShrine
      ) {
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

      const scaledDmg = Math.max(
        1,
        Math.round(ZOMBIE_BASE_KAMIKAZE_DAMAGE * spec.damageMult),
      )
      if (nearWalker) {
        const curHp = this.readEntityHealth(nearWalker.entity)
        if (curHp > 0) {
          const nextHp = Math.max(0, curHp - scaledDmg)
          fireInput(nearWalker.entity, 'SetHealth', { integer: nextHp })
          writeField(nearWalker.entity, 'CBaseEntity', 'm_iHealth', 'int32', nextHp)
        }
      } else if (nearShrine) {
        const curHp = this.readEntityHealth(nearShrine.entity)
        if (curHp > 0) {
          const nextHp = Math.max(0, curHp - scaledDmg)
          fireInput(nearShrine.entity, 'SetHealth', { integer: nextHp })
          writeField(nearShrine.entity, 'CBaseEntity', 'm_iHealth', 'int32', nextHp)
        }
      }

      if (this.detonateZombie(handle, spec, guardian, nearGuardian, true)) {
        detonatedCount++
      }
    }

    return detonatedCount
  }

  private detonateZombie(
    handle: number,
    spec: CreepWaveSpec,
    guardian: GuardianManager | undefined,
    applyGuardianKamikaze: boolean,
    applyHeroSplash: boolean,
  ): boolean {
    if (this.detonatedZombies.has(handle)) {
      return false
    }
    this.detonatedZombies.add(handle)
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

    if (applyGuardianKamikaze && guardian) {
      guardian.applyKamikazeDamage(scaledDmg, spec.wave)
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
    if (cls && cls.designerName !== 'npc_trooper') {
      return false
    }
    const modelName = readField(handle, 'CModelState', 'm_ModelName', 'string')
    if (typeof modelName === 'string' && modelName.length > 0) {
      return modelName.includes('necro_shambler')
    }
    return isExplodingZombieBaseMaxHp(unscaledMaxHp)
  }

  /**
   * Collects ONLY active, landed enemy troopers & neutrals fighting in Center Lane.
   * Excludes:
   * - `m_lifeState !== 0` (pooled/inactive skybase entities, ragdolls, zipline transitions)
   * - `maxHealth <= 1` (troopers still riding the overhead zipline capsule at 1/1 HP)
   * - `y > 3500` or `z > 650` (skybase staging area `[1268, 10764, 1410]` & high zipline wire)
   */
  collectLiveCreepHandles(): number[] {
    const handles: number[] = []
    const troopers = findEntities('npc_trooper')
    const neutrals = findEntities('npc_trooper_neutral')

    for (const ent of [...troopers, ...neutrals]) {
      const lifeState = readField(ent, 'CBaseEntity', 'm_lifeState', 'uint8')
      if (typeof lifeState === 'number' && lifeState !== 0) {
        continue
      }

      const npc = new Npc(ent).read()
      const pos = npc?.position ?? entityPosition(ent)?.position
      if (pos && (pos.y > 3500 || pos.z > 650)) {
        continue
      }

      if (npc) {
        if (npc.health > 0 && npc.maxHealth > 1 && npc.team !== DEFENDER_TEAM) {
          handles.push(ent)
        }
        continue
      }

      const team = readField(ent, 'CBaseEntity', 'm_iTeamNum', 'int32') as number | undefined
      if (team === DEFENDER_TEAM) {
        continue
      }
      const hp = readField(ent, 'CBaseEntity', 'm_iHealth', 'int32') as number | undefined
      const maxHp = readField(ent, 'CBaseEntity', 'm_iMaxHealth', 'int32') as number | undefined
      if (typeof hp === 'number' && hp > 0 && typeof maxHp === 'number' && maxHp > 1) {
        handles.push(ent)
      }
    }
    return handles
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
      return
    }
    this.activeBosses.push({
      wave,
      tier: spec.tier,
      bot,
      hero: spec.hero,
      modifier: spec.modifier,
      targetMaxHp: spec.bonusHp,
      extraHealthStacks: spec.extraHealthStacks,
      extraSizeStacks: spec.extraSizeStacks,
      targetScale: spec.targetScale,
      damageMult: spec.damageMult,
      spawnOrigin,
      ai: createBossAiState(spawnOrigin, now),
      pawnEntity: 0,
      configuredPawnEntity: 0,
      initialHealDone: false,
    })
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

      this.activeBosses.push({
        wave: bossWave,
        tier: spec.tier,
        bot: conn.player,
        hero: inferredHero,
        modifier: spec.modifier,
        targetMaxHp: spec.bonusHp,
        extraHealthStacks: spec.extraHealthStacks,
        extraSizeStacks: spec.extraSizeStacks,
        targetScale: spec.targetScale,
        damageMult: spec.damageMult,
        spawnOrigin: pawn.position,
        ai: createBossAiState(pawn.position, now),
        pawnEntity: pawn.entity,
        configuredPawnEntity: pawn.entity,
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

    const guardianEnt =
      guardian && guardian.matchState === 'active' ? guardian.locateEntity() : 0
    const guardianCandidate: BossGuardianCandidate | undefined =
      guardian && guardianEnt > 0
        ? {
            entity: guardianEnt,
            position: guardian.position(),
            alive: guardian.health > 0,
          }
        : undefined

    const liveDefenderPawns = players()
      .map((c) => c.player.pawn())
      .filter((p): p is NonNullable<typeof p> =>
        Boolean(
          p &&
            p.team === DEFENDER_TEAM &&
            p.hero > 0 &&
            p.health > 0 &&
            Math.abs(p.position.y) < 3400,
        ),
      )

    for (let i = this.activeBosses.length - 1; i >= 0; i--) {
      const boss = this.activeBosses[i]
      const pawn = boss.bot.pawn()
      if (!pawn || pawn.hero === 0) {
        continue
      }
      boss.pawnEntity = pawn.entity

      if (boss.configuredPawnEntity === pawn.entity && pawn.health <= 0) {
        // Real Boss hero pawn was defeated!
        boss.bot.drive()
        boss.bot.removeBot()
        this.activeBosses.splice(i, 1)
        for (const conn of players()) {
          if (conn.bot || !conn.ready) continue
          conn.player.addMetric('td.bosses_slain', 1)
          toast(conn.player, `Boss defeated! Bonus +400 Souls!`)
          conn.player.adjustSouls(400, false)
        }
        continue
      }

      let justConfigured = false
      if (boss.configuredPawnEntity !== pawn.entity && pawn.health > 0) {
        const abils = boss.bot.abilities()
        if (abils.length === 0) {
          continue
        }

        boss.bot.teleport(boss.spawnOrigin, BOSS_SPAWN_ANGLES)
        const applied = boss.bot.giveModifier(boss.modifier, -1)
        boss.bot.holdModifier(boss.modifier, true)
        if (!applied) {
          continue
        }

        for (let s = 0; s < boss.extraHealthStacks; s++) {
          boss.bot.giveModifier('td_tome_health', -1)
        }
        for (let s = 0; s < boss.extraSizeStacks; s++) {
          boss.bot.giveModifier('td_boss_size_step', -1)
        }
        // Grant +60% ammo capacity so Bosses sustain heavy weapon bursts with fewer reloads.
        for (let s = 0; s < 3; s++) {
          boss.bot.giveModifier('td_tome_ammo', -1)
        }

        const upgradeMask = computeBossAbilityUpgradeMask(boss.tier)
        for (const abil of abils) {
          if (abil.slot >= 0 && abil.slot <= 3) {
            boss.bot.setAbility({ ability: abil.name, upgrades: upgradeMask })
          }
        }

        this.applyCreepScale(pawn.entity, boss.targetScale)
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
          `Configured Wave ${boss.wave} Boss (${boss.hero}, ent=${pawn.entity}, mod=${boss.modifier}, scale=${boss.targetScale}x, dmgMult=${boss.damageMult}x)`,
        )
      }

      if (boss.configuredPawnEntity === pawn.entity && pawn.health > 0) {
        if (!justConfigured && !boss.initialHealDone) {
          // Ensure HP filled to 100% once CCitadelPlayerPawn::GetMaxHealth expands from MODIFIER_VALUE_HEALTH_MAX.
          if (pawn.health < 1500) {
            boss.bot.heal(1_000_000)
          }
          boss.initialHealDone = true
        }
        const curScale = readField(
          pawn.entity,
          'CGameSceneNode',
          'm_flScale',
          'float32',
        )
        if (
          typeof curScale === 'number' &&
          Math.abs(curScale - boss.targetScale) > 0.05
        ) {
          this.applyCreepScale(pawn.entity, boss.targetScale)
        }

        const bossPos: Vector = justConfigured ? boss.spawnOrigin : pawn.position
        const rawEye = justConfigured ? undefined : pawn.eyePosition
        const bossEyePos: Vector =
          rawEye && rawEye.z > bossPos.z + 20
            ? rawEye
            : {
                x: bossPos.x,
                y: bossPos.y,
                z: bossPos.z + 64 * boss.targetScale,
              }

        const heroCandidates: BossHeroCandidate[] = liveDefenderPawns.map((hpawn) => {
          const heroTorso: Vector = {
            x: hpawn.position.x,
            y: hpawn.position.y,
            z: hpawn.position.z + 54,
          }
          let hasLineOfSight = false
          if (distance3D(bossEyePos, heroTorso) <= 1900) {
            const hit = trace({
              start: bossEyePos,
              end: heroTorso,
              layers: Layers.solid | Layers.staticLevel,
              ignore: [pawn.entity, hpawn.entity],
            })
            hasLineOfSight =
              !hit ||
              hit.entity === hpawn.entity ||
              distance3D(hit.position, heroTorso) <= 56
          }
          return {
            entity: hpawn.entity,
            position: hpawn.position,
            velocity: hpawn.velocity,
            health: hpawn.health,
            maxHealth: hpawn.effectiveMaxHealth ?? hpawn.maxHealth,
            hasLineOfSight,
          }
        })

        const plan = planBossDriveStep({
          hero: boss.hero,
          bossPos,
          bossEyePos,
          bossHealth: pawn.health,
          bossMaxHealth: pawn.effectiveMaxHealth ?? pawn.maxHealth,
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

  private applyCreepScale(handle: number, scale: number): void {
    fireInput(handle, 'SetAbsScale', { number: scale })
    writeField(handle, 'CGameSceneNode', 'm_flScale', 'float32', scale)
  }

  private cleanupBosses(): void {
    for (const boss of this.activeBosses) {
      boss.bot.drive()
      boss.bot.removeBot()
    }
    this.activeBosses.length = 0
  }
}
