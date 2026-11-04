import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  circleIntersectsCircle,
  circleIntersectsSegment,
  classifySegmentIntersection,
  distancePointToSegment,
  isPointOnSegment,
  segmentsIntersect,
} from '../domain/intersection.ts';

describe('intersection - Point to Segment', () => {
  it('distancePointToSegment computes perpendicular projection within segment', () => {
    const a = { x: 0, z: 0 };
    const b = { x: 10, z: 0 };
    const p = { x: 4, z: 3 };

    const res = distancePointToSegment(p, a, b);
    assert.equal(res.distance, 3);
    assert.equal(res.closestPoint.x, 4);
    assert.equal(res.closestPoint.z, 0);
    assert.equal(res.t, 0.4);
  });

  it('distancePointToSegment clamps to endpoints', () => {
    const a = { x: 0, z: 0 };
    const b = { x: 10, z: 0 };

    // Point before segment start
    const p1 = { x: -3, z: 4 };
    const res1 = distancePointToSegment(p1, a, b);
    assert.equal(res1.distance, 5);
    assert.equal(res1.closestPoint.x, 0);
    assert.equal(res1.closestPoint.z, 0);
    assert.equal(res1.t, 0);

    // Point after segment end
    const p2 = { x: 13, z: 4 };
    const res2 = distancePointToSegment(p2, a, b);
    assert.equal(res2.distance, 5);
    assert.equal(res2.closestPoint.x, 10);
    assert.equal(res2.closestPoint.z, 0);
    assert.equal(res2.t, 1);
  });

  it('isPointOnSegment tests inclusion', () => {
    const a = { x: 0, z: 0 };
    const b = { x: 4, z: 0 };

    assert.equal(isPointOnSegment({ x: 2, z: 0 }, a, b), true);
    assert.equal(isPointOnSegment({ x: 0, z: 0 }, a, b), true); // start endpoint
    assert.equal(isPointOnSegment({ x: 4, z: 0 }, a, b), true); // end endpoint
    assert.equal(isPointOnSegment({ x: 5, z: 0 }, a, b), false); // collinear but beyond
    assert.equal(isPointOnSegment({ x: 2, z: 0.1 }, a, b), false); // off line
  });
});

describe('intersection - Inclusive Segment-Segment Intersection & Collinearity', () => {
  it('detects interior cross', () => {
    const a1 = { x: 0, z: 0 };
    const a2 = { x: 4, z: 4 };
    const b1 = { x: 0, z: 4 };
    const b2 = { x: 4, z: 0 };

    const res = classifySegmentIntersection(a1, a2, b1, b2);
    assert.equal(res.intersects, true);
    assert.equal(res.type, 'cross');
    assert.ok(res.point);
    assert.equal(Math.round(res.point.x), 2);
    assert.equal(Math.round(res.point.z), 2);
    assert.equal(segmentsIntersect(a1, a2, b1, b2), true);
  });

  it('detects endpoint touching (shared corner)', () => {
    const a1 = { x: 0, z: 0 };
    const a2 = { x: 2, z: 0 };
    const b1 = { x: 2, z: 0 };
    const b2 = { x: 2, z: 2 };

    const res = classifySegmentIntersection(a1, a2, b1, b2);
    assert.equal(res.intersects, true);
    assert.equal(res.type, 'endpoint_touch');
    assert.ok(res.point);
    assert.equal(res.point.x, 2);
    assert.equal(res.point.z, 0);
  });

  it('detects T-junction touching (endpoint on interior of other segment)', () => {
    const a1 = { x: 0, z: 0 };
    const a2 = { x: 10, z: 0 };
    const b1 = { x: 5, z: 0 };
    const b2 = { x: 5, z: 5 };

    const res = classifySegmentIntersection(a1, a2, b1, b2);
    assert.equal(res.intersects, true);
    assert.equal(res.type, 'endpoint_touch');
    assert.ok(res.point);
    assert.equal(res.point.x, 5);
    assert.equal(res.point.z, 0);
  });

  it('detects collinear overlapping segments', () => {
    const a1 = { x: 0, z: 0 };
    const a2 = { x: 6, z: 0 };
    const b1 = { x: 3, z: 0 };
    const b2 = { x: 9, z: 0 };

    const res = classifySegmentIntersection(a1, a2, b1, b2);
    assert.equal(res.intersects, true);
    assert.equal(res.type, 'collinear_overlap');
    assert.ok(res.overlap);
    assert.equal(res.overlap[0].x, 3);
    assert.equal(res.overlap[1].x, 6);
  });

  it('detects collinear touching at single endpoint', () => {
    const a1 = { x: 0, z: 0 };
    const a2 = { x: 5, z: 0 };
    const b1 = { x: 5, z: 0 };
    const b2 = { x: 10, z: 0 };

    const res = classifySegmentIntersection(a1, a2, b1, b2);
    assert.equal(res.intersects, true);
    assert.equal(res.type, 'endpoint_touch');
    assert.ok(res.point);
    assert.equal(res.point.x, 5);
  });

  it('returns none for parallel or non-overlapping disjoint segments', () => {
    const a1 = { x: 0, z: 0 };
    const a2 = { x: 5, z: 0 };
    const b1 = { x: 0, z: 2 };
    const b2 = { x: 5, z: 2 };
    assert.equal(classifySegmentIntersection(a1, a2, b1, b2).intersects, false);

    const c1 = { x: 10, z: 0 };
    const c2 = { x: 15, z: 0 };
    assert.equal(classifySegmentIntersection(a1, a2, c1, c2).intersects, false);
  });
});

