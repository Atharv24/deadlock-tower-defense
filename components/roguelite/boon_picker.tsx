import { Action, Plate, type Player, Text } from 'modlock'

import type { FriendlyStructureTarget, TomeManager } from './tome_manager'
import {
  formatScaledMajorBoonSubtitle,
  type MajorBoonDef,
} from './tome_math'

export function BoonPickerOverlay(props: {
  now: number
  displayWave: number
  player: Player
  boons: readonly [MajorBoonDef, MajorBoonDef, MajorBoonDef]
  tomes: TomeManager
  structureTarget?: FriendlyStructureTarget
  title?: string
  hint?: string
}) {
  const { now, displayWave, player, boons, tomes, structureTarget, title, hint } =
    props
  const boonWave = tomes.pendingBoonWave.get(player.slot) ?? displayWave
  const boonMult = tomes.getWaveMultiplier(boonWave, now)
  return (
    <panel
      style={{
        flow: 'down',
        horizontalAlign: 'right',
        verticalAlign: 'top',
        margin: [110, 20, 0, 0],
        width: 340,
      }}
    >
      <Plate flow="down" style={{ padding: 12, width: 340 }}>
        <Text role="title" tone="accent" plated={true}>
          {title ?? 'BOSS VANQUISHED · MAJOR BOON (PICK 1 OF 3)'}
        </Text>
        <label style={{ fontSize: 13, color: '#94a3b8', margin: [2, 0, 6, 0] }}>
          {hint ?? 'Hold TAB to click a blessing or type /boon 1, /boon 2, /boon 3'}
        </label>
        {boons.map((boon, idx) => (
          <panel
            key={boon.id}
            style={{ flow: 'down', width: 'fill', margin: [4, 0, 4, 0] }}
          >
            <Action
              kind="primary"
              style={{ width: 'fill' }}
              onPress={() =>
                tomes.chooseMajorBoon(
                  player,
                  idx,
                  structureTarget ?? displayWave,
                  displayWave,
                )
              }
            >
              {`${idx + 1}. ${boon.title}`}
            </Action>
            <label
              style={{
                fontSize: 13,
                color: boon.accent,
                margin: [2, 4, 4, 4],
              }}
            >
              {formatScaledMajorBoonSubtitle(boon, boonMult)}
            </label>
          </panel>
        ))}
      </Plate>
    </panel>
  )
}
