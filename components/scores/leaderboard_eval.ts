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

/** Pure evaluator determining whether a run should be submitted to global leaderboards. */
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
 * - Primary board (`KEEP_BEST`, negated kills tiebreak) updates whenever wave or kills tiebreak improves.
 * - Secondary board (`KEEP_SUM`) reports only the delta since the last checkpoint so kills
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

export interface LeaderboardSubtitleInput {
  readonly rankedEligible: boolean
  readonly disqualifyReason?: string
  readonly lastReportAccepted?: boolean
  readonly acceptedReportsCount?: number
}

/** Formats the ranked/sandbox status subtitle in `LeaderboardModal`. */
export function getLeaderboardSubtitleCopy(
  opts: LeaderboardSubtitleInput,
): string {
  if (!opts.rankedEligible) {
    return `Sandbox Run · Unranked (${opts.disqualifyReason ?? 'dev'}) — /restarttd for Ranked`
  }
  if (opts.lastReportAccepted === true) {
    const count = Math.max(1, Math.floor(opts.acceptedReportsCount ?? 1))
    return `Ranked Run Active · Server accepted ${count} score checkpoint${count === 1 ? '' : 's'}`
  }
  if (opts.lastReportAccepted === false) {
    return 'Ranked Run Active · Host scores service inactive (reportScore=false)'
  }
  return 'Ranked Run Active · Wave 2+ or 1+ kill checkpoints automatically'
}

export interface LeaderboardUnavailableInput {
  readonly isLocalDev: boolean
  readonly currentWave: number
  readonly currentKills: number
  readonly sessionBest?: { readonly wave: number; readonly kills: number }
  readonly lastReportAccepted?: boolean
  readonly acceptedReportsCount?: number
}

export interface LeaderboardUnavailableCopy {
  readonly title: string
  readonly detail: string
  readonly statsLine: string
}

/**
 * Formats fallback copy for `LeaderboardModal` when `readBoard` returns `undefined`
 * (including host `scores` acceptance diagnostics on hosted Hyperline servers vs `--arg dev` local mode),
 * never mislabeling hosted Hyperline servers as `"Local Dev Server"`.
 */
export function getLeaderboardUnavailableCopy(
  opts: LeaderboardUnavailableInput,
): LeaderboardUnavailableCopy {
  const safeWave = Math.max(1, Math.floor(opts.currentWave))
  const safeKills = Math.max(0, Math.floor(opts.currentKills))
  const currentPart = `Current Run: Wave ${safeWave} (${safeKills} Creep Last-Hits)`
  const statsLine = opts.sessionBest
    ? `${currentPart} · Session Best: Wave ${Math.max(1, Math.floor(opts.sessionBest.wave))} (${Math.max(0, Math.floor(opts.sessionBest.kills))} Creep Last-Hits)`
    : currentPart

  if (opts.isLocalDev) {
    return {
      title: 'Local Dev Mode (--arg dev) — Global Standings Disabled',
      detail:
        'Ranked leaderboard submissions are disabled while local developer commands are active.',
      statsLine,
    }
  }
  if (opts.lastReportAccepted === true) {
    const count = Math.max(1, Math.floor(opts.acceptedReportsCount ?? 1))
    return {
      title: 'Hyperline Scores Accepted — Standings Syncing',
      detail: `Server accepted ${count} Ranked score checkpoint${count === 1 ? '' : 's'} this session. Web leaderboard standings refresh after processing.`,
      statsLine,
    }
  }
  if (opts.lastReportAccepted === false) {
    return {
      title: 'Host Scores Service Inactive — Session Progress Tracked',
      detail:
        'This server host returned false from reportScore() (scores service not active on host). Your session progress is still tracked below.',
      statsLine,
    }
  }
  return {
    title: 'Global Standings Syncing — Live Session Progress Tracked',
    detail:
      'Reach Wave 2 (or get 1+ Creep Last-Hit before leaving) to submit your first Ranked score checkpoint to Hyperline.',
    statsLine,
  }
}
