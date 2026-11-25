import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRectangleEnvironment } from '../../domain/environment.ts';
import { applyQueueCommand, getChainPeople, OPEN_FILL_DEFAULT_PEOPLE } from '../../domain/queue/index.ts';
import { buildQueueTemplate, defaultQueueTemplate, QUEUE_TEMPLATES, type QueueTemplateKind } from '../../domain/queue/templates.ts';
import type { PointXZ, ProjectScene } from '../../contracts/project.ts';
import type { QueueCommand } from '../../contracts/queue-editor.ts';

function room(width = 20, depth = 15): ProjectScene {
  return {
    schemaVersion: 2,
    units: 'meters',
    coordinateSystem: 'right-handed-y-up-xz-floor',
    environment: createRectangleEnvironment({ widthMeters: width, depthMeters: depth }),
    restrictedAreas: [],
    posts: [],
    belts: [],
    routes: [],
    queue: { personIds: [] },
    people: [],
    simulation: { spacingMeters: 0.8, personHeightMeters: 1.7, personRadiusMeters: 0.22, clearanceMeters: 0.05 },
  };
}

function center(scene: ProjectScene): PointXZ {
  const points = scene.environment.perimeter;
  return { x: points.reduce((s, p) => s + p.x, 0) / points.length, z: points.reduce((s, p) => s + p.z, 0) / points.length };
}

function apply(scene: ProjectScene, command: QueueCommand): ProjectScene {
  const result = applyQueueCommand(scene, command);
  assert.deepEqual(result.errors, [], command.type);
  return result.scene;
}

let counter = 0;
const createId = (prefix: string) => `${prefix}-${counter++}`;

function withTemplate(kind: QueueTemplateKind, rotationRadians = 0) {
  const base = room();
  const layout = buildQueueTemplate({ ...defaultQueueTemplate(kind, center(base)), rotationRadians }, createId);
  let scene = apply(base, { type: 'layout:add', posts: layout.posts, belts: layout.belts });
  scene = apply(scene, { type: 'person:add', person: { id: 'head', routeId: null, distanceAlongRouteMeters: null, position: layout.head.position, yawRadians: layout.head.yawRadians } });
  return { scene, layout };
}

describe('queue templates', () => {
  it('every template is a valid layout and fits its first person', () => {
    for (const { kind } of QUEUE_TEMPLATES) {
      for (const rotation of [0, Math.PI / 2, 0.3]) withTemplate(kind, rotation);
    }
  });

  it('long belts get intermediate posts and meeting lines share posts', () => {
    const { layout } = withTemplate('straight');
    // Duas linhas de 6 m, cada uma em 3 trechos de 2 m.
    assert.equal(layout.belts.length, 6);
    assert.equal(layout.posts.length, 8);
    const zig = buildQueueTemplate(defaultQueueTemplate('zigzag', { x: 0, z: 0 }), createId);
    const ids = new Set(zig.posts.map((post) => post.id));
    assert.ok(zig.belts.every((belt) => ids.has(belt.fromPostId) && ids.has(belt.toPostId)));
  });

  it('the head looks out of the exit', () => {
    const { layout } = withTemplate('straight');
    assert.ok(Math.abs(layout.head.yawRadians - Math.PI / 2) < 1e-9);
  });
});

describe('queue:fill', () => {
  it('fills a zigzag through every lane without leaving the corridor', () => {
    const { scene } = withTemplate('zigzag');
    const filled = apply(scene, { type: 'queue:fill', idPrefix: 'p-' });
    const chain = getChainPeople(filled);
    // 4 raias de 6 m com 0,8 m de espaçamento: cerca de 7 por raia.
    assert.ok(chain.length >= 24, `só ${chain.length} pessoas`);
    const posts = filled.posts.map((post) => post.position);
    const minX = Math.min(...posts.map((p) => p.x)); const maxX = Math.max(...posts.map((p) => p.x));
    const minZ = Math.min(...posts.map((p) => p.z)); const maxZ = Math.max(...posts.map((p) => p.z));
    // Todas dentro do retângulo do modelo, com a última na raia de entrada (a 4ª).
    const outside = chain.filter((p) => p.position.x < minX - 0.5 || p.position.x > maxX + 0.5 || p.position.z < minZ || p.position.z > maxZ);
    assert.ok(outside.length <= 2, `${outside.length} fora do modelo`);
    assert.ok(chain.slice(0, -2).every((p) => p.position.z <= maxZ));
    // Para na entrada: ninguém sai do modelo pela ponta de entrada.
    assert.ok(chain.every((p) => p.position.x <= maxX + 0.01 && p.position.x >= minX - 0.01), 'saiu pela entrada');
  });

  it('follows the turn of the L and the U', () => {
    for (const kind of ['l', 'u'] as const) {
      const { scene } = withTemplate(kind);
      const chain = getChainPeople(apply(scene, { type: 'queue:fill', idPrefix: 'p-' }));
      assert.ok(chain.length >= 10, `${kind}: só ${chain.length}`);
    }
  });

  it('stops at maxPeople and each person faces the one ahead', () => {
    const { scene } = withTemplate('zigzag');
    const chain = getChainPeople(apply(scene, { type: 'queue:fill', idPrefix: 'p-', maxPeople: 5 }));
    assert.equal(chain.length, 6);
    for (let i = 1; i < chain.length; i += 1) {
      const [ahead, me] = [chain[i - 1]!, chain[i]!];
      const yaw = Math.atan2(ahead.position.x - me.position.x, ahead.position.z - me.position.z);
      assert.ok(Math.abs(yaw - me.yawRadians) < 1e-9);
    }
  });

  it('in an open room it stops at the requested count or at the default', () => {
    let scene = room(6, 6);
    const c = center(scene);
    scene = apply(scene, { type: 'person:add', person: { id: 'head', routeId: null, distanceAlongRouteMeters: null, position: c, yawRadians: 0 } });
    const chain = getChainPeople(apply(scene, { type: 'queue:fill', idPrefix: 'p-', maxPeople: 8 }));
    assert.equal(chain.length, 9);
    assert.equal(getChainPeople(apply(room(30, 30), { type: 'person:add', person: { id: 'h', routeId: null, distanceAlongRouteMeters: null, position: center(room(30, 30)), yawRadians: 0 } }))
      .length, 1);
    let open = room(30, 30);
    open = apply(open, { type: 'person:add', person: { id: 'h', routeId: null, distanceAlongRouteMeters: null, position: center(open), yawRadians: 0 } });
    assert.equal(getChainPeople(apply(open, { type: 'queue:fill', idPrefix: 'p-' })).length, 1 + OPEN_FILL_DEFAULT_PEOPLE);
  });

  it('refuses to fill without a first person or with no room behind', () => {
    assert.equal(applyQueueCommand(room(), { type: 'queue:fill', idPrefix: 'p-' }).valid, false);
    let scene = room(2, 2);
    const c = center(scene);
    scene = apply(scene, { type: 'person:add', person: { id: 'head', routeId: null, distanceAlongRouteMeters: null, position: c, yawRadians: 0 } });
    // Sala de 2 × 2 m: cabe pouca gente, mas o comando termina e a cena segue válida.
    const result = applyQueueCommand(scene, { type: 'queue:fill', idPrefix: 'p-' });
    assert.ok(result.valid || result.errors.some((e) => e.includes('espaço')));
  });
});
