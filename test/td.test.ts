import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  BASE_CREEP_HP,
  BASE_CREEP_SCALE,
  computeBossTier,
  computeGuardianRepair,
  computeGuardianUpgradeCost,
  computeWaveCreepDamageMult,
  computeWaveCreepHp,
  computeWaveCreepScale,
  computeWaveSoulReward,
  computeWaveSpawnIntervalSeconds,
  computeWaveTier,
  deserializeTdHandoff,
  evaluateCreepHealthSync,
  evaluateCreepLastHit,
  getBossWaveSpec,
  getWaveCreepModifiers,
  GUARDIAN_BASE_MAX_HP,
  GUARDIAN_REPAIR_AMOUNT_HP,
  GUARDIAN_REPAIR_COST_SOULS,
  GUARDIAN_UPGRADE_BASE_COST_SOULS,
  GUARDIAN_UPGRADE_COST_STEP_SOULS,
  isBossWave,
  MAX_CREEP_HP,
  MAX_CREEP_SCALE,
  MIN_SPAWN_INTERVAL_SECONDS,
  MINOR_TOME_POOL,
  pickThreeMajorBoons,
  selectUnscaledCreeps,
  serializeTdHandoff,
  TD_SERVER_CVARS,
  type TdHandoffState,
  TOME_DROP_CHANCE,
  ZIPLINE_SQUAD_SIZE,
} from '../src/config.ts'

describe('Tier 1 — Wave Scaling & Boss Wave Math', () => {
  it('starts Wave 1 at BASE_CREEP_HP (200) and scales smoothly (+16%/wave) up to MAX_CREEP_HP cap', () => {
    assert.equal(computeWaveCreepHp(1), BASE_CREEP_HP)
    assert.equal(computeWaveCreepHp(1), 200)

    let prevHp = computeWaveCreepHp(1)
    for (let w = 2; w <= 90; w++) {
      const hp = computeWaveCreepHp(w)
      assert.ok(
        hp >= prevHp,
        `Expected Wave ${w} HP (${hp}) >= Wave ${w - 1} HP (${prevHp})`,
      )
      prevHp = hp
    }

    // Halved growth curve: Wave 5 ~362 HP, Wave 10 ~761 HP, Wave 15 ~1,597 HP
    assert.ok(computeWaveCreepHp(5) >= 350 && computeWaveCreepHp(5) <= 400)
    assert.ok(computeWaveCreepHp(10) >= 740 && computeWaveCreepHp(10) <= 800)
    assert.equal(computeWaveCreepHp(90), MAX_CREEP_HP)
  })

  it('maps Waves 1..90+ onto VData creep modifier tiers 1..10', () => {
    assert.equal(computeWaveTier(1), 1)
    assert.equal(computeWaveTier(5), 1)
    assert.equal(computeWaveTier(6), 2)
    assert.equal(computeWaveTier(25), 5)
    assert.equal(computeWaveTier(46), 10)
    assert.equal(computeWaveTier(90), 10)

    const mods = getWaveCreepModifiers(12)
    assert.equal(mods.tier, 3)
    assert.equal(mods.sizeModifier, 'td_creep_size_3')
    assert.equal(mods.strengthModifier, 'td_creep_strength_3')
  })

  it('identifies every 5th wave as a Boss wave and assigns td_boss_hero_stats_1..5', () => {
    assert.equal(isBossWave(1), false)
    assert.equal(isBossWave(4), false)
    assert.equal(isBossWave(5), true)
    assert.equal(isBossWave(10), true)
    assert.equal(isBossWave(25), true)

    assert.equal(computeBossTier(5), 1)
    assert.equal(computeBossTier(10), 2)
    assert.equal(computeBossTier(25), 5)
    assert.equal(computeBossTier(50), 5)

    const spec = getBossWaveSpec(15)
    assert.equal(spec.tier, 3)
    assert.equal(spec.modifier, 'td_boss_hero_stats_3')
    assert.ok(spec.bonusHp > 7500)
  })

  it('scales creep Damage, Size, Zipline Cadence, and Soul Bounties monotonically across waves', () => {
    assert.equal(computeWaveCreepDamageMult(1), 1)
    assert.equal(computeWaveCreepScale(1), BASE_CREEP_SCALE)
    assert.equal(computeWaveSpawnIntervalSeconds(1), 20)
    assert.equal(computeWaveSoulReward(1), 150)

    assert.ok(computeWaveCreepDamageMult(10) > computeWaveCreepDamageMult(5))
    assert.ok(computeWaveCreepDamageMult(20) > 1.8)

    assert.ok(computeWaveCreepScale(10) > computeWaveCreepScale(1))
    assert.equal(computeWaveCreepScale(60), MAX_CREEP_SCALE)

    assert.equal(computeWaveSpawnIntervalSeconds(3), 20)
    assert.equal(computeWaveSpawnIntervalSeconds(5), 17)
    assert.equal(computeWaveSpawnIntervalSeconds(8), 14)
    assert.equal(computeWaveSpawnIntervalSeconds(12), 11)
    assert.equal(computeWaveSpawnIntervalSeconds(18), 9)
    assert.equal(computeWaveSpawnIntervalSeconds(25), MIN_SPAWN_INTERVAL_SECONDS)

    const cvarMap = new Map(TD_SERVER_CVARS)
    assert.equal(cvarMap.get('citadel_trooper_max_per_lane'), 120)
    assert.equal(cvarMap.get('citadel_trooper_squad_size'), ZIPLINE_SQUAD_SIZE)
    assert.equal(cvarMap.get('citadel_trooper_health_mult_gametime'), 9999)
    assert.equal(cvarMap.get('citadel_hero_testing_enabled'), 1)
    assert.equal(cvarMap.get('citadel_hero_testing_legendary_items'), 1)
    assert.equal(cvarMap.get('citadel_hero_testing_infinite_money'), 0)
    assert.equal(cvarMap.get('citadel_hero_demo_no_troopers'), 0)
    assert.equal(cvarMap.has('citadel_SoloLane'), false)
    assert.equal(cvarMap.has('citadel_TrooperMax_Simultanous'), false)
  })
})

