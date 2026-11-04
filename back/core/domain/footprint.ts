import type { Meters, PointXZ } from './types.ts';
import type {
  CircularFootprint,
  CircleCircleIntersectionResult,
  CircleSegmentIntersectionResult,
  ValidationResult,
} from './types.ts';
import {
  EPSILON,
  assertFiniteNumber,
  assertFinitePointXZ,
  isFiniteNumber,
  isFinitePointXZ,
} from './math2d.ts';
import {
  circleIntersectsCircle,
  circleIntersectsSegment,
  distancePointToSegment,
} from './intersection.ts';
import { isPointInPolygon } from './polygon.ts';

/**
 * Validates whether a circular footprint has finite coordinates and positive radius.
 */
export function validateCircularFootprint(
  footprint: CircularFootprint,
  options: { minRadius?: Meters; maxRadius?: Meters } = {}
): ValidationResult {
  const errors: string[] = [];
  const minR = options.minRadius ?? EPSILON;
  const maxR = options.maxRadius ?? 100;

  if (!footprint || typeof footprint !== 'object') {
    return { valid: false, errors: ['Footprint must be a valid object'] };
  }

  if (!isFinitePointXZ(footprint.center)) {
    errors.push('Footprint center must have finite x and z coordinates');
  }

  if (!isFiniteNumber(footprint.radius) || footprint.radius < minR || footprint.radius > maxR) {
    errors.push(`Footprint radius must be a finite number between ${minR}m and ${maxR}m, received: ${String(footprint.radius)}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Checks if two circular footprints collide or touch, taking optional clearance into account.
 */
export function checkFootprintCollision(
  f1: CircularFootprint,
  f2: CircularFootprint,
  clearance: Meters = 0,
  epsilon = EPSILON
): CircleCircleIntersectionResult {
  assertFinitePointXZ(f1.center, 'footprint 1 center');
  assertFinitePointXZ(f2.center, 'footprint 2 center');
  assertFiniteNumber(f1.radius, 'footprint 1 radius', 0);
  assertFiniteNumber(f2.radius, 'footprint 2 radius', 0);
  assertFiniteNumber(clearance, 'clearance', 0);

  return circleIntersectsCircle(f1.center, f1.radius, f2.center, f2.radius, clearance, epsilon);
}

/**
 * Checks if a circular footprint intersects or touches a line segment, inclusive of clearance.
 */
export function doesFootprintIntersectSegment(
  footprint: CircularFootprint,
  segStart: PointXZ,
  segEnd: PointXZ,
  clearance: Meters = 0,
  epsilon = EPSILON
): CircleSegmentIntersectionResult {
  assertFinitePointXZ(footprint.center, 'footprint center');
  assertFiniteNumber(footprint.radius, 'footprint radius', 0);
  assertFiniteNumber(clearance, 'clearance', 0);

  return circleIntersectsSegment(footprint.center, footprint.radius, segStart, segEnd, clearance, epsilon);
}

/**
 * Checks whether a circular footprint is fully contained inside a simple polygon with required clearance.
 * Requirements:
 * 1. Center must be inside the polygon (not on boundary).
 * 2. Minimum distance from center to every polygon edge must be >= radius + clearance - epsilon.
 */
export function isFootprintInsidePolygon(
  footprint: CircularFootprint,
  polygonVertices: readonly PointXZ[],
  clearance: Meters = 0,
  epsilon = EPSILON
): boolean {
  assertFinitePointXZ(footprint.center, 'footprint center');
  assertFiniteNumber(footprint.radius, 'footprint radius', 0);
  assertFiniteNumber(clearance, 'clearance', 0);

  const n = polygonVertices.length;
  if (n < 3) return false;

  const pip = isPointInPolygon(footprint.center, polygonVertices, epsilon);
  if (!pip.inside || pip.onBoundary) {
    return false;
  }

  const requiredDistance = footprint.radius + clearance;

  for (let i = 0; i < n; i++) {
    const cur = polygonVertices[i]!;
    const next = polygonVertices[(i + 1) % n]!;
    const { distance: d } = distancePointToSegment(footprint.center, cur, next);

    if (d < requiredDistance - epsilon) {
      return false;
    }
  }

  return true;
}

/**
 * Checks whether a circular footprint conflicts with (intersects, touches, or is inside) a polygon.
 * Useful for restricted areas: any contact with boundary or interior constitutes a conflict.
 */
export function doesFootprintIntersectPolygon(
  footprint: CircularFootprint,
  polygonVertices: readonly PointXZ[],
  clearance: Meters = 0,
  epsilon = EPSILON
): boolean {
  assertFinitePointXZ(footprint.center, 'footprint center');
  assertFiniteNumber(footprint.radius, 'footprint radius', 0);
  assertFiniteNumber(clearance, 'clearance', 0);

  const n = polygonVertices.length;
  if (n < 3) return false;

  // If center is inside or on boundary, conflict!
  const pip = isPointInPolygon(footprint.center, polygonVertices, epsilon);
  if (pip.inside) {
    return true;
  }

  // Check each edge for intersection or contact with circular footprint
  for (let i = 0; i < n; i++) {
    const cur = polygonVertices[i]!;
    const next = polygonVertices[(i + 1) % n]!;
    const result = circleIntersectsSegment(footprint.center, footprint.radius, cur, next, clearance, epsilon);
    if (result.intersects) {
      return true;
    }
  }

  return false;
}

/**
 * Computes the minimum distance from footprint center to polygon boundary.
 */
export function distanceFootprintToPolygonBoundary(
  footprint: CircularFootprint,
  polygonVertices: readonly PointXZ[]
): { minDistance: Meters; margin: Meters } {
  assertFinitePointXZ(footprint.center, 'footprint center');
  assertFiniteNumber(footprint.radius, 'footprint radius', 0);

  const n = polygonVertices.length;
  if (n < 3) {
    return { minDistance: 0, margin: -footprint.radius };
  }

  let minDistance = Infinity;
  for (let i = 0; i < n; i++) {
    const cur = polygonVertices[i]!;
    const next = polygonVertices[(i + 1) % n]!;
    const { distance: d } = distancePointToSegment(footprint.center, cur, next);
    if (d < minDistance) {
      minDistance = d;
    }
  }

  return {
    minDistance,
    margin: minDistance - footprint.radius,
  };
}
