import { hasClockSteppedBackward } from '@base/clock'

/**
 * Delay after `CCitadelPlayerPawn.m_bHasShopOpen` clears before recreating the custom HUD,
 * tightened to 80 ms so the HUD reappears crisply after the client's 100 ms `gShopOpen` poller
 * while still separating `hide()` and `show()` across server frames.
 */
export const SHOP_CLOSE_HUD_RESTORE_DELAY_SECONDS = 0.08

/**
 * Start of a brief secondary `hideHud(['status'])` pulse after shop close so high-latency
 * clients whose `gShopOpen` uncollapse landed slightly after `+0.08s` still receive a
 * direct `CSGOHud` visibility+layout dirty wake-up without affecting cursor aiming or `levelUp`.
 */
export const SHOP_CLOSE_SECOND_PULSE_START_SECONDS = 0.28

/**
 * Secondary silent keyed-epoch remount after native Buy Menu close so every retained UI
 * node is freshly constructed cleanly after Deadlock's transition animations settle.
 */
export const SHOP_CLOSE_HUD_SETTLE_RESET_SECONDS = 0.38

export interface NativeShopHudState {
  readonly wasShopOpen: boolean
  readonly hiddenForShop: boolean
  readonly closedAtSeconds?: number
  readonly initialRestoreDone: boolean
  readonly secondPulseStarted: boolean
  readonly settleResetDone: boolean
  readonly hudEpoch: number
}

export const INITIAL_NATIVE_SHOP_HUD_STATE: NativeShopHudState = {
  wasShopOpen: false,
  hiddenForShop: false,
  closedAtSeconds: undefined,
  initialRestoreDone: true,
  secondPulseStarted: true,
  settleResetDone: true,
  hudEpoch: 0,
}

export interface NativeShopHudDecision {
  readonly nextState: NativeShopHudState
  readonly suppressShow: boolean
  readonly shouldHideNow: boolean
  readonly closeTransientModals: boolean
  readonly holdStockHudPulse: boolean
  readonly resyncCursorNow: boolean
  readonly bumpedEpoch: boolean
}

export type NativeShopHudSyncDecision = NativeShopHudDecision

function makeSettledNativeShopState(hudEpoch: number): NativeShopHudState {
  return {
    wasShopOpen: false,
    hiddenForShop: false,
    closedAtSeconds: undefined,
    initialRestoreDone: true,
    secondPulseStarted: true,
    settleResetDone: true,
    hudEpoch,
  }
}

function makeNativeShopDecision(
  nextState: NativeShopHudState,
  flags: Partial<Omit<NativeShopHudDecision, 'nextState'>> = {},
): NativeShopHudDecision {
  return {
    nextState,
    suppressShow: flags.suppressShow ?? false,
    shouldHideNow: flags.shouldHideNow ?? false,
    closeTransientModals: flags.closeTransientModals ?? false,
    holdStockHudPulse: flags.holdStockHudPulse ?? false,
    resyncCursorNow: flags.resyncCursorNow ?? false,
    bumpedEpoch: flags.bumpedEpoch ?? false,
  }
}

/**
 * Returns `true` when per-frame polling should wake HUD rendering on the current server frame
 * for a Buy Menu edge or post-close recovery boundary.
 */
export function needsImmediateNativeShopWake(
  prev: NativeShopHudState | undefined,
  nativeShopOpen: boolean,
  nowSeconds: number,
): boolean {
  const state = prev ?? INITIAL_NATIVE_SHOP_HUD_STATE
  if (nativeShopOpen !== state.wasShopOpen) {
    return true
  }
  if (nativeShopOpen) {
    return false
  }
  if (!state.initialRestoreDone) {
    if (
      state.closedAtSeconds === undefined ||
      hasClockSteppedBackward(state.closedAtSeconds, nowSeconds)
    ) {
      return true
    }
    return nowSeconds - state.closedAtSeconds >= SHOP_CLOSE_HUD_RESTORE_DELAY_SECONDS
  }
  if (!state.settleResetDone) {
    if (
      state.closedAtSeconds === undefined ||
      hasClockSteppedBackward(state.closedAtSeconds, nowSeconds)
    ) {
      return true
    }
    const elapsed = nowSeconds - state.closedAtSeconds
    if (elapsed >= SHOP_CLOSE_HUD_SETTLE_RESET_SECONDS) {
      return true
    }
    return !state.secondPulseStarted && elapsed >= SHOP_CLOSE_SECOND_PULSE_START_SECONDS
  }
  return false
}

