import type { BoardWindow } from 'modlock'
import type { NativeShopHudState } from './shop_sync'

/**
 * Pure per-slot transient UI state manager for `HudController` and shared modals.
 * Isolated in a `.ts` module (no JSX) so Node unit suites can test state transitions directly.
 */
export class HudStateStore {
  requireInitialHeroPick = true
  restoringFromHandoff = false
  readonly initialHeroPickPendingSlots = new Set<number>()
  readonly handoffAwaitingHeroPickSlots = new Set<number>()
  readonly connectedGenerations = new Map<number, number>()
  readonly spawnedHeroSlots = new Set<number>()
  readonly forceHeroPickerSlots = new Set<number>()
  readonly heroReselectSlots = new Set<number>()
  readonly legendaryShopSlots = new Set<number>()
  readonly leaderboardOpenSlots = new Set<number>()
  readonly leaderboardWindowBySlot = new Map<number, BoardWindow>()
  readonly pendingHeroPickUntil = new Map<number, number>()
  readonly heroSearchBySlot = new Map<number, string>()
  readonly lastCursorKeyBySlot = new Map<number, string>()
  readonly lastHudSigBySlot = new Map<number, string>()
  readonly lastModalSigBySlot = new Map<number, string>()
  readonly lastHudSentAtBySlot = new Map<number, number>()
  readonly cachedHudModeBySlot = new Map<number, { mode: string; expiresAt: number }>()
  readonly nativeShopHudBySlot = new Map<number, NativeShopHudState>()
  readonly lastStockHudPulseBySlot = new Map<number, boolean>()
  readonly manualHudEpochBySlot = new Map<number, number>()
  readonly forceTreeResetSlots = new Set<number>()
  forceAllTreeResets = false
  immediateHudSyncRequested = true

  bumpManualHudEpoch(slot: number): number {
    const next = (this.manualHudEpochBySlot.get(slot) ?? 0) + 1
    this.manualHudEpochBySlot.set(slot, next)
    return next
  }

  requestImmediateHudSync(): void {
    this.immediateHudSyncRequested = true
  }

  consumeImmediateHudSync(): boolean {
    const requested = this.immediateHudSyncRequested
    this.immediateHudSyncRequested = false
    return requested
  }

  clearPushSignatures(slot: number): void {
    this.lastHudSigBySlot.delete(slot)
    this.lastModalSigBySlot.delete(slot)
    this.lastHudSentAtBySlot.delete(slot)
  }

  /** Clears transient per-world HUD state so clock resets never strand modals or caches. */
  resetTransientState(): void {
    this.pendingHeroPickUntil.clear()
    this.legendaryShopSlots.clear()
    this.leaderboardOpenSlots.clear()
    this.forceHeroPickerSlots.clear()
    this.initialHeroPickPendingSlots.clear()
    this.heroReselectSlots.clear()
    this.lastCursorKeyBySlot.clear()
    this.lastHudSigBySlot.clear()
    this.lastModalSigBySlot.clear()
    this.lastHudSentAtBySlot.clear()
    this.cachedHudModeBySlot.clear()
    this.nativeShopHudBySlot.clear()
    this.lastStockHudPulseBySlot.clear()
    this.forceAllTreeResets = true
    this.immediateHudSyncRequested = true
  }

  /** Resets both transient HUD state and per-connection hero tracking for a fresh world. */
  resetForNewWorld(): void {
    this.resetTransientState()
    this.connectedGenerations.clear()
    this.spawnedHeroSlots.clear()
    this.restoringFromHandoff = false
    this.handoffAwaitingHeroPickSlots.clear()
  }

  /** Records hot-reload handoff restoration so active defenders do not re-open the Hero Picker. */
  markRestoredFromHandoff(awaitingSlots?: readonly number[]): void {
    this.restoringFromHandoff = true
    this.handoffAwaitingHeroPickSlots.clear()
    for (const slot of awaitingSlots ?? []) {
      this.handoffAwaitingHeroPickSlots.add(slot)
    }
  }

  exportAwaitingHeroPickSlots(): number[] {
    return [...this.initialHeroPickPendingSlots].sort((a, b) => a - b)
  }

  requireInitialHeroPickForSlot(slot: number): void {
    this.legendaryShopSlots.delete(slot)
    this.leaderboardOpenSlots.delete(slot)
    this.initialHeroPickPendingSlots.add(slot)
    this.forceHeroPickerSlots.add(slot)
    this.clearPushSignatures(slot)
    this.immediateHudSyncRequested = true
  }

  isAwaitingInitialHeroPick(slot: number): boolean {
    return this.initialHeroPickPendingSlots.has(slot)
  }

  /** Reconciles HUD timestamps and forces a clean screen rebuild after a server clock backstep. */
  handleClockBackstep(): void {
    this.pendingHeroPickUntil.clear()
    this.lastHudSigBySlot.clear()
    this.lastModalSigBySlot.clear()
    this.lastHudSentAtBySlot.clear()
    this.cachedHudModeBySlot.clear()
    this.nativeShopHudBySlot.clear()
    this.lastStockHudPulseBySlot.clear()
    this.forceAllTreeResets = true
    this.immediateHudSyncRequested = true
  }

