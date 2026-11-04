import type { Meters, PointXZ } from './types.ts';
import type {
  IntersectionKind,
  SegmentIntersectionResult,
  CircleSegmentIntersectionResult,
  CircleCircleIntersectionResult,
} from './types.ts';
import {
  EPSILON,
  assertFinitePointXZ,
  assertFiniteNumber,
  crossProduct2D,
  crossProductPoints,
  distance,
  distanceSq,
  dotProduct,
  pointsEqual,
  vectorAdd,
  vectorScale,
  vectorSub,
  vectorLengthSq,
} from './math2d.ts';

/**
 * Calculates the shortest distance from a 2D point to a line segment,
 * returning the distance, closest point on the segment, and projection parameter t.
 */
export function distancePointToSegment(
  point: PointXZ,
  segStart: PointXZ,
  segEnd: PointXZ
): { distance: Meters; closestPoint: PointXZ; t: number } {
  assertFinitePointXZ(point, 'point');
  assertFinitePointXZ(segStart, 'segStart');
  assertFinitePointXZ(segEnd, 'segEnd');

  const segVec = vectorSub(segEnd, segStart);
  const l2 = vectorLengthSq(segVec);

  if (l2 <= EPSILON * EPSILON) {
    return {
      distance: distance(point, segStart),
      closestPoint: { x: segStart.x, z: segStart.z },
      t: 0,
    };
  }

  const pVec = vectorSub(point, segStart);
  const rawT = dotProduct(pVec, segVec) / l2;
  const clampedT = Math.max(0, Math.min(1, rawT));

  const closestPoint: PointXZ = {
    x: segStart.x + clampedT * segVec.x,
    z: segStart.z + clampedT * segVec.z,
  };

  return {
    distance: distance(point, closestPoint),
    closestPoint,
    t: clampedT,
  };
}

/**
 * Checks whether a point lies on a line segment within epsilon tolerance.
 */
export function isPointOnSegment(
  point: PointXZ,
  segStart: PointXZ,
  segEnd: PointXZ,
  epsilon = EPSILON
): boolean {
  const { distance: d } = distancePointToSegment(point, segStart, segEnd);
  return d <= epsilon;
}

/**
 * Robustly classifies the intersection between two 2D line segments [a1, a2] and [b1, b2].
 * Inclusive: detects proper interior crossings, endpoint touches, T-junctions, and collinear overlaps.
 */
export function classifySegmentIntersection(
  a1: PointXZ,
  a2: PointXZ,
  b1: PointXZ,
  b2: PointXZ,
  epsilon = EPSILON
): SegmentIntersectionResult {
  assertFinitePointXZ(a1, 'a1');
  assertFinitePointXZ(a2, 'a2');
  assertFinitePointXZ(b1, 'b1');
  assertFinitePointXZ(b2, 'b2');

  const lenA2 = distanceSq(a1, a2);
  const lenB2 = distanceSq(b1, b2);

  // Handle degenerate segments (points)
  if (lenA2 <= epsilon * epsilon && lenB2 <= epsilon * epsilon) {
    if (pointsEqual(a1, b1, epsilon)) {
      return { type: 'endpoint_touch', intersects: true, point: { x: a1.x, z: a1.z } };
    }
    return { type: 'none', intersects: false };
  }
  if (lenA2 <= epsilon * epsilon) {
    if (isPointOnSegment(a1, b1, b2, epsilon)) {
      return { type: 'endpoint_touch', intersects: true, point: { x: a1.x, z: a1.z } };
    }
    return { type: 'none', intersects: false };
  }
  if (lenB2 <= epsilon * epsilon) {
    if (isPointOnSegment(b1, a1, a2, epsilon)) {
      return { type: 'endpoint_touch', intersects: true, point: { x: b1.x, z: b1.z } };
    }
    return { type: 'none', intersects: false };
  }

  const v = vectorSub(a2, a1);
  const w = vectorSub(b2, b1);
  const denom = crossProduct2D(v, w);

  // Check if segments are collinear or parallel
  const crossA = crossProductPoints(a1, a2, b1);
  const crossB = crossProductPoints(a1, a2, b2);

  const isCollinear =
    Math.abs(denom) <= epsilon &&
    Math.abs(crossA) <= epsilon * Math.sqrt(lenA2) &&
    Math.abs(crossB) <= epsilon * Math.sqrt(lenA2);

  if (isCollinear) {
    // Project all points onto line of segment A: t = (P - a1) · v / |v|^2
    const tB1 = dotProduct(vectorSub(b1, a1), v) / lenA2;
    const tB2 = dotProduct(vectorSub(b2, a1), v) / lenA2;

    const minB = Math.min(tB1, tB2);
    const maxB = Math.max(tB1, tB2);

    const overlapMin = Math.max(0, minB);
    const overlapMax = Math.min(1, maxB);

    if (overlapMax < overlapMin - epsilon) {
      return { type: 'none', intersects: false };
    }

    if (Math.abs(overlapMax - overlapMin) <= epsilon) {
      const pt: PointXZ = {
        x: a1.x + overlapMin * v.x,
        z: a1.z + overlapMin * v.z,
      };
      return { type: 'endpoint_touch', intersects: true, point: pt };
    }

    const pStart: PointXZ = {
      x: a1.x + overlapMin * v.x,
      z: a1.z + overlapMin * v.z,
    };
    const pEnd: PointXZ = {
      x: a1.x + overlapMax * v.x,
      z: a1.z + overlapMax * v.z,
    };

    return {
      type: 'collinear_overlap',
      intersects: true,
      overlap: [pStart, pEnd],
    };
  }

  // Parallel but not collinear
  if (Math.abs(denom) <= epsilon) {
    return { type: 'none', intersects: false };
  }

  // Non-parallel segments: solve for parameters tA and tB
  const u = vectorSub(b1, a1);
  const tA = crossProduct2D(u, w) / denom;
  const tB = crossProduct2D(u, v) / denom;

  const inBoundsA = tA >= -epsilon && tA <= 1 + epsilon;
  const inBoundsB = tB >= -epsilon && tB <= 1 + epsilon;

  if (!inBoundsA || !inBoundsB) {
    return { type: 'none', intersects: false };
  }

  const clampedTA = Math.max(0, Math.min(1, tA));
  const intersectionPoint: PointXZ = {
    x: a1.x + clampedTA * v.x,
    z: a1.z + clampedTA * v.z,
  };

  const isEndpointA = tA <= epsilon || tA >= 1 - epsilon;
  const isEndpointB = tB <= epsilon || tB >= 1 - epsilon;

  if (isEndpointA || isEndpointB) {
    return {
      type: 'endpoint_touch',
      intersects: true,
      point: intersectionPoint,
    };
  }

  return {
    type: 'cross',
    intersects: true,
    point: intersectionPoint,
  };
}

