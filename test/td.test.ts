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
  planBossDriveStep,
  selectBossTarget,
  worldMoveToDriveAxes,
} from '../src/boss_ai.ts'
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
  getWaveNeutralSpawns,
  GUARDIAN_BASE_MAX_HP,
  GUARDIAN_REPAIR_AMOUNT_HP,
  GUARDIAN_REPAIR_COST_SOULS,
  GUARDIAN_UPGRADE_BASE_COST_SOULS,
  GUARDIAN_UPGRADE_COST_STEP_SOULS,
  isBossWave,
  isExplodingZombieBaseMaxHp,
  isWithinZombieDetonationRange,
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
    assert.equal(spec5.targetScale, 1.55)
    assert.equal(spec10.targetScale, 1.9)
    assert.equal(spec15.tier, 3)
    assert.equal(spec15.modifier, 'td_boss_hero_stats_3')
    assert.equal(spec15.targetScale, 2.25)
    assert.ok(spec15.bonusHp > 7500)
    assert.equal(spec25.targetScale, 2.95)
    assert.equal(spec30.extraSizeStacks, 1)
    assert.equal(spec30.targetScale, 3.3)
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

  it('distinguishes Graves Zombie base maxHP (400) from ranged troopers (300/350)', () => {
    assert.equal(isExplodingZombieBaseMaxHp(400), true)
    assert.equal(isExplodingZombieBaseMaxHp(300), false)
    assert.equal(isExplodingZombieBaseMaxHp(350), false)
    assert.equal(isExplodingZombieBaseMaxHp(1), false)
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
    assert.equal(
      kitePlan.drive.pressed & TEST_BUTTONS.ability1,
      0n,
      'McGinnis must NOT open turret placement preview',
    )
    assert.notEqual(
      kitePlan.drive.pressed & TEST_BUTTONS.ultimate,
      0n,
      'McGinnis should cast Heavy Barrage ultimate when ready in range',
    )

    // Verify Guardian siege priority ignores unprovoked distant heroes (> 950u) once in siege zone
    const siegeTarget = selectBossTarget(
      { x: -85, y: -1180, z: 384 },
      { x: -85, y: -1180, z: 480 },
      [
        {
          entity: 10,
          position: { x: 0, y: -2450, z: 390 },
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
  const emittedSounds: Array<{ entity: number; sound: string }> = []
  const firedInputs: Array<{ entity: number; input: string }> = []
  const scaleStore = new Map<number, number>()
  const lifeStateStore = new Map<number, number>()
  const modelStore = new Map<number, string>()
  const trooperIds = new Set<number>()
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
    giveModifier(mod: string) {
      if (this.hero === 0 || this.abilityList.length === 0) {
        return false
      }
      appliedModifiers.push(mod)
      if (mod.startsWith('td_boss_hero_stats_')) {
        const tier = Number(mod.replace('td_boss_hero_stats_', '')) || 1
        this.maxHealth = 700 + [2500, 5500, 10000, 16000, 25000][tier - 1]
      }
      return true
    }
    holdModifier(_mod: string, _active?: boolean) {
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
    remove() {
      const existed = npcStore.delete(this.entity)
      trooperIds.delete(this.entity)
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
      globalThis.__mockModlock.npcStore.set(ent, { health: 2500, maxHealth: 2500, team: opts.team, position: { ...p.position } });
      return p;
    };
    export const findEntitiesByName = (name) => name.includes('boss_rebel_t1_blue') ? [700] : [];
    export const findEntities = (cls) => {
      if (cls === 'info_super_trooper_spawn') return [14020, 14325];
      if (cls === 'info_neutral_trooper_camp') return [];
      if (cls === 'npc_trooper') return [...globalThis.__mockModlock.npcStore.keys()].filter((id) => (id >= 800 && id < 900) || globalThis.__mockModlock.trooperIds.has(id));
      if (cls === 'npc_trooper_neutral') return [...globalThis.__mockModlock.npcStore.keys()].filter((id) => id >= 1600 && id < 1700);
      if (cls === 'npc_trooper_boss') return [700];
      if (cls === 'npc_boss_tier2' || cls === 'destroyable_building') return [];
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
    export const holdModifierState = () => true;
    export const entityClass = (entity) => {
      if (entity >= 1600 && entity < 1700) return { className: 'CNPC_TrooperNeutral', designerName: 'npc_trooper_neutral' };
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
      const ent = globalThis.__mockModlock.allocSpawnEntity();
      globalThis.__mockModlock.spawnedTrooperUnits.push(opts.unit);
      if (opts.className === 'npc_trooper') {
        globalThis.__mockModlock.trooperIds.add(ent);
      }
      const defaultHp = opts.unit === 'trooper_melee' ? 413 : 150;
      if (opts.unit === 'trooper_melee') {
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
    modelStore,
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

  it('drives GuardianManager, WaveManager, TomeManager, and TdProbe through all 8 Probe steps (including Graves Zombie kamikaze, Boss Size scaling & Boss combat AI) to PASS', () => {
    const guardian = new GuardianManager()
    const tomes = new TomeManager()
    const waves = new WaveManager((w) => tomes.offerMajorBoonForWave(w))
    const probe = new TdProbe()

    guardian.reset()
    tomes.reset()
    waves.reset(0)

    // Advance all 8 probe steps: world -> defender -> wave_scale -> tome_grant -> boon_and_guardian -> zombie_kamikaze -> boss_scale -> boss_combat
    for (let step = 1; step <= 26 && !probePassed; step++) {
      // Simulate spawned trooper_melee marching south to the Guardian pedestal ring (y = -1350, 442u from Guardian y = -1792)
      for (const [ent, model] of modelStore.entries()) {
        if (model.includes('necro_shambler')) {
          const s = npcStore.get(ent)
          if (s && s.health > 0 && s.position.y > -1350) {
            s.position = { ...s.position, y: -1350 }
          }
        }
      }
      probe.tick(step * 2, waves, guardian, tomes)
      assert.equal(probeFailedReason, '', `TdProbe failed: ${probeFailedReason}`)
    }

    assert.equal(probePassed, true, 'Expected TdProbe to reach PASS state')
    assert.ok(appliedModifiers.length >= 2, 'Expected VData td_tome_* modifiers to be applied')
  })

  it('ignores pooled skybase lifeState=2 & zipline 1/1 entities, spawns varied wave neutrals, recovers recycled handles, and scales 100% of landed creeps', () => {
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
    const expectedScale = computeWaveCreepScale(8)
    const expectedDmgMult = computeWaveCreepDamageMult(8)
    const expectedInterval = computeWaveSpawnIntervalSeconds(8) // 14s

    // Wave 8 spawns 3 varied neutral creeps + 1 landed creep 802 = 4 (pooled skybase 801 MUST be excluded!)
    assert.equal(waves.spawnedWaveNeutrals.length, 3)
    assert.equal(waves.aliveCreepCount, 4)
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
    assert.equal(waves.aliveCreepCount, 4)
    assert.equal(waves.scaledCreeps.has(801), false)

    // Next second: 801 dismounts onto Center Lane (lifeState=0, 150/150 @[0,400,384]) -> immediately scaled!
    npcStore.set(801, {
      health: 150,
      maxHealth: 150,
      team: 3,
      position: { x: 0, y: 400, z: 384 },
    })
    waves.scaleNewlySpawnedCreeps()
    assert.equal(waves.aliveCreepCount, 5)
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

  it('skips placeholder Boss pawn (hero === 0) and applies scaled HP, Size, and Damage once real Boss hero spawns', () => {
    appliedModifiers.length = 0
    scaleStore.clear()
    npcStore.clear()

    const waves = new WaveManager()
    waves.reset(0)
    waves.wave = 9

    // Spawn Wave 10 Boss (Tier 2: +5500 HP, 1.75x Size, 1.35x Damage mult)
    waves.spawnNextWave(50, true)
    assert.equal(waves.activeBosses.length, 1)
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
    assert.equal(appliedModifiers.includes('td_boss_hero_stats_2'), false)

    // Real hero pawn spawns 250ms later (hero=6, pawnEntity=999, abilities=[slot 0..3])
    botMock.hero = 6
    botMock.pawnEntity = 999
    botMock.health = 700
    botMock.maxHealth = 700
    botMock.abilityList = [
      { name: 'citadel_ability_bull_charge', slot: 0 },
      { name: 'citadel_ability_bull_leap', slot: 3 },
    ]

    waves.tickActiveBosses(51)
    assert.equal(boss.configuredPawnEntity, 999)
    assert.equal(appliedModifiers.includes('td_boss_hero_stats_2'), true)
    assert.equal(appliedModifiers.includes('td_tome_ammo'), true)
    assert.equal(botMock.abilityList[0].upgrades, 0b0111)
    assert.ok(botMock.lastDrive !== undefined, 'Expected Boss bot.drive(...) to be active immediately')
    assert.ok(botMock.position.y < 1200, 'Expected Boss to start marching south out of spawn')
    assert.equal(scaleStore.get(999), 1.9)
    assert.equal(botMock.maxHealth, 6200)
    assert.equal(botMock.health, 6200)

    // Verify Defender damaging Boss records provocation aggro on Boss AI state
    waves.handleCreepPostDamage(
      {
        victim: 999,
        attacker: defenderPlayer.pawnEntity,
        ability: 0,
        healthBefore: 6200,
        healthLost: 120,
        dealt: 120,
      },
      undefined,
      52,
    )
    assert.equal(boss.ai.provokedHeroEntity, defenderPlayer.pawnEntity)
    assert.equal(boss.ai.provokedUntil, 58)

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
  })

  it('arms and detonates Graves Zombies on Guardian & Hero proximity AND on direct damage, killing the zombie 100% of the time without killing ranged troopers', () => {
    npcStore.clear()
    trooperIds.clear()
    modelStore.clear()
    lifeStateStore.clear()
    emittedSounds.length = 0

    // Verify pure wave neutral variety rotation covers all 4 neutral types across Waves 1-2
    const w1Neutrals = getWaveNeutralSpawns(1).map((s) => s.unit)
    const w2Neutrals = getWaveNeutralSpawns(2).map((s) => s.unit)
    const w6Neutrals = getWaveNeutralSpawns(6).map((s) => s.unit)
    assert.deepEqual(w1Neutrals, ['td_neutral_lantern', 'td_neutral_puppeteer'])
    assert.deepEqual(w2Neutrals, ['td_neutral_pigeon', 'td_neutral_mushroom'])
    assert.equal(w6Neutrals.length, 3)

    // Verify pure detonation range math
    assert.equal(
      isWithinZombieDetonationRange(
        { x: 0, y: -1320, z: 384 },
        { x: 0, y: -1792, z: 384 },
        'guardian',
      ),
      true,
    )
    assert.equal(
      isWithinZombieDetonationRange(
        { x: 0, y: -1000, z: 384 },
        { x: 0, y: -1792, z: 384 },
        'guardian',
      ),
      false,
    )
    assert.equal(isExplodingZombieBaseMaxHp(413), true)
    assert.equal(isExplodingZombieBaseMaxHp(150), false)

    // Setup Guardian at [0, -1792, 384]
    npcStore.set(700, {
      health: 5500,
      maxHealth: 5500,
      team: 2,
      position: { x: 0, y: -1792, z: 384 },
    })
    // 810: Graves Zombie (trooper_melee, base maxHP=413) at Guardian's 472u engagement ring (y = -1330)
    // 811: Ranged Trooper (trooper_normal, base maxHP=150)
    // 812: Second Graves Zombie hitting via onDamaged
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
    npcStore.set(812, {
      health: 413,
      maxHealth: 413,
      team: 3,
      position: { x: 0, y: -600, z: 384 },
    })

    const guardian = new GuardianManager()
    guardian.reset()
    const waves = new WaveManager()
    waves.reset(0)
    waves.wave = 3
    waves.scaleNewlySpawnedCreeps()

    assert.equal(waves.creepSpecs.get(810)?.isExplodingZombie, true)
    assert.equal(waves.creepSpecs.get(811)?.isExplodingZombie, false)
    assert.equal(waves.creepSpecs.get(812)?.isExplodingZombie, true)

    // First 250ms tick at t=10.0s: 810 arms with warning sound (still alive during 0.2s fuse)
    const det1 = waves.tickExplodingZombies(10.0, guardian)
    assert.equal(det1, 0)
    assert.ok(
      emittedSounds.some((s) => s.entity === 810 && s.sound === 'Necro.Shambler.Warning'),
    )
    assert.ok((npcStore.get(810)?.health ?? 0) > 0)

    // Next 250ms tick at t=10.25s: 810 detonates kamikaze explosion, damages Guardian, and DIES!
    const det2 = waves.tickExplodingZombies(10.25, guardian)
    assert.equal(det2, 1)
    assert.equal(npcStore.get(810)?.health, 0)
    assert.equal(lifeStateStore.get(810), 2)
    assert.ok(guardian.health < 5500, 'Expected Guardian to take kamikaze damage')

    // Ranged trooper 811 MUST stay alive!
    const rangedDied = waves.handleCreepPostDamage(
      {
        victim: 700,
        attacker: 811,
        ability: 0,
        healthBefore: guardian.health,
        healthLost: 24,
        dealt: 24,
      },
      guardian,
    )
    assert.equal(rangedDied, false)
    assert.ok((npcStore.get(811)?.health ?? 0) > 0)

    // Second Graves Zombie 812 dealing direct damage MUST self-destruct immediately!
    const zombieDied = waves.handleCreepPostDamage(
      {
        victim: 10,
        attacker: 812,
        ability: 0,
        healthBefore: 700,
        healthLost: 65,
        dealt: 65,
      },
      guardian,
    )
    assert.equal(zombieDied, true)
    assert.equal(npcStore.get(812)?.health, 0)
  })
})