/**
 * Coordinates custom Panorama HUD hide/restore, `CSGOHud` `hideHud(['status'])` dirty
 * pulses, instant `0ms` cursor aiming passthrough on close, and monotonic keyed-epoch
 * remounts around Deadlock's native Buy Menu (`CCitadelPlayerPawn.m_bHasShopOpen`).
 */
export function evaluateNativeShopHudSync(
  prev: NativeShopHudState | undefined,
  nativeShopOpen: boolean,
  nowSeconds: number,
): NativeShopHudDecision {
  const state = prev ?? INITIAL_NATIVE_SHOP_HUD_STATE

  if (nativeShopOpen) {
    if (!state.wasShopOpen) {
      return makeNativeShopDecision(
        {
          wasShopOpen: true,
          hiddenForShop: true,
          closedAtSeconds: undefined,
          initialRestoreDone: false,
          secondPulseStarted: false,
          settleResetDone: false,
          hudEpoch: state.hudEpoch,
        },
        {
          suppressShow: true,
          shouldHideNow: true,
          closeTransientModals: true,
          holdStockHudPulse: true,
          resyncCursorNow: true,
        },
      )
    }
    return makeNativeShopDecision(state, {
      suppressShow: true,
      holdStockHudPulse: true,
    })
  }

  if (state.wasShopOpen) {
    return makeNativeShopDecision(
      {
        wasShopOpen: false,
        hiddenForShop: true,
        closedAtSeconds: nowSeconds,
        initialRestoreDone: false,
        secondPulseStarted: false,
        settleResetDone: false,
        hudEpoch: state.hudEpoch,
      },
      {
        suppressShow: true,
        holdStockHudPulse: true,
      },
    )
  }

  if (!state.initialRestoreDone) {
    if (
      state.closedAtSeconds === undefined ||
      hasClockSteppedBackward(state.closedAtSeconds, nowSeconds)
    ) {
      return makeNativeShopDecision(makeSettledNativeShopState(state.hudEpoch + 1), {
        resyncCursorNow: true,
        bumpedEpoch: true,
      })
    }
    const elapsed = nowSeconds - state.closedAtSeconds
    if (elapsed < SHOP_CLOSE_HUD_RESTORE_DELAY_SECONDS) {
      return makeNativeShopDecision(state, {
        suppressShow: true,
        holdStockHudPulse: true,
      })
    }

    const nextEpoch = state.hudEpoch + 1
    if (elapsed >= SHOP_CLOSE_HUD_SETTLE_RESET_SECONDS) {
      return makeNativeShopDecision(makeSettledNativeShopState(nextEpoch), {
        resyncCursorNow: true,
        bumpedEpoch: true,
      })
    }
    const pulseActive = elapsed >= SHOP_CLOSE_SECOND_PULSE_START_SECONDS
    return makeNativeShopDecision(
      {
        wasShopOpen: false,
        hiddenForShop: false,
        closedAtSeconds: state.closedAtSeconds,
        initialRestoreDone: true,
        secondPulseStarted: pulseActive,
        settleResetDone: false,
        hudEpoch: nextEpoch,
      },
      {
        holdStockHudPulse: pulseActive,
        resyncCursorNow: true,
        bumpedEpoch: true,
      },
    )
  }

  if (!state.settleResetDone) {
    if (
      state.closedAtSeconds === undefined ||
      hasClockSteppedBackward(state.closedAtSeconds, nowSeconds) ||
      nowSeconds - state.closedAtSeconds >= SHOP_CLOSE_HUD_SETTLE_RESET_SECONDS
    ) {
      return makeNativeShopDecision(makeSettledNativeShopState(state.hudEpoch + 1), {
        bumpedEpoch: true,
      })
    }
    const elapsed = nowSeconds - state.closedAtSeconds
    if (elapsed >= SHOP_CLOSE_SECOND_PULSE_START_SECONDS) {
      const nextState = state.secondPulseStarted
        ? state
        : {
            wasShopOpen: false,
            hiddenForShop: false,
            closedAtSeconds: state.closedAtSeconds,
            initialRestoreDone: true,
            secondPulseStarted: true,
            settleResetDone: false,
            hudEpoch: state.hudEpoch,
          }
      return makeNativeShopDecision(nextState, {
        holdStockHudPulse: true,
      })
    }
    return makeNativeShopDecision(state)
  }

  return makeNativeShopDecision(state)
}
