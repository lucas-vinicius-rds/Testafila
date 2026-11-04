import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeObservedErrorPercent,
  createMeasurementEvidence,
  evaluateMeasurementTolerance,
  isValidIsoDateString,
  validateMeasurementEvidence,
} from '../domain/measurement.ts';
import type { Vertex } from '../domain/types.ts';

describe('measurement - ISO Date & Error Calculation', () => {
  it('isValidIsoDateString checks valid ISO date strings', () => {
    assert.equal(isValidIsoDateString('2026-10-22T19:00:00.000Z'), true);
    assert.equal(isValidIsoDateString('2026-10-22'), true);
    assert.equal(isValidIsoDateString('invalid-date'), false);
    assert.equal(isValidIsoDateString(''), false);
    assert.equal(isValidIsoDateString(null), false);
  });

  const vertices: Vertex[] = [
    { id: 'v1', x: 0, z: 0 },
    { id: 'v2', x: 10, z: 0 }, // distance = 10m
    { id: 'v3', x: 10, z: 5 }, // distance from v2 = 5m
  ];

  it('computeObservedErrorPercent computes max percentage error across checks', () => {
    const checks = [
      { fromVertexId: 'v1', toVertexId: 'v2', measuredMeters: 10.0 }, // error = 0%
      { fromVertexId: 'v2', toVertexId: 'v3', measuredMeters: 5.2 }, // model=5, measured=5.2 -> err = 100*0.2/5.2 = 3.846%
    ];
    const maxErr = computeObservedErrorPercent(checks, vertices);
    assert.ok(maxErr !== undefined);
    assert.equal(Math.round(maxErr * 1000) / 1000, 3.846);
  });

  it('computeObservedErrorPercent returns undefined for empty checks (never assume zero)', () => {
    assert.equal(computeObservedErrorPercent([], vertices), undefined);
  });
});

describe('measurement - validateMeasurementEvidence', () => {
  const vertices: Vertex[] = [
    { id: 'v1', x: 0, z: 0 },
    { id: 'v2', x: 4, z: 0 },
    { id: 'v3', x: 4, z: 3 },
  ];

  it('approves valid evidence with accurate observedErrorPercent', () => {
    const evidence = {
      source: 'calibrated' as const,
      recordedAt: '2026-10-22T12:00:00Z',
      checks: [{ fromVertexId: 'v1', toVertexId: 'v2', measuredMeters: 4.0 }],
      observedErrorPercent: 0,
    };
    const res = validateMeasurementEvidence(evidence, vertices);
    assert.equal(res.valid, true);
    assert.equal(res.derivedErrorPercent, 0);
  });

  it('rejects invalid measurement source', () => {
    const evidence = {
      source: 'sensor_guess' as any,
      recordedAt: '2026-10-22T12:00:00Z',
      checks: [],
    };
    const res = validateMeasurementEvidence(evidence, vertices);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes('Invalid measurement source')));
  });

  it('rejects invalid recordedAt format', () => {
    const evidence = {
      source: 'manual' as const,
      recordedAt: 'not-a-date',
      checks: [],
    };
    const res = validateMeasurementEvidence(evidence, vertices);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes('recordedAt')));
  });

  it('rejects check with missing vertices', () => {
    const evidence = {
      source: 'manual' as const,
      recordedAt: '2026-10-22T12:00:00Z',
      checks: [{ fromVertexId: 'v1', toVertexId: 'v999', measuredMeters: 5.0 }],
    };
    const res = validateMeasurementEvidence(evidence, vertices);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes("non-existent toVertexId 'v999'")));
  });

  it('rejects check with identical endpoints', () => {
    const evidence = {
      source: 'manual' as const,
      recordedAt: '2026-10-22T12:00:00Z',
      checks: [{ fromVertexId: 'v1', toVertexId: 'v1', measuredMeters: 5.0 }],
    };
    const res = validateMeasurementEvidence(evidence, vertices);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes('identical endpoints')));
  });

  it('rejects check with non-positive or non-finite measuredMeters', () => {
    const evidence = {
      source: 'manual' as const,
      recordedAt: '2026-10-22T12:00:00Z',
      checks: [{ fromVertexId: 'v1', toVertexId: 'v2', measuredMeters: 0 }],
    };
    const res = validateMeasurementEvidence(evidence, vertices);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes('measuredMeters')));
  });

  it('rejects referenced NaN and Infinity coordinates without deriving an error', () => {
    const evidence = {
      source: 'manual' as const,
      recordedAt: '2026-10-22T12:00:00Z',
      checks: [{ fromVertexId: 'a', toVertexId: 'b', measuredMeters: 10 }],
    };
    for (const badX of [NaN, Infinity]) {
      const result = validateMeasurementEvidence(evidence, [
        { id: 'a', x: badX, z: 0 },
        { id: 'b', x: 10, z: 0 },
      ]);
      assert.equal(result.valid, false);
      assert.equal(result.derivedErrorPercent, undefined);
      assert.ok(result.errors.some((error) => error.includes('non-finite coordinates')));
      assert.throws(
        () => computeObservedErrorPercent(evidence.checks, [
          { id: 'a', x: badX, z: 0 },
          { id: 'b', x: 10, z: 0 },
        ]),
        /finite XZ coordinates/
      );
    }
  });

  it('rejects duplicate and blank vertex IDs', () => {
    const evidence = {
      source: 'manual' as const,
      recordedAt: '2026-10-22T12:00:00Z',
      checks: [{ fromVertexId: 'a', toVertexId: 'b', measuredMeters: 10 }],
    };
    const duplicate = validateMeasurementEvidence(evidence, [
      { id: 'a', x: 0, z: 0 },
      { id: 'a', x: 10, z: 0 },
      { id: 'b', x: 10, z: 0 },
    ]);
    assert.equal(duplicate.valid, false);
    assert.ok(duplicate.errors.some((error) => error.includes('Duplicate vertex ID')));
    const blank = validateMeasurementEvidence(evidence, [
      { id: ' ', x: 0, z: 0 },
      { id: 'b', x: 10, z: 0 },
    ]);
    assert.equal(blank.valid, false);
    assert.ok(blank.errors.some((error) => error.includes('non-empty string IDs')));
  });

  it('computeObservedErrorPercent never turns a non-finite derived error into zero', () => {
    assert.throws(() => computeObservedErrorPercent(
      [{ fromVertexId: 'a', toVertexId: 'b', measuredMeters: 1 }],
      [{ id: 'a', x: -1e308, z: 0 }, { id: 'b', x: 1e308, z: 0 }]
    ), /Derived measurement error must be finite/);
  });

  it('rejects observedErrorPercent present when checks is empty (contract rule)', () => {
    const evidence = {
      source: 'manual' as const,
      recordedAt: '2026-10-22T12:00:00Z',
      checks: [],
      observedErrorPercent: 0, // Must be omitted when checks is empty!
    };
    const res = validateMeasurementEvidence(evidence, vertices);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes('observedErrorPercent must be omitted when checks array is empty')));
  });

  it('rejects stated observedErrorPercent that mismatches derived calculation', () => {
    const evidence = {
      source: 'calibrated' as const,
      recordedAt: '2026-10-22T12:00:00Z',
      checks: [{ fromVertexId: 'v1', toVertexId: 'v2', measuredMeters: 4.4 }], // model is 4.0, err = 9.09%
      observedErrorPercent: 1.0, // Incorrectly stated as 1.0%!
    };
    const res = validateMeasurementEvidence(evidence, vertices);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes('observedErrorPercent mismatch')));
  });
});

