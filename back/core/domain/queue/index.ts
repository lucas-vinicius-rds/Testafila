import type {
  Belt,
  PointXZ,
  ProjectScene,
  QueueRoute,
  PersonPlacement,
  RestrictedArea,
} from '../../contracts/project.ts';
import type {
  QueueCommand,
  QueueCommandResult,
  QueueHistory,
  QueueHistoryResult,
  QueueMode,
  QueueStats,
  QueueValidation,
} from '../../contracts/queue-editor.ts';
import { movePerimeterVertex, validateEnvironment } from '../environment.ts';
import { distancePointToSegment, classifySegmentIntersection } from '../intersection.ts';
import { EPSILON, distance } from '../math2d.ts';
import { isValidIsoDateString } from '../measurement.ts';
import { isPointInPolygon, polygonCentroid, validateSimplePolygon } from '../polygon.ts';

const MAX_PEOPLE = 10_000;
const CHAIN_TOLERANCE_METERS = 1e-6;
const validResult = (): QueueValidation => ({ valid: true, errors: [] });
const invalidResult = (...errors: string[]): QueueValidation => ({ valid: false, errors });
const isFinitePoint = (point: PointXZ): boolean => Number.isFinite(point?.x) && Number.isFinite(point?.z);
type RoutePersonPlacement = PersonPlacement & { routeId: string; distanceAlongRouteMeters: number };
function isRoutePersonPlacement(person: PersonPlacement, routeId?: string): person is RoutePersonPlacement {
  return typeof person.routeId === 'string'
    && (routeId === undefined || person.routeId === routeId)
    && typeof person.distanceAlongRouteMeters === 'number'
    && Number.isFinite(person.distanceAlongRouteMeters)
    && person.distanceAlongRouteMeters >= 0;
}

const vector = (from: PointXZ, to: PointXZ): PointXZ => ({ x: to.x - from.x, z: to.z - from.z });
const dot = (a: PointXZ, b: PointXZ): number => a.x * b.x + a.z * b.z;
const cross = (a: PointXZ, b: PointXZ): number => a.x * b.z - a.z * b.x;
const polygonEdges = (points: readonly PointXZ[]) =>
  points.map((point, index) => [point, points[(index + 1) % points.length]!] as const);

function segmentDistance(a: PointXZ, b: PointXZ, c: PointXZ, d: PointXZ): number {
  if (classifySegmentIntersection(a, b, c, d).intersects) return 0;
  return Math.min(
    distancePointToSegment(a, c, d).distance,
    distancePointToSegment(b, c, d).distance,
    distancePointToSegment(c, a, b).distance,
    distancePointToSegment(d, a, b).distance,
  );
}

function pointInside(point: PointXZ, polygon: readonly PointXZ[]): boolean {
  return isPointInPolygon(point, polygon).inside;
}

/** Testa extremos e cada intervalo separado por cruzamentos com a borda. */
function segmentInsidePolygon(a: PointXZ, b: PointXZ, polygon: readonly PointXZ[]): boolean {
  if (!pointInside(a, polygon) || !pointInside(b, polygon)) return false;
  const cuts = [0, 1];
  const direction = vector(a, b);
  for (const [edgeStart, edgeEnd] of polygonEdges(polygon)) {
    const edge = vector(edgeStart, edgeEnd);
    const denominator = cross(direction, edge);
    if (Math.abs(denominator) <= EPSILON) continue;
    const offset = vector(a, edgeStart);
    const t = cross(offset, edge) / denominator;
    const u = cross(offset, direction) / denominator;
    if (t > EPSILON && t < 1 - EPSILON && u >= -EPSILON && u <= 1 + EPSILON) cuts.push(t);
  }
  cuts.sort((left, right) => left - right);
  for (let index = 0; index < cuts.length - 1; index++) {
    const t = (cuts[index]! + cuts[index + 1]!) / 2;
    const point = { x: a.x + direction.x * t, z: a.z + direction.z * t };
    if (!pointInside(point, polygon)) return false;
  }
  return true;
}

function createCollisionIndex(minimumDistance: number, initialPoints: readonly PointXZ[] = []) {
  const cellSize = Math.max(minimumDistance + EPSILON, EPSILON);
  const buckets = new Map<string, PointXZ[]>();
  const cell = (point: PointXZ) => ({
    x: Math.floor(point.x / cellSize),
    z: Math.floor(point.z / cellSize),
  });
  const key = (x: number, z: number) => `${x},${z}`;
  const insert = (point: PointXZ) => {
    const position = cell(point);
    const bucketKey = key(position.x, position.z);
    const bucket = buckets.get(bucketKey);
    if (bucket) bucket.push(point);
    else buckets.set(bucketKey, [point]);
  };
  const overlaps = (point: PointXZ) => {
    const position = cell(point);
    for (let offsetX = -1; offsetX <= 1; offsetX++) {
      for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
        const bucket = buckets.get(key(position.x + offsetX, position.z + offsetZ));
        if (bucket?.some((other) => distance(point, other) <= minimumDistance + EPSILON)) return true;
      }
    }
    return false;
  };
  initialPoints.forEach(insert);
  return { insert, overlaps };
}

