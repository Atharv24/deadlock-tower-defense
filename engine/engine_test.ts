import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'

import {
  ALL_STANDARD_ENGINE_DEFINITIONS,
  CLIP_SIZE_ENTITY_MODIFIERS,
  decomposeBinaryEntityModifiers,
  evaluateDefenderRespawnDue,
  evaluateLegendaryPurchase,
  FIRE_RATE_ENTITY_MODIFIERS,
  formatItemDisplayTitle,
  hasNativeLaneGuardianSpawner,
  HERO_RESPAWN_TIME_SECONDS,
  HERO_SPIRIT_ENTITY_MODIFIER,
  isMidtownOutOfBoundsOrBelowMap,
  ITEM_DISPLAY_TITLES,
  LEGENDARY_ITEM_COST_SOULS,
  purgeFriendlyAndSideLaneTroopers,
  removeStaticNeutralCamps,
  resolveSafeGroundOrigin,
  SHOP_TRIGGER_SPAWNFLAGS,
  ShopZoneController,
  STRUCTURE_CDR_ENTITY_MODIFIER,
  suppressNonEnemyCenterTrooperSpawners,
  syncEntityModifierSet,
  unlockTeamFlexSlots,
} from '@engine'
import { mockHost, resetMockHost } from '@testing/mock_modlock_host'

