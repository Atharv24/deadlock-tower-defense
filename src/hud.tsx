// Panorama JSX HUD for Deadlock Tower Defense:
// - Full-screen Hero Selection UI (`HeroPickerModal`) auto-seating defenders on Team 2 (The Hidden King)
// - TopStrip with Wave #, Next Wave countdown, Alive Creeps, Target Creep HP, and Blue Guardian HP
// - Left Defense Plate with Blue T1 Guardian HP Meter, Repair/Fortify buttons, and Tome tally
// - Interactive 1-of-3 Major Boon Milestone Picker
// - Defeat Banner + Restart button

import {
  Action,
  Banner,
  type BoardPage,
  type BoardRow,
  type BoardWindow,
  freeCursor,
  type Hero,
  heroes,
  type Item,
  items,
  log,
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
  evaluateLegendaryPurchase,
  formatItemDisplayTitle,
  formatMatchClock,
  formatScaledMajorBoonSubtitle,
  formatSoulsCount,
  formatTomeCountDisplay,
  GUARDIAN_REPAIR_AMOUNT_HP,
  GUARDIAN_REPAIR_COST_SOULS,
  isBossWave,
  LEGENDARY_ITEM_COST_SOULS,
  MAJOR_BOON_POOL,
  MINOR_TOME_POOL,
  shouldFreeHudCursor,
  shouldPushHudUpdate,
  type MajorBoonDef,
} from './config'
import type { GuardianManager } from './guardian'
import type { LeaderboardManager } from './leaderboard'
import type { TomeManager } from './tomes'
import type { ActiveBoss, WaveManager } from './wave'

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

const LEGENDARY_ITEMS: readonly Item[] = items
  .filter((it) => it.tier === 5)
  .sort(
    (a, b) =>
      SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot] ||
      formatItemDisplayTitle(a.name).localeCompare(formatItemDisplayTitle(b.name)),
  )

const connectedGenerations = new Map<number, number>()
const spawnedHeroSlots = new Set<number>()
const forceHeroPickerSlots = new Set<number>()
const heroReselectSlots = new Set<number>()
const legendaryShopSlots = new Set<number>()
const leaderboardOpenSlots = new Set<number>()
const leaderboardWindowBySlot = new Map<number, BoardWindow>()
const pendingHeroPickUntil = new Map<number, number>()
const heroSearchBySlot = new Map<number, string>()
const lastCursorKeyBySlot = new Map<number, string>()
const lastHudSigBySlot = new Map<number, string>()
const lastModalSigBySlot = new Map<number, string>()
const lastHudSentAtBySlot = new Map<number, number>()
const cachedHudModeBySlot = new Map<number, { mode: string; expiresAt: number }>()

/** Clears transient per-world HUD state so clock resets never strand modals or caches. */
export function resetHudTransientState(): void {
  pendingHeroPickUntil.clear()
  legendaryShopSlots.clear()
  leaderboardOpenSlots.clear()
  forceHeroPickerSlots.clear()
  heroReselectSlots.clear()
  lastCursorKeyBySlot.clear()
  lastHudSigBySlot.clear()
  lastModalSigBySlot.clear()
  lastHudSentAtBySlot.clear()
}

/** Returns and clears whether the player reselected a hero and needs fresh frontline placement. */
export function consumeHeroReselectPlacementReset(slot: number): boolean {
  return heroReselectSlots.delete(slot)
}

/** Opens the Panorama Hero Selection UI for a player (e.g. via `/hero`). */
export function openHeroPickerForPlayer(player: Player): void {
  legendaryShopSlots.delete(player.slot)
  leaderboardOpenSlots.delete(player.slot)
  forceHeroPickerSlots.add(player.slot)
  lastHudSigBySlot.delete(player.slot)
  lastModalSigBySlot.delete(player.slot)
  lastHudSentAtBySlot.delete(player.slot)
}

