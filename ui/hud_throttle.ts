export interface HudPushInput {
  readonly lastSig: string | undefined
  readonly nextSig: string
  readonly lastModalSig: string | undefined
  readonly nextModalSig: string
  readonly nowSeconds: number
  readonly lastSentAtSeconds: number
  readonly minIntervalSeconds?: number
}

/**
 * Gates Panorama HUD updates so modal/state changes render immediately, clock resets self-heal,
 * identical signatures skip redundant work, and sustained updates never exceed ~2 Hz over CEF.
 */
export function shouldPushHudUpdate(opts: HudPushInput): boolean {
  if (
    opts.lastSig === undefined ||
    opts.lastModalSig !== opts.nextModalSig ||
    opts.nowSeconds < opts.lastSentAtSeconds
  ) {
    return true
  }
  if (opts.lastSig === opts.nextSig) {
    return false
  }
  const minInterval = opts.minIntervalSeconds ?? 0.5
  return opts.nowSeconds - opts.lastSentAtSeconds >= minInterval
}

export interface HudCursorInput {
  readonly needsHeroPick: boolean
  readonly hasPendingBoons: boolean
  readonly legendaryShopOpen?: boolean
  readonly leaderboardOpen?: boolean
  readonly matchState: string
}

/**
 * Cursor freeing rules:
 * Free cursor ONLY for blocking Hero selection, Legendary Armory, Leaderboard modals, or Defeat overlay.
 * Interactive mid-combat overlays NEVER force-free the cursor so camera aiming stays uninterrupted.
 */
export function shouldFreeHudCursor(opts: HudCursorInput): boolean {
  return (
    opts.needsHeroPick ||
    Boolean(opts.legendaryShopOpen) ||
    Boolean(opts.leaderboardOpen) ||
    opts.matchState === 'defeat'
  )
}
