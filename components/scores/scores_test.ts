import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'

import {
  BOARD_CREEPS_SLAIN,
  BOARD_HIGHEST_WAVE,
  evaluateLeaderboardCheckpoint,
  evaluateLeaderboardSubmission,
  getLeaderboardSubtitleCopy,
  getLeaderboardUnavailableCopy,
  LeaderboardManager,
} from '@components/scores'
import { mockHost, resetMockHost } from '@testing/mock_modlock_host'

describe('Scores Component — Pure Evaluation, Copy & LeaderboardManager', () => {
  beforeEach(() => {
    resetMockHost()
  })

  it('evaluates ranked submission and checkpoint progress purely', () => {
    assert.deepEqual(
      evaluateLeaderboardSubmission({
        wave: 0,
        kills: 0,
        rankedEligible: true,
        isProbeMode: false,
        alreadySubmitted: false,
      }),
      { shouldSubmit: false, reason: 'below_min_wave' },
    )
    assert.deepEqual(
      evaluateLeaderboardSubmission({
        wave: 8,
        kills: 120,
        rankedEligible: false,
        isProbeMode: false,
        alreadySubmitted: false,
      }),
      { shouldSubmit: false, reason: 'unranked' },
    )
    assert.deepEqual(
      evaluateLeaderboardSubmission({
        wave: 12,
        kills: 215,
        rankedEligible: true,
        isProbeMode: false,
        alreadySubmitted: true,
      }),
      { shouldSubmit: false, reason: 'already_submitted' },
    )
    assert.deepEqual(
      evaluateLeaderboardSubmission({
        wave: 12,
        kills: 215,
        rankedEligible: true,
        isProbeMode: false,
        alreadySubmitted: false,
      }),
      { shouldSubmit: true, waveScore: 12, tiebreak: -215, creepsScore: 215 },
    )
    assert.equal(
      evaluateLeaderboardCheckpoint({
        wave: 1,
        kills: 0,
        rankedEligible: true,
        isProbeMode: false,
        requireProgressOnWave1: true,
      }).eligible,
      false,
    )
    assert.deepEqual(
      evaluateLeaderboardCheckpoint({
        wave: 4,
        kills: 62,
        rankedEligible: true,
        isProbeMode: false,
        prevBest: { wave: 3, kills: 40 },
        prevReportedKills: 40,
      }),
      {
        eligible: true,
        shouldReportWave: true,
        waveScore: 4,
        safeKills: 62,
        tiebreak: -62,
        creepsDelta: 22,
      },
    )
  })

  it('formats accurate LeaderboardModal subtitles and unavailable/acceptance copy without mislabeling hosted servers (v0.7.1, v0.7.5)', () => {
    const rankedPendingSubtitle = getLeaderboardSubtitleCopy({ rankedEligible: true })
    assert.ok(rankedPendingSubtitle.includes('Ranked Run Active'))
    assert.ok(rankedPendingSubtitle.includes('Wave 2+ or 1+ kill'))
    assert.equal(rankedPendingSubtitle.includes('Defeat or Restart (Wave 2+)'), false)

    const rankedAcceptedSubtitle = getLeaderboardSubtitleCopy({
      rankedEligible: true,
      lastReportAccepted: true,
      acceptedReportsCount: 3,
    })
    assert.ok(rankedAcceptedSubtitle.includes('Server accepted 3 score checkpoints'))

    const rankedRejectedSubtitle = getLeaderboardSubtitleCopy({
      rankedEligible: true,
      lastReportAccepted: false,
    })
    assert.ok(rankedRejectedSubtitle.includes('Host scores service inactive'))

    const unrankedSubtitle = getLeaderboardSubtitleCopy({
      rankedEligible: false,
      disqualifyReason: '--arg dev',
    })
    assert.ok(unrankedSubtitle.includes('Unranked'))
    assert.ok(unrankedSubtitle.includes('--arg dev'))

    // Hosted Hyperline server across all 3 `lastReportAccepted` states must NEVER claim "Local Dev Server"
    const hostedPending = getLeaderboardUnavailableCopy({
      isLocalDev: false,
      currentWave: 1,
      currentKills: 0,
    })
    assert.equal(hostedPending.title.includes('Local Dev'), false)
    assert.ok(hostedPending.detail.includes('Reach Wave 2'))

    const hostedAccepted = getLeaderboardUnavailableCopy({
      isLocalDev: false,
      currentWave: 4,
      currentKills: 37,
      sessionBest: { wave: 6, kills: 72 },
      lastReportAccepted: true,
      acceptedReportsCount: 2,
    })
    assert.equal(hostedAccepted.title.includes('Local Dev'), false)
    assert.ok(hostedAccepted.title.includes('Hyperline Scores Accepted'))
    assert.ok(hostedAccepted.detail.includes('Server accepted 2 Ranked score checkpoints'))
    assert.ok(hostedAccepted.statsLine.includes('Current Run: Wave 4 (37 Creep Last-Hits)'))
    assert.ok(hostedAccepted.statsLine.includes('Session Best: Wave 6 (72 Creep Last-Hits)'))

    const hostedRejected = getLeaderboardUnavailableCopy({
      isLocalDev: false,
      currentWave: 3,
      currentKills: 15,
      lastReportAccepted: false,
      acceptedReportsCount: 0,
    })
    assert.ok(hostedRejected.title.includes('Host Scores Service Inactive'))
    assert.ok(hostedRejected.detail.includes('returned false from reportScore()'))

    // True local dev mode (--arg dev) clearly says Local Dev Mode and shows Current Run
    const localDevFallback = getLeaderboardUnavailableCopy({
      isLocalDev: true,
      currentWave: 1,
      currentKills: 0,
    })
    assert.ok(localDevFallback.title.includes('Local Dev Mode (--arg dev)'))
    assert.ok(localDevFallback.statsLine.includes('Current Run: Wave 1 (0 Creep Last-Hits)'))
    assert.equal(localDevFallback.statsLine.includes('Session Best'), false)
  })

  it('tracks ranked runs, checkpoints incremental deltas, skips bots, and honors custom board options', () => {
    const { defenderPlayer, mockBoardPages, mockBotPlayers, reportedScores, MockPlayer } = mockHost
    mockBotPlayers.push({
      player: new MockPlayer(5),
      name: 'BossBot',
      bot: true,
      ready: true,
      steamId: 99n,
      generation: 1,
      roles: [],
    })

    const killsMap = new Map<number, number>([
      [defenderPlayer.slot, 340],
      [5, 50],
    ])
    const killSource = { getKills: (slot: number) => killsMap.get(slot) ?? 0 }

    const lb = new LeaderboardManager()
    assert.equal(lb.submitRunForAllPlayers(18, killSource, 1), 1)
    assert.equal(reportedScores.length, 2)
    assert.deepEqual(reportedScores[0], {
      slot: defenderPlayer.slot,
      board: BOARD_HIGHEST_WAVE,
      value: 18,
      options: { tiebreak: -340, key: `${lb.runId}-w-${defenderPlayer.slot}-18-340` },
    })
    assert.deepEqual(reportedScores[1], {
      slot: defenderPlayer.slot,
      board: BOARD_CREEPS_SLAIN,
      value: 340,
      options: { key: `${lb.runId}-c-${defenderPlayer.slot}-1` },
    })

    // Duplicate run submission is skipped
    assert.equal(lb.submitRunForAllPlayers(18, killSource, 1), 0)
    assert.equal(reportedScores.length, 2)

    // Incremental checkpoint reports wave + delta kills only
    killsMap.set(defenderPlayer.slot, 350)
    assert.equal(lb.checkpointAllPlayers(19, killSource), 1)
    assert.equal(reportedScores.length, 4)
    assert.equal(reportedScores[3].value, 10)

    // Clock backstep invalidates board read cache immediately
    mockBoardPages.set(`${BOARD_HIGHEST_WAVE}:allTime`, {
      rows: [{ rank: 1, name: 'Test', value: 12, tiebreak: -90, count: 1 }],
      total: 1,
      loading: false,
      player: undefined,
    })
    assert.equal(lb.getBoardSnapshot(defenderPlayer as never, 'allTime', 200)?.rows.length, 1)
    mockBoardPages.set(`${BOARD_HIGHEST_WAVE}:allTime`, {
      rows: [
        { rank: 1, name: 'Test', value: 12, tiebreak: -90, count: 1 },
        { rank: 2, name: 'Second', value: 8, tiebreak: -50, count: 1 },
      ],
      total: 2,
      loading: false,
      player: undefined,
    })
    assert.equal(lb.getBoardSnapshot(defenderPlayer as never, 'allTime', 200.5)?.rows.length, 1)
    assert.equal(lb.getBoardSnapshot(defenderPlayer as never, 'allTime', 0.5)?.rows.length, 2)

    // Custom board IDs and runPrefix for other mods
    const arenaLb = new LeaderboardManager({
      primaryBoard: 'arena.highest_round',
      secondaryBoard: 'arena.eliminations',
      runPrefix: 'arena',
    })
    assert.ok(arenaLb.runId.startsWith('arena-'))
    assert.equal(arenaLb.submitRunForPlayer(defenderPlayer as never, 7, 42, 1), true)
    assert.equal(reportedScores[4].board, 'arena.highest_round')
    assert.equal(reportedScores[5].board, 'arena.eliminations')
  })

  it('captures reportScore() host acceptance state across checkpoints, startNewRun(), resetSessionDiagnostics(), and restore()', () => {
    const { defenderPlayer, reportedScores } = mockHost
    reportedScores.length = 0
    mockHost.reportScoreResult = false

    const lb = new LeaderboardManager()
    assert.equal(lb.checkpointPlayer(defenderPlayer as never, 2, 12), true)
    assert.equal(lb.lastReportAccepted, false)
    assert.equal(lb.acceptedReportsCount, 0)

    mockHost.reportScoreResult = true
    assert.equal(lb.checkpointPlayer(defenderPlayer as never, 3, 25), true)
    assert.equal(lb.lastReportAccepted, true)
    assert.equal(lb.acceptedReportsCount, 1)

    const exported = lb.exportCheckpointState()
    const restored = new LeaderboardManager()
    restored.restore(lb.runId, true, undefined, [0], exported)
    assert.equal(restored.lastReportAccepted, true)
    assert.equal(restored.acceptedReportsCount, 1)

    restored.startNewRun()
    assert.equal(restored.lastReportAccepted, true)
    assert.equal(restored.acceptedReportsCount, 1)

    restored.resetSessionDiagnostics()
    assert.equal(restored.lastReportAccepted, undefined)
    assert.equal(restored.acceptedReportsCount, 0)
  })
})
