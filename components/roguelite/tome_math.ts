import { formatSoulsCount } from '@base/format'
import {
  CLIP_SIZE_ENTITY_MODIFIERS,
  decomposeBinaryEntityModifiers,
  FIRE_RATE_ENTITY_MODIFIERS,
  HERO_SPIRIT_ENTITY_MODIFIER,
} from '@engine/entity_modifiers'

export const TOME_DROP_CHANCE = 0.10
export const DEFAULT_TOME_GROWTH_PER_WAVE = 0.06
export const MAX_TOME_GROWTH_PER_WAVE = 0.5
export const MAX_TOME_WAVE_MULTIPLIER = 8.0
export const DEFAULT_SOUL_CACHE_BASE_SOULS = 83

export type MinorTomeKind = 'modifier' | 'ap' | 'souls'

export type MinorTomeId =
  | 'spirit'
  | 'weapon'
  | 'firerate'
  | 'health'
  | 'cooldown'
  | 'range'
  | 'omni'
  | 'ap_jackpot'
  | 'soul_jackpot'
  | (string & {})

export type MajorBoonId =
  | 'archmage'
  | 'marksman'
  | 'juggernaut'
  | 'grandmaster'
  | 'warchest'
  | 'bastion'
  | (string & {})

export interface MinorTomeDef {
  readonly id: MinorTomeId
  readonly name: string
  readonly shortLabel: string
  readonly description: string
  readonly kind: MinorTomeKind
  readonly modifier?: string
  readonly amount?: number
  readonly color: string
}

export interface MajorBoonDef {
  readonly id: MajorBoonId
  readonly title: string
  readonly subtitle: string
  readonly modifiers: readonly { readonly name: string; readonly stacks: number }[]
  readonly bonusAp?: number
  readonly bonusSouls?: number
  readonly guardianHeal?: number
  readonly guardianUpgrade?: boolean
  readonly accent: string
}

export type PlayerTomeTally = Readonly<Record<string, number>>
export type HeroTomeEntityModifierPlan = readonly string[]

export interface VanillaTomeCombatBonuses {
  readonly weaponDamageMult: number
  readonly abilityDamageMult: number
  readonly bonusMaxHp: number
  readonly regenPerSecond: number
  readonly cooldownReductionFraction: number
}

export type VanillaTomeBonuses = VanillaTomeCombatBonuses

export interface CreepLastHitInput {
  readonly victim: number
  readonly attacker: number
  readonly healthBefore: number
  readonly healthLost: number
}

export type LastHitDamageInput = CreepLastHitInput

export interface CreepLastHitResult {
  readonly isKill: boolean
  readonly isPlayerKill: boolean
  readonly granted: boolean
  readonly playerSlot?: number
  readonly tome?: MinorTomeDef
  readonly reason:
    | 'non_lethal'
    | 'not_creep'
    | 'guardian_kill'
    | 'non_player_attacker'
    | 'duplicate_kill'
    | 'rng_miss'
    | 'granted'
}

export type LastHitEvaluation = CreepLastHitResult

/** Parses configurable Tome growth rate (`tome_scaling` setting or `/tomescale` command). */
export function parseTomeGrowthPerWave(
  raw: string | number | undefined,
): number {
  if (raw === undefined || raw === '') {
    return DEFAULT_TOME_GROWTH_PER_WAVE
  }
  const num =
    typeof raw === 'number'
      ? raw
      : Number(String(raw).trim().replace(/%$/, ''))
  if (!Number.isFinite(num)) {
    return DEFAULT_TOME_GROWTH_PER_WAVE
  }
  if (num < 0) {
    return 0
  }
  const normalized = num > MAX_TOME_GROWTH_PER_WAVE ? num / 100 : num
  return Number(
    Math.max(0, Math.min(MAX_TOME_GROWTH_PER_WAVE, normalized)).toFixed(4),
  )
}

/** Computes Tome value multiplier for `wave` (`1.0` at Wave 1, scaling linearly by `growthPerWave`). */
export function computeTomeWaveMultiplier(
  wave: number,
  growthPerWave = DEFAULT_TOME_GROWTH_PER_WAVE,
): number {
  const clampedWave = Math.max(1, Math.floor(wave))
  const rate = Math.max(0, Math.min(MAX_TOME_GROWTH_PER_WAVE, growthPerWave))
  const raw = 1 + (clampedWave - 1) * rate
  return Number(Math.min(MAX_TOME_WAVE_MULTIPLIER, raw).toFixed(4))
}

function formatScaledNum(val: number): string {
  const rounded = Math.round(val * 10) / 10
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1)
}

