// Hidden King's Defense — TD-specific configuration, wave/boss curves, pools, and handoff state.
import type { Vector } from 'modlock'

import {
  canExecuteDevCommand,
  canPlayerRestartActiveMatch,
  clamp,
  computeAimAngles,
  DEV_COMMAND_NAMES,
  distance3D,
  EMPTY_SERVER_SHUTDOWN_DELAY_SECONDS,
  type EmptyServerWatchState,
  evaluateEmptyServerShutdown,
  flatDistance2D,
  formatMatchClock,
  formatSoulsCount,
  formatTomeCountDisplay,
  hasClockSteppedBackward,
  isLocalDevModeArgs,
  parseSlashCommandLine,
  worldMoveToDriveAxes,
} from '@base'
import {
  BASE_GUARDIAN_ORIGIN,
  BASE_GUARDIAN_TARGETNAMES,
  type BinaryEntityModifierTier,
  BOSS_COLOSSUS_APPLIED_SCALE,
  BOSS_COLOSSUS_ENTITY_MODIFIER,
  BOSS_SPAWN_ANGLES,
  BOSS_SPAWN_ORIGIN,
  CLIP_SIZE_ENTITY_MODIFIERS,
  decomposeBinaryEntityModifiers,
  EAST_SHRINE_ORIGIN,
  EAST_SHRINE_TARGETNAMES,
  ELITE_HASTE_ENTITY_MODIFIER,
  evaluateDefenderRespawnDue,
  evaluateLegendaryPurchase,
  FIRE_RATE_ENTITY_MODIFIERS,
  formatItemDisplayTitle,
  GUARDIAN_ORIGIN,
  GUARDIAN_TARGETNAMES,
  HERO_RESPAWN_TIME_SECONDS,
  HERO_SPIRIT_ENTITY_MODIFIER,
  HIDDEN_KING_TEAM as DEFENDER_TEAM,
  isMidtownOutOfBoundsOrBelowMap as isDefenderOutOfBoundsOrBelowMap,
  ITEM_DISPLAY_TITLES,
  LEGENDARY_ITEM_COST_SOULS,
  PATRON_ORIGIN,
  PLAYER_SPAWN_ANGLES,
  PLAYER_SPAWN_ORIGIN,
  STRUCTURE_CDR_ENTITY_MODIFIER,
  syncEntityModifierSet,
  WALKER_ORIGIN,
  WALKER_TARGETNAMES,
  WEST_SHRINE_ORIGIN,
  WEST_SHRINE_TARGETNAMES,
} from '@engine'
import {
  type AbilityDecision,
  advanceBossWaypointIndex,
  type BossAiState,
  type BossBehaviorMode,
  type BossButtonMask,
  type BossCombatTarget,
  type BossDrivePlan,
  type BossGuardianCandidate,
  type BossHeroCandidate,
  type BotCorridorConfig,
  type BotStepInput,
  chooseBossAbilityPress,
  computeBossAbilityUpgradeMask,
  createBossAiState as createGenericBotAiState,
  planBotDriveStep,
  selectBossTarget,
} from '@components/bot_ai'
import {
  computeResidualWeaponDamageMult,
  computeTomeWaveMultiplier,
  computeVanillaEffectiveHpDamageScale,
  computeVanillaTomeBonuses,
  DEFAULT_TOME_GROWTH_PER_WAVE,
  evaluateCreepLastHit,
  formatScaledMajorBoonSubtitle,
  formatScaledMinorTomeDescription,
  getHeroTomeEntityModifierPlan,
  type LastHitDamageInput,
  type LastHitEvaluation,
  type MajorBoonDef,
  MAX_TOME_GROWTH_PER_WAVE,
  MAX_TOME_WAVE_MULTIPLIER,
  type MinorTomeDef,
  type MinorTomeKind,
  parseTomeGrowthPerWave,
  pickThreeMajorBoons,
  TOME_DROP_CHANCE,
  type VanillaTomeBonuses,
} from '@components/roguelite'
import {
  BOARD_CREEPS_SLAIN,
  BOARD_HIGHEST_WAVE,
  evaluateLeaderboardCheckpoint,
  evaluateLeaderboardSubmission,
  getLeaderboardSubtitleCopy,
  getLeaderboardUnavailableCopy,
  type LeaderboardCheckpointDecision,
  type LeaderboardCheckpointInput,
  type LeaderboardSubmissionDecision,
  type LeaderboardSubmissionInput,
} from '@components/scores'
import {
  evaluateNativeShopHudSync,
  INITIAL_NATIVE_SHOP_HUD_STATE,
  type NativeShopHudDecision,
  type NativeShopHudState,
  needsImmediateNativeShopWake,
  SHOP_CLOSE_HUD_RESTORE_DELAY_SECONDS,
  SHOP_CLOSE_HUD_SETTLE_RESET_SECONDS,
  SHOP_CLOSE_SECOND_PULSE_START_SECONDS,
  shouldFreeHudCursor,
  shouldPushHudUpdate,
} from '@ui'

