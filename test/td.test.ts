import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  advanceBossWaypointIndex,
  BOSS_GUARDIAN_MIN_STANDOFF,
  BOSS_GUARDIAN_SIEGE_RANGE,
  BOSS_LANE_ROUTES,
  type BossButtonMask,
  computeAimAngles,
  computeBossAbilityUpgradeMask,
  createBossAiState,
  flatDistance2D,
  getBossWaypointsForObjective,
  planBossDriveStep,
  selectBossTarget,
  worldMoveToDriveAxes,
} from '../src/boss_ai.ts'
import {
  BASE_CREEP_HP,
  BASE_CREEP_SCALE,
  computeBossTier,
  computeCreepScaleAuraStep,
  computeGuardianRepair,
  computeGuardianUpgradeCost,
  computeStructureDamageMult,
  computeVanillaEffectiveHpDamageScale,
  computeVanillaTomeBonuses,
  computeWaveCreepDamageMult,
  computeWaveCreepHp,
  computeWaveCreepScale,
  computeWaveSoulReward,
  computeWaveSpawnIntervalSeconds,
  computeWaveTier,
  deserializeTdHandoff,
  EMPTY_SERVER_SHUTDOWN_DELAY_SECONDS,
  type EmptyServerWatchState,
  evaluateAllStructuresRepair,
  evaluateBaseDefenseProgression,
  evaluateCreepHealthSync,
  evaluateCreepLastHit,
  evaluateEmptyServerShutdown,
  evaluateLegendaryPurchase,
  formatItemDisplayTitle,
  getBossWaveSpec,
  getCreepScaleAuraModifier,
  getDefenderStageSpawnOrigin,
  getStructureFortifyAuraSpec,
  getWaveCreepModifiers,
  getWaveNeutralSpawns,
  GUARDIAN_BASE_MAX_HP,
  GUARDIAN_REPAIR_AMOUNT_HP,
  GUARDIAN_REPAIR_COST_SOULS,
  GUARDIAN_UPGRADE_BASE_COST_SOULS,
  GUARDIAN_UPGRADE_COST_STEP_SOULS,
  isBossWave,
  isExplodingZombieBaseMaxHp,
  isExplodingZombieIdentity,
  isWithinZombieDetonationRange,
  LEGENDARY_ITEM_COST_SOULS,
  MAX_CREEP_HP,
  MAX_CREEP_SCALE,
  MIN_SPAWN_INTERVAL_SECONDS,
  MINOR_TOME_POOL,
  parseSlashCommandLine,
  pickThreeMajorBoons,
  selectUnscaledCreeps,
  serializeTdHandoff,
  shouldFreeHudCursor,
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

    const spec5 = getBossWaveSpec(5)
    const spec10 = getBossWaveSpec(10)
    const spec15 = getBossWaveSpec(15)
    const spec25 = getBossWaveSpec(25)
    const spec30 = getBossWaveSpec(30)
    assert.equal(spec5.targetScale, 1.35)
    assert.equal(spec10.targetScale, 1.5)
    assert.equal(spec15.tier, 3)
    assert.equal(spec15.modifier, 'td_boss_hero_stats_3')
    assert.equal(spec15.targetScale, 1.65)
    assert.ok(spec15.bonusHp > 7500)
    assert.equal(spec25.targetScale, 1.95)
    assert.equal(spec30.endlessBoostStacks, 1)
    assert.equal(spec30.extraSizeStacks, 1)
    assert.equal(spec30.targetScale, 2.05)

    // Verify 16-step C++ creep scale aura mapping (0.90x -> 1.65x)
    assert.equal(computeCreepScaleAuraStep(0.9), 1)
    assert.equal(getCreepScaleAuraModifier(1).modifier, 'td_creep_scale_aura_1')
    assert.equal(getCreepScaleAuraModifier(1).appliedScale, 0.9)
    assert.equal(getCreepScaleAuraModifier(60).modifier, 'td_creep_scale_aura_16')
    assert.equal(getCreepScaleAuraModifier(60).appliedScale, 1.65)
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
    assert.equal(cvarMap.get('citadel_trooper_max_per_lane'), 36)
    assert.equal(cvarMap.get('citadel_trooper_squad_size'), ZIPLINE_SQUAD_SIZE)
    assert.equal(cvarMap.get('citadel_trooper_health_mult_gametime'), 9999)
    assert.equal(cvarMap.get('citadel_pregame_wait_duration'), 1)
    assert.equal(cvarMap.has('citadel_hero_testing_legendary_items'), false)
    assert.equal(cvarMap.has('citadel_hero_testing_enabled'), false)
    assert.equal(cvarMap.has('citadel_coop_sandbox'), false)
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

    // Major Boon UI appearing mid-wave MUST NOT unlock mouse camera aiming
    assert.equal(
      shouldFreeHudCursor({
        needsHeroPick: false,
        hasPendingBoons: true,
        matchState: 'active',
      }),
      false,
    )
    assert.equal(
      shouldFreeHudCursor({
        needsHeroPick: true,
        hasPendingBoons: false,
        matchState: 'active',
      }),
      true,
    )
    assert.equal(
      shouldFreeHudCursor({
        needsHeroPick: false,
        hasPendingBoons: false,
        matchState: 'defeat',
      }),
      true,
    )
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
      patronReachedStage2: true,
      scaledCreeps: [101, 102, 205],
      explodingZombies: [102],
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

  it('parses Team Chat and All-Chat slash commands cleanly', () => {
    assert.deepEqual(parseSlashCommandLine('/boss'), { name: 'boss', args: '' })
    assert.deepEqual(parseSlashCommandLine('  /BOON   2  '), {
      name: 'boon',
      args: '2',
    })
    assert.deepEqual(parseSlashCommandLine('/hero Seven'), {
      name: 'hero',
      args: 'Seven',
    })
    assert.equal(parseSlashCommandLine('hello team'), undefined)
    assert.equal(parseSlashCommandLine('/'), undefined)
    assert.equal(parseSlashCommandLine('/   '), undefined)
  })

  it('distinguishes Graves Zombie base maxHP (400) and vanilla/custom melee & shambler identities from ranged troopers', () => {
    assert.equal(isExplodingZombieBaseMaxHp(400), true)
    assert.equal(isExplodingZombieBaseMaxHp(300), false)
    assert.equal(isExplodingZombieBaseMaxHp(350), false)
    assert.equal(isExplodingZombieBaseMaxHp(1), false)

    assert.equal(
      isExplodingZombieIdentity('npc_necro_skele', 'models/heroes_wip/necro/necro_shambler.vmdl', 100),
      true,
    )
    assert.equal(
      isExplodingZombieIdentity('npc_trooper', 'models/npc_units/trooper/sapphire_trooper_01_melee.vmdl', 400),
      true,
    )
    assert.equal(
      isExplodingZombieIdentity('npc_trooper', 'models/npc_units/trooper/amber_trooper_01_melee.vmdl', 400),
      true,
    )
    assert.equal(
      isExplodingZombieIdentity('npc_trooper', 'models/heroes_wip/necro/necro_shambler.vmdl', 413),
      true,
    )
    assert.equal(
      isExplodingZombieIdentity('npc_trooper', 'models/npc_units/trooper/sapphire_trooper_01.vmdl', 300),
      false,
    )
    assert.equal(
      isExplodingZombieIdentity('npc_trooper_neutral', 'models/npc_units/neutral_ct_lanterns/neutral_ct_lantern.vmdl', 400),
      false,
    )

    // Verify vanilla unit mappings & vanilla Tome scaling math
    const w1Vanilla = getWaveNeutralSpawns(1).map((s) => s.vanillaUnit)
    const w2Vanilla = getWaveNeutralSpawns(2).map((s) => s.vanillaUnit)
    assert.deepEqual(w1Vanilla, ['neutral_lantern_normal', 'neutral_theater_normal'])
    assert.deepEqual(w2Vanilla, ['neutral_rooftop_pigeon_normal', 'neutral_mushroom_strong'])

    const vanillaTomes = computeVanillaTomeBonuses({
      weapon: 3,
      firerate: 2,
      spirit: 4,
      range: 1,
      health: 2,
      cooldown: 5,
      omni: 2,
    })
    assert.equal(vanillaTomes.weaponDamageMult, 1.55)
    assert.equal(vanillaTomes.abilityDamageMult, 1.35)
    assert.equal(vanillaTomes.bonusMaxHp, 240)
    assert.equal(vanillaTomes.regenPerSecond, 6)
    assert.equal(vanillaTomes.cooldownReductionFraction, 0.18)

    assert.equal(computeVanillaEffectiveHpDamageScale(700, 0), 1)
    assert.equal(computeVanillaEffectiveHpDamageScale(700, 700), 0.5)
  })

  it('auto-quits server 30s after last human disconnects, ignoring cold startup and cancelling on reconnect', () => {
    assert.equal(EMPTY_SERVER_SHUTDOWN_DELAY_SECONDS, 30)

    let state: EmptyServerWatchState = {
      hasSeenHuman: false,
      emptySinceSeconds: undefined,
      quitIssued: false,
    }

    // Cold server startup (0..60s before first human joins) must NEVER trigger quit
    const coldCheck = evaluateEmptyServerShutdown(state, 0, 60, false)
    assert.equal(coldCheck.shouldQuit, false)
    assert.equal(coldCheck.nextState.hasSeenHuman, false)

    // First human joins at t=65s
    const joined = evaluateEmptyServerShutdown(coldCheck.nextState, 1, 65, false)
    assert.equal(joined.shouldQuit, false)
    assert.equal(joined.nextState.hasSeenHuman, true)
    assert.equal(joined.nextState.emptySinceSeconds, undefined)

    // Human disconnects at t=100s -> starts 30s countdown
    const leftStart = evaluateEmptyServerShutdown(joined.nextState, 0, 100, false)
    assert.equal(leftStart.shouldQuit, false)
    assert.equal(leftStart.nextState.emptySinceSeconds, 100)

    // At t=120s (20s elapsed), human reconnects -> cancels countdown
    const reconnected = evaluateEmptyServerShutdown(leftStart.nextState, 1, 120, false)
    assert.equal(reconnected.shouldQuit, false)
    assert.equal(reconnected.nextState.emptySinceSeconds, undefined)

    // Human disconnects again at t=200s
    const leftAgain = evaluateEmptyServerShutdown(reconnected.nextState, 0, 200, false)
    assert.equal(leftAgain.shouldQuit, false)
    assert.equal(leftAgain.nextState.emptySinceSeconds, 200)

    // Probe mode bypasses shutdown
    const probeCheck = evaluateEmptyServerShutdown(leftAgain.nextState, 0, 250, true)
    assert.equal(probeCheck.shouldQuit, false)

    // At t=229s (29s elapsed) -> still waiting
    const at29s = evaluateEmptyServerShutdown(leftAgain.nextState, 0, 229, false)
    assert.equal(at29s.shouldQuit, false)

    // At t=230s (30s elapsed) -> triggers quit exactly once!
    const at30s = evaluateEmptyServerShutdown(at29s.nextState, 0, 230, false)
    assert.equal(at30s.shouldQuit, true)
    assert.equal(at30s.nextState.quitIssued, true)

    // Subsequent frames do not re-issue quit
    const afterQuit = evaluateEmptyServerShutdown(at30s.nextState, 0, 231, false)
    assert.equal(afterQuit.shouldQuit, false)
  })
})

