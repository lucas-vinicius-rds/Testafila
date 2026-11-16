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
  /**
   * Where the point came from: `hit` is a measured floor hit, `ray` the camera ray
   * covering a short hit-test dropout, `blocked` a wall or an object in the way.
   */
  source: HitSource;
  /** True while a surface below the locked floor is being checked as the real floor. */
  relearning: boolean;
}>;

export type HitSource = 'none' | 'hit' | 'ray' | 'blocked';

export type HitStabilizerConfig = Readonly<{
  /** Hits needed, all within `floorSpreadMeters`, to lock the floor height. */
  floorSamples: number;
  floorSpreadMeters: number;
  /** The consistent hits must span at least this long and this far across the floor. */
  floorLearnMs: number;
  floorExtentMeters: number;
  /** Samples older than this no longer count toward locking. */
  floorWindowMs: number;
  /** The floor must be at least this far below the camera: a shelf at chest height is not floor. */
  minCameraHeightMeters: number;
  /** The camera ray stands in for the hit-test only this long after the last measured floor hit. */
  rayGraceMs: number;
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
  floorLearnMs: 1000,
  floorExtentMeters: 0.5,
  floorWindowMs: 2000,
  minCameraHeightMeters: 0.6,
  rayGraceMs: 1000,
  floorToleranceMeters: 0.1,
  maxRayDistanceMeters: 8,
  smoothing: 0.35,
  jumpMeters: 0.3,
  holdRadiusMeters: 0.025,
  holdMs: 400,
};

export type HitStabilizer = Readonly<{
  /**
   * `floorHintY` is the height of the lowest large horizontal plane the device
   * detected, when known. Hits well above it are not learned as floor, and a floor
   * already locked well above it (a table, a counter) moves down to it.
   *
   * `rawHit` is the nearest surface when it is horizontal. `obstacle` is the nearest
   * surface when it is not (a wall, a cabinet front): it blocks the aim instead of
   * letting the camera ray reach the floor behind it.
   */
  update: (rawHit: XrPoint | null, ray: XrRay | null, timeMs: number, floorHintY?: number | null, obstacle?: XrPoint | null) => StabilizedHit;
  /** Forgets everything, including the floor. Call on a new session or to learn the floor again. */
  reset: () => void;
  /** Forgets the smoothing and stability window but keeps the floor. */
  interrupt: () => void;
}>;

const EMPTY: StabilizedHit = { point: null, stable: false, progress: 0, floorY: null, source: 'none', relearning: false };

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

type FloorSample = { x: number; y: number; z: number; time: number };

/**
 * Collects floor candidates and answers with a height only when they agree for long
 * enough, over a wide enough patch, and far enough below the camera. A glimpse of a
 * table or a cabinet top is short or small and does not pass.
 */
function createFloorLearner(config: HitStabilizerConfig) {
  let samples: FloorSample[] = [];
  return {
    clear: () => { samples = []; },
    add: (hit: XrPoint, time: number, cameraY: number | null): number | null => {
      if (samples.length && Math.abs(hit.y - median(samples.map((s) => s.y))) > config.floorSpreadMeters) samples = [];
      samples.push({ x: hit.x, y: hit.y, z: hit.z, time });
      while (samples.length && time - samples[0].time > config.floorWindowMs) samples.shift();
      if (samples.length < config.floorSamples || time - samples[0].time < config.floorLearnMs) return null;
      let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
      for (const s of samples) {
        minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x);
        minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y);
        minZ = Math.min(minZ, s.z); maxZ = Math.max(maxZ, s.z);
      }
      if (maxY - minY > config.floorSpreadMeters) return null;
      if (Math.hypot(maxX - minX, maxZ - minZ) < config.floorExtentMeters) return null;
      const y = median(samples.map((s) => s.y));
      if (cameraY !== null && cameraY - y < config.minCameraHeightMeters) return null;
      return y;
    },
  };
}

/**
 * Turns raw per-frame hit-test results into a calmer floor point:
 * 1. learns the floor height from hits that agree for about a second while the aim
 *    sweeps the floor, then rejects hits off that plane;
 * 2. treats the floor as the lowest such surface: one found below the locked floor
 *    replaces it;
 * 3. lets a wall or an object in the way block the aim, and uses the camera ray
 *    against the locked floor only to cover a short hit-test dropout;
 * 4. smooths the point and reports `stable` only after it holds still for `holdMs`,
 *    returning the mean of that window so placement does not land on one noisy frame.
 */
