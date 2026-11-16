import type { XrPoint } from '../xr-check/xr-check-logic.ts';

/**
 * How the device's floor space moved since the anchors were created, as a rigid
 * transform on the floor: raw = rotate(stable, rotationRadians) + (dx, dy, dz).
 * Rotation follows x' = x·cos − z·sin, z' = x·sin + z·cos. Scale is never touched.
 */
export type Drift = Readonly<{ dx: number; dy: number; dz: number; rotationRadians: number }>;

export const NO_DRIFT: Drift = { dx: 0, dy: 0, dz: 0, rotationRadians: 0 };

export type AnchorPair = Readonly<{
  /** Where the anchor was first seen, in the stable frame. */
  base: XrPoint;
  /** Where the device reports it now, in the raw floor space. */
  current: XrPoint;
}>;

/** Anchors closer together than this cannot tell a rotation from position noise. */
export const MIN_ROTATION_SPREAD_METERS = 2;
/** With fewer anchors a rotation fits their noise exactly, so only translation is used. */
export const MIN_ROTATION_ANCHORS = 3;

function rotate(x: number, z: number, radians: number): { x: number; z: number } {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: x * cos - z * sin, z: x * sin + z * cos };
}

/**
 * Least-squares rigid fit of the anchors' first positions to their current ones.
 * Fewer than three anchors, or anchors bunched together, give translation only: the yaw comes
 * from the spread between anchor positions, never from one anchor's own
 * orientation, whose noise would be amplified by the distance to the content.
 */
export function fitDrift(pairs: readonly AnchorPair[], minSpreadMeters = MIN_ROTATION_SPREAD_METERS, minAnchors = MIN_ROTATION_ANCHORS): Drift {
  const n = pairs.length;
  if (n === 0) return NO_DRIFT;
  let bx = 0; let bz = 0; let cx = 0; let cz = 0; let dy = 0;
  for (const { base, current } of pairs) {
    bx += base.x / n; bz += base.z / n; cx += current.x / n; cz += current.z / n;
    dy += (current.y - base.y) / n;
  }

  let rotationRadians = 0;
  let spread = 0;
  let cross = 0;
  let dot = 0;
  for (const { base, current } of pairs) {
    const ux = base.x - bx; const uz = base.z - bz;
    const vx = current.x - cx; const vz = current.z - cz;
    spread = Math.max(spread, Math.hypot(ux, uz));
    cross += ux * vz - uz * vx;
    dot += ux * vx + uz * vz;
  }
  if (n >= minAnchors && spread * 2 >= minSpreadMeters && (cross !== 0 || dot !== 0)) rotationRadians = Math.atan2(cross, dot);

  const turned = rotate(bx, bz, rotationRadians);
  return { dx: cx - turned.x, dy, dz: cz - turned.z, rotationRadians };
}

/** Raw floor-space point to the stable frame the work is stored in. */
export function toStable(drift: Drift, point: XrPoint): XrPoint {
  const p = rotate(point.x - drift.dx, point.z - drift.dz, -drift.rotationRadians);
  return { x: p.x, y: point.y - drift.dy, z: p.z };
}

/** Stable-frame point to where the device sees it now. */
export function toRaw(drift: Drift, point: XrPoint): XrPoint {
  const p = rotate(point.x, point.z, drift.rotationRadians);
  return { x: p.x + drift.dx, y: point.y + drift.dy, z: p.z + drift.dz };
}

export type DriftFilterConfig = Readonly<{
  /** Corrections smaller than this are anchor noise and are not applied. */
  deadbandMeters: number;
  deadbandRadians: number;
  /** Share of the remaining correction applied per frame (1 = at once). */
  smoothing: number;
  /** A correction that changes by more than this at once is held back... */
  jumpMeters: number;
  /** ...until it has persisted for this many frames, as a real relocalization does. */
  jumpFrames: number;
}>;

export const DEFAULT_DRIFT_FILTER: DriftFilterConfig = {
  deadbandMeters: 0.02,
  deadbandRadians: (0.5 * Math.PI) / 180,
  smoothing: 0.15,
  jumpMeters: 0.3,
  jumpFrames: 30,
};

export type DriftFilter = Readonly<{
  /** Takes the drift fitted this frame and returns the one to apply. */
  update: (target: Drift) => Drift;
  reset: () => void;
}>;

/**
 * Keeps the placed work from shaking with the anchors: ignores corrections within
 * the noise, eases into real ones, and waits out a sudden jump unless it persists.
 */
export function createDriftFilter(config: DriftFilterConfig = DEFAULT_DRIFT_FILTER): DriftFilter {
  let applied: Drift = NO_DRIFT;
  let jumpCount = 0;
  return {
    reset: () => { applied = NO_DRIFT; jumpCount = 0; },
    update: (target) => {
      const distance = Math.hypot(target.dx - applied.dx, target.dy - applied.dy, target.dz - applied.dz);
      const turn = Math.abs(target.rotationRadians - applied.rotationRadians);
      if (distance <= config.deadbandMeters && turn <= config.deadbandRadians) { jumpCount = 0; return applied; }
      if (distance > config.jumpMeters) {
        jumpCount += 1;
        if (jumpCount < config.jumpFrames) return applied;
      } else {
        jumpCount = 0;
      }
      const a = config.smoothing;
      applied = {
        dx: applied.dx + (target.dx - applied.dx) * a,
        dy: applied.dy + (target.dy - applied.dy) * a,
        dz: applied.dz + (target.dz - applied.dz) * a,
        rotationRadians: applied.rotationRadians + (target.rotationRadians - applied.rotationRadians) * a,
      };
      return applied;
    },
  };
}
