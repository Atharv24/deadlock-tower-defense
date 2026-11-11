// Central tuning configuration and pure, deterministic domain logic for
// Deadlock Tower Defense (Modlock TypeScript + Binary KV3 VData + Map VPK).

export const WAVE_INTERVAL_SECONDS = 20
export const INITIAL_WAVE_DELAY_SECONDS = 5
export const ZIPLINE_LAND_DELAY_SECONDS = 12.5

export const BASE_CREEP_HP = 200
export const HP_GROWTH_RATE = 1.16
export const MAX_CREEP_HP = 5_000_000
export const CREEP_DAMAGE_GROWTH_RATE = 1.035
export const BASE_CREEP_SCALE = 0.9
export const CREEP_SCALE_PER_WAVE = 0.015
export const MAX_CREEP_SCALE = 1.65
export const ZIPLINE_SQUAD_SIZE = 4
export const MIN_SPAWN_INTERVAL_SECONDS = 7
export const MAX_CREEP_TIER = 10

export const BOSS_WAVE_INTERVAL = 5
export const MAX_BOSS_TIER = 5

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

export const PLAYER_SPAWN_ORIGIN = { x: 0, y: -1950, z: 390 } as const
export const PLAYER_SPAWN_ANGLES = { pitch: 0, yaw: 90, roll: 0 } as const
export const GUARDIAN_ORIGIN = { x: 0, y: -1792, z: 384 } as const
export const DEFENDER_TEAM = 2

export const GUARDIAN_TARGETNAMES = [
  'boss_rebel_t1_blue',
  '[PR#]boss_rebel_t1_blue',
] as const

export const ZOMBIE_BASE_KAMIKAZE_DAMAGE = 85
export const ZOMBIE_ARM_FUSE_SECONDS = 0.2

export interface WaveNeutralVarietyDef {
  readonly unit:
    | 'td_neutral_lantern'
    | 'td_neutral_puppeteer'
    | 'td_neutral_pigeon'
    | 'td_neutral_mushroom'
  readonly label: string
  readonly model: string
  readonly hpMult: number
  readonly scaleMult: number
}

export const WAVE_NEUTRAL_VARIETY_POOL: readonly WaveNeutralVarietyDef[] = [
  {
    unit: 'td_neutral_lantern',
    label: 'Chinatown Lantern',
    model: 'models/npc_units/neutral_ct_lanterns/neutral_ct_lantern.vmdl',
    hpMult: 1.0,
    scaleMult: 1.0,
  },
  {
    unit: 'td_neutral_puppeteer',
    label: 'Theatre Puppeteer',
    model: 'models/npc_units/neutral_theatre_puppeteer_02/neutral_theatre_puppeteer_02.vmdl',
    hpMult: 1.1,
    scaleMult: 1.0,
  },
  {
    unit: 'td_neutral_pigeon',
    label: 'Cerberus Pigeon',
    model: 'models/npc_units/neutral_pigeon_cerberus/neutral_pigeon_cerberus.vmdl',
    hpMult: 0.95,
    scaleMult: 1.05,
  },
  {
    unit: 'td_neutral_mushroom',
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
    description: '+250 Bonus Souls',
    kind: 'souls',
    amount: 250,
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
    subtitle: 'Fortify Blue Guardian (+1,200 Max HP, +2,000 Heal) & +80 Hero HP',
    modifiers: [{ name: 'td_tome_health', stacks: 1 }],
    guardianHeal: 2000,
    guardianUpgrade: true,
    accent: '#60a5fa',
  },
] as const

/** Server console configuration applied on world start. */
export const TD_SERVER_CVARS: readonly (readonly [string, string | number])[] = [
  ['sv_cheats', 1],
  ['sv_hibernate_when_empty', 0],
  ['citadel_active_lane', 4],
  ['citadel_trooper_spawn_enabled', 1],
  ['citadel_trooper_spawn_initial', INITIAL_WAVE_DELAY_SECONDS],
  ['citadel_trooper_spawn_interval_early', WAVE_INTERVAL_SECONDS],
  ['citadel_trooper_spawn_interval_late', WAVE_INTERVAL_SECONDS],
  ['citadel_trooper_spawn_interval_very_late', WAVE_INTERVAL_SECONDS],
  ['citadel_trooper_spawn_interval_late_time', 999],
  ['citadel_trooper_spawn_interval_very_late_time', 999],
  ['citadel_trooper_squad_size', ZIPLINE_SQUAD_SIZE],
  ['citadel_trooper_health_mult_gametime', 9999],
  ['citadel_trooper_max_per_lane', 120],
  ['citadel_trooper_gold_reward', 150],
  ['citadel_trooper_gold_reward_bonus_per_minute', 100],
  ['citadel_npc_disable_cockroaches', 1],
  ['citadel_player_starting_team', DEFENDER_TEAM],
  ['citadel_tutorial_close_shop', 0],
  ['citadel_allow_purchasing_anywhere', 1],
  ['citadel_disable_purchasing_in_combat', 0],
  ['citadel_coop_sandbox', 1],
  ['citadel_hero_testing_enabled', 1],
  ['citadel_hero_testing_infinite_money', 0],
  ['citadel_hero_demo_no_troopers', 0],
  ['citadel_hero_testing_legendary_items', 1],
] as const