export {
  type AbilityDecision,
  advanceBossWaypointIndex,
  BASE_GUARDIAN_ORIGIN,
  BASE_GUARDIAN_TARGETNAMES,
  type BinaryEntityModifierTier,
  BOARD_CREEPS_SLAIN,
  BOARD_HIGHEST_WAVE,
  BOSS_COLOSSUS_APPLIED_SCALE,
  BOSS_COLOSSUS_ENTITY_MODIFIER,
  BOSS_SPAWN_ANGLES,
  BOSS_SPAWN_ORIGIN,
  type BossAiState,
  type BossBehaviorMode,
  type BossButtonMask,
  type BossCombatTarget,
  type BossDrivePlan,
  type BossGuardianCandidate,
  type BossHeroCandidate,
  type BotCorridorConfig,
  canExecuteDevCommand,
  canPlayerRestartActiveMatch,
  chooseBossAbilityPress,
  clamp,
  CLIP_SIZE_ENTITY_MODIFIERS,
  computeAimAngles,
  computeBossAbilityUpgradeMask,
  computeResidualWeaponDamageMult,
  computeTomeWaveMultiplier,
  computeVanillaEffectiveHpDamageScale,
  computeVanillaTomeBonuses,
  decomposeBinaryEntityModifiers,
  DEFAULT_TOME_GROWTH_PER_WAVE,
  DEFENDER_TEAM,
  DEV_COMMAND_NAMES,
  distance3D,
  EAST_SHRINE_ORIGIN,
  EAST_SHRINE_TARGETNAMES,
  ELITE_HASTE_ENTITY_MODIFIER,
  EMPTY_SERVER_SHUTDOWN_DELAY_SECONDS,
  type EmptyServerWatchState,
  evaluateCreepLastHit,
  evaluateDefenderRespawnDue,
  evaluateEmptyServerShutdown,
  evaluateLeaderboardCheckpoint,
  evaluateLeaderboardSubmission,
  evaluateLegendaryPurchase,
  evaluateNativeShopHudSync,
  FIRE_RATE_ENTITY_MODIFIERS,
  flatDistance2D,
  formatItemDisplayTitle,
  formatMatchClock,
  formatScaledMajorBoonSubtitle,
  formatScaledMinorTomeDescription,
  formatSoulsCount,
  formatTomeCountDisplay,
  getHeroTomeEntityModifierPlan,
  getLeaderboardSubtitleCopy,
  getLeaderboardUnavailableCopy,
  GUARDIAN_ORIGIN,
  GUARDIAN_TARGETNAMES,
  hasClockSteppedBackward,
  HERO_RESPAWN_TIME_SECONDS,
  HERO_SPIRIT_ENTITY_MODIFIER,
  INITIAL_NATIVE_SHOP_HUD_STATE,
  isDefenderOutOfBoundsOrBelowMap,
  isLocalDevModeArgs,
  ITEM_DISPLAY_TITLES,
  type LastHitDamageInput,
  type LastHitEvaluation,
  type LeaderboardCheckpointDecision,
  type LeaderboardCheckpointInput,
  type LeaderboardSubmissionDecision,
  type LeaderboardSubmissionInput,
  LEGENDARY_ITEM_COST_SOULS,
  type MajorBoonDef,
  MAX_TOME_GROWTH_PER_WAVE,
  MAX_TOME_WAVE_MULTIPLIER,
  type MinorTomeDef,
  type MinorTomeKind,
  type NativeShopHudDecision,
  type NativeShopHudState,
  needsImmediateNativeShopWake,
  parseSlashCommandLine,
  parseTomeGrowthPerWave,
  PATRON_ORIGIN,
  pickThreeMajorBoons,
  PLAYER_SPAWN_ANGLES,
  PLAYER_SPAWN_ORIGIN,
  selectBossTarget,
  SHOP_CLOSE_HUD_RESTORE_DELAY_SECONDS,
  SHOP_CLOSE_HUD_SETTLE_RESET_SECONDS,
  SHOP_CLOSE_SECOND_PULSE_START_SECONDS,
  shouldFreeHudCursor,
  shouldPushHudUpdate,
  STRUCTURE_CDR_ENTITY_MODIFIER,
  syncEntityModifierSet,
  TOME_DROP_CHANCE,
  type VanillaTomeBonuses,
  WALKER_ORIGIN,
  WALKER_TARGETNAMES,
  WEST_SHRINE_ORIGIN,
  WEST_SHRINE_TARGETNAMES,
  worldMoveToDriveAxes,
}

export const WAVE_INTERVAL_SECONDS = 20
export const INITIAL_WAVE_DELAY_SECONDS = 5
export const ZIPLINE_LAND_DELAY_SECONDS = 12.5

export const BASE_CREEP_HP = 200
export const HP_GROWTH_RATE = 1.04
export const MAX_CREEP_HP = 5_000_000
export const CREEP_DAMAGE_GROWTH_RATE = 1.035
export const BASE_CREEP_SCALE = 0.9
export const CREEP_SCALE_PER_WAVE = 0.015
export const MAX_CREEP_SCALE = 1.65
export const MAX_CREEP_SCALE_AURA_STEPS = 16
export const ZIPLINE_SQUAD_SIZE = 4
export const MIN_SPAWN_INTERVAL_SECONDS = 7
export const MAX_CREEP_TIER = 10
export const MAX_ACTIVE_CREEPS_FOR_WAVE_NEUTRALS = 22

export const MAX_COOP_DEFENDER_PLAYERS = 12

export const BASE_WAVE_SOUL_REWARD = 50
export const MAX_WAVE_SOUL_REWARD = 3_333
export const SOUL_CACHE_BASE_SOULS = 83
export const BOSS_KILL_SOUL_REWARD = 133

export const BOSS_WAVE_INTERVAL = 5
export const MAX_BOSS_TIER = 5
export const BOSS_BASE_MAX_HP = 1000
export const BOSS_TIER_BONUS_HP = [1750, 3250, 5500, 8500, 13000] as const
export const BOSS_ENDLESS_BOOST_HP = 1600
export const MAX_BOSS_ENDLESS_BOOST_STACKS = 12
export const BOSS_TIER_SCALE = [1.35, 1.5, 1.65, 1.8, 1.95] as const
export const BOSS_SCALE_STEP = 0.1
export const MAX_BOSS_EXTRA_SIZE_STACKS = 1
export const BOSS_BASE_DAMAGE_MULT = 1.15
export const BOSS_DAMAGE_MULT_PER_BOSS_WAVE = 0.2

export const BOSS_HERO_POOL = [
  'hero_warden',
  'hero_atlas',
  'hero_bebop',
  'hero_chrono',
  'hero_forge',
  'hero_shiv',
] as const

export type DefenseStage =
  | 'guardian'
  | 'walker'
  | 'base_guardians'
  | 'shrines'
  | 'patron_stage1'
  | 'patron_stage2'

export const ZOMBIE_BASE_KAMIKAZE_DAMAGE = 85
export const ZOMBIE_ARM_FUSE_SECONDS = 0.2

export interface WaveNeutralVarietyDef {
  readonly unit:
    | 'td_neutral_lantern'
    | 'td_neutral_puppeteer'
    | 'td_neutral_pigeon'
    | 'td_neutral_mushroom'
  readonly vanillaUnit:
    | 'neutral_lantern_normal'
    | 'neutral_theater_normal'
    | 'neutral_rooftop_pigeon_normal'
    | 'neutral_mushroom_strong'
  readonly label: string
  readonly model: string
  readonly hpMult: number
  readonly scaleMult: number
}

export const WAVE_NEUTRAL_VARIETY_POOL: readonly WaveNeutralVarietyDef[] = [
  {
    unit: 'td_neutral_lantern',
    vanillaUnit: 'neutral_lantern_normal',
    label: 'Chinatown Lantern',
    model: 'models/npc_units/neutral_ct_lanterns/neutral_ct_lantern.vmdl',
    hpMult: 1.0,
    scaleMult: 1.0,
  },
  {
    unit: 'td_neutral_puppeteer',
    vanillaUnit: 'neutral_theater_normal',
    label: 'Theatre Puppeteer',
    model: 'models/npc_units/neutral_theatre_puppeteer_02/neutral_theatre_puppeteer_02.vmdl',
    hpMult: 1.1,
    scaleMult: 1.0,
  },
  {
    unit: 'td_neutral_pigeon',
    vanillaUnit: 'neutral_rooftop_pigeon_normal',
    label: 'Cerberus Pigeon',
    model: 'models/npc_units/neutral_pigeon_cerberus/neutral_pigeon_cerberus.vmdl',
    hpMult: 0.95,
    scaleMult: 1.05,
  },
  {
    unit: 'td_neutral_mushroom',
    vanillaUnit: 'neutral_mushroom_strong',
    label: 'Giant Spore Mushroom',
    model: 'models/npc_units/neutral_mushroom_large_01/neutral_mushroom_large_01.vmdl',
    hpMult: 1.35,
    scaleMult: 1.05,
  },
] as const

