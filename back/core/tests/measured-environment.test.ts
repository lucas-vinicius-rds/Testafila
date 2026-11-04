import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_WALL_HEIGHT_METERS, validateEnvironment } from '../domain/environment.ts';
import { createEnvironmentFromMeasuredPoints, sessionPointToProject } from '../domain/measured-environment.ts';
import { getEnvironmentArea } from '../domain/index.ts';

const recordedAt = '2026-11-04T12:00:00.000Z';
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

/** Retângulo 4 x 3 girado 30 graus e deslocado, como numa sessão AR qualquer. */
function sessionRectangle() {
  const angle = Math.PI / 6;
  return [[0, 0], [4, 0], [4, 3], [0, 3]].map(([x, z]) => ({
    x: 2 + x! * Math.cos(angle) - z! * Math.sin(angle),
    z: -1 + x! * Math.sin(angle) + z! * Math.cos(angle),
  }));
}

describe('ambiente por pontos medidos', () => {
  it('põe a origem no primeiro canto e +X na primeira parede', () => {
    const result = createEnvironmentFromMeasuredPoints({ points: sessionRectangle(), recordedAt });
    assert.equal(result.valid, true);
    if (!result.valid) return;
    const [a, b, c, d] = result.environment.perimeter;
    assert.deepEqual([a!.x, a!.z], [0, 0]);
    near(b!.x, 4); near(b!.z, 0);
    near(c!.x, 4); near(c!.z, 3);
    near(d!.x, 0); near(d!.z, 3);
    assert.deepEqual(result.environment.perimeter.map((v) => v.id), ['corner-1', 'corner-2', 'corner-3', 'corner-4']);
  });

  it('não aplica escala nem espelhamento', () => {
    const result = createEnvironmentFromMeasuredPoints({ points: sessionRectangle(), recordedAt });
    assert.ok(result.valid);
    near(getEnvironmentArea(result.environment), 12);
    const reversed = createEnvironmentFromMeasuredPoints({ points: [...sessionRectangle()].reverse(), recordedAt });
    assert.ok(reversed.valid);
    near(reversed.environment.perimeter[2]!.z, -3);
  });

  it('gera ambiente válido, de origem webxr, sem confirmação nem checagens', () => {
    const result = createEnvironmentFromMeasuredPoints({ points: sessionRectangle(), recordedAt });
    assert.ok(result.valid);
    assert.equal(validateEnvironment(result.environment).valid, true);
    assert.equal(result.environment.measurement.source, 'webxr');
    assert.equal(result.environment.measurement.recordedAt, recordedAt);
    assert.deepEqual(result.environment.measurement.checks, []);
    assert.equal(result.environment.confirmedAt, null);
    assert.equal(result.environment.wallHeightMeters, DEFAULT_WALL_HEIGHT_METERS);
  });

  it('respeita a altura informada', () => {
    const result = createEnvironmentFromMeasuredPoints({ points: sessionRectangle(), recordedAt, wallHeightMeters: 3.5 });
    assert.ok(result.valid);
    assert.equal(result.environment.wallHeightMeters, 3.5);
  });

  it('a transformação devolvida leva qualquer ponto da sessão ao projeto', () => {
    const points = sessionRectangle();
    const result = createEnvironmentFromMeasuredPoints({ points, recordedAt });
    assert.ok(result.valid);
    const projected = sessionPointToProject(points[2]!, result.sessionToProject);
    near(projected.x, 4);
    near(projected.z, 3);
  });

  it('rejeita polígono inválido sem devolver ambiente', () => {
    const bowtie = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 0, z: 3 }, { x: 4, z: 3 }];
    const inputs = [
      { points: [{ x: 0, z: 0 }, { x: 1, z: 0 }], recordedAt },
      { points: bowtie, recordedAt },
      { points: [{ x: 1, z: 1 }, { x: 1, z: 1 }, { x: 3, z: 3 }], recordedAt },
      { points: [{ x: 0, z: 0 }, { x: Number.NaN, z: 0 }, { x: 3, z: 3 }], recordedAt },
      { points: sessionRectangle(), recordedAt: 'ontem' },
    ];
    for (const input of inputs) {
      const result = createEnvironmentFromMeasuredPoints(input);
      assert.equal(result.valid, false);
      assert.equal(result.environment, null);
      assert.ok(result.errors.length > 0);
    }
  });
});