describe('Tier 1 — Per-Creep Scaling & No-Mid-Fight-Heal Regression', () => {
  it('scales each newly spawned creep handle exactly once and never re-selects surviving damaged creeps', () => {
    const scaledCreeps = new Set<number>()

    // Wave 1 spawns creep handles [101, 102, 103, 104]
    const firstBatch = selectUnscaledCreeps([101, 102, 103, 104], scaledCreeps)
    assert.deepEqual(firstBatch, [101, 102, 103, 104])

    // 1 second later, creeps [101, 102] took damage mid-fight and are still alive:
    // selectUnscaledCreeps MUST return [] so their m_iHealth is never overwritten!
    const midFightPoll = selectUnscaledCreeps([101, 102, 103, 104], scaledCreeps)
    assert.deepEqual(midFightPoll, [])

    // Wave 2 spawns new creeps [201, 202] while [101, 102] are still alive and damaged:
    // ONLY [201, 202] may be scaled!
    const wave2Batch = selectUnscaledCreeps([101, 102, 201, 202], scaledCreeps)
    assert.deepEqual(wave2Batch, [201, 202])
  })

  it('restores zipline-dismount maxHealth resets proportionally without ever healing combat damage', () => {
    // Combat-damaged creep with intact maxHealth (180 / 400): MUST NOT touch health
    const intactDamaged = evaluateCreepHealthSync(180, 400, 400)
    assert.equal(intactDamaged.needsApply, false)
    assert.equal(intactDamaged.newHp, 180)
    assert.equal(intactDamaged.newMaxHp, 400)

    // Full-HP creep whose maxHealth was reset to 150 on zipline dismount (150 / 150 -> 400 / 400)
    const dismountFull = evaluateCreepHealthSync(150, 150, 400)
    assert.equal(dismountFull.needsApply, true)
    assert.equal(dismountFull.newHp, 400)
    assert.equal(dismountFull.newMaxHp, 400)

    // Half-damaged creep whose maxHealth reset to 150 (75 / 150 -> 200 / 400, preserving 50% damage)
    const dismountDamaged = evaluateCreepHealthSync(75, 150, 400)
    assert.equal(dismountDamaged.needsApply, true)
    assert.equal(dismountDamaged.newHp, 200)
    assert.equal(dismountDamaged.newMaxHp, 400)
  })
})