function routeLength(route: QueueRoute): number {
  return route.points.slice(1).reduce((total, point, index) => total + distance(route.points[index]!, point), 0);
}

function routePointAt(route: QueueRoute, distanceAlongRoute: number): { position: PointXZ; yawRadians: number } | undefined {
  if (!Number.isFinite(distanceAlongRoute) || distanceAlongRoute < 0) return undefined;
  let remaining = distanceAlongRoute;
  for (let index = 0; index < route.points.length - 1; index++) {
    const start = route.points[index]!;
    const end = route.points[index + 1]!;
    const segmentLength = distance(start, end);
    if (remaining <= segmentLength + EPSILON) {
      const fraction = Math.min(1, remaining / segmentLength);
      return {
        position: {
          x: start.x + (end.x - start.x) * fraction,
          z: start.z + (end.z - start.z) * fraction,
        },
        yawRadians: Math.atan2(end.x - start.x, end.z - start.z),
      };
    }
    remaining -= segmentLength;
  }
  return undefined;
}

function beltEndpoints(scene: ProjectScene, belt: Belt): [PointXZ | undefined, PointXZ | undefined] {
  return [
    scene.posts.find((post) => post.id === belt.fromPostId)?.position,
    scene.posts.find((post) => post.id === belt.toPostId)?.position,
  ];
}

function footprintFitsEnvironment(center: PointXZ, radius: number, scene: ProjectScene): boolean {
  const perimeter = scene.environment.perimeter;
  if (!pointInside(center, perimeter)) return false;
  return polygonEdges(perimeter).every(([start, end]) =>
    distancePointToSegment(center, start, end).distance >= radius - EPSILON,
  );
}

function footprintConflictsArea(center: PointXZ, radius: number, area: RestrictedArea, clearance: number): boolean {
  if (pointInside(center, area.vertices)) return true;
  return polygonEdges(area.vertices).some(([start, end]) =>
    distancePointToSegment(center, start, end).distance <= radius + clearance + EPSILON,
  );
}

function pointClear(center: PointXZ, radius: number, scene: ProjectScene, ignoredPostIds: ReadonlySet<string> = new Set()): boolean {
  if (!footprintFitsEnvironment(center, radius + scene.simulation.clearanceMeters, scene)) return false;
  if (scene.restrictedAreas.some((area) => footprintConflictsArea(center, radius, area, scene.simulation.clearanceMeters))) return false;
  if (scene.posts.some((post) => !ignoredPostIds.has(post.id)
    && distance(center, post.position) <= radius + post.baseRadiusMeters + scene.simulation.clearanceMeters + EPSILON)) return false;
  for (const belt of scene.belts) {
    const [start, end] = beltEndpoints(scene, belt);
    if (start && end && distancePointToSegment(center, start, end).distance <= radius + scene.simulation.clearanceMeters + EPSILON) return false;
  }
  return true;
}

function segmentClear(start: PointXZ, end: PointXZ, radius: number, scene: ProjectScene): boolean {
  const perimeter = scene.environment.perimeter;
  if (!segmentInsidePolygon(start, end, perimeter)) return false;
  for (const [wallStart, wallEnd] of polygonEdges(perimeter)) {
    if (segmentDistance(start, end, wallStart, wallEnd)
      < radius + scene.simulation.clearanceMeters - EPSILON) return false;
  }
  for (const area of scene.restrictedAreas) {
    if (pointInside(start, area.vertices) || pointInside(end, area.vertices)) return false;
    for (const [areaStart, areaEnd] of polygonEdges(area.vertices)) {
      if (segmentDistance(start, end, areaStart, areaEnd) <= radius + scene.simulation.clearanceMeters + EPSILON) return false;
    }
  }
  for (const post of scene.posts) {
    if (distancePointToSegment(post.position, start, end).distance
      <= radius + post.baseRadiusMeters + scene.simulation.clearanceMeters + EPSILON) return false;
  }
  for (const belt of scene.belts) {
    const [beltStart, beltEnd] = beltEndpoints(scene, belt);
    if (beltStart && beltEnd && segmentDistance(start, end, beltStart, beltEnd)
      <= radius + scene.simulation.clearanceMeters + EPSILON) return false;
  }
  return true;
}

