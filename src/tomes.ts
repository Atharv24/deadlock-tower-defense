// Player last-hit Tome / Boon system using Modlock's `onDamaged` hook,
// per-creep deduplication, stackable VData `td_tome_*` modifiers, and
// 1-of-3 Major Boon milestone picker state.

import {
  type DamagedEvent,
  log,
  type Player,
  players,
  toast,
} from 'modlock'

import {
  computeVanillaTomeBonuses,
  DEFENDER_TEAM,
  evaluateCreepLastHit,
  type LastHitEvaluation,
  type MajorBoonDef,
  type MinorTomeDef,
  pickThreeMajorBoons,
  type VanillaTomeBonuses,
} from './config'
import type { GuardianManager } from './guardian'

export class TomeManager {
  readonly rewardedCreeps = new Set<number>()
  readonly playerTomes = new Map<number, Record<string, number>>()
  readonly playerKills = new Map<number, number>()
  readonly pendingBoonChoices = new Map<
    number,
    readonly [MajorBoonDef, MajorBoonDef, MajorBoonDef]
  >()
  lastGrantedNotice = ''
  private readonly trimmedCooldownStarts = new Map<string, number>()

  /** Resets Tome & Boon state for a new match or /restarttd. */
  reset(): void {
    this.rewardedCreeps.clear()
    this.playerTomes.clear()
    this.playerKills.clear()
    this.pendingBoonChoices.clear()
    this.trimmedCooldownStarts.clear()
    this.lastGrantedNotice = ''
  }

  /** Restores state from Modlock hot-reload handoff. */
  restore(
    rewardedCreeps: readonly number[],
    playerTomes: Record<string, Record<string, number>>,
    playerKills: Record<string, number>,
  ): void {
    this.rewardedCreeps.clear()
    for (const h of rewardedCreeps) {
      this.rewardedCreeps.add(h)
    }
    this.playerTomes.clear()
    for (const [slotStr, tally] of Object.entries(playerTomes)) {
      this.playerTomes.set(Number(slotStr), { ...tally })
    }
    this.playerKills.clear()
    for (const [slotStr, kills] of Object.entries(playerKills)) {
      this.playerKills.set(Number(slotStr), Number(kills))
    }
  }

  /** Exports playerTomes and playerKills as plain records for JSON handoff. */
  exportRecords(): {
    readonly playerTomes: Record<string, Record<string, number>>
    readonly playerKills: Record<string, number>
  } {
    const tomesOut: Record<string, Record<string, number>> = {}
    for (const [slot, tally] of this.playerTomes.entries()) {
      tomesOut[String(slot)] = { ...tally }
    }
    const killsOut: Record<string, number> = {}
    for (const [slot, kills] of this.playerKills.entries()) {
      killsOut[String(slot)] = kills
    }
    return { playerTomes: tomesOut, playerKills: killsOut }
  }

  /**
   * Handles a Modlock `onDamaged` event: filters for player last-hits on
   * enemy creeps (ignoring Friendly Blue T1 Guardian kills), deduplicates by
   * creep entity handle, and rolls the 10% Tome drop.
   */
  onDamaged(
    hit: DamagedEvent,
    validCreepEntities: ReadonlySet<number>,
    guardian: GuardianManager,
    rngRoll = Math.random(),
    tomePickRoll = Math.random(),
  ): LastHitEvaluation {
    // Map active human/defender player pawn entities to their player slot.
    const pawnToSlot = new Map<number, number>()
    const slotToPlayer = new Map<number, Player>()
    for (const conn of players()) {
      const p = conn.player
      const pawn = p.pawn()
      if (pawn && pawn.team === 2) {
        pawnToSlot.set(pawn.entity, p.slot)
        slotToPlayer.set(p.slot, p)
      }
    }

    const guardianSet = new Set<number>()
    if (guardian.entity > 0) {
      guardianSet.add(guardian.entity)
    }
    if (hit.attacker > 0 && guardian.isFriendlyStructureEntity(hit.attacker)) {
      guardianSet.add(hit.attacker)
    }

    const result = evaluateCreepLastHit(
      hit,
      validCreepEntities,
      pawnToSlot,
      guardianSet,
      this.rewardedCreeps,
      rngRoll,
      tomePickRoll,
    )

    if (result.isPlayerKill && result.playerSlot !== undefined) {
      while (this.rewardedCreeps.size > 512) {
        const oldest = this.rewardedCreeps.values().next().value
        if (oldest === undefined) break
        this.rewardedCreeps.delete(oldest)
      }
      const prevKills = this.playerKills.get(result.playerSlot) ?? 0
      this.playerKills.set(result.playerSlot, prevKills + 1)
      const killer = slotToPlayer.get(result.playerSlot)
      killer?.addMetric('td.creeps_killed', 1)

      if (result.granted && result.tome && killer) {
        this.applyMinorTome(killer, result.tome)
      }
    }

    return result
  }