describe('measurement - Factory & Tolerance Evaluation', () => {
  const vertices: Vertex[] = [
    { id: 'v1', x: 0, z: 0 },
    { id: 'v2', x: 10, z: 0 },
  ];

  it('createMeasurementEvidence automatically derives observedErrorPercent', () => {
    const checks = [{ fromVertexId: 'v1', toVertexId: 'v2', measuredMeters: 9.8 }]; // model=10, measured=9.8 -> 2.04%
    const ev = createMeasurementEvidence('calibrated', checks, vertices, '2026-10-22T12:00:00Z');
    assert.equal(ev.source, 'calibrated');
    assert.ok(ev.observedErrorPercent !== undefined);
    assert.equal(Math.round(ev.observedErrorPercent * 100) / 100, 2.04);

    const emptyEv = createMeasurementEvidence('manual', [], vertices, '2026-10-22T12:00:00Z');
    assert.equal(emptyEv.observedErrorPercent, undefined);
  });

  it('evaluateMeasurementTolerance checks policy limits', () => {
    const ev = createMeasurementEvidence(
      'calibrated',
      [{ fromVertexId: 'v1', toVertexId: 'v2', measuredMeters: 9.8 }], // ~2.04% error
      vertices
    );

    const passRes = evaluateMeasurementTolerance(ev, vertices, 5.0);
    assert.equal(passRes.pass, true);

    const failRes = evaluateMeasurementTolerance(ev, vertices, 1.0);
    assert.equal(failRes.pass, false);

    // Empty checks must fail tolerance (unverified)
    const emptyRes = evaluateMeasurementTolerance(
      { source: 'manual', recordedAt: new Date().toISOString(), checks: [] },
      vertices,
      5.0
    );
    assert.equal(emptyRes.pass, false);
    assert.equal(emptyRes.maxErrorPercent, undefined);

    // Negative / non-positive measured distance must fail tolerance explicitly
    const negativeRes = evaluateMeasurementTolerance(
      {
        source: 'manual',
        recordedAt: new Date().toISOString(),
        checks: [{ fromVertexId: 'v1', toVertexId: 'v2', measuredMeters: -10 }],
      },
      vertices,
      5.0
    );
    assert.equal(negativeRes.pass, false);
    assert.equal(negativeRes.maxErrorPercent, undefined);
  });

  it('validateMeasurementEvidence handles null vertices safely', () => {
    const evidence = {
      source: 'manual' as const,
      recordedAt: '2026-10-22T12:00:00Z',
      checks: [{ fromVertexId: 'v1', toVertexId: 'v2', measuredMeters: 5.0 }],
    };
    const res = validateMeasurementEvidence(evidence, [null as any, vertices[0]!]);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes('non-existent toVertexId')));
  });
});
