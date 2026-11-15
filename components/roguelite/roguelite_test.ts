import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'

import { formatTomeCountDisplay } from '@base'
import {
  CLIP_SIZE_ENTITY_MODIFIERS,
  FIRE_RATE_ENTITY_MODIFIERS,
  HERO_SPIRIT_ENTITY_MODIFIER,
} from '@engine/entity_modifiers'
import {
  computeResidualWeaponDamageMult,
  computeTomeWaveMultiplier,
  DEFAULT_TOME_GROWTH_PER_WAVE,
  evaluateCreepLastHit,
  formatScaledMajorBoonSubtitle,
  formatScaledMinorTomeDescription,
  getHeroTomeEntityModifierPlan,
  type MajorBoonDef,
  MAX_TOME_GROWTH_PER_WAVE,
  MAX_TOME_WAVE_MULTIPLIER,
  type MinorTomeDef,
  parseTomeGrowthPerWave,
  pickThreeMajorBoons,
  TOME_DROP_CHANCE,
  TomeManager,
} from '@components/roguelite'
import { mockHost, resetMockHost } from '@testing/mock_modlock_host'

const TEST_MINOR_POOL: readonly MinorTomeDef[] = [
  {
    id: 'weapon',
    name: 'Tome of Arms',
    shortLabel: 'Weapon',
    description: '+10% Weapon Damage',
    kind: 'modifier',
    modifier: 'td_tome_weapon',
    color: '#fb923c',
  },
  {
    id: 'firerate',
    name: 'Tome of Alacrity',
    shortLabel: 'Fire Rate',
    description: '+10% Fire Rate & Ammo',
    kind: 'modifier',
    modifier: 'td_tome_firerate',
    color: '#facc15',
  },
  {
    id: 'spirit',
    name: 'Tome of Sorcery',
    shortLabel: 'Spirit',
    description: '+16 Spirit Power',
    kind: 'modifier',
    modifier: 'td_tome_spirit',
    color: '#c084fc',
  },
  {
    id: 'cooldown',
    name: 'Tome of Swiftness',
    shortLabel: 'Haste',
    description: '-10% Cooldowns',
    kind: 'modifier',
    modifier: 'td_tome_haste',
    color: '#38bdf8',
  },
  {
    id: 'souls',
    name: 'Tome of Greed',
    shortLabel: 'Soul Cache',
    description: '+83 Bonus Souls',
    kind: 'souls',
    amount: 83,
    color: '#fbbf24',
  },
]

const TEST_BOON_POOL: readonly MajorBoonDef[] = [
  {
    id: 'boon_war',
    title: 'Avatar of War',
    subtitle: '+40% Weapon Damage & +40% Fire Rate',
    accent: '#fb923c',
    modifiers: [
      { name: 'td_tome_weapon', stacks: 4 },
      { name: 'td_tome_firerate', stacks: 4 },
    ],
  },
  {
    id: 'boon_fortify',
    title: 'Sapphire Bastion',
    subtitle: '+2,500 Structure HP & +1 Fortify Level',
    accent: '#60a5fa',
    modifiers: [],
    guardianHeal: 2500,
    guardianUpgrade: true,
  },
  {
    id: 'archmage',
    title: 'Archmage Surge',
    subtitle: '+64 Spirit & +1 AP',
    accent: '#c084fc',
    modifiers: [{ name: 'td_tome_spirit', stacks: 4 }],
    bonusAp: 1,
  },
  {
    id: 'boon_tycoon',
    title: 'Hidden King Treasury',
    subtitle: '+600 Souls',
    accent: '#fbbf24',
    modifiers: [],
    bonusSouls: 600,
  },
]

