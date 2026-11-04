import type { PointXZ, ProjectScene } from '@testafila/core/contracts/project';
import type { QueueCommand, QueueHistory } from '@testafila/core/contracts/queue-editor';
import { sessionPointToProject, type SessionToProject } from '@testafila/core/domain/measured-environment';
import { createQueueHistory, executeQueueCommand, getChainPeople, redoQueue, undoQueue } from '@testafila/core/domain/queue';
import { createEmptyProjectScene } from '../../editor/project-scene.ts';
import { queueErrorsForUser } from '../../editor/queue-errors.ts';
import { addCorner, closeFloorplan, MIN_CORNERS_TO_CLOSE } from '../floorplan/floorplan-capture-logic.ts';
import type { XrPoint } from '../xr-check/xr-check-logic.ts';
import { alignFromOnePoint, alignFromTwoPoints, composeSessionToProject } from './assembly-alignment.ts';

export const ASSEMBLY_STEPS = ['corners', 'areas', 'posts', 'belts', 'people'] as const;
export type AssemblyStep = (typeof ASSEMBLY_STEPS)[number];

export const SPACING_OPTIONS_METERS = [0.5, 0.8, 1] as const;
export const PERSON_TURN_RADIANS = Math.PI / 12;

const POST_PICK_RADIUS_METERS = 0.5;
const POST_HEIGHT_METERS = 0.95;
const POST_BASE_RADIUS_METERS = 0.08;
const BELT_HEIGHT_METERS = 0.86;

export type SessionAlignmentState = Readonly<{
  transform: SessionToProject;
  floorY: number;
}>;

/**
 * Everything is kept in project coordinates, so it outlives the session. Only
 * `alignment` and `realignMarks` belong to a session, and only they are cleared
 * when one ends. None of this reaches the saved scene.
 */
export type AssemblyState = Readonly<{
  step: AssemblyStep;
  corners: readonly PointXZ[];
  areaDraft: readonly PointXZ[];
  /** Points undone from the current draft, for redo. */
  draftRedo: readonly PointXZ[];
  history: QueueHistory | null;
  beltStartPostId: string | null;
  alignment: SessionAlignmentState | null;
  realignMarks: readonly XrPoint[];
  /** Gap found by the last two-point realignment, shown to the user. */
  realignDifferenceMeters: number | null;
  rejection: string | null;
}>;

export type CreateId = (prefix: string) => string;

export function createAssembly(initialScene?: ProjectScene | null): AssemblyState {
  const hasPlan = (initialScene?.environment.perimeter.length ?? 0) >= MIN_CORNERS_TO_CLOSE;
  return {
    step: hasPlan ? 'areas' : 'corners',
    corners: [],
    areaDraft: [],
    draftRedo: [],
    history: hasPlan && initialScene ? createQueueHistory(initialScene) : null,
    beltStartPostId: null,
    alignment: null,
    realignMarks: [],
    realignDifferenceMeters: null,
    rejection: null,
  };
}

const rejected = (state: AssemblyState, rejection: string): AssemblyState => ({ ...state, rejection });

function run(state: AssemblyState, command: QueueCommand, fallback: string): AssemblyState {
  if (!state.history) return state;
  const result = executeQueueCommand(state.history, command);
  if (!result.valid) return rejected(state, queueErrorsForUser(result.errors, fallback)[0] ?? fallback);
  return { ...state, history: result.history, rejection: null };
}

export function currentScene(state: AssemblyState): ProjectScene | null {
  return state.history?.present ?? null;
}

function draftKey(state: AssemblyState): 'corners' | 'areaDraft' | null {
  if (state.step === 'corners') return 'corners';
  return state.step === 'areas' ? 'areaDraft' : null;
}

export function currentDraft(state: AssemblyState): readonly PointXZ[] {
  const key = draftKey(state);
  return key ? state[key] : [];
}

export function hasWork(state: AssemblyState): boolean {
  return state.corners.length > 0 || state.areaDraft.length > 0 || (state.history?.past.length ?? 0) > 0 || (state.history !== null && state.history.present.environment.measurement.source === 'webxr');
}

/** The points a new session has to find again. Empty when there is nothing to anchor. */
export function realignTargets(state: AssemblyState): readonly PointXZ[] {
  const known = state.history?.present.environment.perimeter ?? state.corners;
  return known.slice(0, 2);
}

export function needsRealignment(state: AssemblyState): boolean {
  return state.alignment === null && realignTargets(state).length > 0;
}

