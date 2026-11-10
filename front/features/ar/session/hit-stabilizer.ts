import type { XrPoint } from '../xr-check/xr-check-logic.ts';

/** Ray in the floor reference space; `direction` need not be normalized. */
export type XrRay = Readonly<{ origin: XrPoint; direction: XrPoint }>;

export type StabilizedHit = Readonly<{
  /** Smoothed point for the reticle, or null when nothing usable is in view. */
  point: XrPoint | null;
  /** True when the point held still long enough to be placed. */
  stable: boolean;
  /** 0..1 toward `stable`, for feedback. */
  progress: number;
  /** Locked floor height, or null while still learning it. */
  floorY: number | null;
}>;

export type HitStabilizerConfig = Readonly<{
  /** Hits needed, all within `floorSpreadMeters`, to lock the floor height. */
  floorSamples: number;
  floorSpreadMeters: number;
  /** Hits farther than this from the locked floor (tables, steps) are rejected. */
  floorToleranceMeters: number;
  /** Ray–floor intersections beyond this horizontal distance are ignored. */
  maxRayDistanceMeters: number;
  /** Exponential smoothing factor per frame (1 = no smoothing). */
  smoothing: number;
  /** A jump larger than this restarts smoothing and the stability window. */
  jumpMeters: number;
  /** The point must stay inside this radius for `holdMs` to count as stable. */
  holdRadiusMeters: number;
  holdMs: number;
}>;

export const DEFAULT_HIT_STABILIZER: HitStabilizerConfig = {
  floorSamples: 15,
  floorSpreadMeters: 0.04,
  floorToleranceMeters: 0.1,
  maxRayDistanceMeters: 8,
  smoothing: 0.35,
  jumpMeters: 0.3,
  holdRadiusMeters: 0.025,
  holdMs: 400,
};

export type HitStabilizer = Readonly<{
  update: (rawHit: XrPoint | null, ray: XrRay | null, timeMs: number) => StabilizedHit;
  /** Forgets everything, including the floor. Call on a new session or lost tracking. */
  reset: () => void;
  /** Forgets the smoothing and stability window but keeps the floor. */
  interrupt: () => void;
}>;

const EMPTY: StabilizedHit = { point: null, stable: false, progress: 0, floorY: null };

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function horizontalDistance(a: XrPoint, b: XrPoint): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Intersects the ray with the horizontal plane y = floorY, in front of the origin only. */
export function rayFloorPoint(ray: XrRay, floorY: number, maxDistance: number): XrPoint | null {
  const { origin, direction } = ray;
  if (![origin.x, origin.y, origin.z, direction.x, direction.y, direction.z].every(Number.isFinite)) return null;
  if (direction.y >= -1e-6) return null;
  const t = (floorY - origin.y) / direction.y;
  if (t <= 0) return null;
  const point = { x: origin.x + direction.x * t, y: floorY, z: origin.z + direction.z * t };
  return horizontalDistance(origin, point) <= maxDistance ? point : null;
}

/**
 * Turns raw per-frame hit-test results into a calmer floor point:
 * 1. learns the floor height from consistent hits and then rejects hits off that plane;
 * 2. falls back to the camera ray against the locked floor when the hit-test drops out;
 * 3. smooths the point and reports `stable` only after it holds still for `holdMs`,
 *    returning the mean of that window so placement does not land on one noisy frame.
 */
export function createHitStabilizer(config: HitStabilizerConfig = DEFAULT_HIT_STABILIZER): HitStabilizer {
  let floorSamples: number[] = [];
  let floorY: number | null = null;
  let smoothed: XrPoint | null = null;
  let window: { point: XrPoint; time: number }[] = [];

  const interrupt = () => { smoothed = null; window = []; };
  const reset = () => { interrupt(); floorSamples = []; floorY = null; };

  const learnFloor = (y: number) => {
    floorSamples.push(y);
    if (floorSamples.length > config.floorSamples) floorSamples.shift();
    if (floorSamples.length < config.floorSamples) return;
    const spread = Math.max(...floorSamples) - Math.min(...floorSamples);
    if (spread <= config.floorSpreadMeters) floorY = median(floorSamples);
  };

  const update = (rawHit: XrPoint | null, ray: XrRay | null, timeMs: number): StabilizedHit => {
    let target: XrPoint | null = null;

    if (floorY === null) {
      if (rawHit) { learnFloor(rawHit.y); target = rawHit; }
    } else if (rawHit && Math.abs(rawHit.y - floorY) <= config.floorToleranceMeters) {
      // Follow slow drift of the tracked floor without letting one frame move it.
      floorY += (rawHit.y - floorY) * 0.02;
      target = { x: rawHit.x, y: floorY, z: rawHit.z };
    } else if (ray) {
      target = rayFloorPoint(ray, floorY, config.maxRayDistanceMeters);
    }

    if (!target) { interrupt(); return { ...EMPTY, floorY }; }

    if (!smoothed || horizontalDistance(smoothed, target) > config.jumpMeters) {
      smoothed = target;
      window = [];
    } else {
      const a = config.smoothing;
      smoothed = {
        x: smoothed.x + (target.x - smoothed.x) * a,
        y: floorY ?? smoothed.y + (target.y - smoothed.y) * a,
        z: smoothed.z + (target.z - smoothed.z) * a,
      };
    }

    window.push({ point: smoothed, time: timeMs });
    while (window.length && timeMs - window[0].time > config.holdMs) window.shift();
    const center = window.reduce((acc, s) => ({ x: acc.x + s.point.x / window.length, y: acc.y + s.point.y / window.length, z: acc.z + s.point.z / window.length }), { x: 0, y: 0, z: 0 });
    const still = window.every((s) => horizontalDistance(s.point, center) <= config.holdRadiusMeters);
    if (!still) window = [{ point: smoothed, time: timeMs }];

    const held = window.length ? timeMs - window[0].time : 0;
    // Stability needs a locked floor: before that the height itself is still uncertain.
    const stable = still && floorY !== null && held >= config.holdMs * 0.9;
    const progress = floorY === null ? 0 : Math.min(1, held / config.holdMs);
    return { point: stable ? center : smoothed, stable, progress: stable ? 1 : progress, floorY };
  };

  return { update, reset, interrupt };
}
