/** Detects when a dedicated host clock jumps backward (e.g. warm server reset). */
export function hasClockSteppedBackward(
  prevSeconds: number,
  nextSeconds: number,
  toleranceSeconds = 0.05,
): boolean {
  return (
    Number.isFinite(prevSeconds) &&
    Number.isFinite(nextSeconds) &&
    nextSeconds + toleranceSeconds < prevSeconds
  )
}
