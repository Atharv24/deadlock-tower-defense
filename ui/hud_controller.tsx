import {
  type BoardPage,
  type BoardWindow,
  type Child,
  cursorFree,
  freeCursor,
  type Hero,
  hide,
  hideHud,
  log,
  type Player,
  players,
  readField,
  show,
  toast,
} from 'modlock'
import type { LeaderboardManager } from '@components/scores'

import { HudStateStore } from './hud_state'
import { shouldFreeHudCursor, shouldPushHudUpdate } from './hud_throttle'
import { HeroPickerModal } from './modals/hero_picker'
import { LeaderboardModal } from './modals/leaderboard_modal'
import {
  LEGENDARY_ITEMS,
  LegendaryArmoryModal,
} from './modals/legendary_armory'
import {
  evaluateNativeShopHudSync,
  needsImmediateNativeShopWake,
  shouldPollNativeShopState,
} from './shop_sync'

function readPlayerNativeShopOpen(
  player: Player,
  knownPawnEntity = 0,
): boolean {
  if (knownPawnEntity > 0) {
    const cachedVal = readField(
      knownPawnEntity,
      'CCitadelPlayerPawn',
      'm_bHasShopOpen',
      'bool',
    )
    if (typeof cachedVal === 'boolean') {
      return cachedVal
    }
  }
  const pawn = player.pawn()
  return (
    pawn !== undefined &&
    readField(pawn.entity, 'CCitadelPlayerPawn', 'm_bHasShopOpen', 'bool') ===
      true
  )
}

export interface HudSlotContext {
  readonly hudEpoch: number
  readonly now: number
  readonly player: Player
  readonly compact: boolean
  readonly needsHeroPick: boolean
  readonly canCancelHeroPick: boolean
  readonly legendaryShopOpen: boolean
  readonly leaderboardOpen: boolean
  readonly leaderboardWindow: BoardWindow
  readonly boardPage: BoardPage | undefined
  readonly playerSouls: number
  readonly ownedLegendaryNames: readonly string[]
  readonly displayWave: number
  readonly kills: number
}

export interface HudControllerOptions {
  readonly team?: number
  readonly hudModeSettingKey?: string
  readonly heroDeployTeamName?: string
  readonly state?: HudStateStore
}

export interface HudRenderRequest {
  readonly now: number
  readonly matchState: string
  readonly currentWave: number
  readonly leaderboard: LeaderboardManager
  readonly getKillsForSlot: (slot: number) => number
  readonly hasPendingBoonsForSlot?: (slot: number) => boolean
  readonly getOverlaySignature: (slot: HudSlotContext) => {
    readonly modalSigExtra: string
    readonly hudSigExtra: string
  }
  readonly renderOverlay: (slot: HudSlotContext) => Child
  readonly heroPickerTitle?: string
  readonly heroPickerSubtitle?: string
  readonly leaderboardTitle?: string
}

/**
 * Shared Panorama HUD lifecycle controller handling native Buy Menu collapse/restore,
 * `freeCursor` synchronization, 2 Hz push throttling, per-slot epoch remounts, and
 * standard shared modals (`HeroPickerModal`, `LegendaryArmoryModal`, `LeaderboardModal`).
 */
export class HudController {
  readonly state: HudStateStore
  readonly team: number
  readonly hudModeSettingKey: string
  readonly heroDeployTeamName: string
  private lastShopPollAt = -999

  constructor(options?: HudControllerOptions) {
    this.state = options?.state ?? new HudStateStore()
    this.team = options?.team ?? 2
    this.hudModeSettingKey = options?.hudModeSettingKey ?? 'hud_mode'
    this.heroDeployTeamName = options?.heroDeployTeamName ?? 'The Hidden King'
  }

