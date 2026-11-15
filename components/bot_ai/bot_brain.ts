import type { Ability, DriveCommand, Vector } from 'modlock'
import {
  clamp,
  computeAimAngles,
  distance3D,
  flatDistance2D,
  worldMoveToDriveAxes,
} from '@base/math'

export { computeAimAngles, distance3D, flatDistance2D, worldMoveToDriveAxes }

export interface BossButtonMask {
  readonly attack: bigint
  readonly jump: bigint
  readonly crouch: bigint
  readonly dash: bigint
  readonly altFire: bigint
  readonly reload: bigint
  readonly melee: bigint
  readonly ability1: bigint
  readonly ability2: bigint
  readonly ability3: bigint
  readonly ultimate: bigint
}

export interface BossHeroCandidate {
  readonly entity: number
  readonly position: Vector
  readonly velocity: Vector
  readonly health: number
  readonly maxHealth: number
  readonly hasLineOfSight: boolean
  readonly aimHeightOffset?: number
}

export interface BossGuardianCandidate {
  readonly entity: number
  readonly position: Vector
  readonly alive: boolean
  readonly objectiveKind?: string
  readonly siegeRange?: number
  readonly minStandoff?: number
  readonly aimOffsetZ?: number
}

export interface BossCombatTarget {
  readonly kind: 'hero' | 'guardian'
  readonly entity: number
  readonly position: Vector
  readonly aimPoint: Vector
  readonly distance2D: number
  readonly distance3D: number
  readonly healthRatio: number
}

export type BossBehaviorMode = 'march' | 'hero_combat' | 'guardian_siege'

export interface BossAiState {
  readonly routeIndex: 0 | 1
  waypointIndex: number
  lastObjectiveKind?: string
  lastCheckPos: Vector
  lastCheckAt: number
  stuckCount: number
  nextDashAt: number
  nextMeleeAt: number
  nextAbilityAt: number
  channelLockUntil: number
  slamTapAt: number
  pendingConfirmAt: number
  pendingVerifySlot: number
  pendingVerifyAt: number
  pendingVerifyChargesBefore: number
  groundAimUntil: number
  releasePrimaryUntil: number
  slotBackoffUntil: [number, number, number, number]
  provokedHeroEntity: number
  provokedUntil: number
  heroSeenUntil: Record<number, number>
}

export interface BossDrivePlan {
  readonly mode: BossBehaviorMode
  readonly target?: BossCombatTarget
  readonly drive: DriveCommand
  readonly unstuckTeleport?: Vector
}

export interface AbilityDecision {
  readonly slot: number
  readonly pressed: bigint
  readonly channelDuration: number
  readonly slamDelay?: number
  readonly needsConfirmClick?: boolean
  readonly groundAim?: boolean
}

export interface BotCorridorConfig {
  readonly northCorridorMinY?: number
  readonly northCorridorMaxAbsX?: number
  readonly antiKiteMinY?: number
  readonly upperPitBiasMinY?: number
  readonly pedestalGuardObjectiveKind?: string
  readonly pedestalGuardMaxY?: number
  readonly courtyardMaxY?: number
  readonly defaultMinStandoff?: number
  readonly defaultSiegeRange?: number
}

export interface BotStepInput {
  readonly hero: string
  readonly bossPos: Vector
  readonly bossEyePos: Vector
  readonly bossHealth: number
  readonly bossMaxHealth: number
  readonly abilities: readonly Ability[]
  readonly heroes: readonly BossHeroCandidate[]
  readonly guardian?: BossGuardianCandidate
  readonly state: BossAiState
  readonly now: number
  readonly buttons: BossButtonMask
  readonly waypoints: readonly Vector[]
  readonly corridor?: BotCorridorConfig
}

const DEFAULT_SIEGE_RANGE = 880
const DEFAULT_MIN_STANDOFF = 485

/**
 * Computes `AbilityOptions.upgrades` bitmask for Boss tiers (`1..5`):
 * bit `0` (`0b0001`) unlocks the ability, and bits `1..3` unlock T1..T3 upgrades.
 */
export function computeBossAbilityUpgradeMask(tier: number): number {
  if (tier <= 1) return 0b0011
  if (tier === 2) return 0b0111
  return 0b1111
}