/** Toggles the Tier-5 Legendary Armory modal for a player (e.g. via `/legendary` or HUD button). */
export function toggleLegendaryShopForPlayer(
  player: Player,
  forceOpen?: boolean,
): boolean {
  const shouldOpen = forceOpen ?? !legendaryShopSlots.has(player.slot)
  if (shouldOpen) {
    leaderboardOpenSlots.delete(player.slot)
    legendaryShopSlots.add(player.slot)
  } else {
    legendaryShopSlots.delete(player.slot)
  }
  lastHudSigBySlot.delete(player.slot)
  lastModalSigBySlot.delete(player.slot)
  lastHudSentAtBySlot.delete(player.slot)
  return shouldOpen
}

/** Toggles the Tower Defense Leaderboard modal for a player (e.g. via `/leaderboard`, `/lb`, or HUD button). */
export function toggleLeaderboardForPlayer(
  player: Player,
  forceOpen?: boolean,
): boolean {
  const shouldOpen = forceOpen ?? !leaderboardOpenSlots.has(player.slot)
  if (shouldOpen) {
    legendaryShopSlots.delete(player.slot)
    leaderboardOpenSlots.add(player.slot)
  } else {
    leaderboardOpenSlots.delete(player.slot)
  }
  lastHudSigBySlot.delete(player.slot)
  lastModalSigBySlot.delete(player.slot)
  lastHudSentAtBySlot.delete(player.slot)
  return shouldOpen
}

function setLeaderboardWindowForPlayer(
  player: Player,
  window: BoardWindow,
): void {
  leaderboardWindowBySlot.set(player.slot, window)
  lastHudSigBySlot.delete(player.slot)
  lastModalSigBySlot.delete(player.slot)
  lastHudSentAtBySlot.delete(player.slot)
}

/** Selects a hero for the player on Team 2 (The Hidden King) and closes the picker. */
export function selectDefenderHero(
  player: Player,
  hero: Hero,
  now: number,
): void {
  forceHeroPickerSlots.delete(player.slot)
  heroSearchBySlot.delete(player.slot)
  heroReselectSlots.add(player.slot)
  pendingHeroPickUntil.set(player.slot, now + 6)
  lastHudSigBySlot.delete(player.slot)
  lastModalSigBySlot.delete(player.slot)
  lastHudSentAtBySlot.delete(player.slot)
  player.selectHero(hero.name, DEFENDER_TEAM)
  toast(player, `Deploying as ${hero.title} (The Hidden King)!`)
}

function getCachedCompactHudMode(player: Player, now: number): boolean {
  const cached = cachedHudModeBySlot.get(player.slot)
  if (cached && now < cached.expiresAt) {
    return cached.mode === 'compact'
  }
  const mode = player.setting('hud_mode') ?? 'full'
  cachedHudModeBySlot.set(player.slot, { mode, expiresAt: now + 2.0 })
  return mode === 'compact'
}