export function sessionEnded(state: AssemblyState): AssemblyState {
  return { ...state, alignment: null, realignMarks: [], realignDifferenceMeters: null, rejection: null };
}

export function restartRealignment(state: AssemblyState): AssemblyState {
  return { ...state, alignment: null, realignMarks: [], realignDifferenceMeters: null, rejection: null };
}

export function markRealignment(state: AssemblyState, hit: XrPoint): AssemblyState {
  const targets = realignTargets(state);
  const marks = [...state.realignMarks, hit];
  if (marks.length < targets.length) return { ...state, realignMarks: marks, rejection: null };
  if (targets.length === 1) {
    return { ...state, realignMarks: [], rejection: null, alignment: { transform: alignFromOnePoint(targets[0], hit), floorY: hit.y } };
  }
  const fit = alignFromTwoPoints([targets[0], targets[1]], [marks[0], marks[1]]);
  if (!fit) return rejected({ ...state, realignMarks: [] }, 'Os dois pontos ficaram colados. Marque cada canto no lugar certo.');
  return {
    ...state,
    realignMarks: [],
    rejection: null,
    realignDifferenceMeters: fit.differenceMeters,
    alignment: { transform: fit.transform, floorY: marks[0].y },
  };
}

function toProject(state: AssemblyState, hit: XrPoint): PointXZ | null {
  return state.alignment ? sessionPointToProject(hit, state.alignment.transform) : null;
}

function addDraftPoint(state: AssemblyState, key: 'corners' | 'areaDraft', hit: XrPoint): AssemblyState {
  // The first corner of a new plan anchors the session; the plan is squared up on closing.
  const anchored = state.alignment ? state : { ...state, alignment: { transform: { origin: { x: hit.x, z: hit.z }, rotationRadians: 0 }, floorY: hit.y } };
  const point = toProject(anchored, hit);
  if (!point) return state;
  const result = addCorner(state[key], point);
  if (!result.added) return rejected(state, result.reason);
  return { ...anchored, [key]: result.corners, draftRedo: [], rejection: null };
}

export function closePlan(state: AssemblyState, recordedAt: string): AssemblyState {
  const result = closeFloorplan(state.corners, recordedAt);
  if (!result.valid) return rejected(state, 'Estes cantos não formam uma planta: há paredes se cruzando ou sobrepostas. Desfaça o último canto e marque de novo.');
  return {
    ...state,
    step: 'areas',
    corners: [],
    draftRedo: [],
    rejection: null,
    history: createQueueHistory({ ...createEmptyProjectScene(), environment: result.environment }),
    alignment: state.alignment && { ...state.alignment, transform: composeSessionToProject(state.alignment.transform, result.sessionToProject) },
  };
}

export function closeArea(state: AssemblyState, createId: CreateId): AssemblyState {
  const scene = currentScene(state);
  if (!scene || state.areaDraft.length < MIN_CORNERS_TO_CLOSE) return state;
  const area = {
    id: createId('area'),
    name: `Área ${scene.restrictedAreas.length + 1}`,
    vertices: state.areaDraft.map((point) => ({ id: createId('vertex'), ...point })),
  };
  const next = run(state, { type: 'area:add', area }, 'Esta área precisa ficar dentro do ambiente e ter um contorno válido.');
  return next.rejection ? next : { ...next, areaDraft: [], draftRedo: [] };
}

function placePost(state: AssemblyState, point: PointXZ, createId: CreateId): AssemblyState {
  const post = { id: createId('post'), position: point, heightMeters: POST_HEIGHT_METERS, baseRadiusMeters: POST_BASE_RADIUS_METERS };
  return run(state, { type: 'post:add', post }, 'O poste não cabe neste ponto.');
}