  /** Grants a Minor Tome directly to a player and increments their Tome tally. */
  applyMinorTome(player: Player, tome: MinorTomeDef): void {
    switch (tome.kind) {
      case 'modifier':
        if (tome.id === 'health' || tome.id === 'omni') {
          player.heal(120)
        }
        break
      case 'ap':
        player.adjustAbilityPoints(tome.amount ?? 1, 0)
        break
      case 'souls':
        player.adjustSouls(tome.amount ?? 250, false)
        break
    }

    this.incrementTally(player.slot, tome.id, 1)
    player.addMetric('td.tomes_earned', 1)
    player.sound('Powerup.Pickup.Generic')
    this.lastGrantedNotice = `${tome.name} (${tome.description})`
    toast(player, `TOME DROP: ${tome.name} — ${tome.description}!`)
    log(`Player slot ${player.slot} earned ${tome.name}`)
  }

  /** Offers a 1-of-3 Major Boon choice to all Team 2 defenders on milestone/Boss waves. */
  offerMajorBoonForWave(wave: number): void {
    for (const conn of players()) {
      const p = conn.player
      const pawn = p.pawn()
      if (pawn && pawn.team !== 2) {
        continue
      }
      const choices = pickThreeMajorBoons(wave, p.slot)
      this.pendingBoonChoices.set(p.slot, choices)
      p.sound('Powerup.Pickup.Generic')
      toast(
        p,
        `BOSS DEFEATED · MAJOR BOON READY! Hold TAB to click a Boon (or type /boon 1, /boon 2, /boon 3).`,
      )
    }
  }

  /** Selects one of the 3 offered Major Boons (index 0, 1, or 2) for `player`. */
  chooseMajorBoon(
    player: Player,
    choiceIndex: number,
    guardian: GuardianManager,
  ): MajorBoonDef | undefined {
    const choices = this.pendingBoonChoices.get(player.slot)
    if (!choices) {
      toast(player, 'No Major Boon choice is currently pending.')
      return undefined
    }
    if (choiceIndex < 0 || choiceIndex >= choices.length) {
      toast(player, 'Choose Boon 1, 2, or 3.')
      return undefined
    }

    const boon = choices[choiceIndex]
    this.pendingBoonChoices.delete(player.slot)

    for (const mod of boon.modifiers) {
      const tomeKey = mod.name.replace('td_tome_', '')
      this.incrementTally(player.slot, tomeKey, mod.stacks)
      player.addMetric('td.tomes_earned', mod.stacks)
      if (tomeKey === 'health' || tomeKey === 'omni') {
        player.heal(280)
      }
    }

    if (boon.bonusAp) {
      player.adjustAbilityPoints(boon.bonusAp, 1)
      this.incrementTally(player.slot, 'ap_jackpot', boon.bonusAp)
    }

    if (boon.bonusSouls) {
      player.adjustSouls(boon.bonusSouls, false)
      this.incrementTally(player.slot, 'soul_jackpot', 1)
    }

    if (boon.guardianHeal || boon.guardianUpgrade) {
      guardian.applyMajorBoonFortify(boon.guardianHeal ?? 0, Boolean(boon.guardianUpgrade))
    }

    player.sound('Powerup.Pickup.Generic')
    this.lastGrantedNotice = `MAJOR BOON: ${boon.title}`
    toast(player, `CHOSE MAJOR BOON: ${boon.title} (${boon.subtitle})!`)
    return boon
  }

