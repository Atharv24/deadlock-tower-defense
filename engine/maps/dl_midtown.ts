import {
  entityPosition,
  fireInput,
  findEntities,
  killEntity,
  Npc,
  readField,
  removeEntities,
  writeField,
} from 'modlock'

export const HIDDEN_KING_TEAM = 2
export const ARCHMOTHER_TEAM = 3

export const BOSS_SPAWN_ORIGIN = { x: 0, y: 1200, z: 390 } as const
export const BOSS_SPAWN_ANGLES = { pitch: 0, yaw: 270, roll: 0 } as const

export const PLAYER_SPAWN_ORIGIN = { x: 0, y: -1950, z: 396 } as const
export const PLAYER_SPAWN_ANGLES = { pitch: 0, yaw: 90, roll: 0 } as const

export const GUARDIAN_ORIGIN = { x: 0, y: -1792, z: 384 } as const
export const WALKER_ORIGIN = { x: -1288, y: -3472, z: 376 } as const
export const BASE_GUARDIAN_ORIGIN = { x: -1280, y: -5456, z: 641 } as const
export const EAST_SHRINE_ORIGIN = { x: 299, y: -7535, z: 980 } as const
export const WEST_SHRINE_ORIGIN = { x: -2859, y: -7535, z: 980 } as const
export const PATRON_ORIGIN = { x: -1280, y: -8034, z: 632 } as const

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

/** Detects whether a position fell below the `dl_midtown` map mesh or outside playable lane/base bounds. */
export function isMidtownOutOfBoundsOrBelowMap(pos: {
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

/** Disables and removes all stock neutral trooper camps and spawned neutrals on `dl_midtown`. */
export function removeStaticNeutralCamps(): void {
  for (const camp of findEntities('info_neutral_trooper_camp')) {
    fireInput(camp, 'SetDisabled', { boolean: true })
    fireInput(camp, 'RemoveNeutrals')
    fireInput(camp, 'Kill')
  }
  removeEntities('info_neutral_trooper_camp')
  removeEntities('info_neutral_trooper_spawn')
  removeEntities('npc_trooper_neutral')
}

/**
 * Suppresses non-target trooper spawners while preserving `CInfoTrooperSpawn.m_iLane` intact
 * so C++ `CTrooperSpawnManager` wave controllers never dereference detached lane points.
 */
export function suppressNonEnemyCenterTrooperSpawners(
  defenderTeam = HIDDEN_KING_TEAM,
): number {
  let suppressed = 0
  for (const sp of findEntities('info_trooper_spawn')) {
    let team = readField(sp, 'CBaseEntity', 'm_iTeamNum', 'uint8') as
      | number
      | undefined
    if (typeof team !== 'number') {
      const origin = entityPosition(sp)?.position
      if (origin) {
        team = origin.y > 0 ? ARCHMOTHER_TEAM : defenderTeam
      }
    }
    const lane = readField(sp, 'CInfoTrooperSpawn', 'm_iLane', 'int32') as
      | number
      | undefined
    if (team === ARCHMOTHER_TEAM && lane === 4) {
      fireInput(sp, 'SetSpawningEnabled', { boolean: true })
      continue
    }
    fireInput(sp, 'SetSpawningEnabled', { boolean: false })
    writeField(sp, 'CInfoTrooperSpawn', 'm_bDisableZiplining', 'bool', true)
    suppressed += 1
  }
  return suppressed
}

/** Immediately removes friendly lane troopers and stray side-lane enemy troopers. */
export function purgeFriendlyAndSideLaneTroopers(
  defenderTeam = HIDDEN_KING_TEAM,
): number {
  let removed = 0
  for (const tr of findEntities('npc_trooper')) {
    const npc = new Npc(tr).read()
    const team =
      npc?.team ??
      (readField(tr, 'CBaseEntity', 'm_iTeamNum', 'uint8') as number | undefined)
    const lifeState = readField(tr, 'CBaseEntity', 'm_lifeState', 'uint8')
    if (typeof lifeState === 'number' && lifeState !== 0) {
      continue
    }
    if (team === defenderTeam) {
      if (!new Npc(tr).remove()) {
        killEntity({ victim: tr })
      }
      removed += 1
      continue
    }
    if (
      team === ARCHMOTHER_TEAM &&
      npc &&
      npc.maxHealth > 1 &&
      Math.abs(npc.position.x) > 2800
    ) {
      killEntity({ victim: tr })
      removed += 1
    }
  }
  return removed
}

/** Unlocks all 4 Flex Slots (`mask = 15`) on a `citadel_team_manager` so all 12 item slots stay open. */
export function unlockTeamFlexSlots(
  team = HIDDEN_KING_TEAM,
  mask = 15,
): void {
  for (const tm of findEntities('citadel_team_manager')) {
    const tmTeam = readField(tm, 'CBaseEntity', 'm_iTeamNum', 'uint8')
    if (tmTeam === team) {
      const unlocked = readField(tm, 'CCitadelTeam', 'm_nFlexSlotsUnlocked', 'uint16')
      if (typeof unlocked !== 'number' || unlocked < 4) {
        writeField(tm, 'CCitadelTeam', 'm_nFlexSlotsUnlocked', 'uint16', mask)
      }
    }
  }
}

/** Returns true if stock `dl_midtown`'s `info_super_trooper_spawn` for `(team, lane)` is present. */
export function hasNativeLaneGuardianSpawner(
  team = HIDDEN_KING_TEAM,
  lane = 4,
): boolean {
  for (const sp of findEntities('info_super_trooper_spawn')) {
    const spTeam = readField(sp, 'CBaseEntity', 'm_iTeamNum', 'uint8')
    const spLane = readField(sp, 'CInfoTrooperBossSpawn', 'm_iLane', 'int32')
    const reinf = readField(sp, 'CInfoTrooperBossSpawn', 'm_bReinforcementsOnly', 'bool')
    if (spTeam === team && spLane === lane && reinf !== true) {
      return true
    }
  }
  return false
}
