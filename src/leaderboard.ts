// Leaderboard & run tracking manager for Deadlock Tower Defense.
// Reports progressive wave checkpoints & incremental kill deltas (`td.highest_wave` +
// `td.creeps_slain`) via Modlock's `scores` service and caches standings for the HUD.

import {
  type BoardPage,
  type BoardWindow,
  log,
  type Player,
  players,
  readBoard,
  reportScore,
} from 'modlock'

import {
  BOARD_CREEPS_SLAIN,
  BOARD_HIGHEST_WAVE,
  evaluateLeaderboardCheckpoint,
} from './config'
import type { TomeManager } from './tomes'

let runSequence = 0

function createRunId(): string {
  runSequence += 1
  return `td-${Date.now().toString(36)}-${runSequence}`
}

export interface LeaderboardCheckpointHandoff {
  readonly reportedBestBySlot: Record<string, { wave: number; kills: number }>
  readonly reportedKillsBySlot: Record<string, number>
  readonly reportSeq: number
}

/** Tracks per-match ranked eligibility, live checkpoint reporting, and cached board pages. */
export class LeaderboardManager {
  runId = createRunId()
  rankedEligible = true
  disqualifyReason: string | undefined = undefined
  isProbeMode = false
  readonly submittedSlots = new Set<number>()
  readonly reportedBestBySlot = new Map<number, { wave: number; kills: number }>()
  readonly reportedKillsBySlot = new Map<number, number>()
  reportSeq = 0
  readonly sessionBestBySlot = new Map<number, { wave: number; kills: number }>()
  private readonly boardCache = new Map<
    string,
    { page: BoardPage | undefined; expiresAt: number }
  >()

  /** Starts a fresh Ranked run ID (called on fresh world load or `/restarttd`). */
  startNewRun(): void {
    this.runId = createRunId()
    this.rankedEligible = true
    this.disqualifyReason = undefined
    this.submittedSlots.clear()
    this.reportedBestBySlot.clear()
    this.reportedKillsBySlot.clear()
    this.reportSeq = 0
    this.boardCache.clear()
  }

  /** Exports per-slot checkpoint progress for hot-reload handoff persistence. */
  exportCheckpointState(): LeaderboardCheckpointHandoff {
    const reportedBestBySlot: Record<string, { wave: number; kills: number }> = {}
    for (const [slot, best] of this.reportedBestBySlot) {
      reportedBestBySlot[String(slot)] = { wave: best.wave, kills: best.kills }
    }
    const reportedKillsBySlot: Record<string, number> = {}
    for (const [slot, kills] of this.reportedKillsBySlot) {
      reportedKillsBySlot[String(slot)] = kills
    }
    return {
      reportedBestBySlot,
      reportedKillsBySlot,
      reportSeq: this.reportSeq,
    }
  }

  /** Restores run-tracking state across a Modlock hot-reload handoff. */
  restore(
    runId?: string,
    rankedEligible = true,
    disqualifyReason?: string,
    submittedSlots: readonly number[] = [],
    checkpointState?: Partial<LeaderboardCheckpointHandoff>,
  ): void {
    this.runId = runId && runId.length > 0 ? runId : createRunId()
    this.rankedEligible = rankedEligible
    this.disqualifyReason = disqualifyReason
    this.submittedSlots.clear()
    for (const slot of submittedSlots) {
      this.submittedSlots.add(slot)
    }
    this.reportedBestBySlot.clear()
    if (checkpointState?.reportedBestBySlot) {
      for (const [slotKey, best] of Object.entries(
        checkpointState.reportedBestBySlot,
      )) {
        const slot = Number(slotKey)
        if (
          Number.isFinite(slot) &&
          best &&
          typeof best.wave === 'number' &&
          typeof best.kills === 'number'
        ) {
          this.reportedBestBySlot.set(slot, {
            wave: Math.max(1, Math.floor(best.wave)),
            kills: Math.max(0, Math.floor(best.kills)),
          })
        }
      }
    }
    this.reportedKillsBySlot.clear()
    if (checkpointState?.reportedKillsBySlot) {
      for (const [slotKey, kills] of Object.entries(
        checkpointState.reportedKillsBySlot,
      )) {
        const slot = Number(slotKey)
        if (Number.isFinite(slot) && typeof kills === 'number') {
          this.reportedKillsBySlot.set(slot, Math.max(0, Math.floor(kills)))
        }
      }
    }
    this.reportSeq =
      typeof checkpointState?.reportSeq === 'number'
        ? Math.max(0, Math.floor(checkpointState.reportSeq))
        : 0
    this.boardCache.clear()
  }

  /** Disqualifies the current run when a sandbox/cheat command is used; returns true once per transition. */
  markUnranked(reason: string): boolean {
    if (!this.rankedEligible) {
      return false
    }
    this.rankedEligible = false
    this.disqualifyReason = reason
    log(`Marked current TD run ${this.runId} as unranked sandbox (${reason})`)
    return true
  }

