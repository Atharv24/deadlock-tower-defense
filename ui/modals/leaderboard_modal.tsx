import {
  Action,
  type BoardPage,
  type BoardRow,
  type BoardWindow,
  Plate,
  type Player,
  Text,
} from 'modlock'
import {
  getLeaderboardSubtitleCopy,
  getLeaderboardUnavailableCopy,
  type LeaderboardManager,
} from '@components/scores'
import type { HudStateStore } from '../hud_state'

const LEADERBOARD_WINDOWS: readonly {
  readonly id: BoardWindow
  readonly label: string
}[] = [
  { id: 'allTime', label: 'All-Time' },
  { id: 'week', label: 'This Week' },
  { id: 'day', label: 'Today' },
]

function formatLeaderboardRowMetric(row: BoardRow): string {
  if (row.tiebreak < 0) {
    return `${Math.abs(row.tiebreak)} Kills`
  }
  return `${row.count} ${row.count === 1 ? 'Run' : 'Runs'}`
}

export function LeaderboardModal(props: {
  player: Player
  window: BoardWindow
  leaderboard: LeaderboardManager
  boardPage: BoardPage | undefined
  currentWave: number
  currentKills: number
  state: HudStateStore
  title?: string
}) {
  const {
    player,
    window,
    leaderboard,
    boardPage,
    currentWave,
    currentKills,
    state,
    title,
  } = props
  const sessionBest = leaderboard.sessionBestBySlot.get(player.slot)
  const myRow = boardPage?.player
  const subtitleText = getLeaderboardSubtitleCopy({
    rankedEligible: leaderboard.rankedEligible,
    disqualifyReason: leaderboard.disqualifyReason,
    lastReportAccepted: leaderboard.lastReportAccepted,
    acceptedReportsCount: leaderboard.acceptedReportsCount,
  })
  const subtitleColor =
    !leaderboard.rankedEligible || leaderboard.lastReportAccepted === false
      ? '#fbbf24'
      : '#4ade80'
  const unavailableCopy =
    boardPage === undefined
      ? getLeaderboardUnavailableCopy({
          isLocalDev: leaderboard.isLocalDev,
          currentWave,
          currentKills,
          sessionBest,
          lastReportAccepted: leaderboard.lastReportAccepted,
          acceptedReportsCount: leaderboard.acceptedReportsCount,
        })
      : undefined

  return (
    <panel
      style={{
        width: 'fill',
        height: 'fill',
        background: '#050814c8',
        flow: 'down',
        horizontalAlign: 'center',
        verticalAlign: 'center',
      }}
    >
      <panel
        style={{
          width: 620,
          flow: 'down',
          horizontalAlign: 'center',
          verticalAlign: 'center',
        }}
      >
        <Plate
          flow="down"
          style={{
            width: 'fill',
            padding: [16, 20, 16, 20],
          }}
        >
          <panel
            style={{
              flow: 'right',
              width: 'fill',
              margin: [0, 0, 10, 0],
              verticalAlign: 'center',
            }}
          >
            <panel style={{ flow: 'down', width: 'fill' }}>
              <Text role="title" tone="accent" plated={true}>
                {title ?? "HIDDEN KING'S DEFENSE — HIGHEST WAVE"}
              </Text>
              <label
                style={{
                  fontSize: 12,
                  bold: true,
                  color: subtitleColor,
                  margin: [2, 0, 0, 0],
                }}
              >
                {subtitleText}
              </label>
            </panel>
            <Action
              kind="quiet"
              onPress={(p) => {
                state.toggleLeaderboard(p.slot, false)
              }}
            >
              Close (/lb)
            </Action>
          </panel>

          <panel style={{ flow: 'right', width: 'fill', margin: [0, 0, 10, 0] }}>
            {LEADERBOARD_WINDOWS.map((tab) => (
              <Action
                key={tab.id}
                kind={window === tab.id ? 'primary' : 'secondary'}
                style={{ margin: [0, 6, 0, 0] }}
                onPress={(p) => {
                  state.setLeaderboardWindow(p.slot, tab.id)
                }}
              >
                {tab.label}
              </Action>
            ))}
          </panel>

          {boardPage === undefined && unavailableCopy ? (
            <panel
              style={{
                flow: 'down',
                width: 'fill',
                padding: 14,
                background: '#0f172ae6',
                borderRadius: 6,
              }}
            >
              <label style={{ fontSize: 14, bold: true, color: '#f8fafc' }}>
                {unavailableCopy.title}
              </label>
              <label style={{ fontSize: 12, color: '#94a3b8', margin: [4, 0, 0, 0] }}>
                {unavailableCopy.detail}
              </label>
              <label
                style={{
                  fontSize: 12,
                  bold: true,
                  color: '#4ade80',
                  margin: [6, 0, 0, 0],
                }}
              >
                {unavailableCopy.statsLine}
              </label>
            </panel>
          ) : boardPage === undefined ? null : boardPage.loading ? (
            <label style={{ fontSize: 13, color: '#93c5fd', padding: 14 }}>
              Loading Hyperline standings...
            </label>
          ) : boardPage.rows.length === 0 ? (
            <label style={{ fontSize: 13, color: '#94a3b8', padding: 14 }}>
              No ranked runs recorded in this window yet — be the first!
            </label>
          ) : (
            <panel style={{ flow: 'down', width: 'fill' }}>
              {boardPage.rows.slice(0, 10).map((row) => (
                <panel
                  key={`${row.rank}:${row.name}`}
                  style={{
                    flow: 'right',
                    width: 'fill',
                    padding: [6, 10, 6, 10],
                    margin: [0, 0, 4, 0],
                    background:
                      myRow && myRow.rank === row.rank ? '#1e3a8ae6' : '#0f172ae6',
                    borderRadius: 4,
                    verticalAlign: 'center',
                  }}
                >
                  <label
                    style={{
                      width: 44,
                      fontSize: 13,
                      bold: true,
                      color: row.rank <= 3 ? '#ffd34d' : '#cbd5e1',
                    }}
                  >
                    {`#${row.rank}`}
                  </label>
                  <label
                    style={{
                      width: 'fill',
                      fontSize: 13,
                      bold: true,
                      color: '#f8fafc',
                      noWrap: true,
                      textOverflow: 'shrink',
                    }}
                  >
                    {row.name || 'Defender'}
                  </label>
                  <label
                    style={{
                      width: 90,
                      textAlign: 'right',
                      fontSize: 13,
                      bold: true,
                      color: '#4ade80',
                    }}
                  >
                    {`Wave ${row.value}`}
                  </label>
                  <label
                    style={{
                      width: 96,
                      textAlign: 'right',
                      fontSize: 12,
                      color: '#93c5fd',
                    }}
                  >
                    {formatLeaderboardRowMetric(row)}
                  </label>
                </panel>
              ))}
            </panel>
          )}

          {myRow && myRow.rank > 0 ? (
            <label
              style={{
                fontSize: 12,
                bold: true,
                color: '#ffd34d',
                margin: [8, 0, 0, 0],
              }}
            >
              {`Your Standing: #${myRow.rank} · Best Wave ${myRow.value} (${formatLeaderboardRowMetric(myRow)})`}
            </label>
          ) : null}
        </Plate>
      </panel>
    </panel>
  )
}
