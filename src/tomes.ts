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
  computeTomeWaveMultiplier,
  computeVanillaTomeBonuses,
  DEFAULT_TOME_GROWTH_PER_WAVE,
  DEFENDER_TEAM,
  evaluateCreepLastHit,
  formatScaledMajorBoonSubtitle,
  formatScaledMinorTomeDescription,
  type LastHitEvaluation,
  type MajorBoonDef,
  type MinorTomeDef,
  parseTomeGrowthPerWave,
  pickThreeMajorBoons,
  SOUL_CACHE_BASE_SOULS,
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
  readonly pendingBoonWave = new Map<number, number>()
  lastGrantedNotice = ''
  private growthRateOverride?: number
  private cachedSettingRate = DEFAULT_TOME_GROWTH_PER_WAVE
  private cachedSettingExpiresAt = -1
  private readonly trimmedCooldownStarts = new Map<string, number>()

  /** Resets Tome & Boon state for a new match or /restarttd. */
  reset(): void {
    this.rewardedCreeps.clear()
    this.playerTomes.clear()
    this.playerKills.clear()
    this.pendingBoonChoices.clear()
    this.pendingBoonWave.clear()
    this.trimmedCooldownStarts.clear()
    this.lastGrantedNotice = ''
  }

  /** Sets a manual session override for Tome scaling per wave (`/tomescale`), or `undefined` to use manifest setting. */
  setGrowthRateOverride(rate: number | undefined): void {
    this.growthRateOverride = rate
    this.cachedSettingExpiresAt = -1
  }

  /** Returns active Tome growth rate per wave (`override` or cached `tome_scaling` setting). */
  getGrowthRate(now = 0): number {
    if (this.growthRateOverride !== undefined) {
      return this.growthRateOverride
    }
    if (this.cachedSettingExpiresAt < 0 || now >= this.cachedSettingExpiresAt) {
      const conns = players()
      const reader = conns.find((c) => !c.bot && c.ready) ?? conns[0]
      const rawSetting = reader?.player.setting('tome_scaling')
      this.cachedSettingRate = parseTomeGrowthPerWave(rawSetting)
      this.cachedSettingExpiresAt = now + 2.0
    }
    return this.cachedSettingRate
  }

  /** Returns the wave-scaled Tome multiplier for `wave` (`1.0` on Wave 1). */
  getWaveMultiplier(wave: number, now = 0): number {
    return computeTomeWaveMultiplier(wave, this.getGrowthRate(now))
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
    currentWave = 1,
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
        this.applyMinorTome(killer, result.tome, currentWave)
      }
    }

    return result
  }

  /** Grants a wave-scaled Minor Tome directly to a player and increments their Tome tally. */
  applyMinorTome(player: Player, tome: MinorTomeDef, currentWave = 1): void {
    const mult = this.getWaveMultiplier(currentWave)
    switch (tome.kind) {
      case 'modifier':
        if (tome.id === 'health' || tome.id === 'omni') {
          player.heal(Math.round(120 * mult))
        }
        this.incrementTally(player.slot, tome.id, mult)
        break
      case 'ap': {
        const apGain = Math.max(1, Math.round((tome.amount ?? 1) * mult))
        player.adjustAbilityPoints(apGain, 0)
        this.incrementTally(player.slot, tome.id, apGain)
        break
      }
      case 'souls': {
        const soulGain = Math.round((tome.amount ?? SOUL_CACHE_BASE_SOULS) * mult)
        player.adjustSouls(soulGain, false)
        this.incrementTally(player.slot, tome.id, mult)
        break
      }
    }

    const scaledDesc = formatScaledMinorTomeDescription(tome, mult)
    player.addMetric('td.tomes_earned', 1)
    player.sound('Powerup.Pickup.Generic')
    this.lastGrantedNotice =
      mult > 1.001
        ? `${tome.name} (${mult.toFixed(2)}x: ${scaledDesc})`
        : `${tome.name} (${scaledDesc})`
    toast(
      player,
      mult > 1.001
        ? `TOME DROP (${mult.toFixed(2)}x): ${tome.name} — ${scaledDesc}!`
        : `TOME DROP: ${tome.name} — ${scaledDesc}!`,
    )
    log(`Player slot ${player.slot} earned ${tome.name} (${mult.toFixed(2)}x on Wave ${Math.max(1, currentWave)})`)
  }

  /** Offers a 1-of-3 Major Boon choice to all Team 2 defenders on milestone/Boss waves. */
  offerMajorBoonForWave(wave: number): void {
    const clampedWave = Math.max(1, Math.floor(wave))
    for (const conn of players()) {
      const p = conn.player
      const pawn = p.pawn()
      if (pawn && pawn.team !== 2) {
        continue
      }
      const choices = pickThreeMajorBoons(clampedWave, p.slot)
      this.pendingBoonChoices.set(p.slot, choices)
      this.pendingBoonWave.set(p.slot, clampedWave)
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
    fallbackWave = 1,
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
    const boonWave = this.pendingBoonWave.get(player.slot) ?? fallbackWave
    const mult = this.getWaveMultiplier(boonWave)
    this.pendingBoonChoices.delete(player.slot)
    this.pendingBoonWave.delete(player.slot)

    for (const mod of boon.modifiers) {
      const tomeKey = mod.name.replace('td_tome_', '')
      const scaledStacks = Number((mod.stacks * mult).toFixed(4))
      this.incrementTally(player.slot, tomeKey, scaledStacks)
      player.addMetric('td.tomes_earned', mod.stacks)
      if (tomeKey === 'health' || tomeKey === 'omni') {
        player.heal(Math.round(280 * mult))
      }
    }

    if (boon.bonusAp) {
      const scaledAp = Math.max(boon.bonusAp, Math.round(boon.bonusAp * mult))
      player.adjustAbilityPoints(scaledAp, 1)
      this.incrementTally(player.slot, 'ap_jackpot', scaledAp)
    }

    if (boon.bonusSouls) {
      const scaledSouls = Math.round(boon.bonusSouls * mult)
      player.adjustSouls(scaledSouls, false)
      this.incrementTally(player.slot, 'soul_jackpot', mult)
    }

    if (boon.guardianHeal || boon.guardianUpgrade) {
      guardian.applyMajorBoonFortify(
        Math.round((boon.guardianHeal ?? 0) * mult),
        Boolean(boon.guardianUpgrade),
      )
    }

    const subtitle = formatScaledMajorBoonSubtitle(boon, mult)
    player.sound('Powerup.Pickup.Generic')
    this.lastGrantedNotice = `MAJOR BOON: ${boon.title}`
    toast(player, `CHOSE MAJOR BOON: ${boon.title} (${subtitle})!`)
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
    return Number(sum.toFixed(1))
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
    current[key] = Number(((current[key] ?? 0) + delta).toFixed(4))
    this.playerTomes.set(playerSlot, current)
  }
}