export function renderTdHud(
  now: number,
  waves: WaveManager,
  guardian: GuardianManager,
  tomes: TomeManager,
  leaderboard: LeaderboardManager,
  onRestart: () => void,
): void {
  for (const conn of players()) {
    const isProbeDefender =
      leaderboard.isProbeMode &&
      conn.bot &&
      conn.player.pawn()?.team === DEFENDER_TEAM
    if ((!conn.ready || conn.bot) && !isProbeDefender) {
      continue
    }
    const player = conn.player
    try {
      if (connectedGenerations.get(player.slot) !== conn.generation) {
        connectedGenerations.set(player.slot, conn.generation)
        spawnedHeroSlots.delete(player.slot)
        forceHeroPickerSlots.delete(player.slot)
        legendaryShopSlots.delete(player.slot)
        leaderboardOpenSlots.delete(player.slot)
        leaderboardWindowBySlot.delete(player.slot)
        pendingHeroPickUntil.delete(player.slot)
        heroSearchBySlot.delete(player.slot)
        lastCursorKeyBySlot.delete(player.slot)
        lastHudSigBySlot.delete(player.slot)
        lastModalSigBySlot.delete(player.slot)
        lastHudSentAtBySlot.delete(player.slot)
        cachedHudModeBySlot.delete(player.slot)
      }

      const pawn = player.pawn()

      if (pawn && pawn.hero > 0 && pawn.team === DEFENDER_TEAM) {
        spawnedHeroSlots.add(player.slot)
        pendingHeroPickUntil.delete(player.slot)
      }

      const isPickingInFlight = (pendingHeroPickUntil.get(player.slot) ?? 0) > now
      const hasSpawnedOnce = spawnedHeroSlots.has(player.slot)
      const needsHeroPick =
        forceHeroPickerSlots.has(player.slot) ||
        (!isPickingInFlight && !hasSpawnedOnce && (!pawn || pawn.hero === 0))
      if (needsHeroPick) {
        legendaryShopSlots.delete(player.slot)
        leaderboardOpenSlots.delete(player.slot)
      }
      const legendaryShopOpen =
        !needsHeroPick && legendaryShopSlots.has(player.slot)
      const leaderboardOpen =
        !needsHeroPick && leaderboardOpenSlots.has(player.slot)
      const lbWindow: BoardWindow =
        leaderboardWindowBySlot.get(player.slot) ?? 'allTime'

      const pendingBoons = tomes.pendingBoonChoices.get(player.slot)
      const needsCursor = shouldFreeHudCursor({
        needsHeroPick,
        hasPendingBoons: Boolean(pendingBoons),
        legendaryShopOpen,
        leaderboardOpen,
        matchState: guardian.matchState,
      })
      const cursorKey = needsCursor ? `true:${pawn?.entity ?? 0}` : 'false'
      if (lastCursorKeyBySlot.get(player.slot) !== cursorKey) {
        lastCursorKeyBySlot.set(player.slot, cursorKey)
        if (!conn.bot) {
          freeCursor(player, needsCursor)
        }
      }

      const canCancelHeroPick = Boolean(pawn && pawn.hero > 0)
      const compact = getCachedCompactHudMode(player, now)
      const displayWave = Math.max(1, waves.wave)
      const nextWaveSeconds = Math.max(0, Math.ceil(waves.nextWaveTime - now))
      const bossSig = waves.activeBosses
        .filter((b) => b.configuredPawnEntity > 0 && b.currentHp > 0)
        .slice(0, 2)
        .map(
          (b) =>
            `${b.wave}:${b.configuredPawnEntity}:${b.currentHp}:${b.currentMaxHp}`,
        )
        .join('|')
      const boonSig = pendingBoons ? pendingBoons.map((b) => b.id).join(',') : ''
      const searchSig = needsHeroPick
        ? (heroSearchBySlot.get(player.slot) ?? '')
        : ''
      const ownedLegendaryNames = legendaryShopOpen
        ? player
            .abilities()
            .map((a) => a.name)
            .filter((name) => LEGENDARY_ITEMS.some((it) => it.name === name))
            .sort()
        : []
      const playerSouls = pawn ? Math.max(0, Math.floor(pawn.souls)) : 0
      const shopSig = legendaryShopOpen
        ? `1:${playerSouls}:${ownedLegendaryNames.join(',')}`
        : '0'
      const boardPage =
        leaderboardOpen || guardian.matchState === 'defeat'
          ? leaderboard.getBoardSnapshot(player, lbWindow, now)
          : undefined
      const boardSig = `${leaderboardOpen ? 1 : 0}:${lbWindow}:${leaderboard.rankedEligible ? 1 : 0}:${leaderboard.disqualifyReason ?? ''}:${
        boardPage
          ? `${boardPage.loading ? 1 : 0}:${boardPage.player?.rank ?? 0}:${boardPage.player?.value ?? 0}:${boardPage.rows.map((r) => `${r.rank},${r.value},${r.tiebreak},${r.name}`).join('|')}`
          : 'local'
      }`
      const tomeRateSig = tomes.getGrowthRate(now)
      const clockSec = Math.max(0, Math.floor(now))
      const modalSig = `${needsHeroPick ? 1 : 0};${canCancelHeroPick ? 1 : 0};${searchSig};${boonSig};${legendaryShopOpen ? 1 : 0};${shopSig};${leaderboardOpen ? 1 : 0};${lbWindow};${guardian.matchState};${compact ? 1 : 0};${pawn?.entity ?? 0}`
      const hudSig = `${clockSec};${displayWave};${waves.waitingForDefenderHero ? 1 : 0};${nextWaveSeconds};${waves.aliveCreepCount};${guardian.currentStage};${guardian.health};${guardian.maxHealth};${guardian.walkerHealth};${guardian.baseGuardiansHealth};${guardian.shrinesHealth};${guardian.patronHealth};${guardian.patronPhase};${guardian.upgradeLevel};${guardian.matchState};${compact ? 1 : 0};${needsHeroPick ? 1 : 0};${canCancelHeroPick ? 1 : 0};${pawn?.entity ?? 0};${shopSig};${boardSig};${searchSig};${boonSig};${tomes.getKills(player.slot)};${tomes.getTotalTomes(player.slot)};${tomeRateSig};${bossSig}`
      const lastSentAt = lastHudSentAtBySlot.get(player.slot) ?? -999
      if (
        !shouldPushHudUpdate({
          lastSig: lastHudSigBySlot.get(player.slot),
          nextSig: hudSig,
          lastModalSig: lastModalSigBySlot.get(player.slot),
          nextModalSig: modalSig,
          nowSeconds: now,
          lastSentAtSeconds: lastSentAt,
          minIntervalSeconds: 0.5,
        })
      ) {
        continue
      }

      const shown = show(
        player,
        <TdHudRoot
          now={now}
          player={player}
          waves={waves}
          guardian={guardian}
          tomes={tomes}
          leaderboard={leaderboard}
          compact={compact}
          needsHeroPick={needsHeroPick}
          canCancelHeroPick={canCancelHeroPick}
          legendaryShopOpen={legendaryShopOpen}
          leaderboardOpen={leaderboardOpen}
          leaderboardWindow={lbWindow}
          boardPage={boardPage}
          playerSouls={playerSouls}
          ownedLegendaryNames={ownedLegendaryNames}
          onRestart={onRestart}
        />,
      )
      if (shown) {
        lastHudSigBySlot.set(player.slot, hudSig)
        lastModalSigBySlot.set(player.slot, modalSig)
        lastHudSentAtBySlot.set(player.slot, now)
      } else {
        lastHudSigBySlot.delete(player.slot)
        lastModalSigBySlot.delete(player.slot)
      }
    } catch (err) {
      lastHudSigBySlot.delete(player.slot)
      lastModalSigBySlot.delete(player.slot)
      log(`HUD render error for slot ${player.slot}: ${String(err)}`)
    }
  }
}