/** Creates initial AI tracking state for a newly spawned (or hot-reload adopted) Hero Bot. */
export function createBossAiState(
  spawnOrigin: Vector,
  now = 0,
  routes?: readonly [readonly Vector[], readonly Vector[]],
): BossAiState {
  const routeIndex: 0 | 1 = spawnOrigin.x <= 0 ? 0 : 1
  const waypoints = routes ? routes[routeIndex] : undefined
  let initialIdx = 0
  if (waypoints) {
    for (let i = 0; i < waypoints.length - 1; i++) {
      if (spawnOrigin.y < waypoints[i].y - 80) {
        initialIdx = i + 1
      }
    }
  }
  return {
    routeIndex,
    waypointIndex: initialIdx,
    lastCheckPos: { x: spawnOrigin.x, y: spawnOrigin.y, z: spawnOrigin.z },
    lastCheckAt: now,
    stuckCount: 0,
    nextDashAt: now + 1.4,
    nextMeleeAt: now,
    nextAbilityAt: now + 0.25,
    channelLockUntil: 0,
    slamTapAt: 0,
    pendingConfirmAt: 0,
    pendingVerifySlot: -1,
    pendingVerifyAt: 0,
    pendingVerifyChargesBefore: 0,
    groundAimUntil: 0,
    releasePrimaryUntil: 0,
    slotBackoffUntil: [0, 0, 0, 0],
    provokedHeroEntity: 0,
    provokedUntil: 0,
    heroSeenUntil: {},
  }
}

/**
 * Advances `currentIndex` along `waypoints` whenever the Bot reaches `165u` horizontally
 * (`220u` inside courtyard zones when `courtyardMaxY` is reached), OR has progressed more
 * than `80u` south past a North->South lane waypoint outside the courtyard.
 */
export function advanceBossWaypointIndex(
  pos: Vector,
  waypoints: readonly Vector[],
  currentIndex: number,
  courtyardMaxY = -6000,
): number {
  if (waypoints.length === 0) {
    return 0
  }
  let idx = clamp(currentIndex, 0, waypoints.length - 1)
  while (idx < waypoints.length - 1) {
    const wp = waypoints[idx]
    const inBaseCourtyard = wp.y <= courtyardMaxY
    const reachRadius = inBaseCourtyard ? 220 : 165
    if (
      flatDistance2D(pos, wp) <= reachRadius ||
      (!inBaseCourtyard && pos.y < wp.y - 80)
    ) {
      idx++
    } else {
      break
    }
  }
  return idx
}

function buildHeroCombatTarget(
  bossPos: Vector,
  bossEyePos: Vector,
  hero: BossHeroCandidate,
): BossCombatTarget {
  const aimOffsetZ = hero.aimHeightOffset ?? 54
  const d2 = flatDistance2D(bossPos, hero.position)
  const d3 = distance3D(bossEyePos, {
    x: hero.position.x,
    y: hero.position.y,
    z: hero.position.z + aimOffsetZ,
  })
  const leadSec = clamp(d3 / 3200, 0, 0.16)
  const aimPoint: Vector = {
    x: hero.position.x + hero.velocity.x * leadSec,
    y: hero.position.y + hero.velocity.y * leadSec,
    z: hero.position.z + aimOffsetZ,
  }
  return {
    kind: 'hero',
    entity: hero.entity,
    position: hero.position,
    aimPoint,
    distance2D: d2,
    distance3D: d3,
    healthRatio: hero.maxHealth > 0 ? hero.health / hero.maxHealth : 1,
  }
}

function buildGuardianCombatTarget(
  bossPos: Vector,
  bossEyePos: Vector,
  guardian: BossGuardianCandidate,
): BossCombatTarget {
  const aimOffsetZ = guardian.aimOffsetZ ?? 125
  const aimPoint: Vector = {
    x: guardian.position.x,
    y: guardian.position.y,
    z: guardian.position.z + aimOffsetZ,
  }
  return {
    kind: 'guardian',
    entity: guardian.entity,
    position: guardian.position,
    aimPoint,
    distance2D: flatDistance2D(bossPos, guardian.position),
    distance3D: distance3D(bossEyePos, aimPoint),
    healthRatio: 1,
  }
}