describe('Tier 1 — Enemy Hero Boss AI Navigation, Aiming & Combat Brain', () => {
  const TEST_BUTTONS: BossButtonMask = {
    attack: 1n << 0n,
    jump: 1n << 1n,
    crouch: 1n << 2n,
    dash: 1n << 3n,
    altFire: 1n << 4n,
    reload: 1n << 5n,
    melee: 1n << 6n,
    ability1: 1n << 7n,
    ability2: 1n << 8n,
    ability3: 1n << 9n,
    ultimate: 1n << 10n,
  }

  it('unlocks bit 0 plus tier upgrades (0b0011 -> 0b0111 -> 0b1111) and validates Center Lane routes inside Guardian invul range', () => {
    assert.equal(computeBossAbilityUpgradeMask(1), 0b0011)
    assert.equal(computeBossAbilityUpgradeMask(2), 0b0111)
    assert.equal(computeBossAbilityUpgradeMask(3), 0b1111)
    assert.equal(computeBossAbilityUpgradeMask(5), 0b1111)

    const guardianPos = { x: 0, y: -1792, z: 384 }
    for (const route of BOSS_LANE_ROUTES) {
      // Pit waypoints stay away from (0, 0) central cover block (|x| >= 100)
      for (const wp of route.slice(0, -1)) {
        assert.ok(Math.abs(wp.x) >= 100, `Waypoint ${JSON.stringify(wp)} too close to x=0 central block`)
      }
      // Final siege anchor must sit inside npc_boss_tier1 m_flInvulRange (944.882u) and outside pedestal (485u)
      const finalWp = route[route.length - 1]
      const dist = flatDistance2D(finalWp, guardianPos)
      assert.ok(dist < BOSS_GUARDIAN_SIEGE_RANGE, `Expected siege dist ${dist} < ${BOSS_GUARDIAN_SIEGE_RANGE}`)
      assert.ok(dist > BOSS_GUARDIAN_MIN_STANDOFF, `Expected siege dist ${dist} > ${BOSS_GUARDIAN_MIN_STANDOFF}`)
    }
  })

  it('transforms world movement into yaw-relative (forward, left) axes so Bosses march south even while aiming 180° north', () => {
    // Aiming North (+90°) at a kiting player while moving South (0, -1): forward = -1 (backpedal south), left = 0
    const backpedalSouth = worldMoveToDriveAxes(0, -1, 90)
    assert.ok(Math.abs(backpedalSouth.forward - -1) < 1e-6)
    assert.ok(Math.abs(backpedalSouth.left) < 1e-6)

    // Aiming South (-90°) while strafing East (+1, 0): forward = 0, left = +1
    const strafeEast = worldMoveToDriveAxes(1, 0, -90)
    assert.ok(Math.abs(strafeEast.forward) < 1e-6)
    assert.ok(Math.abs(strafeEast.left - 1) < 1e-6)

    // Aiming upward reduces pitch (negative in Source 2); aiming downward increases pitch (positive)
    const upAngles = computeAimAngles({ x: 0, y: 0, z: 256 }, { x: 0, y: -300, z: 388 })
    assert.ok(upAngles.pitch < -15)
    assert.ok(Math.abs(upAngles.yaw - -90) < 1e-4)

    // Waypoint index advances when within 165u OR already further south
    const idx = advanceBossWaypointIndex({ x: -120, y: 40, z: 256 }, BOSS_LANE_ROUTES[0], 0)
    assert.equal(idx, 3)
  })

  it('refuses to get kited north by a behind-spawn Defender, protects channeled ultimates, and recovers when stuck', () => {
    const state = createBossAiState({ x: -165, y: 1200, z: 390 }, 0)
    assert.equal(state.routeIndex, 0)

    // Defender tries to kite Boss north from y=1450 while Boss is at y=900:
    // Boss MUST aim north & hold attack, yet keep moving south (world moveY < 0 -> forward < 0)!
    const kitePlan = planBossDriveStep({
      hero: 'hero_forge',
      bossPos: { x: -190, y: 900, z: 388 },
      bossEyePos: { x: -190, y: 900, z: 480 },
      bossHealth: 5000,
      bossMaxHealth: 5000,
      abilities: [
        {
          name: 'citadel_ability_MINI_turret',
          slot: 0,
          entity: 501,
          upgrades: 0b1111,
          charges: 2,
          cooldownEnd: 0,
          id: 1,
          state: 0,
          cooldownStart: 0,
          rechargeStart: 0,
          rechargeEnd: 0,
          imbues: [],
        },
        {
          name: 'citadel_ability_heavy_barrage',
          slot: 3,
          entity: 504,
          upgrades: 0b1111,
          charges: 0,
          cooldownEnd: 0,
          id: 4,
          state: 0,
          cooldownStart: 0,
          rechargeStart: 0,
          rechargeEnd: 0,
          imbues: [],
        },
      ],
      heroes: [
        {
          entity: 10,
          position: { x: -190, y: 1450, z: 390 },
          velocity: { x: 0, y: 0, z: 0 },
          health: 700,
          maxHealth: 700,
          hasLineOfSight: true,
        },
      ],
      state,
      now: 2.0,
      buttons: TEST_BUTTONS,
    })

    assert.equal(kitePlan.mode, 'hero_combat')
    assert.ok(Math.abs(kitePlan.drive.facing.yaw - 90) < 2, 'Should aim North at kiting player')
    assert.ok(kitePlan.drive.forward < -0.5, 'Should backpedal South down the lane instead of chasing North')
    assert.notEqual(
      kitePlan.drive.pressed & TEST_BUTTONS.ultimate,
      0n,
      'McGinnis should prioritize Heavy Barrage ultimate when ready in range',
    )

    // Verify 2-tick Confirm-Cast rising-edge & per-slot backoff fallthrough (#14):
    // When McGinnis Heavy Barrage is on cooldown, she ground-aims & casts Mini Turret (slot 0),
    // releases primary fire on Tick 1, taps fresh Buttons.attack on Tick 2, and if the turret
    // failed to place (charges unchanged & cooldownEnd === 0), cancels with altFire on Tick 3
    // and falls through to Medicinal Specter (slot 1) 200ms later!
    const comboState = createBossAiState({ x: -190, y: 900, z: 388 }, 0)
    const forgeAbils = [
      {
        name: 'citadel_ability_mini_turret',
        slot: 0,
        entity: 501,
        upgrades: 0b1111,
        charges: 2,
        cooldownEnd: 0,
        id: 1,
        state: 0,
        cooldownStart: 0,
        rechargeStart: 0,
        rechargeEnd: 0,
        imbues: [],
      },
      {
        name: 'citadel_ability_medicinal_specter',
        slot: 1,
        entity: 502,
        upgrades: 0b1111,
        charges: 0,
        cooldownEnd: 0,
        id: 2,
        state: 0,
        cooldownStart: 0,
        rechargeStart: 0,
        rechargeEnd: 0,
        imbues: [],
      },
      {
        name: 'citadel_ability_heavy_barrage',
        slot: 3,
        entity: 504,
        upgrades: 0b1111,
        charges: 0,
        cooldownEnd: 99,
        id: 4,
        state: 0,
        cooldownStart: 0,
        rechargeStart: 0,
        rechargeEnd: 0,
        imbues: [],
      },
    ]
    const heroTargetList = [
      {
        entity: 10,
        position: { x: -190, y: 500, z: 388 },
        velocity: { x: 0, y: 0, z: 0 },
        health: 700,
        maxHealth: 700,
        hasLineOfSight: true,
      },
    ]
    const tick1 = planBossDriveStep({
      hero: 'hero_forge',
      bossPos: { x: -190, y: 900, z: 388 },
      bossEyePos: { x: -190, y: 900, z: 480 },
      bossHealth: 4000,
      bossMaxHealth: 5000,
      abilities: forgeAbils,
      heroes: heroTargetList,
      state: comboState,
      now: 1.0,
      buttons: TEST_BUTTONS,
    })
    assert.notEqual(tick1.drive.pressed & TEST_BUTTONS.ability1, 0n, 'Tick 1 presses Mini Turret')
    assert.equal(
      tick1.drive.held & TEST_BUTTONS.attack,
      0n,
      'Tick 1 releases held primary fire so Tick 2 creates a clean rising edge',
    )

    const tick2 = planBossDriveStep({
      hero: 'hero_forge',
      bossPos: { x: -190, y: 900, z: 388 },
      bossEyePos: { x: -190, y: 900, z: 480 },
      bossHealth: 4000,
      bossMaxHealth: 5000,
      abilities: forgeAbils,
      heroes: heroTargetList,
      state: comboState,
      now: 1.1,
      buttons: TEST_BUTTONS,
    })
    assert.notEqual(tick2.drive.pressed & TEST_BUTTONS.attack, 0n, 'Tick 2 confirms placement with fresh LMB')
    assert.ok(tick2.drive.facing.pitch > 15, 'Tick 2 pitches view downward toward ground for turret placement')

    // Simulate failed placement (charges stayed 2, cooldownEnd stayed 0) -> Tick 3 cancels & backs off slot 0
    const tick3 = planBossDriveStep({
      hero: 'hero_forge',
      bossPos: { x: -190, y: 900, z: 388 },
      bossEyePos: { x: -190, y: 900, z: 480 },
      bossHealth: 4000,
      bossMaxHealth: 5000,
      abilities: forgeAbils,
      heroes: heroTargetList,
      state: comboState,
      now: 1.25,
      buttons: TEST_BUTTONS,
    })
    assert.notEqual(tick3.drive.pressed & TEST_BUTTONS.altFire, 0n, 'Tick 3 cancels stuck preview via altFire')
    assert.ok(comboState.slotBackoffUntil[0] > 2.0, 'Slot 0 enters temporary backoff')

    // 200ms later (t=1.5s), Boss immediately falls through to slot 1 (Medicinal Specter) without hesitation!
    const tick4 = planBossDriveStep({
      hero: 'hero_forge',
      bossPos: { x: -190, y: 900, z: 388 },
      bossEyePos: { x: -190, y: 900, z: 480 },
      bossHealth: 4000,
      bossMaxHealth: 5000,
      abilities: forgeAbils,
      heroes: heroTargetList,
      state: comboState,
      now: 1.5,
      buttons: TEST_BUTTONS,
    })
    assert.notEqual(tick4.drive.pressed & TEST_BUTTONS.ability2, 0n, 'Tick 4 immediately casts next ready ability')

    // Verify provoked Defender behind Blue Guardian (<= 1500u) gets targeted (#17), while unprovoked/extreme-range (> 1500u) stays on Guardian
    const provokedBehindGuardian = selectBossTarget(
      { x: -85, y: -1180, z: 384 },
      { x: -85, y: -1180, z: 480 },
      [
        {
          entity: 10,
          position: { x: 0, y: -2150, z: 390 },
          velocity: { x: 0, y: 0, z: 0 },
          health: 700,
          maxHealth: 700,
          hasLineOfSight: true,
        },
      ],
      { entity: 700, position: { x: 0, y: -1792, z: 384 }, alive: true },
      { provokedHeroEntity: 10, provokedUntil: 99 },
      10,
    )
    assert.equal(provokedBehindGuardian?.kind, 'hero')

    const siegeTarget = selectBossTarget(
      { x: -85, y: -1180, z: 384 },
      { x: -85, y: -1180, z: 480 },
      [
        {
          entity: 10,
          position: { x: 0, y: -2850, z: 390 },
          velocity: { x: 0, y: 0, z: 0 },
          health: 700,
          maxHealth: 700,
          hasLineOfSight: true,
        },
      ],
      { entity: 700, position: { x: 0, y: -1792, z: 384 }, alive: true },
      { provokedHeroEntity: 10, provokedUntil: 99 },
      10,
    )
    assert.equal(siegeTarget?.kind, 'guardian')

    // Verify 3-stage anti-stuck escalation: jump -> dash|jump -> teleport nudge
    const stuckState = createBossAiState({ x: -165, y: 1200, z: 390 }, 0)
    const p1 = planBossDriveStep({
      hero: 'hero_warden',
      bossPos: { x: -165, y: 1200, z: 390 },
      bossEyePos: { x: -165, y: 1200, z: 470 },
      bossHealth: 3200,
      bossMaxHealth: 3200,
      abilities: [],
      heroes: [],
      state: stuckState,
      now: 1.5,
      buttons: TEST_BUTTONS,
    })
    assert.notEqual(p1.drive.pressed & TEST_BUTTONS.jump, 0n)
    assert.equal(p1.unstuckTeleport, undefined)

    const p2 = planBossDriveStep({
      hero: 'hero_warden',
      bossPos: { x: -165, y: 1195, z: 390 },
      bossEyePos: { x: -165, y: 1195, z: 470 },
      bossHealth: 3200,
      bossMaxHealth: 3200,
      abilities: [],
      heroes: [],
      state: stuckState,
      now: 3.0,
      buttons: TEST_BUTTONS,
    })
    assert.notEqual(p2.drive.pressed & TEST_BUTTONS.dash, 0n)
    assert.equal(p2.unstuckTeleport, undefined)

    const p3 = planBossDriveStep({
      hero: 'hero_warden',
      bossPos: { x: -165, y: 1192, z: 390 },
      bossEyePos: { x: -165, y: 1192, z: 470 },
      bossHealth: 3200,
      bossMaxHealth: 3200,
      abilities: [],
      heroes: [],
      state: stuckState,
      now: 4.5,
      buttons: TEST_BUTTONS,
    })
    assert.ok(p3.unstuckTeleport !== undefined, 'Expected 3rd stuck check to issue waypoint teleport nudge')
  })

  it('evaluates full 6-stage Base Defense progression, All-Structure Repair/Fortify, and Boss multi-structure routes (#19)', () => {
    // 1. Stage progression never ends early until Patron reaches Stage 2 and hits 0 HP
    assert.deepEqual(
      evaluateBaseDefenseProgression({
        guardianHp: 5500,
        walkerHp: 9000,
        baseGuardiansHp: 8000,
        shrinesHp: 16000,
        patronHp: 12000,
        patronPhase: 0,
        patronReachedStage2: false,
      }),
      { stage: 'guardian', stageLabel: 'BLUE GUARDIAN', defeated: false },
    )
    assert.deepEqual(
      evaluateBaseDefenseProgression({
        guardianHp: 0,
        walkerHp: 9000,
        baseGuardiansHp: 8000,
        shrinesHp: 16000,
        patronHp: 12000,
        patronPhase: 0,
        patronReachedStage2: false,
      }),
      { stage: 'walker', stageLabel: 'BLUE WALKER', defeated: false },
    )
    assert.deepEqual(
      evaluateBaseDefenseProgression({
        guardianHp: 0,
        walkerHp: 0,
        baseGuardiansHp: 4000,
        shrinesHp: 16000,
        patronHp: 12000,
        patronPhase: 0,
        patronReachedStage2: false,
      }),
      { stage: 'base_guardians', stageLabel: 'BASE GUARDIANS', defeated: false },
    )
    assert.deepEqual(
      evaluateBaseDefenseProgression({
        guardianHp: 0,
        walkerHp: 0,
        baseGuardiansHp: 0,
        shrinesHp: 8000,
        patronHp: 12000,
        patronPhase: 0,
        patronReachedStage2: false,
      }),
      { stage: 'shrines', stageLabel: 'AMBER SHRINES', defeated: false },
    )
    // Patron Stage 1 at 1 HP or Transforming (phase=2, 0 HP) MUST NOT trigger defeat!
    assert.equal(
      evaluateBaseDefenseProgression({
        guardianHp: 0,
        walkerHp: 0,
        baseGuardiansHp: 0,
        shrinesHp: 0,
        patronHp: 0,
        patronPhase: 2,
        patronReachedStage2: false,
      }).defeated,
      false,
    )
    // Weakened Patron Stage 2 alive -> not defeated; Weakened Patron Stage 2 at 0 HP -> defeated!
    assert.deepEqual(
      evaluateBaseDefenseProgression({
        guardianHp: 0,
        walkerHp: 0,
        baseGuardiansHp: 0,
        shrinesHp: 0,
        patronHp: 6000,
        patronPhase: 1,
        patronReachedStage2: true,
      }),
      { stage: 'patron_stage2', stageLabel: 'WEAKENED PATRON', defeated: false },
    )
    assert.deepEqual(
      evaluateBaseDefenseProgression({
        guardianHp: 0,
        walkerHp: 0,
        baseGuardiansHp: 0,
        shrinesHp: 0,
        patronHp: 0,
        patronPhase: 1,
        patronReachedStage2: true,
      }),
      { stage: 'patron_stage2', stageLabel: 'WEAKENED PATRON', defeated: true },
    )

    // 2. Structure Damage & Attack Speed fortification math
    assert.equal(computeStructureDamageMult(0), 1)
    assert.equal(computeStructureDamageMult(3), 1.75)
    const aura3 = getStructureFortifyAuraSpec(3)
    assert.equal(aura3.active, true)
    assert.equal(aura3.modifier, 'td_structure_fortify_aura_3')
    assert.equal(aura3.damageBonusPct, 75)
    assert.equal(aura3.fireRateBonusPct, 54)
    assert.equal(aura3.cdrBonusPct, 36)

    // 3. All-Structure Repair heals all damaged alive structures for 1 Soul cost
    const rep = evaluateAllStructuresRepair(
      [
        { id: '700', hp: 0, maxHp: 5500 }, // fallen Guardian skipped
        { id: '701', hp: 6000, maxHp: 9000 }, // damaged Walker (+1500 -> 7500)
        { id: '704', hp: 7200, maxHp: 8000 }, // damaged Shrine (+800 -> 8000)
        { id: '706', hp: 12000, maxHp: 12000 }, // full Patron skipped
      ],
      500,
    )
    assert.equal(rep.ok, true)
    assert.equal(rep.soulsSpent, GUARDIAN_REPAIR_COST_SOULS)
    assert.equal(rep.repairedCount, 2)
    assert.equal(rep.totalHealed, 2300)

    // 4. Boss AI routes cleanly past fallen Guardian down to Walker (`x = -1288, y = -3472`) and Patron Pit (`x = -1280, y = -7800`)
    const walkerWps = getBossWaypointsForObjective(0, 'walker')
    assert.ok(walkerWps[walkerWps.length - 1].x < -900)
    const patron2Wps = getBossWaypointsForObjective(1, 'patron_stage2')
    assert.equal(patron2Wps[patron2Wps.length - 1].x, -1280)
    assert.equal(patron2Wps[patron2Wps.length - 1].y, -7800)

    const aiState = createBossAiState({ x: -600, y: -2900, z: 384 }, 20)
    const stepPlan = planBossDriveStep({
      hero: 'hero_atlas',
      bossPos: { x: -600, y: -2900, z: 384 },
      bossEyePos: { x: -600, y: -2900, z: 460 },
      bossHealth: 8000,
      bossMaxHealth: 8000,
      abilities: [],
      heroes: [],
      guardian: {
        entity: 701,
        position: { x: -1288, y: -3472, z: 376 },
        alive: true,
        objectiveKind: 'walker',
        siegeRange: 920,
        minStandoff: 420,
        aimOffsetZ: 155,
      },
      state: aiState,
      now: 20,
      buttons: TEST_BUTTONS,
    })
    // At ~895u from Walker (`<= 920u` siegeRange), Boss enters `guardian_siege` targeting Walker!
    assert.equal(stepPlan.mode, 'guardian_siege')
    assert.equal(stepPlan.target?.entity, 701)
  })
})