  /**
   * Checks human players on a throttled cadence (`~12.5 Hz` idle, `~33 Hz` while open
   * or settling) so rapid Buy Menu (`m_bHasShopOpen`) edges wake HUD rendering promptly
   * without scanning `player.pawn()` 64 times per second when idle.
   */
  pollNativeShopStateEveryFrame(
    now: number,
    knownPawnBySlot?: ReadonlyMap<number, number>,
  ): void {
    let hasActiveTransition = false
    for (const shopState of this.state.nativeShopHudBySlot.values()) {
      if (shopState.wasShopOpen || !shopState.settleResetDone) {
        hasActiveTransition = true
        break
      }
    }
    if (
      !shouldPollNativeShopState({
        nowSeconds: now,
        lastPollAtSeconds: this.lastShopPollAt,
        hasActiveTransition,
      })
    ) {
      return
    }
    this.lastShopPollAt = now

    for (const conn of players()) {
      if (!conn.ready || conn.bot) {
        continue
      }
      const slot = conn.player.slot
      const knownPawnEntity = knownPawnBySlot?.get(slot) ?? 0
      const open = readPlayerNativeShopOpen(conn.player, knownPawnEntity)
      if (
        needsImmediateNativeShopWake(
          this.state.nativeShopHudBySlot.get(slot),
          open,
          now,
        )
      ) {
        this.state.requestImmediateHudSync()
        return
      }
    }
  }

  requestImmediateHudSync(): void {
    this.state.requestImmediateHudSync()
  }

  consumeImmediateHudSync(): boolean {
    return this.state.consumeImmediateHudSync()
  }

  resetTransientState(): void {
    this.lastShopPollAt = -999
    this.state.resetTransientState()
  }

  resetForNewWorld(): void {
    this.lastShopPollAt = -999
    this.state.resetForNewWorld()
  }

  markRestoredFromHandoff(awaitingSlots?: readonly number[]): void {
    this.state.markRestoredFromHandoff(awaitingSlots)
  }

  exportAwaitingHeroPickSlots(): number[] {
    return this.state.exportAwaitingHeroPickSlots()
  }

  requireInitialHeroPickForPlayer(player: Player): void {
    this.state.requireInitialHeroPickForSlot(player.slot)
  }

  isAwaitingInitialHeroPick(slot: number): boolean {
    return this.state.isAwaitingInitialHeroPick(slot)
  }

  handleClockBackstep(): void {
    this.lastShopPollAt = -999
    this.state.handleClockBackstep()
  }

  invalidateSettingCache(slot?: number): void {
    this.state.invalidateSettingCache(slot)
  }

  toggleCompactHudForPlayer(player: Player): 'full' | 'compact' {
    const cur = player.setting(this.hudModeSettingKey) ?? 'full'
    const next: 'full' | 'compact' = cur === 'compact' ? 'full' : 'compact'
    player.setSetting(this.hudModeSettingKey, next)
    this.state.cachedHudModeBySlot.set(player.slot, {
      mode: next,
      expiresAt: -1,
    })
    this.state.clearPushSignatures(player.slot)
    this.state.requestImmediateHudSync()
    toast(
      player,
      next === 'full'
        ? 'Switched to Full Tower Defense HUD (/hud).'
        : 'Switched to Compact HUD (/hud to expand).',
    )
    return next
  }

  consumeHeroReselectPlacementReset(slot: number): boolean {
    return this.state.consumeHeroReselectPlacementReset(slot)
  }

  openHeroPickerForPlayer(player: Player): void {
    this.state.openHeroPicker(player.slot)
  }

  toggleLegendaryShopForPlayer(
    player: Player,
    forceOpen?: boolean,
  ): boolean {
    return this.state.toggleLegendaryShop(player.slot, forceOpen)
  }

  toggleLeaderboardForPlayer(player: Player, forceOpen?: boolean): boolean {
    return this.state.toggleLeaderboard(player.slot, forceOpen)
  }

  selectDefenderHero(player: Player, hero: Hero, now: number): void {
    this.state.markHeroSelected(player.slot, now)
    player.selectHero(hero.name, this.team)
    toast(player, `Deploying as ${hero.title} (${this.heroDeployTeamName})!`)
  }