/**
 * Selects the highest-priority combat target for a Hero Bot:
 * 1. Close Hero with LoS (`<= 780u`), even during structure siege.
 * 2. Provoked Hero attacker with LoS (`<= 1850u` marching, or `<= 1500u` during siege).
 * 3. Visible Hero in lane (`<= 1450u`) before structure siege.
 * 4. Active vulnerable structure objective once within `siegeRange`.
 * 5. Long-range visible Hero (`<= 1850u`) for opportunistic fire while marching.
 */
export function selectBossTarget(
  bossPos: Vector,
  bossEyePos: Vector,
  heroes: readonly BossHeroCandidate[],
  guardian: BossGuardianCandidate | undefined,
  state: Pick<BossAiState, 'provokedHeroEntity' | 'provokedUntil'>,
  now: number,
  defaultSiegeRange = DEFAULT_SIEGE_RANGE,
): BossCombatTarget | undefined {
  const visibleHeroes = heroes
    .filter((h) => h.health > 0 && h.hasLineOfSight)
    .sort((a, b) => flatDistance2D(bossPos, a.position) - flatDistance2D(bossPos, b.position))

  const siegeRange = guardian?.siegeRange ?? defaultSiegeRange
  const distToGuardian =
    guardian && guardian.alive ? flatDistance2D(bossPos, guardian.position) : Infinity
  const inGuardianSiegeZone = distToGuardian <= siegeRange

  const closest = visibleHeroes[0]
  if (closest && flatDistance2D(bossPos, closest.position) <= 780) {
    return buildHeroCombatTarget(bossPos, bossEyePos, closest)
  }

  if (state.provokedHeroEntity > 0 && now < state.provokedUntil) {
    const provoked = visibleHeroes.find((h) => h.entity === state.provokedHeroEntity)
    if (provoked) {
      const provokedDist = flatDistance2D(bossPos, provoked.position)
      const maxProvokedRange = inGuardianSiegeZone ? 1500 : 1850
      if (provokedDist <= maxProvokedRange) {
        return buildHeroCombatTarget(bossPos, bossEyePos, provoked)
      }
    }
  }

  if (!inGuardianSiegeZone && closest && flatDistance2D(bossPos, closest.position) <= 1450) {
    return buildHeroCombatTarget(bossPos, bossEyePos, closest)
  }

  if (guardian && guardian.alive && inGuardianSiegeZone) {
    return buildGuardianCombatTarget(bossPos, bossEyePos, guardian)
  }

  if (closest && flatDistance2D(bossPos, closest.position) <= 1850) {
    return buildHeroCombatTarget(bossPos, bossEyePos, closest)
  }

  return undefined
}

function getHeroPreferredRange(hero: string): { readonly min: number; readonly max: number } {
  switch (hero) {
    case 'hero_atlas':
    case 'hero_shiv':
      return { min: 190, max: 370 }
    default:
      return { min: 420, max: 670 }
  }
}

function isAbilityReady(
  abil: Ability | undefined,
  now: number,
  slotBackoffUntil?: readonly [number, number, number, number],
): abil is Ability {
  if (!abil) return false
  if ((abil.upgrades & 1) === 0) return false
  if (abil.cooldownEnd > now) return false
  if (abil.charges === 0 && abil.rechargeEnd > now) return false
  if (
    slotBackoffUntil &&
    abil.slot >= 0 &&
    abil.slot <= 3 &&
    slotBackoffUntil[abil.slot] > now
  ) {
    return false
  }
  return true
}

function slotToButton(slot: number, buttons: BossButtonMask): bigint {
  switch (slot) {
    case 0:
      return buttons.ability1
    case 1:
      return buttons.ability2
    case 2:
      return buttons.ability3
    case 3:
      return buttons.ultimate
    default:
      return 0n
  }
}

/**
 * Chooses responsive, combo-chaining hero abilities for all 6 Hero archetypes
 * (`hero_atlas`, `hero_warden`, `hero_bebop`, `hero_shiv`, `hero_chrono`, `hero_forge`),
 * with 2-tick Confirm-Cast rising edges and per-slot backoff recovery.
 */
