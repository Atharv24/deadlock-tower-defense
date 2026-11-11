// Panorama JSX HUD for Deadlock Tower Defense:
// - Full-screen Hero Selection UI (`HeroPickerModal`) auto-seating defenders on Team 2 (The Hidden King)
// - TopStrip with Wave #, Next Wave countdown, Alive Creeps, Target Creep HP, and Blue Guardian HP
// - Left Defense Plate with Blue T1 Guardian HP Meter, Repair/Fortify buttons, and Tome tally
// - Interactive 1-of-3 Major Boon Milestone Picker
// - Defeat Banner + Restart button

import {
  Action,
  Banner,
  freeCursor,
  type Hero,
  heroes,
  Meter,
  Pill,
  Plate,
  type Player,
  players,
  show,
  Text,
  toast,
  type Tone,
  TopStrip,
} from 'modlock'

import {
  computeWaveCreepDamageMult,
  computeWaveCreepHp,
  computeWaveCreepScale,
  computeWaveSpawnIntervalSeconds,
  computeWaveTier,
  DEFENDER_TEAM,
  GUARDIAN_REPAIR_AMOUNT_HP,
  GUARDIAN_REPAIR_COST_SOULS,
  isBossWave,
  shouldFreeHudCursor,
  type MajorBoonDef,
  MINOR_TOME_POOL,
} from './config'
import type { GuardianManager } from './guardian'
import type { TomeManager } from './tomes'
import type { ActiveBoss, WaveManager } from './wave'

const connectedGenerations = new Map<number, number>()
const spawnedHeroSlots = new Set<number>()
const forceHeroPickerSlots = new Set<number>()
const pendingHeroPickUntil = new Map<number, number>()
const heroSearchBySlot = new Map<number, string>()
const lastCursorKeyBySlot = new Map<number, string>()

/** Opens the Panorama Hero Selection UI for a player (e.g. via `/hero`). */
export function openHeroPickerForPlayer(player: Player): void {
  forceHeroPickerSlots.add(player.slot)
}

/** Selects a hero for the player on Team 2 (The Hidden King) and closes the picker. */
export function selectDefenderHero(
  player: Player,
  hero: Hero,
  now: number,
): void {
  forceHeroPickerSlots.delete(player.slot)
  heroSearchBySlot.delete(player.slot)
  pendingHeroPickUntil.set(player.slot, now + 6)
  player.selectHero(hero.name, DEFENDER_TEAM)
  toast(player, `Deploying as ${hero.title} (The Hidden King)!`)
}

export function renderTdHud(
  now: number,
  waves: WaveManager,
  guardian: GuardianManager,
  tomes: TomeManager,
  onRestart: () => void,
): void {
  for (const conn of players()) {
    if (!conn.ready || conn.bot) {
      continue
    }
    const player = conn.player
    if (connectedGenerations.get(player.slot) !== conn.generation) {
      connectedGenerations.set(player.slot, conn.generation)
      spawnedHeroSlots.delete(player.slot)
      forceHeroPickerSlots.delete(player.slot)
      pendingHeroPickUntil.delete(player.slot)
      heroSearchBySlot.delete(player.slot)
      lastCursorKeyBySlot.delete(player.slot)
    }

    const pawn = player.pawn()
    // Only draw HUD for human defenders on Team 2 (or spectators/unassigned).
    if (pawn && pawn.team === 3) {
      continue
    }

    if (pawn && pawn.hero > 0) {
      spawnedHeroSlots.add(player.slot)
      pendingHeroPickUntil.delete(player.slot)
    }

    const isPickingInFlight = (pendingHeroPickUntil.get(player.slot) ?? 0) > now
    const hasSpawnedOnce = spawnedHeroSlots.has(player.slot)
    const needsHeroPick =
      forceHeroPickerSlots.has(player.slot) ||
      (!isPickingInFlight && !hasSpawnedOnce && (!pawn || pawn.hero === 0))

    const pendingBoons = tomes.pendingBoonChoices.get(player.slot)
    const needsCursor = shouldFreeHudCursor({
      needsHeroPick,
      hasPendingBoons: Boolean(pendingBoons),
      matchState: guardian.matchState,
    })
    const cursorKey = needsCursor ? `true:${pawn?.entity ?? 0}` : 'false'
    if (lastCursorKeyBySlot.get(player.slot) !== cursorKey) {
      lastCursorKeyBySlot.set(player.slot, cursorKey)
      freeCursor(player, needsCursor)
    }

    show(
      player,
      <TdHudRoot
        now={now}
        player={player}
        waves={waves}
        guardian={guardian}
        tomes={tomes}
        needsHeroPick={needsHeroPick}
        canCancelHeroPick={Boolean(pawn && pawn.hero > 0)}
        onRestart={onRestart}
      />,
    )
  }
}