  /** Returns a player's Tome tally map. */
  getTally(playerSlot: number): Record<string, number> {
    return this.playerTomes.get(playerSlot) ?? {}
  }

  /** Returns total Tomes collected by a player. */
  getTotalTomes(playerSlot: number): number {
    const tally = this.getTally(playerSlot)
    let sum = 0
    for (const count of Object.values(tally)) {
      sum += count
    }
    return sum
  }

  /** Returns total creep last-hits by a player. */
  getKills(playerSlot: number): number {
    return this.playerKills.get(playerSlot) ?? 0
  }

  /** Returns computed runtime stat bonuses for a player slot. */
  getVanillaBonuses(playerSlot: number): VanillaTomeBonuses {
    return computeVanillaTomeBonuses(this.getTally(playerSlot))
  }

  /** Applies Tome of Focus / Omni cooldown reduction across active defender abilities. */
  tickVanillaCooldowns(nowSeconds: number): void {
    if (this.playerTomes.size === 0) {
      return
    }
    for (const conn of players()) {
      const slot = conn.player.slot
      if (!this.playerTomes.has(slot)) continue
      const bonuses = this.getVanillaBonuses(slot)
      if (bonuses.cooldownReductionFraction <= 0) continue
      const pawn = conn.player.pawn()
      if (!pawn || pawn.team !== DEFENDER_TEAM || pawn.hero <= 0 || pawn.health <= 0) {
        continue
      }
      for (const abil of conn.player.abilities()) {
        if (abil.slot < 0 || abil.slot > 3 || abil.cooldownEnd <= nowSeconds + 0.35) {
          continue
        }
        const key = `${slot}:${abil.name}`
        if (Math.abs((this.trimmedCooldownStarts.get(key) ?? -1) - abil.cooldownStart) < 0.05) {
          continue
        }
        const fullDuration = Math.max(0, abil.cooldownEnd - abil.cooldownStart)
        if (fullDuration <= 0.4) continue
        const trimmedEnd =
          abil.cooldownStart + fullDuration * (1 - bonuses.cooldownReductionFraction)
        this.trimmedCooldownStarts.set(key, abil.cooldownStart)
        conn.player.setAbility({
          ability: abil.name,
          cooldownEnd: Math.max(nowSeconds + 0.1, trimmedEnd),
        })
      }
    }
  }

  /** Applies Tome of Vitality / Omni HP regeneration every second. */
  tickVanillaRegen(): void {
    if (this.playerTomes.size === 0) {
      return
    }
    for (const conn of players()) {
      const slot = conn.player.slot
      if (!this.playerTomes.has(slot)) continue
      const bonuses = this.getVanillaBonuses(slot)
      if (bonuses.regenPerSecond <= 0) continue
      const pawn = conn.player.pawn()
      if (!pawn || pawn.team !== DEFENDER_TEAM || pawn.hero <= 0 || pawn.health <= 0) {
        continue
      }
      const maxHp = pawn.effectiveMaxHealth ?? pawn.maxHealth
      if (pawn.health < maxHp) {
        conn.player.heal(Math.max(1, Math.ceil(bonuses.regenPerSecond)))
      }
    }
  }

  private incrementTally(playerSlot: number, key: string, delta: number): void {
    const current = this.playerTomes.get(playerSlot) ?? {}
    current[key] = (current[key] ?? 0) + delta
    this.playerTomes.set(playerSlot, current)
  }
}