describe('Tier 1 — onDamaged Player Last-Hit Tome System & Deduplication', () => {
  it('ignores non-lethal hits', () => {
    const validCreeps = new Set([501])
    const pawnToSlot = new Map([[10, 0]])
    const guardians = new Set([99])
    const rewarded = new Set<number>()

    const res = evaluateCreepLastHit(
      { victim: 501, attacker: 10, healthBefore: 150, healthLost: 60 },
      validCreeps,
      pawnToSlot,
      guardians,
      rewarded,
      0.01,
    )
    assert.equal(res.isKill, false)
    assert.equal(res.granted, false)
    assert.equal(res.reason, 'non_lethal')
    assert.equal(rewarded.has(501), false)
  })

  it('rejects Friendly Blue T1 Guardian kills so tower kills never grant player Tomes', () => {
    const validCreeps = new Set([501])
    const pawnToSlot = new Map([[10, 0]])
    const guardians = new Set([99])
    const rewarded = new Set<number>()

    const res = evaluateCreepLastHit(
      { victim: 501, attacker: 99, healthBefore: 80, healthLost: 80 },
      validCreeps,
      pawnToSlot,
      guardians,
      rewarded,
      0.01,
    )
    assert.equal(res.isKill, true)
    assert.equal(res.isPlayerKill, false)
    assert.equal(res.granted, false)
    assert.equal(res.reason, 'guardian_kill')
  })

  it('deduplicates multi-pellet shotgun kills on the same creep handle in the same frame', () => {
    const validCreeps = new Set([501])
    const pawnToSlot = new Map([[10, 0]])
    const guardians = new Set([99])
    const rewarded = new Set<number>()

    // Pellet 1 kills creep 501 and rolls 0.02 (< 0.10 TOME_DROP_CHANCE) -> grants Tome
    const firstPellet = evaluateCreepLastHit(
      { victim: 501, attacker: 10, healthBefore: 40, healthLost: 40 },
      validCreeps,
      pawnToSlot,
      guardians,
      rewarded,
      0.02,
      0.0,
    )
    assert.equal(firstPellet.granted, true)
    assert.equal(firstPellet.reason, 'granted')
    assert.equal(firstPellet.tome?.id, MINOR_TOME_POOL[0].id)

    // Pellet 2 arrives on the same tick for creep 501 -> must be rejected as duplicate_kill
    const secondPellet = evaluateCreepLastHit(
      { victim: 501, attacker: 10, healthBefore: 40, healthLost: 40 },
      validCreeps,
      pawnToSlot,
      guardians,
      rewarded,
      0.01,
      0.0,
    )
    assert.equal(secondPellet.granted, false)
    assert.equal(secondPellet.reason, 'duplicate_kill')
  })

  it('respects the 10% TOME_DROP_CHANCE threshold', () => {
    const validCreeps = new Set([601, 602])
    const pawnToSlot = new Map([[10, 0]])
    const guardians = new Set<number>()
    const rewarded = new Set<number>()

    const miss = evaluateCreepLastHit(
      { victim: 601, attacker: 10, healthBefore: 100, healthLost: 120 },
      validCreeps,
      pawnToSlot,
      guardians,
      rewarded,
      TOME_DROP_CHANCE + 0.01,
    )
    assert.equal(miss.isPlayerKill, true)
    assert.equal(miss.granted, false)
    assert.equal(miss.reason, 'rng_miss')

    const hit = evaluateCreepLastHit(
      { victim: 602, attacker: 10, healthBefore: 100, healthLost: 120 },
      validCreeps,
      pawnToSlot,
      guardians,
      rewarded,
      TOME_DROP_CHANCE - 0.001,
      0.99,
    )
    assert.equal(hit.isPlayerKill, true)
    assert.equal(hit.granted, true)
    assert.equal(hit.tome?.id, MINOR_TOME_POOL[MINOR_TOME_POOL.length - 1].id)
  })
})