function beltClear(scene: ProjectScene, belt: Belt): boolean {
  const [start, end] = beltEndpoints(scene, belt);
  if (!start || !end || !segmentInsidePolygon(start, end, scene.environment.perimeter)) return false;
  const connectedIds = new Set([belt.fromPostId, belt.toPostId]);
  for (const area of scene.restrictedAreas) {
    if (pointInside(start, area.vertices) || pointInside(end, area.vertices)) return false;
    for (const [areaStart, areaEnd] of polygonEdges(area.vertices)) {
      if (segmentDistance(start, end, areaStart, areaEnd) <= scene.simulation.clearanceMeters + EPSILON) return false;
    }
  }
  for (const post of scene.posts) {
    if (connectedIds.has(post.id)) continue;
    if (distancePointToSegment(post.position, start, end).distance
      <= post.baseRadiusMeters + scene.simulation.clearanceMeters + EPSILON) return false;
  }
  for (const [wallStart, wallEnd] of polygonEdges(scene.environment.perimeter)) {
    if (segmentDistance(start, end, wallStart, wallEnd) < scene.simulation.clearanceMeters - EPSILON) return false;
  }
  for (const otherBelt of scene.belts) {
    if (otherBelt === belt) continue;
    const [otherStart, otherEnd] = beltEndpoints(scene, otherBelt);
    if (!otherStart || !otherEnd) continue;
    const limit = scene.simulation.clearanceMeters + EPSILON;
    const sharedPostId = [otherBelt.fromPostId, otherBelt.toPostId].find((id) => connectedIds.has(id));
    if (sharedPostId !== undefined) {
      // Encontro no poste comum é permitido; só a ponta livre não pode encostar na outra fita.
      const ownFree = sharedPostId === belt.fromPostId ? end : start;
      const otherFree = sharedPostId === otherBelt.fromPostId ? otherEnd : otherStart;
      if (distancePointToSegment(otherFree, start, end).distance <= limit
        || distancePointToSegment(ownFree, otherStart, otherEnd).distance <= limit) return false;
      continue;
    }
    if (segmentDistance(start, end, otherStart, otherEnd) <= limit) return false;
  }
  return true;
}

function validateRouteShape(route: QueueRoute): string[] {
  const errors: string[] = [];
  if (!route.id || !Array.isArray(route.points) || route.points.length < 2) return ['Percurso precisa de identificador e ao menos dois pontos'];
  if (route.points.some((point) => !point.id || !isFinitePoint(point))) return ['Percurso contém ponto inválido'];
  for (let index = 0; index < route.points.length - 1; index++) {
    const first = route.points[index]!;
    const second = route.points[index + 1]!;
    const firstDirection = vector(first, second);
    if (Math.hypot(firstDirection.x, firstDirection.z) < EPSILON) errors.push('Percurso contém aresta degenerada');
    if (index > 0) {
      const previousDirection = vector(route.points[index - 1]!, first);
      if (Math.abs(cross(previousDirection, firstDirection)) <= EPSILON && dot(previousDirection, firstDirection) < -EPSILON) {
        errors.push('Percurso possui retorno de 180 graus em vértices adjacentes');
      }
    }
  }
  for (let first = 0; first < route.points.length - 1; first++) {
    for (let second = first + 2; second < route.points.length - 1; second++) {
      if (classifySegmentIntersection(route.points[first]!, route.points[first + 1]!, route.points[second]!, route.points[second + 1]!).intersects) {
        errors.push('Percurso possui auto-interseção');
      }
    }
  }
  return errors;
}

function addUniqueId(ids: Set<string>, id: string, errors: string[]): void {
  if (!id || ids.has(id)) errors.push(`Identificador ausente ou duplicado: ${id || '(vazio)'}`);
  ids.add(id);
}

