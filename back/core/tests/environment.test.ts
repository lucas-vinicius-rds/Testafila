import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  addPerimeterVertex,
  createRectangleEnvironment,
  getEnvironmentArea,
  getEnvironmentBoundingBox,
  getEnvironmentPerimeterLength,
  movePerimeterVertex,
  removePerimeterVertex,
  snapEnvironmentToGrid,
  validateEnvironment,
} from '../domain/environment.ts';
import type { Environment } from '../domain/types.ts';

describe('environment - createRectangleEnvironment', () => {
  it('creates a valid rectangular environment with empty measurement checks by default', () => {
    const env = createRectangleEnvironment({
      widthMeters: 8,
      depthMeters: 5,
      wallHeightMeters: 3.0,
      source: 'manual',
    });

    assert.equal(env.perimeter.length, 4);
    assert.equal(env.wallHeightMeters, 3.0);
    assert.equal(getEnvironmentArea(env), 40); // 8 * 5 = 40 m²
    assert.equal(getEnvironmentPerimeterLength(env), 26); // 2 * (8 + 5) = 26 m

    // Tautological zero error avoided: checks empty by default, observedErrorPercent undefined
    assert.deepEqual(env.measurement.checks, []);
    assert.equal(env.measurement.observedErrorPercent, undefined);

    const bbox = getEnvironmentBoundingBox(env);
    assert.equal(bbox.width, 8);
    assert.equal(bbox.depth, 5);

    const val = validateEnvironment(env);
    assert.equal(val.valid, true);
    assert.equal(val.errors.length, 0);
  });

  it('supports explicit independent physical measurement checks', () => {
    const checks = [
      { fromVertexId: 'corner-1', toVertexId: 'corner-2', measuredMeters: 8.1 }, // model is 8.0, err = 1.23%
    ];
    const env = createRectangleEnvironment({
      widthMeters: 8,
      depthMeters: 5,
      checks,
      source: 'calibrated',
    });

    assert.equal(env.measurement.checks.length, 1);
    assert.ok(env.measurement.observedErrorPercent !== undefined);
    assert.equal(Math.round(env.measurement.observedErrorPercent * 100) / 100, 1.23);
  });
});

describe('environment - validateEnvironment', () => {
  it('rejects invalid wall height', () => {
    const env = createRectangleEnvironment({ widthMeters: 5, depthMeters: 5 });
    const invalidEnv = { ...env, wallHeightMeters: -1 };
    const res = validateEnvironment(invalidEnv);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes('wallHeightMeters')));
  });

  it('rejects excessive wall height above limit', () => {
    const env = createRectangleEnvironment({ widthMeters: 5, depthMeters: 5 });
    const invalidEnv = { ...env, wallHeightMeters: 100 }; // max is 50m
    const res = validateEnvironment(invalidEnv);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes('wallHeightMeters')));
  });

  it('rejects invalid confirmedAt date string', () => {
    const env = createRectangleEnvironment({ widthMeters: 5, depthMeters: 5 });
    const invalidEnv = { ...env, confirmedAt: 'invalid-date-string' };
    const res = validateEnvironment(invalidEnv);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes('confirmedAt')));
  });

  it('safely handles null/undefined vertex elements in perimeter without throwing', () => {
    const env = createRectangleEnvironment({ widthMeters: 5, depthMeters: 5 });
    const invalidEnv = { ...env, perimeter: [null as any, ...env.perimeter.slice(1)] };
    const res = validateEnvironment(invalidEnv);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes('not a valid object')));
  });
});

