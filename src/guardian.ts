// Full Deadlock Base Defense Manager:
// Tracks Center Lane progression across ALL 6 stages:
//   Blue T1 Guardian -> Blue T2 Walker -> Twin Blue Base Guardians ->
//   Twin Amber Shrines -> Patron Stage 1 -> Weakened Patron Stage 2 (Pit) -> Defeat.
// Also drives All-Structure Soul Repair (`/repair`) and All-Structure Fortification
// (`/upgrade` & Sapphire Bastion), scaling Max HP, Outgoing Damage (+25%/lv),
// and Attack Speed (+18%/lv Fire Rate & +12%/lv Ability Cooldown Speed via C++ aura).

import {
  damage,
  entityClass,
  entityPosition,
  findEntities,
  findEntitiesByName,
  fireInput,
  log,
  Npc,
  type Player,
  players,
  readField,
  serverCommand,
  spawnNpc,
  toast,
  type Vector,
  writeField,
} from 'modlock'

import {
  BASE_GUARDIAN_BASE_MAX_HP,
  BASE_GUARDIAN_ORIGIN,
  BASE_GUARDIAN_TARGETNAMES,
  BASE_GUARDIAN_UPGRADE_HP_BONUS,
  computeGuardianRepair,
  computeGuardianUpgradeCost,
  computeStructureDamageMult,
  DEFENDER_TEAM,
  type DefenseStage,
  EAST_SHRINE_ORIGIN,
  EAST_SHRINE_TARGETNAMES,
  evaluateAllStructuresRepair,
  evaluateBaseDefenseProgression,
  getStructureFortifyAuraSpec,
  GUARDIAN_BASE_MAX_HP,
  GUARDIAN_ORIGIN,
  GUARDIAN_REPAIR_AMOUNT_HP,
  GUARDIAN_REPAIR_COST_SOULS,
  GUARDIAN_TARGETNAMES,
  GUARDIAN_UPGRADE_HP_BONUS,
  PATRON_ORIGIN,
  PATRON_STAGE1_BASE_MAX_HP,
  PATRON_STAGE2_BASE_MAX_HP,
  PATRON_UPGRADE_HP_BONUS,
  type RepairableStructureInput,
  SHRINE_BASE_MAX_HP,
  SHRINE_UPGRADE_HP_BONUS,
  WALKER_BASE_MAX_HP,
  WALKER_ORIGIN,
  WALKER_TARGETNAMES,
  WALKER_UPGRADE_HP_BONUS,
  WEST_SHRINE_ORIGIN,
  WEST_SHRINE_TARGETNAMES,
} from './config'

export type MatchState = 'waiting' | 'active' | 'defeat' | 'victory'

export type BossStructureKind =
  | 'guardian'
  | 'walker'
  | 'base_guardian'
  | 'shrine_east'
  | 'shrine_west'
  | 'patron_stage1'
  | 'patron_stage2'

export interface ActiveObjectiveTarget {
  readonly kind: BossStructureKind
  readonly entity: number
  readonly position: Vector
  readonly alive: boolean
  readonly siegeRange: number
  readonly minStandoff: number
  readonly aimOffsetZ: number
}

interface StructureUnitState {
  entity: number
  position: Vector
  health: number
  maxHealth: number
  alive: boolean
}

export class GuardianManager {
  // Primary T1 Blue Guardian fields (preserved for HUD, Tome, and Probe callers)
  entity = 0
  health = GUARDIAN_BASE_MAX_HP
  maxHealth = GUARDIAN_BASE_MAX_HP

  // Multi-stage base progression state
  walkerEntity = 0
  walkerHealth = WALKER_BASE_MAX_HP
  walkerMaxHealth = WALKER_BASE_MAX_HP

  baseGuardianEntities: number[] = []
  baseGuardiansHealth = BASE_GUARDIAN_BASE_MAX_HP * 2
  baseGuardiansMaxHealth = BASE_GUARDIAN_BASE_MAX_HP * 2
  baseGuardiansAliveCount = 2

  eastShrineEntity = 0
  westShrineEntity = 0
  shrinesHealth = SHRINE_BASE_MAX_HP * 2
  shrinesMaxHealth = SHRINE_BASE_MAX_HP * 2
  shrinesAliveCount = 2

  patronEntity = 0
  patronCoreEntity = 0
  patronHealth = PATRON_STAGE1_BASE_MAX_HP
  patronMaxHealth = PATRON_STAGE1_BASE_MAX_HP
  patronPhase = 0
  patronReachedStage2 = false

  currentStage: DefenseStage = 'guardian'
  stageLabel = 'BLUE GUARDIAN'
  activeObjectiveHealth = GUARDIAN_BASE_MAX_HP
  activeObjectiveMaxHealth = GUARDIAN_BASE_MAX_HP

  upgradeLevel = 0
  bonusMaxHp = 0
  matchState: MatchState = 'waiting'

  private readonly initializedEntities = new Set<number>()
  private readonly friendlyStructureSet = new Set<number>()
  private readonly announcedMilestones = new Set<DefenseStage>()
  private patronStage2HpInitialized = false
  private guardianSeen = false
  private walkerSeen = false
  private baseGuardiansSeen = false
  private shrinesSeen = false
  private patronSeen = false

  /** Resets all structure tracking for a new world or `/restarttd`. */
  reset(): void {
    this.entity = 0
    this.walkerEntity = 0
    this.baseGuardianEntities = []
    this.eastShrineEntity = 0
    this.westShrineEntity = 0
    this.patronEntity = 0
    this.patronCoreEntity = 0

    this.guardianSeen = false
    this.walkerSeen = false
    this.baseGuardiansSeen = false
    this.shrinesSeen = false
    this.patronSeen = false

    this.upgradeLevel = 0
    this.bonusMaxHp = 0

    this.health = GUARDIAN_BASE_MAX_HP
    this.maxHealth = GUARDIAN_BASE_MAX_HP
    this.walkerHealth = WALKER_BASE_MAX_HP
    this.walkerMaxHealth = WALKER_BASE_MAX_HP
    this.baseGuardiansHealth = BASE_GUARDIAN_BASE_MAX_HP * 2
    this.baseGuardiansMaxHealth = BASE_GUARDIAN_BASE_MAX_HP * 2
    this.baseGuardiansAliveCount = 2
    this.shrinesHealth = SHRINE_BASE_MAX_HP * 2
    this.shrinesMaxHealth = SHRINE_BASE_MAX_HP * 2
    this.shrinesAliveCount = 2
    this.patronHealth = PATRON_STAGE1_BASE_MAX_HP
    this.patronMaxHealth = PATRON_STAGE1_BASE_MAX_HP
    this.patronPhase = 0
    this.patronReachedStage2 = false

    this.currentStage = 'guardian'
    this.stageLabel = 'BLUE GUARDIAN'
    this.activeObjectiveHealth = GUARDIAN_BASE_MAX_HP
    this.activeObjectiveMaxHealth = GUARDIAN_BASE_MAX_HP
    this.matchState = 'active'

    this.initializedEntities.clear()
    this.friendlyStructureSet.clear()
    this.announcedMilestones.clear()
    this.announcedMilestones.add('guardian')
    this.patronStage2HpInitialized = false

    this.poll(0)
  }

