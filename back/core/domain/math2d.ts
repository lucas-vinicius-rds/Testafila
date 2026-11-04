import type { Meters, PointXZ } from './types.ts';
import type { BoundingBoxXZ } from './types.ts';

export const EPSILON = 1e-7;
export const DEFAULT_MAX_METRIC_BOUND = 10_000; // +/- 10km sanity limit for metric domain

/**
 * Checks whether a value is a valid finite number within optional minimum and maximum bounds.
 */
export function isFiniteNumber(val: unknown, min = -Infinity, max = Infinity): val is number {
  return typeof val === 'number' && Number.isFinite(val) && !Number.isNaN(val) && val >= min && val <= max;
}

/**
 * Asserts that a value is a finite number, throwing a descriptive error if not.
 */
export function assertFiniteNumber(val: unknown, name = 'value', min = -Infinity, max = Infinity): asserts val is number {
  if (typeof val !== 'number' || !Number.isFinite(val) || Number.isNaN(val)) {
    throw new TypeError(`${name} must be a finite number, received: ${String(val)}`);
  }
  if (val < min || val > max) {
    throw new RangeError(`${name} must be between ${min} and ${max}, received: ${val}`);
  }
}

/**
 * Checks whether an object is a valid PointXZ with finite coordinates.
 */
export function isFinitePointXZ(point: unknown): point is PointXZ {
  if (!point || typeof point !== 'object') return false;
  const p = point as Record<string, unknown>;
  return isFiniteNumber(p.x) && isFiniteNumber(p.z);
}

/**
 * Asserts that a point has finite coordinates.
 */
export function assertFinitePointXZ(point: PointXZ, name = 'point'): void {
  if (!point || typeof point !== 'object') {
    throw new TypeError(`${name} must be an object with { x, z } coordinates`);
  }
  assertFiniteNumber(point.x, `${name}.x`);
  assertFiniteNumber(point.z, `${name}.z`);
}

/**
 * Creates a PointXZ ensuring finite coordinates.
 */
export function createPointXZ(x: Meters, z: Meters): PointXZ {
  assertFiniteNumber(x, 'x');
  assertFiniteNumber(z, 'z');
  return { x, z };
}

/**
 * Vector subtraction: a - b
 */
export function vectorSub(a: PointXZ, b: PointXZ): PointXZ {
  return { x: a.x - b.x, z: a.z - b.z };
}

/**
 * Vector addition: a + b
 */
export function vectorAdd(a: PointXZ, b: PointXZ): PointXZ {
  return { x: a.x + b.x, z: a.z + b.z };
}

/**
 * Scalar multiplication: v * scalar
 */
export function vectorScale(v: PointXZ, scalar: number): PointXZ {
  assertFiniteNumber(scalar, 'scalar');
  return { x: v.x * scalar, z: v.z * scalar };
}

/**
 * Euclidean length of vector v
 */
export function vectorLength(v: PointXZ): Meters {
  return Math.hypot(v.x, v.z);
}

/**
 * Squared Euclidean length of vector v
 */
export function vectorLengthSq(v: PointXZ): number {
  return v.x * v.x + v.z * v.z;
}

/**
 * Distance between points a and b in meters.
 */
export function distance(a: PointXZ, b: PointXZ): Meters {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

/**
 * Squared distance between points a and b.
 */
export function distanceSq(a: PointXZ, b: PointXZ): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  return dx * dx + dz * dz;
}

/**
 * Tests if two points are equal within epsilon tolerance.
 */
export function pointsEqual(a: PointXZ, b: PointXZ, epsilon = EPSILON): boolean {
  return Math.abs(a.x - b.x) <= epsilon && Math.abs(a.z - b.z) <= epsilon;
}

/**
 * Dot product: a · b
 */
export function dotProduct(a: PointXZ, b: PointXZ): number {
  return a.x * b.x + a.z * b.z;
}