describe('Tier 1 — 1-of-3 Major Boon Picker & Guardian Mechanics', () => {
  it('always offers 3 distinct Major Boons for milestone waves', () => {
    for (const wave of [5, 10, 15, 20, 25, 30]) {
      const [b1, b2, b3] = pickThreeMajorBoons(wave, 0)
      assert.notEqual(b1.id, b2.id)
      assert.notEqual(b2.id, b3.id)
      assert.notEqual(b1.id, b3.id)
    }
  })

  it('validates Guardian repair Soul cost, full-HP guard, and max-HP clamping', () => {
    const full = computeGuardianRepair(
      GUARDIAN_BASE_MAX_HP,
      GUARDIAN_BASE_MAX_HP,
      1000,
    )
    assert.equal(full.ok, false)

    const broke = computeGuardianRepair(2000, GUARDIAN_BASE_MAX_HP, 100)
    assert.equal(broke.ok, false)

    const valid = computeGuardianRepair(3000, GUARDIAN_BASE_MAX_HP, 500)
    assert.equal(valid.ok, true)
    assert.equal(valid.newHp, 3000 + GUARDIAN_REPAIR_AMOUNT_HP)
    assert.equal(valid.soulsSpent, GUARDIAN_REPAIR_COST_SOULS)

    const clamped = computeGuardianRepair(5000, GUARDIAN_BASE_MAX_HP, 500)
    assert.equal(clamped.ok, true)
    assert.equal(clamped.newHp, GUARDIAN_BASE_MAX_HP)
    assert.equal(clamped.healedAmount, 500)
  })

  it('scales Guardian upgrade Soul cost linearly per fortification level', () => {
    assert.equal(computeGuardianUpgradeCost(0), GUARDIAN_UPGRADE_BASE_COST_SOULS)
    assert.equal(
      computeGuardianUpgradeCost(2),
      GUARDIAN_UPGRADE_BASE_COST_SOULS + 2 * GUARDIAN_UPGRADE_COST_STEP_SOULS,
    )
  })

  it('round-trips TdHandoffState cleanly across hot reloads', () => {
    const state: TdHandoffState = {
      version: 1,
      wave: 14,
      nextWaveTime: 290.5,
      matchState: 'active',
      guardianUpgradeLevel: 2,
      guardianBonusMaxHp: 2400,
      scaledCreeps: [101, 102, 205],
      rewardedCreeps: [98, 99],
      playerTomes: { '0': { spirit: 3, weapon: 2 } },
      playerKills: { '0': 47 },
    }
    const raw = serializeTdHandoff(state)
    const restored = deserializeTdHandoff(raw)
    assert.deepEqual(restored, state)
    assert.equal(deserializeTdHandoff(undefined), undefined)
    assert.equal(deserializeTdHandoff('{invalid json'), undefined)
  })
})

