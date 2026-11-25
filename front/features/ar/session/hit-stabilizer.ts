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
  /**
   * The point must stay inside this radius for `holdMs` to count as stable. The
   * radius grows by `holdRadiusPerMeter` for each meter between the phone and the
   * point, because the same hand tremor moves a far point more. The placed point is
   * the mean of the window, so averaging keeps it more precise than the radius.
   */
  holdRadiusMeters: number;
  holdRadiusPerMeter: number;
  holdMs: number;
  /** Once stable, the point stays stable until it leaves `releaseFactor` × the hold radius. */
  releaseFactor: number;
  /** A brief excursion shorter than this neither breaks the hold nor releases the lock. */
  graceMs: number;
}>;

export const DEFAULT_HIT_STABILIZER: HitStabilizerConfig = {
  floorSamples: 15,
  floorSpreadMeters: 0.04,
  floorToleranceMeters: 0.1,
  maxRayDistanceMeters: 8,
  smoothing: 0.35,
  jumpMeters: 0.3,
  holdRadiusMeters: 0.025,
  holdRadiusPerMeter: 0.01,
  holdMs: 350,
  releaseFactor: 2,
  graceMs: 200,
};

export type HitStabilizer = Readonly<{
  /**
   * `floorHintY` is the height of the lowest large horizontal plane the device
   * detected, when known. Hits well above it are not learned as floor, and a floor
   * already locked well above it (a table, a counter) moves down to it.
   */
  update: (rawHit: XrPoint | null, ray: XrRay | null, timeMs: number, floorHintY?: number | null) => StabilizedHit;
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

function meanPoint(points: readonly XrPoint[]): XrPoint {
  const n = points.length;
  return points.reduce((acc, p) => ({ x: acc.x + p.x / n, y: acc.y + p.y / n, z: acc.z + p.z / n }), { x: 0, y: 0, z: 0 });
}

const MAX_LOCK_SAMPLES = 30;

/**
 * Turns raw per-frame hit-test results into a calmer floor point:
 * 1. learns the floor height from consistent hits and then rejects hits off that plane;
 * 2. falls back to the camera ray against the locked floor when the hit-test drops out;
 * 3. smooths the point and reports `stable` only after it holds still for `holdMs`,
 *    returning the mean of that window so placement does not land on one noisy frame;
 * 4. once stable, keeps the point locked (hysteresis) while the aim stays near it, and
 *    ignores excursions shorter than `graceMs`, so the state does not flicker.
 */
export function createHitStabilizer(config: HitStabilizerConfig = DEFAULT_HIT_STABILIZER): HitStabilizer {
  let floorSamples: number[] = [];
  let floorY: number | null = null;
  let smoothed: XrPoint | null = null;
  let window: { point: XrPoint; time: number }[] = [];
  let outsideSince: number | null = null;
  let locked: XrPoint | null = null;
  let lockSamples: XrPoint[] = [];

  const unlock = () => { locked = null; lockSamples = []; outsideSince = null; };
  const interrupt = () => { smoothed = null; window = []; unlock(); };
  const reset = () => { interrupt(); floorSamples = []; floorY = null; };

  const learnFloor = (y: number) => {
    floorSamples.push(y);
    if (floorSamples.length > config.floorSamples) floorSamples.shift();
    if (floorSamples.length < config.floorSamples) return;
    const spread = Math.max(...floorSamples) - Math.min(...floorSamples);
    if (spread <= config.floorSpreadMeters) floorY = median(floorSamples);
  };

  const update = (rawHit: XrPoint | null, ray: XrRay | null, timeMs: number, floorHintY: number | null = null): StabilizedHit => {
    let target: XrPoint | null = null;
    const hint = floorHintY !== null && Number.isFinite(floorHintY) ? floorHintY : null;
    if (hint !== null && floorY !== null && floorY - hint > config.floorToleranceMeters) {
      floorY = hint;
      floorSamples = [];
      interrupt();
    }

    if (floorY === null) {
      if (rawHit) {
        if (hint === null || rawHit.y - hint <= config.floorToleranceMeters) learnFloor(rawHit.y);
        target = rawHit;
      }
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
      unlock();
    } else {
      const a = config.smoothing;
      smoothed = {
        x: smoothed.x + (target.x - smoothed.x) * a,
        y: floorY ?? smoothed.y + (target.y - smoothed.y) * a,
        z: smoothed.z + (target.z - smoothed.z) * a,
      };
    }

    const reach = ray ? horizontalDistance(ray.origin, smoothed) : 0;
    const holdRadius = config.holdRadiusMeters + reach * config.holdRadiusPerMeter;

    if (locked) {
      if (horizontalDistance(smoothed, locked) <= holdRadius * config.releaseFactor) {
        outsideSince = null;
        lockSamples.push(smoothed);
        if (lockSamples.length > MAX_LOCK_SAMPLES) lockSamples.shift();
        locked = meanPoint(lockSamples);
        return { point: locked, stable: true, progress: 1, floorY };
      }
      outsideSince ??= timeMs;
      if (timeMs - outsideSince <= config.graceMs) return { point: locked, stable: true, progress: 1, floorY };
      unlock();
      window = [];
    }

    if (window.length) {
      const center = meanPoint(window.map((s) => s.point));
      if (horizontalDistance(smoothed, center) <= holdRadius) {
        outsideSince = null;
        window.push({ point: smoothed, time: timeMs });
      } else {
        outsideSince ??= timeMs;
        // A short tremor is skipped; a real move restarts the window.
        if (timeMs - outsideSince > config.graceMs) { window = [{ point: smoothed, time: timeMs }]; outsideSince = null; }
      }
    } else {
      window.push({ point: smoothed, time: timeMs });
    }
    // Keep only the last `holdMs` of samples, but always the newest one.
    while (window.length > 1 && timeMs - window[1].time >= config.holdMs) window.shift();

    const held = timeMs - window[0].time;
    // Stability needs a locked floor: before that the height itself is still uncertain.
    if (floorY !== null && held >= config.holdMs * 0.9 && window.length >= 3) {
      lockSamples = window.map((s) => s.point);
      locked = meanPoint(lockSamples);
      outsideSince = null;
      return { point: locked, stable: true, progress: 1, floorY };
    }
    const progress = floorY === null ? 0 : Math.min(1, held / config.holdMs);
    return { point: smoothed, stable: false, progress, floorY };
  };

  return { update, reset, interrupt };
}
