import { Action, type Item, items, Plate, type Player, Text, toast } from 'modlock'
import { formatSoulsCount } from '@base/format'
import {
  formatItemDisplayTitle,
  LEGENDARY_ITEM_COST_SOULS,
  purchaseLegendaryItemForPlayer,
} from '@engine/items'
import type { HudStateStore } from '../hud_state'

const SLOT_ORDER: Readonly<Record<Item['slot'], number>> = {
  weapon: 0,
  vitality: 1,
  spirit: 2,
}

const SLOT_ACCENT: Readonly<Record<Item['slot'], string>> = {
  weapon: '#fb923c',
  vitality: '#4ade80',
  spirit: '#c084fc',
}

export const LEGENDARY_ITEMS: readonly Item[] = items
  .filter((it) => it.tier === 5)
  .sort(
    (a, b) =>
      SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot] ||
      formatItemDisplayTitle(a.name).localeCompare(formatItemDisplayTitle(b.name)),
  )

export function LegendaryArmoryModal(props: {
  player: Player
  souls: number
  ownedNames: readonly string[]
  state: HudStateStore
  requiredTeam?: number
  itemCost?: number
}) {
  const { player, souls, ownedNames, state, requiredTeam = 2, itemCost } = props
  const cost = itemCost ?? LEGENDARY_ITEM_COST_SOULS

  return (
    <panel
      style={{
        width: 'fill',
        height: 'fill',
        background: '#050811cc',
        zIndex: 45,
      }}
    >
      <panel
        style={{
          flow: 'down',
          horizontalAlign: 'center',
          verticalAlign: 'center',
          width: 780,
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
                LEGENDARY ARMORY · TIER 5 ITEMS
              </Text>
              <label style={{ fontSize: 13, color: '#cbd5e1', margin: [2, 0, 0, 0] }}>
                {`Hover any item for full stats · Cost: ${formatSoulsCount(cost)} Souls · Your Souls: ${formatSoulsCount(souls)}`}
              </label>
            </panel>
            <Action
              kind="quiet"
              onPress={(p) => {
                state.toggleLegendaryShop(p.slot, false)
              }}
            >
              Close (/legendary)
            </Action>
          </panel>

          <panel style={{ flow: 'rightWrap', width: 'fill' }}>
            {LEGENDARY_ITEMS.map((it) => {
              const owned = ownedNames.includes(it.name)
              const canAfford = souls >= cost
              const accent = SLOT_ACCENT[it.slot]
              const badge = it.imbue ? 'IMBUE' : it.active ? 'ACTIVE' : 'PASSIVE'
              return (
                <button
                  key={it.name}
                  sound="UI.MainMenu.Activate"
                  hoverSound="UI.MainMenu.Hover"
                  style={{
                    flow: 'right',
                    width: 238,
                    height: 66,
                    margin: 4,
                    padding: 8,
                    background: owned ? '#0f291ee6' : '#0f172ae6',
                    borderWidth: 1,
                    borderColor: owned
                      ? '#4ade80'
                      : canAfford
                        ? accent
                        : '#334155',
                    borderRadius: 6,
                    verticalAlign: 'center',
                  }}
                  hover={{
                    background: '#1e293bff',
                    borderColor: '#facc15',
                  }}
                  onPress={(p) => {
                    const res = purchaseLegendaryItemForPlayer(
                      p,
                      it,
                      requiredTeam,
                      cost,
                    )
                    if (!res.ok) {
                      toast(p, res.reason)
                      return
                    }
                    state.clearPushSignatures(p.slot)
                    state.requestImmediateHudSync()
                    toast(
                      p,
                      `Equipped Legendary: ${formatItemDisplayTitle(it.name)} (-${formatSoulsCount(res.cost)} Souls)!`,
                    )
                  }}
                >
                  <image
                    src={it.icon}
                    item={it.name}
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 4,
                      margin: [0, 10, 0, 0],
                    }}
                  />
                  <panel style={{ flow: 'down', width: 'fill' }}>
                    <label
                      style={{
                        fontSize: 13,
                        bold: true,
                        color: '#f8fafc',
                        noWrap: true,
                        textOverflow: 'shrink',
                      }}
                    >
                      {formatItemDisplayTitle(it.name)}
                    </label>
                    <label style={{ fontSize: 11, color: accent, margin: [2, 0, 0, 0] }}>
                      {`${it.slot.toUpperCase()} · ${badge}`}
                    </label>
                    <label
                      style={{
                        fontSize: 12,
                        bold: true,
                        color: owned ? '#4ade80' : canAfford ? '#ffd34d' : '#94a3b8',
                        margin: [2, 0, 0, 0],
                      }}
                    >
                      {owned ? 'OWNED' : `${formatSoulsCount(cost)} Souls`}
                    </label>
                  </panel>
                </button>
              )
            })}
          </panel>
        </Plate>
      </panel>
    </panel>
  )
}
