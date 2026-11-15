/** Seconds with 0 connected human players (after at least 1 human joined) before resetting or quitting. */
export const EMPTY_SERVER_SHUTDOWN_DELAY_SECONDS = 3

export interface EmptyServerWatchState {
  readonly hasSeenHuman: boolean
  readonly emptySinceSeconds?: number
  readonly quitIssued: boolean
}

export type EmptyServerShutdownInput = EmptyServerWatchState

export interface EmptyServerShutdownDecision {
  readonly nextState: EmptyServerWatchState
  readonly shouldQuit: boolean
  readonly shouldResetMatch: boolean
}

/**
 * Evaluates empty-server cleanup after all human players disconnect for `delaySeconds`
 * (default 3s so async score/metric RPCs finish cleanly):
 * - When `allowProcessQuit` is `true` (local `--arg dev`), emits `shouldQuit: true` once.
 * - When `allowProcessQuit` is `false` (hosted server), emits `shouldResetMatch: true` once
 *   and returns to idle (`hasSeenHuman: false`) ready for the next join without dropping the host process.
 */
export function evaluateEmptyServerShutdown(
  state: EmptyServerWatchState,
  humanPlayerCount: number,
  nowSeconds: number,
  isProbeMode: boolean,
  delaySeconds = EMPTY_SERVER_SHUTDOWN_DELAY_SECONDS,
  allowProcessQuit = false,
): EmptyServerShutdownDecision {
  if (isProbeMode || state.quitIssued) {
    return { nextState: state, shouldQuit: false, shouldResetMatch: false }
  }
  if (humanPlayerCount > 0) {
    if (state.hasSeenHuman && state.emptySinceSeconds === undefined) {
      return { nextState: state, shouldQuit: false, shouldResetMatch: false }
    }
    return {
      nextState: {
        hasSeenHuman: true,
        emptySinceSeconds: undefined,
        quitIssued: false,
      },
      shouldQuit: false,
      shouldResetMatch: false,
    }
  }
  if (!state.hasSeenHuman) {
    return { nextState: state, shouldQuit: false, shouldResetMatch: false }
  }
  const emptySince =
    state.emptySinceSeconds === undefined || nowSeconds < state.emptySinceSeconds
      ? nowSeconds
      : state.emptySinceSeconds
  if (nowSeconds - emptySince >= delaySeconds) {
    if (allowProcessQuit) {
      return {
        nextState: {
          hasSeenHuman: true,
          emptySinceSeconds: emptySince,
          quitIssued: true,
        },
        shouldQuit: true,
        shouldResetMatch: false,
      }
    }
    return {
      nextState: {
        hasSeenHuman: false,
        emptySinceSeconds: undefined,
        quitIssued: false,
      },
      shouldQuit: false,
      shouldResetMatch: true,
    }
  }
  if (state.emptySinceSeconds === emptySince) {
    return { nextState: state, shouldQuit: false, shouldResetMatch: false }
  }
  return {
    nextState: {
      hasSeenHuman: true,
      emptySinceSeconds: emptySince,
      quitIssued: false,
    },
    shouldQuit: false,
    shouldResetMatch: false,
  }
}
