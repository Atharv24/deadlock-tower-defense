import type { Angles, Vector } from 'modlock'

/** Clamps `value` to the inclusive range `[min, max]`. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/** Computes horizontal 2D XY Euclidean distance between two vectors. */
export function flatDistance2D(a: Vector, b: Vector): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Computes full 3D Euclidean distance between two vectors. */
export function distance3D(a: Vector, b: Vector): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}

/**
 * Computes Source 2 view `Angles` (`pitch`, `yaw`, `roll = 0`) looking from `from` to `to`.
 * In Source 2: `+X` = `0°`, `+Y` = `90°`, `-Y` = `-90°`; looking up is negative pitch, looking down is positive pitch.
 */
export function computeAimAngles(from: Vector, to: Vector): Angles {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dz = to.z - from.z
  const horiz = Math.hypot(dx, dy)
  if (horiz < 1e-4 && Math.abs(dz) < 1e-4) {
    return { pitch: 0, yaw: -90, roll: 0 }
  }
  const yaw = (Math.atan2(dy, dx) * 180) / Math.PI
  const pitch = clamp((-Math.atan2(dz, horiz) * 180) / Math.PI, -85, 85)
  return { pitch, yaw, roll: 0 }
}

/**
 * Converts a desired horizontal world-space movement vector `(moveX, moveY)` into
 * `DriveCommand` `(forward, left)` axes (`[-1, 1]`) relative to `facingYawDeg`.
 */
export function worldMoveToDriveAxes(
  moveX: number,
  moveY: number,
  facingYawDeg: number,
): { readonly forward: number; readonly left: number } {
  const mag = Math.hypot(moveX, moveY)
  if (mag < 1e-4) {
    return { forward: 0, left: 0 }
  }
  const scale = mag > 1 ? 1 / mag : 1
  const wx = moveX * scale
  const wy = moveY * scale

  const rad = (facingYawDeg * Math.PI) / 180
  const fx = Math.cos(rad)
  const fy = Math.sin(rad)
  // +90° CCW in right-handed Z-up is Left: (-sin(yaw), cos(yaw))
  const lx = -fy
  const ly = fx

  return {
    forward: clamp(wx * fx + wy * fy, -1, 1),
    left: clamp(wx * lx + wy * ly, -1, 1),
  }
}