  /** Respawns fallen Team 2 structures via engine commands and resets base defense for `/restarttd`. */
  respawnAllStructures(): void {
    serverCommand('citadel_respawn_boss_t1')
    serverCommand('citadel_respawn_boss_t2')
    serverCommand('citadel_respawn_boss_barracks')
    serverCommand('citadel_respawn_boss_shrines')
    serverCommand('citadel_boss_tier_3_testing_reset')

    this.reset()
    this.ensureCenterLaneGuardianSpawned()
    this.poll(0)
  }

  /** Returns true if stock `dl_midtown`'s Team 2 Center Lane T1 spawner (`14019`) is present. */
  hasNativeCenterGuardianSpawner(): boolean {
    for (const sp of findEntities('info_super_trooper_spawn')) {
      const team = readField(sp, 'CBaseEntity', 'm_iTeamNum', 'int32')
      const lane = readField(sp, 'CInfoTrooperBossSpawn', 'm_iLane', 'int32')
      const reinf = readField(sp, 'CInfoTrooperBossSpawn', 'm_bReinforcementsOnly', 'bool')
      if (team === DEFENDER_TEAM && lane === 4 && reinf !== true) {
        return true
      }
    }
    return false
  }

  /** Ensures a live Team 2 Center Lane T1 Guardian (`npc_boss_tier1`) stands at `GUARDIAN_ORIGIN`. */
  ensureCenterLaneGuardianSpawned(): number {
    const existing = this.locateEntity()
    if (existing > 0) {
      return existing
    }
    // On stock `dl_midtown`, `info_super_trooper_spawn` (14019) natively spawns the C++-linked
    // `boss_rebel_t1_blue` on PreGameWait (and `citadel_respawn_boss_t1` respawns it on restart).
    // Do not spawn a second unlinked Guardian on top of it!
    if (this.hasNativeCenterGuardianSpawner()) {
      return 0
    }
    const spawned = spawnNpc({
      className: 'npc_trooper_boss',
      unit: 'npc_boss_tier1',
      team: DEFENDER_TEAM,
      lane: 4,
      position: GUARDIAN_ORIGIN,
      facing: { pitch: 0, yaw: 90, roll: 0 },
      health: GUARDIAN_BASE_MAX_HP,
      maxHealth: GUARDIAN_BASE_MAX_HP,
    })
    if (spawned && spawned.entity > 0) {
      this.entity = spawned.entity
      this.guardianSeen = true
      this.initializedEntities.add(spawned.entity)
      this.friendlyStructureSet.add(spawned.entity)
      this.health = GUARDIAN_BASE_MAX_HP
      this.maxHealth = GUARDIAN_BASE_MAX_HP
      return spawned.entity
    }
    return 0
  }

  /** Restores state from Modlock hot-reload handoff. */
  restore(
    upgradeLevel: number,
    bonusMaxHp: number,
    matchState: MatchState,
    patronReachedStage2 = false,
  ): void {
    this.upgradeLevel = Math.max(0, Math.floor(upgradeLevel))
    this.bonusMaxHp = Math.max(0, Math.floor(bonusMaxHp))
    this.maxHealth = GUARDIAN_BASE_MAX_HP + this.bonusMaxHp
    this.matchState = matchState
    this.patronReachedStage2 = patronReachedStage2
    this.poll(0)
  }

  /** Finds the Friendly Blue T1 Guardian entity handle in Center Lane (`0` once dead). */
  locateEntity(): number {
    if (this.entity > 0) {
      if (this.isEntityAlive(this.entity)) {
        this.guardianSeen = true
        return this.entity
      }
      this.guardianSeen = true
      this.entity = 0
    }
    for (const name of GUARDIAN_TARGETNAMES) {
      for (const candidate of findEntitiesByName(name)) {
        if (candidate > 0 && this.isEntityAlive(candidate)) {
          this.entity = candidate
          this.guardianSeen = true
          return candidate
        }
      }
    }
    for (const handle of findEntities('npc_trooper_boss')) {
      const team = this.readEntityTeam(handle)
      const pos = this.readEntityPos(handle)
      if (team === DEFENDER_TEAM && pos && this.isEntityAlive(handle)) {
        const dx = pos.x - GUARDIAN_ORIGIN.x
        const dy = pos.y - GUARDIAN_ORIGIN.y
        if (dx * dx + dy * dy < 600 * 600) {
          this.entity = handle
          this.guardianSeen = true
          return handle
        }
      }
    }
    return 0
  }

  /** Returns the Friendly Blue T1 Guardian's live position in Center Lane. */
  position(): { readonly x: number; readonly y: number; readonly z: number } {
    const ent = this.locateEntity()
    if (ent > 0) {
      const pos = this.readEntityPos(ent)
      if (pos) {
        return pos
      }
    }
    return GUARDIAN_ORIGIN
  }

  /** Returns a safe Center Lane / Base spawn point behind the active defense stage. */
  getDefenderSpawnOrigin(): { readonly x: number; readonly y: number; readonly z: number } {
    switch (this.currentStage) {
      case 'guardian':
        return { x: 0, y: -1950, z: 390 }
      case 'walker':
        return { x: -1288, y: -3850, z: 384 }
      case 'base_guardians':
        return { x: -1280, y: -5850, z: 645 }
      case 'shrines':
      case 'patron_stage1':
      case 'patron_stage2':
        return { x: -1280, y: -8650, z: 645 }
    }
  }

  /** Returns true if `entityHandle` is our Friendly Blue T1 Guardian. */
  isGuardianEntity(entityHandle: number): boolean {
    return entityHandle > 0 && entityHandle === this.entity
  }

