import type { Environment, Meters, PointXZ, Vertex } from './types.ts';
import { DEFAULT_WALL_HEIGHT_METERS, validateEnvironment } from './environment.ts';
import { EPSILON, distance, isFinitePointXZ } from './math2d.ts';
import { createMeasurementEvidence, isValidIsoDateString } from './measurement.ts';

export interface MeasuredEnvironmentInput {
  /** Cantos na ordem marcada, em metros, sem repetir o primeiro. */
  points: readonly PointXZ[];
  /** Data ISO da medição. A função é pura e não lê o relógio. */
  recordedAt: string;
  wallHeightMeters?: Meters;
}

/** Só memória da sessão: nunca persistir com o projeto. */
export interface SessionToProject {
  origin: PointXZ;
  rotationRadians: number;
}

export type MeasuredEnvironmentResult =
  | { valid: true; errors: []; environment: Environment; sessionToProject: SessionToProject }
  | { valid: false; errors: string[]; environment: null; sessionToProject: null };

const invalid = (...errors: string[]): MeasuredEnvironmentResult => ({
  valid: false, errors, environment: null, sessionToProject: null,
});

/** Só translação e rotação: escala é sempre 1 e nunca há espelhamento. */
export function sessionPointToProject(point: PointXZ, transform: SessionToProject): PointXZ {
  const x = point.x - transform.origin.x;
  const z = point.z - transform.origin.z;
  const cos = Math.cos(transform.rotationRadians);
  const sin = Math.sin(transform.rotationRadians);
  return { x: x * cos - z * sin, z: x * sin + z * cos };
}

/** Monta o ambiente com origem no primeiro canto e +X ao longo da primeira parede. */
export function createEnvironmentFromMeasuredPoints(input: MeasuredEnvironmentInput): MeasuredEnvironmentResult {
  const { points, recordedAt, wallHeightMeters = DEFAULT_WALL_HEIGHT_METERS } = input;
  if (!Array.isArray(points) || points.length < 3) return invalid('Marque ao menos três cantos');
  if (!points.every(isFinitePointXZ)) return invalid('Há canto com coordenada inválida');
  if (!isValidIsoDateString(recordedAt)) return invalid('Medição precisa de data ISO válida');
  const [first, second] = points as [PointXZ, PointXZ];
  if (distance(first, second) <= EPSILON) return invalid('Os dois primeiros cantos coincidem');

  const sessionToProject: SessionToProject = {
    origin: { x: first.x, z: first.z },
    rotationRadians: -Math.atan2(second.z - first.z, second.x - first.x),
  };
  const perimeter: Vertex[] = points.map((point, index) => ({
    id: `corner-${index + 1}`,
    ...sessionPointToProject(point, sessionToProject),
  }));
  const environment: Environment = {
    perimeter,
    wallHeightMeters,
    measurement: createMeasurementEvidence('webxr', [], perimeter, recordedAt),
    confirmedAt: null,
  };
  const validation = validateEnvironment(environment);
  if (!validation.valid) return invalid(...validation.errors);
  return { valid: true, errors: [], environment, sessionToProject };
}