describe('Tier 1B — Full Manager & TdProbe State Machine Integration (Mock Host)', async () => {
  const { registerHooks } = await import('node:module')

  // Simulated engine state for the mock Modlock host
  const npcStore = new Map<
    number,
    { health: number; maxHealth: number; team: number; position: { x: number; y: number; z: number } }
  >()
  const patronPhaseStore = new Map<number, number>()

  function seedMockTeam2Structures(): void {
    npcStore.set(700, {
      health: 5500,
      maxHealth: 5500,
      team: 2,
      position: { x: 0, y: -1792, z: 384 },
    })
    npcStore.set(701, {
      health: 9000,
      maxHealth: 9000,
      team: 2,
      position: { x: -1288, y: -3472, z: 376 },
    })
    npcStore.set(702, {
      health: 4000,
      maxHealth: 4000,
      team: 2,
      position: { x: -1072, y: -5454, z: 641 },
    })
    npcStore.set(703, {
      health: 4000,
      maxHealth: 4000,
      team: 2,
      position: { x: -1488, y: -5459, z: 641 },
    })
    npcStore.set(704, {
      health: 8000,
      maxHealth: 8000,
      team: 2,
      position: { x: 299, y: -7535, z: 980 },
    })
    npcStore.set(705, {
      health: 8000,
      maxHealth: 8000,
      team: 2,
      position: { x: -2859, y: -7535, z: 980 },
    })
    npcStore.set(706, {
      health: 12000,
      maxHealth: 12000,
      team: 2,
      position: { x: -1280, y: -8034, z: 632 },
    })
    patronPhaseStore.set(706, 0)
  }

  seedMockTeam2Structures()
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
  const heldPlayerModifiers: Array<{ slot: number; mod: string; active: boolean }> = []
  let activeMockAuraScale = 1.0
  const activeBossBots: MockPlayer[] = []
  const refreshedAbilities: string[] = []
  const heldModifierStates: Array<{ entity: number; state: string; active: boolean }> = []
  const executedServerCommands: string[] = []
  const spawnedTrooperUnits: string[] = []
  const emittedSounds: Array<{ entity: number; sound: string }> = []
  const firedInputs: Array<{ entity: number; input: string }> = []
  const scaleStore = new Map<number, number>()
  const lifeStateStore = new Map<number, number>()
  const modelStore = new Map<number, string>()
  const trooperIds = new Set<number>()
  const neutralIds = new Set<number>()
  const necroSkeleIds = new Set<number>()
  const failedCustomModifiers: string[] = []
  const givenItems: Array<{ slot: number; item: string }> = []
  let mockVanillaMode = false
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
    maxHealth = 700
    position = { x: 0, y: -1950, z: 390 }
    eyeAngles = { pitch: 0, yaw: 90, roll: 0 }
    lastDrive?: {
      facing: { pitch: number; yaw: number; roll: number }
      forward: number
      left: number
      held: bigint
      pressed: bigint
    }
    abilityList: {
      name: string
      slot: number
      entity?: number
      upgrades?: number
      charges?: number
      cooldownEnd?: number
      id?: number
      state?: number
      cooldownStart?: number
      rechargeStart?: number
      rechargeEnd?: number
      imbues?: string[]
    }[] = [
      {
        name: 'citadel_ability_primary',
        slot: 0,
        entity: 400,
        upgrades: 1,
        charges: 0,
        cooldownEnd: 0,
        id: 1,
        state: 0,
        cooldownStart: 0,
        rechargeStart: 0,
        rechargeEnd: 0,
        imbues: [],
      },
    ]
    constructor(slot: number) {
      this.slot = slot
    }
    pawn() {
      return {
        entity: this.pawnEntity,
        hero: this.hero,
        team: this.team,
        health: this.health,
        maxHealth: this.maxHealth,
        position: this.position,
        eyeAngles: this.eyeAngles,
        cameraAngles: this.eyeAngles,
        generation: 1,
        souls: this.souls,
        eyePosition: {
          x: this.position.x,
          y: this.position.y,
          z: this.position.z + 64,
        },
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
    giveItem(item: string) {
      givenItems.push({ slot: this.slot, item })
      return true
    }
    giveModifier(mod: string) {
      if (this.hero === 0 || this.abilityList.length === 0) {
        return false
      }
      if (mockVanillaMode && mod.startsWith('td_')) {
        failedCustomModifiers.push(mod)
        return false
      }
      appliedModifiers.push(mod)
      if (mod === 'upgrade_colossus/modifier_colossus_active') {
        scaleStore.set(this.pawnEntity, 1.2)
      } else if (mod.startsWith('td_boss_hero_stats_')) {
        const tier = Number(mod.replace('td_boss_hero_stats_', '')) || 1
        this.maxHealth = 700 + [2500, 5500, 10000, 16000, 25000][tier - 1]
        scaleStore.set(this.pawnEntity, [1.35, 1.5, 1.65, 1.8, 1.95][tier - 1])
      } else if (mod === 'td_boss_endless_boost') {
        this.maxHealth += 3200
      } else if (mod === 'td_boss_size_step') {
        this.maxHealth = 700 + 25000
        scaleStore.set(this.pawnEntity, 2.05)
      } else if (mod.startsWith('td_creep_scale_aura_')) {
        const step = Number(mod.replace('td_creep_scale_aura_', '')) || 1
        activeMockAuraScale = Number((0.9 + (step - 1) * 0.05).toFixed(2))
        for (const [ent, s] of npcStore.entries()) {
          if (s.team === 3 && ((ent >= 800 && ent < 900) || trooperIds.has(ent))) {
            scaleStore.set(ent, activeMockAuraScale)
          }
        }
      }
      return true
    }
    holdModifier(mod: string, active?: boolean) {
      const isOn = active !== false
      heldPlayerModifiers.push({ slot: this.slot, mod, active: isOn })
      if (isOn && mod.startsWith('td_creep_scale_aura_')) {
        const step = Number(mod.replace('td_creep_scale_aura_', '')) || 1
        activeMockAuraScale = Number((0.9 + (step - 1) * 0.05).toFixed(2))
        for (const [ent, s] of npcStore.entries()) {
          if (s.team === 3 && ((ent >= 800 && ent < 900) || trooperIds.has(ent))) {
            scaleStore.set(ent, activeMockAuraScale)
          }
        }
      }
      return true
    }
    abilities() {
      return this.abilityList.map((a, idx) => ({
        entity: a.entity ?? 400 + idx,
        upgrades: a.upgrades ?? 1,
        charges: a.charges ?? 0,
        cooldownEnd: a.cooldownEnd ?? 0,
        id: a.id ?? idx + 1,
        state: a.state ?? 0,
        cooldownStart: a.cooldownStart ?? 0,
        rechargeStart: a.rechargeStart ?? 0,
        rechargeEnd: a.rechargeEnd ?? 0,
        imbues: a.imbues ?? [],
        ...a,
      }))
    }
    setAbility(opts: { ability: string; upgrades?: number }) {
      const found = this.abilityList.find((a) => a.name === opts.ability)
      if (found && opts.upgrades !== undefined) {
        found.upgrades = opts.upgrades
      }
      return true
    }
    refreshAbility(ability: string) {
      refreshedAbilities.push(ability)
      const found = this.abilityList.find((a) => a.name === ability)
      if (found) {
        found.cooldownEnd = 0
        found.rechargeEnd = 0
      }
      return true
    }
    heal(amount: number) {
      this.health = Math.min(this.maxHealth, this.health + amount)
      return true
    }
    sound(_s: string) {
      return true
    }
    teleport(pos: { x: number; y: number; z: number }, facing?: { pitch: number; yaw: number; roll: number }) {
      this.position = { ...pos }
      if (facing) this.eyeAngles = { ...facing }
      const s = npcStore.get(this.pawnEntity)
      if (s) s.position = { ...pos }
      return true
    }
    drive(cmd?: {
      facing: { pitch: number; yaw: number; roll: number }
      forward: number
      left: number
      held: bigint
      pressed: bigint
    }) {
      this.lastDrive = cmd
      if (!cmd) return true
      this.eyeAngles = { ...cmd.facing }
      const rad = (cmd.facing.yaw * Math.PI) / 180
      const fx = Math.cos(rad)
      const fy = Math.sin(rad)
      const lx = -fy
      const ly = fx
      const wx = cmd.forward * fx + cmd.left * lx
      const wy = cmd.forward * fy + cmd.left * ly
      this.position = {
        x: this.position.x + wx * 75,
        y: this.position.y + wy * 75,
        z: this.position.z,
      }
      const s = npcStore.get(this.pawnEntity)
      if (s) s.position = { ...this.position }

      // Simulate primary weapon fire when Buttons.attack (1n) is held
      if ((cmd.held & 1n) !== 0n && this.team === 2) {
        const angleDiff = (a: number, b: number) => {
          let d = ((a - b + 540) % 360) - 180
          if (d < -180) d += 360
          return Math.abs(d)
        }
        for (const [ent, s] of npcStore.entries()) {
          if (s.team !== 3 || s.health <= 0) continue
          const dist = Math.hypot(s.position.x - this.position.x, s.position.y - this.position.y)
          const yawTo = (Math.atan2(s.position.y - this.position.y, s.position.x - this.position.x) * 180) / Math.PI
          if (dist <= 350 && angleDiff(cmd.facing.yaw, yawTo) <= 22) {
            s.health = Math.max(0, s.health - 45)
          }
        }
        for (const bot of activeBossBots) {
          if (bot.health <= 0) continue
          const dist = Math.hypot(bot.position.x - this.position.x, bot.position.y - this.position.y)
          const yawTo = (Math.atan2(bot.position.y - this.position.y, bot.position.x - this.position.x) * 180) / Math.PI
          if (dist <= 350 && angleDiff(cmd.facing.yaw, yawTo) <= 22) {
            bot.health = Math.max(0, bot.health - 45)
          }
        }
      }
      if ((cmd.held & 1n) !== 0n && this.team === 3) {
        const angleDiff = (a: number, b: number) => {
          let d = ((a - b + 540) % 360) - 180
          if (d < -180) d += 360
          return Math.abs(d)
        }
        const def = defenderPlayer
        const dDef = Math.hypot(def.position.x - this.position.x, def.position.y - this.position.y)
        const yawToDef = (Math.atan2(def.position.y - this.position.y, def.position.x - this.position.x) * 180) / Math.PI
        if (def.health > 0 && dDef <= 950 && angleDiff(cmd.facing.yaw, yawToDef) <= 22) {
          def.health = Math.max(0, def.health - 60)
        } else {
          const g = npcStore.get(700)
          if (g && g.health > 0) {
            const dG = Math.hypot(g.position.x - this.position.x, g.position.y - this.position.y)
            const yawToG = (Math.atan2(g.position.y - this.position.y, g.position.x - this.position.x) * 180) / Math.PI
            if (dG <= 944 && angleDiff(cmd.facing.yaw, yawToG) <= 22) {
              g.health = Math.max(0, g.health - 60)
            }
          }
        }
      }
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
    move(position: { x: number; y: number; z: number }) {
      const s = npcStore.get(this.entity)
      if (!s) return false
      s.position = { ...position }
      return true
    }
    holdModifier(_mod: string, _active?: boolean) {
      return true
    }
    remove() {
      const existed = npcStore.delete(this.entity)
      trooperIds.delete(this.entity)
      neutralIds.delete(this.entity)
      necroSkeleIds.delete(this.entity)
      modelStore.delete(this.entity)
      return existed
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
    export const Buttons = {
      attack: 1n << 0n,
      jump: 1n << 1n,
      crouch: 1n << 2n,
      dash: 1n << 3n,
      use: 1n << 4n,
      altFire: 1n << 5n,
      reload: 1n << 6n,
      melee: 1n << 7n,
      ability1: 1n << 8n,
      ability2: 1n << 9n,
      ability3: 1n << 10n,
      ultimate: 1n << 11n,
      parry: 1n << 12n,
    };
    export const Layers = {
      solid: 1n << 0n,
      hitbox: 1n << 1n,
      trigger: 1n << 2n,
      playerClip: 1n << 4n,
      player: 1n << 18n,
      npc: 1n << 19n,
      staticLevel: 1n << 20n,
      hero: 1n << 21n,
      trooper: 1n << 22n,
      building: 1n << 23n,
    };
    export const trace = () => undefined;
    export const Npc = globalThis.__mockModlock.Npc;
    export const ProbeRun = globalThis.__mockModlock.ProbeRun;
    export const players = () => [{ player: globalThis.__mockModlock.defenderPlayer, name: 'Defender', bot: false, ready: true, steamId: 1n, generation: 1, roles: [] }];
    export const addBot = (opts) => {
      const ent = globalThis.__mockModlock.allocSpawnEntity();
      const p = new globalThis.__mockModlock.MockPlayer(2);
      p.team = opts.team;
      p.pawnEntity = ent;
      p.position = opts.position ? { ...opts.position } : { x: 0, y: 1200, z: 390 };
      if (opts.team === 3) globalThis.__mockModlock.activeBossBots.push(p);
      globalThis.__mockModlock.npcStore.set(ent, { health: 2500, maxHealth: 2500, team: opts.team, position: { ...p.position } });
      return p;
    };
    export const findEntitiesByName = (name) => {
      globalThis.__mockModlock.entityScanStats.findByName += 1;
      if (name.includes('boss_rebel_t1_blue')) return globalThis.__mockModlock.npcStore.has(700) ? [700] : [];
      if (name.includes('rebels_t2_boss_blue')) return globalThis.__mockModlock.npcStore.has(701) ? [701] : [];
      if (name.includes('rebels_watcher_blue')) return [702, 703].filter((id) => globalThis.__mockModlock.npcStore.has(id));
      if (name.includes('amber_t3_generator_purple')) return globalThis.__mockModlock.npcStore.has(704) ? [704] : [];
      if (name.includes('amber_t3_generator_yellow')) return globalThis.__mockModlock.npcStore.has(705) ? [705] : [];
      return [];
    };
    export const findEntities = (cls) => {
      globalThis.__mockModlock.entityScanStats.findByClass += 1;
      if (cls === 'info_super_trooper_spawn') return [14020, 14325];
      if (cls === 'info_trooper_spawn') return [14053, 14315, 14318, 14319, 14291, 14051];
      if (cls === 'info_neutral_trooper_camp') return [];
      if (cls === 'npc_trooper') return [...globalThis.__mockModlock.npcStore.keys()].filter((id) => (id >= 800 && id < 900) || globalThis.__mockModlock.trooperIds.has(id));
      if (cls === 'npc_trooper_neutral') return [...globalThis.__mockModlock.npcStore.keys()].filter((id) => (id >= 1600 && id < 1700) || globalThis.__mockModlock.neutralIds.has(id));
      if (cls === 'npc_necro_skele') return [...globalThis.__mockModlock.npcStore.keys()].filter((id) => globalThis.__mockModlock.necroSkeleIds.has(id));
      if (cls === 'npc_trooper_boss') return globalThis.__mockModlock.npcStore.has(700) ? [700] : [];
      if (cls === 'npc_boss_tier2') return globalThis.__mockModlock.npcStore.has(701) ? [701] : [];
      if (cls === 'npc_barrack_boss') return [702, 703].filter((id) => globalThis.__mockModlock.npcStore.has(id));
      if (cls === 'destroyable_building') return [704, 705].filter((id) => globalThis.__mockModlock.npcStore.has(id));
      if (cls === 'npc_boss_tier3') return globalThis.__mockModlock.npcStore.has(706) ? [706] : [];
      if (cls === 'npc_boss_tier3core') return [];
      return [];
    };
    export const fireInput = (entity, input, value) => {
      globalThis.__mockModlock.firedInputs.push({ entity, input });
      if (input === 'SetAbsScale' && value && typeof value.number === 'number') {
        globalThis.__mockModlock.scaleStore.set(entity, value.number);
      }
      if (input === 'SetHealth' && value && typeof value.integer === 'number') {
        const s = globalThis.__mockModlock.npcStore.get(entity);
        if (s) s.health = value.integer;
      }
      if (input === 'OverrideHealth' && value && typeof value.integer === 'number') {
        const s = globalThis.__mockModlock.npcStore.get(entity);
        if (s) s.maxHealth = value.integer;
      }
      return true;
    };
    export const damage = (opts) => {
      const def = globalThis.__mockModlock.defenderPlayer;
      if (opts.victim === def.pawnEntity) {
        def.health = Math.max(0, def.health - opts.amount);
        return true;
      }
      const s = globalThis.__mockModlock.npcStore.get(opts.victim);
      if (s) s.health = Math.max(0, s.health - opts.amount);
      return true;
    };
    export const emitSound = (entity, sound) => {
      globalThis.__mockModlock.emittedSounds.push({ entity, sound });
      return true;
    };
    export const killEntity = (opts) => {
      const s = globalThis.__mockModlock.npcStore.get(opts.victim);
      if (s) s.health = 0;
      globalThis.__mockModlock.lifeStateStore.set(opts.victim, 2);
      return true;
    };
    export const removeEntities = () => 0;
    export const holdModifierState = (entity, state, active) => {
      globalThis.__mockModlock.heldModifierStates.push({ entity, state, active: active !== false });
      return true;
    };
    export const entityClass = (entity) => {
      if (entity === 704 || entity === 705) return { className: 'CDestroyableBuilding', designerName: 'destroyable_building' };
      if ((entity >= 1600 && entity < 1700) || globalThis.__mockModlock.neutralIds.has(entity)) return { className: 'CNPC_TrooperNeutral', designerName: 'npc_trooper_neutral' };
      if (globalThis.__mockModlock.necroSkeleIds.has(entity)) return { className: 'CNPC_NecroSkele', designerName: 'npc_necro_skele' };
      return { className: 'CNPC_Trooper', designerName: 'npc_trooper' };
    };
    export const moveEntity = (entity, pos) => {
      const s = globalThis.__mockModlock.npcStore.get(entity);
      if (s && pos) s.position = pos;
      return true;
    };
    export const readModifierField = () => undefined;
    export const entityPosition = (entity) => {
      const s = globalThis.__mockModlock.npcStore.get(entity);
      return s ? { position: s.position, facing: { pitch: 0, yaw: 270, roll: 0 }, velocity: { x: 0, y: 0, z: 0 } } : undefined;
    };
    export const readField = (entity, cls, field) => {
      if ([14053, 14315, 14318, 14319].includes(entity)) {
        if (cls === 'CBaseEntity' && field === 'm_iTeamNum') return 3;
        if (cls === 'CInfoTrooperSpawn' && field === 'm_iLane') return 4;
      }
      if (entity === 14291) {
        if (cls === 'CBaseEntity' && field === 'm_iTeamNum') return 2;
        if (cls === 'CInfoTrooperSpawn' && field === 'm_iLane') return 4;
      }
      if (entity === 14051) {
        if (cls === 'CBaseEntity' && field === 'm_iTeamNum') return 3;
        if (cls === 'CInfoTrooperSpawn' && field === 'm_iLane') return 1;
      }
      if (cls === 'CNPC_Boss_Tier3' && field === 'm_ePhase') {
        return globalThis.__mockModlock.patronPhaseStore.get(entity) ?? 0;
      }
      if (cls === 'CGameSceneNode' && field === 'm_flScale') {
        return globalThis.__mockModlock.scaleStore.get(entity);
      }
      if (cls === 'CBaseEntity' && field === 'm_lifeState') {
        return globalThis.__mockModlock.lifeStateStore.get(entity) ?? 0;
      }
      if (cls === 'CModelState' && field === 'm_ModelName') {
        return globalThis.__mockModlock.modelStore.get(entity);
      }
      const s = globalThis.__mockModlock.npcStore.get(entity);
      if (s && cls === 'CBaseEntity') {
        if (field === 'm_iHealth') return s.health;
        if (field === 'm_iMaxHealth') return s.maxHealth;
        if (field === 'm_iTeamNum') return s.team;
      }
      return undefined;
    };
    export const writeField = (entity, cls, field, _type, val) => {
      if (cls === 'CGameSceneNode' && field === 'm_flScale' && typeof val === 'number') {
        globalThis.__mockModlock.scaleStore.set(entity, val);
      }
      const s = globalThis.__mockModlock.npcStore.get(entity);
      if (s && cls === 'CBaseEntity' && typeof val === 'number') {
        if (field === 'm_iHealth') s.health = val;
        if (field === 'm_iMaxHealth') s.maxHealth = val;
      }
      return true;
    };
    export const spawnNpc = (opts) => {
      if (globalThis.__mockModlock.isVanillaMode() && opts.unit.startsWith('td_')) {
        return undefined;
      }
      const ent = globalThis.__mockModlock.allocSpawnEntity();
      globalThis.__mockModlock.spawnedTrooperUnits.push(opts.unit);
      if (opts.className === 'npc_trooper') {
        globalThis.__mockModlock.trooperIds.add(ent);
      } else if (opts.className === 'npc_trooper_neutral') {
        globalThis.__mockModlock.neutralIds.add(ent);
      } else if (opts.className === 'npc_necro_skele') {
        globalThis.__mockModlock.necroSkeleIds.add(ent);
      }
      const defaultHp = opts.unit === 'trooper_melee' ? (globalThis.__mockModlock.isVanillaMode() ? 400 : 413) : 150;
      if (opts.unit === 'trooper_melee') {
        globalThis.__mockModlock.modelStore.set(
          ent,
          globalThis.__mockModlock.isVanillaMode()
            ? 'models/npc_units/trooper/sapphire_trooper_01_melee.vmdl'
            : 'models/heroes_wip/necro/necro_shambler.vmdl'
        );
      } else if (opts.unit === 'npc_necro_skele') {
        globalThis.__mockModlock.modelStore.set(ent, 'models/heroes_wip/necro/necro_shambler.vmdl');
      }
      globalThis.__mockModlock.npcStore.set(ent, {
        health: opts.health ?? defaultHp,
        maxHealth: opts.maxHealth ?? opts.health ?? defaultHp,
        team: opts.team,
        position: { ...opts.position },
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
    emittedSounds,
    trooperIds,
    neutralIds,
    necroSkeleIds,
    isVanillaMode: () => mockVanillaMode,
    modelStore,
    allocSpawnEntity: () => ++nextSpawnedEntityId,
    activeBossBots,
    firedInputs,
    scaleStore,
    lifeStateStore,
    patronPhaseStore,
    heldModifierStates,
    entityScanStats: { findByClass: 0, findByName: 0 },
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

  it('drives GuardianManager, WaveManager, TomeManager, and TdProbe through all Probe steps (Boss Colossus scaling, Boss combat AI, Tome scaling, and Multi-Stage Base Progression) to PASS', () => {
    appliedModifiers.length = 0
    const guardian = new GuardianManager()
    const tomes = new TomeManager()
    const waves = new WaveManager((w) => tomes.offerMajorBoonForWave(w))
    const probe = new TdProbe()

    guardian.reset()
    tomes.reset()
    waves.reset(0)

    for (let step = 1; step <= 80 && !probePassed; step++) {
      probe.tick(step * 0.25, waves, guardian, tomes)
      assert.equal(probeFailedReason, '', `TdProbe failed: ${probeFailedReason}`)
    }

    assert.equal(probePassed, true, 'Expected TdProbe to reach PASS state')
    assert.ok(
      appliedModifiers.includes('upgrade_colossus/modifier_colossus_active'),
      'Expected stock Colossus modifier to be applied to Raid Bosses',
    )
    assert.equal(
      appliedModifiers.some((m) => m.startsWith('td_')),
      false,
      'Expected zero custom td_* modifiers to be applied',
    )
  })

  it('ignores pooled skybase lifeState=2 & zipline 1/1 entities, disables wave neutrals in v0.6.0, recovers recycled handles, and scales 100% of landed creeps', () => {
    npcStore.clear()
    trooperIds.clear()
    modelStore.clear()
    lifeStateStore.clear()
    scaleStore.clear()
    executedServerCommands.length = 0
    spawnedTrooperUnits.length = 0
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
    const expectedDmgMult = computeWaveCreepDamageMult(8)
    const expectedInterval = computeWaveSpawnIntervalSeconds(8) // 14s

    // Wave neutrals are disabled in v0.6.0; landed creep 802 = 1 (pooled skybase 801 MUST be excluded!)
    assert.equal(waves.spawnedWaveNeutrals.length, 0)
    assert.equal(waves.aliveCreepCount, 1)
    assert.equal(waves.scaledCreeps.has(801), false)
    assert.equal(npcStore.get(802)?.maxHealth, expectedHp)
    assert.equal(
      firedInputs.some((i) => i.input === 'SetAbsScale'),
      false,
      'Must NEVER call SetAbsScale (which desynchronizes CHitboxComponent hitboxes, #16)',
    )

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
      executedServerCommands.includes('citadel_pregame_wait_duration 1'),
      'Expected pregame wait duration to be shortened to 1s so HUD never fades out',
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

  it('skips placeholder Boss pawn (hero === 0), configures Colossus scale + HP bar visibility + refreshed abilities, and awards Major Boon ONLY on Boss kill (#13, #14, #15)', () => {
    appliedModifiers.length = 0
    givenItems.length = 0
    refreshedAbilities.length = 0
    heldModifierStates.length = 0
    scaleStore.clear()
    npcStore.clear()

    const awardedMilestoneWaves: number[] = []
    const waves = new WaveManager((w) => awardedMilestoneWaves.push(w))
    waves.reset(0)
    waves.wave = 9

    // Spawn Wave 10 Boss (Tier 2: +5500 HP, 1.38x Colossus Size, 1.35x Damage mult)
    waves.spawnNextWave(50, true)
    assert.equal(waves.activeBosses.length, 1)
    assert.deepEqual(
      awardedMilestoneWaves,
      [],
      'Major Boon must NOT be awarded on Boss spawn (#13)',
    )
    const boss = waves.activeBosses[0]

    // Simulate 1-frame placeholder pawn right after addBot (hero=0, abilities=[], pawnEntity=900)
    const botMock = boss.bot as unknown as MockPlayer
    botMock.hero = 0
    botMock.pawnEntity = 900
    botMock.abilityList = []
    botMock.health = 100
    botMock.maxHealth = 100

    waves.tickActiveBosses()
    assert.equal(
      boss.configuredPawnEntity,
      0,
      'Must NOT configure placeholder hero=0 pawn',
    )
    assert.equal(appliedModifiers.includes('upgrade_colossus/modifier_colossus_active'), false)

    // Real hero pawn spawns 250ms later (hero=6, pawnEntity=999, abilities=[slot 0..3])
    botMock.hero = 6
    botMock.pawnEntity = 999
    botMock.health = 700
    botMock.maxHealth = 700
    npcStore.set(999, {
      health: 700,
      maxHealth: 700,
      team: 3,
      position: { x: -55, y: 1200, z: 390 },
    })
    botMock.abilityList = [
      { name: 'citadel_ability_bull_charge', slot: 0, cooldownEnd: 25 },
      { name: 'citadel_ability_bull_leap', slot: 3, cooldownEnd: 60 },
    ]

    waves.tickActiveBosses(51)
    assert.equal(boss.configuredPawnEntity, 999)
    assert.ok(givenItems.some((g) => g.item === 'upgrade_colossus'))
    assert.equal(appliedModifiers.includes('upgrade_colossus/modifier_colossus_active'), true)
    assert.equal(boss.appliedScale, 1.38)
    assert.equal(botMock.abilityList[0].upgrades, 0b0111)
    assert.equal(botMock.abilityList[0].cooldownEnd, 0, 'Expected refreshAbility to clear initial cooldowns (#14)')
    assert.ok(refreshedAbilities.includes('citadel_ability_bull_leap'))
    assert.ok(
      heldModifierStates.some(
        (s) => s.entity === 999 && s.state === 'MODIFIER_STATE_VISIBLE_TO_ENEMY' && s.active,
      ),
      'Expected MODIFIER_STATE_VISIBLE_TO_ENEMY to keep Boss 3D overhead HP bar visible (#15)',
    )
    assert.ok(botMock.lastDrive !== undefined, 'Expected Boss bot.drive(...) to be active immediately')
    assert.ok(botMock.position.y < 1200, 'Expected Boss to start marching south out of spawn')
    assert.ok(boss.currentMaxHp >= 6500)
    assert.equal(boss.currentHp, boss.currentMaxHp)

    // Verify Defender damaging Boss (non-lethal) records provocation aggro WITHOUT granting Boon yet
    waves.handleCreepPostDamage(
      {
        victim: 999,
        attacker: defenderPlayer.pawnEntity,
        ability: 0,
        healthBefore: boss.currentMaxHp,
        healthLost: 120,
        dealt: 120,
      },
      undefined,
      52,
    )
    assert.equal(boss.ai.provokedHeroEntity, defenderPlayer.pawnEntity)
    assert.equal(boss.ai.provokedUntil, 60)
    assert.deepEqual(awardedMilestoneWaves, [])

    // Verify Boss outgoing damage is scaled in modifyIncomingDamage
    const bossHit = waves.modifyIncomingDamage({
      victim: 10,
      attacker: 999,
      inflictor: 999,
      ability: 0,
      flags: 0n,
      hitGroup: 0,
      amount: 100,
    })
    assert.equal(bossHit?.amount, 135)

    // Verify lethal hit on Boss retires Boss AND awards Wave 10 Major Boon + 400 Souls (#13)!
    const soulsBeforeKill = defenderPlayer.souls
    waves.handleCreepPostDamage(
      {
        victim: 999,
        attacker: defenderPlayer.pawnEntity,
        ability: 0,
        healthBefore: 400,
        healthLost: 400,
        dealt: 450,
      },
      undefined,
      60,
    )
    assert.equal(waves.activeBosses.length, 0)
    assert.deepEqual(awardedMilestoneWaves, [10])
    assert.equal(defenderPlayer.souls, soulsBeforeKill + 400)
  })

  it('keeps melee and ranged lane troopers fighting normally in v0.6.0 (Graves Zombies & wave neutrals disabled, #20)', () => {
    npcStore.clear()
    trooperIds.clear()
    modelStore.clear()
    lifeStateStore.clear()
    emittedSounds.length = 0

    // Pure math helpers remain validated for future re-enablement
    assert.equal(
      isWithinZombieDetonationRange(
        { x: 0, y: -1320, z: 384 },
        { x: 0, y: -1792, z: 384 },
        'guardian',
      ),
      true,
    )
    assert.equal(isExplodingZombieBaseMaxHp(413), true)
    assert.equal(isExplodingZombieBaseMaxHp(150), false)

    npcStore.set(700, {
      health: 5500,
      maxHealth: 5500,
      team: 2,
      position: { x: 0, y: -1792, z: 384 },
    })
    npcStore.set(810, {
      health: 413,
      maxHealth: 413,
      team: 3,
      position: { x: 0, y: -1330, z: 384 },
    })
    npcStore.set(811, {
      health: 150,
      maxHealth: 150,
      team: 3,
      position: { x: 40, y: -1330, z: 384 },
    })

    const guardian = new GuardianManager()
    guardian.reset()
    const waves = new WaveManager()
    waves.reset(0)
    waves.wave = 3
    assert.equal(waves.spawnWaveNeutralVariety(3), 0)
    waves.scaleNewlySpawnedCreeps()

    assert.equal(waves.creepSpecs.get(810)?.isExplodingZombie, false)
    assert.equal(waves.creepSpecs.get(811)?.isExplodingZombie, false)
    assert.equal(waves.tickExplodingZombies(10.0, guardian), 0)
    assert.equal(waves.tickExplodingZombies(10.25, guardian), 0)

    // Melee trooper 810 dealing melee damage MUST stay alive and NOT self-destruct!
    const meleeSelfDestructed = waves.handleCreepPostDamage(
      {
        victim: 700,
        attacker: 810,
        ability: 0,
        healthBefore: 5500,
        healthLost: 40,
        dealt: 40,
      },
      guardian,
    )
    assert.equal(meleeSelfDestructed, false)
    assert.ok((npcStore.get(810)?.health ?? 0) > 0)
  })

  it('progresses Guardian -> Walker -> Base Guardians -> Shrines -> Patron Stage 1 -> Patron Stage 2 -> Defeat, clears dead handles cleanly, and scales all-structure upgrades (#19)', () => {
    npcStore.clear()
    trooperIds.clear()
    modelStore.clear()
    lifeStateStore.clear()
    scaleStore.clear()
    appliedModifiers.length = 0
    executedServerCommands.length = 0
    seedMockTeam2Structures()

    defenderPlayer.souls = 5000
    defenderPlayer.health = 700

    const guardian = new GuardianManager()
    const waves = new WaveManager()
    guardian.reset()
    waves.reset(0)

    assert.equal(guardian.currentStage, 'guardian')
    assert.equal(guardian.matchState, 'active')

    // 1. Fortify twice -> upgrades Max HP on Guardian, Walker, Base Guardians, Shrines, and Patron + +50% damage
    assert.equal(guardian.upgradeByPlayer(defenderPlayer as never), true)
    assert.equal(guardian.upgradeByPlayer(defenderPlayer as never), true)
    guardian.poll(4, 15)
    assert.equal(guardian.upgradeLevel, 2)
    assert.equal(guardian.maxHealth, 5500 + 2 * 1200)
    assert.equal(guardian.walkerMaxHealth, 9000 + 2 * 1800)
    assert.equal(guardian.baseGuardiansMaxHealth, (4000 + 2 * 900) * 2)
    assert.equal(guardian.shrinesMaxHealth, (8000 + 2 * 1500) * 2)
    assert.equal(guardian.patronMaxHealth, 12000 + 2 * 2400)

    const boostedHit = waves.modifyIncomingDamage(
      {
        victim: 801,
        attacker: 702, // Base Guardian
        ability: 0,
        inflictor: 702,
        amount: 80,
        flags: 0,
        type: 0,
      } as never,
      guardian,
    )
    assert.equal(boostedHit?.amount, 120) // 80 * 1.50x

    // 2. Blue Guardian falls & is removed from CGameEntitySystem -> guardian.entity clears to 0 (no stale handle polling!)
    npcStore.get(700)!.health = 0
    lifeStateStore.set(700, 2)
    guardian.poll(4, 16)
    assert.equal(guardian.entity, 0, 'Expected dead Guardian handle to clear to 0 immediately')
    npcStore.delete(700)
    guardian.poll(4, 16.5)
    assert.equal(guardian.matchState, 'active')
    assert.equal(guardian.currentStage, 'walker')

    // 3. Blue Walker falls -> match stays ACTIVE, frontline moves to Base Guardians
    npcStore.get(701)!.health = 0
    lifeStateStore.set(701, 2)
    guardian.poll(5, 17)
    assert.equal(guardian.walkerEntity, 0)
    assert.equal(guardian.matchState, 'active')
    assert.equal(guardian.currentStage, 'base_guardians')

    // 4. Both Blue Base Guardians fall -> match stays ACTIVE, frontline moves to Shrines
    npcStore.get(702)!.health = 0
    npcStore.get(703)!.health = 0
    lifeStateStore.set(702, 2)
    lifeStateStore.set(703, 2)
    guardian.poll(6, 18)
    assert.equal(guardian.baseGuardianEntities.length, 0)
    assert.equal(guardian.matchState, 'active')
    assert.equal(guardian.currentStage, 'shrines')

    // 5. Both Amber Shrines fall -> match stays ACTIVE, frontline moves to Patron Stage 1
    npcStore.get(704)!.health = 0
    npcStore.get(705)!.health = 0
    lifeStateStore.set(704, 2)
    lifeStateStore.set(705, 2)
    guardian.poll(7, 19)
    assert.equal(guardian.eastShrineEntity, 0)
    assert.equal(guardian.westShrineEntity, 0)
    assert.equal(guardian.matchState, 'active')
    assert.equal(guardian.currentStage, 'patron_stage1')

    // 6. Patron Stage 1 drops to 1 HP & enters Transforming (m_ePhase = 2) -> match STILL ACTIVE!
    npcStore.get(706)!.health = 1
    patronPhaseStore.set(706, 2)
    guardian.poll(8, 20)
    assert.equal(guardian.matchState, 'active')
    assert.equal(guardian.currentStage, 'patron_stage1')

    // 7. Patron enters Weakened Stage 2 in Pit (m_ePhase = 1, fresh 12000 base HP -> inherits +4800 Fortify bonus = 16800 HP!)
    npcStore.get(706)!.health = 12000
    npcStore.get(706)!.maxHealth = 12000
    patronPhaseStore.set(706, 1)
    guardian.poll(8, 25)
    assert.equal(guardian.matchState, 'active')
    assert.equal(guardian.currentStage, 'patron_stage2')
    assert.equal(guardian.patronMaxHealth, 16800)
    assert.equal(guardian.patronHealth, 16800)

    // 8. Weakened Patron Stage 2 falls -> NOW match ends in Defeat!
    npcStore.get(706)!.health = 0
    lifeStateStore.set(706, 2)
    guardian.poll(9, 30)
    assert.equal(guardian.matchState, 'defeat')

    // 9. `/restarttd` (`respawnAllStructures`) executes engine respawn commands and restores active match!
    seedMockTeam2Structures()
    guardian.respawnAllStructures()
    assert.equal(guardian.matchState, 'active')
    assert.equal(guardian.currentStage, 'guardian')
    assert.ok(executedServerCommands.includes('citadel_respawn_boss_t2'))
    assert.ok(executedServerCommands.includes('citadel_respawn_boss_shrines'))
    assert.ok(executedServerCommands.includes('citadel_boss_tier_3_testing_reset'))
  })

  it('runs cleanly on Modlock servers (Colossus Bosses, Tome scaling, and zero missing-modifier spam)', () => {
    mockVanillaMode = true
    try {
      npcStore.clear()
      trooperIds.clear()
      neutralIds.clear()
      necroSkeleIds.clear()
      modelStore.clear()
      lifeStateStore.clear()
      scaleStore.clear()
      appliedModifiers.length = 0
      failedCustomModifiers.length = 0
      givenItems.length = 0
      spawnedTrooperUnits.length = 0
      activeBossBots.length = 0
      seedMockTeam2Structures()
      defenderPlayer.souls = 5000
      defenderPlayer.health = 700
      defenderPlayer.maxHealth = 700
      defenderPlayer.position = { x: 0, y: -1950, z: 390 }

      // Seed one enemy lane trooper in Center Lane
      lifeStateStore.set(850, 0)
      npcStore.set(850, {
        health: 200,
        maxHealth: 200,
        team: 3,
        position: { x: 0, y: 200, z: 384 },
      })

      const guardian = new GuardianManager()
      const tomes = new TomeManager()
      const waves = new WaveManager((w) => tomes.offerMajorBoonForWave(w))
      guardian.reset()
      tomes.reset()
      waves.reset(0)

      // Spawn Wave 5 (Colossus Raid Boss, zero wave neutrals in v0.6.0)
      waves.wave = 4
      waves.spawnNextWave(20, true)
      assert.equal(waves.spawnedWaveNeutrals.length, 0)

      const boss = waves.activeBosses[0]
      assert.ok(boss, 'Expected Wave 5 Boss to spawn')
      const botMock = boss.bot as unknown as MockPlayer
      botMock.hero = 6
      botMock.health = 700
      botMock.maxHealth = 700
      botMock.abilityList = [
        { name: 'citadel_ability_bull_charge', slot: 0, cooldownEnd: 0 },
        { name: 'citadel_ability_bull_leap', slot: 3, cooldownEnd: 0 },
      ]
      waves.tickActiveBosses(21)
      assert.equal(boss.configuredPawnEntity, botMock.pawnEntity)
      assert.ok(
        appliedModifiers.includes('upgrade_colossus/modifier_colossus_active'),
        'Expected stock Colossus modifier to scale Boss model + hitbox cleanly',
      )
      assert.ok(
        givenItems.some((g) => g.item === 'upgrade_colossus'),
        'Expected stock Boss items to be granted',
      )
      assert.ok(boss.currentMaxHp >= 3500, `Expected Wave 5 Boss effective Max HP >= 3500, got ${boss.currentMaxHp}`)

      // Grant multiple Tomes & Fortifications -> ZERO failed custom modifier calls!
      for (let i = 0; i < 6; i++) {
        tomes.applyMinorTome(defenderPlayer as never, MINOR_TOME_POOL[1]) // Weapon Tome
        tomes.applyMinorTome(defenderPlayer as never, MINOR_TOME_POOL[0]) // Spirit Tome
        tomes.applyMinorTome(defenderPlayer as never, MINOR_TOME_POOL[3]) // Vitality Tome
      }
      guardian.upgradeByPlayer(defenderPlayer as never)
      guardian.poll(5, 22)
      guardian.poll(5, 23)
      waves.tick(24, true)
      waves.tick(25, true)
      assert.equal(
        failedCustomModifiers.length,
        0,
        `Expected zero failed td_* modifier calls, got ${failedCustomModifiers.length}: ${failedCustomModifiers.join(', ')}`,
      )

      // Verify Tome weapon/ability damage mult!
      const weaponShot = waves.modifyIncomingDamage(
        {
          victim: 850,
          attacker: defenderPlayer.pawnEntity,
          inflictor: defenderPlayer.pawnEntity,
          ability: 0,
          flags: 0n,
          hitGroup: 0,
          amount: 100,
        },
        guardian,
        tomes,
      )
      assert.equal(weaponShot?.amount, 160, 'Expected 6 Weapon Tomes (+60%) to boost weapon damage to 160')

      const spiritCast = waves.modifyIncomingDamage(
        {
          victim: 850,
          attacker: defenderPlayer.pawnEntity,
          inflictor: 400,
          ability: 400,
          flags: 0n,
          hitGroup: 0,
          amount: 100,
        },
        guardian,
        tomes,
      )
      assert.equal(spiritCast?.amount, 136, 'Expected 6 Spirit Tomes (+36%) to boost ability damage to 136')

      // Verify TdProbe passes all steps end-to-end on vanilla mock!
      probePassed = false
      probeFailedReason = ''
      const vanillaProbe = new TdProbe()
      for (let step = 1; step <= 90 && !probePassed; step++) {
        vanillaProbe.tick(100 + step * 0.25, waves, guardian, tomes)
        assert.equal(probeFailedReason, '', `Vanilla TdProbe failed: ${probeFailedReason}`)
      }
      assert.equal(probePassed, true, 'Expected TdProbe to reach PASS in stock Modlock mode')
    } finally {
      mockVanillaMode = false
    }
  })

  it('keeps Wave 0 on guardian stage when map structures have not spawned yet, and caches structure handles after discovery', () => {
    npcStore.clear()
    trooperIds.clear()
    lifeStateStore.clear()

    const guardian = new GuardianManager()
    guardian.reset()
    guardian.poll(0, 1)
    assert.equal(guardian.currentStage, 'guardian')
    assert.equal(guardian.getDefenderSpawnOrigin().y, -1950)

    seedMockTeam2Structures()
    guardian.poll(1, 2)
    assert.equal(guardian.currentStage, 'guardian')
    assert.ok(guardian.entity > 0)

    const scanStats = (globalThis as { __mockModlock: { entityScanStats: { findByClass: number; findByName: number } } })
      .__mockModlock.entityScanStats
    scanStats.findByClass = 0
    scanStats.findByName = 0

    guardian.poll(2, 3)
    assert.equal(
      scanStats.findByClass + scanStats.findByName,
      0,
      `Expected 0 findEntities scans on cached Stages 1-4 poll, got ${scanStats.findByClass} class + ${scanStats.findByName} name scans`,
    )
  })
})

describe('Tier 5 — HUD Stability CVars & Legendary Armory', () => {
  it('configures fast pregame exit and arena isolation without hero-testing HUD collapse', () => {
    const cvarMap = new Map<string, string | number>(TD_SERVER_CVARS)
    assert.equal(cvarMap.get('citadel_pregame_wait_duration'), 1)
    assert.equal(cvarMap.get('citadel_solo_bot_match'), 0)
    assert.equal(cvarMap.get('citadel_koth_enabled'), 0)
    assert.equal(cvarMap.get('citadel_neutral_spawn_enabled'), 0)
    assert.equal(cvarMap.get('citadel_spawn_practice_bots'), 0)
    assert.equal(cvarMap.has('citadel_start_players_on_zipline'), false)
    assert.equal(cvarMap.has('citadel_hero_testing_enabled'), false)
    assert.equal(cvarMap.has('citadel_hero_testing_legendary_items'), false)
  })

  it('keeps all stage defender spawn origins in open lane or courtyard ahead of the Patron pit', () => {
    const stages = [
      'guardian',
      'walker',
      'base_guardians',
      'shrines',
      'patron_stage1',
      'patron_stage2',
    ] as const
    for (const stage of stages) {
      const origin = getDefenderStageSpawnOrigin(stage)
      assert.ok(
        origin.y >= -7300,
        `Expected ${stage} spawn origin y=${origin.y} to remain ahead of Patron pit (>= -7300)`,
      )
    }
    assert.equal(getDefenderStageSpawnOrigin('guardian').y, -1950)
    assert.equal(getDefenderStageSpawnOrigin('walker').y, -3850)
    assert.equal(getDefenderStageSpawnOrigin('base_guardians').y, -5850)
    assert.equal(getDefenderStageSpawnOrigin('shrines').y, -6850)
    assert.equal(getDefenderStageSpawnOrigin('patron_stage1').y, -7200)
    assert.equal(getDefenderStageSpawnOrigin('patron_stage2').y, -7200)
  })

  it('frees HUD cursor when Legendary Armory is open without stealing cursor for Boons', () => {
    assert.equal(
      shouldFreeHudCursor({
        needsHeroPick: false,
        hasPendingBoons: true,
        legendaryShopOpen: false,
        matchState: 'active',
      }),
      false,
    )
    assert.equal(
      shouldFreeHudCursor({
        needsHeroPick: false,
        hasPendingBoons: false,
        legendaryShopOpen: true,
        matchState: 'active',
      }),
      true,
    )
  })

  it('formats Tier-5 Legendary item titles and validates Soul/ownership rules', () => {
    assert.equal(formatItemDisplayTitle('upgrade_eldritch_shot'), 'Eldritch Shot')
    assert.equal(
      formatItemDisplayTitle('upgrade_omnicharge_pendant'),
      'Omnicharge Pendant',
    )

    const dead = evaluateLegendaryPurchase({
      hasLivingHero: false,
      souls: 20_000,
      itemName: 'upgrade_eldritch_shot',
      ownedItemNames: [],
    })
    assert.equal(dead.ok, false)

    const duplicate = evaluateLegendaryPurchase({
      hasLivingHero: true,
      souls: 20_000,
      itemName: 'upgrade_eldritch_shot',
      ownedItemNames: ['upgrade_eldritch_shot'],
    })
    assert.equal(duplicate.ok, false)

    const broke = evaluateLegendaryPurchase({
      hasLivingHero: true,
      souls: LEGENDARY_ITEM_COST_SOULS - 1,
      itemName: 'upgrade_eldritch_shot',
      ownedItemNames: [],
    })
    assert.equal(broke.ok, false)

    const valid = evaluateLegendaryPurchase({
      hasLivingHero: true,
      souls: LEGENDARY_ITEM_COST_SOULS,
      itemName: 'upgrade_eldritch_shot',
      ownedItemNames: [],
    })
    assert.deepEqual(valid, { ok: true, cost: LEGENDARY_ITEM_COST_SOULS })
  })
})