  /** Returns true if `entityHandle` belongs to ANY Team 2 defense structure (Guardian, Walker, Base Guardians, Shrines, Patron). */
  isFriendlyStructureEntity(entityHandle: number): boolean {
    return entityHandle > 0 && this.friendlyStructureSet.has(entityHandle)
  }

  /** Outgoing damage multiplier (`1 + 0.25 * upgradeLevel`) applied to all Team 2 structures in `onDamage`. */
  damageMultiplier(): number {
    return computeStructureDamageMult(this.upgradeLevel)
  }

  /** Outgoing damage bonus percentage (`+25%` per level) for HUD display. */
  damageBonusPct(): number {
    return getStructureFortifyAuraSpec(this.upgradeLevel).damageBonusPct
  }

  /** Weapon attack speed bonus percentage (`+18%` per level, up to `+216%`) for HUD display. */
  fireRateBonusPct(): number {
    return getStructureFortifyAuraSpec(this.upgradeLevel).fireRateBonusPct
  }

  /** Ability cooldown speed bonus percentage (`+12%` per level, up to `+72%`) for HUD display. */
  cdrBonusPct(): number {
    return getStructureFortifyAuraSpec(this.upgradeLevel).cdrBonusPct
  }

  /**
   * Returns the current frontline vulnerable structure for Boss AI navigation & siege:
   * `Guardian -> Walker -> nearest Base Guardian -> nearest Shrine -> Patron Stage 1 -> Patron Stage 2`.
   */
  getActiveBossObjective(bossPos: Vector): ActiveObjectiveTarget | undefined {
    if (this.matchState !== 'active') {
      return undefined
    }
    const gEnt = this.locateEntity()
    if (gEnt > 0 && this.health > 0) {
      const pos = this.readEntityPos(gEnt) ?? GUARDIAN_ORIGIN
      return {
        kind: 'guardian',
        entity: gEnt,
        position: pos,
        alive: true,
        siegeRange: 880,
        minStandoff: 485,
        aimOffsetZ: 125,
      }
    }

    if (this.walkerEntity > 0 && this.walkerHealth > 0 && this.isEntityAlive(this.walkerEntity)) {
      const pos = this.readEntityPos(this.walkerEntity) ?? WALKER_ORIGIN
      return {
        kind: 'walker',
        entity: this.walkerEntity,
        position: pos,
        alive: true,
        siegeRange: 920,
        minStandoff: 420,
        aimOffsetZ: 155,
      }
    }

    const liveBaseGuardians = this.baseGuardianEntities
      .filter((e) => e > 0 && this.isEntityAlive(e))
      .map((e) => ({ entity: e, pos: this.readEntityPos(e) ?? BASE_GUARDIAN_ORIGIN }))
    if (liveBaseGuardians.length > 0) {
      liveBaseGuardians.sort(
        (a, b) =>
          Math.hypot(bossPos.x - a.pos.x, bossPos.y - a.pos.y) -
          Math.hypot(bossPos.x - b.pos.x, bossPos.y - b.pos.y),
      )
      const chosen = liveBaseGuardians[0]
      return {
        kind: 'base_guardian',
        entity: chosen.entity,
        position: chosen.pos,
        alive: true,
        siegeRange: 850,
        minStandoff: 300,
        aimOffsetZ: 110,
      }
    }

    const eastAlive = this.eastShrineEntity > 0 && this.isEntityAlive(this.eastShrineEntity)
    const westAlive = this.westShrineEntity > 0 && this.isEntityAlive(this.westShrineEntity)
    if (eastAlive || westAlive) {
      const eastPos =
        (eastAlive ? this.readEntityPos(this.eastShrineEntity) : undefined) ??
        EAST_SHRINE_ORIGIN
      const westPos =
        (westAlive ? this.readEntityPos(this.westShrineEntity) : undefined) ??
        WEST_SHRINE_ORIGIN
      const pickEast =
        eastAlive &&
        (!westAlive ||
          Math.hypot(bossPos.x - eastPos.x, bossPos.y - eastPos.y) <=
            Math.hypot(bossPos.x - westPos.x, bossPos.y - westPos.y))
      return {
        kind: pickEast ? 'shrine_east' : 'shrine_west',
        entity: pickEast ? this.eastShrineEntity : this.westShrineEntity,
        position: pickEast ? eastPos : westPos,
        alive: true,
        siegeRange: 760,
        minStandoff: 260,
        aimOffsetZ: 115,
      }
    }

    const pTarget =
      this.patronCoreEntity > 0 && this.isEntityAlive(this.patronCoreEntity)
        ? this.patronCoreEntity
        : this.patronEntity
    if (pTarget > 0 && this.patronHealth > 0) {
      const pos = this.readEntityPos(pTarget) ?? PATRON_ORIGIN
      const inStage2 = this.patronReachedStage2 || this.patronPhase === 1
      return {
        kind: inStage2 ? 'patron_stage2' : 'patron_stage1',
        entity: pTarget,
        position: pos,
        alive: true,
        siegeRange: inStage2 ? 620 : 900,
        minStandoff: inStage2 ? 190 : 490,
        aimOffsetZ: inStage2 ? 95 : 280,
      }
    }

    return undefined
  }

  /** Applies kamikaze explosion damage from a Graves Zombie to the Friendly Blue T1 Guardian. */
  applyKamikazeDamage(amount: number, currentWave: number): void {
    const ent = this.locateEntity()
    if (ent <= 0) return
    this.applyKamikazeDamageToStructure(ent, amount, currentWave)
  }

  /**
   * Applies kamikaze explosion damage through Source 2's native `damage()` pipeline so
   * invulnerable backline stages stay protected while vulnerable Shrines/Patron fire all
   * C++ `OnDestroyed` and `Phase 1 -> Phase 2` transitions cleanly!
   */
  applyKamikazeDamageToStructure(
    targetEntity: number,
    amount: number,
    currentWave: number,
  ): void {
    if (this.matchState !== 'active' || targetEntity <= 0 || amount <= 0) {
      return
    }
    damage({ victim: targetEntity, amount: Math.round(amount) })
    this.poll(currentWave)
  }

