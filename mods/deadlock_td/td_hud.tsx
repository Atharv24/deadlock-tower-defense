import {
  Action,
  Banner,
  type BoardPage,
  type Hero,
  heroes,
  Meter,
  Pill,
  Plate,
  type Player,
  Text,
  type Tone,
  TopStrip,
} from 'modlock'
import { type TomeManager } from '@components/roguelite'
import { BoonPickerOverlay } from '@components/roguelite/boon_picker'
import { type LeaderboardManager } from '@components/scores'
import { HudController, type HudSlotContext } from '@ui/hud_controller'

import {
  computeWaveCreepDamageMult,
  computeWaveCreepHp,
  computeWaveCreepScale,
  computeWaveSpawnIntervalSeconds,
  computeWaveTier,
  DEFENDER_TEAM,
  formatSoulsCount,
  formatTomeCountDisplay,
  GUARDIAN_REPAIR_AMOUNT_HP,
  GUARDIAN_REPAIR_COST_SOULS,
  isBossWave,
  LEGENDARY_ITEM_COST_SOULS,
  MINOR_TOME_POOL,
} from './td_config'
import type { GuardianManager } from './guardian'
import type { ActiveBoss, WaveManager } from './wave'

const tdHud = new HudController({
  team: DEFENDER_TEAM,
  hudModeSettingKey: 'hud_mode',
  heroDeployTeamName: 'The Hidden King',
})

export function pollNativeShopStateEveryFrame(now: number): void {
  tdHud.pollNativeShopStateEveryFrame(now)
}

export function requestImmediateHudSync(): void {
  tdHud.requestImmediateHudSync()
}

export function consumeImmediateHudSync(): boolean {
  return tdHud.consumeImmediateHudSync()
}

export function resetHudTransientState(): void {
  tdHud.resetTransientState()
}

export function resetHudForNewWorld(): void {
  tdHud.resetForNewWorld()
}

export function markHudRestoredFromHandoff(awaitingSlots?: readonly number[]): void {
  tdHud.markRestoredFromHandoff(awaitingSlots)
}

export function exportHudAwaitingHeroPickSlots(): number[] {
  return tdHud.exportAwaitingHeroPickSlots()
}

export function requireInitialHeroPickForPlayer(player: Player): void {
  tdHud.requireInitialHeroPickForPlayer(player)
}

export function isSlotAwaitingInitialHeroPick(slot: number): boolean {
  return tdHud.isAwaitingInitialHeroPick(slot)
}

export function handleHudClockBackstep(): void {
  tdHud.handleClockBackstep()
}

export function invalidateHudSettingCache(slot?: number): void {
  tdHud.invalidateSettingCache(slot)
}

export function toggleCompactHudForPlayer(player: Player): 'full' | 'compact' {
  return tdHud.toggleCompactHudForPlayer(player)
}

export function consumeHeroReselectPlacementReset(slot: number): boolean {
  return tdHud.consumeHeroReselectPlacementReset(slot)
}

export function openHeroPickerForPlayer(player: Player): void {
  tdHud.openHeroPickerForPlayer(player)
}

export function toggleLegendaryShopForPlayer(
  player: Player,
  forceOpen?: boolean,
): boolean {
  return tdHud.toggleLegendaryShopForPlayer(player, forceOpen)
}

export function toggleLeaderboardForPlayer(
  player: Player,
  forceOpen?: boolean,
): boolean {
  return tdHud.toggleLeaderboardForPlayer(player, forceOpen)
}

export function selectDefenderHero(player: Player, hero: Hero, now: number): void {
  tdHud.selectDefenderHero(player, hero, now)
}