export function chooseBossAbilityPress(
  hero: string,
  abilities: readonly Ability[],
  target: BossCombatTarget,
  bossPos: Vector,
  bossHealthRatio: number,
  now: number,
  buttons: BossButtonMask,
  slotBackoffUntil?: readonly [number, number, number, number],
): AbilityDecision | undefined {
  const bySlot = (slot: number) => abilities.find((a) => a.slot === slot)
  const s0 = bySlot(0)
  const s1 = bySlot(1)
  const s2 = bySlot(2)
  const s3 = bySlot(3)
  const dist = target.distance2D
  const isHero = target.kind === 'hero'
  const ready = (a: Ability | undefined) => isAbilityReady(a, now, slotBackoffUntil)

  switch (hero) {
    case 'hero_atlas': {
      if (dist >= 150 && dist <= 950 && ready(s3)) {
        return {
          slot: 3,
          pressed: buttons.ultimate,
          channelDuration: 1.75,
          slamDelay: 0.6,
        }
      }
      if (dist >= 130 && dist <= 850 && ready(s1)) {
        return { slot: 1, pressed: buttons.ability2, channelDuration: 1.35 }
      }
      if (dist <= 580 && ready(s0)) {
        return { slot: 0, pressed: buttons.ability1, channelDuration: 0 }
      }
      return undefined
    }

    case 'hero_warden': {
      if (dist <= 1550 && ready(s1)) {
        return { slot: 1, pressed: buttons.ability2, channelDuration: 0 }
      }
      if (dist <= 1350 && ready(s0)) {
        return {
          slot: 0,
          pressed: buttons.ability1,
          channelDuration: 0,
          needsConfirmClick: true,
        }
      }
      if (isHero && dist <= 760 && ready(s2)) {
        return {
          slot: 2,
          pressed: buttons.ability3,
          channelDuration: 0,
          needsConfirmClick: true,
        }
      }
      if (dist <= 650 && ready(s3)) {
        return { slot: 3, pressed: buttons.ultimate, channelDuration: 2.35 }
      }
      return undefined
    }

    case 'hero_bebop': {
      if (isHero && dist >= 220 && dist <= 1450 && ready(s2)) {
        return { slot: 2, pressed: buttons.ability3, channelDuration: 0.35 }
      }
      if (isHero && dist <= 250 && ready(s1)) {
        return {
          slot: 1,
          pressed: buttons.ability2,
          channelDuration: 0,
          needsConfirmClick: true,
        }
      }
      if (isHero && dist <= 240 && ready(s0)) {
        return { slot: 0, pressed: buttons.ability1, channelDuration: 0 }
      }
      if (dist >= 260 && dist <= 1450 && ready(s3)) {
        return { slot: 3, pressed: buttons.ultimate, channelDuration: 5.8 }
      }
      return undefined
    }

    case 'hero_shiv': {
      if (isHero && target.healthRatio <= 0.55 && dist <= 600 && ready(s3)) {
        return {
          slot: 3,
          pressed: buttons.ultimate,
          channelDuration: 0.55,
          needsConfirmClick: true,
        }
      }
      if (dist >= 120 && dist <= 720 && ready(s1)) {
        return { slot: 1, pressed: buttons.ability2, channelDuration: 0.4 }
      }
      if (dist <= 1400 && ready(s0)) {
        return { slot: 0, pressed: buttons.ability1, channelDuration: 0 }
      }
      if (bossHealthRatio < 0.92 && ready(s2)) {
        return { slot: 2, pressed: buttons.ability3, channelDuration: 0 }
      }
      return undefined
    }

    case 'hero_chrono': {
      if (dist <= 1300 && ready(s0)) {
        return {
          slot: 0,
          pressed: buttons.ability1,
          channelDuration: 0,
          needsConfirmClick: true,
        }
      }
      if (dist <= 1100 && ready(s1)) {
        return {
          slot: 1,
          pressed: buttons.ability2,
          channelDuration: 0,
          needsConfirmClick: true,
        }
      }
      if (dist <= 1450 && ready(s2)) {
        return {
          slot: 2,
          pressed: buttons.ability3,
          channelDuration: 0,
          needsConfirmClick: true,
        }
      }
      if (
        isHero &&
        dist >= 260 &&
        dist <= 1250 &&
        target.position.y <= bossPos.y + 80 &&
        ready(s3)
      ) {
        return { slot: 3, pressed: buttons.ultimate, channelDuration: 0.35 }
      }
      return undefined
    }

    case 'hero_forge': {
      if (dist >= 280 && dist <= 1500 && ready(s3)) {
        return { slot: 3, pressed: buttons.ultimate, channelDuration: 5.4 }
      }
      if (dist <= 1250 && ready(s0)) {
        return {
          slot: 0,
          pressed: buttons.ability1,
          channelDuration: 0,
          needsConfirmClick: true,
          groundAim: true,
        }
      }
      if (bossHealthRatio < 0.92 && dist <= 1150 && ready(s1)) {
        return {
          slot: 1,
          pressed: buttons.ability2,
          channelDuration: 0,
          needsConfirmClick: true,
          groundAim: true,
        }
      }
      return undefined
    }

    default: {
      if (dist <= 950 && ready(s0)) {
        return {
          slot: 0,
          pressed: slotToButton(0, buttons),
          channelDuration: 0,
          needsConfirmClick: true,
        }
      }
      return undefined
    }
  }
}