  /**
   * Polls all Team 2 defense structures every second, initializes upgraded Max HP on newly
   * discovered structures (including Patron Stage 2 transition), updates the active frontline
   * stage, refreshes the C++ attack-speed aura, and triggers Defeat ONLY when Patron Stage 2 falls!
   */
  poll(currentWave: number, _now = 0): void {
    this.friendlyStructureSet.clear()

    // 1. Stage 1: Friendly Blue T1 Guardian (`npc_trooper_boss`, Lane 4)
    const gTargetMax = GUARDIAN_BASE_MAX_HP + this.upgradeLevel * GUARDIAN_UPGRADE_HP_BONUS
    this.bonusMaxHp = this.upgradeLevel * GUARDIAN_UPGRADE_HP_BONUS
    const gState = this.syncSingleStructure(
      this.locateGuardianCandidate(),
      gTargetMax,
      GUARDIAN_ORIGIN,
    )
    if (gState.entity > 0) {
      this.entity = gState.entity
      this.guardianSeen = true
      this.health = gState.alive ? gState.health : 0
      this.maxHealth = Math.max(gTargetMax, gState.maxHealth)
    } else if (!this.guardianSeen && currentWave === 0 && this.hasNativeCenterGuardianSpawner()) {
      // PreGameWait has not yet fired `info_super_trooper_spawn` (14019); keep Stage 1 primed.
      this.health = gTargetMax
      this.maxHealth = gTargetMax
    } else {
      this.entity = 0
      this.health = 0
      this.maxHealth = gTargetMax
    }

    // 2. Stage 2: Friendly Blue T2 Walker (`npc_boss_tier2`, `[PR#]rebels_t2_boss_blue`)
    const wTargetMax = WALKER_BASE_MAX_HP + this.upgradeLevel * WALKER_UPGRADE_HP_BONUS
    const walkerCandidate = this.locateWalkerCandidate()
    if (walkerCandidate > 0) {
      this.walkerEntity = walkerCandidate
      this.walkerSeen = true
      const wState = this.syncSingleStructure(this.walkerEntity, wTargetMax, WALKER_ORIGIN)
      this.walkerHealth = wState.alive ? wState.health : 0
      this.walkerMaxHealth = Math.max(wTargetMax, wState.maxHealth)
    } else if (this.walkerSeen || this.walkerEntity > 0) {
      this.walkerSeen = true
      this.walkerEntity = 0
      this.walkerHealth = 0
      this.walkerMaxHealth = wTargetMax
    } else {
      // No Walker entity present in world (e.g. lightweight unit-test mock) -> treat as bypassed once Guardian dies
      this.walkerHealth = this.health > 0 ? wTargetMax : 0
      this.walkerMaxHealth = wTargetMax
    }

    // Also register & fortify any alive side-lane Team 2 Walkers so all Team 2 Walkers stay synced.
    for (const sideWalker of findEntities('npc_boss_tier2')) {
      if (sideWalker !== this.walkerEntity && this.readEntityTeam(sideWalker) === DEFENDER_TEAM) {
        this.syncSingleStructure(sideWalker, wTargetMax, WALKER_ORIGIN)
      }
    }

    // 3. Stage 3: Twin Friendly Blue Base Guardians (`npc_barrack_boss`, `[PR#]rebels_watcher_blue`)
    const bgUnitMax =
      BASE_GUARDIAN_BASE_MAX_HP + this.upgradeLevel * BASE_GUARDIAN_UPGRADE_HP_BONUS
    if (this.baseGuardianEntities.length > 0) {
      this.baseGuardiansSeen = true
      this.baseGuardianEntities = this.baseGuardianEntities.filter(
        (e) => e > 0 && this.isEntityAlive(e),
      )
    }
    const bgCandidates = this.locateBlueBaseGuardianCandidates()
    if (bgCandidates.length > 0) {
      this.baseGuardiansSeen = true
      for (const cand of bgCandidates) {
        if (!this.baseGuardianEntities.includes(cand)) {
          this.baseGuardianEntities.push(cand)
        }
      }
    }
    if (this.baseGuardianEntities.length > 0) {
      let bgHpSum = 0
      let bgMaxSum = 0
      let bgAlive = 0
      for (const bgEnt of this.baseGuardianEntities) {
        const st = this.syncSingleStructure(bgEnt, bgUnitMax, BASE_GUARDIAN_ORIGIN)
        if (st.alive) {
          bgHpSum += st.health
          bgAlive++
        }
        bgMaxSum += Math.max(bgUnitMax, st.maxHealth)
      }
      this.baseGuardiansHealth = bgHpSum
      this.baseGuardiansMaxHealth = Math.max(bgUnitMax * 2, bgMaxSum)
      this.baseGuardiansAliveCount = bgAlive
    } else if (this.baseGuardiansSeen) {
      this.baseGuardiansHealth = 0
      this.baseGuardiansMaxHealth = bgUnitMax * 2
      this.baseGuardiansAliveCount = 0
    } else {
      this.baseGuardiansHealth = this.walkerHealth > 0 ? bgUnitMax * 2 : 0
      this.baseGuardiansMaxHealth = bgUnitMax * 2
      this.baseGuardiansAliveCount = this.walkerHealth > 0 ? 2 : 0
    }

    // Also register & fortify side-lane Team 2 Base Guardians (`rebels_watcher_yellow` / `purple`).
    for (const sideBg of findEntities('npc_barrack_boss')) {
      if (
        !this.baseGuardianEntities.includes(sideBg) &&
        this.readEntityTeam(sideBg) === DEFENDER_TEAM
      ) {
        this.syncSingleStructure(sideBg, bgUnitMax, BASE_GUARDIAN_ORIGIN)
      }
    }

    // 4. Stage 4: Twin Amber Shrines (`destroyable_building`, East Purple & West Yellow)
    const shrineUnitMax = SHRINE_BASE_MAX_HP + this.upgradeLevel * SHRINE_UPGRADE_HP_BONUS
    if (this.eastShrineEntity > 0) {
      this.shrinesSeen = true
      if (!this.isEntityAlive(this.eastShrineEntity)) {
        this.eastShrineEntity = 0
      }
    }
    if (this.westShrineEntity > 0) {
      this.shrinesSeen = true
      if (!this.isEntityAlive(this.westShrineEntity)) {
        this.westShrineEntity = 0
      }
    }
    const eastCand = this.locateNamedTeam2Entity(EAST_SHRINE_TARGETNAMES)
    const westCand = this.locateNamedTeam2Entity(WEST_SHRINE_TARGETNAMES)
    if (eastCand > 0) {
      this.eastShrineEntity = eastCand
      this.shrinesSeen = true
    }
    if (westCand > 0) {
      this.westShrineEntity = westCand
      this.shrinesSeen = true
    }
    if (this.eastShrineEntity <= 0 && this.westShrineEntity <= 0 && !this.shrinesSeen) {
      for (const bEnt of findEntities('destroyable_building')) {
        if (this.readEntityTeam(bEnt) !== DEFENDER_TEAM || !this.isEntityAlive(bEnt)) continue
        const p = this.readEntityPos(bEnt)
        if (p && p.x >= -1000) {
          if (this.eastShrineEntity <= 0) {
            this.eastShrineEntity = bEnt
            this.shrinesSeen = true
          }
        } else if (this.westShrineEntity <= 0) {
          this.westShrineEntity = bEnt
          this.shrinesSeen = true
        }
      }
    }

    const shrineKnownHandles = [this.eastShrineEntity, this.westShrineEntity].filter((e) => e > 0)
    if (shrineKnownHandles.length > 0) {
      let sHpSum = 0
      let sMaxSum = 0
      let sAlive = 0
      for (const sEnt of shrineKnownHandles) {
        const st = this.syncSingleStructure(sEnt, shrineUnitMax, EAST_SHRINE_ORIGIN)
        if (st.alive) {
          sHpSum += st.health
          sAlive++
        }
        sMaxSum += Math.max(shrineUnitMax, st.maxHealth)
      }
      this.shrinesHealth = sHpSum
      this.shrinesMaxHealth = Math.max(shrineUnitMax * 2, sMaxSum)
      this.shrinesAliveCount = sAlive
    } else if (this.shrinesSeen) {
      this.shrinesHealth = 0
      this.shrinesMaxHealth = shrineUnitMax * 2
      this.shrinesAliveCount = 0
    } else {
      this.shrinesHealth = this.baseGuardiansHealth > 0 ? shrineUnitMax * 2 : 0
      this.shrinesMaxHealth = shrineUnitMax * 2
      this.shrinesAliveCount = this.baseGuardiansHealth > 0 ? 2 : 0
    }

    // 5. Stage 5 & Stage 6: Amber Patron (`npc_boss_tier3` Stage 1 -> Stage 2 Weakened in Pit)
    const pCand = this.locatePatronCandidate()
    if (pCand > 0) {
      this.patronEntity = pCand
      this.patronSeen = true
    }
    this.patronCoreEntity = this.locatePatronCoreCandidate()
    if (this.patronCoreEntity > 0) {
      this.patronSeen = true
      this.friendlyStructureSet.add(this.patronCoreEntity)
    }

    if (this.patronEntity > 0 || this.patronCoreEntity > 0) {
      if (this.patronEntity > 0) {
        this.friendlyStructureSet.add(this.patronEntity)
        const rawPhase = readField(this.patronEntity, 'CNPC_Boss_Tier3', 'm_ePhase', 'int32')
        if (typeof rawPhase === 'number') {
          this.patronPhase = rawPhase
        }
      }
      if (this.patronPhase === 1 || this.patronCoreEntity > 0) {
        this.patronReachedStage2 = true
      }

      const pBaseMax = this.patronReachedStage2
        ? PATRON_STAGE2_BASE_MAX_HP
        : PATRON_STAGE1_BASE_MAX_HP
      const pTargetMax = pBaseMax + this.upgradeLevel * PATRON_UPGRADE_HP_BONUS
      const activePatronEnt =
        this.patronCoreEntity > 0 ? this.patronCoreEntity : this.patronEntity

      // When Patron first enters Weakened Stage 2 (`m_ePhase === 1`), apply accumulated
      // Fortification Max HP bonus immediately so Stage 2 inherits full base upgrades!
      if (this.patronReachedStage2 && !this.patronStage2HpInitialized) {
        const curState = this.readStructureState(activePatronEnt, PATRON_ORIGIN)
        if (curState.alive && curState.health > 0) {
          const bonusHp = this.upgradeLevel * PATRON_UPGRADE_HP_BONUS
          const nextMax = Math.max(pTargetMax, curState.maxHealth + bonusHp)
          const nextHp = Math.min(nextMax, curState.health + bonusHp)
          this.applyEntityHealth(activePatronEnt, nextHp, nextMax)
          this.initializedEntities.add(activePatronEnt)
          this.patronStage2HpInitialized = true
        }
      }

      const pState = this.syncSingleStructure(activePatronEnt, pTargetMax, PATRON_ORIGIN)
      this.patronHealth = pState.alive ? pState.health : 0
      this.patronMaxHealth = Math.max(pTargetMax, pState.maxHealth)
    } else if (this.patronSeen) {
      const pBaseMax = this.patronReachedStage2
        ? PATRON_STAGE2_BASE_MAX_HP
        : PATRON_STAGE1_BASE_MAX_HP
      this.patronHealth = 0
      this.patronMaxHealth = pBaseMax + this.upgradeLevel * PATRON_UPGRADE_HP_BONUS
    } else {
      const pTargetMax = PATRON_STAGE1_BASE_MAX_HP + this.upgradeLevel * PATRON_UPGRADE_HP_BONUS
      this.patronHealth = pTargetMax
      this.patronMaxHealth = pTargetMax
    }

    // 6. Evaluate active defense stage & defeat condition
    const evalResult = evaluateBaseDefenseProgression({
      guardianHp: this.health,
      walkerHp: this.walkerHealth,
      baseGuardiansHp: this.baseGuardiansHealth,
      shrinesHp: this.shrinesHealth,
      patronHp: this.patronHealth,
      patronPhase: this.patronPhase,
      patronReachedStage2: this.patronReachedStage2,
    })

    this.currentStage = evalResult.stage
    this.stageLabel = evalResult.stageLabel
    this.syncActiveObjectiveSummary()

    if (this.matchState === 'active') {
      this.announceStageTransitionIfNeeded(evalResult.stage, currentWave)
      if (evalResult.defeated && (this.patronEntity > 0 || this.patronCoreEntity > 0 || this.patronSeen)) {
        this.onPatronFallen(currentWave)
      }
    }
  }

