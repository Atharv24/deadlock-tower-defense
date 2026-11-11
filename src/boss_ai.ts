// Autonomous Enemy Hero Boss navigation, target acquisition, 360° aiming,
// hero-specific ability casting, and anti-stuck recovery for Center Lane (`hl_defense`).
// Kept free of runtime `modlock` host calls (type-only imports) so 100% of the
// math and state machine can be deterministically unit-tested in Tier 1.

import type { Ability, Angles, DriveCommand, Vector } from 'modlock'

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

/**
 * Valve-authored Center Lane (`LaneNum = 4`, `LaneSlot = 1` West & `LaneSlot = 2` East)
 * staircase spline waypoints extracted from `hl_defense` (`dl_defense_default_ents.vents_c`).
 *
 * Avoids the `(0, 0)` central cover/drop (`z = 388 -> 256 -> 388`) and terminates at
 * `[±85, -1180, 384]` (`618u` from Blue Guardian `[0, -1792, 384]`), well inside
 * `npc_boss_tier1`'s `m_flInvulRange = 944.882` while safely outside its `275u` melee ring
 * and raised pedestal (`~450u`).
 */
export const BOSS_LANE_ROUTES: readonly [readonly Vector[], readonly Vector[]] = [
  // Route 0: West Center Lane Staircase (`spawnOrigin.x <= 0`)
  [
    { x: -192, y: 1024, z: 388 },
    { x: -192, y: 496, z: 272 },
    { x: -112, y: 96, z: 258 },
    { x: -112, y: -296, z: 256 },
    { x: -152, y: -480, z: 264 },
    { x: -160, y: -1024, z: 388 },
    { x: -85, y: -1180, z: 384 },
  ],
  // Route 1: East Center Lane Staircase (`spawnOrigin.x > 0`)
  [
    { x: 192, y: 1008, z: 388 },
    { x: 176, y: 472, z: 256 },
    { x: 112, y: 336, z: 256 },
    { x: 104, y: -136, z: 256 },
    { x: 160, y: -496, z: 264 },
    { x: 144, y: -1032, z: 388 },
    { x: 85, y: -1180, z: 384 },
  ],
]

/** Guardian `m_flInvulRange` is `944.882u`; engage comfortably inside `880u`. */
export const BOSS_GUARDIAN_SIEGE_RANGE = 880
/** Minimum distance kept from `[0, -1792, 384]` so Bosses never wedge onto the Guardian dais. */
export const BOSS_GUARDIAN_MIN_STANDOFF = 485

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function flatDistance2D(a: Vector, b: Vector): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function distance3D(a: Vector, b: Vector): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}

/**
 * Computes `AbilityOptions.upgrades` bitmask for Boss tiers (`1..5`):
 * bit `0` (`0b0001`) unlocks the ability, and bits `1..3` unlock T1..T3 upgrades.
 */
export function computeBossAbilityUpgradeMask(tier: number): number {
  if (tier <= 1) return 0b0011 // Unlocked + T1
  if (tier === 2) return 0b0111 // Unlocked + T1 + T2
  return 0b1111 // Unlocked + T1 + T2 + T3 (Max)
}

