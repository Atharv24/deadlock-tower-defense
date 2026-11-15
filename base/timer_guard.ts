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
