import { z } from 'zod';
import type { ProjectScene, SaveProjectInput } from '../../../core/contracts/project.ts';
import { validateEnvironment } from '../../../core/domain/environment.ts';
import { validateSimplePolygon } from '../../../core/domain/polygon.ts';
import { validateMeasurementEvidence } from '../../../core/domain/measurement.ts';
import { getQueueMode, validateQueueScene } from '../../../core/domain/queue/index.ts';
import { migrateProjectScene } from '../../../core/domain/queue/migration.ts';
import { AppError } from '../../common/types.ts';

const id = z.string().trim().min(1).max(128);
const point = z.object({ x: z.number().finite().min(-100_000).max(100_000), z: z.number().finite().min(-100_000).max(100_000) }).strict();
const vertex = point.extend({ id }).strict();
const measurement = z.object({
  source: z.enum(['manual', 'calibrated', 'webxr']), recordedAt: z.string().datetime({ offset: true }),
  checks: z.array(z.object({ fromVertexId: id, toVertexId: id, measuredMeters: z.number().finite().positive() }).strict()).max(500),
  observedErrorPercent: z.number().finite().nonnegative().optional(),
}).strict();
const environment = z.object({ perimeter: z.array(vertex).min(3).max(500), wallHeightMeters: z.number().finite().positive().max(50), measurement, confirmedAt: z.string().datetime({ offset: true }).nullable() }).strict();
const sceneSchema = z.object({
  schemaVersion: z.literal(2), units: z.literal('meters'), coordinateSystem: z.literal('right-handed-y-up-xz-floor'),
  environment,
  restrictedAreas: z.array(z.object({ id, name: z.string().trim().min(1).max(100), vertices: z.array(vertex).min(3).max(500) }).strict()).max(200),
  posts: z.array(z.object({ id, position: point, heightMeters: z.number().finite().positive().max(50), baseRadiusMeters: z.number().finite().positive().max(100) }).strict()).max(5000),
  belts: z.array(z.object({ id, fromPostId: id, toPostId: id, heightMeters: z.number().finite().positive().max(50) }).strict()).max(5000),
  routes: z.array(z.object({ id, points: z.array(vertex).min(2).max(5000) }).strict()).max(500),
  queue: z.object({ personIds: z.array(id).max(10000) }).strict(),
  people: z.array(z.object({ id, routeId: id.nullable(), distanceAlongRouteMeters: z.number().finite().nonnegative().nullable(), position: point, yawRadians: z.number().finite() }).strict().refine(
    (person) => (person.routeId === null) === (person.distanceAlongRouteMeters === null),
    'Pessoa livre exige routeId e distanceAlongRouteMeters nulos juntos',
  )).max(10000),
  simulation: z.object({ spacingMeters: z.number().finite().positive(), personHeightMeters: z.number().finite().positive(), personRadiusMeters: z.number().finite().positive(), clearanceMeters: z.number().finite().nonnegative() }).strict(),
}).strict();
const saveSchema = z.object({ name: z.string().trim().min(1).max(100), scene: z.unknown(), expectedRevision: z.number().int().positive().nullable() }).strict();

function bad(message: string): never { throw new AppError(400, 'BAD_REQUEST', message); }
function assertUnique(ids: string[], label: string) {
  if (new Set(ids).size !== ids.length) bad(`IDs duplicados em ${label}`);
}

export function validateSaveProjectInput(input: unknown, isCreation: boolean): SaveProjectInput {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) bad(`Payload de projeto inválido: ${parsed.error.issues.map((issue) => issue.path.join('.')).slice(0, 8).join(', ')}`);
  if (isCreation ? parsed.data.expectedRevision !== null : parsed.data.expectedRevision === null) {
    bad(isCreation ? 'expectedRevision deve ser null na criação' : 'expectedRevision deve ser inteiro positivo na atualização');
  }
  if ((parsed.data.scene as { schemaVersion?: unknown } | null)?.schemaVersion !== 2) {
    bad('Salvamento exige schemaVersion 2');
  }
  const scene = validateProjectScene(parsed.data.scene);
  if (isCreation && getQueueMode(scene) === 'legacy') bad('Projeto novo não pode ter pessoas fora da fila');
  return { name: parsed.data.name, scene, expectedRevision: parsed.data.expectedRevision };
}