/** Computes target creep Max HP for a 1-indexed wave number (~5x steeper growth for testing). */
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

/** Computes creep Soul bounty for a 1-indexed wave number. */
export function computeWaveSoulReward(wave: number): number {
  const clampedWave = Math.max(1, Math.floor(wave))
  return Math.min(10_000, 150 + (clampedWave - 1) * 25)
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
  readonly matchState: string
}): boolean {
  return opts.needsHeroPick || opts.matchState === 'defeat'
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
 * `trooper_melee` (Graves Zombie: base `m_nMaxHealth = 413`, vs `150` for
 * `trooper_normal`, `trooper_medic`, and `td_neutral_*`).
 */
export function isExplodingZombieBaseMaxHp(unscaledMaxHp: number): boolean {
  return unscaledMaxHp >= 380 && unscaledMaxHp <= 440
}

export type ZombieDetonationTargetKind = 'hero' | 'guardian' | 'walker' | 'shrine'

const ZOMBIE_DETONATION_RADII: Readonly<
  Record<ZombieDetonationTargetKind, { readonly max2D: number; readonly maxDz: number }>
> = {
  hero: { max2D: 185, maxDz: 160 },
  guardian: { max2D: 500, maxDz: 220 },
  walker: { max2D: 710, maxDz: 260 },
  shrine: { max2D: 380, maxDz: 200 },
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
      label: def.label,
      targetHp: scaledHp,
      targetScale: scaledSize,
      origin,
    })
  }
  return out
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

const BOSS_TIER_BONUS_HP = [2500, 5500, 10000, 16000, 25000] as const
const BOSS_TIER_SCALE = [1.55, 1.9, 2.25, 2.6, 2.95] as const
const BOSS_SCALE_STEP = 0.35
const MAX_BOSS_EXTRA_SIZE_STACKS = 4

/** Returns the Boss hero name, VData modifier, and scaling parameters for a Boss wave. */
export function getBossWaveSpec(wave: number): {
  readonly tier: number
  readonly hero: string
  readonly modifier: string
  readonly bonusHp: number
  readonly extraHealthStacks: number
  readonly extraSizeStacks: number
  readonly targetScale: number
  readonly damageMult: number
} {
  const tier = computeBossTier(wave)
  const bossIdx = Math.max(0, Math.floor(wave / BOSS_WAVE_INTERVAL) - 1)
  const hero = BOSS_HERO_POOL[bossIdx % BOSS_HERO_POOL.length]
  const wavesBeyondMaxTier =
    wave > 25 ? Math.floor((wave - 25) / BOSS_WAVE_INTERVAL) : 0
  const extraHealthStacks = wavesBeyondMaxTier * 40
  const extraSizeStacks = Math.min(
    MAX_BOSS_EXTRA_SIZE_STACKS,
    wavesBeyondMaxTier,
  )
  const bonusHp = BOSS_TIER_BONUS_HP[tier - 1] + extraHealthStacks * 80
  const targetScale = Number(
    (BOSS_TIER_SCALE[tier - 1] + extraSizeStacks * BOSS_SCALE_STEP).toFixed(2),
  )
  const damageMult = Number((1.15 + bossIdx * 0.2).toFixed(3))
  return {
    tier,
    hero,
    modifier: `td_boss_hero_stats_${tier}`,
    bonusHp,
    extraHealthStacks,
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

/** Computes the Soul cost of the next Guardian upgrade level (0-indexed). */
export function computeGuardianUpgradeCost(upgradeLevel: number): number {
  const clamped = Math.max(0, Math.floor(upgradeLevel))
  return GUARDIAN_UPGRADE_BASE_COST_SOULS + clamped * GUARDIAN_UPGRADE_COST_STEP_SOULS
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
  readonly scaledCreeps: readonly number[]
  readonly explodingZombies?: readonly number[]
  readonly rewardedCreeps: readonly number[]
  readonly playerTomes: Record<string, Record<string, number>>
  readonly playerKills: Record<string, number>
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
    }
  } catch {
    return undefined
  }
}