  /**
   * Repairs ALL damaged, alive Team 2 defense structures (`Guardian`, `Walker`,
   * `Base Guardians`, `Shrines`, `Patron`) for a single Soul payment!
   */
  repairByPlayer(player: Player): boolean {
    if (this.matchState !== 'active') {
      toast(player, 'Cannot repair while match is not active.')
      return false
    }
    const pawn = player.pawn()
    if (!pawn) {
      toast(player, 'Spawn your hero first.')
      return false
    }

    this.poll(0)
    const repairTargets = this.collectRepairableStructures()
    if (repairTargets.length === 0) {
      const fallback = computeGuardianRepair(this.health, this.maxHealth, pawn.souls)
      if (!fallback.ok) {
        toast(player, fallback.reason ?? 'Repair unavailable.')
        return false
      }
      player.adjustSouls(-fallback.soulsSpent, false)
      this.applyEntityHealth(this.entity, fallback.newHp, this.maxHealth)
      this.health = fallback.newHp
      player.sound('Powerup.Pickup.Generic')
      toast(
        player,
        `Repaired structures for +${fallback.healedAmount} HP (-${GUARDIAN_REPAIR_COST_SOULS} Souls)!`,
      )
      return true
    }

    const evalRepair = evaluateAllStructuresRepair(repairTargets, pawn.souls)
    if (!evalRepair.ok) {
      toast(player, evalRepair.reason ?? 'Repair unavailable.')
      return false
    }

    player.adjustSouls(-evalRepair.soulsSpent, false)
    for (const upd of evalRepair.updates) {
      const ent = Number(upd.id)
      const target = repairTargets.find((t) => t.id === upd.id)
      if (ent > 0 && target) {
        this.applyEntityHealth(ent, upd.newHp, target.maxHp)
      }
    }
    this.poll(0)
    player.sound('Powerup.Pickup.Generic')
    toast(
      player,
      `Repaired ${evalRepair.repairedCount} structure${evalRepair.repairedCount === 1 ? '' : 's'} (+${evalRepair.totalHealed} total HP, -${GUARDIAN_REPAIR_COST_SOULS} Souls)!`,
    )
    return true
  }