function TdHudRoot(props: {
  now: number
  player: Player
  waves: WaveManager
  guardian: GuardianManager
  tomes: TomeManager
  leaderboard: LeaderboardManager
  compact: boolean
  needsHeroPick: boolean
  canCancelHeroPick: boolean
  legendaryShopOpen: boolean
  leaderboardOpen: boolean
  leaderboardWindow: BoardWindow
  boardPage: BoardPage | undefined
  playerSouls: number
  ownedLegendaryNames: readonly string[]
  onRestart: () => void
}) {
  const {
    now,
    player,
    waves,
    guardian,
    tomes,
    leaderboard,
    compact,
    needsHeroPick,
    canCancelHeroPick,
    legendaryShopOpen,
    leaderboardOpen,
    leaderboardWindow,
    boardPage,
    playerSouls,
    ownedLegendaryNames,
    onRestart,
  } = props
  const displayWave = Math.max(1, waves.wave)
  const nextWaveSeconds = Math.max(0, Math.ceil(waves.nextWaveTime - now))
  const targetCreepHp = computeWaveCreepHp(displayWave)
  const damageMult = computeWaveCreepDamageMult(displayWave)
  const creepScale = computeWaveCreepScale(displayWave)
  const cadenceSec = computeWaveSpawnIntervalSeconds(displayWave)
  const tier = computeWaveTier(displayWave)
  const pendingBoons = tomes.pendingBoonChoices.get(player.slot)
  const hpFraction =
    guardian.activeObjectiveMaxHealth > 0
      ? Math.max(
          0,
          Math.min(
            1,
            guardian.activeObjectiveHealth / guardian.activeObjectiveMaxHealth,
          ),
        )
      : 0
  const guardianTone: Tone =
    hpFraction > 0.5 ? 'success' : hpFraction > 0.25 ? 'accent' : 'danger'

  const statusLine = waves.waitingForDefenderHero
    ? `Waiting for Hero Selection · Wave 1 launches 5s after you deploy · Time: ${formatMatchClock(now)}`
    : `Next: ${nextWaveSeconds}s (Every ${cadenceSec}s) · Alive: ${waves.aliveCreepCount} · HP: ${targetCreepHp} · Dmg: ${damageMult.toFixed(2)}x · Size: ${creepScale.toFixed(2)}x · Time: ${formatMatchClock(now)}`

  return (
    <panel style={{ width: 'fill', height: 'fill' }}>
      <TopStrip
        heading={
          isBossWave(displayWave)
            ? `HIDDEN KING'S DEFENSE · BOSS WAVE ${displayWave}`
            : `HIDDEN KING'S DEFENSE · WAVE ${displayWave} (TIER ${tier})`
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
            {`${guardian.stageLabel} `}
          </Text>
          <Text role="title" tone={guardianTone} plated={true}>
            {`${guardian.activeObjectiveHealth} / ${guardian.activeObjectiveMaxHealth}`}
          </Text>
        </Pill>
      </TopStrip>

      {!needsHeroPick ? <BossHealthPanel bosses={waves.activeBosses} /> : null}

      {compact || needsHeroPick ? null : (
        <DefenseSidePanel
          now={now}
          displayWave={displayWave}
          player={player}
          guardian={guardian}
          tomes={tomes}
          leaderboard={leaderboard}
          hpFraction={hpFraction}
          guardianTone={guardianTone}
        />
      )}

      {pendingBoons && !needsHeroPick ? (
        <MajorBoonModal
          now={now}
          displayWave={displayWave}
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
          playerSlot={player.slot}
          leaderboard={leaderboard}
          boardPage={boardPage}
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

      {legendaryShopOpen ? (
        <LegendaryArmoryModal
          player={player}
          souls={playerSouls}
          ownedNames={ownedLegendaryNames}
        />
      ) : null}

      {leaderboardOpen ? (
        <LeaderboardModal
          player={player}
          window={leaderboardWindow}
          leaderboard={leaderboard}
          boardPage={boardPage}
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
  now: number
  displayWave: number
  player: Player
  guardian: GuardianManager
  tomes: TomeManager
  leaderboard: LeaderboardManager
  hpFraction: number
  guardianTone: Tone
}) {
  const {
    now,
    displayWave,
    player,
    guardian,
    tomes,
    leaderboard,
    hpFraction,
    guardianTone,
  } = props
  const tally = tomes.getTally(player.slot)
  const totalTomes = tomes.getTotalTomes(player.slot)
  const tomeMult = tomes.getWaveMultiplier(displayWave, now)
  const kills = tomes.getKills(player.slot)
  const upgradeCost = guardian.nextUpgradeCost()
  const dmgBonus = guardian.damageBonusPct()
  const rateBonus = guardian.fireRateBonusPct()

  return (
    <panel
      style={{
        flow: 'down',
        horizontalAlign: 'left',
        verticalAlign: 'top',
        margin: [110, 0, 0, 20],
        width: 296,
      }}
    >
      <Plate flow="down" style={{ padding: 12, width: 296 }}>
        <Text role="title" tone="accent" plated={true}>
          {`${guardian.stageLabel} · FORTIFY LV.${guardian.upgradeLevel}`}
        </Text>
        <label style={{ fontSize: 12, color: '#93c5fd', margin: [2, 0, 0, 0] }}>
          {guardian.upgradeLevel > 0
            ? `All Structures: +${dmgBonus}% Dmg · +${rateBonus}% Atk Spd`
            : 'Fortify upgrades HP, Dmg & Atk Spd on all structures'}
        </label>
        <Meter
          value={hpFraction}
          tone={guardianTone}
          width={272}
          height={10}
          style={{ margin: [6, 0, 6, 0] }}
        />
        <StatRow
          label="1. Blue Guardian"
          value={
            guardian.health > 0
              ? `${guardian.health} / ${guardian.maxHealth}`
              : 'FALLEN'
          }
          color={guardian.health > 0 ? '#60a5fa' : '#64748b'}
        />
        <StatRow
          label="2. Blue Walker"
          value={
            guardian.walkerHealth > 0
              ? `${guardian.walkerHealth} / ${guardian.walkerMaxHealth}`
              : 'FALLEN'
          }
          color={guardian.walkerHealth > 0 ? '#38bdf8' : '#64748b'}
        />
        <StatRow
          label={`3. Base Guard (${guardian.baseGuardiansAliveCount})`}
          value={
            guardian.baseGuardiansHealth > 0
              ? `${guardian.baseGuardiansHealth} / ${guardian.baseGuardiansMaxHealth}`
              : 'FALLEN'
          }
          color={guardian.baseGuardiansHealth > 0 ? '#818cf8' : '#64748b'}
        />
        <StatRow
          label={`4. Shrines (${guardian.shrinesAliveCount})`}
          value={
            guardian.shrinesHealth > 0
              ? `${guardian.shrinesHealth} / ${guardian.shrinesMaxHealth}`
              : 'FALLEN'
          }
          color={guardian.shrinesHealth > 0 ? '#facc15' : '#64748b'}
        />
        <StatRow
          label={`5. Patron (${guardian.patronReachedStage2 ? 'Stage 2' : 'Stage 1'})`}
          value={
            guardian.patronHealth > 0
              ? `${guardian.patronHealth} / ${guardian.patronMaxHealth}`
              : 'FALLEN'
          }
          color={guardian.patronReachedStage2 ? '#f87171' : '#fb923c'}
        />
        <panel style={{ flow: 'down', width: 'fill', margin: [8, 0, 8, 0] }}>
          <Action
            kind="secondary"
            style={{ width: 'fill', margin: [0, 0, 4, 0] }}
            onPress={() => guardian.repairByPlayer(player)}
          >
            {`Repair All +${GUARDIAN_REPAIR_AMOUNT_HP} HP (${GUARDIAN_REPAIR_COST_SOULS} Souls)`}
          </Action>
          <Action
            kind="secondary"
            style={{ width: 'fill', margin: [0, 0, 4, 0] }}
            onPress={() => guardian.upgradeByPlayer(player)}
          >
            {`Fortify All Lv.${guardian.upgradeLevel + 1} (${upgradeCost} Souls)`}
          </Action>
          <Action
            kind="primary"
            style={{ width: 'fill', margin: [0, 0, 4, 0] }}
            onPress={() => toggleLegendaryShopForPlayer(player)}
          >
            {`Legendary Armory (T5 · ${formatSoulsCount(LEGENDARY_ITEM_COST_SOULS)})`}
          </Action>
          <Action
            kind="secondary"
            style={{ width: 'fill' }}
            onPress={() => toggleLeaderboardForPlayer(player)}
          >
            Leaderboard (/lb)
          </Action>
        </panel>
        <label
          style={{
            fontSize: 12,
            bold: true,
            color: leaderboard.rankedEligible ? '#4ade80' : '#fbbf24',
            margin: [6, 0, 2, 0],
          }}
        >
          {leaderboard.rankedEligible
            ? 'Ranked Run · Leaderboard Active'
            : `Sandbox Run · Unranked (${leaderboard.disqualifyReason ?? 'test'})`}
        </label>
        <StatRow label="Creep Last-Hits" value={`${kills}`} color="#ffffff" />
        <StatRow
          label={`Tomes (10% · ${tomeMult.toFixed(2)}x)`}
          value={formatTomeCountDisplay(totalTomes)}
          color="#ffd34d"
        />
        {MINOR_TOME_POOL.map((tomeDef) => {
          const count = tally[tomeDef.id] ?? 0
          if (count <= 0) return null
          return (
            <StatRow
              key={tomeDef.id}
              label={tomeDef.shortLabel}
              value={`x${formatTomeCountDisplay(count)}`}
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
  now: number
  displayWave: number
  player: Player
  boons: readonly [MajorBoonDef, MajorBoonDef, MajorBoonDef]
  guardian: GuardianManager
  tomes: TomeManager
}) {
  const { now, displayWave, player, boons, guardian, tomes } = props
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
          BOSS VANQUISHED · MAJOR BOON (PICK 1 OF 3)
        </Text>
        <label style={{ fontSize: 13, color: '#94a3b8', margin: [2, 0, 6, 0] }}>
          Hold TAB to click a blessing or type /boon 1, /boon 2, /boon 3
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
                tomes.chooseMajorBoon(player, idx, guardian, displayWave)
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

function DefeatOverlay(props: {
  wave: number
  kills: number
  playerSlot: number
  leaderboard: LeaderboardManager
  boardPage: BoardPage | undefined
  onRestart: () => void
}) {
  const { wave, kills, playerSlot, leaderboard, boardPage, onRestart } = props
  const sessionBest = leaderboard.sessionBestBySlot.get(playerSlot)
  const myStanding = boardPage?.player
  const runStatusText = leaderboard.rankedEligible
    ? myStanding && myStanding.rank > 0
      ? `Ranked Score Recorded · Standing #${myStanding.rank} (Best Wave ${myStanding.value})`
      : sessionBest
        ? `Score Submitted · Session Best: Wave ${sessionBest.wave} (${sessionBest.kills} Kills)`
        : 'Score Submitted to Hyperline Leaderboard'
    : `Sandbox Run (${leaderboard.disqualifyReason ?? 'Unranked'}) — Not Submitted`

  return (
    <panel
      style={{
        flow: 'down',
        horizontalAlign: 'center',
        verticalAlign: 'center',
      }}
    >
      <Banner
        title="AMBER PATRON DESTROYED"
        detail={`Reached Wave ${wave} · ${kills} Creep Last-Hits`}
        tone="danger"
      />
      <Plate
        flow="down"
        style={{
          margin: [10, 0, 0, 0],
          padding: [8, 16, 8, 16],
          horizontalAlign: 'center',
        }}
      >
        <label
          style={{
            fontSize: 13,
            bold: true,
            color: leaderboard.rankedEligible ? '#4ade80' : '#fbbf24',
          }}
        >
          {runStatusText}
        </label>
      </Plate>
      <panel style={{ flow: 'right', margin: [12, 0, 0, 0] }}>
        <Action
          kind="secondary"
          style={{ width: 200, margin: [0, 8, 0, 0] }}
          onPress={(p) => toggleLeaderboardForPlayer(p, true)}
        >
          View Leaderboard (/lb)
        </Action>
        <Action
          kind="primary"
          style={{ width: 300 }}
          onPress={() => onRestart()}
        >
          Restart Hidden King's Defense (/restarttd)
        </Action>
      </panel>
    </panel>
  )
}

function purchaseLegendaryItem(player: Player, item: Item): void {
  const pawn = player.pawn()
  const hasLivingHero = Boolean(
    pawn && pawn.team === DEFENDER_TEAM && pawn.hero > 0 && pawn.health > 0,
  )
  const ownedNames = player.abilities().map((a) => a.name)
  const check = evaluateLegendaryPurchase({
    hasLivingHero,
    souls: pawn ? Math.floor(pawn.souls) : 0,
    itemName: item.name,
    ownedItemNames: ownedNames,
  })
  if (!check.ok) {
    toast(player, check.reason)
    return
  }

  player.adjustSouls(-check.cost)
  const granted = item.imbue
    ? [0, 1, 2, 3].some((slotIdx) => player.giveItem(item.name, slotIdx))
    : player.giveItem(item.name)

  if (!granted) {
    player.adjustSouls(check.cost)
    toast(
      player,
      item.imbue
        ? `No compatible ability slot for ${formatItemDisplayTitle(item.name)}. Souls refunded.`
        : `Could not equip ${formatItemDisplayTitle(item.name)} (check active/inventory slots). Souls refunded.`,
    )
    return
  }

  lastHudSigBySlot.delete(player.slot)
  lastModalSigBySlot.delete(player.slot)
  lastHudSentAtBySlot.delete(player.slot)
  toast(
    player,
    `Equipped Legendary: ${formatItemDisplayTitle(item.name)} (-${formatSoulsCount(check.cost)} Souls)!`,
  )
}

function LegendaryArmoryModal(props: {
  player: Player
  souls: number
  ownedNames: readonly string[]
}) {
  const { player, souls, ownedNames } = props
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
                {`Hover any item for full stats · Cost: ${formatSoulsCount(LEGENDARY_ITEM_COST_SOULS)} Souls · Your Souls: ${formatSoulsCount(souls)}`}
              </label>
            </panel>
            <Action
              kind="quiet"
              onPress={(p) => toggleLegendaryShopForPlayer(p, false)}
            >
              Close (/legendary)
            </Action>
          </panel>

          <panel style={{ flow: 'rightWrap', width: 'fill' }}>
            {LEGENDARY_ITEMS.map((it) => {
              const owned = ownedNames.includes(it.name)
              const canAfford = souls >= LEGENDARY_ITEM_COST_SOULS
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
                  onPress={(p) => purchaseLegendaryItem(p, it)}
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
                      {owned ? 'OWNED' : `${formatSoulsCount(LEGENDARY_ITEM_COST_SOULS)} Souls`}
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

const LEADERBOARD_WINDOWS: readonly { readonly id: BoardWindow; readonly label: string }[] = [
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

function LeaderboardModal(props: {
  player: Player
  window: BoardWindow
  leaderboard: LeaderboardManager
  boardPage: BoardPage | undefined
}) {
  const { player, window, leaderboard, boardPage } = props
  const sessionBest = leaderboard.sessionBestBySlot.get(player.slot)
  const myRow = boardPage?.player

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
                HIDDEN KING'S DEFENSE — HIGHEST WAVE
              </Text>
              <label
                style={{
                  fontSize: 12,
                  bold: true,
                  color: leaderboard.rankedEligible ? '#4ade80' : '#fbbf24',
                  margin: [2, 0, 0, 0],
                }}
              >
                {leaderboard.rankedEligible
                  ? 'Ranked Run Active · Defeat or Restart (Wave 2+) submits automatically'
                  : `Sandbox Run · Unranked (${leaderboard.disqualifyReason ?? 'test'}) — /restarttd for Ranked`}
              </label>
            </panel>
            <Action
              kind="quiet"
              onPress={(p) => toggleLeaderboardForPlayer(p, false)}
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
                onPress={(p) => setLeaderboardWindowForPlayer(p, tab.id)}
              >
                {tab.label}
              </Action>
            ))}
          </panel>

          {boardPage === undefined ? (
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
                Local Dev Server — Hyperline Standings Sync When Hosted
              </label>
              <label style={{ fontSize: 12, color: '#94a3b8', margin: [4, 0, 0, 0] }}>
                {sessionBest
                  ? `Session Best: Wave ${sessionBest.wave} (${sessionBest.kills} Creep Last-Hits)`
                  : 'No completed runs recorded in this local session yet.'}
              </label>
            </panel>
          ) : boardPage.loading ? (
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
