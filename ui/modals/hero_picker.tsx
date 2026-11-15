import { Action, type Hero, heroes, Plate, type Player, Text } from 'modlock'
import type { HudStateStore } from '../hud_state'

export function HeroPickerModal(props: {
  now: number
  player: Player
  canCancel: boolean
  state: HudStateStore
  onSelectHero: (player: Player, hero: Hero, now: number) => void
  title?: string
  subtitle?: string
}) {
  const { now, player, canCancel, state, onSelectHero, title, subtitle } = props
  const isInitialPick = state.isAwaitingInitialHeroPick(player.slot)
  const currentHeroId = player.pawn()?.hero ?? 0
  const currentHero =
    currentHeroId > 0 ? heroes.find((h) => h.id === currentHeroId) : undefined
  const rawSearch = state.heroSearchBySlot.get(player.slot) ?? ''
  const needle = rawSearch.trim().toLowerCase()
  const filteredHeroes =
    needle.length === 0
      ? heroes
      : heroes.filter(
          (h) =>
            h.title.toLowerCase().includes(needle) ||
            h.name.toLowerCase().includes(needle),
        )

  return (
    <panel
      style={{
        width: 'fill',
        height: 'fill',
        background: '#050811d9',
        zIndex: 50,
      }}
    >
      <panel
        style={{
          flow: 'down',
          horizontalAlign: 'center',
          verticalAlign: 'center',
          width: 1080,
          height: 640,
        }}
      >
        <Plate
          flow="down"
          style={{
            width: 'fill',
            height: 'fill',
            padding: [16, 20, 16, 20],
          }}
        >
          <panel
            style={{
              flow: 'right',
              width: 'fill',
              margin: [0, 0, 10, 0],
            }}
          >
            <panel style={{ flow: 'down', width: 'fill' }}>
              <Text role="title" tone="accent" plated={true}>
                {title ?? 'SELECT YOUR DEFENDER · THE HIDDEN KING'}
              </Text>
              <label
                style={{
                  fontSize: 14,
                  color: '#cbd5e1',
                  margin: [2, 0, 0, 0],
                }}
              >
                {subtitle ??
                  'Auto-assigned to The Hidden King · Defend the Blue T1 Guardian in Center Lane'}
              </label>
            </panel>

            <panel style={{ flow: 'right', verticalAlign: 'center' }}>
              <Action
                kind="secondary"
                style={{ margin: [0, 8, 0, 0] }}
                onPress={(p) => {
                  const pick = heroes[Math.floor(Math.random() * heroes.length)]
                  if (pick) {
                    onSelectHero(p, pick, now)
                  }
                }}
              >
                Random Hero
              </Action>
              {canCancel ? (
                <Action
                  kind={isInitialPick ? 'primary' : 'quiet'}
                  onPress={(p) => {
                    state.closeHeroPicker(p.slot)
                  }}
                >
                  {isInitialPick
                    ? currentHero
                      ? `Deploy as ${currentHero.title}`
                      : 'Keep Current Hero'
                    : 'Close'}
                </Action>
              ) : null}
            </panel>
          </panel>

          <panel
            style={{
              flow: 'right',
              width: 'fill',
              margin: [0, 0, 10, 0],
              verticalAlign: 'center',
            }}
          >
            <entry
              value={rawSearch}
              placeholder="Filter heroes by name (e.g. Graves, Seven, McGinnis, Infernus)..."
              maxLength={40}
              style={{
                width: 460,
                padding: [6, 10, 6, 10],
                background: '#0f172aee',
                borderWidth: 1,
                borderColor: '#475569',
                borderRadius: 4,
                color: '#f8fafc',
                fontSize: 14,
              }}
              onChange={(p, text) => {
                state.setHeroSearch(p.slot, text)
              }}
            />
            {rawSearch.length > 0 ? (
              <Action
                kind="quiet"
                style={{ margin: [0, 0, 0, 8] }}
                onPress={(p) => {
                  state.setHeroSearch(p.slot, '')
                }}
              >
                Clear
              </Action>
            ) : null}
            <label
              style={{
                width: 'fill',
                textAlign: 'right',
                fontSize: 13,
                color: '#94a3b8',
              }}
            >
              {`${filteredHeroes.length} Heroes Available · Tip: Type /hero anytime to switch`}
            </label>
          </panel>

          <panel
            style={{
              flow: 'rightWrap',
              width: 'fill',
              height: 'fill',
              overflowY: 'scroll',
              padding: [4, 2, 8, 2],
            }}
          >
            {filteredHeroes.map((h) => (
              <button
                key={h.id}
                sound="UI.MainMenu.Activate"
                hoverSound="UI.MainMenu.Hover"
                style={{
                  flow: 'down',
                  width: 112,
                  height: 146,
                  margin: 5,
                  padding: 4,
                  background: '#0f172ae6',
                  borderWidth: 1,
                  borderColor: '#334155',
                  borderRadius: 6,
                  transition: 0.1,
                }}
                hover={{
                  background: '#1e293bff',
                  borderColor: '#facc15',
                  scale: 1.03,
                }}
                onPress={(p) => onSelectHero(p, h, now)}
              >
                <hero
                  hero={h.id}
                  look="card"
                  scaling="cover"
                  style={{
                    width: 'fill',
                    height: 112,
                    borderRadius: 4,
                  }}
                />
                <label
                  style={{
                    width: 'fill',
                    margin: [5, 2, 0, 2],
                    fontSize: 13,
                    bold: true,
                    textAlign: 'center',
                    color: '#f8fafc',
                    noWrap: true,
                    textOverflow: 'shrink',
                  }}
                >
                  {h.title}
                </label>
              </button>
            ))}
          </panel>
        </Plate>
      </panel>
    </panel>
  )
}