describe('Roguelite Component — Tome Math, Boons & TomeManager', () => {
  beforeEach(() => {
    resetMockHost()
  })

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
      0.0,
      TEST_MINOR_POOL,
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
      0.0,
      TEST_MINOR_POOL,
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
      TEST_MINOR_POOL,
    )
    assert.equal(firstPellet.granted, true)
    assert.equal(firstPellet.reason, 'granted')
    assert.equal(firstPellet.tome?.id, TEST_MINOR_POOL[0].id)

    // Pellet 2 arrives on the same tick for creep 501 -> must be rejected as duplicate_kill
    const secondPellet = evaluateCreepLastHit(
      { victim: 501, attacker: 10, healthBefore: 40, healthLost: 40 },
      validCreeps,
      pawnToSlot,
      guardians,
      rewarded,
      0.01,
      0.0,
      TEST_MINOR_POOL,
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
      0.0,
      TEST_MINOR_POOL,
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
      TEST_MINOR_POOL,
    )
    assert.equal(hit.isPlayerKill, true)
    assert.equal(hit.granted, true)
    assert.equal(hit.tome?.id, TEST_MINOR_POOL[TEST_MINOR_POOL.length - 1].id)
  })

  it('always picks 3 distinct Major Boons from the injected pool', () => {
    for (let wave = 5; wave <= 60; wave += 5) {
      for (let slot = 0; slot < 4; slot++) {
        const picked = pickThreeMajorBoons(wave, slot, TEST_BOON_POOL)
        assert.equal(picked.length, 3)
        assert.equal(new Set(picked.map((b) => b.id)).size, 3)
      }
    }
  })

  it('computes pure Tome wave multipliers and formats scaled Minor/Major labels (#30)', () => {
    assert.equal(parseTomeGrowthPerWave(undefined), 0.06)
    assert.equal(parseTomeGrowthPerWave('0'), 0)
    assert.equal(parseTomeGrowthPerWave('0.10'), 0.1)
    assert.equal(parseTomeGrowthPerWave('10'), 0.1)
    assert.equal(computeTomeWaveMultiplier(1, 0.06), 1)
    assert.equal(computeTomeWaveMultiplier(21, 0.05), 2)
    assert.equal(computeTomeWaveMultiplier(43, 0.06), 3.52)
    assert.equal(formatTomeCountDisplay(3), '3')
    assert.equal(formatTomeCountDisplay(2.600001), '2.6')
    assert.ok(formatScaledMajorBoonSubtitle(TEST_BOON_POOL[2], 2).includes('+48 Spirit Power'))
    assert.ok(formatScaledMinorTomeDescription(TEST_MINOR_POOL[2], 2).includes('+16 Spirit Power'))
  })

  it('plans hero entity modifiers and residual weapon multipliers without double-counting fire rate', () => {
    const heroPlan = getHeroTomeEntityModifierPlan({
      weapon: 1,
      firerate: 1,
      spirit: 1,
    })
    assert.deepEqual(heroPlan, [
      FIRE_RATE_ENTITY_MODIFIERS[0].modifier,
      CLIP_SIZE_ENTITY_MODIFIERS[0].modifier,
      HERO_SPIRIT_ENTITY_MODIFIER,
    ])
    assert.equal(computeResidualWeaponDamageMult({ weapon: 3, firerate: 4, omni: 0 }), 1.3)
    assert.equal(computeResidualWeaponDamageMult({ weapon: 2, firerate: 5, omni: 2 }), 1.3)
  })

  it('scales Tomes with tome_scaling, fires custom Major Boon hooks, and trims cooldowns via onAbilityCast', () => {
    const { defenderPlayer, mockSettings } = mockHost
    const customBoonCalls: Array<{ boonId: string; mult: number; wave: number }> = []
    const tomes = new TomeManager({
      minorTomePool: TEST_MINOR_POOL,
      majorBoonPool: TEST_BOON_POOL,
      onCustomMajorBoon: ({ boon, mult, wave }) => {
        customBoonCalls.push({ boonId: boon.id, mult, wave })
      },
    })

    mockSettings.set('tome_scaling', '0.10')
    tomes.applyMinorTome(defenderPlayer as never, TEST_MINOR_POOL[4], 10)
    // Wave 10 at +10%/wave = 1.90x * 83 = 158
    assert.equal(defenderPlayer.souls, 1158)

    tomes.pendingBoonChoices.set(defenderPlayer.slot, [
      TEST_BOON_POOL[1],
      TEST_BOON_POOL[0],
      TEST_BOON_POOL[2],
    ])
    tomes.pendingBoonWave.set(defenderPlayer.slot, 10)
    const picked = tomes.chooseMajorBoon(defenderPlayer as never, 0, undefined, 10)
    assert.equal(picked?.id, 'boon_fortify')
    assert.equal(customBoonCalls.length, 1)
    assert.equal(customBoonCalls[0].boonId, 'boon_fortify')
    assert.equal(customBoonCalls[0].mult, 1.9)

    // Cooldown trim via onAbilityCast after granting Haste Tome
    tomes.applyMinorTome(defenderPlayer as never, TEST_MINOR_POOL[3], 1)
    const abil = defenderPlayer.abilityList[0]
    abil.cooldownEnd = 30
    abil.cooldownStart = 10
    tomes.onAbilityCast({ player: defenderPlayer as never, ability: 'citadel_ability_primary', slot: 0 } as never, 10.0)
    assert.ok(abil.cooldownEnd < 30, 'Haste Tome should trim ability cooldownEnd')
  })
})