export const WAVE_NEUTRAL_SPAWN_OFFSETS = [
  { x: -110, y: 1250, z: 392 },
  { x: 110, y: 1250, z: 392 },
  { x: 0, y: 1320, z: 392 },
] as const

export const TD_PRECACHE_RESOURCES: readonly string[] = [
  'models/heroes_wip/necro/necro_shambler.vmdl',
  'models/npc_units/neutral_library_watcher_01/neutral_library_watcher_01.vmdl',
  'models/npc_units/neutral_ct_lanterns/neutral_ct_lantern.vmdl',
  'models/npc_units/neutral_theatre_puppeteer_02/neutral_theatre_puppeteer_02.vmdl',
  'models/npc_units/neutral_pigeon_cerberus/neutral_pigeon_cerberus.vmdl',
  'models/npc_units/neutral_mushroom_large_01/neutral_mushroom_large_01.vmdl',
  'particles/abilities/necro/necro_corpse_explosion.vpcf',
  'particles/abilities/necro/necro_ghoul_warning.vpcf',
  'particles/npc/neutrals/generic_neutral/neutral_small_projectile.vpcf',
  'particles/npc/neutrals/generic_neutral/neutral_muzzle_flash_small.vpcf',
  'particles/npc/neutrals/lantern/lantern_neutral_tracer.vpcf',
  'particles/npc/neutral_trooper_death.vpcf',
] as const

export const GUARDIAN_BASE_MAX_HP = 5500
export const GUARDIAN_REPAIR_COST_SOULS = 300
export const GUARDIAN_REPAIR_AMOUNT_HP = 1500
export const GUARDIAN_UPGRADE_BASE_COST_SOULS = 500
export const GUARDIAN_UPGRADE_COST_STEP_SOULS = 250
export const GUARDIAN_UPGRADE_HP_BONUS = 1200

export const WALKER_BASE_MAX_HP = 9000
export const WALKER_UPGRADE_HP_BONUS = 1800
export const BASE_GUARDIAN_BASE_MAX_HP = 4000
export const BASE_GUARDIAN_UPGRADE_HP_BONUS = 900
export const SHRINE_BASE_MAX_HP = 8000
export const SHRINE_UPGRADE_HP_BONUS = 1500
export const PATRON_STAGE1_BASE_MAX_HP = 12000
export const PATRON_STAGE2_BASE_MAX_HP = 12000
export const PATRON_UPGRADE_HP_BONUS = 2400

export const STRUCTURE_DAMAGE_PCT_PER_LEVEL = 25
export const STRUCTURE_FIRE_RATE_PCT_PER_LEVEL = 18
export const STRUCTURE_CDR_PCT_PER_LEVEL = 12
export const MAX_STRUCTURE_FORTIFY_AURA_STEPS = 12

export const MINOR_TOME_POOL: readonly MinorTomeDef[] = [
  {
    id: 'spirit',
    name: 'Tome of Spirit',
    shortLabel: 'Spirit',
    description: '+8 Spirit Power',
    kind: 'modifier',
    modifier: 'td_tome_spirit',
    color: '#c084fc',
  },
  {
    id: 'weapon',
    name: 'Tome of Arms',
    shortLabel: 'Weapon',
    description: '+10% Weapon Damage & +6% Ammo',
    kind: 'modifier',
    modifier: 'td_tome_weapon',
    color: '#fb923c',
  },
  {
    id: 'firerate',
    name: 'Tome of Haste',
    shortLabel: 'Fire Rate',
    description: '+5% Fire Rate',
    kind: 'modifier',
    modifier: 'td_tome_firerate',
    color: '#facc15',
  },
  {
    id: 'health',
    name: 'Tome of Vitality',
    shortLabel: 'Vitality',
    description: '+80 Max HP & +2 HP/s Regen',
    kind: 'modifier',
    modifier: 'td_tome_health',
    color: '#4ade80',
  },
  {
    id: 'cooldown',
    name: 'Tome of Focus',
    shortLabel: 'Cooldown',
    description: '+3% Ability Cooldown Reduction',
    kind: 'modifier',
    modifier: 'td_tome_cooldown',
    color: '#38bdf8',
  },
  {
    id: 'range',
    name: 'Tome of Reach',
    shortLabel: 'Reach',
    description: '+4% Ability Range & Radius',
    kind: 'modifier',
    modifier: 'td_tome_range',
    color: '#818cf8',
  },
  {
    id: 'omni',
    name: 'Tome of Omniscience',
    shortLabel: 'Omni',
    description: '+4 Spirit, +5% Weapon, +2.5% Rate, +40 HP, +1.5% CDR',
    kind: 'modifier',
    modifier: 'td_tome_omni',
    color: '#f472b6',
  },
  {
    id: 'ap_jackpot',
    name: 'Tome of Mastery',
    shortLabel: '+1 AP',
    description: '+1 Ability Point',
    kind: 'ap',
    amount: 1,
    color: '#2dd4bf',
  },
  {
    id: 'soul_jackpot',
    name: 'Soul Cache',
    shortLabel: 'Souls',
    description: '+83 Bonus Souls',
    kind: 'souls',
    amount: SOUL_CACHE_BASE_SOULS,
    color: '#ffd34d',
  },
] as const


export const MAJOR_BOON_POOL: readonly MajorBoonDef[] = [
  {
    id: 'archmage',
    title: 'Archmage Sigil',
    subtitle: '+24 Spirit Power & +6% Cooldown Reduction',
    modifiers: [
      { name: 'td_tome_spirit', stacks: 3 },
      { name: 'td_tome_cooldown', stacks: 2 },
    ],
    accent: '#c084fc',
  },
  {
    id: 'marksman',
    title: 'Deadeye Arsenal',
    subtitle: '+30% Weapon Dmg, +18% Ammo & +10% Fire Rate',
    modifiers: [
      { name: 'td_tome_weapon', stacks: 3 },
      { name: 'td_tome_firerate', stacks: 2 },
    ],
    accent: '#fb923c',
  },
  {
    id: 'juggernaut',
    title: 'Colossus Heart',
    subtitle: '+280 Max HP, +6 HP/s Regen & All-Stats Omni',
    modifiers: [
      { name: 'td_tome_health', stacks: 3 },
      { name: 'td_tome_omni', stacks: 1 },
    ],
    accent: '#4ade80',
  },
  {
    id: 'grandmaster',
    title: 'Ascendant Grimoire',
    subtitle: '+3 Ability Points & All-Stats Omni Tome',
    modifiers: [{ name: 'td_tome_omni', stacks: 1 }],
    bonusAp: 3,
    accent: '#38bdf8',
  },
  {
    id: 'warchest',
    title: 'Patron Warchest',
    subtitle: '+1,200 Souls & All-Stats Omni Tome',
    modifiers: [{ name: 'td_tome_omni', stacks: 1 }],
    bonusSouls: 1200,
    accent: '#ffd34d',
  },
  {
    id: 'bastion',
    title: 'Sapphire Bastion',
    subtitle:
      'Fortify All Structures (+Max HP, +25% Dmg, +18% Atk Spd, +2,000 Heal) & +80 Hero HP',
    modifiers: [{ name: 'td_tome_health', stacks: 1 }],
    guardianHeal: 2000,
    guardianUpgrade: true,
    accent: '#60a5fa',
  },
] as const