/** Creates initial AI tracking state for a newly spawned (or hot-reload adopted) Boss Hero. */
export function createBossAiState(spawnOrigin: Vector, now = 0): BossAiState {
  const routeIndex: 0 | 1 = spawnOrigin.x <= 0 ? 0 : 1
  const waypoints = BOSS_LANE_ROUTES[routeIndex]
  let initialIdx = 0
  for (let i = 0; i < waypoints.length - 1; i++) {
    if (spawnOrigin.y < waypoints[i].y - 80) {
      initialIdx = i + 1
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
 * Computes Source 2 view `Angles` (`pitch`, `yaw`, `roll = 0`) looking from `from` to `to`.
 * In Source 2: `+X` = `0°`, `+Y` = `90°`, `-Y` = `-90°`; looking up is negative pitch, looking down is positive pitch.
 */
export function computeAimAngles(from: Vector, to: Vector): Angles {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dz = to.z - from.z
  const horiz = Math.hypot(dx, dy)
  if (horiz < 1e-4 && Math.abs(dz) < 1e-4) {
    return { pitch: 0, yaw: -90, roll: 0 }
  }
  const yaw = (Math.atan2(dy, dx) * 180) / Math.PI
  const pitch = clamp((-Math.atan2(dz, horiz) * 180) / Math.PI, -85, 85)
  return { pitch, yaw, roll: 0 }
}

/**
 * Converts a desired horizontal world-space movement vector `(moveX, moveY)` into
 * `DriveCommand` `(forward, left)` axes (`[-1, 1]`) relative to `facingYawDeg`.
 *
 * Allows a Boss to walk/strafe in any direction (e.g. marching South `-Y`) while
 * simultaneously aiming & firing in any 360° direction!
 */
export function worldMoveToDriveAxes(
  moveX: number,
  moveY: number,
  facingYawDeg: number,
): { readonly forward: number; readonly left: number } {
  const mag = Math.hypot(moveX, moveY)
  if (mag < 1e-4) {
    return { forward: 0, left: 0 }
  }
  const scale = mag > 1 ? 1 / mag : 1
  const wx = moveX * scale
  const wy = moveY * scale

  const rad = (facingYawDeg * Math.PI) / 180
  const fx = Math.cos(rad)
  const fy = Math.sin(rad)
  // +90° CCW in right-handed Z-up is Left: (-sin(yaw), cos(yaw))
  const lx = -fy
  const ly = fx

  return {
    forward: clamp(wx * fx + wy * fy, -1, 1),
    left: clamp(wx * lx + wy * ly, -1, 1),
  }
}

/**
 * Advances `currentIndex` along `waypoints` whenever the Boss reaches `165u` horizontally
 * OR has already progressed more than `80u` south past that waypoint (`pos.y < wp.y - 80`).
 */
export function advanceBossWaypointIndex(
  pos: Vector,
  waypoints: readonly Vector[],
  currentIndex: number,
): number {
  let idx = clamp(currentIndex, 0, waypoints.length - 1)
  while (idx < waypoints.length - 1) {
    const wp = waypoints[idx]
    if (flatDistance2D(pos, wp) <= 165 || pos.y < wp.y - 80) {
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
  // Light projectile lead (0..0.16s) for moving targets without overshooting strafes.
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
  const aimPoint: Vector = {
    x: guardian.position.x,
    y: guardian.position.y,
    z: guardian.position.z + 125,
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
 * Selects the highest-priority combat target for a Boss Hero:
 * 1. Close Defender Hero with LoS (`<= 780u`), even during Guardian siege.
 * 2. Provoked Defender Hero attacker with LoS (`<= 1850u` while marching, or `<= 1500u` during siege).
 * 3. Visible Defender Hero in Center Lane (`<= 1450u`) before Guardian siege.
 * 4. Friendly Blue T1 Guardian once within `BOSS_GUARDIAN_SIEGE_RANGE` (`880u < m_flInvulRange = 944.882`).
 * 5. Long-range visible Defender Hero (`<= 1850u`) for opportunistic fire while marching.
 */
export function selectBossTarget(
  bossPos: Vector,
  bossEyePos: Vector,
  heroes: readonly BossHeroCandidate[],
  guardian: BossGuardianCandidate | undefined,
  state: Pick<BossAiState, 'provokedHeroEntity' | 'provokedUntil'>,
  now: number,
): BossCombatTarget | undefined {
  const visibleHeroes = heroes
    .filter((h) => h.health > 0 && h.hasLineOfSight)
    .sort((a, b) => flatDistance2D(bossPos, a.position) - flatDistance2D(bossPos, b.position))

  const distToGuardian =
    guardian && guardian.alive ? flatDistance2D(bossPos, guardian.position) : Infinity
  const inGuardianSiegeZone = distToGuardian <= BOSS_GUARDIAN_SIEGE_RANGE

  // 1. Immediate close-quarters Hero threat (`<= 780u`), even when sieging Guardian.
  const closest = visibleHeroes[0]
  if (closest && flatDistance2D(bossPos, closest.position) <= 780) {
    return buildHeroCombatTarget(bossPos, bossEyePos, closest)
  }

  // 2. Provoked Hero who recently damaged this Boss (including behind Blue Guardian up to 1500u).
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

  // 3. Mid-range Hero interception while marching down Center Lane.
  if (!inGuardianSiegeZone && closest && flatDistance2D(bossPos, closest.position) <= 1450) {
    return buildHeroCombatTarget(bossPos, bossEyePos, closest)
  }

  // 4. Objective Siege: Friendly Blue T1 Guardian (`<= 880u`).
  if (guardian && guardian.alive && inGuardianSiegeZone) {
    return buildGuardianCombatTarget(bossPos, bossEyePos, guardian)
  }

  // 5. Long-range opportunistic fire while continuing lane march.
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

export interface AbilityDecision {
  readonly slot: number
  readonly pressed: bigint
  readonly channelDuration: number
  readonly slamDelay?: number
  readonly needsConfirmClick?: boolean
  readonly groundAim?: boolean
}

/**
 * Chooses responsive, combo-chaining hero abilities for all 6 `BOSS_HERO_POOL` archetypes.
 * Supports 2-tick Confirm-Cast rising edges (`needsConfirmClick`), ground-pitched turret/specter
 * deployment (`groundAim`), and per-slot backoff (`slotBackoffUntil`) so if a unit-targeted
 * ability cannot lock on, the Boss immediately fires its next ready ability 200ms later!
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
      // Slot 3: Seismic Impact (leap + meteor slam onto Hero or Guardian plaza)
      if (dist >= 150 && dist <= 950 && ready(s3)) {
        return {
          slot: 3,
          pressed: buttons.ultimate,
          channelDuration: 1.75,
          slamDelay: 0.6,
        }
      }
      // Slot 1: Shoulder Charge (bull rush into Defender Hero or down lane)
      if (dist >= 130 && dist <= 850 && ready(s1)) {
        return { slot: 1, pressed: buttons.ability2, channelDuration: 1.35 }
      }
      // Slot 0: Siphon Life aura drain (active throughout close/mid combat)
      if (dist <= 580 && ready(s0)) {
        return { slot: 0, pressed: buttons.ability1, channelDuration: 0 }
      }
      // Slot 2 is passive (Infernal Resilience)
      return undefined
    }

    case 'hero_warden': {
      // Slot 1: Willpower barrier + sprint speed surge immediately on contact!
      if (dist <= 1550 && ready(s1)) {
        return { slot: 1, pressed: buttons.ability2, channelDuration: 0 }
      }
      // Slot 0: Alchemical Flask grenade (damages & weakens Heroes & Guardian)
      if (dist <= 1350 && ready(s0)) {
        return {
          slot: 0,
          pressed: buttons.ability1,
          channelDuration: 0,
          needsConfirmClick: true,
        }
      }
      // Slot 2: Binding Word root curse (Hero-targeted; falls back via slotBackoffUntil if out of cone)
      if (isHero && dist <= 760 && ready(s2)) {
        return {
          slot: 2,
          pressed: buttons.ability3,
          channelDuration: 0,
          needsConfirmClick: true,
        }
      }
      // Slot 3: Last Stand massive AoE pulse aura
      if (dist <= 650 && ready(s3)) {
        return { slot: 3, pressed: buttons.ultimate, channelDuration: 2.35 }
      }
      return undefined
    }

    case 'hero_bebop': {
      // Slot 2: Hook skillshot (pulls Defender right into Sticky Bomb + Uppercut combo!)
      if (isHero && dist >= 220 && dist <= 1450 && ready(s2)) {
        return { slot: 2, pressed: buttons.ability3, channelDuration: 0.35 }
      }
      // Slot 1: Sticky Bomb attach at close range
      if (isHero && dist <= 250 && ready(s1)) {
        return {
          slot: 1,
          pressed: buttons.ability2,
          channelDuration: 0,
          needsConfirmClick: true,
        }
      }
      // Slot 0: Exploding Uppercut melee launch
      if (isHero && dist <= 240 && ready(s0)) {
        return { slot: 0, pressed: buttons.ability1, channelDuration: 0 }
      }
      // Slot 3: Hyper Beam giant orbital laser (shreds Heroes & Guardian!)
      if (dist >= 260 && dist <= 1450 && ready(s3)) {
        return { slot: 3, pressed: buttons.ultimate, channelDuration: 5.8 }
      }
      return undefined
    }

    case 'hero_shiv': {
      // Slot 3: Killing Blow execute leap on damaged Defender Hero
      if (isHero && target.healthRatio <= 0.55 && dist <= 600 && ready(s3)) {
        return {
          slot: 3,
          pressed: buttons.ultimate,
          channelDuration: 0.55,
          needsConfirmClick: true,
        }
      }
      // Slot 1: Slice and Dice dash-slash
      if (dist >= 120 && dist <= 720 && ready(s1)) {
        return { slot: 1, pressed: buttons.ability2, channelDuration: 0.4 }
      }
      // Slot 0: Serrated Knives bleeding projectile
      if (dist <= 1400 && ready(s0)) {
        return { slot: 0, pressed: buttons.ability1, channelDuration: 0 }
      }
      // Slot 2: Bloodletting active damage shrug
      if (bossHealthRatio < 0.92 && ready(s2)) {
        return { slot: 2, pressed: buttons.ability3, channelDuration: 0 }
      }
      return undefined
    }

    case 'hero_chrono': {
      // Slot 0: Pulse Grenade AoE (checked first so Paradox immediately throws grenades!)
      if (dist <= 1300 && ready(s0)) {
        return {
          slot: 0,
          pressed: buttons.ability1,
          channelDuration: 0,
          needsConfirmClick: true,
        }
      }
      // Slot 1: Time Wall barrier
      if (dist <= 1100 && ready(s1)) {
        return {
          slot: 1,
          pressed: buttons.ability2,
          channelDuration: 0,
          needsConfirmClick: true,
        }
      }
      // Slot 2: Kinetic Carbine empowered shot
      if (dist <= 1450 && ready(s2)) {
        return {
          slot: 2,
          pressed: buttons.ability3,
          channelDuration: 0,
          needsConfirmClick: true,
        }
      }
      // Slot 3: Paradoxical Swap (only when Hero is south/even so Boss never swaps backward)
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
      // Slot 3: Heavy Barrage rocket volley (~5.5s channel vs Hero or Guardian)
      if (dist >= 280 && dist <= 1500 && ready(s3)) {
        return { slot: 3, pressed: buttons.ultimate, channelDuration: 5.4 }
      }
      // Slot 0: Mini Turret — ground-aimed + 2-tick LMB confirm + Tick 3 altFire cancel safety!
      if (dist <= 1250 && ready(s0)) {
        return {
          slot: 0,
          pressed: buttons.ability1,
          channelDuration: 0,
          needsConfirmClick: true,
          groundAim: true,
        }
      }
      // Slot 1: Medicinal Specter AoE heal — ground-aimed when injured
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

export interface BossStepInput {
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
}

/**
 * Computes one 10 Hz AI step (`DriveCommand` + updated state + anti-stuck recovery)
 * for an active Enemy Hero Boss in Center Lane.
 */
export function planBossDriveStep(input: BossStepInput): BossDrivePlan {
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
  } = input

  const waypoints = BOSS_LANE_ROUTES[state.routeIndex]
  state.waypointIndex = advanceBossWaypointIndex(bossPos, waypoints, state.waypointIndex)
  const wp = waypoints[state.waypointIndex]
  const siegeAnchor = waypoints[waypoints.length - 1]

  const target = selectBossTarget(bossPos, bossEyePos, heroes, guardian, state, now)
  const inChannelLock = now < state.channelLockUntil

  let mode: BossBehaviorMode = 'march'
  if (target?.kind === 'guardian') {
    mode = 'guardian_siege'
  } else if (target?.kind === 'hero' && target.distance2D <= 1350) {
    mode = 'hero_combat'
  }

  // 1. Compute desired world-space horizontal movement vector (moveX, moveY)
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
    // Hold ~618u standoff around siegeAnchor ([±85, -1180, 384]) and strafe laterally.
    const anchorDx = siegeAnchor.x + strafeSign * 95 - bossPos.x
    const anchorDy = siegeAnchor.y - bossPos.y
    const anchorDist = Math.hypot(anchorDx, anchorDy)
    if (anchorDist > 28) {
      const weight = clamp(anchorDist / 160, 0.35, 1.0)
      moveX = (anchorDx / anchorDist) * weight
      moveY = (anchorDy / anchorDist) * weight
    }
    // Never step south onto the solid Guardian pedestal (`y < -1300` / `dist < 485u`).
    if (bossPos.y < -1300 || target.distance2D < BOSS_GUARDIAN_MIN_STANDOFF) {
      moveY = Math.max(moveY, 0.75)
    }
  } else if (mode === 'hero_combat' && target) {
    const heroBehindNorth = target.position.y > bossPos.y + 80 && bossPos.y > -1050
    if (heroBehindNorth) {
      // Anti-kite rule: never let a Defender behind the Boss lure it back north toward spawn!
      // Keep marching south down the staircase while aiming 180° backward and shooting!
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
      // Perpendicular vector for combat strafing
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

      // Blend 35% of staircase waypoint direction while in upper/pit lane (`y > -950`)
      // so chasing a Hero never steers into the central `(0, 0)` block.
      if (bossPos.y > -950 && radial > 0) {
        const wpDx = wp.x - bossPos.x
        const wpDy = wp.y - bossPos.y
        const wpLen = Math.max(1, Math.hypot(wpDx, wpDy))
        moveX = moveX * 0.65 + (wpDx / wpLen) * 0.35
        moveY = moveY * 0.65 + (wpDy / wpLen) * 0.35
      }

      // Clamp northward retreat when north of the Guardian plaza.
      if (bossPos.y > -950 && moveY > 0.15) {
        moveY = 0.15
      }
    }
  }

  // Keep inside Center Lane outer side walls (`|x| <= 400`) and outside Guardian pedestal.
  if (bossPos.x < -380) moveX = Math.max(moveX, 0.55)
  if (bossPos.x > 380) moveX = Math.min(moveX, -0.55)
  if (guardian && guardian.alive) {
    const gDx = bossPos.x - guardian.position.x
    const gDy = bossPos.y - guardian.position.y
    const gDist = Math.hypot(gDx, gDy)
    if (gDist > 1 && gDist < BOSS_GUARDIAN_MIN_STANDOFF) {
      moveX += (gDx / gDist) * 0.9
      moveY += (gDy / gDist) * 0.9
    }
  }

  // 2. Compute 360° Aiming Angles (pitching down briefly when ground-deploying Mini Turret / Specter)
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
      // Aim McGinnis Heavy Barrage rockets at the ground around the target's base.
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

  // 3. Anti-stuck check (every 1.2s when actively trying to move)
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
        // Sidestep toward the lane staircase center
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

  // 4. Handle pending 2-tick Confirm-Cast rising edge & subsequent-tick verification / backoff
  // Using `else if` guarantees Confirm (`Buttons.attack`) is always sent on its own tick
  // BEFORE Verify checks whether the engine accepted the cast and started cooldown!
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
      // Cancel any leftover preview with altFire and back off this slot so the
      // Boss immediately casts its NEXT ready ability and keeps shooting!
      pressed |= buttons.altFire
      if (slot >= 0 && slot <= 3) {
        state.slotBackoffUntil[slot] = now + 2.5
      }
      state.nextAbilityAt = Math.min(state.nextAbilityAt, now + 0.2)
    }
    state.pendingVerifySlot = -1
    state.pendingVerifyAt = 0
  }

  // Trigger Abrams Seismic Impact ground-slam tap once airborne!
  if (state.slamTapAt > 0 && now >= state.slamTapAt) {
    pressed |= buttons.attack | buttons.ultimate
    state.slamTapAt = 0
  }

  if (!inChannelLock) {
    // Close-quarters light melee punch against Defender Heroes
    if (
      target &&
      target.kind === 'hero' &&
      target.distance3D <= 205 &&
      now >= state.nextMeleeAt
    ) {
      pressed |= buttons.melee
      state.nextMeleeAt = now + 2.4
    }

    // Aggressive lane dash while marching or closing gap
    if (
      now >= state.nextDashAt &&
      desiredMoveMag >= 0.75 &&
      (mode === 'march' || (mode === 'hero_combat' && (target?.distance2D ?? 0) > 520)) &&
      flatDistance2D(bossPos, wp) > 230
    ) {
      pressed |= buttons.dash
      state.nextDashAt = now + 4.0
    }

    // Hero-specific ability / ultimate cast (fast 0.65s combo chaining!)
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
        // Release primary fire briefly for 100ms so firing/reload never blocks cast activation
        // and so Tick 2's Buttons.attack confirm produces a true rising edge!
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

  // 5. Primary Weapon Attack (held whenever not in a 100ms cast-initiation release or channel ultimate)
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