describe('Engine Layer — Definitions, Modifiers, ShopZone, Respawn & dl_midtown', () => {
  beforeEach(() => {
    resetMockHost()
  })

  it('exposes all 13 canonical stock VData modifier definition overrides', () => {
    assert.equal(ALL_STANDARD_ENGINE_DEFINITIONS.length, 13)
    const entries = ALL_STANDARD_ENGINE_DEFINITIONS.map((d) => d.entry)
    assert.ok(entries.includes('upgrade_colossus'))
    assert.ok(entries.includes('modifier_hero_testing_fast_movespeed'))
    assert.ok(entries.includes('upgrade_timeless_emblem'))
    assert.ok(entries.includes('upgrade_tech_cleave'))
  })

  it('formats official Tier-5 Legendary item titles and validates Soul/ownership rules (#26)', () => {
    assert.equal(formatItemDisplayTitle('upgrade_celestial_guidance'), 'Celestial Blessing')
    assert.equal(formatItemDisplayTitle('upgrade_eldritch_shot'), 'Haunting Shot')
    assert.equal(formatItemDisplayTitle('upgrade_icarus_wings'), 'Seraphim Wings')
    assert.equal(formatItemDisplayTitle('upgrade_infinite_rounds'), 'Infinite Rounds')
    assert.equal(formatItemDisplayTitle('upgrade_mystical_piano'), 'Mystical Piano')
    assert.equal(formatItemDisplayTitle('upgrade_nullification_aura'), 'Nullification Burst')
    assert.equal(formatItemDisplayTitle('upgrade_omnicharge_pendant'), 'Omnicharge Signet')
    assert.equal(formatItemDisplayTitle('upgrade_prism_blast'), 'Prism Blast')
    assert.equal(formatItemDisplayTitle('upgrade_shrink_ray'), 'Shrink Ray')
    assert.equal(Object.keys(ITEM_DISPLAY_TITLES).length, 9)

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

  it('triggers respawn at exactly 5s, reclamps on clock backstep, and detects below-map coordinates', () => {
    const t0 = evaluateDefenderRespawnDue({
      alive: false,
      hasHero: true,
      nowSeconds: 100,
      diedAtSeconds: undefined,
      lastRespawnAttemptAt: undefined,
    })
    assert.equal(t0.shouldCallRespawn, false)
    assert.equal(t0.nextDiedAtSeconds, 100)

    const t4 = evaluateDefenderRespawnDue({
      alive: false,
      hasHero: true,
      nowSeconds: 104.9,
      diedAtSeconds: t0.nextDiedAtSeconds,
      lastRespawnAttemptAt: t0.nextLastRespawnAttemptAt,
    })
    assert.equal(t4.shouldCallRespawn, false)

    const t5 = evaluateDefenderRespawnDue({
      alive: false,
      hasHero: true,
      nowSeconds: 100 + HERO_RESPAWN_TIME_SECONDS,
      diedAtSeconds: t0.nextDiedAtSeconds,
      lastRespawnAttemptAt: t0.nextLastRespawnAttemptAt,
    })
    assert.equal(t5.shouldCallRespawn, true)

    const backstepReset = evaluateDefenderRespawnDue({
      alive: false,
      hasHero: true,
      nowSeconds: 1.0,
      diedAtSeconds: 180.0,
      lastRespawnAttemptAt: 180.0,
    })
    assert.equal(backstepReset.nextDiedAtSeconds, 1.0)
    assert.equal(backstepReset.shouldCallRespawn, false)

    assert.equal(isMidtownOutOfBoundsOrBelowMap({ x: 0, y: -1950, z: 396 }), false)
    assert.equal(isMidtownOutOfBoundsOrBelowMap({ x: 0, y: -1950, z: 120 }), true)
    assert.equal(isMidtownOutOfBoundsOrBelowMap({ x: -1280, y: -6450, z: 480 }), true)
    assert.equal(isMidtownOutOfBoundsOrBelowMap({ x: -1280, y: -9600, z: 1050 }), true)
    assert.equal(isMidtownOutOfBoundsOrBelowMap({ x: -1280, y: -7200, z: 654 }), false)
  })

  it('decomposes binary entity modifier tiers and applies minimal differential diffs via syncEntityModifierSet', () => {
    assert.deepEqual(
      decomposeBinaryEntityModifiers(0, FIRE_RATE_ENTITY_MODIFIERS),
      [],
    )
    assert.deepEqual(
      decomposeBinaryEntityModifiers(200, CLIP_SIZE_ENTITY_MODIFIERS),
      CLIP_SIZE_ENTITY_MODIFIERS.map((t) => t.modifier),
    )
    assert.ok(STRUCTURE_CDR_ENTITY_MODIFIER.includes('upgrade_timeless_emblem'))
    assert.ok(HERO_SPIRIT_ENTITY_MODIFIER.includes('upgrade_tech_cleave'))

    const calls: Array<{ entity: number; mod: string; active: boolean }> = []
    const store = new Map<number, Set<string>>()
    const hold = (entity: number, mod: string, active = true) => {
      calls.push({ entity, mod, active })
      return true
    }
    assert.equal(syncEntityModifierSet(10, [], store, hold), false)
    assert.equal(calls.length, 0)
    assert.equal(syncEntityModifierSet(10, ['m_a', 'm_b'], store, hold), true)
    assert.equal(calls.length, 2)
    assert.equal(syncEntityModifierSet(10, ['m_a', 'm_b'], store, hold), false)
    assert.equal(calls.length, 2)
    assert.equal(syncEntityModifierSet(10, ['m_a', 'm_c'], store, hold), true)
    assert.deepEqual(calls.slice(2), [
      { entity: 10, mod: 'm_b', active: false },
      { entity: 10, mod: 'm_c', active: true },
    ])
  })

  it('resolves safe ground spawn origins above floor hits and falls back cleanly', () => {
    mockHost.groundHandler = (pt) => ({ x: pt.x, y: pt.y, z: 500 })
    assert.deepEqual(resolveSafeGroundOrigin({ x: 0, y: -1950, z: 396 }), {
      x: 0,
      y: -1950,
      z: 512,
    })

    mockHost.groundHandler = () => undefined
    assert.deepEqual(resolveSafeGroundOrigin({ x: 0, y: -1950, z: 396 }), {
      x: 0,
      y: -1950,
      z: 396,
    })
  })

  it('grants Buy Anywhere via ShopZoneController spheres and removes them cleanly on cleanup()', () => {
    assert.equal(SHOP_TRIGGER_SPAWNFLAGS, 0x10000043)

    const shopZones = new ShopZoneController(2)
    const pawn = mockHost.defenderPlayer.pawn()!
    const ok = shopZones.ensureShopAccess(pawn.entity, { x: 0, y: -1950, z: 396 })
    assert.equal(ok, true)
    assert.equal(mockHost.pawnInShopStore.get(pawn.entity), true)
    assert.ok(mockHost.createdEntities.some((c) => c.designerName === 'trigger_item_shop'))

    // Steady-state calls inside arena shop sphere execute 0 entityPosition/moveEntity calls
    mockHost.resetHostCallStats()
    assert.equal(shopZones.ensureShopAccess(pawn.entity, { x: 120, y: -1800, z: 396 }), true)
    assert.equal(shopZones.ensureShopAccess(pawn.entity, { x: 450, y: -1600, z: 396 }), true)
    assert.equal(mockHost.hostCallStats.entityPosition, 0)
    assert.equal(mockHost.hostCallStats.moveEntity, 0)
    assert.equal(mockHost.hostCallStats.readField, 2)

    shopZones.cleanup()
    assert.equal(mockHost.pawnInShopStore.get(pawn.entity), false)
  })

  it('configures dl_midtown spawners, purges off-lane troopers, unlocks flex slots, and detects lane spawners', () => {
    removeStaticNeutralCamps()
    const suppressed = suppressNonEnemyCenterTrooperSpawners(2)
    assert.ok(suppressed >= 1)
    assert.equal(mockHost.spawnerLaneStore.get(14291), 4)
    assert.equal(mockHost.spawnerDisableZipStore.get(14291), true)

    unlockTeamFlexSlots(2, 15)
    assert.equal(mockHost.teamFlexSlotsStore.get(710), 15)

    mockHost.npcStore.set(1501, {
      health: 1,
      maxHealth: 1,
      team: 2,
      position: { x: 0, y: -2100, z: 384 },
    })
    mockHost.trooperIds.add(1501)
    const purged = purgeFriendlyAndSideLaneTroopers(2)
    assert.ok(purged >= 1)

    assert.equal(hasNativeLaneGuardianSpawner(2, 4), false)
    mockHost.spawnerBossLaneStore.set(14020, { team: 2, lane: 4, reinforcementsOnly: false })
    assert.equal(hasNativeLaneGuardianSpawner(2, 4), true)
  })
})