  render(req: HudRenderRequest): void {
    const {
      now,
      matchState,
      currentWave,
      leaderboard,
      getKillsForSlot,
      hasPendingBoonsForSlot,
      getOverlaySignature,
      renderOverlay,
      heroPickerTitle,
      heroPickerSubtitle,
      leaderboardTitle,
    } = req

    if (this.state.forceAllTreeResets) {
      this.state.forceAllTreeResets = false
      for (const conn of players()) {
        if (!conn.bot) {
          this.state.forceTreeResetSlots.add(conn.player.slot)
          hideHud(conn.player, [])
        }
      }
    }

    let sawReadyHuman = false
    for (const conn of players()) {
      const isProbeDefender =
        leaderboard.isProbeMode &&
        conn.bot &&
        conn.player.pawn()?.team === this.team
      if ((!conn.ready || conn.bot) && !isProbeDefender) {
        continue
      }
      if (!conn.bot && conn.ready) {
        sawReadyHuman = true
      }
      const player = conn.player
      try {
        const pawn = player.pawn()
        const suppressInitialHeroPick =
          conn.bot ||
          isProbeDefender ||
          (this.state.restoringFromHandoff &&
            !this.state.handoffAwaitingHeroPickSlots.has(player.slot) &&
            Boolean(pawn && pawn.hero > 0 && pawn.team === this.team))
        if (
          this.state.syncConnectionGeneration(player.slot, conn.generation, {
            suppressInitialHeroPick,
          })
        ) {
          if (!conn.bot) {
            hide(player)
            hideHud(player, [])
            this.state.bumpManualHudEpoch(player.slot)
          }
        }

        if (pawn && pawn.hero > 0 && pawn.team === this.team) {
          this.state.spawnedHeroSlots.add(player.slot)
          this.state.pendingHeroPickUntil.delete(player.slot)
        }

        const nativeShopOpen =
          !conn.bot && readPlayerNativeShopOpen(player, pawn?.entity ?? 0)
        const prevShopState = this.state.nativeShopHudBySlot.get(player.slot)
        const shopSync = evaluateNativeShopHudSync(
          prevShopState,
          nativeShopOpen,
          now,
        )
        this.state.nativeShopHudBySlot.set(player.slot, shopSync.nextState)
        if (shopSync.closeTransientModals) {
          this.state.closeTransientModals(player.slot)
        }

        const pickUntil = this.state.pendingHeroPickUntil.get(player.slot)
        if (pickUntil !== undefined && pickUntil - now > 7) {
          this.state.pendingHeroPickUntil.delete(player.slot)
        }
        const isPickingInFlight =
          (this.state.pendingHeroPickUntil.get(player.slot) ?? 0) > now
        const hasSpawnedOnce = this.state.spawnedHeroSlots.has(player.slot)
        const isInitialHeroPick = this.state.isAwaitingInitialHeroPick(
          player.slot,
        )
        const needsHeroPick =
          isInitialHeroPick ||
          this.state.forceHeroPickerSlots.has(player.slot) ||
          (!isPickingInFlight && !hasSpawnedOnce && (!pawn || pawn.hero === 0))
        if (needsHeroPick) {
          this.state.closeTransientModals(player.slot)
        }
        const legendaryShopOpen =
          !needsHeroPick && this.state.legendaryShopSlots.has(player.slot)
        const leaderboardOpen =
          !needsHeroPick && this.state.leaderboardOpenSlots.has(player.slot)
        const lbWindow: BoardWindow =
          this.state.leaderboardWindowBySlot.get(player.slot) ?? 'allTime'

        const needsCursor = shouldFreeHudCursor({
          needsHeroPick,
          hasPendingBoons: Boolean(hasPendingBoonsForSlot?.(player.slot)),
          legendaryShopOpen,
          leaderboardOpen,
          matchState,
        })

        if (shopSync.shouldHideNow) {
          this.state.clearPushSignatures(player.slot)
          this.state.lastCursorKeyBySlot.delete(player.slot)
          this.state.lastStockHudPulseBySlot.delete(player.slot)
          if (!conn.bot) {
            hide(player)
            freeCursor(player, false)
            this.state.lastCursorKeyBySlot.set(player.slot, 'false')
          }
        }

        const prevPulse = this.state.lastStockHudPulseBySlot.get(player.slot)
        if (!conn.bot) {
          if (shopSync.holdStockHudPulse && prevPulse !== true) {
            hideHud(player, ['status'])
            this.state.lastStockHudPulseBySlot.set(player.slot, true)
          } else if (!shopSync.holdStockHudPulse && prevPulse === true) {
            hideHud(player, [])
            this.state.lastStockHudPulseBySlot.set(player.slot, false)
          }
        }

        if (
          leaderboard.isLocalDev &&
          !conn.bot &&
          (shopSync.shouldHideNow ||
            (prevShopState?.wasShopOpen ?? false) !==
              shopSync.nextState.wasShopOpen ||
            shopSync.bumpedEpoch ||
            (prevPulse ?? false) !== shopSync.holdStockHudPulse)
        ) {
          log(
            `[shop-hud] slot=${player.slot} t=${now.toFixed(2)} shopOpen=${nativeShopOpen} suppress=${shopSync.suppressShow} hideNow=${shopSync.shouldHideNow} resyncCursor=${shopSync.resyncCursorNow} stockPulse=${shopSync.holdStockHudPulse} epoch=${shopSync.nextState.hudEpoch} needsCursor=${needsCursor} hostCursorFree=${String(cursorFree(player))}`,
          )
        }

        if (shopSync.suppressShow) {
          continue
        }
        if (shopSync.resyncCursorNow && needsCursor) {
          this.state.lastCursorKeyBySlot.delete(player.slot)
        }
        if (this.state.forceTreeResetSlots.delete(player.slot)) {
          if (!conn.bot) {
            this.state.bumpManualHudEpoch(player.slot)
          }
          this.state.lastCursorKeyBySlot.delete(player.slot)
          this.state.clearPushSignatures(player.slot)
        }
        if (shopSync.bumpedEpoch) {
          this.state.clearPushSignatures(player.slot)
        }

        const effectiveHudEpoch =
          shopSync.nextState.hudEpoch +
          (this.state.manualHudEpochBySlot.get(player.slot) ?? 0)
        const canCancelHeroPick = Boolean(pawn && pawn.hero > 0)
        const compact = this.state.getCachedCompactMode(player.slot, now, () =>
          player.setting(this.hudModeSettingKey),
        )
        const displayWave = Math.max(1, currentWave)
        const kills = getKillsForSlot(player.slot)
        const searchSig = needsHeroPick
          ? (this.state.heroSearchBySlot.get(player.slot) ?? '')
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
          leaderboardOpen || matchState === 'defeat'
            ? leaderboard.getBoardSnapshot(player, lbWindow, now)
            : undefined
        const boardAcceptSig = `${
          leaderboard.lastReportAccepted === undefined
            ? 'u'
            : leaderboard.lastReportAccepted
              ? '1'
              : '0'
        }:${leaderboard.acceptedReportsCount}`
        const boardSig = `${leaderboardOpen ? 1 : 0}:${leaderboard.isLocalDev ? 1 : 0}:${lbWindow}:${leaderboard.rankedEligible ? 1 : 0}:${leaderboard.disqualifyReason ?? ''}:${boardAcceptSig}:${
          boardPage
            ? `${boardPage.loading ? 1 : 0}:${boardPage.player?.rank ?? 0}:${boardPage.player?.value ?? 0}:${boardPage.rows.map((r) => `${r.rank},${r.value},${r.tiebreak},${r.name}`).join('|')}`
            : 'local'
        }`

        const slotCtx: HudSlotContext = {
          hudEpoch: effectiveHudEpoch,
          now,
          player,
          compact,
          needsHeroPick,
          canCancelHeroPick,
          legendaryShopOpen,
          leaderboardOpen,
          leaderboardWindow: lbWindow,
          boardPage,
          playerSouls,
          ownedLegendaryNames,
          displayWave,
          kills,
        }
        const extraSig = getOverlaySignature(slotCtx)
        const modalSig = `${needsHeroPick ? 1 : 0};${canCancelHeroPick ? 1 : 0};${searchSig};${extraSig.modalSigExtra};${legendaryShopOpen ? 1 : 0};${shopSig};${leaderboardOpen ? `1:${boardAcceptSig}` : '0'};${lbWindow};${matchState};${compact ? 1 : 0};${pawn?.entity ?? 0};${pawn?.hero ?? 0};${isInitialHeroPick ? 1 : 0};${effectiveHudEpoch}`
        const hudSig = `${displayWave};${matchState};${compact ? 1 : 0};${needsHeroPick ? 1 : 0};${canCancelHeroPick ? 1 : 0};${pawn?.entity ?? 0};${pawn?.hero ?? 0};${isInitialHeroPick ? 1 : 0};${shopSig};${boardSig};${searchSig};${kills};${extraSig.hudSigExtra};${effectiveHudEpoch}`

        const lastSentAt = this.state.lastHudSentAtBySlot.get(player.slot) ?? -999
        const willPush = shouldPushHudUpdate({
          lastSig: this.state.lastHudSigBySlot.get(player.slot),
          nextSig: hudSig,
          lastModalSig: this.state.lastModalSigBySlot.get(player.slot),
          nextModalSig: modalSig,
          nowSeconds: now,
          lastSentAtSeconds: lastSentAt,
          minIntervalSeconds: 0.5,
        })

        const cursorKey = needsCursor ? `true:${pawn?.entity ?? 0}` : 'false'
        if (this.state.lastCursorKeyBySlot.get(player.slot) !== cursorKey) {
          this.state.lastCursorKeyBySlot.set(player.slot, cursorKey)
          if (!conn.bot) {
            freeCursor(player, needsCursor)
          }
        }

        if (!willPush) {
          continue
        }

        const shown = show(
          player,
          <panel style={{ width: 'fill', height: 'fill' }}>
            {[
              <panel
                key={`hud-epoch-${effectiveHudEpoch}`}
                style={{ width: 'fill', height: 'fill' }}
              >
                {renderOverlay(slotCtx)}

                {needsHeroPick ? (
                  <HeroPickerModal
                    now={now}
                    player={player}
                    canCancel={canCancelHeroPick}
                    state={this.state}
                    title={heroPickerTitle}
                    subtitle={heroPickerSubtitle}
                    onSelectHero={(p, h, t) => this.selectDefenderHero(p, h, t)}
                  />
                ) : null}

                {legendaryShopOpen ? (
                  <LegendaryArmoryModal
                    player={player}
                    souls={playerSouls}
                    ownedNames={ownedLegendaryNames}
                    state={this.state}
                    requiredTeam={this.team}
                  />
                ) : null}

                {leaderboardOpen ? (
                  <LeaderboardModal
                    player={player}
                    window={lbWindow}
                    leaderboard={leaderboard}
                    boardPage={boardPage}
                    currentWave={displayWave}
                    currentKills={kills}
                    state={this.state}
                    title={leaderboardTitle}
                  />
                ) : null}
              </panel>,
            ]}
          </panel>,
        )
        if (shown) {
          this.state.lastHudSigBySlot.set(player.slot, hudSig)
          this.state.lastModalSigBySlot.set(player.slot, modalSig)
          this.state.lastHudSentAtBySlot.set(player.slot, now)
        } else {
          this.state.lastHudSigBySlot.delete(player.slot)
          this.state.lastModalSigBySlot.delete(player.slot)
          this.state.lastCursorKeyBySlot.delete(player.slot)
          if (!conn.bot) {
            this.state.forceTreeResetSlots.add(player.slot)
          }
          log(`HUD show() returned false for slot ${player.slot}; queued tree reset`)
        }
      } catch (err) {
        this.state.lastHudSigBySlot.delete(player.slot)
        this.state.lastModalSigBySlot.delete(player.slot)
        log(`HUD render error for slot ${player.slot}: ${String(err)}`)
      }
    }

    if (this.state.restoringFromHandoff && sawReadyHuman) {
      this.state.restoringFromHandoff = false
      this.state.handoffAwaitingHeroPickSlots.clear()
    }
  }
}
