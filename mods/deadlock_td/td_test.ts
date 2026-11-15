import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'

import { TomeManager } from '@components/roguelite'
import { LeaderboardManager } from '@components/scores'
import { mockHost, resetMockHost } from '@testing/mock_modlock_host'

import { GuardianManager } from './guardian'
import { TdProbe } from './probe'
import {
  advanceBossWaypointIndex,
  BASE_CREEP_HP,
  BASE_CREEP_SCALE,
  BASE_WAVE_SOUL_REWARD,
  BOARD_CREEPS_SLAIN,
  BOARD_HIGHEST_WAVE,
  BOSS_BASE_DAMAGE_MULT,
  BOSS_BASE_MAX_HP,
  BOSS_COLOSSUS_APPLIED_SCALE,
  BOSS_COLOSSUS_ENTITY_MODIFIER,
  BOSS_DAMAGE_MULT_PER_BOSS_WAVE,
  BOSS_GUARDIAN_MIN_STANDOFF,
  BOSS_GUARDIAN_SIEGE_RANGE,
  BOSS_KILL_SOUL_REWARD,
  BOSS_LANE_ROUTES,
  type BossButtonMask,
  CLIP_SIZE_ENTITY_MODIFIERS,
  computeAimAngles,
  computeBossAbilityUpgradeMask,
  computeBossDamageMult,
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
  createBossAiState,
  deserializeTdHandoff,
  ELITE_HASTE_ENTITY_MODIFIER,
  evaluateAllStructuresRepair,
  evaluateBaseDefenseProgression,
  evaluateCreepHealthSync,
  evaluateLeaderboardCheckpoint,
  evaluateLeaderboardSubmission,
  FIRE_RATE_ENTITY_MODIFIERS,
  flatDistance2D,
  getBossWaypointsForObjective,
  getBossWaveSpec,
  getCreepScaleAuraModifier,
  getDefenderStageSpawnOrigin,
  getStructureFortifyAuraSpec,
  getStructureFortifyEntityModifiers,
  getWaveCreepModifiers,
  getWaveNeutralSpawns,
  GUARDIAN_BASE_MAX_HP,
  GUARDIAN_REPAIR_AMOUNT_HP,
  GUARDIAN_REPAIR_COST_SOULS,
  GUARDIAN_UPGRADE_BASE_COST_SOULS,
  GUARDIAN_UPGRADE_COST_STEP_SOULS,
  HERO_RESPAWN_TIME_SECONDS,
  isBossWave,
  isExplodingZombieBaseMaxHp,
  isExplodingZombieIdentity,
  isWithinZombieDetonationRange,
  MAJOR_BOON_POOL,
  MAX_COOP_DEFENDER_PLAYERS,
  MAX_CREEP_HP,
  MAX_CREEP_SCALE,
  MAX_WAVE_SOUL_REWARD,
  MIN_SPAWN_INTERVAL_SECONDS,
  MINOR_TOME_POOL,
  planBossDriveStep,
  selectBossTarget,
  selectUnscaledCreeps,
  serializeTdHandoff,
  SOUL_CACHE_BASE_SOULS,
  STRUCTURE_CDR_ENTITY_MODIFIER,
  TD_SERVER_CVARS,
  type TdHandoffState,
  worldMoveToDriveAxes,
  ZIPLINE_SQUAD_SIZE,
} from './td_config'
import { WaveManager } from './wave'