  /**
   * Fortifies ALL Team 2 defense structures simultaneously:
   * - Scales Max HP + heals Guardian, Walker, Base Guardians, Shrines, and Patron
   * - Increases all structure Outgoing Damage by `+25%` per level
   * - Increases all structure Attack Speed by `+18%` Fire Rate & `+12%` Ability Speed per level
   */
  upgradeByPlayer(player: Player): boolean {
    if (this.matchState !== 'active') {
      toast(player, 'Cannot fortify while match is not active.')
      return false
    }
    const pawn = player.pawn()
    if (!pawn) {
      toast(player, 'Spawn your hero first.')
      return false
    }
    const cost = this.nextUpgradeCost()
    if (pawn.souls < cost) {
      toast(
        player,
        `Need ${cost} Souls to fortify all structures (Lv.${this.upgradeLevel + 1}).`,
      )
      return false
    }
    player.adjustSouls(-cost, false)
    this.applyAllStructureUpgrade(true, 0)
    player.sound('Powerup.Pickup.Generic')
    toast(
      player,
      `Fortified ALL Structures to Lv.${this.upgradeLevel} (+Max HP, +${this.damageBonusPct()}% Dmg, +${this.fireRateBonusPct()}% Atk Spd)!`,
    )
    return true
  }

  /** Applies a free all-structure heal and/or fortification level from a Major Boon (`Sapphire Bastion`). */
  applyMajorBoonFortify(healAmount: number, addUpgradeLevel: boolean): void {
    this.poll(0)
    if (addUpgradeLevel) {
      this.applyAllStructureUpgrade(true, healAmount)
    } else if (healAmount > 0) {
      this.healAllAliveStructures(healAmount)
      this.poll(0)
    }
  }

  /** Returns the Soul cost for the next Base Defense fortification level. */
  nextUpgradeCost(): number {
    return computeGuardianUpgradeCost(this.upgradeLevel)
  }

  private applyAllStructureUpgrade(incrementLevel: boolean, extraHeal: number): void {
    this.poll(0)
    if (incrementLevel) {
      this.upgradeLevel++
      this.bonusMaxHp = this.upgradeLevel * GUARDIAN_UPGRADE_HP_BONUS
    }

    const upgradeEntries: { ent: number; maxBonus: number; healBonus: number }[] = []
    if (this.entity > 0 && this.isEntityAlive(this.entity)) {
      upgradeEntries.push({
        ent: this.entity,
        maxBonus: GUARDIAN_UPGRADE_HP_BONUS,
        healBonus: Math.max(GUARDIAN_UPGRADE_HP_BONUS, extraHeal),
      })
    }
    for (const wEnt of findEntities('npc_boss_tier2')) {
      if (this.readEntityTeam(wEnt) === DEFENDER_TEAM && this.isEntityAlive(wEnt)) {
        upgradeEntries.push({
          ent: wEnt,
          maxBonus: WALKER_UPGRADE_HP_BONUS,
          healBonus: Math.max(WALKER_UPGRADE_HP_BONUS, extraHeal),
        })
      }
    }
    for (const bgEnt of findEntities('npc_barrack_boss')) {
      if (this.readEntityTeam(bgEnt) === DEFENDER_TEAM && this.isEntityAlive(bgEnt)) {
        upgradeEntries.push({
          ent: bgEnt,
          maxBonus: BASE_GUARDIAN_UPGRADE_HP_BONUS,
          healBonus: Math.max(BASE_GUARDIAN_UPGRADE_HP_BONUS, extraHeal),
        })
      }
    }
    for (const sEnt of [this.eastShrineEntity, this.westShrineEntity]) {
      if (sEnt > 0 && this.isEntityAlive(sEnt)) {
        upgradeEntries.push({
          ent: sEnt,
          maxBonus: SHRINE_UPGRADE_HP_BONUS,
          healBonus: Math.max(SHRINE_UPGRADE_HP_BONUS, extraHeal),
        })
      }
    }
    const pEnt =
      this.patronCoreEntity > 0 && this.isEntityAlive(this.patronCoreEntity)
        ? this.patronCoreEntity
        : this.patronEntity
    if (pEnt > 0 && this.isEntityAlive(pEnt)) {
      upgradeEntries.push({
        ent: pEnt,
        maxBonus: PATRON_UPGRADE_HP_BONUS,
        healBonus: Math.max(PATRON_UPGRADE_HP_BONUS, extraHeal),
      })
    }

    const seen = new Set<number>()
    for (const item of upgradeEntries) {
      if (seen.has(item.ent)) continue
      seen.add(item.ent)
      const st = this.readStructureState(item.ent, GUARDIAN_ORIGIN)
      if (!st.alive) continue
      const newMax = st.maxHealth + item.maxBonus
      const newHp = Math.min(newMax, st.health + item.healBonus)
      this.applyEntityHealth(item.ent, newHp, newMax)
      this.initializedEntities.add(item.ent)
    }

    this.poll(0)
  }

