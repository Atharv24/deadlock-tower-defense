export interface ModifierDefinition {
  readonly file?: string
  readonly entry: string
  readonly properties?: Readonly<Record<string, string | number | boolean>>
  readonly fields?: Readonly<Record<string, string | number | boolean>>
}

export type Definition = ModifierDefinition

export const COLOSSUS_SCALE_DEFINITION: Definition = {
  entry: 'upgrade_colossus',
  properties: {
    ModelScaleGrowth: 1.38,
  },
}

export const FAST_MOVESPEED_MODIFIER_DEFINITION: Definition = {
  file: 'FILE_MODIFIERS',
  entry: 'modifier_hero_testing_fast_movespeed',
  fields: {
    'CModifierVData.m_vecScriptValues[EModifierValue.MODIFIER_VALUE_MOVEMENT_SPEED_MAX]': 65,
    'CModifierVData.m_vecScriptValues[EModifierValue.MODIFIER_VALUE_MOVEMENT_SPEED_BONUS_CAP_INCREASE]': 65,
  },
}

export const FIRE_RATE_LADDER_DEFINITIONS: readonly Definition[] = [
  {
    entry: 'upgrade_small_attack_speed',
    properties: {
      BonusFireRate: 7,
    },
  },
  {
    entry: 'upgrade_attack_speed_1',
    properties: {
      BonusFireRate: 14,
    },
  },
  {
    entry: 'upgrade_attack_speed_2',
    properties: {
      BonusFireRate: 28,
    },
  },
  {
    entry: 'upgrade_magic_missile',
    properties: {
      BonusFireRate: 56,
      MaxHealthLossPercent: 0,
      BaseAttackDamagePercent: 0,
      BonusMoveSpeed: 0,
    },
  },
  {
    entry: 'upgrade_glass_cannon2',
    properties: {
      BonusFireRate: 112,
      MaxHealthLossPercent: 0,
      BaseAttackDamagePercent: 0,
    },
  },
]

export const CLIP_SIZE_LADDER_DEFINITIONS: readonly Definition[] = [
  {
    entry: 'upgrade_clip_size_2',
    properties: {
      BonusClipSizePercent: 6,
    },
  },
  {
    entry: 'upgrade_clip_size_3',
    properties: {
      BonusClipSizePercent: 12,
    },
  },
  {
    entry: 'upgrade_weapon_instant_reload',
    properties: {
      BonusClipSizePercent: 24,
    },
  },
  {
    entry: 'upgrade_infinitemagazine',
    properties: {
      BonusClipSizePercent: 48,
      BonusHealth: 0,
      BaseAttackDamagePercent: 0,
      BonusFireRate: 0,
    },
  },
]

export const TIMELESS_EMBLEM_CDR_DEFINITION: Definition = {
  entry: 'upgrade_timeless_emblem',
  properties: {
    CooldownReduction: 12,
    ItemCooldownReduction: 0,
    TechRangeMultiplier: 0,
    TechRadiusMultiplier: 0,
    BonusAbilityDurationPercent: 0,
  },
}

export const TECH_CLEAVE_SPIRIT_DEFINITION: Definition = {
  entry: 'upgrade_tech_cleave',
  properties: {
    TechPower: 16,
  },
}

/**
 * Canonical ordered list of the 13 stock VData modifier definition overrides used across
 * Deadlock mods and validated for parity against `mods/deadlock_td/mod.json`.
 */
export const ALL_STANDARD_ENGINE_DEFINITIONS: readonly Definition[] = [
  COLOSSUS_SCALE_DEFINITION,
  FAST_MOVESPEED_MODIFIER_DEFINITION,
  ...FIRE_RATE_LADDER_DEFINITIONS,
  ...CLIP_SIZE_LADDER_DEFINITIONS,
  TIMELESS_EMBLEM_CDR_DEFINITION,
  TECH_CLEAVE_SPIRIT_DEFINITION,
]
