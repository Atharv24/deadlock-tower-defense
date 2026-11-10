// Wave state machine, per-entity creep scaling (never healing damaged creeps
// mid-fight), Center Lane zipline & neutral camp spawning, and Boss Hero waves.

import {
  addBot,
  type DamageEvent,
  type DamageResult,
  entityPosition,
  findEntities,
  fireInput,
  killEntity,
  log,
  Npc,
  type Player,
  players,
  readField,
  serverCommand,
  toast,
  writeField,
} from 'modlock'

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
  INITIAL_WAVE_DELAY_SECONDS,
  isBossWave,
  selectUnscaledCreeps,
  TD_SERVER_CVARS,
  WAVE_INTERVAL_SECONDS,
  ZIPLINE_SQUAD_SIZE,
} from './config'

export interface CreepWaveSpec {
  readonly wave: number
  readonly targetHp: number
  readonly targetScale: number
  readonly damageMult: number
}

export interface ActiveBoss {
  readonly wave: number
  readonly bot: Player
  readonly hero: string
  readonly modifier: string
  readonly targetMaxHp: number
  pawnEntity: number
  configured: boolean
}

export class WaveManager {
  wave = 0
  nextWaveTime = INITIAL_WAVE_DELAY_SECONDS
  waveInterval = WAVE_INTERVAL_SECONDS
  aliveCreepCount = 0
  waitingForDefenderHero = false
  readonly scaledCreeps = new Set<number>()
  readonly creepSpecs = new Map<number, CreepWaveSpec>()
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
    this.restoreIntervalAt = 0
    this.applyServerConfig()
  }

  /** Restores state from Modlock hot-reload handoff. */
  restore(wave: number, nextWaveTime: number, scaledCreeps: readonly number[]): void {
    this.wave = wave
    this.nextWaveTime = nextWaveTime
    this.waitingForDefenderHero = false
    this.scaledCreeps.clear()
    this.creepSpecs.clear()
    this.restoreIntervalAt = 0

    const effectiveWave = Math.max(1, wave)
    const fallbackSpec: CreepWaveSpec = {
      wave: effectiveWave,
      targetHp: computeWaveCreepHp(effectiveWave),
      targetScale: computeWaveCreepScale(effectiveWave),
      damageMult: computeWaveCreepDamageMult(effectiveWave),
    }
    for (const handle of scaledCreeps) {
      this.scaledCreeps.add(handle)
      this.creepSpecs.set(handle, fallbackSpec)
    }
  }

  /** Removes all active enemy Boss bots and leftover creeps on restart. */
  cleanupForRestart(now: number): void {
    this.cleanupBosses()
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
    this.tickActiveBosses()
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

    // Respawn Center Lane neutral camp creeps ([PR#]td_lane_neutrals) every 3rd wave when cleared.
    if (this.wave % 3 === 1 && this.countLiveLaneNeutrals() === 0) {
      for (const camp of findEntities('info_neutral_trooper_camp')) {
        fireInput(camp, 'SpawnNeutrals')
      }
    }

    log(
      `Wave ${this.wave} spawned (Tier ${tier}: every ${this.waveInterval}s, HP=${targetHp}, Dmg=${damageMult}x, Scale=${targetScale}x, Souls=${soulReward})`,
    )

    if (isBossWave(this.wave)) {
      this.spawnBossForWave(this.wave)
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
      }
    }
    for (const scaledHandle of [...this.scaledCreeps]) {
      if (!liveSet.has(scaledHandle)) {
        this.scaledCreeps.delete(scaledHandle)
      }
    }

    const effectiveWave = Math.max(1, this.wave)
    const waveSpec: CreepWaveSpec = {
      wave: effectiveWave,
      targetHp: computeWaveCreepHp(effectiveWave),
      targetScale: computeWaveCreepScale(effectiveWave),
      damageMult: computeWaveCreepDamageMult(effectiveWave),
    }

    const newlySpawned = selectUnscaledCreeps(liveHandles, this.scaledCreeps)
    const newlySpawnedSet = new Set<number>(newlySpawned)

    for (const handle of newlySpawned) {
      this.creepSpecs.set(handle, waveSpec)
      this.applyCreepHealth(handle, waveSpec.targetHp, waveSpec.targetHp)
      this.applyCreepScale(handle, waveSpec.targetScale)
    }

    // Check previously scaled live creeps for engine maxHealth or scale resets.
    for (const handle of liveHandles) {
      if (newlySpawnedSet.has(handle)) {
        continue
      }
      let spec = this.creepSpecs.get(handle)
      if (!spec) {
        spec = waveSpec
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

  /** Scales outgoing damage dealt by enemy wave creeps in Modlock's `onDamage` hook. */
  modifyIncomingDamage(hit: DamageEvent): DamageResult | undefined {
    if (hit.attacker <= 0 || hit.amount <= 0) {
      return undefined
    }
    const spec = this.creepSpecs.get(hit.attacker)
    if (!spec) {
      return undefined
    }
    if (Math.abs(spec.damageMult - 1) < 0.001) {
      return undefined
    }
    return {
      amount: hit.amount * spec.damageMult,
    }
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
        if (npc.health > 0 && npc.maxHealth > 1 && npc.team !== 2) {
          handles.push(ent)
        }
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

  private countLiveLaneNeutrals(): number {
    let count = 0
    for (const ent of findEntities('npc_trooper_neutral')) {
      const lifeState = readField(ent, 'CBaseEntity', 'm_lifeState', 'uint8')
      if (typeof lifeState === 'number' && lifeState !== 0) {
        continue
      }
      const npc = new Npc(ent).read()
      if (npc && npc.health > 0) {
        count++
      }
    }
    return count
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

  private spawnBossForWave(wave: number): void {
    const spec = getBossWaveSpec(wave)
    const bot = addBot({
      name: `Wave ${wave} Boss`,
      team: 3,
      hero: spec.hero,
      position: BOSS_SPAWN_ORIGIN,
    })
    for (const conn of players()) {
      conn.player.announce(
        `BOSS WAVE ${wave}`,
        `Enemy ${spec.hero.replace('hero_', '').toUpperCase()} enters Center Lane!`,
      )
    }
    if (!bot) {
      log(`Boss bot slot unavailable on Wave ${wave}`)
      return
    }
    this.activeBosses.push({
      wave,
      bot,
      hero: spec.hero,
      modifier: spec.modifier,
      targetMaxHp: spec.bonusHp,
      pawnEntity: 0,
      configured: false,
    })
  }

  private tickActiveBosses(): void {
    for (let i = this.activeBosses.length - 1; i >= 0; i--) {
      const boss = this.activeBosses[i]
      const pawn = boss.bot.pawn()
      if (!pawn) {
        continue
      }
      boss.pawnEntity = pawn.entity
      if (!boss.configured && pawn.health > 0) {
        boss.bot.teleport(BOSS_SPAWN_ORIGIN, BOSS_SPAWN_ANGLES)
        boss.bot.giveModifier(boss.modifier, -1)
        boss.bot.adjustAbilityPoints(15, 4)
        boss.bot.adjustSouls(boss.wave * 1500, true)
        new Npc(pawn.entity).setHealth(boss.targetMaxHp, boss.targetMaxHp)
        boss.configured = true
      } else if (boss.configured && pawn.health <= 0) {
        // Boss was defeated!
        boss.bot.removeBot()
        this.activeBosses.splice(i, 1)
        for (const conn of players()) {
          conn.player.addMetric('td.bosses_slain', 1)
          toast(conn.player, `Boss defeated! Bonus +400 Souls!`)
          conn.player.adjustSouls(400, false)
        }
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
      boss.bot.removeBot()
    }
    this.activeBosses.length = 0
  }
}