/** The post under the reticle, if any. */
export function postNear(state: AssemblyState, point: PointXZ): string | null {
  let nearest: string | null = null;
  let nearestDistance = POST_PICK_RADIUS_METERS;
  for (const post of currentScene(state)?.posts ?? []) {
    const distance = Math.hypot(post.position.x - point.x, post.position.z - point.z);
    if (distance <= nearestDistance) {
      nearest = post.id;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function pickPost(state: AssemblyState, point: PointXZ, createId: CreateId): AssemblyState {
  const postId = postNear(state, point);
  if (!postId) return rejected(state, 'Aponte o círculo para a base de um poste.');
  if (!state.beltStartPostId) return { ...state, beltStartPostId: postId, rejection: null };
  if (state.beltStartPostId === postId) return { ...state, beltStartPostId: null, rejection: null };
  const belt = { id: createId('belt'), fromPostId: state.beltStartPostId, toPostId: postId, heightMeters: BELT_HEIGHT_METERS };
  const next = run(state, { type: 'belt:add', belt }, 'A fita não pode ligar estes postes.');
  return next.rejection ? next : { ...next, beltStartPostId: null };
}

function placeFirstPerson(state: AssemblyState, point: PointXZ, createId: CreateId): AssemblyState {
  const person = { id: createId('person'), routeId: null, distanceAlongRouteMeters: null, position: point, yawRadians: 0 };
  return run(state, { type: 'person:add', person }, 'A pessoa não cabe neste ponto.');
}

export function hasPeople(state: AssemblyState): boolean {
  return (currentScene(state)?.people.length ?? 0) > 0;
}

/** Whatever the current step does with a point on the floor. */
export function placeAtHit(state: AssemblyState, hit: XrPoint, createId: CreateId): AssemblyState {
  if (needsRealignment(state)) return markRealignment(state, hit);
  if (state.step === 'corners') return addDraftPoint(state, 'corners', hit);
  if (state.step === 'areas') return addDraftPoint(state, 'areaDraft', hit);
  const point = toProject(state, hit);
  if (!point) return state;
  if (state.step === 'posts') return placePost(state, point, createId);
  if (state.step === 'belts') return pickPost(state, point, createId);
  return hasPeople(state) ? state : placeFirstPerson(state, point, createId);
}

export function appendPerson(state: AssemblyState, createId: CreateId): AssemblyState {
  return run(state, { type: 'person:append', id: createId('person') }, 'Não há espaço para mais uma pessoa atrás da fila.');
}

export function turnQueue(state: AssemblyState, radians: number): AssemblyState {
  const scene = currentScene(state);
  const first = scene ? getChainPeople(scene)[0] : undefined;
  if (!first) return state;
  return run(state, { type: 'person:rotate', id: first.id, yawRadians: first.yawRadians + radians }, 'A fila não cabe nesta direção.');
}

export function setSpacing(state: AssemblyState, spacingMeters: number): AssemblyState {
  return run(state, { type: 'simulation:spacing', spacingMeters }, 'A fila não cabe com este espaçamento.');
}

export function canUndo(state: AssemblyState): boolean {
  return currentDraft(state).length > 0 || (state.history?.past.length ?? 0) > 0;
}

export function canRedo(state: AssemblyState): boolean {
  return state.draftRedo.length > 0 || (state.history?.future.length ?? 0) > 0;
}

export function undo(state: AssemblyState): AssemblyState {
  const key = draftKey(state);
  if (key && state[key].length > 0) {
    const points = state[key];
    return { ...state, [key]: points.slice(0, -1), draftRedo: [...state.draftRedo, points[points.length - 1]], rejection: null };
  }
  return state.history ? { ...state, history: undoQueue(state.history), beltStartPostId: null, rejection: null } : state;
}

export function redo(state: AssemblyState): AssemblyState {
  const key = draftKey(state);
  if (key && state.draftRedo.length > 0) {
    return { ...state, [key]: [...state[key], state.draftRedo[state.draftRedo.length - 1]], draftRedo: state.draftRedo.slice(0, -1), rejection: null };
  }
  return state.history ? { ...state, history: redoQueue(state.history), beltStartPostId: null, rejection: null } : state;
}

/** Steps after the plan can be walked freely; the plan itself is revised in the editor. */
export function goToStep(state: AssemblyState, step: AssemblyStep): AssemblyState {
  if (step === 'corners' || !state.history) return state;
  if (state.areaDraft.length > 0) return rejected(state, 'Feche esta área ou desfaça os cantos dela antes de mudar de etapa.');
  return { ...state, step, draftRedo: [], beltStartPostId: null, rejection: null };
}

export function canReview(state: AssemblyState): boolean {
  return state.history !== null || state.corners.length >= MIN_CORNERS_TO_CLOSE;
}

/** The scene to hand to the editor, closing the plan first if it is still open. */
export function sceneForReview(state: AssemblyState, recordedAt: string): Readonly<{ state: AssemblyState; scene: ProjectScene | null }> {
  const closed = state.history ? state : closePlan(state, recordedAt);
  return { state: closed, scene: currentScene(closed) };
}
