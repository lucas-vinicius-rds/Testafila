import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import type { Belt, PersonPlacement, ProjectScene, Stanchion } from '@testafila/core/contracts/project';
import { createSceneLayers } from './scene-layers.ts';

const simulation = { spacingMeters: 0.8, personHeightMeters: 1.7, personRadiusMeters: 0.22, clearanceMeters: 0.05 };
const post = (id: string, x: number): Stanchion => ({ id, position: { x, z: 1 }, heightMeters: 0.95, baseRadiusMeters: 0.08 });
const person = (id: string, x: number): PersonPlacement => ({ id, routeId: null, distanceAlongRouteMeters: null, position: { x, z: 2 }, yawRadians: 0 });
const belt: Belt = { id: 'belt', fromPostId: 'a', toPostId: 'b', heightMeters: 0.86 };

function scene(parts: Partial<ProjectScene>): ProjectScene {
  return {
    environment: { perimeter: [{ id: 'c1', x: 0, z: 0 }, { id: 'c2', x: 4, z: 0 }, { id: 'c3', x: 4, z: 3 }], wallHeightMeters: 2.8 },
    restrictedAreas: [], posts: [], belts: [], routes: [], people: [], simulation,
    ...parts,
  } as ProjectScene;
}

function view(sceneValue: ProjectScene | null, draft: { x: number; z: number }[] = []) {
  return { scene: sceneValue, draft, highlightedPostIds: [] };
}

function objectsOf(root: THREE.Object3D) {
  const found = new Set<THREE.Object3D>();
  root.traverse((child) => { if ((child as THREE.Mesh).geometry) found.add(child); });
  return found;
}

function trackDisposal(root: THREE.Object3D) {
  const disposed = new Set<unknown>();
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.geometry) return;
    mesh.geometry.addEventListener('dispose', () => disposed.add(mesh.geometry));
    (mesh.material as THREE.Material).addEventListener('dispose', () => disposed.add(mesh.material));
  });
  return disposed;
}

test('adding one post keeps every existing object', () => {
  const layers = createSceneLayers();
  layers.sync(view(scene({ posts: [post('a', 1)] })));
  const before = objectsOf(layers.root);
  layers.sync(view(scene({ posts: [post('a', 1), post('b', 2)] })));
  const after = objectsOf(layers.root);
  for (const object of before) assert.ok(after.has(object));
  assert.equal(after.size, before.size + 1);
});

test('removing a post frees its geometry and material', () => {
  const layers = createSceneLayers();
  layers.sync(view(scene({ posts: [post('a', 1), post('b', 2)] })));
  const disposed = trackDisposal(layers.root);
  layers.sync(view(scene({ posts: [post('a', 1)] })));
  assert.equal(disposed.size, 2);
});

test('moving people reuses their objects', () => {
  const layers = createSceneLayers();
  layers.sync(view(scene({ people: [person('p', 1)] })));
  const before = objectsOf(layers.root);
  layers.sync(view(scene({ people: [person('p', 2.5)] })));
  assert.deepEqual([...objectsOf(layers.root)], [...before]);
  let moved = false;
  layers.root.traverse((child) => { if (child.position.x === 2.5) moved = true; });
  assert.ok(moved);
});

test('a belt follows its posts', () => {
  const layers = createSceneLayers();
  layers.sync(view(scene({ posts: [post('a', 1), post('b', 2)], belts: [belt] })));
  const disposed = trackDisposal(layers.root);
  layers.sync(view(scene({ posts: [post('a', 1), post('b', 3)], belts: [belt] })));
  assert.equal(disposed.size, 2);
});

test('the draft line is freed when it clears', () => {
  const layers = createSceneLayers();
  layers.sync(view(null, [{ x: 0, z: 0 }, { x: 1, z: 0 }]));
  const disposed = trackDisposal(layers.root);
  assert.ok(objectsOf(layers.root).size > 0);
  layers.sync(view(null));
  assert.equal(objectsOf(layers.root).size, 0);
  assert.ok(disposed.size > 0);
});

test('dispose frees everything', () => {
  const layers = createSceneLayers();
  layers.sync(view(scene({ posts: [post('a', 1)], people: [person('p', 1)] })));
  layers.dispose();
  assert.equal(objectsOf(layers.root).size, 0);
});

test('highlighting changes color without replacing objects', () => {
  const layers = createSceneLayers();
  layers.sync(view(scene({ posts: [post('a', 1), post('b', 2)] })));
  const before = objectsOf(layers.root);
  layers.highlightPosts(['a']);
  assert.deepEqual([...objectsOf(layers.root)], [...before]);
});