export function createHitStabilizer(config: HitStabilizerConfig = DEFAULT_HIT_STABILIZER): HitStabilizer {
  const learner = createFloorLearner(config);
  const lowerLearner = createFloorLearner(config);
  let floorY: number | null = null;
  let smoothed: XrPoint | null = null;
  let window: { point: XrPoint; time: number }[] = [];
  let lastFloorHitMs: number | null = null;

  const interrupt = () => { smoothed = null; window = []; };
  const reset = () => { interrupt(); learner.clear(); lowerLearner.clear(); floorY = null; lastFloorHitMs = null; };

  const update = (rawHit: XrPoint | null, ray: XrRay | null, timeMs: number, floorHintY: number | null = null, obstacle: XrPoint | null = null): StabilizedHit => {
    let target: XrPoint | null = null;
    let source: HitSource = 'none';
    let relearning = false;
    const cameraY = ray && Number.isFinite(ray.origin.y) ? ray.origin.y : null;
    const hint = floorHintY !== null && Number.isFinite(floorHintY) ? floorHintY : null;
    if (hint !== null && floorY !== null && floorY - hint > config.floorToleranceMeters) {
      floorY = hint;
      learner.clear();
      lowerLearner.clear();
      interrupt();
    }

    if (floorY === null) {
      if (rawHit) {
        if (hint === null || rawHit.y - hint <= config.floorToleranceMeters) {
          const learned = learner.add(rawHit, timeMs, cameraY);
          if (learned !== null) { floorY = learned; learner.clear(); lastFloorHitMs = timeMs; }
        }
        target = floorY === null ? rawHit : { x: rawHit.x, y: floorY, z: rawHit.z };
        source = 'hit';
      } else if (obstacle) {
        source = 'blocked';
      }
    } else if (rawHit && Math.abs(rawHit.y - floorY) <= config.floorToleranceMeters) {
      // Follow slow drift of the tracked floor without letting one frame move it.
      floorY += (rawHit.y - floorY) * 0.02;
      target = { x: rawHit.x, y: floorY, z: rawHit.z };
      source = 'hit';
      lastFloorHitMs = timeMs;
      lowerLearner.clear();
    } else if (rawHit && rawHit.y < floorY) {
      // A horizontal surface below the locked floor: the floor is the lowest one.
      const learned = lowerLearner.add(rawHit, timeMs, cameraY);
      if (learned !== null) {
        floorY = learned;
        lowerLearner.clear();
        interrupt();
        lastFloorHitMs = timeMs;
        target = { x: rawHit.x, y: floorY, z: rawHit.z };
      } else {
        target = rawHit;
        relearning = true;
      }
      source = 'hit';
    } else if (rawHit || (obstacle && obstacle.y - floorY > config.floorToleranceMeters)) {
      // A table or shelf top, a wall, a cabinet front: never aim through it.
      source = 'blocked';
    } else if (ray && lastFloorHitMs !== null && timeMs - lastFloorHitMs <= config.rayGraceMs) {
      target = rayFloorPoint(ray, floorY, config.maxRayDistanceMeters);
      if (target) source = 'ray';
    }

    if (!target) { interrupt(); return { ...EMPTY, floorY, source }; }

    const lockedY = relearning ? null : floorY;
    if (!smoothed || horizontalDistance(smoothed, target) > config.jumpMeters) {
      smoothed = target;
      window = [];
    } else {
      const a = config.smoothing;
      smoothed = {
        x: smoothed.x + (target.x - smoothed.x) * a,
        y: lockedY ?? smoothed.y + (target.y - smoothed.y) * a,
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
    const stable = still && lockedY !== null && held >= config.holdMs * 0.9;
    const progress = lockedY === null ? 0 : Math.min(1, held / config.holdMs);
    return { point: stable ? center : smoothed, stable, progress: stable ? 1 : progress, floorY, source, relearning };
  };

  return { update, reset, interrupt };
}
