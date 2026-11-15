import { ground, type Vector } from 'modlock'

/** Fixed respawn timer in seconds for fallen defender heroes. */
export const HERO_RESPAWN_TIME_SECONDS = 5

export interface DefenderDeathWatch {
  readonly diedAtSeconds: number | undefined
  readonly lastRespawnAttemptAt: number | undefined
}

/** Pure evaluator enforcing a fixed respawn delay for dead defenders and throttling retries. */
export function evaluateDefenderRespawnDue(opts: {
  readonly alive: boolean
  readonly hasHero: boolean
  readonly nowSeconds: number
  readonly diedAtSeconds: number | undefined
  readonly lastRespawnAttemptAt: number | undefined
  readonly respawnDelaySeconds?: number
}): {
  readonly nextDiedAtSeconds: number | undefined
  readonly shouldCallRespawn: boolean
  readonly nextLastRespawnAttemptAt: number | undefined
} {
  if (opts.alive || !opts.hasHero) {
    return {
      nextDiedAtSeconds: undefined,
      shouldCallRespawn: false,
      nextLastRespawnAttemptAt: undefined,
    }
  }
  const delay = Math.max(0.5, opts.respawnDelaySeconds ?? HERO_RESPAWN_TIME_SECONDS)
  const diedAt =
    opts.diedAtSeconds === undefined || opts.nowSeconds < opts.diedAtSeconds
      ? opts.nowSeconds
      : opts.diedAtSeconds
  const due = opts.nowSeconds - diedAt >= delay
  const retryAllowed =
    opts.lastRespawnAttemptAt === undefined ||
    opts.nowSeconds < opts.lastRespawnAttemptAt ||
    opts.nowSeconds - opts.lastRespawnAttemptAt >= 0.5
  if (due && retryAllowed) {
    return {
      nextDiedAtSeconds: diedAt,
      shouldCallRespawn: true,
      nextLastRespawnAttemptAt: opts.nowSeconds,
    }
  }
  return {
    nextDiedAtSeconds: diedAt,
    shouldCallRespawn: false,
    nextLastRespawnAttemptAt: opts.lastRespawnAttemptAt,
  }
}

/** Ground-traces a target anchor so spawned/teleported pawns always land cleanly above the walkable floor mesh. */
export function resolveSafeGroundOrigin(
  rawOrigin: Vector,
  groundFn: (
    point: Vector,
    opts?: { readonly above?: number; readonly below?: number },
  ) => Vector | undefined = ground,
): Vector {
  const floor = groundFn(rawOrigin, { above: 220, below: 512 })
  if (floor) {
    return {
      x: rawOrigin.x,
      y: rawOrigin.y,
      z: Math.max(rawOrigin.z, floor.z + 12),
    }
  }
  return rawOrigin
}