function validate(scene: ProjectScene): QueueValidation {
  if (!scene || scene.schemaVersion !== 2 || scene.units !== 'meters' || scene.coordinateSystem !== 'right-handed-y-up-xz-floor') {
    return invalidResult('Documento de cena incompatível');
  }
  const errors: string[] = [];
  const environmentValidation = validateEnvironment(scene.environment);
  if (!environmentValidation.valid) errors.push(...environmentValidation.errors);
  const simulation = scene.simulation;
  if (![0.5, 0.8, 1].includes(simulation?.spacingMeters)) errors.push('Espaçamento deve ser 0.5, 0.8 ou 1.0 m');
  if (!Number.isFinite(simulation?.personHeightMeters) || simulation.personHeightMeters <= 0) errors.push('Altura das pessoas deve ser positiva e finita');
  if (!Number.isFinite(simulation?.personRadiusMeters) || simulation.personRadiusMeters <= 0) errors.push('Raio das pessoas deve ser positivo e finito');
  if (!Number.isFinite(simulation?.clearanceMeters) || simulation.clearanceMeters < 0) errors.push('Folga deve ser não negativa e finita');

  const ids = new Set<string>();
  scene.environment.perimeter.forEach((vertex) => addUniqueId(ids, vertex.id, errors));
  for (const area of scene.restrictedAreas) {
    addUniqueId(ids, area.id, errors);
    area.vertices.forEach((vertex) => addUniqueId(ids, vertex.id, errors));
    const polygonValidation = validateSimplePolygon(area.vertices, { requireUniqueIds: true });
    if (!polygonValidation.valid) errors.push(...polygonValidation.errors.map((message) => `Área ${area.id}: ${message}`));
    for (const environmentVertex of scene.environment.perimeter) {
      const containment = isPointInPolygon(environmentVertex, area.vertices);
      if (containment.inside && !containment.onBoundary) errors.push(`Área ${area.id} ultrapassa a concavidade do ambiente`);
    }
    for (const [start, end] of polygonEdges(area.vertices)) {
      if (!segmentInsidePolygon(start, end, scene.environment.perimeter)) errors.push(`Área ${area.id} não está inteiramente dentro do ambiente`);
    }
  }

  for (const post of scene.posts) {
    addUniqueId(ids, post.id, errors);
    const validDimensions = Number.isFinite(post.heightMeters) && post.heightMeters > 0
      && Number.isFinite(post.baseRadiusMeters) && post.baseRadiusMeters > 0;
    const fits = isFinitePoint(post.position)
      && validDimensions
      && footprintFitsEnvironment(post.position, post.baseRadiusMeters + simulation.clearanceMeters, scene)
      && !scene.restrictedAreas.some((area) => footprintConflictsArea(post.position, post.baseRadiusMeters, area, simulation.clearanceMeters));
    if (!validDimensions || !fits) errors.push(`Poste ${post.id} inválido ou sem folga suficiente`);
    for (const other of scene.posts) {
      if (other !== post && distance(other.position, post.position) <= post.baseRadiusMeters + other.baseRadiusMeters + simulation.clearanceMeters + EPSILON) {
        errors.push(`Poste ${post.id} colide com outro poste`);
        break;
      }
    }
  }

  for (const belt of scene.belts) {
    addUniqueId(ids, belt.id, errors);
    const endpointsExist = scene.posts.some((post) => post.id === belt.fromPostId)
      && scene.posts.some((post) => post.id === belt.toPostId);
    if (belt.fromPostId === belt.toPostId || !endpointsExist || !Number.isFinite(belt.heightMeters) || belt.heightMeters <= 0) {
      errors.push(`Fita ${belt.id} possui referências ou dimensões inválidas`);
    }
    if (scene.belts.some((other) => other !== belt
      && ((other.fromPostId === belt.fromPostId && other.toPostId === belt.toPostId)
        || (other.fromPostId === belt.toPostId && other.toPostId === belt.fromPostId)))) {
      errors.push(`Fita ${belt.id} duplica uma conexão existente`);
    }
    if (endpointsExist && !beltClear(scene, belt)) errors.push(`Fita ${belt.id} cruza uma área restrita, parede ou terceiro poste`);
  }

  for (const route of scene.routes) {
    addUniqueId(ids, route.id, errors);
    route.points.forEach((vertex) => addUniqueId(ids, vertex.id, errors));
    errors.push(...validateRouteShape(route));
    if (route.points.length > 1 && route.points.every((point) => isFinitePoint(point))) {
      for (let index = 0; index < route.points.length - 1; index++) {
        if (!segmentClear(route.points[index]!, route.points[index + 1]!, simulation.personRadiusMeters, scene)) {
          errors.push(`Percurso ${route.id} sai da área ou cruza um obstáculo`);
        }
      }
    }
  }

  if (scene.people.length > MAX_PEOPLE) errors.push(`A cena excede o limite de ${MAX_PEOPLE} pessoas`);
  const peopleCollisionIndex = createCollisionIndex(2 * simulation.personRadiusMeters + simulation.clearanceMeters);
  for (const person of scene.people) {
    addUniqueId(ids, person.id, errors);
    const isFreePlacement = person.routeId === null && person.distanceAlongRouteMeters === null;
    const isRoutePlacement = isRoutePersonPlacement(person);
    const route = isRoutePlacement
      ? scene.routes.find((candidate) => candidate.id === person.routeId)
      : undefined;
    const expected = route && isRoutePlacement
      ? routePointAt(route, person.distanceAlongRouteMeters)
      : undefined;

    if (!isFreePlacement && !isRoutePlacement) {
      errors.push(`Pessoa ${person.id} precisa ter rota e distância juntas, ou ambas nulas`);
    }
    if (typeof person.distanceAlongRouteMeters === 'number'
      && (!Number.isFinite(person.distanceAlongRouteMeters) || person.distanceAlongRouteMeters < 0)) {
      errors.push(`Pessoa ${person.id} possui distância inválida`);
    }
    if (!isFinitePoint(person.position) || !Number.isFinite(person.yawRadians)) {
      errors.push(`Pessoa ${person.id} possui posição ou orientação inválida`);
    } else if (isFreePlacement) {
      if (!pointClear(person.position, simulation.personRadiusMeters, scene)) {
        errors.push(`Pessoa ${person.id} está em conflito`);
      }
    } else if (!expected
      || distance(expected.position, person.position) > 1e-5
      || Math.abs(Math.atan2(Math.sin(expected.yawRadians - person.yawRadians), Math.cos(expected.yawRadians - person.yawRadians))) > 1e-5) {
      errors.push(`Pessoa ${person.id} possui cache inválido para o percurso`);
    } else if (!pointClear(expected.position, simulation.personRadiusMeters, scene)) {
      errors.push(`Pessoa ${person.id} está em conflito`);
    }
    if (isFinitePoint(person.position)) {
      if (peopleCollisionIndex.overlaps(person.position)) errors.push(`Pessoa ${person.id} colide com outra pessoa`);
      peopleCollisionIndex.insert(person.position);
    }
  }
  errors.push(...validateChain(scene));
  return errors.length ? { valid: false, errors } : validResult();
}