describe('Tier 1 — Wave Scaling & Boss Wave Math', () => {
  it('starts Wave 1 at BASE_CREEP_HP (200) and scales smoothly (+4%/wave) up to MAX_CREEP_HP cap', () => {
    assert.equal(computeWaveCreepHp(1), BASE_CREEP_HP)
    assert.equal(computeWaveCreepHp(1), 200)

    let prevHp = computeWaveCreepHp(1)
    for (let w = 2; w <= 265; w++) {
      const hp = computeWaveCreepHp(w)
      assert.ok(
        hp >= prevHp,
        `Expected Wave ${w} HP (${hp}) >= Wave ${w - 1} HP (${prevHp})`,
      )
      prevHp = hp
    }

    // +4%/wave creep HP curve: Wave 5 ~234 HP, Wave 10 ~285 HP
    assert.ok(computeWaveCreepHp(5) >= 230 && computeWaveCreepHp(5) <= 240)
    assert.ok(computeWaveCreepHp(10) >= 280 && computeWaveCreepHp(10) <= 290)
    assert.equal(computeWaveCreepHp(265), MAX_CREEP_HP)
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
    assert.equal(spec15.bonusHp, 5500)
    assert.equal(spec15.damageMult, 1.55)
    assert.equal(spec5.damageMult, BOSS_BASE_DAMAGE_MULT)
    assert.equal(computeBossDamageMult(0), BOSS_BASE_DAMAGE_MULT)
    assert.equal(
      computeBossDamageMult(2),
      Number((BOSS_BASE_DAMAGE_MULT + 2 * BOSS_DAMAGE_MULT_PER_BOSS_WAVE).toFixed(3)),
    )
    assert.equal(BOSS_BASE_MAX_HP, 1000)
    assert.equal(BOSS_COLOSSUS_APPLIED_SCALE, 1.38)
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
    assert.equal(computeWaveSoulReward(1), BASE_WAVE_SOUL_REWARD)
    assert.equal(computeWaveSoulReward(10), 125)
    assert.equal(computeWaveSoulReward(500), MAX_WAVE_SOUL_REWARD)

    assert.ok(computeWaveCreepDamageMult(10) > computeWaveCreepDamageMult(5))
    assert.ok(computeWaveCreepDamageMult(20) > 1.9 && computeWaveCreepDamageMult(20) < 1.95)

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
    assert.equal(cvarMap.get('citadel_trooper_gold_reward'), 50)
    assert.equal(cvarMap.get('citadel_trooper_gold_reward_bonus_per_minute'), 33)
    assert.equal(cvarMap.get('citadel_player_gold_reward_min'), 67)
    assert.equal(cvarMap.get('citadel_player_gold_reward_max'), 733)
    assert.equal(cvarMap.get('citadel_player_gold_reward_first_kill_bonus'), 42)
    assert.equal(MINOR_TOME_POOL.find((t) => t.id === 'soul_jackpot')?.amount, SOUL_CACHE_BASE_SOULS)
    assert.equal(MAJOR_BOON_POOL.find((b) => b.id === 'warchest')?.bonusSouls, 1200)
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

describe('Tier 1 — TD Guardian Mechanics, Handoff & Zombie Identity', () => {
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

describe('Tier 1B — Full Manager & TdProbe State Machine Integration (Mock Host)', () => {
  const {
    npcStore,
    patronPhaseStore,
    seedMockTeam2Structures,
    appliedModifiers,
    entityModifiers,
    shrineModifierErrors,
    activeBossBots,
    refreshedAbilities,
    heldModifierStates,
    executedServerCommands,
    spawnedTrooperUnits,
    emittedSounds,
    firedInputs,
    scaleStore,
    lifeStateStore,
    modelStore,
    spawnerLaneStore,
    spawnerDisableZipStore,
    teamFlexSlotsStore,
    mockSettings,
    trooperIds,
    neutralIds,
    necroSkeleIds,
    failedCustomModifiers,
    givenItems,
    reportedScores,
    addedMetrics,
    createdEntities,
    shopTriggerIds,
    shopTriggerBounds,
    pawnInShopStore,
    seedDefaultMapShop,
    mockBoardPages,
    mockBotPlayers,
    MockPlayer,
    defenderPlayer,
    entityScanStats,
  } = mockHost

  beforeEach(() => {
    resetMockHost()
  })

  it('drives GuardianManager, WaveManager, TomeManager, and TdProbe through all Probe steps (Boss Colossus scaling, Boss combat AI, Tome scaling, and Multi-Stage Base Progression) to PASS', () => {
    appliedModifiers.length = 0
    entityModifiers.clear()
    shrineModifierErrors.length = 0
    const guardian = new GuardianManager()
    const tomes = new TomeManager({ minorTomePool: MINOR_TOME_POOL, majorBoonPool: MAJOR_BOON_POOL })
    const waves = new WaveManager((w) => tomes.offerMajorBoonForWave(w))
    const probe = new TdProbe()

    guardian.reset()
    tomes.reset()
    waves.reset(0)
    waves.configureWorldForSingleLaneDefense(guardian)

    for (let step = 1; step <= 80 && !mockHost.probePassed; step++) {
      probe.tick(step * 0.25, waves, guardian, tomes)
      assert.equal(mockHost.probeFailedReason, '', `TdProbe failed: ${mockHost.probeFailedReason}`)
    }

    assert.equal(mockHost.probePassed, true, 'Expected TdProbe to reach PASS state')
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

  it('holds Wave 1 while Steam GC auto-spawns a roster hero behind an unconfirmed initial HeroPickerModal', () => {
    const awaitingSlots = new Set<number>([0])
    const waves = new WaveManager(undefined, undefined, (slot) => awaitingSlots.has(slot))
    waves.reset(0)

    // Steam GC auto-spawns hero_yamato (id 27) on Team 2 while slot 0 is still choosing in HeroPickerModal
    defenderPlayer.hero = 27
    waves.tick(15, true)
    assert.equal(waves.wave, 0)
    assert.equal(waves.waitingForDefenderHero, true)
    assert.equal(waves.nextWaveTime, 20)

    // Player confirms/picks a hero -> HeroPicker closes and 5s Wave 1 countdown starts
    awaitingSlots.delete(0)
    waves.tick(16, true)
    assert.equal(waves.waitingForDefenderHero, false)
    assert.equal(waves.wave, 0)

    waves.tick(20, true)
    assert.equal(waves.wave, 1)

    const handoffRaw = serializeTdHandoff({
      version: 1,
      wave: 0,
      nextWaveTime: 20,
      matchState: 'active',
      guardianUpgradeLevel: 0,
      guardianBonusMaxHp: 0,
      scaledCreeps: [],
      rewardedCreeps: [],
      playerTomes: {},
      playerKills: {},
      awaitingHeroPickSlots: [0, 2],
    })
    const handoffRestored = deserializeTdHandoff(handoffRaw)
    assert.deepEqual(handoffRestored?.awaitingHeroPickSlots, [0, 2])

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
    const botMock = boss.bot as unknown as InstanceType<typeof MockPlayer>
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
    assert.ok(boss.currentMaxHp >= 3950)
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

    // Verify Boss outgoing damage is scaled in modifyIncomingDamage (Wave 10 doubled = 1.35x)
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

    // Verify lethal hit on Boss retires Boss AND awards Wave 10 Major Boon + 133 Souls (#13)!
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
    assert.equal(defenderPlayer.souls, soulsBeforeKill + BOSS_KILL_SOUL_REWARD)
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
    mockHost.vanillaMode = true
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
      const tomes = new TomeManager({ minorTomePool: MINOR_TOME_POOL, majorBoonPool: MAJOR_BOON_POOL })
      const waves = new WaveManager((w) => tomes.offerMajorBoonForWave(w))
      guardian.reset()
      tomes.reset()
      waves.reset(0)
      waves.configureWorldForSingleLaneDefense(guardian)

      // Spawn Wave 5 (Colossus Raid Boss, zero wave neutrals in v0.6.0)
      waves.wave = 4
      waves.spawnNextWave(20, true)
      assert.equal(waves.spawnedWaveNeutrals.length, 0)

      const boss = waves.activeBosses[0]
      assert.ok(boss, 'Expected Wave 5 Boss to spawn')
      const botMock = boss.bot as unknown as InstanceType<typeof MockPlayer>
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
      assert.ok(boss.currentMaxHp >= 2700, `Expected Wave 5 Boss effective Max HP >= 2700, got ${boss.currentMaxHp}`)

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
      mockHost.probePassed = false
      mockHost.probeFailedReason = ''
      const vanillaProbe = new TdProbe()
      for (let step = 1; step <= 90 && !mockHost.probePassed; step++) {
        vanillaProbe.tick(100 + step * 0.25, waves, guardian, tomes)
        assert.equal(mockHost.probeFailedReason, '', `Vanilla TdProbe failed: ${mockHost.probeFailedReason}`)
      }
      assert.equal(mockHost.probePassed, true, 'Expected TdProbe to reach PASS in stock Modlock mode')
    } finally {
      mockHost.vanillaMode = false
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

    const scanStats = (globalThis as unknown as { __mockModlock: { entityScanStats: { findByClass: number; findByName: number } } })
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

  it('unlocks all Team 2 Flex Slots on world configure (#29)', () => {
    executedServerCommands.length = 0
    teamFlexSlotsStore.set(710, 0)
    const guardian = new GuardianManager()
    const waves = new WaveManager()
    guardian.reset()
    waves.reset(0)
    waves.configureWorldForSingleLaneDefense(guardian)

    assert.equal(
      executedServerCommands.some((c) => c.startsWith('citadel_unlock_flex_slots')),
      false,
    )
    assert.equal(teamFlexSlotsStore.get(710), 15)
  })

  it('disables Team 2 trooper spawners without mutating m_iLane (avoiding 0xC0000094 divide-by-zero) and removes friendly 1/1 zipline creeps (#27)', () => {
    npcStore.clear()
    trooperIds.clear()
    lifeStateStore.clear()
    spawnerLaneStore.set(14291, 4) // Team 2 Lane 4 spawner
    spawnerLaneStore.set(14051, 1) // Team 3 side lane spawner
    spawnerLaneStore.set(14053, 4) // Team 3 Center lane spawner
    spawnerDisableZipStore.clear()

    const guardian = new GuardianManager()
    const waves = new WaveManager()
    guardian.reset()
    waves.reset(0)
    waves.configureWorldForSingleLaneDefense(guardian)

    assert.equal(spawnerLaneStore.get(14291), 4)
    assert.equal(spawnerDisableZipStore.get(14291), true)
    assert.equal(spawnerLaneStore.get(14051), 1)
    assert.equal(spawnerDisableZipStore.get(14051), true)
    assert.equal(spawnerLaneStore.get(14053), 4)

    // Simulate a Team 2 friendly trooper (880) spawning with 1/1 HP on the Blue zipline
    // alongside an enemy Team 3 trooper (881) also with 1/1 HP on the Amber zipline
    trooperIds.add(880)
    trooperIds.add(881)
    lifeStateStore.set(880, 0)
    lifeStateStore.set(881, 0)
    npcStore.set(880, {
      health: 1,
      maxHealth: 1,
      team: 2,
      position: { x: -400, y: -5000, z: 980 },
    })
    npcStore.set(881, {
      health: 1,
      maxHealth: 1,
      team: 3,
      position: { x: 0, y: 2200, z: 1020 },
    })

    const removed = waves.purgeFriendlyAndSideLaneTroopers()
    assert.equal(removed, 1)
    assert.equal(npcStore.has(880), false, 'Friendly 1/1 zipline trooper must be removed before riding rope')
    assert.equal(npcStore.has(881), true, 'Enemy 1/1 zipline trooper must remain intact until landing')
  })

  it('scales Minor Tome and Major Boon rewards with wave number and respects configurable tome_scaling (#30)', () => {
    const tomes = new TomeManager({ minorTomePool: MINOR_TOME_POOL, majorBoonPool: MAJOR_BOON_POOL })
    const guardian = new GuardianManager()
    guardian.reset()
    tomes.reset()
    mockSettings.set('tome_scaling', '0.10')

    // Wave 1 (mult = 1.0x): +1 Weapon stack
    defenderPlayer.souls = 1000
    defenderPlayer.ap = 0
    tomes.applyMinorTome(defenderPlayer as never, MINOR_TOME_POOL[1], 1)
    assert.equal(tomes.getTally(defenderPlayer.slot).weapon, 1)

    // Wave 21 at +10%/wave (mult = 3.0x): +3 Weapon stacks, +750 Souls, +3 AP!
    tomes.applyMinorTome(defenderPlayer as never, MINOR_TOME_POOL[1], 21)
    assert.equal(tomes.getTally(defenderPlayer.slot).weapon, 4)

    tomes.applyMinorTome(defenderPlayer as never, MINOR_TOME_POOL[8], 21) // Soul Cache (83 * 3 = 249)
    assert.equal(defenderPlayer.souls, 1249)

    tomes.applyMinorTome(defenderPlayer as never, MINOR_TOME_POOL[7], 21) // +1 AP Tome (1 * 3 = 3)
    assert.equal(defenderPlayer.ap, 3)

    // Verify override '/tomescale 0' disables scaling back to 1.0x
    tomes.setGrowthRateOverride(0)
    assert.equal(tomes.getWaveMultiplier(40), 1)
    tomes.applyMinorTome(defenderPlayer as never, MINOR_TOME_POOL[8], 40)
    assert.equal(defenderPlayer.souls, 1332)

    // Verify Major Boon picks up Wave multiplier and scaled subtitle formatting
    tomes.setGrowthRateOverride(undefined)
    tomes.offerMajorBoonForWave(11) // 1 + 10 * 0.10 = 2.0x
    assert.equal(tomes.pendingBoonWave.get(defenderPlayer.slot), 11)
    const pendingBoon = tomes.pendingBoonChoices.get(defenderPlayer.slot)![0]
    const expectedBoonStacks = pendingBoon.modifiers.reduce((sum, m) => sum + m.stacks * 2, 0)

    const totalBeforeBoon = tomes.getTotalTomes(defenderPlayer.slot)
    tomes.chooseMajorBoon(defenderPlayer as never, 0, guardian, 11)
    assert.equal(tomes.getTotalTomes(defenderPlayer.slot), totalBeforeBoon + expectedBoonStacks)
    mockSettings.set('tome_scaling', '0.06')
  })

  it('tracks ranked runs cleanly, skips bots, blocks sandbox runs, and caches board reads', () => {
    reportedScores.length = 0
    mockBoardPages.clear()
    mockBotPlayers.length = 0
    mockBotPlayers.push({
      player: new MockPlayer(5),
      name: 'BossBot',
      bot: true,
      ready: true,
      steamId: 99n,
      generation: 1,
      roles: [],
    })

    const leaderboard = new LeaderboardManager()
    const tomes = new TomeManager({ minorTomePool: MINOR_TOME_POOL, majorBoonPool: MAJOR_BOON_POOL })
    tomes.reset()
    for (let i = 0; i < 340; i++) {
      tomes.playerKills.set(defenderPlayer.slot, i + 1)
    }
    tomes.playerKills.set(5, 50)

    // 1. Ranked defeat on Wave 18 (340 kills) reports both boards once, skips bots, and deduplicates
    const submittedFirst = leaderboard.submitRunForAllPlayers(18, tomes, 1)
    assert.equal(submittedFirst, 1)
    assert.equal(reportedScores.length, 2)
    assert.deepEqual(reportedScores[0], {
      slot: defenderPlayer.slot,
      board: BOARD_HIGHEST_WAVE,
      value: 18,
      options: { tiebreak: -340, key: `${leaderboard.runId}-w-${defenderPlayer.slot}-18-340` },
    })
    assert.deepEqual(reportedScores[1], {
      slot: defenderPlayer.slot,
      board: BOARD_CREEPS_SLAIN,
      value: 340,
      options: { key: `${leaderboard.runId}-c-${defenderPlayer.slot}-1` },
    })
    assert.equal(leaderboard.sessionBestBySlot.get(defenderPlayer.slot)?.wave, 18)

    // Second submission with identical progress in the same run must be deduplicated
    assert.equal(leaderboard.submitRunForAllPlayers(18, tomes, 1), 0)
    assert.equal(reportedScores.length, 2)

    // Progressive checkpoint later in the same run reports Wave 19 & ONLY +10 kill delta (total=350, no double-count!)
    tomes.playerKills.set(defenderPlayer.slot, 350)
    assert.equal(leaderboard.checkpointAllPlayers(19, tomes), 1)
    assert.equal(reportedScores.length, 4)
    assert.deepEqual(reportedScores[2], {
      slot: defenderPlayer.slot,
      board: BOARD_HIGHEST_WAVE,
      value: 19,
      options: { tiebreak: -350, key: `${leaderboard.runId}-w-${defenderPlayer.slot}-19-350` },
    })
    assert.deepEqual(reportedScores[3], {
      slot: defenderPlayer.slot,
      board: BOARD_CREEPS_SLAIN,
      value: 10,
      options: { key: `${leaderboard.runId}-c-${defenderPlayer.slot}-2` },
    })

    // Every generated ScoreReport key contains only [A-Za-z0-9_.-] (no colons)
    for (const s of reportedScores) {
      assert.match(String(s.options.key), /^[A-Za-z0-9_.-]{1,64}$/)
    }

    // 2. Sandbox disqualification prevents submission until startNewRun()
    leaderboard.startNewRun()
    assert.equal(leaderboard.markUnranked('/souls'), true)
    assert.equal(leaderboard.markUnranked('/skipwave'), false)
    assert.equal(leaderboard.submitRunForAllPlayers(25, tomes, 1), 0)
    assert.equal(reportedScores.length, 4)

    leaderboard.startNewRun()
    assert.equal(leaderboard.rankedEligible, true)
    assert.equal(leaderboard.submitRunForPlayer(defenderPlayer as never, 20, 0, 1), true)
    // With 0 kills, only td.highest_wave is reported (since td.creeps_slain has lowest=1)
    assert.equal(reportedScores.length, 5)
    assert.equal(reportedScores[4].board, BOARD_HIGHEST_WAVE)
    assert.equal(reportedScores[4].value, 20)

    // Wave 1 with 0 kills + requireProgressOnWave1 skips reporting, while Wave 1 with 5 kills flushes on disconnect!
    leaderboard.startNewRun()
    assert.equal(leaderboard.checkpointPlayer(defenderPlayer as never, 1, 0, { requireProgressOnWave1: true }), false)
    assert.equal(reportedScores.length, 5)
    assert.equal(leaderboard.checkpointPlayer(defenderPlayer as never, 1, 5, { requireProgressOnWave1: true }), true)
    assert.equal(reportedScores.length, 7)
    assert.equal(reportedScores[5].value, 1)
    assert.equal(reportedScores[6].value, 5)

    // 3. Handoff checkpoint restore preserves already-reported kills so post-reload checkpoint emits deltas only
    const handoffCheckpoint = leaderboard.exportCheckpointState()
    const restoredLb = new LeaderboardManager()
    restoredLb.restore(
      leaderboard.runId,
      leaderboard.rankedEligible,
      leaderboard.disqualifyReason,
      [...leaderboard.submittedSlots],
      handoffCheckpoint,
    )
    assert.equal(restoredLb.checkpointPlayer(defenderPlayer as never, 1, 5), false)
    assert.equal(restoredLb.checkpointPlayer(defenderPlayer as never, 2, 9), true)
    assert.equal(reportedScores.length, 9)
    assert.equal(reportedScores[8].board, BOARD_CREEPS_SLAIN)
    assert.equal(reportedScores[8].value, 4)

    // 4. Board reads handle BigInt steamId rows and respect cache TTL
    mockBoardPages.set(`${BOARD_HIGHEST_WAVE}:allTime`, {
      rows: [{ rank: 1, steamId: 76561198000000001n, name: 'Defender', value: 20, tiebreak: -340, count: 1 }],
      player: { rank: 1, steamId: 76561198000000001n, name: 'Defender', value: 20, tiebreak: -340, count: 1 },
      loading: false,
    })
    const cached1 = leaderboard.getBoardSnapshot(defenderPlayer as never, 'allTime', 100)
    assert.equal(cached1?.rows[0].value, 20)
    mockBoardPages.delete(`${BOARD_HIGHEST_WAVE}:allTime`)
    const cached2 = leaderboard.getBoardSnapshot(defenderPlayer as never, 'allTime', 100.5)
    assert.equal(cached2?.rows[0].value, 20)

    mockBotPlayers.length = 0
  })
  it('grants Buy Anywhere via VPhysics trigger_item_shop sphere volumes without sv_cheats 1 and records live td.waves_cleared (#31, #33)', () => {
    executedServerCommands.length = 0
    createdEntities.length = 0
    addedMetrics.length = 0
    pawnInShopStore.clear()
    shopTriggerIds.clear()
    shopTriggerBounds.clear()
    seedDefaultMapShop()

    const guardian = new GuardianManager()
    const waves = new WaveManager()
    guardian.reset()
    waves.reset(0)

    // 1. Inside spawn shop 15001 -> true; teleporting to Center Lane [0, -1950, 390] drops to false;
    // ensureDefenderShopAccess preserves map triggers 15001/15002 untouched and grants Buy Anywhere without sv_cheats 1
    defenderPlayer.teleport({ x: -1260, y: -10141, z: 1476 })
    assert.equal(pawnInShopStore.get(defenderPlayer.pawnEntity), true)

    defenderPlayer.teleport({ x: 0, y: -1950, z: 390 })
    assert.equal(pawnInShopStore.get(defenderPlayer.pawnEntity), false)

    assert.equal(
      waves.ensureDefenderShopAccess(defenderPlayer.pawnEntity, defenderPlayer.position),
      true,
    )
    assert.equal(pawnInShopStore.get(defenderPlayer.pawnEntity), true)
    assert.equal(executedServerCommands.includes('sv_cheats 1'), false)
    assert.ok(
      createdEntities.some(
        (e) => e.designerName === 'trigger_item_shop' && e.team === 2,
      ),
    )
    assert.deepEqual(shopTriggerBounds.get(15001)?.origin, {
      x: -1260,
      y: -10141,
      z: 1476,
    })
    assert.deepEqual(shopTriggerBounds.get(15002)?.origin, {
      x: 1260,
      y: 10141,
      z: 1476,
    })
    assert.equal(shopTriggerBounds.get(15002)?.team, 3)

    // 2. Moving into Patron Pit also keeps Buy Anywhere active under sv_cheats 0,
    // and waves.reset() removes mod-created shop triggers so outside-spawn m_bInItemShopZone returns to false
    defenderPlayer.teleport({ x: 0, y: -8800, z: 200 })
    assert.equal(
      waves.ensureDefenderShopAccess(defenderPlayer.pawnEntity, defenderPlayer.position),
      true,
    )
    assert.equal(pawnInShopStore.get(defenderPlayer.pawnEntity), true)

    waves.reset(10)
    assert.equal(pawnInShopStore.get(defenderPlayer.pawnEntity), false)
    assert.equal(
      waves.ensureDefenderShopAccess(defenderPlayer.pawnEntity, defenderPlayer.position),
      true,
    )
    assert.equal(pawnInShopStore.get(defenderPlayer.pawnEntity), true)
    waves.reset(10)

    // 3. unlockAllPlayerFlexSlots emits zero cheat commands, and respawnAllStructures brackets sv_cheats cleanly
    executedServerCommands.length = 0
    waves.unlockAllPlayerFlexSlots()
    assert.equal(executedServerCommands.length, 0)

    guardian.respawnAllStructures(false)
    assert.equal(executedServerCommands[0], 'sv_cheats 1')
    assert.equal(executedServerCommands[executedServerCommands.length - 1], 'sv_cheats 0')

    executedServerCommands.length = 0
    guardian.respawnAllStructures(true)
    assert.equal(executedServerCommands.includes('sv_cheats 0'), false)

    // 4. Advancing to Wave 2 and Wave 3 records td.waves_cleared live (1 and 2)
    waves.spawnNextWave(10)
    assert.equal(addedMetrics.filter((m) => m.name === 'td.waves_cleared').length, 0)
    waves.spawnNextWave(30)
    waves.spawnNextWave(50)
    const clearedValues = addedMetrics
      .filter((m) => m.name === 'td.waves_cleared')
      .map((m) => m.value)
    assert.deepEqual(clearedValues, [1, 2])
  })

  it('attaches Guardian/Walker/Boss/Hero/Wave6+ entity modifiers, skips Shrines, trims cooldowns immediately on onAbilityCast, and deduplicates onKill', () => {
    npcStore.clear()
    trooperIds.clear()
    entityModifiers.clear()
    shrineModifierErrors.length = 0
    appliedModifiers.length = 0
    activeBossBots.length = 0

    // Restore base Team 2 structures (700=Guardian, 701=Walker, 702/703=Base Guardians, 704/705=Shrines, 706=Patron)
    npcStore.set(700, { health: 5500, maxHealth: 5500, team: 2, position: { x: 0, y: -1580, z: 384 } })
    npcStore.set(701, { health: 9000, maxHealth: 9000, team: 2, position: { x: 0, y: -4200, z: 384 } })
    npcStore.set(702, { health: 4000, maxHealth: 4000, team: 2, position: { x: -240, y: -6500, z: 384 } })
    npcStore.set(703, { health: 4000, maxHealth: 4000, team: 2, position: { x: 240, y: -6500, z: 384 } })
    npcStore.set(704, { health: 8000, maxHealth: 8000, team: 2, position: { x: 900, y: -7400, z: 384 } })
    npcStore.set(705, { health: 8000, maxHealth: 8000, team: 2, position: { x: -900, y: -7400, z: 384 } })
    npcStore.set(706, { health: 12000, maxHealth: 12000, team: 2, position: { x: 0, y: -8800, z: 384 } })

    const guardian = new GuardianManager()
    const tomes = new TomeManager({ minorTomePool: MINOR_TOME_POOL, majorBoonPool: MAJOR_BOON_POOL })
    const waves = new WaveManager()
    guardian.reset()
    tomes.reset()
    waves.reset(0)

    // Lv.0 requires zero structure fortify entity modifiers
    assert.equal(entityModifiers.has(700), false)
    assert.equal(entityModifiers.has(701), false)

    defenderPlayer.souls = 5000
    assert.equal(guardian.upgradeByPlayer(defenderPlayer as never), true)
    assert.equal(guardian.upgradeByPlayer(defenderPlayer as never), true)
    guardian.poll(5, 10)

    const gMods = entityModifiers.get(700)
    const wMods = entityModifiers.get(701)
    assert.ok(gMods && gMods.has(STRUCTURE_CDR_ENTITY_MODIFIER))
    assert.ok(wMods && wMods.has(STRUCTURE_CDR_ENTITY_MODIFIER))
    assert.equal(shrineModifierErrors.length, 0)
    assert.equal(entityModifiers.has(704), false)
    assert.equal(entityModifiers.has(705), false)

    // Hero Tome modifiers + immediate onAbilityCast cooldown trim + onKill deduplication
    defenderPlayer.abilityList = [
      {
        name: 'citadel_ability_primary',
        slot: 0,
        entity: 400,
        upgrades: 1,
        charges: 0,
        cooldownStart: 10,
        cooldownEnd: 30,
        id: 1,
        state: 0,
        rechargeStart: 0,
        rechargeEnd: 0,
        imbues: [],
      },
    ]
    tomes.applyMinorTome(defenderPlayer as never, MINOR_TOME_POOL[1], 1) // Weapon -> clip_size_2
    tomes.applyMinorTome(defenderPlayer as never, MINOR_TOME_POOL[4], 1) // Cooldown -> 3% CDR
    assert.ok(
      entityModifiers.get(defenderPlayer.pawnEntity)?.has(CLIP_SIZE_ENTITY_MODIFIERS[0].modifier),
    )

    tomes.onAbilityCast(
      {
        caster: defenderPlayer.pawnEntity,
        player: defenderPlayer as never,
        ability: 400,
        name: 'citadel_ability_primary',
        slot: 0,
        target: 0,
      },
      10.1,
    )
    assert.ok(Math.abs((defenderPlayer.abilityList[0].cooldownEnd ?? 30) - 29.4) < 0.01)

    // Wave 6 creep receives ELITE_HASTE_ENTITY_MODIFIER; onKill deduplicates with onDamaged
    waves.wave = 6
    npcStore.set(850, { health: 240, maxHealth: 240, team: 3, position: { x: 0, y: -1750, z: 384 } })
    waves.scaleNewlySpawnedCreeps()
    assert.ok(entityModifiers.get(850)?.has(ELITE_HASTE_ENTITY_MODIFIER))

    const kill1 = tomes.onKill(
      {
        victim: 850,
        victimPlayer: { slot: -1 } as never,
        attacker: defenderPlayer.pawnEntity,
        attackerPlayer: defenderPlayer as never,
        ability: 0,
      },
      new Set([850]),
      guardian,
      0.01,
      0.01,
      6,
    )
    assert.equal(kill1.isPlayerKill, true)
    const killDup = tomes.onKill(
      {
        victim: 850,
        victimPlayer: { slot: -1 } as never,
        attacker: defenderPlayer.pawnEntity,
        attackerPlayer: defenderPlayer as never,
        ability: 0,
      },
      new Set([850]),
      guardian,
      0.01,
      0.01,
      6,
    )
    assert.equal(killDup.reason, 'duplicate_kill')
    assert.equal(killDup.granted, false)
    assert.equal(tomes.getKills(defenderPlayer.slot), 1)
    assert.equal(typeof defenderPlayer.connection, 'function')
    assert.equal(defenderPlayer.connection()?.bot, false)

    // Wave 10 Boss gets both Colossus and Haste entity modifiers + onKill fallback retires it
    waves.wave = 9
    waves.spawnNextWave(20, true)
    waves.tickActiveBosses(20.1, guardian)
    const boss10 = waves.activeBosses.find((b) => b.wave === 10)
    assert.ok(boss10 && boss10.configuredPawnEntity > 0)
    assert.ok(entityModifiers.get(boss10.configuredPawnEntity)?.has(BOSS_COLOSSUS_ENTITY_MODIFIER))
    assert.ok(entityModifiers.get(boss10.configuredPawnEntity)?.has(ELITE_HASTE_ENTITY_MODIFIER))

    waves.handleEntityKilled({
      victim: boss10.configuredPawnEntity,
      victimPlayer: boss10.bot,
      attacker: defenderPlayer.pawnEntity,
      attackerPlayer: defenderPlayer as never,
      ability: 0,
    })
    assert.equal(waves.activeBosses.length, 0)
  })

  it('reconciles WaveManager, TomeManager, and LeaderboardManager caches across server clock backsteps (v0.7.1)', () => {
    const waves = new WaveManager()
    const tomes = new TomeManager({ minorTomePool: MINOR_TOME_POOL, majorBoonPool: MAJOR_BOON_POOL })
    const lb = new LeaderboardManager()

    // 1. WaveManager: warm server clock at 200s resets backward to 0.5s
    waves.reset(200)
    waves.nextWaveTime = 204
    waves.armedZombies.set(999, 201.5)
    waves.handleClockBackstep(200, 0.5)
    assert.ok(waves.nextWaveTime >= 1.5 && waves.nextWaveTime <= 16.5)
    assert.ok((waves.armedZombies.get(999) ?? 0) >= 0.5)

    // 2. TomeManager: setting cache populated at t=200s refreshes immediately when clock drops to 0.5s
    mockSettings.set('tome_scaling', '0.10')
    assert.equal(tomes.getGrowthRate(200), 0.1)
    mockSettings.set('tome_scaling', '0.15')
    assert.equal(tomes.getGrowthRate(200.5), 0.1) // still within 2s forward window
    assert.equal(tomes.getGrowthRate(0.5), 0.15) // backstep invalidates cache immediately
    tomes.invalidateSettingCache()
    mockSettings.set('tome_scaling', '0.06')
    assert.equal(tomes.getGrowthRate(0.6), 0.06)

    // 3. LeaderboardManager: snapshot cached at t=200s refreshes on clock drop to 0.5s
    mockBoardPages.clear()
    mockBoardPages.set(`${BOARD_HIGHEST_WAVE}:allTime`, {
      rows: [{ rank: 1, name: 'Test', value: 12, tiebreak: -90, count: 1 }],
      total: 1,
      loading: false,
      player: undefined,
    })
    assert.equal(lb.getBoardSnapshot(defenderPlayer as never, 'allTime', 200)?.rows.length, 1)
    mockBoardPages.set(`${BOARD_HIGHEST_WAVE}:allTime`, {
      rows: [
        { rank: 1, name: 'Test', value: 12, tiebreak: -90, count: 1 },
        { rank: 2, name: 'Second', value: 8, tiebreak: -50, count: 1 },
      ],
      total: 2,
      loading: false,
      player: undefined,
    })
    assert.equal(lb.getBoardSnapshot(defenderPlayer as never, 'allTime', 200.5)?.rows.length, 1)
    assert.equal(lb.getBoardSnapshot(defenderPlayer as never, 'allTime', 0.5)?.rows.length, 2)
    mockBoardPages.clear()
  })

  it('captures reportScore() host acceptance state across checkpoints, /restarttd, idle reset, and handoff (v0.7.5)', () => {
    reportedScores.length = 0
    mockHost.reportScoreResult = true

    const lb = new LeaderboardManager()
    assert.equal(lb.lastReportAccepted, undefined)
    assert.equal(lb.acceptedReportsCount, 0)

    // When host rejects/has no `scores` service (`reportScore` returns false), surface false without incrementing acceptedReportsCount
    mockHost.reportScoreResult = false
    assert.equal(lb.checkpointPlayer(defenderPlayer as never, 2, 12), true)
    assert.equal(lb.lastReportAccepted, false)
    assert.equal(lb.acceptedReportsCount, 0)

    // When host accepts `scores` RPC (`reportScore` returns true), update lastReportAccepted=true & increment acceptedReportsCount
    mockHost.reportScoreResult = true
    assert.equal(lb.checkpointPlayer(defenderPlayer as never, 3, 25), true)
    assert.equal(lb.lastReportAccepted, true)
    assert.equal(lb.acceptedReportsCount, 1)

    // `/restarttd` (`startNewRun`) starts a new runId while preserving session host acceptance diagnostics
    const checkpointBeforeRestart = lb.exportCheckpointState()
    assert.equal(checkpointBeforeRestart.lastReportAccepted, true)
    assert.equal(checkpointBeforeRestart.acceptedReportsCount, 1)

    lb.startNewRun()
    assert.equal(lb.lastReportAccepted, true)
    assert.equal(lb.acceptedReportsCount, 1)

    // Serialize -> Deserialize TdHandoffState -> LeaderboardManager.restore preserves host acceptance status
    const rawHandoff = serializeTdHandoff({
      version: 1,
      wave: 3,
      nextWaveTime: 45,
      matchState: 'active',
      guardianUpgradeLevel: 0,
      guardianBonusMaxHp: 0,
      scaledCreeps: [],
      rewardedCreeps: [],
      playerTomes: {},
      playerKills: { '0': 25 },
      runId: lb.runId,
      runRankedEligible: true,
      runSubmittedSlots: [0],
      runReportedBestBySlot: checkpointBeforeRestart.reportedBestBySlot,
      runReportedKillsBySlot: checkpointBeforeRestart.reportedKillsBySlot,
      runReportSeq: checkpointBeforeRestart.reportSeq,
      runLastReportAccepted: checkpointBeforeRestart.lastReportAccepted,
      runAcceptedReportsCount: checkpointBeforeRestart.acceptedReportsCount,
    })
    const parsedHandoff = deserializeTdHandoff(rawHandoff)
    assert.equal(parsedHandoff?.runLastReportAccepted, true)
    assert.equal(parsedHandoff?.runAcceptedReportsCount, 1)

    const restoredLb = new LeaderboardManager()
    restoredLb.restore(
      parsedHandoff?.runId,
      parsedHandoff?.runRankedEligible,
      parsedHandoff?.runDisqualifyReason,
      parsedHandoff?.runSubmittedSlots,
      {
        reportedBestBySlot: parsedHandoff?.runReportedBestBySlot,
        reportedKillsBySlot: parsedHandoff?.runReportedKillsBySlot,
        reportSeq: parsedHandoff?.runReportSeq,
        lastReportAccepted: parsedHandoff?.runLastReportAccepted,
        acceptedReportsCount: parsedHandoff?.runAcceptedReportsCount,
      },
    )
    assert.equal(restoredLb.lastReportAccepted, true)
    assert.equal(restoredLb.acceptedReportsCount, 1)

    // Fresh world / hosted idle reset clears session diagnostics cleanly
    restoredLb.resetSessionDiagnostics()
    assert.equal(restoredLb.lastReportAccepted, undefined)
    assert.equal(restoredLb.acceptedReportsCount, 0)
    assert.equal(restoredLb.sessionBestBySlot.size, 0)

    mockHost.reportScoreResult = true
  })
})

describe('Tier 5 & Tier 6 — TD CVars, Stage Spawns, Fortify & Run Handoff', () => {
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

  it('locks fixed 5s respawn timer & 12 co-op player slots in TD_SERVER_CVARS (#25, #29)', () => {
    const cvarMap = new Map<string, string | number>(TD_SERVER_CVARS)
    assert.equal(cvarMap.get('citadel_player_override_spawn_time'), HERO_RESPAWN_TIME_SECONDS)
    assert.equal(cvarMap.get('citadel_player_spawn_time_max_respawn_time'), HERO_RESPAWN_TIME_SECONDS)
    assert.equal(HERO_RESPAWN_TIME_SECONDS, 5)
    assert.equal(cvarMap.get('sv_visiblemaxplayers'), MAX_COOP_DEFENDER_PLAYERS)
    assert.equal(cvarMap.get('citadel_team_size'), MAX_COOP_DEFENDER_PLAYERS)
    assert.equal(cvarMap.get('citadel_spawn_combine_only'), 1)
    assert.equal(MAX_COOP_DEFENDER_PLAYERS, 12)
  })

  it('evaluates leaderboard run eligibility and round-trips run state through TdHandoffState', () => {
    assert.deepEqual(
      evaluateLeaderboardSubmission({
        wave: 24,
        kills: 512,
        rankedEligible: true,
        isProbeMode: false,
        alreadySubmitted: false,
        minWave: 1,
      }),
      { shouldSubmit: true, waveScore: 24, tiebreak: -512, creepsScore: 512 },
    )
    assert.deepEqual(
      evaluateLeaderboardSubmission({
        wave: 24,
        kills: 512,
        rankedEligible: false,
        isProbeMode: false,
        alreadySubmitted: false,
      }),
      { shouldSubmit: false, reason: 'unranked' },
    )
    assert.deepEqual(
      evaluateLeaderboardSubmission({
        wave: 1,
        kills: 20,
        rankedEligible: true,
        isProbeMode: false,
        alreadySubmitted: false,
        minWave: 2,
      }),
      { shouldSubmit: false, reason: 'below_min_wave' },
    )
    assert.deepEqual(
      evaluateLeaderboardSubmission({
        wave: 24,
        kills: 512,
        rankedEligible: true,
        isProbeMode: true,
        alreadySubmitted: false,
      }),
      { shouldSubmit: false, reason: 'probe' },
    )

    const raw = serializeTdHandoff({
      version: 1,
      wave: 14,
      nextWaveTime: 180,
      matchState: 'active',
      guardianUpgradeLevel: 2,
      guardianBonusMaxHp: 2000,
      scaledCreeps: [101],
      rewardedCreeps: [101],
      playerTomes: {},
      playerKills: { '0': 120 },
      runId: 'td-test-99',
      runRankedEligible: false,
      runDisqualifyReason: '/souls',
      runSubmittedSlots: [0],
    })
    const restored = deserializeTdHandoff(raw)
    assert.equal(restored?.runId, 'td-test-99')
    assert.equal(restored?.runRankedEligible, false)
    assert.equal(restored?.runDisqualifyReason, '/souls')
    assert.deepEqual(restored?.runSubmittedSlots, [0])
  })

  it('maps Guardian fortify levels onto expected C++ entity modifier sets', () => {
    assert.deepEqual(getStructureFortifyEntityModifiers(0), [])
    assert.deepEqual(getStructureFortifyEntityModifiers(1), [
      FIRE_RATE_ENTITY_MODIFIERS[0].modifier,
      FIRE_RATE_ENTITY_MODIFIERS[1].modifier,
    ])
    const lv2 = getStructureFortifyEntityModifiers(2)
    assert.ok(lv2.includes(STRUCTURE_CDR_ENTITY_MODIFIER))
    assert.equal(
      getStructureFortifyEntityModifiers(12).length,
      FIRE_RATE_ENTITY_MODIFIERS.length + 1,
    )
  })
})
