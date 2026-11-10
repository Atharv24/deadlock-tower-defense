// Friendly Blue T1 Guardian (boss_rebel_t1_blue) health tracking, Soul-paid
// repairs & upgrades, and Defeat / Restart state management.

import {
  findEntities,
  findEntitiesByName,
  log,
  Npc,
  type Player,
  players,
  readField,
  toast,
  writeField,
} from 'modlock'

import {
  computeGuardianRepair,
  computeGuardianUpgradeCost,
  GUARDIAN_BASE_MAX_HP,
  GUARDIAN_ORIGIN,
  GUARDIAN_REPAIR_AMOUNT_HP,
  GUARDIAN_REPAIR_COST_SOULS,
  GUARDIAN_TARGETNAMES,
  GUARDIAN_UPGRADE_HP_BONUS,
} from './config'

export type MatchState = 'waiting' | 'active' | 'defeat' | 'victory'

export class GuardianManager {
  entity = 0
  health = GUARDIAN_BASE_MAX_HP
  maxHealth = GUARDIAN_BASE_MAX_HP
  upgradeLevel = 0
  bonusMaxHp = 0
  matchState: MatchState = 'waiting'
  private initializedHealth = false

  /** Resets Guardian tracking for a new world or /restarttd. */
  reset(): void {
    this.entity = 0
    this.upgradeLevel = 0
    this.bonusMaxHp = 0
    this.maxHealth = GUARDIAN_BASE_MAX_HP
    this.health = GUARDIAN_BASE_MAX_HP
    this.matchState = 'active'
    this.initializedHealth = false
    this.locateEntity()
    if (this.entity > 0) {
      this.applyHealth(GUARDIAN_BASE_MAX_HP, GUARDIAN_BASE_MAX_HP)
      this.initializedHealth = true
    }
  }

  /** Restores state from Modlock hot-reload handoff. */
  restore(upgradeLevel: number, bonusMaxHp: number, matchState: MatchState): void {
    this.upgradeLevel = upgradeLevel
    this.bonusMaxHp = bonusMaxHp
    this.maxHealth = GUARDIAN_BASE_MAX_HP + bonusMaxHp
    this.matchState = matchState
    this.locateEntity()
  }

  /** Finds the Friendly Blue T1 Guardian entity handle in Center Lane. */
  locateEntity(): number {
    if (this.entity > 0) {
      const npc = new Npc(this.entity).read()
      if (npc && npc.health > 0) {
        return this.entity
      }
    }

    for (const name of GUARDIAN_TARGETNAMES) {
      const matches = findEntitiesByName(name)
      if (matches.length > 0 && matches[0] > 0) {
        this.entity = matches[0]
        return this.entity
      }
    }

    // Fallback: locate Team 2 npc_trooper_boss nearest Center Lane Guardian origin.
    const bosses = findEntities('npc_trooper_boss')
    for (const handle of bosses) {
      const npc = new Npc(handle).read()
      if (npc && npc.team === 2) {
        const dx = npc.position.x - GUARDIAN_ORIGIN.x
        const dy = npc.position.y - GUARDIAN_ORIGIN.y
        if (dx * dx + dy * dy < 600 * 600) {
          this.entity = handle
          return this.entity
        }
      }
    }
    return 0
  }

  /** Polls Guardian HP each second and detects Defeat if the Guardian falls. */
  poll(currentWave: number): void {
    const ent = this.locateEntity()
    if (ent <= 0) {
      return
    }

    const targetMax = GUARDIAN_BASE_MAX_HP + this.bonusMaxHp
    if (!this.initializedHealth) {
      this.applyHealth(targetMax, targetMax)
      this.initializedHealth = true
    }

    const npc = new Npc(ent).read()
    const rawHp =
      npc?.health ??
      (readField(ent, 'CBaseEntity', 'm_iHealth', 'int32') as number | undefined)
    const rawMax =
      npc?.maxHealth ??
      (readField(ent, 'CBaseEntity', 'm_iMaxHealth', 'int32') as number | undefined)

    if (typeof rawMax === 'number' && rawMax > 0) {
      this.maxHealth = Math.max(targetMax, rawMax)
    } else {
      this.maxHealth = targetMax
    }

    if (typeof rawHp === 'number') {
      this.health = Math.max(0, rawHp)
    }

    if (this.matchState === 'active' && this.health <= 0) {
      this.onGuardianFallen(currentWave)
    }
  }

