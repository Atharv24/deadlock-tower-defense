import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  advanceBossWaypointIndex,
  type BossButtonMask,
  chooseBossAbilityPress,
  computeAimAngles,
  computeBossAbilityUpgradeMask,
  createBossAiState,
  planBotDriveStep,
  selectBossTarget,
} from '@components/bot_ai'

const TEST_BUTTONS: BossButtonMask = {
  attack: 1n << 0n,
  jump: 1n << 1n,
  crouch: 1n << 2n,
  dash: 1n << 3n,
  altFire: 1n << 5n,
  reload: 1n << 6n,
  melee: 1n << 7n,
  ability1: 1n << 8n,
  ability2: 1n << 9n,
  ability3: 1n << 10n,
  ultimate: 1n << 11n,
}

describe('Bot AI Component — Generic Waypoint, Targeting, Abilities & Drive Step', () => {
  it('computes ability upgrade bitmasks monotonically across Boss tiers 1..5', () => {
    assert.equal(computeBossAbilityUpgradeMask(1), 0b0011)
    assert.equal(computeBossAbilityUpgradeMask(2), 0b0111)
    assert.equal(computeBossAbilityUpgradeMask(3), 0b1111)
    assert.equal(computeBossAbilityUpgradeMask(5), 0b1111)
  })

  it('marches custom arena waypoints cleanly without map-specific corridor constraints', () => {
    const customRoutes: readonly [
      readonly { readonly x: number; readonly y: number; readonly z: number }[],
      readonly { readonly x: number; readonly y: number; readonly z: number }[],
    ] = [
      [
        { x: 500, y: 500, z: 100 },
        { x: 900, y: 500, z: 100 },
      ],
      [
        { x: 500, y: 500, z: 100 },
        { x: 900, y: 500, z: 100 },
      ],
    ]
    const state = createBossAiState({ x: 300, y: 500, z: 100 }, 0, customRoutes)
    const plan = planBotDriveStep({
      hero: 'hero_atlas',
      bossPos: { x: 300, y: 500, z: 100 },
      bossEyePos: { x: 300, y: 500, z: 176 },
      bossHealth: 3000,
      bossMaxHealth: 3000,
      abilities: [],
      heroes: [],
      state,
      now: 1.0,
      buttons: TEST_BUTTONS,
      waypoints: customRoutes[0],
    })
    assert.equal(plan.mode, 'march')
    assert.ok(plan.drive.forward > 0.8)
    assert.ok(Math.abs(plan.drive.facing.yaw) < 15)
  })

  it('prioritizes heroes with LoS inside aggro range and chooses channeled vs instant abilities cleanly', () => {
    const state = createBossAiState({ x: 0, y: 0, z: 0 }, 0)
    const target = selectBossTarget(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 64 },
      [
        {
          entity: 20,
          position: { x: 250, y: 0, z: 0 },
          velocity: { x: 0, y: 0, z: 0 },
          health: 400,
          maxHealth: 800,
          hasLineOfSight: true,
        },
      ],
      {
        entity: 700,
        position: { x: 0, y: -1500, z: 0 },
        alive: true,
      },
      state,
      1.0,
    )
    assert.equal(target?.kind, 'hero')
    assert.equal(target?.entity, 20)

    const abilityChoice = chooseBossAbilityPress(
      'hero_atlas',
      [
        {
          name: 'bull_charge',
          slot: 1,
          entity: 1,
          upgrades: 0b1111,
          charges: 1,
          cooldownEnd: 0,
          id: 2,
          state: 0,
          cooldownStart: 0,
          rechargeStart: 0,
          rechargeEnd: 0,
          imbues: [],
        },
      ],
      target!,
      { x: 0, y: 0, z: 0 },
      1.0,
      2.0,
      TEST_BUTTONS,
    )
    assert.equal(abilityChoice?.slot, 1)
    assert.equal(abilityChoice?.pressed, TEST_BUTTONS.ability2)
  })

  it('honors optional BotCorridorConfig anti-kite bounds and stuck teleport recovery', () => {
    const wp = [
      { x: -192, y: 496, z: 272 },
      { x: -112, y: -1180, z: 384 },
    ]
    const state = createBossAiState({ x: -190, y: 900, z: 388 }, 0)
    const kitePlan = planBotDriveStep({
      hero: 'hero_forge',
      bossPos: { x: -190, y: 900, z: 388 },
      bossEyePos: { x: -190, y: 900, z: 480 },
      bossHealth: 5000,
      bossMaxHealth: 5000,
      abilities: [],
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
      waypoints: wp,
      corridor: {
        northCorridorMinY: -2200,
        northCorridorMaxAbsX: 380,
        antiKiteMinY: -1050,
        upperPitBiasMinY: -950,
        courtyardMaxY: -6000,
      },
    })
    assert.equal(kitePlan.mode, 'hero_combat')
    assert.ok(kitePlan.drive.forward < -0.5)
    assert.equal(advanceBossWaypointIndex({ x: -192, y: 480, z: 272 }, wp, 0), 1)
    assert.ok(Math.abs(computeAimAngles({ x: 0, y: 0, z: 0 }, { x: 0, y: 100, z: 0 }).yaw - 90) < 1)
  })
})
