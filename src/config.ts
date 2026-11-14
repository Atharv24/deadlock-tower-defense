// Central tuning configuration and pure, deterministic domain logic for
// Deadlock Tower Defense.

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

export const HERO_RESPAWN_TIME_SECONDS = 5
export const MAX_COOP_DEFENDER_PLAYERS = 12

export const DEFAULT_TOME_GROWTH_PER_WAVE = 0.06
export const MAX_TOME_GROWTH_PER_WAVE = 0.5
export const MAX_TOME_WAVE_MULTIPLIER = 8.0

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
export const BOSS_COLOSSUS_APPLIED_SCALE = 1.38
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

export const BOSS_SPAWN_ORIGIN = { x: 0, y: 1200, z: 390 } as const
export const BOSS_SPAWN_ANGLES = { pitch: 0, yaw: 270, roll: 0 } as const

export const PLAYER_SPAWN_ORIGIN = { x: 0, y: -1950, z: 396 } as const
export const PLAYER_SPAWN_ANGLES = { pitch: 0, yaw: 90, roll: 0 } as const
export const GUARDIAN_ORIGIN = { x: 0, y: -1792, z: 384 } as const
export const DEFENDER_TEAM = 2

export const GUARDIAN_TARGETNAMES = [
  'boss_rebel_t1_blue',
  '[PR#]boss_rebel_t1_blue',
] as const

export const WALKER_TARGETNAMES = [
  'rebels_t2_boss_blue',
  '[PR#]rebels_t2_boss_blue',
] as const

export const BASE_GUARDIAN_TARGETNAMES = [
  'rebels_watcher_blue',
  '[PR#]rebels_watcher_blue',
] as const

export const EAST_SHRINE_TARGETNAMES = [
  'amber_t3_generator_purple',
  '[PR#]amber_t3_generator_purple',
] as const

export const WEST_SHRINE_TARGETNAMES = [
  'amber_t3_generator_yellow',
  '[PR#]amber_t3_generator_yellow',
] as const

export const WALKER_ORIGIN = { x: -1288, y: -3472, z: 376 } as const
export const BASE_GUARDIAN_ORIGIN = { x: -1280, y: -5456, z: 641 } as const
export const EAST_SHRINE_ORIGIN = { x: 299, y: -7535, z: 980 } as const
export const WEST_SHRINE_ORIGIN = { x: -2859, y: -7535, z: 980 } as const
export const PATRON_ORIGIN = { x: -1280, y: -8034, z: 632 } as const

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

export const TOME_DROP_CHANCE = 0.10

export type MinorTomeKind = 'modifier' | 'ap' | 'souls'

export interface MinorTomeDef {
  readonly id: string
  readonly name: string
  readonly shortLabel: string
  readonly description: string
  readonly kind: MinorTomeKind
  readonly modifier?: string
  readonly amount?: number
  readonly color: string
}

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

export interface MajorBoonDef {
  readonly id: string
  readonly title: string
  readonly subtitle: string
  readonly modifiers: readonly { readonly name: string; readonly stacks: number }[]
  readonly bonusAp?: number
  readonly bonusSouls?: number
  readonly guardianHeal?: number
  readonly guardianUpgrade?: boolean
  readonly accent: string
}

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

/**
 * Decides whether the mod should force-unlock the player's mouse cursor without
 * holding TAB. Milestone Major Boon prompts appear mid-combat on Boss waves and
 * MUST NOT unlock the mouse cursor (players hold TAB to click or use /boon 1..3).
 */
export function shouldFreeHudCursor(opts: {
  readonly needsHeroPick: boolean
  readonly hasPendingBoons: boolean
  readonly legendaryShopOpen?: boolean
  readonly leaderboardOpen?: boolean
  readonly matchState: string
}): boolean {
  return (
    opts.needsHeroPick ||
    Boolean(opts.legendaryShopOpen) ||
    Boolean(opts.leaderboardOpen) ||
    opts.matchState === 'defeat'
  )
}

/**
 * Parses a slash command from a chat line (e.g. "/boon 2" -> { name: "boon", args: "2" }),
 * allowing slash commands to execute identically in Team Chat (`!line.all`) and All-Chat.
 */
export function parseSlashCommandLine(
  text: string,
): { readonly name: string; readonly args: string } | undefined {
  const trimmed = text.trim()
  if (!trimmed.startsWith('/') || trimmed.length < 2) {
    return undefined
  }
  const body = trimmed.slice(1).trim()
  if (!body) {
    return undefined
  }
  const spaceIdx = body.search(/\s/)
  if (spaceIdx < 0) {
    return { name: body.toLowerCase(), args: '' }
  }
  return {
    name: body.slice(0, spaceIdx).toLowerCase(),
    args: body.slice(spaceIdx + 1).trim(),
  }
}