/** Server console configuration applied on world start. */
export const TD_SERVER_CVARS: readonly (readonly [string, string | number])[] = [
  ['sv_cheats', 0],
  ['sv_hibernate_when_empty', 0],
  ['sv_visiblemaxplayers', MAX_COOP_DEFENDER_PLAYERS],
  ['citadel_team_size', MAX_COOP_DEFENDER_PLAYERS],
  ['citadel_solo_bot_match', 0],
  ['citadel_koth_enabled', 0],
  ['citadel_neutral_spawn_enabled', 0],
  ['citadel_spawn_practice_bots', 0],
  ['citadel_pregame_wait_duration', 1],
  ['citadel_player_override_spawn_time', HERO_RESPAWN_TIME_SECONDS],
  ['citadel_player_spawn_time_max_respawn_time', HERO_RESPAWN_TIME_SECONDS],
  ['citadel_active_lane', 4],
  ['citadel_spawn_combine_only', 1],
  ['citadel_trooper_spawn_enabled', 1],
  ['citadel_trooper_spawn_initial', INITIAL_WAVE_DELAY_SECONDS],
  ['citadel_trooper_spawn_interval_early', WAVE_INTERVAL_SECONDS],
  ['citadel_trooper_spawn_interval_late', WAVE_INTERVAL_SECONDS],
  ['citadel_trooper_spawn_interval_very_late', WAVE_INTERVAL_SECONDS],
  ['citadel_trooper_spawn_interval_late_time', 999],
  ['citadel_trooper_spawn_interval_very_late_time', 999],
  ['citadel_trooper_squad_size', ZIPLINE_SQUAD_SIZE],
  ['citadel_trooper_health_mult_gametime', 9999],
  ['citadel_trooper_max_per_lane', 36],
  ['citadel_trooper_gold_reward', BASE_WAVE_SOUL_REWARD],
  ['citadel_trooper_gold_reward_bonus_per_minute', 33],
  ['citadel_player_gold_reward_min', 67],
  ['citadel_player_gold_reward_max', 733],
  ['citadel_player_gold_reward_first_kill_bonus', 42],
  ['citadel_tick_gold_payout_for_lowest', 0.0083],
  ['citadel_tick_gold_payout_for_second_lowest', 0.005],
  ['citadel_npc_disable_cockroaches', 1],
  ['citadel_dev_boss_backdoor_protection_disabled', 1],
  ['citadel_boss_tier_3_check_pit_modifier', 0],
  ['citadel_player_starting_team', DEFENDER_TEAM],
  ['citadel_tutorial_close_shop', 0],
  ['citadel_allow_purchasing_anywhere', 1],
  ['citadel_disable_purchasing_in_combat', 0],
] as const

/** Computes target creep Max HP for a 1-indexed wave number (+4%/wave). */
export function computeWaveCreepHp(wave: number): number {
  const clampedWave = Math.max(1, Math.floor(wave))
  const raw = Math.round(BASE_CREEP_HP * Math.pow(HP_GROWTH_RATE, clampedWave - 1))
  return Math.min(MAX_CREEP_HP, raw)
}

/** Computes outgoing damage multiplier for enemy creeps spawned on a 1-indexed wave. */
export function computeWaveCreepDamageMult(wave: number): number {
  const clampedWave = Math.max(1, Math.floor(wave))
  return Number(Math.pow(CREEP_DAMAGE_GROWTH_RATE, clampedWave - 1).toFixed(3))
}

/** Computes 3D model scale (0.90x -> 1.65x) for enemy creeps spawned on a 1-indexed wave. */
export function computeWaveCreepScale(wave: number): number {
  const clampedWave = Math.max(1, Math.floor(wave))
  const raw = BASE_CREEP_SCALE + (clampedWave - 1) * CREEP_SCALE_PER_WAVE
  return Number(Math.min(MAX_CREEP_SCALE, raw).toFixed(3))
}

/**
 * Maps a target creep scale (`0.90..1.65`) onto discrete hidden VData aura step `1..16`
 * (`td_creep_scale_aura_1..16`, `0.05` increments) so C++ `MODIFIER_VALUE_MODEL_SCALE`
 * scales BOTH visual models AND skeletal hitboxes (`CHitboxComponent`) synchronously.
 */
export function computeCreepScaleAuraStep(scale: number): number {
  const clamped = Math.max(BASE_CREEP_SCALE, Math.min(MAX_CREEP_SCALE, scale))
  const step = Math.round((clamped - BASE_CREEP_SCALE) / 0.05) + 1
  return Math.max(1, Math.min(MAX_CREEP_SCALE_AURA_STEPS, step))
}

/** Returns the active hidden creep-scale aura modifier (`td_creep_scale_aura_1..16`) for `wave`. */
export function getCreepScaleAuraModifier(wave: number): {
  readonly step: number
  readonly modifier: string
  readonly appliedScale: number
} {
  const targetScale = computeWaveCreepScale(wave)
  const step = computeCreepScaleAuraStep(targetScale)
  const appliedScale = Number((BASE_CREEP_SCALE + (step - 1) * 0.05).toFixed(2))
  return {
    step,
    modifier: `td_creep_scale_aura_${step}`,
    appliedScale,
  }
}

/**
 * Computes the Center Lane zipline spawn cadence (in seconds) for a given wave.
 * Each zipline capsule carries 4 seats (`ZIPLINE_SQUAD_SIZE = 4`), so numbers
 * scale smoothly by shortening the interval between 4-unit capsules (20s -> 7s)
 * without leaving stranded `lifeState=2` troopers in the skybase.
 */
export function computeWaveSpawnIntervalSeconds(wave: number): number {
  const clampedWave = Math.max(1, Math.floor(wave))
  if (clampedWave <= 3) return 20
  if (clampedWave <= 6) return 17
  if (clampedWave <= 10) return 14
  if (clampedWave <= 15) return 11
  if (clampedWave <= 22) return 9
  return MIN_SPAWN_INTERVAL_SECONDS
}

/** Computes creep Soul bounty for a 1-indexed wave number (reduced 3x). */
export function computeWaveSoulReward(wave: number): number {
  const clampedWave = Math.max(1, Math.floor(wave))
  return Math.min(MAX_WAVE_SOUL_REWARD, Math.round((150 + (clampedWave - 1) * 25) / 3))
}

/**
 * Evaluates whether an already-scaled live creep had its `maxHealth` reset by
 * the engine (e.g. upon dismounting the Center Lane zipline), restoring its
 * assigned `maxHealth` proportionally to its current HP fraction while NEVER
 * healing combat damage when `currentMaxHp >= assignedMaxHp`.
 */