describe('environment - Perimeter Editing Operations', () => {
  const initialEnv = createRectangleEnvironment({
    widthMeters: 10,
    depthMeters: 10,
  });

  it('movePerimeterVertex updates vertex position and revalidates', () => {
    // Move corner-2 from (10, 0) to (12, 0)
    const { environment: movedEnv, validation } = movePerimeterVertex(
      initialEnv,
      'corner-2',
      { x: 12, z: 0 }
    );
    assert.equal(validation.valid, true);
    assert.equal(getEnvironmentArea(movedEnv), 110); // Trapezoid: ((12 + 10) / 2) * 10 = 110 m²
  });

  it('movePerimeterVertex rejects move that causes self-intersection and returns original env', () => {
    // Moving corner-1 (0,0) across edge corner-3->corner-4 to (5, 15) crosses edge e2
    const confirmedEnv = { ...initialEnv, confirmedAt: '2026-10-22T12:00:00Z' };
    const { environment, validation } = movePerimeterVertex(confirmedEnv, 'corner-1', { x: 5, z: 15 });
    assert.equal(validation.valid, false);
    assert.ok(validation.errors.some((e) => e.includes('Self-intersection')));
    // Original environment must be returned unmodified
    assert.equal(environment, confirmedEnv);
    assert.equal(environment.confirmedAt, '2026-10-22T12:00:00Z');
  });

  it('valid perimeter move resets confirmedAt to null', () => {
    const confirmedEnv = { ...initialEnv, confirmedAt: '2026-10-22T12:00:00Z' };
    const { environment, validation } = movePerimeterVertex(confirmedEnv, 'corner-2', { x: 12, z: 0 });
    assert.equal(validation.valid, true);
    assert.equal(environment.confirmedAt, null);
  });

  it('addPerimeterVertex inserts vertex after specified vertex', () => {
    // Insert new vertex between corner-2 (10,0) and corner-3 (10,10) at (12, 5)
    const newVertex = { id: 'alcove-1', x: 12, z: 5 };
    const { environment: updatedEnv, validation } = addPerimeterVertex(
      initialEnv,
      newVertex,
      'corner-2'
    );

    assert.equal(validation.valid, true);
    assert.equal(updatedEnv.perimeter.length, 5);
    assert.equal(updatedEnv.perimeter[2].id, 'alcove-1');
  });

  it('removePerimeterVertex removes vertex', () => {
    // First create a 5-vertex polygon
    const newVertex = { id: 'alcove-1', x: 12, z: 5 };
    const { environment: pentagonEnv } = addPerimeterVertex(initialEnv, newVertex, 'corner-2');

    // Remove the added vertex
    const { environment: restoredEnv, validation } = removePerimeterVertex(
      pentagonEnv,
      'alcove-1'
    );
    assert.equal(validation.valid, true);
    assert.equal(restoredEnv.perimeter.length, 4);
  });

  it('removePerimeterVertex prevents removing vertex if count drops below 3', () => {
    // initialEnv has 4 vertices. Removing 2 would leave 2.
    const { environment: env3 } = removePerimeterVertex(initialEnv, 'corner-4');
    assert.equal(env3.perimeter.length, 3);

    // Attempting to remove another vertex from 3-vertex polygon
    const { validation } = removePerimeterVertex(env3, 'corner-3');
    assert.equal(validation.valid, false);
    assert.ok(validation.errors.some((e) => e.includes('at least 3 vertices')));
  });

  it('snapEnvironmentToGrid snaps perimeter coordinates and maintains validity', () => {
    const rawEnv: Environment = {
      ...initialEnv,
      perimeter: [
        { id: 'corner-1', x: 0.02, z: 0.01 },
        { id: 'corner-2', x: 9.98, z: 0.03 },
        { id: 'corner-3', x: 9.99, z: 10.04 },
        { id: 'corner-4', x: 0.01, z: 10.02 },
      ],
    };

    const { environment: snappedEnv, validation } = snapEnvironmentToGrid(rawEnv, 1.0);
    assert.equal(validation.valid, true);
    assert.equal(snappedEnv.perimeter[0].x, 0);
    assert.equal(snappedEnv.perimeter[0].z, 0);
    assert.equal(snappedEnv.perimeter[1].x, 10);
    assert.equal(snappedEnv.perimeter[1].z, 0);
    assert.equal(snappedEnv.perimeter[2].x, 10);
    assert.equal(snappedEnv.perimeter[2].z, 10);
    assert.equal(snappedEnv.perimeter[3].x, 0);
    assert.equal(snappedEnv.perimeter[3].z, 10);
  });

  it('ensures atomic operations never mutate the original environment object', () => {
    const originalSnapshot = JSON.stringify(initialEnv);

    // 1. Invalid move
    const invalidMoveRes = movePerimeterVertex(initialEnv, 'corner-1', { x: 5, z: 15 });
    assert.equal(invalidMoveRes.validation.valid, false);
    assert.equal(invalidMoveRes.environment, initialEnv);
    assert.equal(JSON.stringify(initialEnv), originalSnapshot);

    // 2. Valid move
    const validMoveRes = movePerimeterVertex(initialEnv, 'corner-2', { x: 12, z: 0 });
    assert.equal(validMoveRes.validation.valid, true);
    assert.notEqual(validMoveRes.environment, initialEnv);
    assert.equal(JSON.stringify(initialEnv), originalSnapshot);

    // 3. Valid add
    const validAddRes = addPerimeterVertex(initialEnv, { id: 'alcove', x: 12, z: 5 }, 'corner-2');
    assert.equal(validAddRes.validation.valid, true);
    assert.equal(JSON.stringify(initialEnv), originalSnapshot);

    // 4. Valid remove
    const pentagon = validAddRes.environment;
    const pentagonSnapshot = JSON.stringify(pentagon);
    const validRemoveRes = removePerimeterVertex(pentagon, 'alcove');
    assert.equal(validRemoveRes.validation.valid, true);
    assert.equal(JSON.stringify(pentagon), pentagonSnapshot);
  });
});