function TdHudRoot(props: {
  now: number
  player: Player
  waves: WaveManager
  guardian: GuardianManager
  tomes: TomeManager
  needsHeroPick: boolean
  canCancelHeroPick: boolean
  onRestart: () => void
}) {
  const {
    now,
    player,
    waves,
    guardian,
    tomes,
    needsHeroPick,
    canCancelHeroPick,
    onRestart,
  } = props
  const displayWave = Math.max(1, waves.wave)
  const nextWaveSeconds = Math.max(0, Math.ceil(waves.nextWaveTime - now))
  const targetCreepHp = computeWaveCreepHp(displayWave)
  const damageMult = computeWaveCreepDamageMult(displayWave)
  const creepScale = computeWaveCreepScale(displayWave)
  const cadenceSec = computeWaveSpawnIntervalSeconds(displayWave)
  const tier = computeWaveTier(displayWave)
  const compact = player.setting('hud_mode') === 'compact'
  const pendingBoons = tomes.pendingBoonChoices.get(player.slot)
  const hpFraction =
    guardian.maxHealth > 0
      ? Math.max(0, Math.min(1, guardian.health / guardian.maxHealth))
      : 0
  const guardianTone: Tone =
    hpFraction > 0.5 ? 'success' : hpFraction > 0.25 ? 'accent' : 'danger'

  const statusLine = waves.waitingForDefenderHero
    ? 'Waiting for Hero Selection · Wave 1 launches 5s after you deploy'
    : `Next: ${nextWaveSeconds}s (Every ${cadenceSec}s) · Alive: ${waves.aliveCreepCount} · HP: ${targetCreepHp} · Dmg: ${damageMult.toFixed(2)}x · Size: ${creepScale.toFixed(2)}x`

  return (
    <panel style={{ width: 'fill', height: 'fill' }}>
      <TopStrip
        heading={
          isBossWave(displayWave)
            ? `DEADLOCK TD · BOSS WAVE ${displayWave}`
            : `DEADLOCK TD · WAVE ${displayWave} (TIER ${tier})`
        }
        line={statusLine}
        lineTone={
          waves.waitingForDefenderHero
            ? 'accent'
            : isBossWave(displayWave)
              ? 'danger'
              : 'muted'
        }
        keepTeamBar={true}
      >
        <Pill flow="right" style={{ padding: [4, 12, 4, 12] }}>
          <Text role="label" tone="muted" plated={true}>
            {`GUARDIAN `}
          </Text>
          <Text role="title" tone={guardianTone} plated={true}>
            {`${guardian.health} / ${guardian.maxHealth}`}
          </Text>
        </Pill>
      </TopStrip>

      {!needsHeroPick ? <BossHealthPanel bosses={waves.activeBosses} /> : null}

      {compact || needsHeroPick ? null : (
        <DefenseSidePanel
          player={player}
          guardian={guardian}
          tomes={tomes}
          hpFraction={hpFraction}
          guardianTone={guardianTone}
        />
      )}

      {pendingBoons && !needsHeroPick ? (
        <MajorBoonModal
          player={player}
          boons={pendingBoons}
          guardian={guardian}
          tomes={tomes}
        />
      ) : null}

      {guardian.matchState === 'defeat' ? (
        <DefeatOverlay
          wave={waves.wave}
          kills={tomes.getKills(player.slot)}
          onRestart={onRestart}
        />
      ) : null}

      {needsHeroPick ? (
        <HeroPickerModal
          now={now}
          player={player}
          canCancel={canCancelHeroPick}
        />
      ) : null}
    </panel>
  )
}