export function evaluateCreepHealthSync(
  currentHp: number,
  currentMaxHp: number,
  assignedMaxHp: number,
): {
  readonly needsApply: boolean
  readonly newHp: number
  readonly newMaxHp: number
} {
  if (currentHp <= 0 || currentMaxHp <= 0 || currentMaxHp >= assignedMaxHp) {
    return {
      needsApply: false,
      newHp: currentHp,
      newMaxHp: currentMaxHp,
    }
  }
  const hpRatio = Math.max(0, Math.min(1, currentHp / currentMaxHp))
  const restoredHp = Math.max(1, Math.round(assignedMaxHp * hpRatio))
  return {
    needsApply: true,
    newHp: restoredHp,
    newMaxHp: assignedMaxHp,
  }
}

/** Maps a 1-indexed wave number onto VData modifier tier 1..10. */
export function computeWaveTier(wave: number): number {
  const clampedWave = Math.max(1, Math.floor(wave))
  return Math.min(MAX_CREEP_TIER, Math.floor((clampedWave - 1) / 5) + 1)
}

/** Returns the VData size and strength modifier names for a given wave. */
export function getWaveCreepModifiers(wave: number): {
  readonly tier: number
  readonly sizeModifier: string
  readonly strengthModifier: string
} {
  const tier = computeWaveTier(wave)
  return {
    tier,
    sizeModifier: `td_creep_size_${tier}`,
    strengthModifier: `td_creep_strength_${tier}`,
  }
}

export function isExplodingZombieBaseMaxHp(unscaledMaxHp: number): boolean {
  return unscaledMaxHp >= 380 && unscaledMaxHp <= 440
}

/**
 * Pure model/designer check identifying exploding melee troopers & Graves Shamblers
 * (`npc_necro_skele`, `necro_shambler`, and `amber_trooper_01_melee` / `sapphire_trooper_01_melee`).
 */
export function isExplodingZombieIdentity(
  designerName: string | undefined,
  modelName: string | undefined,
  unscaledMaxHp: number,
): boolean {
  if (designerName === 'npc_necro_skele') {
    return true
  }
  if (designerName && designerName !== 'npc_trooper') {
    return false
  }
  if (typeof modelName === 'string' && modelName.length > 0) {
    return modelName.includes('necro_shambler') || modelName.includes('_melee')
  }
  return isExplodingZombieBaseMaxHp(unscaledMaxHp)
}

export type ZombieDetonationTargetKind =
  | 'hero'
  | 'guardian'
  | 'walker'
  | 'base_guardian'
  | 'shrine'
  | 'patron'

const ZOMBIE_DETONATION_RADII: Readonly<
  Record<ZombieDetonationTargetKind, { readonly max2D: number; readonly maxDz: number }>
> = {
  hero: { max2D: 185, maxDz: 160 },
  guardian: { max2D: 500, maxDz: 220 },
  walker: { max2D: 710, maxDz: 260 },
  base_guardian: { max2D: 380, maxDz: 240 },
  shrine: { max2D: 380, maxDz: 240 },
  patron: { max2D: 560, maxDz: 380 },
}

/**
 * Pure spatial check deciding whether a Graves Zombie at `zombiePos` has reached
 * kamikaze detonation range of a defender hero, Guardian (`472.441u` ring),
 * Walker (`700u` ring), or Shrine (`350u` ring).
 */
export function isWithinZombieDetonationRange(
  zombiePos: { readonly x: number; readonly y: number; readonly z: number },
  targetPos: { readonly x: number; readonly y: number; readonly z: number },
  kind: ZombieDetonationTargetKind,
): boolean {
  const bounds = ZOMBIE_DETONATION_RADII[kind]
  if (Math.abs(zombiePos.z - targetPos.z) > bounds.maxDz) {
    return false
  }
  const dx = zombiePos.x - targetPos.x
  const dy = zombiePos.y - targetPos.y
  return dx * dx + dy * dy <= bounds.max2D * bounds.max2D
}

export interface WaveNeutralSpawnSpec {
  readonly unit: WaveNeutralVarietyDef['unit']
  readonly vanillaUnit: WaveNeutralVarietyDef['vanillaUnit']
  readonly label: string
  readonly targetHp: number
  readonly targetScale: number
  readonly origin: { readonly x: number; readonly y: number; readonly z: number }
}

/**
 * Deterministic neutral creep variety generator for Center Lane waves (with the
 * static side camp disabled). Waves 1-5 spawn 2 distinct neutral variants per
 * wave; Waves 6+ spawn 3 distinct neutral variants per wave, rotating across
 * Lantern, Puppeteer, Pigeon, and Giant Mushroom.
 */
export function getWaveNeutralSpawns(wave: number): WaveNeutralSpawnSpec[] {
  const clampedWave = Math.max(1, Math.floor(wave))
  const baseHp = computeWaveCreepHp(clampedWave)
  const baseScale = computeWaveCreepScale(clampedWave)
  const count = clampedWave >= 6 ? 3 : 2
  const startIdx = ((clampedWave - 1) * 2) % WAVE_NEUTRAL_VARIETY_POOL.length
  const out: WaveNeutralSpawnSpec[] = []
  for (let i = 0; i < count; i++) {
    const def = WAVE_NEUTRAL_VARIETY_POOL[(startIdx + i) % WAVE_NEUTRAL_VARIETY_POOL.length]
    const origin = WAVE_NEUTRAL_SPAWN_OFFSETS[i % WAVE_NEUTRAL_SPAWN_OFFSETS.length]
    const scaledHp = Math.min(MAX_CREEP_HP, Math.max(1, Math.round(baseHp * def.hpMult)))
    const scaledSize = Number(
      Math.min(MAX_CREEP_SCALE, baseScale * def.scaleMult).toFixed(3),
    )
    out.push({
      unit: def.unit,
      vanillaUnit: def.vanillaUnit,
      label: def.label,
      targetHp: scaledHp,
      targetScale: scaledSize,
      origin,
    })
  }
  return out
}

export function isBossWave(wave: number): boolean {
  return wave >= BOSS_WAVE_INTERVAL && wave % BOSS_WAVE_INTERVAL === 0
}

/** Maps a Boss wave (5, 10, 15, 20, 25...) onto Boss VData tier 1..5. */
export function computeBossTier(wave: number): number {
  const bossIndex = Math.max(1, Math.floor(wave / BOSS_WAVE_INTERVAL))
  return Math.min(MAX_BOSS_TIER, bossIndex)
}

/** Computes outgoing damage multiplier for the 0-indexed Boss wave encounter (`0` = Wave 5, `1` = Wave 10, ...). */
export function computeBossDamageMult(bossIndex: number): number {
  const clampedIdx = Math.max(0, Math.floor(bossIndex))
  return Number(
    (BOSS_BASE_DAMAGE_MULT + clampedIdx * BOSS_DAMAGE_MULT_PER_BOSS_WAVE).toFixed(3),
  )
}