function validateChain(scene: ProjectScene): string[] {
  const personIds = scene.queue?.personIds;
  if (!Array.isArray(personIds)) return ['Cena sem fila definida'];
  if (!personIds.length) return [];
  const errors: string[] = [];
  const peopleById = new Map(scene.people.map((person) => [person.id, person]));
  if (new Set(personIds).size !== personIds.length) errors.push('Fila repete uma pessoa');
  if (scene.people.length !== personIds.length) errors.push('Há pessoas fora da fila');
  const chain = personIds.map((id) => peopleById.get(id));
  personIds.forEach((id, index) => {
    const person = chain[index];
    if (!person) errors.push(`Fila referencia pessoa inexistente: ${id}`);
    else if (person.routeId !== null || person.distanceAlongRouteMeters !== null) errors.push(`Pessoa ${id} da fila não pode estar em percurso`);
  });
  if (errors.length) return errors;
  for (let index = 0; index < chain.length - 1; index++) {
    const current = chain[index]!;
    const next = chain[index + 1]!;
    if (!isFinitePoint(current.position) || !isFinitePoint(next.position)) continue;
    if (Math.abs(distance(current.position, next.position) - scene.simulation.spacingMeters) > CHAIN_TOLERANCE_METERS) {
      errors.push(`Pessoas ${current.id} e ${next.id} estão fora do espaçamento da fila`);
    } else if (!segmentClear(current.position, next.position, scene.simulation.personRadiusMeters, scene)) {
      errors.push(`Vínculo entre ${current.id} e ${next.id} cruza um obstáculo`);
    }
  }
  return errors;
}

export function getQueueMode(scene: ProjectScene): QueueMode {
  if (scene.queue.personIds.length) return 'chain';
  return scene.people.length ? 'legacy' : 'empty';
}

export function getChainPeople(scene: ProjectScene): PersonPlacement[] {
  const peopleById = new Map(scene.people.map((person) => [person.id, person]));
  return scene.queue.personIds.flatMap((id) => {
    const person = peopleById.get(id);
    return person ? [person] : [];
  });
}

const normalizeYaw = (yaw: number): number => Math.atan2(Math.sin(yaw), Math.cos(yaw));
const linkYaw = (from: PointXZ, to: PointXZ): number => Math.atan2(to.x - from.x, to.z - from.z);
const behind = (person: PersonPlacement, spacing: number): PointXZ => ({
  x: person.position.x - Math.sin(person.yawRadians) * spacing,
  z: person.position.z - Math.cos(person.yawRadians) * spacing,
});

/** Gira no mesmo sentido do yaw: um yaw y passa a y + angle. */
function rotateAround(point: PointXZ, pivot: PointXZ, angle: number): PointXZ {
  const x = point.x - pivot.x;
  const z = point.z - pivot.z;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: pivot.x + x * cos + z * sin, z: pivot.z - x * sin + z * cos };
}

function replacePeople(scene: ProjectScene, replacements: readonly PersonPlacement[]): PersonPlacement[] {
  const byId = new Map(replacements.map((person) => [person.id, person]));
  return scene.people.map((person) => byId.get(person.id) ?? person);
}

function translatePeople(people: readonly PersonPlacement[], delta: PointXZ): PersonPlacement[] {
  return people.map((person) => ({
    ...person,
    position: { x: person.position.x + delta.x, z: person.position.z + delta.z },
  }));
}

function swingPeople(people: readonly PersonPlacement[], pivot: PointXZ, angle: number): PersonPlacement[] {
  return people.map((person) => ({
    ...person,
    position: rotateAround(person.position, pivot, angle),
    yawRadians: normalizeYaw(person.yawRadians + angle),
  }));
}

/** Primeira pessoa fica; cada vínculo mantém a direção e passa a medir spacing. */
function recomposeChain(chain: readonly PersonPlacement[], spacing: number): PersonPlacement[] {
  const result: PersonPlacement[] = [];
  chain.forEach((person, index) => {
    const previous = result[index - 1];
    if (!previous) {
      result.push(person);
      return;
    }
    const link = vector(chain[index - 1]!.position, person.position);
    const length = Math.hypot(link.x, link.z);
    const position = length > EPSILON
      ? { x: previous.position.x + link.x / length * spacing, z: previous.position.z + link.z / length * spacing }
      : behind(previous, spacing);
    result.push({ ...person, position });
  });
  return result;
}

function moveChainPerson(scene: ProjectScene, id: string, target: PointXZ): PersonPlacement[] {
  const chain = getChainPeople(scene);
  const index = chain.findIndex((person) => person.id === id);
  if (index === 0) return translatePeople(chain, vector(chain[0]!.position, target));
  const previous = chain[index - 1]!;
  if (distance(previous.position, target) <= EPSILON) throw new Error('Posição coincide com a pessoa anterior da fila');
  const angle = linkYaw(previous.position, target) - linkYaw(previous.position, chain[index]!.position);
  return swingPeople(chain.slice(index), previous.position, angle);
}