export function renderTdHud(
  now: number,
  waves: WaveManager,
  guardian: GuardianManager,
  tomes: TomeManager,
  leaderboard: LeaderboardManager,
  onRestart: () => void,
): void {
  const nextWaveSeconds = Math.max(0, Math.ceil(waves.nextWaveTime - now))
  const bossSig = waves.activeBosses
    .filter((b) => b.configuredPawnEntity > 0 && b.currentHp > 0)
    .slice(0, 2)
    .map(
      (b) =>
        `${b.wave}:${b.configuredPawnEntity}:${b.currentHp}:${b.currentMaxHp}`,
    )
    .join('|')
  const tomeRateSig = tomes.getGrowthRate(now)

  tdHud.render({
    now,
    matchState: guardian.matchState,
    currentWave: waves.wave,
    leaderboard,
    getKillsForSlot: (slot) => tomes.getKills(slot),
    hasPendingBoonsForSlot: (slot) => tomes.pendingBoonChoices.has(slot),
    getOverlaySignature: (slotCtx) => {
      const pendingBoons = tomes.pendingBoonChoices.get(slotCtx.player.slot)
      const boonSig = pendingBoons ? pendingBoons.map((b) => b.id).join(',') : ''
      return {
        modalSigExtra: boonSig,
        hudSigExtra: `${waves.waitingForDefenderHero ? 1 : 0};${nextWaveSeconds};${waves.aliveCreepCount};${guardian.currentStage};${guardian.health};${guardian.maxHealth};${guardian.walkerHealth};${guardian.baseGuardiansHealth};${guardian.shrinesHealth};${guardian.patronHealth};${guardian.patronPhase};${guardian.upgradeLevel};${boonSig};${tomes.getTotalTomes(slotCtx.player.slot)};${tomeRateSig};${bossSig}`,
      }
    },
    renderOverlay: (slotCtx) => (
      <TdHudOverlay
        slotCtx={slotCtx}
        waves={waves}
        guardian={guardian}
        tomes={tomes}
        leaderboard={leaderboard}
        onRestart={onRestart}
      />
    ),
  })
}

function TdHudOverlay(props: {
  slotCtx: HudSlotContext
  waves: WaveManager
  guardian: GuardianManager
  tomes: TomeManager
  leaderboard: LeaderboardManager
  onRestart: () => void
}) {
  const { slotCtx, waves, guardian, tomes, leaderboard, onRestart } = props
  const {
    now,
    player,
    compact,
    needsHeroPick,
    boardPage,
    displayWave,
    kills,
  } = slotCtx
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
    ? 'Waiting for Hero Selection · Wave 1 launches 5s after you deploy'
    : `Next: ${nextWaveSeconds}s (Every ${cadenceSec}s) · Alive: ${waves.aliveCreepCount} · HP: ${targetCreepHp} · Dmg: ${damageMult.toFixed(2)}x · Size: ${creepScale.toFixed(2)}x`

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

      {needsHeroPick ? null : compact ? (
        <CompactHudBadge player={player} />
      ) : (
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
        <BoonPickerOverlay
          now={now}
          displayWave={displayWave}
          player={player}
          boons={pendingBoons}
          tomes={tomes}
          structureTarget={guardian}
        />
      ) : null}

      {guardian.matchState === 'defeat' ? (
        <DefeatOverlay
          wave={waves.wave}
          kills={kills}
          playerSlot={player.slot}
          leaderboard={leaderboard}
          boardPage={boardPage}
          onRestart={onRestart}
        />
      ) : null}
    </panel>
  )
}

function CompactHudBadge(props: { player: Player }) {
  return (
    <panel
      style={{
        flow: 'right',
        horizontalAlign: 'left',
        verticalAlign: 'top',
        margin: [110, 0, 0, 20],
      }}
    >
      <Plate
        flow="right"
        style={{ padding: [6, 10, 6, 10], verticalAlign: 'center' }}
      >
        <Action
          kind="secondary"
          style={{ margin: [0, 6, 0, 0] }}
          onPress={(p) => toggleCompactHudForPlayer(p)}
        >
          Full HUD (/hud)
        </Action>
        <Action
          kind="quiet"
          onPress={(p) => toggleLeaderboardForPlayer(p)}
        >
          Standings (/lb)
        </Action>
      </Plate>
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

