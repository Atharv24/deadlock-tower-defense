/** Deterministic integer formatting (`9600` -> `9,600`) avoiding QuickJS locale variance. */
export function formatSoulsCount(value: number): string {
  if (!Number.isFinite(value)) {
    return '0'
  }
  const rounded = Math.round(value)
  const sign = rounded < 0 ? '-' : ''
  const absStr = String(Math.abs(rounded))
  return `${sign}${absStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
}

/** Deterministic `MM:SS` (or `H:MM:SS`) match timer formatting for HUD displays. */
export function formatMatchClock(seconds: number): string {
  if (!Number.isFinite(seconds)) {
    return '00:00'
  }
  const totalSec = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(totalSec / 3600)
  const mins = Math.floor((totalSec % 3600) / 60)
  const secs = totalSec % 60
  const pad2 = (n: number): string => (n < 10 ? `0${n}` : `${n}`)
  return hours > 0
    ? `${hours}:${pad2(mins)}:${pad2(secs)}`
    : `${pad2(mins)}:${pad2(secs)}`
}

/** Formats accumulated (potentially fractional) Tome counts cleanly for HUD display. */
export function formatTomeCountDisplay(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1)
}