  private healAllAliveStructures(healAmount: number): void {
    for (const t of this.collectRepairableStructures()) {
      const ent = Number(t.id)
      if (ent > 0 && t.hp > 0 && t.hp < t.maxHp) {
        const nextHp = Math.min(t.maxHp, t.hp + healAmount)
        this.applyEntityHealth(ent, nextHp, t.maxHp)
      }
    }
  }

  private collectRepairableStructures(): RepairableStructureInput[] {
    const out: RepairableStructureInput[] = []
    const seen = new Set<number>()
    const addCandidate = (ent: number, fallbackMax: number) => {
      if (ent <= 0 || seen.has(ent)) return
      seen.add(ent)
      const st = this.readStructureState(ent, GUARDIAN_ORIGIN)
      if (!st.alive || st.health <= 0) return
      const maxHp = Math.max(fallbackMax, st.maxHealth)
      out.push({ id: String(ent), hp: st.health, maxHp })
    }

    addCandidate(
      this.entity,
      GUARDIAN_BASE_MAX_HP + this.upgradeLevel * GUARDIAN_UPGRADE_HP_BONUS,
    )
    addCandidate(
      this.walkerEntity,
      WALKER_BASE_MAX_HP + this.upgradeLevel * WALKER_UPGRADE_HP_BONUS,
    )
    for (const bgEnt of this.baseGuardianEntities) {
      addCandidate(
        bgEnt,
        BASE_GUARDIAN_BASE_MAX_HP + this.upgradeLevel * BASE_GUARDIAN_UPGRADE_HP_BONUS,
      )
    }
    addCandidate(
      this.eastShrineEntity,
      SHRINE_BASE_MAX_HP + this.upgradeLevel * SHRINE_UPGRADE_HP_BONUS,
    )
    addCandidate(
      this.westShrineEntity,
      SHRINE_BASE_MAX_HP + this.upgradeLevel * SHRINE_UPGRADE_HP_BONUS,
    )
    const activePatron =
      this.patronCoreEntity > 0 && this.isEntityAlive(this.patronCoreEntity)
        ? this.patronCoreEntity
        : this.patronEntity
    addCandidate(
      activePatron,
      (this.patronReachedStage2 ? PATRON_STAGE2_BASE_MAX_HP : PATRON_STAGE1_BASE_MAX_HP) +
        this.upgradeLevel * PATRON_UPGRADE_HP_BONUS,
    )
    // Include any alive side-lane Team 2 Walkers / Base Guardians if damaged
    for (const wEnt of findEntities('npc_boss_tier2')) {
      if (this.readEntityTeam(wEnt) === DEFENDER_TEAM) {
        addCandidate(
          wEnt,
          WALKER_BASE_MAX_HP + this.upgradeLevel * WALKER_UPGRADE_HP_BONUS,
        )
      }
    }
    for (const bgEnt of findEntities('npc_barrack_boss')) {
      if (this.readEntityTeam(bgEnt) === DEFENDER_TEAM) {
        addCandidate(
          bgEnt,
          BASE_GUARDIAN_BASE_MAX_HP + this.upgradeLevel * BASE_GUARDIAN_UPGRADE_HP_BONUS,
        )
      }
    }

    return out
  }

  private syncActiveObjectiveSummary(): void {
    switch (this.currentStage) {
      case 'guardian':
        this.activeObjectiveHealth = this.health
        this.activeObjectiveMaxHealth = this.maxHealth
        break
      case 'walker':
        this.activeObjectiveHealth = this.walkerHealth
        this.activeObjectiveMaxHealth = this.walkerMaxHealth
        break
      case 'base_guardians':
        this.activeObjectiveHealth = this.baseGuardiansHealth
        this.activeObjectiveMaxHealth = this.baseGuardiansMaxHealth
        break
      case 'shrines':
        this.activeObjectiveHealth = this.shrinesHealth
        this.activeObjectiveMaxHealth = this.shrinesMaxHealth
        break
      case 'patron_stage1':
      case 'patron_stage2':
        this.activeObjectiveHealth = this.patronHealth
        this.activeObjectiveMaxHealth = this.patronMaxHealth
        break
    }
  }

  private announceStageTransitionIfNeeded(stage: DefenseStage, wave: number): void {
    if (this.announcedMilestones.has(stage)) {
      return
    }
    this.announcedMilestones.add(stage)

    let title = ''
    let detail = ''
    switch (stage) {
      case 'walker':
        title = 'BLUE GUARDIAN FALLEN'
        detail = `Fall back on Wave ${Math.max(1, wave)} and defend the Blue Walker!`
        break
      case 'base_guardians':
        title = 'BLUE WALKER DESTROYED'
        detail = 'Hold the Broadway ramp and defend the Twin Base Guardians!'
        break
      case 'shrines':
        title = 'BASE GATE BREACHED'
        detail = 'Protect the East & West Amber Shrines!'
        break
      case 'patron_stage1':
        title = 'SHRINES DESTROYED'
        detail = 'The Amber Patron is exposed — defend the Patron!'
        break
      case 'patron_stage2':
        title = 'PATRON WEAKENED — FINAL STAND!'
        detail = 'The Patron has fallen into the Pit! If Weakened Patron falls, the match is lost!'
        break
      default:
        return
    }

    log(`Defense stage advanced to ${stage} on Wave ${wave}: ${title}`)
    for (const conn of players()) {
      conn.player.announce(title, detail)
    }
  }

  private onPatronFallen(wave: number): void {
    this.matchState = 'defeat'
    log(`Weakened Amber Patron fallen on Wave ${wave} — Match Defeat`)
    for (const conn of players()) {
      conn.player.announce(
        'AMBER PATRON DESTROYED',
        `Survived to Wave ${wave}! Type /restarttd or click Restart to play again.`,
      )
      conn.player.addMetric('td.waves_cleared', Math.max(0, wave - 1))
    }
  }