/** Returns the Boss hero name, VData modifier, and scaling parameters for a Boss wave. */
export function getBossWaveSpec(wave: number): {
  readonly tier: number
  readonly hero: string
  readonly modifier: string
  readonly bonusHp: number
  readonly endlessBoostStacks: number
  readonly extraSizeStacks: number
  readonly targetScale: number
  readonly damageMult: number
} {
  const tier = computeBossTier(wave)
  const bossIdx = Math.max(0, Math.floor(wave / BOSS_WAVE_INTERVAL) - 1)
  const hero = BOSS_HERO_POOL[bossIdx % BOSS_HERO_POOL.length]
  const wavesBeyondMaxTier =
    wave > 25 ? Math.floor((wave - 25) / BOSS_WAVE_INTERVAL) : 0
  const endlessBoostStacks = Math.min(
    MAX_BOSS_ENDLESS_BOOST_STACKS,
    wavesBeyondMaxTier,
  )
  const extraSizeStacks = Math.min(
    MAX_BOSS_EXTRA_SIZE_STACKS,
    wavesBeyondMaxTier,
  )
  const bonusHp =
    BOSS_TIER_BONUS_HP[tier - 1] + endlessBoostStacks * BOSS_ENDLESS_BOOST_HP
  const targetScale = Number(
    (BOSS_TIER_SCALE[tier - 1] + extraSizeStacks * BOSS_SCALE_STEP).toFixed(2),
  )
  const damageMult = computeBossDamageMult(bossIdx)
  return {
    tier,
    hero,
    modifier: `td_boss_hero_stats_${tier}`,
    bonusHp,
    endlessBoostStacks,
    extraSizeStacks,
    targetScale,
    damageMult,
  }
}

/**
 * Filters a list of live creep entity handles down to ONLY newly spawned
 * creeps that have not yet been scaled, recording them in `scaledCreeps`.
 * This guarantees damaged creeps are NEVER healed mid-fight when later waves
 * or scaling ticks run.
 */
export function selectUnscaledCreeps(
  liveCreepHandles: readonly number[],
  scaledCreeps: Set<number>,
): number[] {
  const newlySpawned: number[] = []
  for (const handle of liveCreepHandles) {
    if (handle > 0 && !scaledCreeps.has(handle)) {
      scaledCreeps.add(handle)
      newlySpawned.push(handle)
    }
  }
  return newlySpawned
}

export function computeGuardianUpgradeCost(upgradeLevel: number): number {
  const clamped = Math.max(0, Math.floor(upgradeLevel))
  return GUARDIAN_UPGRADE_BASE_COST_SOULS + clamped * GUARDIAN_UPGRADE_COST_STEP_SOULS
}

/** Computes outgoing damage multiplier (`1 + 0.25 * level`) for all fortified Team 2 structures. */
export function computeStructureDamageMult(upgradeLevel: number): number {
  const clamped = Math.max(0, Math.floor(upgradeLevel))
  return Number((1 + (clamped * STRUCTURE_DAMAGE_PCT_PER_LEVEL) / 100).toFixed(3))
}

/**
 * Computes the active hidden structure fortification aura (`td_structure_fortify_aura_1..12`)
 * and attack-speed / damage bonuses for `upgradeLevel`.
 */
export function getStructureFortifyAuraSpec(upgradeLevel: number): {
  readonly active: boolean
  readonly step: number
  readonly modifier: string
  readonly damageMult: number
  readonly damageBonusPct: number
  readonly fireRateBonusPct: number
  readonly cdrBonusPct: number
} {
  const clamped = Math.max(0, Math.floor(upgradeLevel))
  if (clamped <= 0) {
    return {
      active: false,
      step: 0,
      modifier: '',
      damageMult: 1,
      damageBonusPct: 0,
      fireRateBonusPct: 0,
      cdrBonusPct: 0,
    }
  }
  const step = Math.min(MAX_STRUCTURE_FORTIFY_AURA_STEPS, clamped)
  return {
    active: true,
    step,
    modifier: `td_structure_fortify_aura_${step}`,
    damageMult: computeStructureDamageMult(clamped),
    damageBonusPct: clamped * STRUCTURE_DAMAGE_PCT_PER_LEVEL,
    fireRateBonusPct: step * STRUCTURE_FIRE_RATE_PCT_PER_LEVEL,
    cdrBonusPct: Math.min(72, step * STRUCTURE_CDR_PCT_PER_LEVEL),
  }
}

export interface BaseDefenseSnapshot {
  readonly guardianHp: number
  readonly walkerHp: number
  readonly baseGuardiansHp: number
  readonly shrinesHp: number
  readonly patronHp: number
  /** `ETier3Phase_t`: `0` = Stage 1, `2` = Transforming, `1` = Weakened Stage 2 in Pit. */
  readonly patronPhase: number
  readonly patronReachedStage2: boolean
}

/**
 * Pure evaluator for full Deadlock base defense progression:
 * `Guardian -> Walker -> Base Guardians -> Shrines -> Patron Stage 1 -> Patron Stage 2 -> Defeat`.
 * Match NEVER ends when Guardian, Walker, Base Guardians, Shrines, or Patron Stage 1 fall!
 */
export function evaluateBaseDefenseProgression(snap: BaseDefenseSnapshot): {
  readonly stage: DefenseStage
  readonly stageLabel: string
  readonly defeated: boolean
} {
  if (snap.guardianHp > 0) {
    return { stage: 'guardian', stageLabel: 'BLUE GUARDIAN', defeated: false }
  }
  if (snap.walkerHp > 0) {
    return { stage: 'walker', stageLabel: 'BLUE WALKER', defeated: false }
  }
  if (snap.baseGuardiansHp > 0) {
    return {
      stage: 'base_guardians',
      stageLabel: 'BASE GUARDIANS',
      defeated: false,
    }
  }
  if (snap.shrinesHp > 0) {
    return { stage: 'shrines', stageLabel: 'AMBER SHRINES', defeated: false }
  }
  const inStage2 = snap.patronReachedStage2 || snap.patronPhase === 1
  if (!inStage2) {
    return {
      stage: 'patron_stage1',
      stageLabel: 'PATRON STAGE 1',
      defeated: false,
    }
  }
  return {
    stage: 'patron_stage2',
    stageLabel: 'WEAKENED PATRON',
    defeated: snap.patronHp <= 0,
  }
}

export interface RepairableStructureInput {
  readonly id: string
  readonly hp: number
  readonly maxHp: number
}

/**
 * Pure evaluator for All-Structure Repair (`/repair` & HUD Repair button):
 * spends `GUARDIAN_REPAIR_COST_SOULS` once and heals EVERY damaged, alive Team 2
 * structure by `+GUARDIAN_REPAIR_AMOUNT_HP` (clamped to each structure's `maxHp`).
 */
