import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkFootprintCollision,
  distanceFootprintToPolygonBoundary,
  doesFootprintIntersectPolygon,
  doesFootprintIntersectSegment,
  isFootprintInsidePolygon,
  validateCircularFootprint,
} from '../domain/footprint.ts';

describe('footprint - Validation', () => {
  it('validates a correct circular footprint', () => {
    const fp = { center: { x: 2, z: 3 }, radius: 0.25 };
    const res = validateCircularFootprint(fp);
    assert.equal(res.valid, true);
  });

  it('rejects invalid radius', () => {
    assert.equal(validateCircularFootprint({ center: { x: 0, z: 0 }, radius: -1 }).valid, false);
    assert.equal(validateCircularFootprint({ center: { x: 0, z: 0 }, radius: 0 }).valid, false);
    assert.equal(validateCircularFootprint({ center: { x: 0, z: 0 }, radius: NaN }).valid, false);
  });

  it('rejects non-finite center coordinates', () => {
    assert.equal(validateCircularFootprint({ center: { x: NaN, z: 0 }, radius: 1 }).valid, false);
  });
});

describe('footprint - Collision & Clearance', () => {
  it('detects collision between two stanchions / circular footprints', () => {
    const f1 = { center: { x: 0, z: 0 }, radius: 0.2 };
    const f2 = { center: { x: 0.35, z: 0 }, radius: 0.2 };

    // Distance 0.35 < r1 + r2 (0.40) -> collision!
    const col = checkFootprintCollision(f1, f2);
    assert.equal(col.intersects, true);
    assert.equal(col.isTangent, false);
  });

  it('detects tangency between two footprints', () => {
    const f1 = { center: { x: 0, z: 0 }, radius: 0.2 };
    const f2 = { center: { x: 0.4, z: 0 }, radius: 0.2 };

    const col = checkFootprintCollision(f1, f2);
    assert.equal(col.intersects, true);
    assert.equal(col.isTangent, true);
  });

  it('respects clearance in footprint collision', () => {
    const f1 = { center: { x: 0, z: 0 }, radius: 0.2 };
    const f2 = { center: { x: 0.5, z: 0 }, radius: 0.2 };

    // Distance 0.5 > 0.40 -> without clearance: no collision
    assert.equal(checkFootprintCollision(f1, f2, 0).intersects, false);
    // With clearance of 0.10: threshold 0.2 + 0.2 + 0.1 = 0.5 -> tangent/collision!
    assert.equal(checkFootprintCollision(f1, f2, 0.1).intersects, true);
  });

  it('doesFootprintIntersectSegment tests collision with barrier/wall segment', () => {
    const fp = { center: { x: 2, z: 0.15 }, radius: 0.2 };
    const a = { x: 0, z: 0 };
    const b = { x: 4, z: 0 };

    const res = doesFootprintIntersectSegment(fp, a, b);
    assert.equal(res.intersects, true);
    assert.equal(res.distance, 0.15);
  });
});

describe('footprint - Inclusion in Perimeter & Restricted Areas', () => {
  // Room: 10m x 10m
  const room = [
    { x: 0, z: 0 },
    { x: 10, z: 0 },
    { x: 10, z: 10 },
    { x: 0, z: 10 },
  ];

  it('isFootprintInsidePolygon returns true when fully inside with required clearance', () => {
    const fp = { center: { x: 5, z: 5 }, radius: 0.5 };
    assert.equal(isFootprintInsidePolygon(fp, room, 0), true);
    assert.equal(isFootprintInsidePolygon(fp, room, 2.0), true); // 5m to edge >= 0.5 + 2.0
  });

  it('isFootprintInsidePolygon returns false when center is inside but circle extends beyond wall', () => {
    const fpNearWall = { center: { x: 0.3, z: 5 }, radius: 0.5 };
    // Center is inside, but distance to left wall is 0.3 < radius 0.5
    assert.equal(isFootprintInsidePolygon(fpNearWall, room, 0), false);
  });

  it('isFootprintInsidePolygon returns false when center is outside room', () => {
    const fpOutside = { center: { x: -1, z: 5 }, radius: 0.5 };
    assert.equal(isFootprintInsidePolygon(fpOutside, room, 0), false);
  });

  it('doesFootprintIntersectPolygon detects contact with restricted area (inclusive)', () => {
    // Restricted area in the center of the room: 4,4 to 6,6
    const restrictedArea = [
      { x: 4, z: 4 },
      { x: 6, z: 4 },
      { x: 6, z: 6 },
      { x: 4, z: 6 },
    ];

    // Inside restricted area
    const fpInside = { center: { x: 5, z: 5 }, radius: 0.2 };
    assert.equal(doesFootprintIntersectPolygon(fpInside, restrictedArea), true);

    // Center outside, but footprint overlaps boundary
    const fpOverlapping = { center: { x: 3.9, z: 5 }, radius: 0.2 };
    assert.equal(doesFootprintIntersectPolygon(fpOverlapping, restrictedArea), true);

    // Tangent to boundary (contact with restricted area is conflict!)
    const fpTangent = { center: { x: 3.8, z: 5 }, radius: 0.2 };
    assert.equal(doesFootprintIntersectPolygon(fpTangent, restrictedArea), true);

    // Far outside restricted area
    const fpClear = { center: { x: 1, z: 1 }, radius: 0.2 };
    assert.equal(doesFootprintIntersectPolygon(fpClear, restrictedArea), false);
  });

  it('distanceFootprintToPolygonBoundary computes clearance margin', () => {
    const fp = { center: { x: 3, z: 5 }, radius: 0.5 };
    const { minDistance, margin } = distanceFootprintToPolygonBoundary(fp, room);
    assert.equal(minDistance, 3); // nearest wall is x = 0 at distance 3
    assert.equal(margin, 2.5); // 3.0 - 0.5 = 2.5m clearance margin
  });
});
