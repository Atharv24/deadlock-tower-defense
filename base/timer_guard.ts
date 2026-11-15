/** Isolates repeating timer errors so Modlock's timer loop never permanently cancels on a thrown error. */
export function runTimerSafely(
  label: string,
  fn: () => void,
  onError?: (message: string) => void,
): void {
  try {
    fn()
  } catch (err) {
    onError?.(`Timer [${label}] error: ${String(err)}`)
  }
}

export interface CadenceTaskSpec {
  readonly name: string
  readonly intervalSeconds: number
  readonly phaseOffsetSeconds?: number
  readonly enabled?: () => boolean
  readonly run: () => void
}

/**
 * Staggers periodic tasks across 64 Hz server ticks by executing at most one
 * due enabled task per frame (always selecting the earliest overdue task so
 * higher-frequency jobs cannot starve lower-frequency ones).
 */
export class FrameCadenceScheduler {
  private readonly tasks: Array<{
    readonly spec: CadenceTaskSpec
    nextDueAt: number
  }>

  constructor(specs: readonly CadenceTaskSpec[], startNowSeconds = 0) {
    this.tasks = specs.map((spec) => ({
      spec,
      nextDueAt: startNowSeconds + (spec.phaseOffsetSeconds ?? 0),
    }))
  }

  /** Resets all task deadlines relative to `nowSeconds` (used on world start and clock backstep). */
  reset(nowSeconds = 0): void {
    for (const entry of this.tasks) {
      entry.nextDueAt = nowSeconds + (entry.spec.phaseOffsetSeconds ?? 0)
    }
  }

  /** Records an out-of-band execution so a task does not run again within its interval. */
  markRan(name: string, nowSeconds: number): void {
    for (const entry of this.tasks) {
      if (entry.spec.name === name) {
        entry.nextDueAt = nowSeconds + entry.spec.intervalSeconds
        return
      }
    }
  }

  /**
   * Executes at most one overdue enabled task (`nextDueAt <= nowSeconds`, choosing
   * the earliest deadline), advances its schedule without cumulative drift, and
   * returns its `name` (or `undefined` when no task is due).
   */
  runNextDue(
    nowSeconds: number,
    runner?: (name: string, fn: () => void) => void,
  ): string | undefined {
    let chosen: (typeof this.tasks)[number] | undefined
    for (const entry of this.tasks) {
      if (entry.spec.enabled && !entry.spec.enabled()) {
        if (entry.nextDueAt <= nowSeconds) {
          entry.nextDueAt = nowSeconds + entry.spec.intervalSeconds
        }
        continue
      }
      if (
        entry.nextDueAt <= nowSeconds &&
        (!chosen || entry.nextDueAt < chosen.nextDueAt)
      ) {
        chosen = entry
      }
    }
    if (!chosen) {
      return undefined
    }
    const interval = chosen.spec.intervalSeconds
    const lag = nowSeconds - chosen.nextDueAt
    chosen.nextDueAt =
      lag < interval ? chosen.nextDueAt + interval : nowSeconds + interval
    if (runner) {
      runner(chosen.spec.name, chosen.spec.run)
    } else {
      chosen.spec.run()
    }
    return chosen.spec.name
  }
}