function rotateChainPerson(scene: ProjectScene, id: string, yawRadians: number): PersonPlacement[] {
  const chain = getChainPeople(scene);
  const index = chain.findIndex((person) => person.id === id);
  const person = chain[index]!;
  return [
    { ...person, yawRadians },
    ...swingPeople(chain.slice(index + 1), person.position, yawRadians - person.yawRadians),
  ];
}

function removeChainPerson(scene: ProjectScene, id: string): ProjectScene {
  const chain = getChainPeople(scene);
  const index = chain.findIndex((person) => person.id === id);
  const removed = chain[index]!;
  const following = chain.slice(index + 1);
  const moved = following.length ? translatePeople(following, vector(following[0]!.position, removed.position)) : [];
  return {
    ...scene,
    people: replacePeople(scene, moved).filter((person) => person.id !== id),
    queue: { personIds: scene.queue.personIds.filter((personId) => personId !== id) },
  };
}

function assertNoChain(scene: ProjectScene): void {
  if (getQueueMode(scene) === 'chain') throw new Error('Percurso legado não pode ser usado com a fila interligada');
}

function updateArea(scene: ProjectScene, id: string, transform: (area: RestrictedArea) => RestrictedArea): ProjectScene {
  const area = scene.restrictedAreas.find((candidate) => candidate.id === id);
  if (!area) throw new Error('Área não encontrada');
  return { ...scene, restrictedAreas: replaceById(scene.restrictedAreas, id, transform(area)) };
}

export function validateQueueScene(scene: ProjectScene): QueueValidation {
  return validate(scene);
}

function replaceById<T extends { id: string }>(items: T[], id: string, replacement: T): T[] {
  return items.map((item) => item.id === id ? replacement : item);
}

function candidatePeople(
  scene: ProjectScene,
  route: QueueRoute,
  occupied: readonly PersonPlacement[],
  slotLimit = MAX_PEOPLE,
): PersonPlacement[] {
  const placements: PersonPlacement[] = [];
  const routeDistance = routeLength(route);
  const spacing = scene.simulation.spacingMeters;
  const radius = scene.simulation.personRadiusMeters;
  const collisionIndex = createCollisionIndex(2 * radius + scene.simulation.clearanceMeters, occupied.map((person) => person.position));
  const maximumSlots = Math.min(MAX_PEOPLE, Math.max(0, slotLimit));
  for (let distanceAlongRoute = 0; distanceAlongRoute <= routeDistance + EPSILON && placements.length < maximumSlots; distanceAlongRoute += spacing) {
    const sample = routePointAt(route, Math.min(distanceAlongRoute, routeDistance));
    if (!sample || !pointClear(sample.position, radius, scene)) {
      break;
    }
    if (collisionIndex.overlaps(sample.position)) {
      break;
    }
    placements.push({
      id: `__candidate-${placements.length}`,
      routeId: route.id,
      distanceAlongRouteMeters: Math.min(distanceAlongRoute, routeDistance),
      ...sample,
    });
    collisionIndex.insert(sample.position);
    if (distanceAlongRoute >= routeDistance - EPSILON) break;
  }
  return placements;
}

function jointCapacity(scene: ProjectScene): PersonPlacement[] {
  const placements: PersonPlacement[] = [];
  for (const route of scene.routes) {
    const routePlacements = candidatePeople(scene, route, placements, MAX_PEOPLE - placements.length);
    placements.push(...routePlacements);
    if (placements.length >= MAX_PEOPLE) return placements.slice(0, MAX_PEOPLE);
  }
  return placements;
}