export function evaluateAllStructuresRepair(
  structures: readonly RepairableStructureInput[],
  playerSouls: number,
): {
  readonly ok: boolean
  readonly soulsSpent: number
  readonly repairedCount: number
  readonly totalHealed: number
  readonly updates: readonly { readonly id: string; readonly newHp: number; readonly healed: number }[]
  readonly reason?: string
} {
  const alive = structures.filter((s) => s.hp > 0 && s.maxHp > 0)
  if (alive.length === 0) {
    return {
      ok: false,
      soulsSpent: 0,
      repairedCount: 0,
      totalHealed: 0,
      updates: [],
      reason: 'All defense structures have already fallen.',
    }
  }
  const damaged = alive.filter((s) => s.hp < s.maxHp)
  if (damaged.length === 0) {
    return {
      ok: false,
      soulsSpent: 0,
      repairedCount: 0,
      totalHealed: 0,
      updates: [],
      reason: 'All alive structures are already at full health.',
    }
  }
  if (playerSouls < GUARDIAN_REPAIR_COST_SOULS) {
    return {
      ok: false,
      soulsSpent: 0,
      repairedCount: 0,
      totalHealed: 0,
      updates: [],
      reason: `Need ${GUARDIAN_REPAIR_COST_SOULS} Souls to repair structures.`,
    }
  }
  let totalHealed = 0
  const updates = damaged.map((s) => {
    const newHp = Math.min(s.maxHp, s.hp + GUARDIAN_REPAIR_AMOUNT_HP)
    const healed = newHp - s.hp
    totalHealed += healed
    return { id: s.id, newHp, healed }
  })
  return {
    ok: true,
    soulsSpent: GUARDIAN_REPAIR_COST_SOULS,
    repairedCount: updates.length,
    totalHealed,
    updates,
  }
}

/** Evaluates a Guardian repair request and computes the resulting HP and Soul cost. */
export function computeGuardianRepair(
  currentHp: number,
  maxHp: number,
  playerSouls: number,
): {
  readonly ok: boolean
  readonly newHp: number
  readonly healedAmount: number
  readonly soulsSpent: number
  readonly reason?: string
} {
  if (currentHp <= 0) {
    return {
      ok: false,
      newHp: 0,
      healedAmount: 0,
      soulsSpent: 0,
      reason: 'Guardian has already fallen.',
    }
  }
  if (currentHp >= maxHp) {
    return {
      ok: false,
      newHp: currentHp,
      healedAmount: 0,
      soulsSpent: 0,
      reason: 'Guardian is already at full health.',
    }
  }
  if (playerSouls < GUARDIAN_REPAIR_COST_SOULS) {
    return {
      ok: false,
      newHp: currentHp,
      healedAmount: 0,
      soulsSpent: 0,
      reason: `Need ${GUARDIAN_REPAIR_COST_SOULS} Souls to repair Guardian.`,
    }
  }
  const newHp = Math.min(maxHp, currentHp + GUARDIAN_REPAIR_AMOUNT_HP)
  return {
    ok: true,
    newHp,
    healedAmount: newHp - currentHp,
    soulsSpent: GUARDIAN_REPAIR_COST_SOULS,
  }
}

export interface TdHandoffState {
  readonly version: 1
  readonly wave: number
  readonly nextWaveTime: number
  readonly matchState: 'waiting' | 'active' | 'defeat' | 'victory'
  readonly guardianUpgradeLevel: number
  readonly guardianBonusMaxHp: number
  readonly patronReachedStage2?: boolean
  readonly scaledCreeps: readonly number[]
  readonly explodingZombies?: readonly number[]
  readonly rewardedCreeps: readonly number[]
  readonly playerTomes: Record<string, Record<string, number>>
  readonly playerKills: Record<string, number>
  readonly runId?: string
  readonly runRankedEligible?: boolean
  readonly runDisqualifyReason?: string
  readonly runSubmittedSlots?: readonly number[]
  readonly runReportedBestBySlot?: Record<string, { wave: number; kills: number }>
  readonly runReportedKillsBySlot?: Record<string, number>
  readonly runReportSeq?: number
  readonly runLastReportAccepted?: boolean
  readonly runAcceptedReportsCount?: number
  readonly awaitingHeroPickSlots?: readonly number[]
}

/** Serializes Tower Defense state for Modlock hot-reload `handoff()`. */
export function serializeTdHandoff(state: TdHandoffState): string {
  return JSON.stringify(state)
}

/** Deserializes Tower Defense state from Modlock `handedOff()`, returning undefined on invalid input. */
export function deserializeTdHandoff(raw: string | undefined): TdHandoffState | undefined {
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw) as Partial<TdHandoffState>
    if (
      parsed.version !== 1 ||
      typeof parsed.wave !== 'number' ||
      typeof parsed.nextWaveTime !== 'number' ||
      typeof parsed.matchState !== 'string'
    ) {
      return undefined
    }
    return {
      version: 1,
      wave: Math.max(0, Math.floor(parsed.wave)),
      nextWaveTime: parsed.nextWaveTime,
      matchState: parsed.matchState,
      guardianUpgradeLevel: Number(parsed.guardianUpgradeLevel ?? 0),
      guardianBonusMaxHp: Number(parsed.guardianBonusMaxHp ?? 0),
      patronReachedStage2: Boolean(parsed.patronReachedStage2 ?? false),
      scaledCreeps: Array.isArray(parsed.scaledCreeps) ? parsed.scaledCreeps : [],
      explodingZombies: Array.isArray(parsed.explodingZombies)
        ? parsed.explodingZombies
        : [],
      rewardedCreeps: Array.isArray(parsed.rewardedCreeps) ? parsed.rewardedCreeps : [],
      playerTomes:
        parsed.playerTomes && typeof parsed.playerTomes === 'object'
          ? parsed.playerTomes
          : {},
      playerKills:
        parsed.playerKills && typeof parsed.playerKills === 'object'
          ? parsed.playerKills
          : {},
      ...(typeof parsed.runId === 'string' ? { runId: parsed.runId } : {}),
      ...(typeof parsed.runRankedEligible === 'boolean'
        ? { runRankedEligible: parsed.runRankedEligible }
        : {}),
      ...(typeof parsed.runDisqualifyReason === 'string'
        ? { runDisqualifyReason: parsed.runDisqualifyReason }
        : {}),
      ...(Array.isArray(parsed.runSubmittedSlots)
        ? { runSubmittedSlots: parsed.runSubmittedSlots }
        : {}),
      ...(parsed.runReportedBestBySlot &&
      typeof parsed.runReportedBestBySlot === 'object'
        ? { runReportedBestBySlot: parsed.runReportedBestBySlot }
        : {}),
      ...(parsed.runReportedKillsBySlot &&
      typeof parsed.runReportedKillsBySlot === 'object'
        ? { runReportedKillsBySlot: parsed.runReportedKillsBySlot }
        : {}),
      ...(typeof parsed.runReportSeq === 'number'
        ? { runReportSeq: parsed.runReportSeq }
        : {}),
      ...(typeof parsed.runLastReportAccepted === 'boolean'
        ? { runLastReportAccepted: parsed.runLastReportAccepted }
        : {}),
      ...(typeof parsed.runAcceptedReportsCount === 'number'
        ? { runAcceptedReportsCount: parsed.runAcceptedReportsCount }
        : {}),
      ...(Array.isArray(parsed.awaitingHeroPickSlots)
        ? {
            awaitingHeroPickSlots: parsed.awaitingHeroPickSlots.filter(
              (n): n is number => typeof n === 'number',
            ),
          }
        : {}),
    }
  } catch {
    return undefined
  }
}