function migrateOrReject(input: unknown): ProjectScene {
  try {
    return migrateProjectScene(input);
  } catch {
    return bad('Cena inválida: schemaVersion');
  }
}

export function validateProjectScene(input: unknown): ProjectScene {
  const parsed = sceneSchema.safeParse(migrateOrReject(input));
  if (!parsed.success) bad(`Cena inválida: ${parsed.error.issues.map((issue) => issue.path.join('.')).slice(0, 8).join(', ')}`);
  const scene = parsed.data;
  const envResult = validateEnvironment(scene.environment);
  if (!envResult.valid) bad(`Ambiente inválido: ${envResult.errors.join('; ')}`);

  for (const area of scene.restrictedAreas) {
    const result = validateSimplePolygon(area.vertices, { requireUniqueIds: true });
    if (!result.valid) bad(`Área restrita ${area.id} inválida: ${result.errors.join('; ')}`);
  }
  for (const route of scene.routes) {
    assertUnique(route.points.map((p) => p.id), `percurso ${route.id}`);
    if (route.points.some((p) => Math.abs(p.x) > 100_000 || Math.abs(p.z) > 100_000)) bad(`Coordenadas inválidas no percurso ${route.id}`);
  }

  const entityIds = [
    ...scene.environment.perimeter.map((v) => v.id), ...scene.restrictedAreas.map((a) => a.id),
    ...scene.restrictedAreas.flatMap((a) => a.vertices.map((v) => v.id)), ...scene.posts.map((p) => p.id),
    ...scene.belts.map((b) => b.id), ...scene.routes.map((r) => r.id), ...scene.routes.flatMap((r) => r.points.map((p) => p.id)),
    ...scene.people.map((p) => p.id),
  ];
  assertUnique(entityIds, 'cena');
  const postIds = new Set(scene.posts.map((p) => p.id));
  for (const belt of scene.belts) {
    if (belt.fromPostId === belt.toPostId || !postIds.has(belt.fromPostId) || !postIds.has(belt.toPostId)) bad(`Fita ${belt.id} referencia postes inválidos`);
  }
  const routes = new Map(scene.routes.map((route) => [route.id, route]));
  for (const person of scene.people) {
    if (person.routeId === null && person.distanceAlongRouteMeters === null) continue;
    if (person.routeId === null || person.distanceAlongRouteMeters === null) bad(`Pessoa ${person.id} possui vínculo de percurso inconsistente`);
    const route = routes.get(person.routeId);
    if (!route) bad(`Pessoa ${person.id} referencia percurso inexistente`);
    const measuredLength = route.points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - route.points[i]!.x, p.z - route.points[i]!.z), 0);
    if (person.distanceAlongRouteMeters > measuredLength + 1e-6) bad(`Pessoa ${person.id} excede o comprimento do percurso`);
  }

  const evidence = validateMeasurementEvidence(scene.environment.measurement, scene.environment.perimeter);
  if (!evidence.valid) bad(`Medição inválida: ${evidence.errors.join('; ')}`);
  const canonicalMeasurement = { ...scene.environment.measurement };
  if (evidence.derivedErrorPercent === undefined) delete canonicalMeasurement.observedErrorPercent;
  else canonicalMeasurement.observedErrorPercent = evidence.derivedErrorPercent;
  const canonicalScene: ProjectScene = { ...scene, environment: { ...scene.environment, measurement: canonicalMeasurement } };
  const queueValidation = validateQueueScene(canonicalScene);
  if (!queueValidation.valid) bad(`Fila inválida: ${queueValidation.errors.join('; ')}`);
  return canonicalScene;
}