/**
 * Computes one 10 Hz AI step (`DriveCommand` + updated state + anti-stuck recovery)
 * for an active Hero Bot following caller-provided `waypoints` and optional `corridor` bounds.
 */
export function planBotDriveStep(input: BotStepInput): BossDrivePlan {
  const {
    hero,
    bossPos,
    bossEyePos,
    bossHealth,
    bossMaxHealth,
    abilities,
    heroes,
    guardian,
    state,
    now,
    buttons,
    corridor,
  } = input

  const objectiveKind = guardian?.objectiveKind ?? 'guardian'
  const minStandoff =
    guardian?.minStandoff ?? corridor?.defaultMinStandoff ?? DEFAULT_MIN_STANDOFF
  const defaultSiegeRange = corridor?.defaultSiegeRange ?? DEFAULT_SIEGE_RANGE
  const waypoints = input.waypoints.length > 0 ? input.waypoints : [bossPos]
  const courtyardMaxY = corridor?.courtyardMaxY ?? -Infinity

  if (state.lastObjectiveKind !== undefined && state.lastObjectiveKind !== objectiveKind) {
    let bestIdx = 0
    let bestDist = Infinity
    for (let i = 0; i < waypoints.length; i++) {
      const d = flatDistance2D(bossPos, waypoints[i])
      if (d < bestDist) {
        bestDist = d
        bestIdx = i
      }
    }
    state.waypointIndex = bestIdx
  }
  state.lastObjectiveKind = objectiveKind
  state.waypointIndex = advanceBossWaypointIndex(
    bossPos,
    waypoints,
    state.waypointIndex,
    courtyardMaxY,
  )
  const wp = waypoints[state.waypointIndex]
  const siegeAnchor = waypoints[waypoints.length - 1]

  const target = selectBossTarget(
    bossPos,
    bossEyePos,
    heroes,
    guardian,
    state,
    now,
    defaultSiegeRange,
  )
  const inChannelLock = now < state.channelLockUntil

  let mode: BossBehaviorMode = 'march'
  if (target?.kind === 'guardian') {
    mode = 'guardian_siege'
  } else if (target?.kind === 'hero' && target.distance2D <= 1350) {
    mode = 'hero_combat'
  }

  let moveX = 0
  let moveY = 0
  const strafeSign = Math.sin(now * 1.9 + state.routeIndex * Math.PI) >= 0 ? 1 : -1

  if (mode === 'march') {
    const dx = wp.x - bossPos.x
    const dy = wp.y - bossPos.y
    const d = Math.hypot(dx, dy)
    if (d > 24) {
      moveX = dx / d
      moveY = dy / d
    }
  } else if (mode === 'guardian_siege' && target) {
    const anchorDx = siegeAnchor.x + strafeSign * 95 - bossPos.x
    const anchorDy = siegeAnchor.y - bossPos.y
    const anchorDist = Math.hypot(anchorDx, anchorDy)
    if (anchorDist > 28) {
      const weight = clamp(anchorDist / 160, 0.35, 1.0)
      moveX = (anchorDx / anchorDist) * weight
      moveY = (anchorDy / anchorDist) * weight
    }
    if (
      corridor?.pedestalGuardObjectiveKind !== undefined &&
      corridor.pedestalGuardMaxY !== undefined &&
      objectiveKind === corridor.pedestalGuardObjectiveKind &&
      bossPos.y < corridor.pedestalGuardMaxY
    ) {
      moveY = Math.max(moveY, 0.75)
    } else if (target.distance2D < minStandoff) {
      const awayX = bossPos.x - target.position.x
      const awayY = bossPos.y - target.position.y
      const awayLen = Math.max(1, Math.hypot(awayX, awayY))
      moveX += (awayX / awayLen) * 0.85
      moveY += (awayY / awayLen) * 0.85
    }
  } else if (mode === 'hero_combat' && target) {
    const antiKiteMinY = corridor?.antiKiteMinY ?? -Infinity
    const heroBehindNorth =
      target.position.y > bossPos.y + 80 && bossPos.y > antiKiteMinY
    if (heroBehindNorth && corridor?.antiKiteMinY !== undefined) {
      const dx = wp.x - bossPos.x
      const dy = wp.y - bossPos.y
      const d = Math.hypot(dx, dy)
      if (d > 24) {
        moveX = dx / d
        moveY = dy / d
      }
    } else {
      const { min: prefMin, max: prefMax } = getHeroPreferredRange(hero)
      const toHeroX = target.position.x - bossPos.x
      const toHeroY = target.position.y - bossPos.y
      const toHeroLen = Math.max(1, Math.hypot(toHeroX, toHeroY))
      const dirX = toHeroX / toHeroLen
      const dirY = toHeroY / toHeroLen
      const perpX = -dirY * strafeSign
      const perpY = dirX * strafeSign

      let radial = 0
      if (target.distance2D > prefMax) {
        radial = 0.85
      } else if (target.distance2D < prefMin) {
        radial = -0.45
      }

      moveX = dirX * radial + perpX * 0.65
      moveY = dirY * radial + perpY * 0.65

      if (
        corridor?.upperPitBiasMinY !== undefined &&
        bossPos.y > corridor.upperPitBiasMinY &&
        radial > 0
      ) {
        const wpDx = wp.x - bossPos.x
        const wpDy = wp.y - bossPos.y
        const wpLen = Math.max(1, Math.hypot(wpDx, wpDy))
        moveX = moveX * 0.65 + (wpDx / wpLen) * 0.35
        moveY = moveY * 0.65 + (wpDy / wpLen) * 0.35
      }

      if (
        corridor?.upperPitBiasMinY !== undefined &&
        bossPos.y > corridor.upperPitBiasMinY &&
        moveY > 0.15
      ) {
        moveY = 0.15
      }
    }
  }

  if (
    corridor?.northCorridorMinY !== undefined &&
    corridor.northCorridorMaxAbsX !== undefined &&
    bossPos.y > corridor.northCorridorMinY
  ) {
    if (bossPos.x < -corridor.northCorridorMaxAbsX) moveX = Math.max(moveX, 0.55)
    if (bossPos.x > corridor.northCorridorMaxAbsX) moveX = Math.min(moveX, -0.55)
  }
  if (guardian && guardian.alive) {
    const gDx = bossPos.x - guardian.position.x
    const gDy = bossPos.y - guardian.position.y
    const gDist = Math.hypot(gDx, gDy)
    if (gDist > 1 && gDist < minStandoff) {
      moveX += (gDx / gDist) * 0.9
      moveY += (gDy / gDist) * 0.9
    }
  }

  let lookPoint: Vector
  if (now < state.groundAimUntil && target) {
    const dirX = target.position.x - bossPos.x
    const dirY = target.position.y - bossPos.y
    const len = Math.max(1, Math.hypot(dirX, dirY))
    lookPoint = {
      x: bossPos.x + (dirX / len) * 180,
      y: bossPos.y + (dirY / len) * 180,
      z: bossPos.z + 4,
    }
  } else if (target) {
    if (hero === 'hero_forge' && inChannelLock) {
      lookPoint = {
        x: target.position.x,
        y: target.position.y,
        z: target.position.z + 18,
      }
    } else {
      lookPoint = target.aimPoint
    }
  } else {
    lookPoint = { x: wp.x, y: wp.y, z: wp.z + 58 }
  }
  const facing = computeAimAngles(bossEyePos, lookPoint)

  let held = 0n
  let pressed = 0n
  let unstuckTeleport: Vector | undefined
  const desiredMoveMag = Math.hypot(moveX, moveY)

  if (now - state.lastCheckAt >= 1.2) {
    const moved2D = flatDistance2D(bossPos, state.lastCheckPos)
    const parkedOnSiege =
      mode === 'guardian_siege' && flatDistance2D(bossPos, siegeAnchor) < 185
    if (desiredMoveMag >= 0.45 && !inChannelLock && !parkedOnSiege && moved2D < 42) {
      state.stuckCount += 1
      if (state.stuckCount === 1) {
        pressed |= buttons.jump
        moveX += bossPos.x <= 0 ? 0.8 : -0.8
      } else if (state.stuckCount === 2) {
        pressed |= buttons.dash | buttons.jump
      } else {
        unstuckTeleport = { x: wp.x, y: wp.y, z: wp.z + 14 }
        state.stuckCount = 0
      }
    } else {
      state.stuckCount = 0
    }
    state.lastCheckPos = { x: bossPos.x, y: bossPos.y, z: bossPos.z }
    state.lastCheckAt = now
  }

  if (state.pendingConfirmAt > 0 && now >= state.pendingConfirmAt) {
    pressed |= buttons.attack
    state.pendingConfirmAt = 0
    if (state.pendingVerifySlot >= 0) {
      state.pendingVerifyAt = now + 0.12
    }
  } else if (
    state.pendingVerifySlot >= 0 &&
    state.pendingVerifyAt > 0 &&
    now >= state.pendingVerifyAt
  ) {
    const slot = state.pendingVerifySlot
    const checked = abilities.find((a) => a.slot === slot)
    const didFire = Boolean(
      checked &&
        (checked.cooldownEnd > now ||
          checked.charges < state.pendingVerifyChargesBefore),
    )
    if (!didFire) {
      pressed |= buttons.altFire
      if (slot >= 0 && slot <= 3) {
        state.slotBackoffUntil[slot] = now + 2.5
      }
      state.nextAbilityAt = Math.min(state.nextAbilityAt, now + 0.2)
    }
    state.pendingVerifySlot = -1
    state.pendingVerifyAt = 0
  }

  if (state.slamTapAt > 0 && now >= state.slamTapAt) {
    pressed |= buttons.attack | buttons.ultimate
    state.slamTapAt = 0
  }

  if (!inChannelLock) {
    if (
      target &&
      target.kind === 'hero' &&
      target.distance3D <= 205 &&
      now >= state.nextMeleeAt
    ) {
      pressed |= buttons.melee
      state.nextMeleeAt = now + 2.4
    }

    if (
      now >= state.nextDashAt &&
      desiredMoveMag >= 0.75 &&
      (mode === 'march' || (mode === 'hero_combat' && (target?.distance2D ?? 0) > 520)) &&
      flatDistance2D(bossPos, wp) > 230
    ) {
      pressed |= buttons.dash
      state.nextDashAt = now + 4.0
    }

    if (target && now >= state.nextAbilityAt && state.pendingConfirmAt === 0) {
      const hpRatio = bossMaxHealth > 0 ? bossHealth / bossMaxHealth : 1
      const decision = chooseBossAbilityPress(
        hero,
        abilities,
        target,
        bossPos,
        hpRatio,
        now,
        buttons,
        state.slotBackoffUntil,
      )
      if (decision) {
        const castAbil = abilities.find((a) => a.slot === decision.slot)
        pressed |= decision.pressed
        state.releasePrimaryUntil = now + 0.1
        state.nextAbilityAt =
          decision.channelDuration > 0
            ? now + decision.channelDuration + 0.4
            : now + 0.65
        if (decision.channelDuration > 0) {
          state.channelLockUntil = now + decision.channelDuration
        }
        if (decision.slamDelay) {
          state.slamTapAt = now + decision.slamDelay
        }
        if (decision.groundAim) {
          state.groundAimUntil = now + 0.22
        }
        if (decision.needsConfirmClick && decision.channelDuration === 0) {
          state.pendingConfirmAt = now + 0.08
          state.pendingVerifySlot = decision.slot
          state.pendingVerifyAt = 0
          state.pendingVerifyChargesBefore = castAbil?.charges ?? 0
        }
      }
    }
  }

  if (target && target.distance3D <= 1900 && now >= state.releasePrimaryUntil) {
    const suppressPrimaryForChannel =
      inChannelLock && (hero === 'hero_forge' || hero === 'hero_bebop')
    if (!suppressPrimaryForChannel) {
      held |= buttons.attack
    }
  }

  const axes = worldMoveToDriveAxes(moveX, moveY, facing.yaw)

  return {
    mode,
    target,
    drive: {
      facing,
      forward: axes.forward,
      left: axes.left,
      held,
      pressed,
    },
    unstuckTeleport,
  }
}