  /** Repairs the Friendly Blue T1 Guardian using the player's Souls. */
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
    const result = computeGuardianRepair(this.health, this.maxHealth, pawn.souls)
    if (!result.ok) {
      toast(player, result.reason ?? 'Repair unavailable.')
      return false
    }
    player.adjustSouls(-result.soulsSpent, false)
    this.applyHealth(result.newHp, this.maxHealth)
    player.sound('Powerup.Pickup.Generic')
    toast(
      player,
      `Repaired Blue Guardian for +${result.healedAmount} HP (-${GUARDIAN_REPAIR_COST_SOULS} Souls)!`,
    )
    return true
  }

  /** Upgrades the Friendly Blue T1 Guardian's Max HP and armor using Souls. */
  upgradeByPlayer(player: Player): boolean {
    if (this.matchState !== 'active') {
      toast(player, 'Cannot upgrade while match is not active.')
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
        `Need ${cost} Souls to fortify Blue Guardian (Lv.${this.upgradeLevel + 1}).`,
      )
      return false
    }
    player.adjustSouls(-cost, false)
    this.applyUpgradeBonus(GUARDIAN_UPGRADE_HP_BONUS, GUARDIAN_UPGRADE_HP_BONUS)
    player.sound('Powerup.Pickup.Generic')
    toast(
      player,
      `Fortified Blue Guardian to Lv.${this.upgradeLevel} (+${GUARDIAN_UPGRADE_HP_BONUS} Max HP & Heal)!`,
    )
    return true
  }

  /** Applies a free heal and/or fortification from a Major Boon pick. */
  applyMajorBoonFortify(healAmount: number, addUpgradeLevel: boolean): void {
    if (addUpgradeLevel) {
      this.applyUpgradeBonus(GUARDIAN_UPGRADE_HP_BONUS, healAmount)
    } else if (healAmount > 0) {
      const nextHp = Math.min(this.maxHealth, this.health + healAmount)
      this.applyHealth(nextHp, this.maxHealth)
    }
  }

  /** Returns the Soul cost for the next Guardian fortification level. */
  nextUpgradeCost(): number {
    return computeGuardianUpgradeCost(this.upgradeLevel)
  }

  /** Returns true if the given entity handle is our Friendly Blue T1 Guardian. */
  isGuardianEntity(entityHandle: number): boolean {
    return entityHandle > 0 && entityHandle === this.entity
  }

  private applyUpgradeBonus(maxHpDelta: number, healDelta: number): void {
    this.upgradeLevel++
    this.bonusMaxHp += maxHpDelta
    const newMax = GUARDIAN_BASE_MAX_HP + this.bonusMaxHp
    const newHp = Math.min(newMax, this.health + healDelta)
    this.applyHealth(newHp, newMax)
  }

  private applyHealth(hp: number, maxHp: number): void {
    this.health = hp
    this.maxHealth = maxHp
    if (this.entity > 0) {
      if (!new Npc(this.entity).setHealth(hp, maxHp)) {
        writeField(this.entity, 'CBaseEntity', 'm_iMaxHealth', 'int32', maxHp)
        writeField(this.entity, 'CBaseEntity', 'm_iHealth', 'int32', hp)
      }
    }
  }

  private onGuardianFallen(wave: number): void {
    this.matchState = 'defeat'
    log(`Blue Guardian fallen on Wave ${wave}`)
    for (const conn of players()) {
      conn.player.announce(
        'GUARDIAN FALLEN',
        `Survived to Wave ${wave}! Type /restarttd or click Restart to play again.`,
      )
      conn.player.addMetric('td.waves_cleared', Math.max(0, wave - 1))
    }
  }
}

export { GUARDIAN_REPAIR_AMOUNT_HP, GUARDIAN_REPAIR_COST_SOULS }
