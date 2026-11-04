import type { Meters, PointXZ, Vertex } from './types.ts';
import type { PointInPolygonResult, ValidationResult } from './types.ts';
import {
  DEFAULT_MAX_METRIC_BOUND,
  EPSILON,
  assertFinitePointXZ,
  crossProductPoints,
  distance,
  distanceSq,
  dotProduct,
  isFiniteNumber,
  isFinitePointXZ,
  pointsEqual,
  vectorLength,
  vectorSub,
} from './math2d.ts';
import {
  classifySegmentIntersection,
  distancePointToSegment,
  isPointOnSegment,
} from './intersection.ts';

/**
 * Computes the signed area of a 2D polygon using the Shoelace formula.
 * Vertices are implicitly closed (last vertex connects back to the first).
 */
export function polygonSignedArea(vertices: readonly PointXZ[]): number {
  if (!Array.isArray(vertices)) return 0;
  const n = vertices.length;
  if (n < 3) return 0;

  let sum = 0;
  for (let i = 0; i < n; i++) {
    const cur = vertices[i];
    const next = vertices[(i + 1) % n];
    if (!cur || !next || typeof cur !== 'object' || typeof next !== 'object') return 0;
    sum += cur.x * next.z - next.x * cur.z;
  }
  return sum / 2;
}

/**
 * Computes the positive surface area of a 2D polygon in square meters.
 */
export function polygonArea(vertices: readonly PointXZ[]): Meters {
  return Math.abs(polygonSignedArea(vertices));
}

/**
 * Computes the total perimeter length in meters, including implicit closure (last to first).
 */
export function perimeterLength(vertices: readonly PointXZ[]): Meters {
  if (!Array.isArray(vertices)) return 0;
  const n = vertices.length;
  if (n < 2) return 0;

  let total: Meters = 0;
  for (let i = 0; i < n; i++) {
    const cur = vertices[i];
    const next = vertices[(i + 1) % n];
    if (!cur || !next || typeof cur !== 'object' || typeof next !== 'object') continue;
    total += distance(cur, next);
  }
  return total;
}

/**
 * Returns true if vertices are wound counter-clockwise in the XZ plane.
 */
export function isCounterClockwise(vertices: readonly PointXZ[]): boolean {
  return polygonSignedArea(vertices) > EPSILON;
}

/**
 * Returns true if vertices are wound clockwise in the XZ plane.
 */
export function isClockwise(vertices: readonly PointXZ[]): boolean {
  return polygonSignedArea(vertices) < -EPSILON;
}

/**
 * Computes the geometric centroid of a simple polygon.
 */
export function polygonCentroid(vertices: readonly PointXZ[]): PointXZ {
  const n = vertices.length;
  if (n === 0) throw new Error('Cannot compute centroid of empty vertices');
  if (n === 1) return { x: vertices[0]!.x, z: vertices[0]!.z };
  if (n === 2) {
    return {
      x: (vertices[0]!.x + vertices[1]!.x) / 2,
      z: (vertices[0]!.z + vertices[1]!.z) / 2,
    };
  }

  const signedArea = polygonSignedArea(vertices);
  if (Math.abs(signedArea) <= EPSILON) {
    // Degenerate collinear polygon: fallback to average of points
    let sumX = 0;
    let sumZ = 0;
    for (const v of vertices) {
      sumX += v.x;
      sumZ += v.z;
    }
    return { x: sumX / n, z: sumZ / n };
  }

  let cx = 0;
  let cz = 0;
  for (let i = 0; i < n; i++) {
    const cur = vertices[i]!;
    const next = vertices[(i + 1) % n]!;
    const factor = cur.x * next.z - next.x * cur.z;
    cx += (cur.x + next.x) * factor;
    cz += (cur.z + next.z) * factor;
  }

  const divisor = 6 * signedArea;
  return {
    x: cx / divisor,
    z: cz / divisor,
  };
}

/**
 * Options for polygon validation.
 */
export interface PolygonValidationOptions {
  requireUniqueIds?: boolean;
  maxCoordinate?: number;
  minArea?: Meters;
  epsilon?: number;
}

/**
 * Validates whether a list of vertices defines a mathematically sound simple polygon.
 * Rules enforced:
 * - Minimum 3 vertices.
 * - All coordinates are finite numbers within metric sanity bounds.
 * - Unique entity IDs when provided.
 * - No implicit repetition: last vertex must not equal the first vertex.
 * - No duplicate vertices (distance < epsilon).
 * - No zero-length edges.
 * - No adjacent edge reversals (folding back 180 degrees).
 * - No self-intersections (proper cross, touching, or collinear overlap between non-adjacent edges).
 * - Area strictly positive (> minArea).
 */