  private syncSingleStructure(
    ent: number,
    targetMaxHp: number,
    fallbackOrigin: Vector,
  ): StructureUnitState {
    if (ent <= 0) {
      return {
        entity: 0,
        position: fallbackOrigin,
        health: 0,
        maxHealth: targetMaxHp,
        alive: false,
      }
    }
    this.friendlyStructureSet.add(ent)
    let state = this.readStructureState(ent, fallbackOrigin)
    if (state.alive && !this.initializedEntities.has(ent)) {
      this.initializedEntities.add(ent)
      const desiredMax = Math.max(targetMaxHp, state.maxHealth)
      const missingBonus = Math.max(0, desiredMax - state.maxHealth)
      const desiredHp =
        state.health >= state.maxHealth
          ? desiredMax
          : Math.min(desiredMax, state.health + missingBonus)
      this.applyEntityHealth(ent, desiredHp, desiredMax)
      state = {
        ...state,
        health: desiredHp,
        maxHealth: desiredMax,
      }
    }
    return state
  }

  private locateGuardianCandidate(): number {
    return this.locateEntity()
  }

  private locateWalkerCandidate(): number {
    if (this.walkerEntity > 0) {
      if (this.isEntityAlive(this.walkerEntity)) {
        this.walkerSeen = true
        return this.walkerEntity
      }
      this.walkerSeen = true
      this.walkerEntity = 0
    }
    const byName = this.locateNamedTeam2Entity(WALKER_TARGETNAMES)
    if (byName > 0) {
      this.walkerSeen = true
      return byName
    }
    for (const w of findEntities('npc_boss_tier2')) {
      if (this.readEntityTeam(w) !== DEFENDER_TEAM || !this.isEntityAlive(w)) continue
      const pos = this.readEntityPos(w)
      if (pos && Math.hypot(pos.x - WALKER_ORIGIN.x, pos.y - WALKER_ORIGIN.y) < 1200) {
        this.walkerSeen = true
        return w
      }
    }
    return 0
  }

  private locateBlueBaseGuardianCandidates(): number[] {
    const out: number[] = []
    for (const name of BASE_GUARDIAN_TARGETNAMES) {
      for (const h of findEntitiesByName(name)) {
        if (h > 0 && !out.includes(h) && this.isEntityAlive(h)) {
          out.push(h)
        }
      }
    }
    if (out.length > 0) {
      return out
    }
    for (const h of findEntities('npc_barrack_boss')) {
      if (this.readEntityTeam(h) !== DEFENDER_TEAM || !this.isEntityAlive(h)) continue
      const pos = this.readEntityPos(h)
      if (
        pos &&
        Math.hypot(pos.x - BASE_GUARDIAN_ORIGIN.x, pos.y - BASE_GUARDIAN_ORIGIN.y) < 900 &&
        !out.includes(h)
      ) {
        out.push(h)
      }
    }
    return out
  }

  private locatePatronCandidate(): number {
    if (this.patronEntity > 0) {
      if (this.isEntityAlive(this.patronEntity)) {
        this.patronSeen = true
        return this.patronEntity
      }
      this.patronSeen = true
      this.patronEntity = 0
    }
    for (const h of findEntities('npc_boss_tier3')) {
      if (this.readEntityTeam(h) === DEFENDER_TEAM && this.isEntityAlive(h)) {
        this.patronSeen = true
        return h
      }
    }
    return 0
  }

  private locatePatronCoreCandidate(): number {
    for (const h of findEntities('npc_boss_tier3core')) {
      if (this.readEntityTeam(h) === DEFENDER_TEAM && this.isEntityAlive(h)) {
        return h
      }
    }
    return 0
  }

  private locateNamedTeam2Entity(names: readonly string[]): number {
    for (const name of names) {
      for (const h of findEntitiesByName(name)) {
        if (h > 0 && this.isEntityAlive(h)) {
          return h
        }
      }
    }
    return 0
  }

  private isEntityAlive(ent: number): boolean {
    if (ent <= 0) return false
    const lifeState = readField(ent, 'CBaseEntity', 'm_lifeState', 'uint8')
    if (typeof lifeState === 'number' && lifeState !== 0) {
      return false
    }
    const npc = new Npc(ent).read()
    if (npc) {
      return npc.health > 0
    }
    const rawHp = readField(ent, 'CBaseEntity', 'm_iHealth', 'int32')
    return typeof rawHp === 'number' && rawHp > 0
  }

  private readEntityTeam(ent: number): number | undefined {
    const npc = new Npc(ent).read()
    if (npc) return npc.team
    const team = readField(ent, 'CBaseEntity', 'm_iTeamNum', 'int32')
    return typeof team === 'number' ? team : undefined
  }

  private readEntityPos(ent: number): Vector | undefined {
    return new Npc(ent).read()?.position ?? entityPosition(ent)?.position
  }

  private readStructureState(ent: number, fallbackOrigin: Vector): StructureUnitState {
    const lifeState = readField(ent, 'CBaseEntity', 'm_lifeState', 'uint8')
    const deadByLifeState = typeof lifeState === 'number' && lifeState !== 0
    const npc = new Npc(ent).read()
    const rawHp =
      npc?.health ??
      (readField(ent, 'CBaseEntity', 'm_iHealth', 'int32') as number | undefined) ??
      0
    const rawMax =
      npc?.maxHealth ??
      (readField(ent, 'CBaseEntity', 'm_iMaxHealth', 'int32') as number | undefined) ??
      0
    const pos = npc?.position ?? entityPosition(ent)?.position ?? fallbackOrigin
    const hp = deadByLifeState ? 0 : Math.max(0, rawHp)
    return {
      entity: ent,
      position: pos,
      health: hp,
      maxHealth: Math.max(0, rawMax),
      alive: !deadByLifeState && hp > 0,
    }
  }

  private applyEntityHealth(ent: number, hp: number, maxHp: number): void {
    if (ent <= 0) return
    const isShrineBuilding = entityClass(ent)?.designerName === 'destroyable_building'
    if (new Npc(ent).setHealth(hp, maxHp)) {
      if (!isShrineBuilding) {
        fireInput(ent, 'OverrideHealth', { integer: maxHp })
        fireInput(ent, 'SetHealth', { integer: hp })
      }
    } else {
      writeField(ent, 'CBaseEntity', 'm_iMaxHealth', 'int32', maxHp)
      writeField(ent, 'CBaseEntity', 'm_iHealth', 'int32', hp)
    }
  }
}

export { GUARDIAN_REPAIR_AMOUNT_HP, GUARDIAN_REPAIR_COST_SOULS }