  /**
   * Checkpoints `td.highest_wave` (`KEEP_BEST`, negated kills tiebreak) whenever wave/kills
   * improve and `td.creeps_slain` (`KEEP_SUM`) by incremental kill delta since the previous
   * checkpoint in this run so mid-run disconnects never lose progress or double-count kills.
   */
  checkpointPlayer(
    player: Player,
    wave: number,
    kills: number,
    opts?: { requireProgressOnWave1?: boolean },
  ): boolean {
    const decision = evaluateLeaderboardCheckpoint({
      wave,
      kills,
      rankedEligible: this.rankedEligible,
      isProbeMode: this.isProbeMode,
      requireProgressOnWave1: opts?.requireProgressOnWave1 ?? false,
      prevBest: this.reportedBestBySlot.get(player.slot),
      prevReportedKills: this.reportedKillsBySlot.get(player.slot),
    })
    if (
      !decision.eligible ||
      (!decision.shouldReportWave && decision.creepsDelta <= 0)
    ) {
      return false
    }

    this.submittedSlots.add(player.slot)
    const prevBest = this.sessionBestBySlot.get(player.slot)
    if (
      !prevBest ||
      decision.waveScore > prevBest.wave ||
      (decision.waveScore === prevBest.wave &&
        decision.safeKills > prevBest.kills)
    ) {
      this.sessionBestBySlot.set(player.slot, {
        wave: decision.waveScore,
        kills: decision.safeKills,
      })
    }

    if (decision.shouldReportWave) {
      this.reportedBestBySlot.set(player.slot, {
        wave: decision.waveScore,
        kills: decision.safeKills,
      })
      reportScore(player, BOARD_HIGHEST_WAVE, decision.waveScore, {
        tiebreak: decision.tiebreak,
        key: `${this.runId}-w-${player.slot}-${decision.waveScore}-${decision.safeKills}`,
      })
    }
    if (decision.creepsDelta >= 1) {
      this.reportSeq += 1
      this.reportedKillsBySlot.set(player.slot, decision.safeKills)
      reportScore(player, BOARD_CREEPS_SLAIN, decision.creepsDelta, {
        key: `${this.runId}-c-${player.slot}-${this.reportSeq}`,
      })
    }

    this.boardCache.clear()
    log(
      `Reported TD checkpoint ${this.runId} for slot ${player.slot}: Wave ${decision.waveScore}, totalKills=${decision.safeKills} (+${decision.creepsDelta} delta)`,
    )
    return true
  }

  /** Checkpoints progressive run stats for all connected non-bot defenders. */
  checkpointAllPlayers(
    wave: number,
    tomes: TomeManager,
    opts?: { requireProgressOnWave1?: boolean },
  ): number {
    let submitted = 0
    for (const conn of players()) {
      if (conn.bot) continue
      if (
        this.checkpointPlayer(
          conn.player,
          wave,
          tomes.getKills(conn.player.slot),
          opts,
        )
      ) {
        submitted += 1
      }
    }
    return submitted
  }

  /** Submits `td.highest_wave` (with negated kills tiebreak) and `td.creeps_slain` for a player. */
  submitRunForPlayer(
    player: Player,
    wave: number,
    kills: number,
    minWave = 1,
  ): boolean {
    const flooredWave = Math.floor(wave)
    if (flooredWave < Math.max(1, Math.floor(minWave))) {
      return false
    }
    return this.checkpointPlayer(player, flooredWave, kills, {
      requireProgressOnWave1: false,
    })
  }

  /** Submits the current run for all connected non-bot human defenders. */
  submitRunForAllPlayers(
    wave: number,
    tomes: TomeManager,
    minWave = 1,
  ): number {
    let submitted = 0
    for (const conn of players()) {
      if (conn.bot) continue
      if (
        this.submitRunForPlayer(
          conn.player,
          wave,
          tomes.getKills(conn.player.slot),
          minWave,
        )
      ) {
        submitted += 1
      }
    }
    return submitted
  }

  /** Returns a cached `td.highest_wave` page (short TTL while loading so HUD stays fast). */
  getBoardSnapshot(
    player: Player,
    window: BoardWindow,
    now: number,
    limit = 10,
  ): BoardPage | undefined {
    const cacheKey = `${player.slot}:${window}:${limit}`
    const cached = this.boardCache.get(cacheKey)
    if (cached && now < cached.expiresAt) {
      return cached.page
    }
    const page = readBoard(BOARD_HIGHEST_WAVE, { window, limit, player })
    const ttl = page?.loading ? 0.4 : 1.5
    this.boardCache.set(cacheKey, { page, expiresAt: now + ttl })
    return page
  }
}