export function validateSimplePolygon(
  vertices: readonly (PointXZ | Vertex)[],
  options: PolygonValidationOptions = {}
): ValidationResult {
  const errors: string[] = [];
  const eps = options.epsilon ?? EPSILON;
  const maxCoord = options.maxCoordinate ?? DEFAULT_MAX_METRIC_BOUND;
  const minArea = options.minArea ?? eps;
  const n = vertices.length;

  if (n < 3) {
    errors.push(`Polygon must have at least 3 vertices, received: ${n}`);
    return { valid: false, errors };
  }

  // Check validity of elements, unique IDs and coordinates finiteness
  const seenIds = new Set<string>();
  for (let i = 0; i < n; i++) {
    const v = vertices[i];
    if (!v || typeof v !== 'object') {
      errors.push(`Vertex at index ${i} is not a valid object`);
      continue;
    }

    if (options.requireUniqueIds) {
      const vObj = v as Partial<Vertex>;
      if (!vObj.id || typeof vObj.id !== 'string') {
        errors.push(`Vertex at index ${i} is missing a valid string id`);
      } else if (seenIds.has(vObj.id)) {
        errors.push(`Duplicate vertex id '${vObj.id}' found at index ${i}`);
      } else {
        seenIds.add(vObj.id);
      }
    }

    if (!isFinitePointXZ(v)) {
      const px = (v as Partial<PointXZ>).x;
      const pz = (v as Partial<PointXZ>).z;
      errors.push(`Vertex at index ${i} has non-finite coordinates: x=${String(px)}, z=${String(pz)}`);
      continue;
    }

    if (Math.abs(v.x) > maxCoord || Math.abs(v.z) > maxCoord) {
      errors.push(`Vertex at index ${i} exceeds metric bounds (+/- ${maxCoord}m): (${v.x}, ${v.z})`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Check implicit closure rule: last vertex must NOT repeat first vertex
  if (pointsEqual(vertices[0]!, vertices[n - 1]!, eps)) {
    errors.push('Last vertex repeats first vertex; polygon closure must be implicit');
  }

  // Check for duplicate / coincident vertices anywhere
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (pointsEqual(vertices[i]!, vertices[j]!, eps)) {
        errors.push(`Vertices at indices ${i} and ${j} are coincident / duplicates at (${vertices[i]!.x}, ${vertices[i]!.z})`);
      }
    }
  }

  // Check for zero-length edges
  for (let i = 0; i < n; i++) {
    const cur = vertices[i]!;
    const next = vertices[(i + 1) % n]!;
    const edgeLen = distance(cur, next);
    if (edgeLen <= eps) {
      errors.push(`Edge from index ${i} to ${(i + 1) % n} has degenerate zero length (${edgeLen.toFixed(8)}m)`);
    }
  }

  // Check adjacent edge reversal (folding back 180 degrees)
  for (let i = 0; i < n; i++) {
    const prev = vertices[(i - 1 + n) % n]!;
    const cur = vertices[i]!;
    const next = vertices[(i + 1) % n]!;

    const v1 = vectorSub(cur, prev);
    const v2 = vectorSub(next, cur);
    const len1 = vectorLength(v1);
    const len2 = vectorLength(v2);

    if (len1 > eps && len2 > eps) {
      const dot = dotProduct(v1, v2);
      // If dot / (len1 * len2) is close to -1, edge folds back completely
      const cosAngle = dot / (len1 * len2);
      if (cosAngle <= -1 + 1e-5) {
        errors.push(`Polygon folds back 180 degrees onto itself at vertex ${i}`);
      }
    }
  }

  // Check self-intersection between non-adjacent edges
  // Edges are e_i: [vertices[i], vertices[(i+1)%n]]
  for (let i = 0; i < n; i++) {
    const a1 = vertices[i]!;
    const a2 = vertices[(i + 1) % n]!;

    for (let j = i + 1; j < n; j++) {
      // Check if edges are adjacent
      const isAdjacent =
        j === i ||
        j === (i + 1) % n ||
        (i === 0 && j === n - 1);

      if (isAdjacent) continue;

      const b1 = vertices[j]!;
      const b2 = vertices[(j + 1) % n]!;

      const result = classifySegmentIntersection(a1, a2, b1, b2, eps);
      if (result.intersects) {
        errors.push(
          `Self-intersection (${result.type}) between edge ${i}->${(i + 1) % n} and edge ${j}->${(j + 1) % n}`
        );
      }
    }
  }

  // Check non-zero surface area
  const area = polygonArea(vertices);
  if (area <= minArea) {
    errors.push(`Polygon surface area (${area.toFixed(6)} m²) is degenerate or below minimum ${minArea} m²`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Checks if a 2D point is inside, outside, or on the boundary of a simple polygon.
 * Boundary check is performed with inclusive epsilon.
 * Interior check uses the winding number algorithm.
 */
export function isPointInPolygon(
  point: PointXZ,
  vertices: readonly PointXZ[],
  epsilon = EPSILON
): PointInPolygonResult {
  assertFinitePointXZ(point, 'point');
  const n = vertices.length;
  if (n < 3) {
    return { inside: false, onBoundary: false };
  }

  // 1. Check boundary inclusively
  for (let i = 0; i < n; i++) {
    const cur = vertices[i]!;
    const next = vertices[(i + 1) % n]!;
    if (isPointOnSegment(point, cur, next, epsilon)) {
      return { inside: true, onBoundary: true };
    }
  }

  // 2. Winding number algorithm for robust interior test
  let windingNumber = 0;
  for (let i = 0; i < n; i++) {
    const v1 = vertices[i]!;
    const v2 = vertices[(i + 1) % n]!;

    if (v1.z <= point.z) {
      if (v2.z > point.z) {
        // Upward edge crossing
        const cross = crossProductPoints(v1, v2, point);
        if (cross > epsilon) {
          windingNumber++;
        }
      }
    } else {
      if (v2.z <= point.z) {
        // Downward edge crossing
        const cross = crossProductPoints(v1, v2, point);
        if (cross < -epsilon) {
          windingNumber--;
        }
      }
    }
  }

  const inside = windingNumber !== 0;
  return { inside, onBoundary: false };
}