function HeroPickerModal(props: {
  now: number
  player: Player
  canCancel: boolean
}) {
  const { now, player, canCancel } = props
  const rawSearch = heroSearchBySlot.get(player.slot) ?? ''
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
                SELECT YOUR DEFENDER · THE HIDDEN KING
              </Text>
              <label
                style={{
                  fontSize: 14,
                  color: '#cbd5e1',
                  margin: [2, 0, 0, 0],
                }}
              >
                Auto-assigned to The Hidden King · Defend the Blue T1 Guardian in Center Lane
              </label>
            </panel>

            <panel style={{ flow: 'right', verticalAlign: 'center' }}>
              <Action
                kind="secondary"
                style={{ margin: [0, 8, 0, 0] }}
                onPress={(p) => {
                  const pick =
                    heroes[Math.floor(Math.random() * heroes.length)]
                  if (pick) {
                    selectDefenderHero(p, pick, now)
                  }
                }}
              >
                Random Hero
              </Action>
              {canCancel ? (
                <Action
                  kind="quiet"
                  onPress={(p) => {
                    forceHeroPickerSlots.delete(p.slot)
                  }}
                >
                  Close
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
                heroSearchBySlot.set(p.slot, text)
              }}
            />
            {rawSearch.length > 0 ? (
              <Action
                kind="quiet"
                style={{ margin: [0, 0, 0, 8] }}
                onPress={(p) => {
                  heroSearchBySlot.delete(p.slot)
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
                onPress={(p) => selectDefenderHero(p, h, now)}
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

function DefenseSidePanel(props: {
  player: Player
  guardian: GuardianManager
  tomes: TomeManager
  hpFraction: number
  guardianTone: Tone
}) {
  const { player, guardian, tomes, hpFraction, guardianTone } = props
  const tally = tomes.getTally(player.slot)
  const totalTomes = tomes.getTotalTomes(player.slot)
  const kills = tomes.getKills(player.slot)
  const upgradeCost = guardian.nextUpgradeCost()

  return (
    <panel
      style={{
        flow: 'down',
        horizontalAlign: 'left',
        verticalAlign: 'top',
        margin: [110, 0, 0, 20],
        width: 280,
      }}
    >
      <Plate flow="down" style={{ padding: 12, width: 280 }}>
        <Text role="title" tone="accent" plated={true}>
          {`BLUE T1 GUARDIAN · LV.${guardian.upgradeLevel}`}
        </Text>
        <Meter
          value={hpFraction}
          tone={guardianTone}
          width={256}
          height={10}
          style={{ margin: [6, 0, 6, 0] }}
        />
        <StatRow
          label="Integrity"
          value={`${guardian.health} / ${guardian.maxHealth} HP`}
          color="#60a5fa"
        />
        <panel style={{ flow: 'down', width: 'fill', margin: [8, 0, 8, 0] }}>
          <Action
            kind="secondary"
            style={{ width: 'fill', margin: [0, 0, 4, 0] }}
            onPress={() => guardian.repairByPlayer(player)}
          >
            {`Repair +${GUARDIAN_REPAIR_AMOUNT_HP} HP (${GUARDIAN_REPAIR_COST_SOULS} Souls)`}
          </Action>
          <Action
            kind="secondary"
            style={{ width: 'fill' }}
            onPress={() => guardian.upgradeByPlayer(player)}
          >
            {`Fortify Lv.${guardian.upgradeLevel + 1} (${upgradeCost} Souls)`}
          </Action>
        </panel>
        <StatRow label="Creep Last-Hits" value={`${kills}`} color="#ffffff" />
        <StatRow
          label="Tomes Collected (10%)"
          value={`${totalTomes}`}
          color="#ffd34d"
        />
        {MINOR_TOME_POOL.map((tomeDef) => {
          const count = tally[tomeDef.id] ?? 0
          if (count <= 0) return null
          return (
            <StatRow
              label={tomeDef.shortLabel}
              value={`x${count}`}
              color={tomeDef.color}
            />
          )
        })}
      </Plate>
    </panel>
  )
}

function StatRow(props: { label: string; value: string; color: string }) {
  return (
    <panel style={{ flow: 'right', width: 'fill', margin: [3, 0, 0, 0] }}>
      <label style={{ width: 'fill', color: '#cbd5e1', fontSize: 14 }}>
        {props.label}
      </label>
      <label
        style={{
          width: 110,
          textAlign: 'right',
          color: props.color,
          bold: true,
          fontSize: 14,
        }}
      >
        {props.value}
      </label>
    </panel>
  )
}

function BossHealthPanel(props: { bosses: readonly ActiveBoss[] }) {
  const liveBosses = props.bosses.filter(
    (b) => b.configuredPawnEntity > 0 && b.currentHp > 0,
  )
  if (liveBosses.length === 0) {
    return null
  }
  return (
    <panel
      style={{
        flow: 'down',
        horizontalAlign: 'center',
        verticalAlign: 'top',
        margin: [86, 0, 0, 0],
        width: 448,
      }}
    >
      {liveBosses.slice(0, 2).map((boss) => {
        const heroDef = heroes.find((h) => h.name === boss.hero)
        const heroTitle = heroDef
          ? heroDef.title.toUpperCase()
          : boss.hero.replace('hero_', '').toUpperCase()
        const maxHp = Math.max(1, boss.currentMaxHp)
        const hpFrac = Math.max(0, Math.min(1, boss.currentHp / maxHp))
        return (
          <Plate
            key={`${boss.wave}:${boss.configuredPawnEntity}`}
            flow="down"
            style={{
              padding: [8, 12, 8, 12],
              width: 448,
              margin: [0, 0, 6, 0],
            }}
          >
            <panel
              style={{
                flow: 'right',
                width: 'fill',
                verticalAlign: 'center',
                margin: [0, 0, 5, 0],
              }}
            >
              {heroDef ? (
                <hero
                  hero={heroDef.id}
                  look="icon"
                  scaling="cover"
                  style={{
                    width: 28,
                    height: 28,
                    margin: [0, 8, 0, 0],
                    borderRadius: 14,
                  }}
                />
              ) : null}
              <panel style={{ width: 'fill', flow: 'down' }}>
                <Text role="title" tone="danger" plated={true}>
                  {`WAVE ${boss.wave} BOSS · ${heroTitle}`}
                </Text>
              </panel>
              <label
                style={{
                  fontSize: 14,
                  bold: true,
                  color: '#fca5a5',
                  textAlign: 'right',
                }}
              >
                {`${boss.currentHp} / ${maxHp} HP`}
              </label>
            </panel>
            <Meter value={hpFrac} tone="danger" width={424} height={11} />
          </Plate>
        )
      })}
    </panel>
  )
}

function MajorBoonModal(props: {
  player: Player
  boons: readonly [MajorBoonDef, MajorBoonDef, MajorBoonDef]
  guardian: GuardianManager
  tomes: TomeManager
}) {
  const { player, boons, guardian, tomes } = props
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
          BOSS VANQUISHED · MAJOR BOON (PICK 1 OF 3)
        </Text>
        <label style={{ fontSize: 13, color: '#94a3b8', margin: [2, 0, 6, 0] }}>
          Hold TAB to click a blessing or type /boon 1, /boon 2, /boon 3
        </label>
        {boons.map((boon, idx) => (
          <panel style={{ flow: 'down', width: 'fill', margin: [4, 0, 4, 0] }}>
            <Action
              kind="primary"
              style={{ width: 'fill' }}
              onPress={() => tomes.chooseMajorBoon(player, idx, guardian)}
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
              {boon.subtitle}
            </label>
          </panel>
        ))}
      </Plate>
    </panel>
  )
}

function DefeatOverlay(props: {
  wave: number
  kills: number
  onRestart: () => void
}) {
  const { wave, kills, onRestart } = props
  return (
    <panel
      style={{
        flow: 'down',
        horizontalAlign: 'center',
        verticalAlign: 'center',
      }}
    >
      <Banner
        title="BLUE GUARDIAN DESTROYED"
        detail={`Reached Wave ${wave} · ${kills} Creep Last-Hits`}
        tone="danger"
      />
      <panel style={{ margin: [14, 0, 0, 0], width: 280 }}>
        <Action
          kind="primary"
          style={{ width: 'fill' }}
          onPress={() => onRestart()}
        >
          Restart Tower Defense (/restarttd)
        </Action>
      </panel>
    </panel>
  )
}