/** Formats a Minor Tome description reflecting the wave-scaled multiplier. */
export function formatScaledMinorTomeDescription(
  tome: MinorTomeDef,
  mult: number,
): string {
  const m = Math.max(1, mult)
  switch (tome.id) {
    case 'spirit':
      return `+${Math.round(8 * m)} Spirit Power (+${formatScaledNum(6 * m)}% Ability Dmg)`
    case 'weapon':
      return `+${formatScaledNum(10 * m)}% Weapon Damage`
    case 'firerate':
      return `+${formatScaledNum(5 * m)}% Weapon Bonus`
    case 'health':
      return `+${Math.round(80 * m)} Max HP & +${formatScaledNum(2 * m)} HP/s Regen`
    case 'cooldown':
      return `+${formatScaledNum(3 * m)}% Ability Cooldown Reduction`
    case 'range':
      return `+${formatScaledNum(3 * m)}% Ability Dmg & Reach`
    case 'omni':
      return `+${formatScaledNum(7.5 * m)}% Wpn, +${formatScaledNum(4 * m)}% Abil, +${Math.round(40 * m)} HP, +${formatScaledNum(1.5 * m)}% CDR`
    case 'ap_jackpot': {
      const ap = Math.max(1, Math.round((tome.amount ?? 1) * m))
      return `+${ap} Ability Point${ap === 1 ? '' : 's'}`
    }
    case 'soul_jackpot':
      return `+${formatSoulsCount(Math.round((tome.amount ?? DEFAULT_SOUL_CACHE_BASE_SOULS) * m))} Bonus Souls`
    default:
      return tome.description
  }
}

/** Formats a Major Boon card subtitle with exact wave-scaled Tome/Soul/AP/Heal values. */
export function formatScaledMajorBoonSubtitle(
  boon: MajorBoonDef,
  mult: number,
): string {
  if (mult <= 1.001) {
    return boon.subtitle
  }
  const m = mult
  switch (boon.id) {
    case 'archmage':
      return `+${Math.round(24 * m)} Spirit Power & +${formatScaledNum(6 * m)}% Cooldown Reduction (${m.toFixed(2)}x)`
    case 'marksman':
      return `+${formatScaledNum(30 * m)}% Weapon Dmg & +${formatScaledNum(10 * m)}% Fire Rate (${m.toFixed(2)}x)`
    case 'juggernaut':
      return `+${Math.round(280 * m)} Max HP, +${formatScaledNum(7 * m)} HP/s Regen & Scaled Omni (${m.toFixed(2)}x)`
    case 'grandmaster': {
      const baseAp = boon.bonusAp ?? 3
      const ap = Math.max(baseAp, Math.round(baseAp * m))
      return `+${ap} Ability Points & ${m.toFixed(2)}x All-Stats Omni Tome`
    }
    case 'warchest': {
      const souls = Math.round((boon.bonusSouls ?? 1200) * m)
      return `+${formatSoulsCount(souls)} Souls & ${m.toFixed(2)}x All-Stats Omni Tome`
    }
    case 'bastion': {
      const heal = Math.round((boon.guardianHeal ?? 2000) * m)
      return `Fortify All Structures (+${formatSoulsCount(heal)} Heal) & +${Math.round(80 * m)} Hero HP (${m.toFixed(2)}x)`
    }
    default:
      return `${boon.subtitle} (${m.toFixed(2)}x)`
  }
}

/** Picks 3 distinct Major Boons from `majorBoonPool` for a milestone/Boss wave. */
export function pickThreeMajorBoons(
  wave: number,
  playerSlot = 0,
  majorBoonPool: readonly MajorBoonDef[],
): [MajorBoonDef, MajorBoonDef, MajorBoonDef] {
  const total = majorBoonPool.length
  if (total === 0) {
    throw new Error('pickThreeMajorBoons requires a non-empty MajorBoonDef pool')
  }
  const start = Math.abs(wave * 7 + playerSlot * 3) % total
  const first = majorBoonPool[start]
  const second = majorBoonPool[(start + 2) % total]
  const third = majorBoonPool[(start + (total >= 5 ? 4 : 1)) % total]
  return [first, second, third]
}

/**
 * Pure evaluator for `onDamaged` / `onKill` creep last-hits:
 * 1. Verifies the hit was lethal (`healthBefore > 0 && healthLost >= healthBefore`).
 * 2. Verifies the victim is a valid enemy unit.
 * 3. Rejects friendly structure kills and non-player attackers.
 * 4. Deduplicates by `victim` handle in `rewardedCreeps`.
 * 5. Rolls `dropChance` and selects a Minor Tome from `minorTomePool`.
 */
