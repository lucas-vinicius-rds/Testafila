import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isClockwise,
  isCounterClockwise,
  isPointInPolygon,
  perimeterLength,
  polygonArea,
  polygonCentroid,
  polygonSignedArea,
  validateSimplePolygon,
} from '../domain/polygon.ts';

describe('polygon - Area, Perimeter, Winding, Centroid', () => {
  // Rectangle 4m x 3m (area 12 m², perimeter 14m)
  // Counter-Clockwise in XZ: (0,0) -> (4,0) -> (4,3) -> (0,3)
  const rectCCW = [
    { x: 0, z: 0 },
    { x: 4, z: 0 },
    { x: 4, z: 3 },
    { x: 0, z: 3 },
  ];

  it('polygonSignedArea and polygonArea calculate exact metric area', () => {
    assert.equal(polygonSignedArea(rectCCW), 12);
    assert.equal(polygonArea(rectCCW), 12);

    // Reversed winding (CW)
    const rectCW = [...rectCCW].reverse();
    assert.equal(polygonSignedArea(rectCW), -12);
    assert.equal(polygonArea(rectCW), 12);
  });

  it('perimeterLength computes full closed perimeter', () => {
    assert.equal(perimeterLength(rectCCW), 14);
  });

  it('isClockwise and isCounterClockwise identify winding', () => {
    assert.equal(isCounterClockwise(rectCCW), true);
    assert.equal(isClockwise(rectCCW), false);

    const rectCW = [...rectCCW].reverse();
    assert.equal(isClockwise(rectCW), true);
    assert.equal(isCounterClockwise(rectCW), false);
  });

  it('polygonCentroid computes geometric center', () => {
    const c = polygonCentroid(rectCCW);
    assert.equal(c.x, 2);
    assert.equal(c.z, 1.5);
  });
});

describe('polygon - validateSimplePolygon', () => {
  it('approves a valid rectangle', () => {
    const rect = [
      { id: 'v1', x: 0, z: 0 },
      { id: 'v2', x: 5, z: 0 },
      { id: 'v3', x: 5, z: 4 },
      { id: 'v4', x: 0, z: 4 },
    ];
    const res = validateSimplePolygon(rect, { requireUniqueIds: true });
    assert.equal(res.valid, true);
    assert.equal(res.errors.length, 0);
  });

  it('rejects less than 3 vertices', () => {
    const line = [
      { x: 0, z: 0 },
      { x: 1, z: 1 },
    ];
    const res = validateSimplePolygon(line);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes('at least 3 vertices')));
  });

  it('rejects repeating first vertex at end (implicit closure rule)', () => {
    const explicitClosed = [
      { x: 0, z: 0 },
      { x: 5, z: 0 },
      { x: 5, z: 4 },
      { x: 0, z: 4 },
      { x: 0, z: 0 }, // Repeats first!
    ];
    const res = validateSimplePolygon(explicitClosed);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes('closure must be implicit')));
  });

  it('rejects non-finite coordinates', () => {
    const invalidPts = [
      { x: 0, z: 0 },
      { x: NaN, z: 0 },
      { x: 5, z: 4 },
    ];
    const res = validateSimplePolygon(invalidPts);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes('non-finite coordinates')));
  });

  it('rejects coordinates exceeding metric bounds', () => {
    const hugePts = [
      { x: 0, z: 0 },
      { x: 20_000, z: 0 },
      { x: 0, z: 20_000 },
    ];
    const res = validateSimplePolygon(hugePts, { maxCoordinate: 10_000 });
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes('exceeds metric bounds')));
  });

  it('rejects duplicate vertex IDs', () => {
    const dupeIds = [
      { id: 'v1', x: 0, z: 0 },
      { id: 'v2', x: 5, z: 0 },
      { id: 'v1', x: 5, z: 4 },
    ];
    const res = validateSimplePolygon(dupeIds, { requireUniqueIds: true });
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes("Duplicate vertex id 'v1'")));
  });

  it('rejects duplicate/coincident vertices', () => {
    const dupePts = [
      { x: 0, z: 0 },
      { x: 5, z: 0 },
      { x: 5, z: 0 }, // Duplicate of previous
      { x: 0, z: 5 },
    ];
    const res = validateSimplePolygon(dupePts);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes('coincident / duplicates') || e.includes('zero length')));
  });

  it('rejects self-intersecting polygon (bow-tie / figure 8)', () => {
    const bowTie = [
      { x: 0, z: 0 },
      { x: 4, z: 4 },
      { x: 4, z: 0 },
      { x: 0, z: 4 },
    ];
    const res = validateSimplePolygon(bowTie);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes('Self-intersection')));
  });

  it('rejects collinear / zero-area polygon', () => {
    const flatLine = [
      { x: 0, z: 0 },
      { x: 2, z: 0 },
      { x: 5, z: 0 },
    ];
    const res = validateSimplePolygon(flatLine);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes('surface area')));
  });
});

describe('polygon - isPointInPolygon', () => {
  const polygon = [
    { x: 0, z: 0 },
    { x: 10, z: 0 },
    { x: 10, z: 10 },
    { x: 0, z: 10 },
  ];

  it('identifies interior points', () => {
    const res = isPointInPolygon({ x: 5, z: 5 }, polygon);
    assert.equal(res.inside, true);
    assert.equal(res.onBoundary, false);
  });

  it('identifies exterior points', () => {
    const res = isPointInPolygon({ x: -1, z: 5 }, polygon);
    assert.equal(res.inside, false);
    assert.equal(res.onBoundary, false);
  });

  it('identifies points on the boundary inclusively', () => {
    const res1 = isPointInPolygon({ x: 5, z: 0 }, polygon); // on bottom edge
    assert.equal(res1.inside, true);
    assert.equal(res1.onBoundary, true);

    const res2 = isPointInPolygon({ x: 0, z: 0 }, polygon); // on vertex
    assert.equal(res2.inside, true);
    assert.equal(res2.onBoundary, true);
  });

  it('correctly handles non-convex (L-shape) polygons', () => {
    // L-shaped polygon:
    // (0,0) -> (6,0) -> (6,3) -> (3,3) -> (3,6) -> (0,6)
    const lShape = [
      { x: 0, z: 0 },
      { x: 6, z: 0 },
      { x: 6, z: 3 },
      { x: 3, z: 3 },
      { x: 3, z: 6 },
      { x: 0, z: 6 },
    ];

    // Inside bottom branch
    assert.equal(isPointInPolygon({ x: 5, z: 1 }, lShape).inside, true);
    // Inside vertical branch
    assert.equal(isPointInPolygon({ x: 1, z: 5 }, lShape).inside, true);
    // Inside the concave cutout (outside polygon)
    assert.equal(isPointInPolygon({ x: 5, z: 5 }, lShape).inside, false);
  });
});