describe('Tier 1B — Full Manager & TdProbe State Machine Integration (Mock Host)', async () => {
  const { registerHooks } = await import('node:module')

  // Simulated engine state for the mock Modlock host
  const npcStore = new Map<
    number,
    { health: number; maxHealth: number; team: number; position: { x: number; y: number; z: number } }
  >()
  npcStore.set(700, {
    health: 5500,
    maxHealth: 5500,
    team: 2,
    position: { x: 0, y: -1792, z: 384 },
  })
  npcStore.set(801, {
    health: 150,
    maxHealth: 150,
    team: 3,
    position: { x: 0, y: -500, z: 384 },
  })
  npcStore.set(802, {
    health: 150,
    maxHealth: 150,
    team: 3,
    position: { x: 40, y: -500, z: 384 },
  })

  const appliedModifiers: string[] = []
  const executedServerCommands: string[] = []
  const spawnedTrooperUnits: string[] = []
  const firedInputs: Array<{ entity: number; input: string }> = []
  const scaleStore = new Map<number, number>()
  const lifeStateStore = new Map<number, number>()
  let nextSpawnedEntityId = 2000
  let probePassed = false
  let probeFailedReason = ''

  class MockPlayer {
    readonly slot: number
    souls = 1000
    ap = 0
    team = 2
    hero = 1
    pawnEntity = 10
    health = 700
    position = { x: 0, y: -1950, z: 390 }
    constructor(slot: number) {
      this.slot = slot
    }
    pawn() {
      return {
        entity: this.pawnEntity,
        hero: this.hero,
        team: this.team,
        health: this.health,
        maxHealth: 700,
        position: this.position,
        eyeAngles: { pitch: 0, yaw: 90, roll: 0 },
        cameraAngles: { pitch: 0, yaw: 90, roll: 0 },
        generation: 1,
        souls: this.souls,
        eyePosition: this.position,
        velocity: { x: 0, y: 0, z: 0 },
        abilityPoints: this.ap,
        abilityUnlocks: 0,
      }
    }
    setting(_k: string) {
      return '20'
    }
    announce(_t: string, _m: string) {
      return true
    }
    addMetric(_n: string, _v: number) {
      return true
    }
    adjustSouls(delta: number) {
      this.souls += delta
      return true
    }
    adjustAbilityPoints(pts: number) {
      this.ap += pts
      return true
    }
    giveModifier(mod: string) {
      appliedModifiers.push(mod)
      return true
    }
    sound(_s: string) {
      return true
    }
    teleport(pos: { x: number; y: number; z: number }) {
      this.position = pos
      return true
    }
    removeBot() {
      return true
    }
  }

  const defenderPlayer = new MockPlayer(0)

  class MockNpc {
    readonly entity: number
    constructor(entity: number) {
      this.entity = entity
    }
    read() {
      const s = npcStore.get(this.entity)
      if (!s) return undefined
      return {
        ...s,
        facing: { pitch: 0, yaw: 270, roll: 0 },
      }
    }
    setHealth(hp: number, maxHp?: number) {
      const s = npcStore.get(this.entity)
      if (!s) return false
      s.health = hp
      if (maxHp !== undefined) s.maxHealth = maxHp
      return true
    }
  }

  class MockProbeRun {
    constructor(_name: string, _timeout: number) {}
    tick(_now: number, _wait: string, stepFn: () => boolean | string) {
      const res = stepFn()
      if (res === true) {
        probePassed = true
      } else if (typeof res === 'string') {
        probeFailedReason = res
      }
    }
  }

  const mockModlockSource = `
    export const Npc = globalThis.__mockModlock.Npc;
    export const ProbeRun = globalThis.__mockModlock.ProbeRun;
    export const players = () => [{ player: globalThis.__mockModlock.defenderPlayer, name: 'Defender', bot: false, ready: true, steamId: 1n, generation: 1, roles: [] }];
    export const addBot = (opts) => {
      const p = new globalThis.__mockModlock.MockPlayer(2);
      p.team = opts.team;
      p.pawnEntity = 999;
      globalThis.__mockModlock.npcStore.set(999, { health: 2500, maxHealth: 2500, team: opts.team, position: opts.position ?? { x: 0, y: 1200, z: 390 } });
      return p;
    };
    export const findEntitiesByName = (name) => name.includes('boss_rebel_t1_blue') ? [700] : [];
    export const findEntities = (cls) => {
      if (cls === 'info_super_trooper_spawn') return [14020, 14325];
      if (cls === 'info_neutral_trooper_camp') return [15001];
      if (cls === 'npc_trooper') return [801, 802];
      if (cls === 'npc_trooper_neutral') return [];
      if (cls === 'npc_trooper_boss') return [700];
      return [];
    };
    export const fireInput = (entity, input, value) => {
      globalThis.__mockModlock.firedInputs.push({ entity, input });
      if (input === 'SetAbsScale' && value && typeof value.number === 'number') {
        globalThis.__mockModlock.scaleStore.set(entity, value.number);
      }
      return true;
    };
    export const killEntity = (opts) => {
      const s = globalThis.__mockModlock.npcStore.get(opts.victim);
      if (s) s.health = 0;
      return true;
    };
    export const holdModifierState = () => true;
    export const entityPosition = (entity) => {
      const s = globalThis.__mockModlock.npcStore.get(entity);
      return s ? { position: s.position, facing: { pitch: 0, yaw: 270, roll: 0 }, velocity: { x: 0, y: 0, z: 0 } } : undefined;
    };
    export const readField = (entity, cls, field) => {
      if (cls === 'CGameSceneNode' && field === 'm_flScale') {
        return globalThis.__mockModlock.scaleStore.get(entity);
      }
      if (cls === 'CBaseEntity' && field === 'm_lifeState') {
        return globalThis.__mockModlock.lifeStateStore.get(entity) ?? 0;
      }
      return undefined;
    };
    export const writeField = (entity, cls, field, _type, val) => {
      if (cls === 'CGameSceneNode' && field === 'm_flScale' && typeof val === 'number') {
        globalThis.__mockModlock.scaleStore.set(entity, val);
      }
      return true;
    };
    export const spawnNpc = (opts) => {
      const ent = globalThis.__mockModlock.allocSpawnEntity();
      globalThis.__mockModlock.spawnedTrooperUnits.push(opts.unit);
      globalThis.__mockModlock.npcStore.set(ent, {
        health: opts.health ?? 150,
        maxHealth: opts.maxHealth ?? opts.health ?? 150,
        team: opts.team,
        position: opts.position,
      });
      return new globalThis.__mockModlock.Npc(ent);
    };
    export const serverCommand = (cmd) => {
      globalThis.__mockModlock.executedServerCommands.push(cmd);
      return true;
    };
    export const toast = () => {};
    export const log = () => true;
  `
  ;(globalThis as Record<string, unknown>).__mockModlock = {
    Npc: MockNpc,
    ProbeRun: MockProbeRun,
    MockPlayer,
    defenderPlayer,
    npcStore,
    executedServerCommands,
    spawnedTrooperUnits,
    allocSpawnEntity: () => ++nextSpawnedEntityId,
    firedInputs,
    scaleStore,
    lifeStateStore,
  }

  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === 'modlock') {
        return { url: 'modlock:mock', shortCircuit: true }
      }
      if (
        (specifier.startsWith('./') || specifier.startsWith('../')) &&
        !specifier.endsWith('.ts') &&
        !specifier.endsWith('.tsx')
      ) {
        return nextResolve(`${specifier}.ts`, context)
      }
      return nextResolve(specifier, context)
    },
    load(url, context, nextLoad) {
      if (url === 'modlock:mock') {
        return {
          format: 'module',
          source: mockModlockSource,
          shortCircuit: true,
        }
      }
      return nextLoad(url, context)
    },
  })

  const { GuardianManager } = await import('../src/guardian.ts')
  const { WaveManager } = await import('../src/wave.ts')
  const { TomeManager } = await import('../src/tomes.ts')
  const { TdProbe } = await import('../src/probe.ts')

  it('drives GuardianManager, WaveManager, TomeManager, and TdProbe through all 5 Probe steps to PASS', () => {
    const guardian = new GuardianManager()
    const tomes = new TomeManager()
    const waves = new WaveManager((w) => tomes.offerMajorBoonForWave(w))
    const probe = new TdProbe()

    guardian.reset()
    tomes.reset()
    waves.reset(0)

    // Advance the 5 probe steps: world -> defender -> wave_scale -> tome_grant -> boon_and_guardian
    for (let step = 1; step <= 6 && !probePassed; step++) {
      probe.tick(step * 2, waves, guardian, tomes)
      assert.equal(probeFailedReason, '', `TdProbe failed: ${probeFailedReason}`)
    }

    assert.equal(probePassed, true, 'Expected TdProbe to reach PASS state')
    assert.ok(appliedModifiers.length >= 2, 'Expected VData td_tome_* modifiers to be applied')
  })

  it('ignores pooled skybase lifeState=2 & zipline 1/1 entities, recovers recycled handles, and scales 100% of landed creeps', () => {
    npcStore.clear()
    lifeStateStore.clear()
    scaleStore.clear()
    executedServerCommands.length = 0
    firedInputs.length = 0

    const waves = new WaveManager()
    waves.reset(0)

    // Simulate creep 801 pooled in skybase (lifeState=2, 200/200 @[1268,10764,1410])
    // while creep 802 has landed in Center Lane (lifeState=0, 150/150 @[40,-500,384])
    waves.wave = 7
    lifeStateStore.set(801, 2)
    lifeStateStore.set(802, 0)
    npcStore.set(801, {
      health: 200,
      maxHealth: 200,
      team: 3,
      position: { x: 1268, y: 10764, z: 1410 },
    })
    npcStore.set(802, {
      health: 150,
      maxHealth: 150,
      team: 3,
      position: { x: 40, y: -500, z: 384 },
    })

    const spawnedWave = waves.spawnNextWave(100, true)
    assert.equal(spawnedWave, 8)
    const expectedHp = computeWaveCreepHp(8)
    const expectedScale = computeWaveCreepScale(8)
    const expectedDmgMult = computeWaveCreepDamageMult(8)
    const expectedInterval = computeWaveSpawnIntervalSeconds(8) // 14s

    // Alive count MUST be 1 (only landed 802, NOT pooled skybase 801!)
    assert.equal(waves.aliveCreepCount, 1)
    assert.equal(waves.scaledCreeps.has(801), false)
    assert.equal(npcStore.get(802)?.maxHealth, expectedHp)
    assert.equal(scaleStore.get(802), expectedScale)

    // Next second: 801 rides zipline (lifeState=0, 1/1 @[0,2000,1025]) -> still excluded until landing!
    lifeStateStore.set(801, 0)
    npcStore.set(801, {
      health: 1,
      maxHealth: 1,
      team: 3,
      position: { x: 0, y: 2000, z: 1025 },
    })
    waves.tick(101.5, true)
    assert.ok(
      executedServerCommands.includes(
        `citadel_trooper_spawn_interval_early ${expectedInterval}`,
      ),
    )
    assert.equal(waves.aliveCreepCount, 1)
    assert.equal(waves.scaledCreeps.has(801), false)

    // Next second: 801 dismounts onto Center Lane (lifeState=0, 150/150 @[0,400,384]) -> immediately scaled!
    npcStore.set(801, {
      health: 150,
      maxHealth: 150,
      team: 3,
      position: { x: 0, y: 400, z: 384 },
    })
    waves.scaleNewlySpawnedCreeps()
    assert.equal(waves.aliveCreepCount, 2)
    assert.equal(waves.scaledCreeps.has(801), true)
    assert.equal(npcStore.get(801)?.maxHealth, expectedHp)
    assert.equal(npcStore.get(801)?.health, expectedHp)
    assert.equal(scaleStore.get(801), expectedScale)

    // Simulate handle 801 dying/returning to pool (lifeState=2) and then re-landing on Wave 11:
    // scaledCreeps MUST release 801 when lifeState=2 so its next Wave 11 spawn gets Wave 11 HP!
    lifeStateStore.set(801, 2)
    waves.scaleNewlySpawnedCreeps()
    assert.equal(waves.scaledCreeps.has(801), false)

    waves.wave = 11
    lifeStateStore.set(801, 0)
    npcStore.set(801, {
      health: 150,
      maxHealth: 150,
      team: 3,
      position: { x: 0, y: 350, z: 384 },
    })
    waves.scaleNewlySpawnedCreeps()
    assert.equal(npcStore.get(801)?.maxHealth, computeWaveCreepHp(11))

    // Verify outgoing creep damage is scaled in modifyIncomingDamage, while player hits are untouched
    const scaledHit = waves.modifyIncomingDamage({
      victim: 700,
      attacker: 802,
      inflictor: 802,
      ability: 0,
      flags: 0n,
      hitGroup: 0,
      amount: 20,
    })
    assert.ok(scaledHit?.amount !== undefined)
    assert.ok(Math.abs((scaledHit?.amount ?? 0) - 20 * expectedDmgMult) < 0.01)

    const playerHit = waves.modifyIncomingDamage({
      victim: 802,
      attacker: 10,
      inflictor: 10,
      ability: 0,
      flags: 0n,
      hitGroup: 0,
      amount: 50,
    })
    assert.equal(playerHit, undefined)
  })

  it('auto-seats on Hidden King (Team 2) and holds Wave 1 while defender is on Hero Selection UI (hero === 0)', () => {
    executedServerCommands.length = 0
    npcStore.clear()
    lifeStateStore.clear()

    const waves = new WaveManager()
    waves.reset(0)

    assert.ok(
      executedServerCommands.includes('citadel_player_starting_team 2'),
      'Expected citadel_player_starting_team 2 to auto-seat on The Hidden King',
    )
    assert.ok(
      executedServerCommands.includes('citadel_hero_testing_legendary_items 1'),
      'Expected T5 Legendary items CVar to remain enabled',
    )
    assert.ok(
      executedServerCommands.includes('citadel_allow_purchasing_anywhere 1'),
      'Expected Buy Anywhere CVar to be enabled',
    )
    assert.ok(
      executedServerCommands.includes('citadel_disable_purchasing_in_combat 0'),
      'Expected in-combat purchase restriction to be disabled',
    )

    // Simulate defender seated on Team 2 before choosing a hero (pawn.hero === 0)
    defenderPlayer.hero = 0
    lifeStateStore.set(802, 0)
    npcStore.set(802, {
      health: 150,
      maxHealth: 150,
      team: 3,
      position: { x: 0, y: 200, z: 384 },
    })

    // Even after 15 seconds on Hero Selection UI, Wave 1 must NOT start and stray creep 802 is cleared
    waves.tick(15, true)
    assert.equal(waves.wave, 0)
    assert.equal(waves.waitingForDefenderHero, true)
    assert.equal(waves.nextWaveTime, 20)
    assert.equal(npcStore.get(802)?.health, 0)

    // Player clicks a hero in HeroPickerModal (e.g. Graves = id 76) -> 5s countdown begins, then Wave 1 spawns!
    defenderPlayer.hero = 76
    waves.tick(16, true)
    assert.equal(waves.waitingForDefenderHero, false)
    assert.equal(waves.wave, 0)

    waves.tick(20, true)
    assert.equal(waves.wave, 1)

    // Restore default mock hero
    defenderPlayer.hero = 1
  })
})

