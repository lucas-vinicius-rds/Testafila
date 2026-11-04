import assert from 'node:assert/strict';
import test from 'node:test';
import { getChainPeople, getQueueMode, validateQueueScene } from '@testafila/core/domain/queue';
import { alignFromOnePoint, alignFromTwoPoints, composeSessionToProject } from './assembly-alignment.ts';
import { sessionPointToProject } from '@testafila/core/domain/measured-environment';
import * as assembly from './assembly-state.ts';
import type { AssemblyState } from './assembly-state.ts';

const RECORDED_AT = '2026-11-04T12:00:00.000Z';
let nextId = 0;
const createId = (prefix: string) => `${prefix}-${(nextId += 1)}`;
const hit = (x: number, z: number, y = 0) => ({ x, y, z });

function near(actual: number, expected: number, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} !== ${expected}`);
}

function place(state: AssemblyState, ...points: readonly (readonly [number, number])[]) {
  return points.reduce((current, [x, z]) => assembly.placeAtHit(current, hit(x, z), createId), state);
}

/** A 6 x 4 room marked in a session rotated 90 degrees from the project frame. */
function withPlan() {
  const marked = place(assembly.createAssembly(), [2, 1], [2, 7], [-2, 7], [-2, 1]);
  return assembly.closePlan(marked, RECORDED_AT);
}

/** Session point for a project point of `withPlan`. */
const sessionOf = (x: number, z: number) => [2 - z, 1 + x] as const;

test('the whole flow builds a valid scene through queue commands', () => {
  let state = withPlan();
  assert.equal(state.step, 'areas');
  state = place(state, sessionOf(4.5, 0.5), sessionOf(5.5, 0.5), sessionOf(5.5, 1.5));
  state = assembly.closeArea(state, createId);
  state = assembly.goToStep(state, 'posts');
  state = place(state, sessionOf(1, 2), sessionOf(3, 2), sessionOf(3, 3.5));
  state = assembly.goToStep(state, 'belts');
  state = place(state, sessionOf(1, 2), sessionOf(3, 2));
  state = place(state, sessionOf(3, 2), sessionOf(3, 3.5));
  state = assembly.goToStep(state, 'people');
  state = place(state, sessionOf(1, 1));
  state = assembly.turnQueue(state, Math.PI / 2 + Math.PI);
  state = assembly.appendPerson(state, createId);
  state = assembly.appendPerson(state, createId);
  assert.equal(state.rejection, null);

  const scene = assembly.currentScene(state);
  assert.ok(scene);
  assert.deepEqual(validateQueueScene(scene).errors, []);
  assert.equal(scene.restrictedAreas.length, 1);
  assert.equal(scene.posts.length, 3);
  assert.equal(scene.belts.length, 2);
  assert.equal(getQueueMode(scene), 'chain');
  assert.equal(getChainPeople(scene).length, 3);
  assert.equal(scene.environment.measurement.source, 'webxr');
  assert.equal(scene.schemaVersion, 2);
  assert.doesNotMatch(JSON.stringify(scene), /rotationRadians|floorY|session/i);
});

test('points land in the project frame after the plan is squared up', () => {
  const state = assembly.goToStep(withPlan(), 'posts');
  const placed = place(state, sessionOf(1.5, 2.5));
  const post = assembly.currentScene(placed)?.posts[0];
  assert.ok(post);
  near(post.position.x, 1.5);
  near(post.position.z, 2.5);
});

test('a plan is not changed in scale', () => {
  const perimeter = assembly.currentScene(withPlan())?.environment.perimeter ?? [];
  near(perimeter[1].x, 6);
  near(Math.hypot(perimeter[2].x - perimeter[1].x, perimeter[2].z - perimeter[1].z), 4);
});

test('a rejected command shows why and leaves the scene untouched', () => {
  const state = assembly.goToStep(withPlan(), 'posts');
  const before = assembly.currentScene(state);
  const outside = place(state, sessionOf(20, 20));
  assert.ok(outside.rejection);
  assert.equal(assembly.currentScene(outside), before);
  assert.doesNotMatch(outside.rejection, /post-\d|Poste post/);
});

test('a colliding post is rejected and the next valid one clears the message', () => {
  let state = place(assembly.goToStep(withPlan(), 'posts'), sessionOf(1, 1));
  state = place(state, sessionOf(1.01, 1));
  assert.ok(state.rejection);
  assert.equal(assembly.currentScene(state)?.posts.length, 1);
  state = place(state, sessionOf(2, 1));
  assert.equal(state.rejection, null);
  assert.equal(assembly.currentScene(state)?.posts.length, 2);
});

test('a crossed plan does not close and keeps the corners', () => {
  const marked = place(assembly.createAssembly(), [0, 0], [2, 2], [2, 0], [0, 2]);
  const state = assembly.closePlan(marked, RECORDED_AT);
  assert.ok(state.rejection);
  assert.equal(state.corners.length, 4);
  assert.equal(state.history, null);
});

test('an area outside the room is rejected and its draft stays for undo', () => {
  let state = place(withPlan(), sessionOf(5, 3), sessionOf(9, 3), sessionOf(9, 5));
  state = assembly.closeArea(state, createId);
  assert.ok(state.rejection);
  assert.equal(state.areaDraft.length, 3);
  assert.equal(assembly.currentScene(state)?.restrictedAreas.length, 0);
});

test('one post takes several belts on different sides', () => {
  let state = place(assembly.goToStep(withPlan(), 'posts'), sessionOf(3, 2), sessionOf(1, 2), sessionOf(5, 2), sessionOf(3, 0.8));
  state = assembly.goToStep(state, 'belts');
  for (const other of [sessionOf(1, 2), sessionOf(5, 2), sessionOf(3, 0.8)]) state = place(state, sessionOf(3, 2), other);
  assert.equal(state.rejection, null);
  assert.equal(assembly.currentScene(state)?.belts.length, 3);
});

test('picking away from a post explains it, and picking twice deselects', () => {
  let state = assembly.goToStep(place(assembly.goToStep(withPlan(), 'posts'), sessionOf(1, 2)), 'belts');
  assert.ok(place(state, sessionOf(5, 3.5)).rejection);
  state = place(state, sessionOf(1, 2));
  assert.ok(state.beltStartPostId);
  assert.equal(place(state, sessionOf(1, 2)).beltStartPostId, null);
});

test('spacing recomposes the chain', () => {
  let state = place(assembly.goToStep(withPlan(), 'people'), sessionOf(1, 1));
  state = assembly.turnQueue(state, Math.PI / 2 + Math.PI);
  state = assembly.appendPerson(state, createId);
  state = assembly.setSpacing(state, 1);
  assert.equal(state.rejection, null);
  const [first, second] = getChainPeople(assembly.currentScene(state)!);
  near(Math.hypot(second.position.x - first.position.x, second.position.z - first.position.z), 1);
});

test('undo and redo walk corners, then commands', () => {
  let state = place(assembly.createAssembly(), [0, 0], [3, 0]);
  state = assembly.undo(state);
  assert.equal(state.corners.length, 1);
  assert.equal(assembly.canRedo(state), true);
  state = assembly.redo(state);
  assert.equal(state.corners.length, 2);

  state = place(assembly.goToStep(withPlan(), 'posts'), sessionOf(1, 1));
  state = assembly.undo(state);
  assert.equal(assembly.currentScene(state)?.posts.length, 0);
  state = assembly.redo(state);
  assert.equal(assembly.currentScene(state)?.posts.length, 1);
});

test('a new mark clears the corners that could be redone', () => {
  let state = assembly.undo(place(assembly.createAssembly(), [0, 0], [3, 0]));
  state = place(state, [0, 4]);
  assert.equal(assembly.canRedo(state), false);
});

test('a session drop keeps corners and asks for two points again', () => {
  const marked = place(assembly.createAssembly(), [2, 1], [2, 7], [-2, 7]);
  const dropped = assembly.sessionEnded(marked);
  assert.deepEqual(dropped.corners, marked.corners);
  assert.equal(dropped.alignment, null);
  assert.equal(assembly.needsRealignment(dropped), true);
  assert.equal(assembly.realignTargets(dropped).length, 2);
});

test('corners continue in the same plan after a drop, from a moved session', () => {
  const marked = place(assembly.createAssembly(), [2, 1], [2, 7], [-2, 7]);
  // New session: everything shifted by (10, -3) and turned 180 degrees around the old origin.
  const moved = (x: number, z: number) => [10 - x, -3 - z] as const;
  let state = assembly.sessionEnded(marked);
  state = place(state, moved(2, 1), moved(2, 7));
  assert.equal(assembly.needsRealignment(state), false);
  near(state.realignDifferenceMeters ?? 1, 0);
  state = place(state, moved(-2, 1));
  state = assembly.closePlan(state, RECORDED_AT);
  assert.equal(state.rejection, null);
  const perimeter = assembly.currentScene(state)?.environment.perimeter ?? [];
  assert.equal(perimeter.length, 4);
  near(perimeter[1].x, 6);
  near(Math.hypot(perimeter[2].x - perimeter[1].x, perimeter[2].z - perimeter[1].z), 4);
  near(Math.hypot(perimeter[3].x, perimeter[3].z), 4);
});

test('a lone corner survives and only needs itself found again', () => {
  let state = assembly.sessionEnded(place(assembly.createAssembly(), [2, 1]));
  assert.equal(assembly.realignTargets(state).length, 1);
  state = place(state, [8, 8], [8, 12], [5, 12], [5, 8]);
  state = assembly.closePlan(state, RECORDED_AT);
  assert.equal(state.rejection, null);
  near(assembly.currentScene(state)?.environment.perimeter[1].x ?? 0, 4);
});

test('a session drop keeps the scene, and new items land right after realigning', () => {
  let state = place(assembly.goToStep(withPlan(), 'posts'), sessionOf(1, 1));
  const before = assembly.currentScene(state);
  state = assembly.sessionEnded(state);
  assert.equal(assembly.currentScene(state), before);
  const moved = (x: number, z: number) => { const [sx, sz] = sessionOf(x, z); return [sx + 5, sz - 2] as const; };
  state = place(state, moved(0, 0), moved(6, 0));
  state = place(state, moved(4, 3));
  const post = assembly.currentScene(state)?.posts[1];
  assert.ok(post);
  near(post.position.x, 4);
  near(post.position.z, 3);
});

test('insertion waits for realignment: marks do not create items', () => {
  let state = assembly.sessionEnded(assembly.goToStep(withPlan(), 'posts'));
  state = place(state, sessionOf(0, 0));
  assert.equal(assembly.currentScene(state)?.posts.length, 0);
  assert.equal(state.realignMarks.length, 1);
});

test('a realignment with a real gap reports it and never scales', () => {
  let state = assembly.sessionEnded(withPlan());
  state = place(state, [0, 0], [6.3, 0]);
  near(state.realignDifferenceMeters ?? 0, 0.3);
  near(assembly.currentScene(state)?.environment.perimeter[1].x ?? 0, 6);
});

test('two glued realignment marks start over', () => {
  let state = assembly.sessionEnded(withPlan());
  state = place(state, [1, 1], [1.01, 1]);
  assert.ok(state.rejection);
  assert.equal(state.realignMarks.length, 0);
  assert.equal(assembly.needsRealignment(state), true);
});

test('a scene from outside starts by realigning, past the plan', () => {
  const scene = assembly.currentScene(withPlan());
  const state = assembly.createAssembly(scene);
  assert.equal(state.step, 'areas');
  assert.equal(assembly.needsRealignment(state), true);
  assert.equal(assembly.hasWork(state), true);
});

test('there is nothing to save before the first mark', () => {
  assert.equal(assembly.hasWork(assembly.createAssembly()), false);
  assert.equal(assembly.canReview(assembly.createAssembly()), false);
  assert.equal(assembly.hasWork(place(assembly.createAssembly(), [0, 0])), true);
});

test('review closes an open plan, or keeps the corners when it cannot', () => {
  const open = place(assembly.createAssembly(), [2, 1], [2, 7], [-2, 7]);
  assert.equal(assembly.canReview(open), true);
  assert.ok(assembly.sceneForReview(assembly.sessionEnded(open), RECORDED_AT).scene);
  const crossed = place(assembly.createAssembly(), [0, 0], [2, 2], [2, 0], [0, 2]);
  const review = assembly.sceneForReview(crossed, RECORDED_AT);
  assert.equal(review.scene, null);
  assert.ok(review.state.rejection);
  assert.equal(review.state.corners.length, 4);
});

test('leaving a step with an open area is blocked', () => {
  const state = place(withPlan(), sessionOf(1, 1));
  const next = assembly.goToStep(state, 'posts');
  assert.equal(next.step, 'areas');
  assert.ok(next.rejection);
});

test('alignment math: two points are exact when nothing moved', () => {
  const fit = alignFromTwoPoints([{ x: 0, z: 0 }, { x: 4, z: 0 }], [{ x: 3, z: 2 }, { x: 3, z: 6 }]);
  assert.ok(fit);
  near(fit.differenceMeters, 0);
  const point = sessionPointToProject({ x: 3, z: 6 }, fit.transform);
  near(point.x, 4);
  near(point.z, 0);
});

test('alignment math: one point fixes the position', () => {
  const point = sessionPointToProject({ x: 5, z: 5 }, alignFromOnePoint({ x: 1, z: 2 }, { x: 5, z: 5 }));
  near(point.x, 1);
  near(point.z, 2);
});

test('alignment math: composing equals applying both', () => {
  const first = { origin: { x: 1, z: 2 }, rotationRadians: 0.7 };
  const second = { origin: { x: -3, z: 0.5 }, rotationRadians: -1.9 };
  const session = { x: 4, z: -2 };
  const direct = sessionPointToProject(sessionPointToProject(session, first), second);
  const composed = sessionPointToProject(session, composeSessionToProject(first, second));
  near(composed.x, direct.x);
  near(composed.z, direct.z);
});