  /** Invalidates cached `hud_mode` and push throttles for `slot` (or all slots when omitted). */
  invalidateSettingCache(slot?: number): void {
    if (slot === undefined) {
      this.cachedHudModeBySlot.clear()
      this.lastHudSigBySlot.clear()
      this.lastModalSigBySlot.clear()
      this.lastHudSentAtBySlot.clear()
    } else {
      this.cachedHudModeBySlot.delete(slot)
      this.clearPushSignatures(slot)
    }
    this.immediateHudSyncRequested = true
  }

  /** Resets per-slot state when a player's `connection.generation` changes; returns true if reset. */
  syncConnectionGeneration(
    slot: number,
    generation: number,
    options?: { suppressInitialHeroPick?: boolean },
  ): boolean {
    if (this.connectedGenerations.get(slot) === generation) {
      return false
    }
    const hadPreviousGeneration = this.connectedGenerations.has(slot)
    this.connectedGenerations.set(slot, generation)
    this.spawnedHeroSlots.delete(slot)
    this.legendaryShopSlots.delete(slot)
    this.leaderboardOpenSlots.delete(slot)
    this.leaderboardWindowBySlot.delete(slot)
    this.pendingHeroPickUntil.delete(slot)
    this.heroSearchBySlot.delete(slot)
    this.lastCursorKeyBySlot.delete(slot)
    this.clearPushSignatures(slot)
    this.cachedHudModeBySlot.delete(slot)
    this.nativeShopHudBySlot.delete(slot)
    this.lastStockHudPulseBySlot.delete(slot)
    if (this.requireInitialHeroPick && !options?.suppressInitialHeroPick) {
      this.initialHeroPickPendingSlots.add(slot)
      this.forceHeroPickerSlots.add(slot)
    } else {
      this.initialHeroPickPendingSlots.delete(slot)
      if (hadPreviousGeneration || options?.suppressInitialHeroPick) {
        this.forceHeroPickerSlots.delete(slot)
      }
    }
    return true
  }

  consumeHeroReselectPlacementReset(slot: number): boolean {
    return this.heroReselectSlots.delete(slot)
  }

  openHeroPicker(slot: number): void {
    this.legendaryShopSlots.delete(slot)
    this.leaderboardOpenSlots.delete(slot)
    this.forceHeroPickerSlots.add(slot)
    this.clearPushSignatures(slot)
    this.immediateHudSyncRequested = true
  }

  closeHeroPicker(slot: number): void {
    this.forceHeroPickerSlots.delete(slot)
    this.initialHeroPickPendingSlots.delete(slot)
    this.clearPushSignatures(slot)
    this.immediateHudSyncRequested = true
  }

  markHeroSelected(slot: number, now: number): void {
    this.forceHeroPickerSlots.delete(slot)
    this.initialHeroPickPendingSlots.delete(slot)
    this.heroSearchBySlot.delete(slot)
    this.heroReselectSlots.add(slot)
    this.pendingHeroPickUntil.set(slot, now + 6)
    this.clearPushSignatures(slot)
    this.immediateHudSyncRequested = true
  }

  setHeroSearch(slot: number, text: string): void {
    if (text.length === 0) {
      this.heroSearchBySlot.delete(slot)
    } else {
      this.heroSearchBySlot.set(slot, text)
    }
    this.immediateHudSyncRequested = true
  }

  toggleLegendaryShop(slot: number, forceOpen?: boolean): boolean {
    const shouldOpen = forceOpen ?? !this.legendaryShopSlots.has(slot)
    if (shouldOpen) {
      this.leaderboardOpenSlots.delete(slot)
      this.legendaryShopSlots.add(slot)
    } else {
      this.legendaryShopSlots.delete(slot)
    }
    this.clearPushSignatures(slot)
    this.immediateHudSyncRequested = true
    return shouldOpen
  }

  toggleLeaderboard(slot: number, forceOpen?: boolean): boolean {
    const shouldOpen = forceOpen ?? !this.leaderboardOpenSlots.has(slot)
    if (shouldOpen) {
      this.legendaryShopSlots.delete(slot)
      this.leaderboardOpenSlots.add(slot)
    } else {
      this.leaderboardOpenSlots.delete(slot)
    }
    this.clearPushSignatures(slot)
    this.immediateHudSyncRequested = true
    return shouldOpen
  }

  setLeaderboardWindow(slot: number, window: BoardWindow): void {
    this.leaderboardWindowBySlot.set(slot, window)
    this.clearPushSignatures(slot)
    this.immediateHudSyncRequested = true
  }

  closeTransientModals(slot: number): void {
    this.legendaryShopSlots.delete(slot)
    this.leaderboardOpenSlots.delete(slot)
  }

  getCachedCompactMode(
    slot: number,
    now: number,
    readSetting: () => string | undefined,
  ): boolean {
    const cached = this.cachedHudModeBySlot.get(slot)
    if (
      cached &&
      cached.expiresAt > 0 &&
      now < cached.expiresAt &&
      now + 2.0 >= cached.expiresAt
    ) {
      return cached.mode === 'compact'
    }
    const mode = readSetting() ?? 'full'
    this.cachedHudModeBySlot.set(slot, { mode, expiresAt: now + 2.0 })
    return mode === 'compact'
  }
}