/**
 * 2D cross product (wedge product / z-component of 3D cross product): a.x * b.z - a.z * b.x
 * Positive if b is counter-clockwise from a.
 */
export function crossProduct2D(a: PointXZ, b: PointXZ): number {
  return a.x * b.z - a.z * b.x;
}

/**
 * 2D cross product of vectors (a - origin) and (b - origin).
 * Positive = counter-clockwise turn (left turn) from OA to OB.
 * Negative = clockwise turn (right turn).
 * Zero = collinear.
 */
export function crossProductPoints(origin: PointXZ, a: PointXZ, b: PointXZ): number {
  return (a.x - origin.x) * (b.z - origin.z) - (a.z - origin.z) * (b.x - origin.x);
}

/**
 * Normalizes vector v to unit length. Returns (0, 0) if length <= epsilon.
 */
export function normalize(v: PointXZ, epsilon = EPSILON): PointXZ {
  const len = vectorLength(v);
  if (len <= epsilon) {
    return { x: 0, z: 0 };
  }
  return { x: v.x / len, z: v.z / len };
}

/**
 * Calculates polyline length (sum of consecutive segments).
 */
export function polylineLength(points: readonly PointXZ[]): Meters {
  if (points.length < 2) return 0;
  let total: Meters = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    total += distance(p1, p2);
  }
  return total;
}

/**
 * Computes axis-aligned bounding box for an array of points.
 */
export function computeAABB(points: readonly PointXZ[]): BoundingBoxXZ {
  if (points.length === 0) {
    return { minX: 0, minZ: 0, maxX: 0, maxZ: 0, width: 0, depth: 0 };
  }
  let minX = points[0]!.x;
  let maxX = points[0]!.x;
  let minZ = points[0]!.z;
  let maxZ = points[0]!.z;

  for (let i = 1; i < points.length; i++) {
    const pt = points[i]!;
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.z < minZ) minZ = pt.z;
    if (pt.z > maxZ) maxZ = pt.z;
  }

  return {
    minX,
    minZ,
    maxX,
    maxZ,
    width: maxX - minX,
    depth: maxZ - minZ,
  };
}

/**
 * Checks if a bounding box contains a point within tolerance.
 */
export function aabbContainsPoint(box: BoundingBoxXZ, point: PointXZ, epsilon = EPSILON): boolean {
  return (
    point.x >= box.minX - epsilon &&
    point.x <= box.maxX + epsilon &&
    point.z >= box.minZ - epsilon &&
    point.z <= box.maxZ + epsilon
  );
}

/**
 * Checks if two bounding boxes intersect within tolerance.
 */
export function aabbIntersectsAABB(a: BoundingBoxXZ, b: BoundingBoxXZ, epsilon = EPSILON): boolean {
  return (
    a.minX <= b.maxX + epsilon &&
    a.maxX >= b.minX - epsilon &&
    a.minZ <= b.maxZ + epsilon &&
    a.maxZ >= b.minZ - epsilon
  );
}

/**
 * Snaps a 2D metric point to a regular grid.
 * @param point The point to snap
 * @param gridSizeMeters Grid spacing in meters (must be > 0)
 * @param origin Optional grid origin (defaults to 0,0)
 */
export function snapToGrid(point: PointXZ, gridSizeMeters: Meters, origin: PointXZ = { x: 0, z: 0 }): PointXZ {
  assertFiniteNumber(gridSizeMeters, 'gridSizeMeters', EPSILON);
  assertFinitePointXZ(point, 'point');
  assertFinitePointXZ(origin, 'origin');

  const snappedX = origin.x + Math.round((point.x - origin.x) / gridSizeMeters) * gridSizeMeters;
  const snappedZ = origin.z + Math.round((point.z - origin.z) / gridSizeMeters) * gridSizeMeters;

  // Avoid negative zero
  return {
    x: Object.is(snappedX, -0) ? 0 : snappedX,
    z: Object.is(snappedZ, -0) ? 0 : snappedZ,
  };
}
