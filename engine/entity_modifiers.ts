export interface BinaryEntityModifierTier {
  readonly modifier: string
  readonly value: number
}

/**
 * Disabled Deadlock attack-speed items repurposed in `mod.json` into a 5-bit binary
 * Fire Rate ladder (`7, 14, 28, 56, 112` -> `0..217%` BonusFireRate) for structures & heroes.
 */
export const FIRE_RATE_ENTITY_MODIFIERS: readonly BinaryEntityModifierTier[] = [
  { modifier: 'upgrade_small_attack_speed/modifier_intrinsic_base', value: 7 },
  { modifier: 'upgrade_attack_speed_1/modifier_intrinsic_base', value: 14 },
  { modifier: 'upgrade_attack_speed_2/modifier_intrinsic_base', value: 28 },
  { modifier: 'upgrade_magic_missile/modifier_intrinsic_base', value: 56 },
  { modifier: 'upgrade_glass_cannon2/modifier_glasscannonv2', value: 112 },
] as const

/**
 * Disabled Deadlock clip-size items repurposed in `mod.json` into a 4-bit binary
 * Ammo Clip ladder (`6, 12, 24, 48` -> `0..90%` BonusClipSizePercent) for hero weapon scaling.
 */
export const CLIP_SIZE_ENTITY_MODIFIERS: readonly BinaryEntityModifierTier[] = [
  { modifier: 'upgrade_clip_size_2/modifier_intrinsic_base', value: 6 },
  { modifier: 'upgrade_clip_size_3/modifier_intrinsic_base', value: 12 },
  { modifier: 'upgrade_weapon_instant_reload/modifier_intrinsic_base', value: 24 },
  { modifier: 'upgrade_infinitemagazine/modifier_base', value: 48 },
] as const

/** Stock disabled item tuned in `mod.json` to `+12%` CooldownReduction for fortified structures. */
export const STRUCTURE_CDR_ENTITY_MODIFIER =
  'upgrade_timeless_emblem/modifier_intrinsic_base'

/** Stock disabled item tuned in `mod.json` to `+16` Spirit Power for hero Spirit scaling. */
export const HERO_SPIRIT_ENTITY_MODIFIER =
  'upgrade_tech_cleave/modifier_intrinsic_base'

/** Standalone `FILE_MODIFIERS` entry tuned in `mod.json` (`+65 u/s`) for elite units/bosses. */
export const ELITE_HASTE_ENTITY_MODIFIER =
  'modifier_hero_testing_fast_movespeed'

/** Stock `upgrade_colossus` intrinsic modifier tuned in `mod.json` (`1.38x` scale). */
export const BOSS_COLOSSUS_ENTITY_MODIFIER =
  'upgrade_colossus/modifier_colossus_active'

/** Effective model scale multiplier applied by `BOSS_COLOSSUS_ENTITY_MODIFIER`. */
export const BOSS_COLOSSUS_APPLIED_SCALE = 1.38

/**
 * Decomposes `targetValue` onto the closest quantized combination of `tiers`
 * (using the smallest tier step as quantization unit and capping at the full sum),
 * returning active modifier names in canonical ascending order.
 */
export function decomposeBinaryEntityModifiers(
  targetValue: number,
  tiers: readonly BinaryEntityModifierTier[],
): string[] {
  if (tiers.length === 0 || !Number.isFinite(targetValue) || targetValue <= 0) {
    return []
  }
  const step = tiers[0].value
  if (step <= 0) {
    return []
  }
  let maxTotal = 0
  for (const tier of tiers) {
    maxTotal += tier.value
  }
  let remaining = Math.min(
    maxTotal,
    Math.max(0, Math.round(targetValue / step) * step),
  )
  if (remaining <= 0) {
    return []
  }
  const picked = new Set<string>()
  for (let i = tiers.length - 1; i >= 0; i--) {
    const tier = tiers[i]
    if (remaining >= tier.value) {
      picked.add(tier.modifier)
      remaining -= tier.value
    }
  }
  return tiers.filter((t) => picked.has(t.modifier)).map((t) => t.modifier)
}

/**
 * Incrementally reconciles held entity modifiers on `entity` against `desiredMods`,
 * issuing host calls ONLY for modifiers that changed state (`0` host calls when idle).
 */
export function syncEntityModifierSet(
  entity: number,
  desiredMods: readonly string[],
  appliedByEntity: Map<number, Set<string>>,
  holdFn: (entity: number, modifier: string, active?: boolean) => boolean,
): boolean {
  if (entity <= 0) {
    return false
  }
  const prev = appliedByEntity.get(entity)
  if (!prev && desiredMods.length === 0) {
    return false
  }
  const next = new Set(desiredMods)
  if (prev && prev.size === next.size) {
    let unchanged = true
    for (const mod of next) {
      if (!prev.has(mod)) {
        unchanged = false
        break
      }
    }
    if (unchanged) {
      return false
    }
  }
  if (prev) {
    for (const mod of prev) {
      if (!next.has(mod)) {
        holdFn(entity, mod, false)
      }
    }
  }
  const recorded = new Set<string>()
  for (const mod of next) {
    if (prev?.has(mod) || holdFn(entity, mod, true)) {
      recorded.add(mod)
    }
  }
  if (recorded.size === 0) {
    appliedByEntity.delete(entity)
  } else {
    appliedByEntity.set(entity, recorded)
  }
  return true
}