function applyCommand(scene: ProjectScene, command: QueueCommand): ProjectScene {
  let updated = scene;
  switch (command.type) {
    case 'environment:vertex-move': {
      const result = movePerimeterVertex(scene.environment, command.id, command.position);
      if (!result.validation.valid) throw new Error(result.validation.errors.join('; '));
      updated = { ...scene, environment: result.environment };
      break;
    }
    case 'environment:confirm':
      if (!isValidIsoDateString(command.confirmedAt)) throw new Error('Confirmação do ambiente precisa de data ISO válida');
      updated = { ...scene, environment: { ...scene.environment, confirmedAt: command.confirmedAt } };
      break;
    case 'area:add':
      updated = { ...scene, restrictedAreas: [...scene.restrictedAreas, command.area] };
      break;
    case 'area:update':
      if (!scene.restrictedAreas.some((area) => area.id === command.area.id)) throw new Error('Área não encontrada');
      updated = { ...scene, restrictedAreas: replaceById(scene.restrictedAreas, command.area.id, command.area) };
      break;
    case 'area:move':
      if (!isFinitePoint(command.delta)) throw new Error('Deslocamento da área inválido');
      updated = updateArea(scene, command.id, (area) => ({
        ...area,
        vertices: area.vertices.map((vertex) => ({ ...vertex, x: vertex.x + command.delta.x, z: vertex.z + command.delta.z })),
      }));
      break;
    case 'area:rotate':
      if (!Number.isFinite(command.angleRadians)) throw new Error('Ângulo da área inválido');
      updated = updateArea(scene, command.id, (area) => {
        const center = polygonCentroid(area.vertices);
        return { ...area, vertices: area.vertices.map((vertex) => ({ ...vertex, ...rotateAround(vertex, center, command.angleRadians) })) };
      });
      break;
    case 'area:remove':
      updated = { ...scene, restrictedAreas: scene.restrictedAreas.filter((area) => area.id !== command.id) };
      break;
    case 'post:add':
      updated = { ...scene, posts: [...scene.posts, command.post] };
      break;
    case 'post:move':
      updated = { ...scene, posts: scene.posts.map((post) => post.id === command.id ? { ...post, position: command.position } : post) };
      break;
    case 'post:remove':
      updated = {
        ...scene,
        posts: scene.posts.filter((post) => post.id !== command.id),
        belts: scene.belts.filter((belt) => belt.fromPostId !== command.id && belt.toPostId !== command.id),
      };
      break;
    case 'belt:add':
      updated = { ...scene, belts: [...scene.belts, command.belt] };
      break;
    case 'belt:remove':
      updated = { ...scene, belts: scene.belts.filter((belt) => belt.id !== command.id) };
      break;
    case 'route:set':
      assertNoChain(scene);
      updated = {
        ...scene,
        routes: scene.routes.some((route) => route.id === command.route.id)
          ? replaceById(scene.routes, command.route.id, command.route)
          : [...scene.routes, command.route],
      };
      break;
    case 'route:remove':
      updated = {
        ...scene,
        routes: scene.routes.filter((route) => route.id !== command.id),
        people: scene.people.filter((person) => person.routeId !== command.id),
      };
      break;
    case 'people:add': {
      assertNoChain(scene);
      const route = scene.routes.find((candidate) => candidate.id === command.routeId);
      if (!route) throw new Error('Percurso não encontrado');
      const existing = scene.people.filter((person) => isRoutePersonPlacement(person, route.id));
      const nextDistance = existing.length
        ? Math.max(...existing.map((person) => person.distanceAlongRouteMeters)) + scene.simulation.spacingMeters
        : 0;
      const sample = routePointAt(route, nextDistance);
      if (!sample) throw new Error('Não há capacidade válida após a última pessoa');
      updated = { ...scene, people: [...scene.people, { id: command.id, routeId: route.id, distanceAlongRouteMeters: nextDistance, ...sample }] };
      break;
    }
    case 'person:add':
      if (command.person.routeId !== null || command.person.distanceAlongRouteMeters !== null) {
        throw new Error('Nova pessoa não pode ter percurso ou distância acumulada');
      }
      if (getQueueMode(scene) === 'legacy') throw new Error('Converta as pessoas antigas em fila antes de continuar');
      if (getQueueMode(scene) === 'chain') throw new Error('A fila já tem início: use +1 atrás da última pessoa');
      updated = { ...scene, people: [command.person], queue: { personIds: [command.person.id] } };
      break;
    case 'person:move':
      if (!scene.people.some((person) => person.id === command.id)) throw new Error('Pessoa não encontrada');
      if (!isFinitePoint(command.position)) throw new Error('Posição da pessoa inválida');
      if (scene.queue.personIds.includes(command.id)) {
        updated = { ...scene, people: replacePeople(scene, moveChainPerson(scene, command.id, command.position)) };
        break;
      }
      updated = {
        ...scene,
        people: scene.people.map((person) => person.id === command.id
          ? { ...person, routeId: null, distanceAlongRouteMeters: null, position: command.position }
          : person),
      };
      break;
    case 'person:rotate':
      if (!scene.people.some((person) => person.id === command.id)) throw new Error('Pessoa não encontrada');
      if (!Number.isFinite(command.yawRadians)) throw new Error('Orientação da pessoa inválida');
      if (scene.queue.personIds.includes(command.id)) {
        updated = { ...scene, people: replacePeople(scene, rotateChainPerson(scene, command.id, command.yawRadians)) };
        break;
      }
      updated = {
        ...scene,
        people: scene.people.map((person) => person.id === command.id
          ? { ...person, routeId: null, distanceAlongRouteMeters: null, yawRadians: command.yawRadians }
          : person),
      };
      break;
    case 'person:append': {
      const mode = getQueueMode(scene);
      if (mode === 'legacy') throw new Error('Converta as pessoas antigas em fila antes de continuar');
      if (mode === 'empty') throw new Error('Defina a primeira pessoa da fila');
      const last = getChainPeople(scene).at(-1)!;
      updated = {
        ...scene,
        people: [...scene.people, {
          id: command.id,
          routeId: null,
          distanceAlongRouteMeters: null,
          position: behind(last, scene.simulation.spacingMeters),
          yawRadians: last.yawRadians,
        }],
        queue: { personIds: [...scene.queue.personIds, command.id] },
      };
      break;
    }
    case 'queue:convert-legacy': {
      if (getQueueMode(scene) !== 'legacy') throw new Error('Não há pessoas antigas para converter');
      const unlinked = scene.people.map((person) => ({ ...person, routeId: null, distanceAlongRouteMeters: null }));
      updated = {
        ...scene,
        people: recomposeChain(unlinked, scene.simulation.spacingMeters),
        queue: { personIds: scene.people.map((person) => person.id) },
      };
      break;
    }
    case 'people:fill': {
      assertNoChain(scene);
      const route = scene.routes.find((candidate) => candidate.id === command.routeId);
      if (!route || !command.idPrefix) throw new Error('Percurso ou prefixo inválido');
      const remaining = scene.people.filter((person) => person.routeId !== route.id);
      const placements = candidatePeople({ ...scene, people: remaining }, route, remaining, MAX_PEOPLE - remaining.length);
      updated = {
        ...scene,
        people: [...remaining, ...placements.map((person, index) => ({ ...person, id: `${command.idPrefix}${index}` }))],
      };
      break;
    }
    case 'person:remove':
      updated = scene.queue.personIds.includes(command.id)
        ? removeChainPerson(scene, command.id)
        : { ...scene, people: scene.people.filter((person) => person.id !== command.id) };
      break;
    case 'people:clear':
      updated = command.routeId
        ? { ...scene, people: scene.people.filter((person) => person.routeId !== command.routeId) }
        : { ...scene, people: [], queue: { personIds: [] } };
      break;
    case 'simulation:spacing': {
      if (![0.5, 0.8, 1].includes(command.spacingMeters)) throw new Error('Espaçamento deve ser 0.5, 0.8 ou 1.0 m');
      const spacedScene = { ...scene, simulation: { ...scene.simulation, spacingMeters: command.spacingMeters } };
      if (getQueueMode(scene) === 'chain') {
        updated = { ...spacedScene, people: replacePeople(scene, recomposeChain(getChainPeople(scene), command.spacingMeters)) };
        break;
      }
      const redistributed: PersonPlacement[] = [];
      const freePeople = scene.people.filter((person) => person.routeId === null
        && person.distanceAlongRouteMeters === null);
      for (const [routeIndex, route] of spacedScene.routes.entries()) {
        const existing = scene.people.filter((person) => person.routeId === route.id);
        const unprocessedPeople = scene.people.filter((person) =>
          spacedScene.routes.slice(routeIndex + 1).some((laterRoute) => laterRoute.id === person.routeId),
        );
        const placements = candidatePeople(spacedScene, route, [
          ...freePeople,
          ...redistributed,
          ...unprocessedPeople,
        ]).slice(0, existing.length);
        redistributed.push(...placements.map((person, index) => ({ ...person, id: existing[index]!.id })));
      }
      const redistributedById = new Map(redistributed.map((person) => [person.id, person]));
      const people = scene.people.flatMap((person) => {
        if (person.routeId === null && person.distanceAlongRouteMeters === null) return [person];
        const replacement = redistributedById.get(person.id);
        return replacement ? [replacement] : [];
      });
      updated = { ...spacedScene, people };
      break;
    }
  }
  const validation = validate(updated);
  if (!validation.valid) throw new Error(validation.errors.join('; '));
  return updated;
}

