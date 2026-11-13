// Leaderboard & run tracking manager for Deadlock Tower Defense.
// Reports ranked runs (`td.highest_wave` + `td.creeps_slain`) via Modlock's
// `scores` service on defeat / early restart / disconnect and caches live
// standings reads for the Panorama HUD.

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
  evaluateLeaderboardSubmission,
} from './config'
import type { TomeManager } from './tomes'

let runSequence = 0

function createRunId(): string {
  runSequence += 1
  return `td-${Date.now().toString(36)}-${runSequence}`
}

/** Tracks per-match ranked eligibility, idempotent run submission, and cached leaderboard pages. */
export class LeaderboardManager {
  runId = createRunId()
  rankedEligible = true
  disqualifyReason: string | undefined = undefined
  isProbeMode = false
  readonly submittedSlots = new Set<number>()
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
    this.boardCache.clear()
  }

  /** Restores run-tracking state across a Modlock hot-reload handoff. */
  restore(
    runId?: string,
    rankedEligible = true,
    disqualifyReason?: string,
    submittedSlots: readonly number[] = [],
  ): void {
    this.runId = runId && runId.length > 0 ? runId : createRunId()
    this.rankedEligible = rankedEligible
    this.disqualifyReason = disqualifyReason
    this.submittedSlots.clear()
    for (const slot of submittedSlots) {
      this.submittedSlots.add(slot)
    }
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

  /** Submits `td.highest_wave` (with negated kills tiebreak) and `td.creeps_slain` once per player per run. */
  submitRunForPlayer(
    player: Player,
    wave: number,
    kills: number,
    minWave = 1,
  ): boolean {
    const decision = evaluateLeaderboardSubmission({
      wave,
      kills,
      rankedEligible: this.rankedEligible,
      isProbeMode: this.isProbeMode,
      alreadySubmitted: this.submittedSlots.has(player.slot),
      minWave,
    })
    if (!decision.shouldSubmit) {
      return false
    }

    this.submittedSlots.add(player.slot)
    const prevBest = this.sessionBestBySlot.get(player.slot)
    if (
      !prevBest ||
      decision.waveScore > prevBest.wave ||
      (decision.waveScore === prevBest.wave && kills > prevBest.kills)
    ) {
      this.sessionBestBySlot.set(player.slot, {
        wave: decision.waveScore,
        kills: Math.max(0, Math.floor(kills)),
      })
    }

    reportScore(player, BOARD_HIGHEST_WAVE, decision.waveScore, {
      tiebreak: decision.tiebreak,
      key: `${this.runId}:w:${player.slot}`,
    })
    if (decision.creepsScore >= 1) {
      reportScore(player, BOARD_CREEPS_SLAIN, decision.creepsScore, {
        key: `${this.runId}:c:${player.slot}`,
      })
    }

    this.boardCache.clear()
    log(
      `Submitted ranked TD run ${this.runId} for slot ${player.slot}: Wave ${decision.waveScore}, ${Math.max(0, Math.floor(kills))} kills`,
    )
    return true
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

  /** Returns a cached `td.highest_wave` page (short TTL while loading so 10 Hz HUD stays fast). */
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