/**
 * Returns true if segments intersect inclusively (cross, touch at endpoint, or collinear overlap).
 */
export function segmentsIntersect(
  a1: PointXZ,
  a2: PointXZ,
  b1: PointXZ,
  b2: PointXZ,
  epsilon = EPSILON
): boolean {
  return classifySegmentIntersection(a1, a2, b1, b2, epsilon).intersects;
}

/**
 * Checks intersection and tangency between a circular footprint and a line segment.
 * @param center Circle center
 * @param radius Circle radius in meters
 * @param segStart Segment start
 * @param segEnd Segment end
 * @param clearance Additional clearance required around circle (default 0)
 * @param epsilon Numerical tolerance
 */
export function circleIntersectsSegment(
  center: PointXZ,
  radius: Meters,
  segStart: PointXZ,
  segEnd: PointXZ,
  clearance: Meters = 0,
  epsilon = EPSILON
): CircleSegmentIntersectionResult {
  assertFinitePointXZ(center, 'circle center');
  assertFiniteNumber(radius, 'radius', 0);
  assertFiniteNumber(clearance, 'clearance', 0);

  const effectiveRadius = radius + clearance;
  const { distance: d, closestPoint } = distancePointToSegment(center, segStart, segEnd);

  const intersects = d <= effectiveRadius + epsilon;
  const isTangent = Math.abs(d - effectiveRadius) <= epsilon;

  return {
    intersects,
    isTangent,
    distance: d,
    closestPoint,
  };
}

/**
 * Checks intersection and tangency between two circular footprints.
 * @param c1 Center of first circle
 * @param r1 Radius of first circle
 * @param c2 Center of second circle
 * @param r2 Radius of second circle
 * @param clearance Additional required clearance between them
 * @param epsilon Numerical tolerance
 */
export function circleIntersectsCircle(
  c1: PointXZ,
  r1: Meters,
  c2: PointXZ,
  r2: Meters,
  clearance: Meters = 0,
  epsilon = EPSILON
): CircleCircleIntersectionResult {
  assertFinitePointXZ(c1, 'circle 1 center');
  assertFinitePointXZ(c2, 'circle 2 center');
  assertFiniteNumber(r1, 'radius 1', 0);
  assertFiniteNumber(r2, 'radius 2', 0);
  assertFiniteNumber(clearance, 'clearance', 0);

  const d = distance(c1, c2);
  const threshold = r1 + r2 + clearance;

  const intersects = d <= threshold + epsilon;
  const isExternalTangent = Math.abs(d - threshold) <= epsilon;
  const isInternalTangent = d > epsilon && Math.abs(d - Math.abs(r1 - r2)) <= epsilon;

  return {
    intersects,
    isTangent: isExternalTangent || isInternalTangent,
    distance: d,
  };
}