export function getDefenderStageSpawnOrigin(stage: DefenseStage): {
  readonly x: number
  readonly y: number
  readonly z: number
} {
  switch (stage) {
    case 'guardian':
      return { x: 0, y: -1950, z: 396 }
    case 'walker':
      return { x: -1288, y: -3850, z: 392 }
    case 'base_guardians':
      return { x: -1280, y: -5850, z: 654 }
    case 'shrines':
      return { x: -1280, y: -6850, z: 654 }
    case 'patron_stage1':
    case 'patron_stage2':
      return { x: -1280, y: -7200, z: 654 }
  }
}

export function getStructureFortifyEntityModifiers(fortifyLevel: number): string[] {
  const lv = Math.max(0, Math.floor(fortifyLevel))
  if (lv <= 0) {
    return []
  }
  const mods = decomposeBinaryEntityModifiers(
    lv * STRUCTURE_FIRE_RATE_PCT_PER_LEVEL,
    FIRE_RATE_ENTITY_MODIFIERS,
  )
  if (lv >= 2) {
    mods.push(STRUCTURE_CDR_ENTITY_MODIFIER)
  }
  return mods
}

export type BossObjectiveKind =
  | 'guardian'
  | 'walker'
  | 'base_guardian'
  | 'shrine_east'
  | 'shrine_west'
  | 'patron_stage1'
  | 'patron_stage2'

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

const POST_GUARDIAN_TO_WALKER: readonly [readonly Vector[], readonly Vector[]] = [
  [
    { x: -215, y: -1792, z: 384 },
    { x: -60, y: -2360, z: 384 },
    { x: -544, y: -2872, z: 384 },
    { x: -1040, y: -3050, z: 380 },
  ],
  [
    { x: 215, y: -1792, z: 384 },
    { x: 40, y: -2360, z: 384 },
    { x: -544, y: -2872, z: 384 },
    { x: -1040, y: -3050, z: 380 },
  ],
]

const POST_WALKER_TO_BASE_GATE: readonly Vector[] = [
  { x: -1050, y: -3472, z: 380 },
  { x: -1264, y: -3880, z: 384 },
  { x: -1280, y: -4352, z: 430 },
  { x: -1280, y: -4835, z: 530 },
  { x: -1280, y: -5020, z: 615 },
]

const COURTYARD_HUB: readonly Vector[] = [
  { x: -1280, y: -5780, z: 641 },
  { x: -1280, y: -6450, z: 641 },
  { x: -1280, y: -6850, z: 641 },
]

const COURTYARD_TO_EAST_SHRINE: readonly Vector[] = [
  { x: -520, y: -6890, z: 695 },
  { x: 40, y: -6944, z: 768 },
  { x: 210, y: -7190, z: 920 },
]

const COURTYARD_TO_WEST_SHRINE: readonly Vector[] = [
  { x: -2020, y: -6890, z: 695 },
  { x: -2632, y: -6960, z: 768 },
  { x: -2770, y: -7190, z: 920 },
]

const COURTYARD_TO_PATRON_STAGE1: readonly Vector[] = [
  { x: -1280, y: -7200, z: 641 },
  { x: -1280, y: -7460, z: 641 },
]

const COURTYARD_TO_PATRON_STAGE2: readonly Vector[] = [
  { x: -1280, y: -7200, z: 641 },
  { x: -1280, y: -7540, z: 641 },
  { x: -1280, y: -7800, z: 632 },
]

/**
 * Returns the full Center Lane -> Base waypoint chain for `routeIndex` (`0` West / `1` East)
 * leading to the active vulnerable objective (`Guardian -> Walker -> Base Guardians -> Shrines -> Patron`).
 */
export function getBossWaypointsForObjective(
  routeIndex: 0 | 1,
  objectiveKind: BossObjectiveKind = 'guardian',
): readonly Vector[] {
  const upper = BOSS_LANE_ROUTES[routeIndex]
  if (objectiveKind === 'guardian') {
    return upper
  }
  const toWalker = [...upper, ...POST_GUARDIAN_TO_WALKER[routeIndex]]
  if (objectiveKind === 'walker') {
    return toWalker
  }
  const toBaseGate = [...toWalker, ...POST_WALKER_TO_BASE_GATE]
  if (objectiveKind === 'base_guardian') {
    return toBaseGate
  }
  const toCourtyard = [...toBaseGate, ...COURTYARD_HUB]
  if (objectiveKind === 'shrine_east') {
    return [...toCourtyard, ...COURTYARD_TO_EAST_SHRINE]
  }
  if (objectiveKind === 'shrine_west') {
    return [...toCourtyard, ...COURTYARD_TO_WEST_SHRINE]
  }
  if (objectiveKind === 'patron_stage1') {
    return [...toCourtyard, ...COURTYARD_TO_PATRON_STAGE1]
  }
  return [...toCourtyard, ...COURTYARD_TO_PATRON_STAGE2]
}

export const TD_BOSS_CORRIDOR_CONFIG: BotCorridorConfig = {
  northCorridorMinY: -2200,
  northCorridorMaxAbsX: 380,
  antiKiteMinY: -1050,
  upperPitBiasMinY: -950,
  pedestalGuardObjectiveKind: 'guardian',
  pedestalGuardMaxY: -1300,
  courtyardMaxY: -6000,
  defaultMinStandoff: BOSS_GUARDIAN_MIN_STANDOFF,
  defaultSiegeRange: BOSS_GUARDIAN_SIEGE_RANGE,
}

export function createBossAiState(spawnOrigin: Vector, now = 0): BossAiState {
  return createGenericBotAiState(spawnOrigin, now, BOSS_LANE_ROUTES)
}

export interface BossStepInput
  extends Omit<BotStepInput, 'waypoints' | 'corridor'> {
  readonly waypoints?: readonly Vector[]
  readonly corridor?: BotCorridorConfig
}

export function planBossDriveStep(input: BossStepInput): BossDrivePlan {
  const waypoints =
    input.waypoints ??
    getBossWaypointsForObjective(
      input.state.routeIndex,
      (input.guardian?.objectiveKind as BossObjectiveKind | undefined) ?? 'guardian',
    )
  return planBotDriveStep({
    ...input,
    waypoints,
    corridor: input.corridor ?? TD_BOSS_CORRIDOR_CONFIG,
  })
}

export function pickThreeTdMajorBoons(
  wave: number,
  playerSlot = 0,
): [MajorBoonDef, MajorBoonDef, MajorBoonDef] {
  return pickThreeMajorBoons(wave, playerSlot, MAJOR_BOON_POOL)
}