export function evaluateCreepLastHit(
  hit: CreepLastHitInput,
  validCreepEntities: ReadonlySet<number>,
  playerPawnToSlot: ReadonlyMap<number, number>,
  guardianEntities: ReadonlySet<number>,
  rewardedCreeps: Set<number>,
  rngRoll: number,
  tomePickRoll: number,
  minorTomePool: readonly MinorTomeDef[],
  dropChance = TOME_DROP_CHANCE,
): CreepLastHitResult {
  if (hit.healthBefore <= 0 || hit.healthLost < hit.healthBefore) {
    return { isKill: false, isPlayerKill: false, granted: false, reason: 'non_lethal' }
  }
  if (!validCreepEntities.has(hit.victim)) {
    return { isKill: true, isPlayerKill: false, granted: false, reason: 'not_creep' }
  }
  if (guardianEntities.has(hit.attacker)) {
    return { isKill: true, isPlayerKill: false, granted: false, reason: 'guardian_kill' }
  }
  const playerSlot = playerPawnToSlot.get(hit.attacker)
  if (playerSlot === undefined) {
    return {
      isKill: true,
      isPlayerKill: false,
      granted: false,
      reason: 'non_player_attacker',
    }
  }
  if (rewardedCreeps.has(hit.victim)) {
    return {
      isKill: true,
      isPlayerKill: true,
      granted: false,
      playerSlot,
      reason: 'duplicate_kill',
    }
  }
  rewardedCreeps.add(hit.victim)

  if (minorTomePool.length === 0 || rngRoll < 0 || rngRoll >= dropChance) {
    return {
      isKill: true,
      isPlayerKill: true,
      granted: false,
      playerSlot,
      reason: 'rng_miss',
    }
  }

  const normalizedPick = Math.max(0, Math.min(0.999999, tomePickRoll))
  const poolIdx = Math.floor(normalizedPick * minorTomePool.length)
  const tome = minorTomePool[poolIdx]
  return {
    isKill: true,
    isPlayerKill: true,
    granted: true,
    playerSlot,
    tome,
    reason: 'granted',
  }
}

/**
 * Computes runtime stat multipliers for Minor Tomes & Major Boons from the
 * accumulated Tome tally.
 */
export function computeVanillaTomeBonuses(
  tally: PlayerTomeTally,
): VanillaTomeCombatBonuses {
  const weapon = Math.max(0, tally.weapon ?? 0)
  const firerate = Math.max(0, tally.firerate ?? 0)
  const spirit = Math.max(0, tally.spirit ?? 0)
  const range = Math.max(0, tally.range ?? 0)
  const health = Math.max(0, tally.health ?? 0)
  const cooldown = Math.max(0, tally.cooldown ?? 0)
  const omni = Math.max(0, tally.omni ?? 0)

  const weaponDamageMult = Number(
    (1 + 0.1 * weapon + 0.05 * firerate + 0.075 * omni).toFixed(4),
  )
  const abilityDamageMult = Number(
    (1 + 0.06 * spirit + 0.03 * range + 0.04 * omni).toFixed(4),
  )
  const bonusMaxHp = Math.round(80 * health + 40 * omni)
  const regenPerSecond = Number((2 * health + 1 * omni).toFixed(2))
  const cooldownReductionFraction = Number(
    Math.min(0.6, 0.03 * cooldown + 0.015 * omni).toFixed(4),
  )

  return {
    weaponDamageMult,
    abilityDamageMult,
    bonusMaxHp,
    regenPerSecond,
    cooldownReductionFraction,
  }
}

/**
 * Computes incoming damage scale (`baseMaxHp / (baseMaxHp + bonusMaxHp)`) so
 * Vitality & Omni Tomes grant exact Effective Max HP on servers without
 * `CCitadelPlayerPawn` health clamping.
 */
export function computeVanillaEffectiveHpDamageScale(
  baseMaxHp: number,
  bonusMaxHp: number,
): number {
  if (baseMaxHp <= 0 || bonusMaxHp <= 0) {
    return 1
  }
  return Number((baseMaxHp / (baseMaxHp + bonusMaxHp)).toFixed(4))
}

/**
 * Returns the exact set of real C++ `holdEntityModifier` names active on a Defender's
 * hero pawn from their Tome tally (Fire Rate, Clip Size, and Spirit Power).
 */
export function getHeroTomeEntityModifierPlan(
  tally: PlayerTomeTally,
): string[] {
  const weapon = Math.max(0, tally.weapon ?? 0)
  const firerate = Math.max(0, tally.firerate ?? 0)
  const spirit = Math.max(0, tally.spirit ?? 0)
  const omni = Math.max(0, tally.omni ?? 0)

  const mods: string[] = [
    ...decomposeBinaryEntityModifiers(
      5 * firerate + 2.5 * omni,
      FIRE_RATE_ENTITY_MODIFIERS,
    ),
    ...decomposeBinaryEntityModifiers(
      6 * weapon + 3 * omni,
      CLIP_SIZE_ENTITY_MODIFIERS,
    ),
  ]
  if (spirit + omni > 0) {
    mods.push(HERO_SPIRIT_ENTITY_MODIFIER)
  }
  return mods
}

/**
 * Residual bullet-damage multiplier applied in `onDamage` once C++ Fire Rate entity
 * modifiers are held natively (`1 + 10% weapon + 5% omni`), preventing Fire Rate Tomes
 * from double-multiplying DPS.
 */
export function computeResidualWeaponDamageMult(tally: PlayerTomeTally): number {
  const weapon = Math.max(0, tally.weapon ?? 0)
  const omni = Math.max(0, tally.omni ?? 0)
  return Number((1 + 0.1 * weapon + 0.05 * omni).toFixed(4))
}
