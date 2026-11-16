import { horizontalHitPoint, type XrPoint } from '../xr-check/xr-check-logic.ts';

type PoseLike = Parameters<typeof horizontalHitPoint>[0];

/** A horizontal hit this close behind a tilted one is the same spot: a feature point lying on the floor. */
export const SAME_SPOT_METERS = 0.15;

export type NearestSurface = Readonly<{
  /** The nearest surface, when it is horizontal. */
  floorHit: XrPoint | null;
  /** Index, in the results, of the hit behind `floorHit`. */
  floorIndex: number;
  /** The nearest surface, when it is not horizontal: a wall, a cabinet front. */
  obstacle: XrPoint | null;
}>;

const NOTHING: NearestSurface = { floorHit: null, floorIndex: -1, obstacle: null };

/**
 * Reads hit-test results, which come nearest first, as "what is the aim resting on".
 * Only the nearest surface counts: a floor seen behind a wall or a cabinet is not
 * reachable, so it is not offered as a floor hit.
 */
export function nearestSurface(poses: readonly PoseLike[]): NearestSurface {
  let nearest: XrPoint | null = null;
  for (let index = 0; index < poses.length; index += 1) {
    const pose = poses[index];
    if (!pose) continue;
    const { x, y, z } = pose.transform.position;
    if (![x, y, z].every(Number.isFinite)) continue;
    const floorHit = horizontalHitPoint(pose);
    if (!nearest) {
      if (floorHit) return { floorHit, floorIndex: index, obstacle: null };
      nearest = { x, y, z };
      continue;
    }
    if (Math.hypot(x - nearest.x, y - nearest.y, z - nearest.z) > SAME_SPOT_METERS) break;
    if (floorHit) return { floorHit, floorIndex: index, obstacle: null };
  }
  return nearest ? { floorHit: null, floorIndex: -1, obstacle: nearest } : NOTHING;
}