/**
 * Identifies whether an unscaled `npc_trooper` base maxHealth corresponds to
 * `trooper_melee` (Graves Zombie: base `m_nMaxHealth = 413` custom / `400` vanilla,
 * vs `150`–`300` for `trooper_normal`, `trooper_medic`, and `td_neutral_*`).
 */
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

export interface VanillaTomeBonuses {
  readonly weaponDamageMult: number
  readonly abilityDamageMult: number
  readonly bonusMaxHp: number
  readonly regenPerSecond: number
  readonly cooldownReductionFraction: number
}

/**
 * Computes runtime stat multipliers for Minor Tomes & Major Boons from the
 * accumulated Tome tally.
 */
export function computeVanillaTomeBonuses(
  tally: Readonly<Record<string, number>>,
): VanillaTomeBonuses {
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
 * Vitality & Omni Tomes grant exact Effective Max HP on vanilla servers without
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

/** Reports whether the given 1-indexed wave number is a Boss Hero wave. */
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

export interface LastHitDamageInput {
  readonly victim: number
  readonly attacker: number
  readonly healthBefore: number
  readonly healthLost: number
}

export interface LastHitEvaluation {
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

/**
 * Pure evaluator for `onDamaged` creep kills:
 * 1. Verifies the hit was lethal (`healthBefore > 0 && healthLost >= healthBefore`).
 * 2. Verifies the victim is a valid enemy creep/trooper/neutral.
 * 3. Rejects Friendly Blue T1 Guardian kills and non-player attackers.
 * 4. Deduplicates by `victim` handle in `rewardedCreeps` so multi-pellet shotgun
 *    blasts or same-tick DoTs never roll twice for the same creep.
 * 5. Rolls `TOME_DROP_CHANCE` (10%) and selects a Tome from `MINOR_TOME_POOL`.
 */
export function evaluateCreepLastHit(
  hit: LastHitDamageInput,
  validCreepEntities: ReadonlySet<number>,
  playerPawnToSlot: ReadonlyMap<number, number>,
  guardianEntities: ReadonlySet<number>,
  rewardedCreeps: Set<number>,
  rngRoll: number,
  tomePickRoll = rngRoll / TOME_DROP_CHANCE,
): LastHitEvaluation {
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

  if (rngRoll < 0 || rngRoll >= TOME_DROP_CHANCE) {
    return {
      isKill: true,
      isPlayerKill: true,
      granted: false,
      playerSlot,
      reason: 'rng_miss',
    }
  }

  const normalizedPick = Math.max(0, Math.min(0.999999, tomePickRoll))
  const poolIdx = Math.floor(normalizedPick * MINOR_TOME_POOL.length)
  const tome = MINOR_TOME_POOL[poolIdx]
  return {
    isKill: true,
    isPlayerKill: true,
    granted: true,
    playerSlot,
    tome,
    reason: 'granted',
  }
}

/** Picks 3 distinct Major Boons from MAJOR_BOON_POOL for a milestone/Boss wave. */
export function pickThreeMajorBoons(
  wave: number,
  playerSlot = 0,
): [MajorBoonDef, MajorBoonDef, MajorBoonDef] {
  const total = MAJOR_BOON_POOL.length
  const start = Math.abs(wave * 7 + playerSlot * 3) % total
  const first = MAJOR_BOON_POOL[start]
  const second = MAJOR_BOON_POOL[(start + 2) % total]
  const third = MAJOR_BOON_POOL[(start + 4) % total]
  return [first, second, third]
}

/** Computes the Soul cost of the next base fortification level (0-indexed). */
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

export const BOARD_HIGHEST_WAVE = 'td.highest_wave'
export const BOARD_CREEPS_SLAIN = 'td.creeps_slain'

export interface LeaderboardSubmissionInput {
  readonly wave: number
  readonly kills: number
  readonly rankedEligible: boolean
  readonly isProbeMode: boolean
  readonly alreadySubmitted: boolean
  readonly minWave?: number
}

export type LeaderboardSubmissionDecision =
  | {
      readonly shouldSubmit: true
      readonly waveScore: number
      readonly tiebreak: number
      readonly creepsScore: number
    }
  | {
      readonly shouldSubmit: false
      readonly reason: 'probe' | 'unranked' | 'already_submitted' | 'below_min_wave'
    }

/** Pure evaluator determining whether a Tower Defense run should be submitted to Hyperline leaderboards. */
export function evaluateLeaderboardSubmission(
  opts: LeaderboardSubmissionInput,
): LeaderboardSubmissionDecision {
  if (opts.isProbeMode) {
    return { shouldSubmit: false, reason: 'probe' }
  }
  if (!opts.rankedEligible) {
    return { shouldSubmit: false, reason: 'unranked' }
  }
  if (opts.alreadySubmitted) {
    return { shouldSubmit: false, reason: 'already_submitted' }
  }
  const minWave = Math.max(1, Math.floor(opts.minWave ?? 1))
  const flooredWave = Math.floor(opts.wave)
  if (flooredWave < minWave) {
    return { shouldSubmit: false, reason: 'below_min_wave' }
  }
  const waveScore = Math.min(999, Math.max(1, flooredWave))
  const safeKills = Math.max(0, Math.floor(opts.kills))
  return {
    shouldSubmit: true,
    waveScore,
    // Lower tiebreak ranks first in Modlock scores.proto; negate kills so more Creep Last-Hits wins ties.
    tiebreak: -safeKills,
    creepsScore: Math.min(100_000, safeKills),
  }
}

export interface LeaderboardCheckpointInput {
  readonly wave: number
  readonly kills: number
  readonly rankedEligible: boolean
  readonly isProbeMode: boolean
  readonly requireProgressOnWave1?: boolean
  readonly prevBest?: { readonly wave: number; readonly kills: number }
  readonly prevReportedKills?: number
}

export interface LeaderboardCheckpointDecision {
  readonly eligible: boolean
  readonly shouldReportWave: boolean
  readonly waveScore: number
  readonly safeKills: number
  readonly tiebreak: number
  readonly creepsDelta: number
}

/**
 * Pure evaluator for progressive per-wave / disconnect Hyperline leaderboard checkpoints:
 * - `td.highest_wave` (`KEEP_BEST`) updates whenever wave (or kills tiebreak) improves.
 * - `td.creeps_slain` (`KEEP_SUM`) reports only the delta since the last checkpoint so kills
 *   accumulate accurately across live checkpoints and mid-run disconnects without double-counting.
 */
export function evaluateLeaderboardCheckpoint(
  opts: LeaderboardCheckpointInput,
): LeaderboardCheckpointDecision {
  if (opts.isProbeMode || !opts.rankedEligible) {
    return {
      eligible: false,
      shouldReportWave: false,
      waveScore: 0,
      safeKills: 0,
      tiebreak: 0,
      creepsDelta: 0,
    }
  }
  const flooredWave = Math.floor(opts.wave)
  const safeKills = Math.max(0, Math.floor(opts.kills))
  if (flooredWave < 1) {
    return {
      eligible: false,
      shouldReportWave: false,
      waveScore: 0,
      safeKills: 0,
      tiebreak: 0,
      creepsDelta: 0,
    }
  }
  if (opts.requireProgressOnWave1 && flooredWave === 1 && safeKills <= 0) {
    return {
      eligible: false,
      shouldReportWave: false,
      waveScore: 0,
      safeKills: 0,
      tiebreak: 0,
      creepsDelta: 0,
    }
  }
  const waveScore = Math.min(999, Math.max(1, flooredWave))
  const shouldReportWave =
    !opts.prevBest ||
    waveScore > opts.prevBest.wave ||
    (waveScore === opts.prevBest.wave && safeKills > opts.prevBest.kills)
  const prevKills = Math.max(0, Math.floor(opts.prevReportedKills ?? 0))
  const creepsDelta = Math.min(100_000, Math.max(0, safeKills - prevKills))
  return {
    eligible: true,
    shouldReportWave,
    waveScore,
    safeKills,
    // Lower tiebreak ranks first in Modlock scores.proto; negate kills so more Creep Last-Hits wins ties.
    tiebreak: -safeKills,
    creepsDelta,
  }
}

/** Formats the ranked/sandbox status subtitle in `LeaderboardModal`. */
export function getLeaderboardSubtitleCopy(opts: {
  readonly rankedEligible: boolean
  readonly disqualifyReason?: string
}): string {
  if (opts.rankedEligible) {
    return 'Ranked Run Active · Wave & kill progress checkpoints automatically'
  }
  return `Sandbox Run · Unranked (${opts.disqualifyReason ?? 'dev'}) — /restarttd for Ranked`
}

/**
 * Formats fallback copy for `LeaderboardModal` when `readBoard` returns `undefined`
 * (e.g. while a Hyperline mod is still in Draft state, or in `--arg dev` local mode),
 * never mislabeling hosted Hyperline servers as `"Local Dev Server"`.
 */
export function getLeaderboardUnavailableCopy(opts: {
  readonly isLocalDev: boolean
  readonly currentWave: number
  readonly currentKills: number
  readonly sessionBest?: { readonly wave: number; readonly kills: number }
}): {
  readonly title: string
  readonly detail: string
  readonly statsLine: string
} {
  const safeWave = Math.max(1, Math.floor(opts.currentWave))
  const safeKills = Math.max(0, Math.floor(opts.currentKills))
  const currentPart = `Current Run: Wave ${safeWave} (${safeKills} Creep Last-Hits)`
  const statsLine = opts.sessionBest
    ? `${currentPart} · Session Best: Wave ${Math.max(1, Math.floor(opts.sessionBest.wave))} (${Math.max(0, Math.floor(opts.sessionBest.kills))} Creep Last-Hits)`
    : currentPart

  if (opts.isLocalDev) {
    return {
      title: 'Local Dev Mode (--arg dev) — Global Standings Disabled',
      detail: 'Ranked leaderboard submissions are disabled while local developer commands are active.',
      statsLine,
    }
  }
  return {
    title: 'Global Standings Syncing — Live Session Progress Tracked',
    detail: 'Global Hyperline leaderboards populate once the mod is published out of Draft. Your live run checkpoints continue automatically.',
    statsLine,
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
    }
  } catch {
    return undefined
  }
}

/** Seconds with 0 connected human players (after at least 1 human joined) before shutting down the server (`quit`), allowing score/metric RPCs to flush cleanly. */
export const EMPTY_SERVER_SHUTDOWN_DELAY_SECONDS = 3

export interface EmptyServerWatchState {
  readonly hasSeenHuman: boolean
  readonly emptySinceSeconds?: number
  readonly quitIssued: boolean
}

/**
 * Evaluates whether the dedicated server should shut down (`serverCommand('quit')`)
 * after all human players have disconnected for `delaySeconds` (default 3s so async score/metric RPCs finish before exit).
 * Never triggers before the first human player connects or during `TdProbe`.
 */
export function evaluateEmptyServerShutdown(
  state: EmptyServerWatchState,
  humanPlayerCount: number,
  nowSeconds: number,
  isProbeMode: boolean,
  delaySeconds = EMPTY_SERVER_SHUTDOWN_DELAY_SECONDS,
): { readonly nextState: EmptyServerWatchState; readonly shouldQuit: boolean } {
  if (isProbeMode || state.quitIssued) {
    return { nextState: state, shouldQuit: false }
  }
  if (humanPlayerCount > 0) {
    if (state.hasSeenHuman && state.emptySinceSeconds === undefined) {
      return { nextState: state, shouldQuit: false }
    }
    return {
      nextState: {
        hasSeenHuman: true,
        emptySinceSeconds: undefined,
        quitIssued: false,
      },
      shouldQuit: false,
    }
  }
  if (!state.hasSeenHuman) {
    return { nextState: state, shouldQuit: false }
  }
  const emptySince =
    state.emptySinceSeconds === undefined || nowSeconds < state.emptySinceSeconds
      ? nowSeconds
      : state.emptySinceSeconds
  if (nowSeconds - emptySince >= delaySeconds) {
    return {
      nextState: {
        hasSeenHuman: true,
        emptySinceSeconds: emptySince,
        quitIssued: true,
      },
      shouldQuit: true,
    }
  }
  if (state.emptySinceSeconds === emptySince) {
    return { nextState: state, shouldQuit: false }
  }
  return {
    nextState: {
      hasSeenHuman: true,
      emptySinceSeconds: emptySince,
      quitIssued: false,
    },
    shouldQuit: false,
  }
}

/** Deterministic integer formatting (`9600` -> `9,600`) avoiding QuickJS locale variance (#32). */
export function formatSoulsCount(value: number): string {
  if (!Number.isFinite(value)) {
    return '0'
  }
  const rounded = Math.round(value)
  const sign = rounded < 0 ? '-' : ''
  const absStr = String(Math.abs(rounded))
  return `${sign}${absStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
}

/** Deterministic `MM:SS` (or `H:MM:SS`) match timer formatting for the HUD top strip (#32). */
export function formatMatchClock(seconds: number): string {
  if (!Number.isFinite(seconds)) {
    return '00:00'
  }
  const totalSec = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(totalSec / 3600)
  const mins = Math.floor((totalSec % 3600) / 60)
  const secs = totalSec % 60
  const pad2 = (n: number): string => (n < 10 ? `0${n}` : `${n}`)
  return hours > 0
    ? `${hours}:${pad2(mins)}:${pad2(secs)}`
    : `${pad2(mins)}:${pad2(secs)}`
}

/** Detects when the Source 2 server match/map clock jumps backward (e.g. warm Hyperline server reset). */
export function hasClockSteppedBackward(
  prevSeconds: number,
  nextSeconds: number,
  toleranceSeconds = 0.05,
): boolean {
  return (
    Number.isFinite(prevSeconds) &&
    Number.isFinite(nextSeconds) &&
    nextSeconds + toleranceSeconds < prevSeconds
  )
}

/**
 * Gates Panorama HUD updates so modal/state changes render immediately, clock resets self-heal,
 * identical signatures skip redundant work, and sustained combat updates never exceed ~2 Hz over the CEF title relay (#32).
 */
export function shouldPushHudUpdate(opts: {
  readonly lastSig: string | undefined
  readonly nextSig: string
  readonly lastModalSig: string | undefined
  readonly nextModalSig: string
  readonly nowSeconds: number
  readonly lastSentAtSeconds: number
  readonly minIntervalSeconds?: number
}): boolean {
  if (
    opts.lastSig === undefined ||
    opts.lastModalSig !== opts.nextModalSig ||
    opts.nowSeconds < opts.lastSentAtSeconds
  ) {
    return true
  }
  if (opts.lastSig === opts.nextSig) {
    return false
  }
  const minInterval = opts.minIntervalSeconds ?? 0.5
  return opts.nowSeconds - opts.lastSentAtSeconds >= minInterval
}

/** Soul cost for Tier-5 Legendary items in the TD Legendary Armory. */
export const LEGENDARY_ITEM_COST_SOULS = 9600

/** Official Deadlock localized display names for Tier-5 Legendary items (`citadel_gc_mod_names_english.txt`). */
export const ITEM_DISPLAY_TITLES: Readonly<Record<string, string>> = {
  upgrade_celestial_guidance: 'Celestial Blessing',
  upgrade_eldritch_shot: 'Haunting Shot',
  upgrade_icarus_wings: 'Seraphim Wings',
  upgrade_infinite_rounds: 'Infinite Rounds',
  upgrade_mystical_piano: 'Mystical Piano',
  upgrade_nullification_aura: 'Nullification Burst',
  upgrade_omnicharge_pendant: 'Omnicharge Signet',
  upgrade_prism_blast: 'Prism Blast',
  upgrade_shrink_ray: 'Shrink Ray',
}

/** Formats an internal item class name (e.g. `upgrade_eldritch_shot` -> `Haunting Shot`) for display. */
export function formatItemDisplayTitle(itemName: string): string {
  const mapped = ITEM_DISPLAY_TITLES[itemName]
  if (mapped) {
    return mapped
  }
  return itemName
    .replace(/^upgrade_/, '')
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/** Pure validation for purchasing a Tier-5 Legendary item in the TD Armory. */
export function evaluateLegendaryPurchase(opts: {
  readonly hasLivingHero: boolean
  readonly souls: number
  readonly itemName: string
  readonly ownedItemNames: readonly string[]
  readonly cost?: number
}): { readonly ok: true; readonly cost: number } | { readonly ok: false; readonly reason: string } {
  const cost = opts.cost ?? LEGENDARY_ITEM_COST_SOULS
  if (!opts.hasLivingHero) {
    return { ok: false, reason: 'Deploy a living hero before buying Legendary items.' }
  }
  if (opts.ownedItemNames.includes(opts.itemName)) {
    return {
      ok: false,
      reason: `You already own ${formatItemDisplayTitle(opts.itemName)}.`,
    }
  }
  if (opts.souls < cost) {
    return {
      ok: false,
      reason: `Need ${formatSoulsCount(cost)} Souls for ${formatItemDisplayTitle(opts.itemName)} (have ${formatSoulsCount(opts.souls)}).`,
    }
  }
  return { ok: true, cost }
}

/** Returns a verified walkable Center Lane or Courtyard spawn origin for the active defense stage. */
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

/** Detects whether a living defender fell below the map mesh or outside playable bounds. */
export function isDefenderOutOfBoundsOrBelowMap(pos: {
  readonly x: number
  readonly y: number
  readonly z: number
}): boolean {
  if (Math.abs(pos.y) > 11500 || Math.abs(pos.x) > 4500) {
    return true
  }
  if (pos.z < 180) {
    return true
  }
  if (pos.y < -5100 && pos.y >= -9400 && pos.z < 520) {
    return true
  }
  if (pos.y < -9400 && pos.z < 1100) {
    return true
  }
  return false
}

/** Pure evaluator enforcing a fixed respawn delay for dead defenders and throttling retries. */
export function evaluateDefenderRespawnDue(opts: {
  readonly alive: boolean
  readonly hasHero: boolean
  readonly nowSeconds: number
  readonly diedAtSeconds: number | undefined
  readonly lastRespawnAttemptAt: number | undefined
  readonly respawnDelaySeconds?: number
}): {
  readonly nextDiedAtSeconds: number | undefined
  readonly shouldCallRespawn: boolean
  readonly nextLastRespawnAttemptAt: number | undefined
} {
  if (opts.alive || !opts.hasHero) {
    return {
      nextDiedAtSeconds: undefined,
      shouldCallRespawn: false,
      nextLastRespawnAttemptAt: undefined,
    }
  }
  const delay = Math.max(0.5, opts.respawnDelaySeconds ?? HERO_RESPAWN_TIME_SECONDS)
  const diedAt =
    opts.diedAtSeconds === undefined || opts.nowSeconds < opts.diedAtSeconds
      ? opts.nowSeconds
      : opts.diedAtSeconds
  const due = opts.nowSeconds - diedAt >= delay
  const retryAllowed =
    opts.lastRespawnAttemptAt === undefined ||
    opts.nowSeconds < opts.lastRespawnAttemptAt ||
    opts.nowSeconds - opts.lastRespawnAttemptAt >= 0.5
  if (due && retryAllowed) {
    return {
      nextDiedAtSeconds: diedAt,
      shouldCallRespawn: true,
      nextLastRespawnAttemptAt: opts.nowSeconds,
    }
  }
  return {
    nextDiedAtSeconds: diedAt,
    shouldCallRespawn: false,
    nextLastRespawnAttemptAt: opts.lastRespawnAttemptAt,
  }
}

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
  return Number(Math.max(0, Math.min(MAX_TOME_GROWTH_PER_WAVE, normalized)).toFixed(4))
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

/** Formats accumulated (potentially fractional) Tome counts cleanly for HUD display. */
export function formatTomeCountDisplay(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1)
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
      return `+${formatSoulsCount(Math.round((tome.amount ?? SOUL_CACHE_BASE_SOULS) * m))} Bonus Souls`
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

/** Developer/sandbox slash commands disabled in all normal & Hyperline matches (enabled only with `--arg dev`). */
export const DEV_COMMAND_NAMES = [
  'skipwave',
  'boss',
  'granttome',
  'tomescale',
  'souls',
] as const

/** Returns true only when `modlock dev --arg dev` (or `--watch --arg dev`) was passed on server startup. */
export function isLocalDevModeArgs(args: readonly string[]): boolean {
  return args.some((arg) => arg.trim().toLowerCase() === 'dev')
}

/**
 * Evaluates whether a connection may execute developer commands.
 * Requires BOTH server startup `--arg dev` AND Modlock's `'developer'` role on a non-bot connection.
 */
export function canExecuteDevCommand(params: {
  readonly devModeEnabled: boolean
  readonly isBot: boolean
  readonly roles: readonly string[]
}): boolean {
  return Boolean(
    params.devModeEnabled &&
      !params.isBot &&
      params.roles.includes('developer'),
  )
}

/**
 * Prevents co-op griefing via `/restarttd` while a multi-player run is still active,
 * while allowing restarts after Defeat, in solo runs (`<= 1` human), or in local `--arg dev` mode.
 */
export function canPlayerRestartActiveMatch(params: {
  readonly matchState: 'active' | 'defeat'
  readonly humanPlayerCount: number
  readonly isLocalDevPlayer: boolean
}): boolean {
  return (
    params.matchState === 'defeat' ||
    params.isLocalDevPlayer ||
    params.humanPlayerCount <= 1
  )
}

export interface BinaryEntityModifierTier {
  readonly modifier: string
  readonly value: number
}

/**
 * Disabled Deadlock attack-speed items repurposed in `mod.json` into a 5-bit binary
 * Fire Rate ladder (`7, 14, 28, 56, 112` -> `0..217%` BonusFireRate) for Structure
 * Fortification (`+18%/lv` across 12 levels) and Hero Fire Rate / Omni Tomes.
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
 * Ammo Clip ladder (`6, 12, 24, 48` -> `0..90%` BonusClipSizePercent) for Hero
 * Weapon / Omni Tomes.
 */
export const CLIP_SIZE_ENTITY_MODIFIERS: readonly BinaryEntityModifierTier[] = [
  { modifier: 'upgrade_clip_size_2/modifier_intrinsic_base', value: 6 },
  { modifier: 'upgrade_clip_size_3/modifier_intrinsic_base', value: 12 },
  { modifier: 'upgrade_weapon_instant_reload/modifier_intrinsic_base', value: 24 },
  { modifier: 'upgrade_infinitemagazine/modifier_base', value: 48 },
] as const

/** Stock disabled item tuned in `mod.json` to `+12%` CooldownReduction for Lv.2+ structures. */
export const STRUCTURE_CDR_ENTITY_MODIFIER =
  'upgrade_timeless_emblem/modifier_intrinsic_base'

/** Stock disabled item tuned in `mod.json` to `+16` Spirit Power for Hero Spirit/Omni Tomes. */
export const HERO_SPIRIT_ENTITY_MODIFIER =
  'upgrade_tech_cleave/modifier_intrinsic_base'

/** Standalone `FILE_MODIFIERS` entry tuned in `mod.json` (`+65 u/s`) for Wave 6+ creeps & Wave 10+ Bosses. */
export const ELITE_HASTE_ENTITY_MODIFIER =
  'modifier_hero_testing_fast_movespeed'

/** Stock `upgrade_colossus` intrinsic modifier tuned in `mod.json` (`1.38x` scale) for Bosses. */
export const BOSS_COLOSSUS_ENTITY_MODIFIER =
  'upgrade_colossus/modifier_colossus_active'

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
 * Returns the exact set of real C++ `holdEntityModifier` names active on a Team 2
 * combat structure at `fortifyLevel` (`+18%/lv` Fire Rate and Lv.2+ `+12%` CDR).
 * Returns `[]` at Lv.0 so early structures require zero modifier host calls.
 */
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

/**
 * Returns the exact set of real C++ `holdEntityModifier` names active on a Defender's
 * hero pawn from their Tome tally (Fire Rate, Clip Size, and Spirit Power).
 */
export function getHeroTomeEntityModifierPlan(
  tally: Readonly<Record<string, number>>,
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
export function computeResidualWeaponDamageMult(
  tally: Readonly<Record<string, number>>,
): number {
  const weapon = Math.max(0, tally.weapon ?? 0)
  const omni = Math.max(0, tally.omni ?? 0)
  return Number((1 + 0.1 * weapon + 0.05 * omni).toFixed(4))
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

/**
 * Delay after `CCitadelPlayerPawn.m_bHasShopOpen` clears before recreating the custom TD HUD,
 * tightened to 80 ms so the HUD reappears crisply after the client's 100 ms `gShopOpen` poller
 * while still separating `hide()` and `show()` across server frames.
 */
export const SHOP_CLOSE_HUD_RESTORE_DELAY_SECONDS = 0.08

/**
 * Start of a brief secondary `hideHud(['status'])` pulse after shop close so high-latency
 * clients whose `gShopOpen` uncollapse landed slightly after `+0.08s` still receive a
 * direct `CSGOHud` visibility+layout dirty wake-up without affecting cursor aiming or `levelUp`.
 */
export const SHOP_CLOSE_SECOND_PULSE_START_SECONDS = 0.28

/**
 * Secondary silent keyed-epoch remount after native Buy Menu close so every retained UI
 * node is freshly constructed cleanly after Deadlock's transition animations settle.
 */
export const SHOP_CLOSE_HUD_SETTLE_RESET_SECONDS = 0.38

export interface NativeShopHudState {
  readonly wasShopOpen: boolean
  readonly hiddenForShop: boolean
  readonly closedAtSeconds?: number
  readonly initialRestoreDone: boolean
  readonly secondPulseStarted: boolean
  readonly settleResetDone: boolean
  readonly hudEpoch: number
}

export const INITIAL_NATIVE_SHOP_HUD_STATE: NativeShopHudState = {
  wasShopOpen: false,
  hiddenForShop: false,
  closedAtSeconds: undefined,
  initialRestoreDone: true,
  secondPulseStarted: true,
  settleResetDone: true,
  hudEpoch: 0,
}

export interface NativeShopHudDecision {
  readonly nextState: NativeShopHudState
  readonly suppressShow: boolean
  readonly shouldHideNow: boolean
  readonly closeTransientModals: boolean
  readonly holdStockHudPulse: boolean
  readonly resyncCursorNow: boolean
  readonly bumpedEpoch: boolean
}

function makeSettledNativeShopState(hudEpoch: number): NativeShopHudState {
  return {
    wasShopOpen: false,
    hiddenForShop: false,
    closedAtSeconds: undefined,
    initialRestoreDone: true,
    secondPulseStarted: true,
    settleResetDone: true,
    hudEpoch,
  }
}

function makeNativeShopDecision(
  nextState: NativeShopHudState,
  flags: Partial<Omit<NativeShopHudDecision, 'nextState'>> = {},
): NativeShopHudDecision {
  return {
    nextState,
    suppressShow: flags.suppressShow ?? false,
    shouldHideNow: flags.shouldHideNow ?? false,
    closeTransientModals: flags.closeTransientModals ?? false,
    holdStockHudPulse: flags.holdStockHudPulse ?? false,
    resyncCursorNow: flags.resyncCursorNow ?? false,
    bumpedEpoch: flags.bumpedEpoch ?? false,
  }
}

/**
 * Returns `true` when `pollNativeShopStateEveryFrame` should wake `renderTdHud` on the
 * current server frame for a Buy Menu edge or post-close recovery boundary.
 */
export function needsImmediateNativeShopWake(
  prev: NativeShopHudState | undefined,
  nativeShopOpen: boolean,
  nowSeconds: number,
): boolean {
  const state = prev ?? INITIAL_NATIVE_SHOP_HUD_STATE
  if (nativeShopOpen !== state.wasShopOpen) {
    return true
  }
  if (nativeShopOpen) {
    return false
  }
  if (!state.initialRestoreDone) {
    if (
      state.closedAtSeconds === undefined ||
      hasClockSteppedBackward(state.closedAtSeconds, nowSeconds)
    ) {
      return true
    }
    return nowSeconds - state.closedAtSeconds >= SHOP_CLOSE_HUD_RESTORE_DELAY_SECONDS
  }
  if (!state.settleResetDone) {
    if (
      state.closedAtSeconds === undefined ||
      hasClockSteppedBackward(state.closedAtSeconds, nowSeconds)
    ) {
      return true
    }
    const elapsed = nowSeconds - state.closedAtSeconds
    if (elapsed >= SHOP_CLOSE_HUD_SETTLE_RESET_SECONDS) {
      return true
    }
    return !state.secondPulseStarted && elapsed >= SHOP_CLOSE_SECOND_PULSE_START_SECONDS
  }
  return false
}

/**
 * Coordinates custom Panorama HUD hide/restore, `CSGOHud` `hideHud(['status'])` dirty
 * pulses, instant `0ms` cursor aiming passthrough on close, and monotonic keyed-epoch
 * remounts around Deadlock's native Buy Menu (`CCitadelPlayerPawn.m_bHasShopOpen`).
 */
export function evaluateNativeShopHudSync(
  prev: NativeShopHudState | undefined,
  nativeShopOpen: boolean,
  nowSeconds: number,
): NativeShopHudDecision {
  const state = prev ?? INITIAL_NATIVE_SHOP_HUD_STATE

  if (nativeShopOpen) {
    if (!state.wasShopOpen) {
      return makeNativeShopDecision(
        {
          wasShopOpen: true,
          hiddenForShop: true,
          closedAtSeconds: undefined,
          initialRestoreDone: false,
          secondPulseStarted: false,
          settleResetDone: false,
          hudEpoch: state.hudEpoch,
        },
        {
          suppressShow: true,
          shouldHideNow: true,
          closeTransientModals: true,
          holdStockHudPulse: true,
          resyncCursorNow: true,
        },
      )
    }
    return makeNativeShopDecision(state, {
      suppressShow: true,
      holdStockHudPulse: true,
    })
  }

  if (state.wasShopOpen) {
    return makeNativeShopDecision(
      {
        wasShopOpen: false,
        hiddenForShop: true,
        closedAtSeconds: nowSeconds,
        initialRestoreDone: false,
        secondPulseStarted: false,
        settleResetDone: false,
        hudEpoch: state.hudEpoch,
      },
      {
        suppressShow: true,
        holdStockHudPulse: true,
      },
    )
  }

  if (!state.initialRestoreDone) {
    if (
      state.closedAtSeconds === undefined ||
      hasClockSteppedBackward(state.closedAtSeconds, nowSeconds)
    ) {
      return makeNativeShopDecision(makeSettledNativeShopState(state.hudEpoch + 1), {
        resyncCursorNow: true,
        bumpedEpoch: true,
      })
    }
    const elapsed = nowSeconds - state.closedAtSeconds
    if (elapsed < SHOP_CLOSE_HUD_RESTORE_DELAY_SECONDS) {
      return makeNativeShopDecision(state, {
        suppressShow: true,
        holdStockHudPulse: true,
      })
    }

    const nextEpoch = state.hudEpoch + 1
    if (elapsed >= SHOP_CLOSE_HUD_SETTLE_RESET_SECONDS) {
      return makeNativeShopDecision(makeSettledNativeShopState(nextEpoch), {
        resyncCursorNow: true,
        bumpedEpoch: true,
      })
    }
    const pulseActive = elapsed >= SHOP_CLOSE_SECOND_PULSE_START_SECONDS
    return makeNativeShopDecision(
      {
        wasShopOpen: false,
        hiddenForShop: false,
        closedAtSeconds: state.closedAtSeconds,
        initialRestoreDone: true,
        secondPulseStarted: pulseActive,
        settleResetDone: false,
        hudEpoch: nextEpoch,
      },
      {
        holdStockHudPulse: pulseActive,
        resyncCursorNow: true,
        bumpedEpoch: true,
      },
    )
  }

  if (!state.settleResetDone) {
    if (
      state.closedAtSeconds === undefined ||
      hasClockSteppedBackward(state.closedAtSeconds, nowSeconds) ||
      nowSeconds - state.closedAtSeconds >= SHOP_CLOSE_HUD_SETTLE_RESET_SECONDS
    ) {
      return makeNativeShopDecision(makeSettledNativeShopState(state.hudEpoch + 1), {
        bumpedEpoch: true,
      })
    }
    const elapsed = nowSeconds - state.closedAtSeconds
    if (elapsed >= SHOP_CLOSE_SECOND_PULSE_START_SECONDS) {
      const nextState = state.secondPulseStarted
        ? state
        : {
            wasShopOpen: false,
            hiddenForShop: false,
            closedAtSeconds: state.closedAtSeconds,
            initialRestoreDone: true,
            secondPulseStarted: true,
            settleResetDone: false,
            hudEpoch: state.hudEpoch,
          }
      return makeNativeShopDecision(nextState, {
        holdStockHudPulse: true,
      })
    }
    return makeNativeShopDecision(state)
  }

  return makeNativeShopDecision(state)
}