describe('intersection - Circle-Segment Tangency & Collision', () => {
  it('detects penetrating intersection', () => {
    const center = { x: 2, z: 1 };
    const radius = 1.5;
    const a = { x: 0, z: 0 };
    const b = { x: 4, z: 0 };

    const res = circleIntersectsSegment(center, radius, a, b);
    assert.equal(res.intersects, true);
    assert.equal(res.isTangent, false);
    assert.equal(res.distance, 1);
  });

  it('detects exact tangency to segment', () => {
    const center = { x: 2, z: 2 };
    const radius = 2.0;
    const a = { x: 0, z: 0 };
    const b = { x: 4, z: 0 };

    const res = circleIntersectsSegment(center, radius, a, b);
    assert.equal(res.intersects, true);
    assert.equal(res.isTangent, true);
    assert.equal(res.distance, 2);
  });

  it('returns false for disjoint circle and segment', () => {
    const center = { x: 2, z: 5 };
    const radius = 2.0;
    const a = { x: 0, z: 0 };
    const b = { x: 4, z: 0 };

    const res = circleIntersectsSegment(center, radius, a, b);
    assert.equal(res.intersects, false);
    assert.equal(res.isTangent, false);
  });

  it('respects clearance in circle-segment collision', () => {
    const center = { x: 2, z: 3 };
    const radius = 1.0;
    const a = { x: 0, z: 0 };
    const b = { x: 4, z: 0 };

    // Distance is 3, radius is 1 -> without clearance, no collision
    assert.equal(circleIntersectsSegment(center, radius, a, b, 0).intersects, false);
    // With clearance of 2.0 -> effective radius is 3.0 -> tangent/collision!
    const res = circleIntersectsSegment(center, radius, a, b, 2.0);
    assert.equal(res.intersects, true);
    assert.equal(res.isTangent, true);
  });
});

describe('intersection - Circle-Circle Tangency & Collision', () => {
  it('detects overlapping circles', () => {
    const c1 = { x: 0, z: 0 };
    const c2 = { x: 3, z: 0 };
    const res = circleIntersectsCircle(c1, 2, c2, 2);
    assert.equal(res.intersects, true);
    assert.equal(res.isTangent, false);
    assert.equal(res.distance, 3);
  });

  it('detects external tangency', () => {
    const c1 = { x: 0, z: 0 };
    const c2 = { x: 4, z: 0 };
    const res = circleIntersectsCircle(c1, 2, c2, 2);
    assert.equal(res.intersects, true);
    assert.equal(res.isTangent, true);
  });

  it('detects internal tangency', () => {
    const c1 = { x: 0, z: 0 };
    const c2 = { x: 2, z: 0 };
    const res = circleIntersectsCircle(c1, 5, c2, 3);
    assert.equal(res.intersects, true);
    assert.equal(res.isTangent, true);
  });

  it('returns false for disjoint circles', () => {
    const c1 = { x: 0, z: 0 };
    const c2 = { x: 10, z: 0 };
    const res = circleIntersectsCircle(c1, 2, c2, 2);
    assert.equal(res.intersects, false);
    assert.equal(res.isTangent, false);
  });
});