export function applyQueueCommand(scene: ProjectScene, command: QueueCommand): QueueCommandResult {
  try {
    return { valid: true, errors: [], scene: applyCommand(scene, command) };
  } catch (error) {
    return { valid: false, errors: [error instanceof Error ? error.message : 'Comando inválido'], scene };
  }
}

export function createQueueHistory(scene: ProjectScene): QueueHistory {
  return { past: [], present: scene, future: [] };
}

export function executeQueueCommand(history: QueueHistory, command: QueueCommand): QueueHistoryResult {
  const result = applyQueueCommand(history.present, command);
  if (!result.valid) return { ...result, history };
  return {
    valid: true,
    errors: [],
    history: { past: [...history.past, history.present].slice(-100), present: result.scene, future: [] },
  };
}

export function undoQueue(history: QueueHistory): QueueHistory {
  if (!history.past.length) return history;
  return {
    past: history.past.slice(0, -1),
    present: history.past[history.past.length - 1]!,
    future: [history.present, ...history.future].slice(0, 100),
  };
}

export function redoQueue(history: QueueHistory): QueueHistory {
  if (!history.future.length) return history;
  return {
    past: [...history.past, history.present].slice(-100),
    present: history.future[0]!,
    future: history.future.slice(1),
  };
}

export function getQueueStats(scene: ProjectScene): QueueStats {
  return {
    routeLengthMeters: scene.routes.reduce((total, route) => total + routeLength(route), 0),
    peopleCount: scene.people.length,
    capacity: jointCapacity(scene).length,
  };
}
