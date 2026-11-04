import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRectangleEnvironment } from '../../domain/environment.ts';
import {
  applyQueueCommand,
  createQueueHistory,
  executeQueueCommand,
  getQueueStats,
  redoQueue,
  undoQueue,
  validateQueueScene,
} from '../../domain/queue/index.ts';
import type { ProjectScene, QueueRoute } from '../../contracts/project.ts';

function createScene(): ProjectScene {
  return {
    schemaVersion: 2,
    units: 'meters',
    coordinateSystem: 'right-handed-y-up-xz-floor',
    environment: createRectangleEnvironment({ widthMeters: 10, depthMeters: 8 }),
    restrictedAreas: [],
    posts: [],
    belts: [],
    routes: [],
    queue: { personIds: [] },
    people: [],
    simulation: {
      spacingMeters: 0.8,
      personHeightMeters: 1.7,
      personRadiusMeters: 0.2,
      clearanceMeters: 0.05,
    },
  };
}

const bentRoute: QueueRoute = {
  id: 'route-main',
  points: [
    { id: 'route-a', x: 1, z: 2 },
    { id: 'route-b', x: 5, z: 2 },
    { id: 'route-c', x: 5, z: 6 },
  ],
};

describe('queue domain', () => {
  it('accepts an empty scene with a valid but unconfirmed legacy environment', () => {
    const scene = createScene();

    assert.equal(scene.environment.confirmedAt, null);
    assert.deepEqual(validateQueueScene(scene), { valid: true, errors: [] });
  });

  it('validates every route segment and footprint inside a concave environment', () => {
    const scene = createScene();
    scene.environment = {
      ...scene.environment,
      perimeter: [
        { id: 'env-a', x: 0, z: 0 }, { id: 'env-b', x: 8, z: 0 },
        { id: 'env-c', x: 8, z: 3 }, { id: 'env-d', x: 3, z: 3 },
        { id: 'env-e', x: 3, z: 8 }, { id: 'env-f', x: 0, z: 8 },
      ],
    };

    const result = applyQueueCommand(scene, { type: 'route:set', route: bentRoute });

    assert.equal(result.valid, false);
    assert.equal(result.scene, scene);
  });

  it('keeps person footprint and clearance away from environment walls', () => {
    const scene = createScene();
    const route: QueueRoute = {
      id: 'near-wall',
      points: [{ id: 'wall-a', x: 0.24, z: 1 }, { id: 'wall-b', x: 0.24, z: 7 }],
    };

    const result = applyQueueCommand(scene, { type: 'route:set', route });

    assert.equal(result.valid, false);
    assert.equal(result.scene, scene);
  });

  it('rejects a zone edit that conflicts with an existing route atomically', () => {
    const routeResult = applyQueueCommand(createScene(), { type: 'route:set', route: bentRoute });
    assert.equal(routeResult.valid, true);
    const originalScene = routeResult.scene;
    const area = {
      id: 'blocked-area',
      name: 'Bloqueio',
      vertices: [
        { id: 'area-a', x: 2, z: 1 }, { id: 'area-b', x: 3, z: 1 },
        { id: 'area-c', x: 3, z: 3 }, { id: 'area-d', x: 2, z: 3 },
      ],
    };

    const result = applyQueueCommand(originalScene, { type: 'area:add', area });

    assert.equal(result.valid, false);
    assert.equal(result.scene, originalScene);
  });

  it('rejects self-intersecting routes and zero-length edges', () => {
    const invalidRoutes: QueueRoute[] = [
      { id: 'crossing', points: [
        { id: 'cross-a', x: 1, z: 1 }, { id: 'cross-b', x: 4, z: 4 },
        { id: 'cross-c', x: 1, z: 4 }, { id: 'cross-d', x: 4, z: 1 },
      ] },
      { id: 'zero-edge', points: [
        { id: 'zero-a', x: 1, z: 1 }, { id: 'zero-b', x: 1, z: 1 },
      ] },
    ];

    for (const route of invalidRoutes) {
      assert.equal(applyQueueCommand(createScene(), { type: 'route:set', route }).valid, false);
    }
  });

  it('fills deterministically from distance zero and reports people and capacity', () => {
    const routeScene = applyQueueCommand(createScene(), { type: 'route:set', route: bentRoute }).scene;
    const result = applyQueueCommand(routeScene, {
      type: 'people:fill', routeId: bentRoute.id, idPrefix: 'person-',
    });

    assert.equal(result.valid, true);
    assert.equal(result.scene.people[0]?.distanceAlongRouteMeters, 0);
    assert.deepEqual(result.scene.people.map((person) => person.id),
      result.scene.people.map((_, index) => `person-${index}`));
    assert.equal(validateQueueScene(result.scene).valid, true);
    assert.equal(getQueueStats(result.scene).peopleCount, result.scene.people.length);
  });

  it('accepts free people with null route and distance and rejects mismatched null pairs', () => {
    const freePerson = {
      id: 'free-person', routeId: null, distanceAlongRouteMeters: null,
      position: { x: 1, z: 1 }, yawRadians: 0,
    };
    const validScene = { ...createScene(), people: [freePerson] };
    const invalidScene = {
      ...validScene,
      people: [{ ...freePerson, distanceAlongRouteMeters: 1 }],
    };

    assert.equal(validateQueueScene(validScene).valid, true);
    assert.equal(validateQueueScene(invalidScene).valid, false);
  });

  it('adds the first person at the requested position and orientation', () => {
    const scene = createScene();
    const person = {
      id: 'new-free', routeId: null, distanceAlongRouteMeters: null,
      position: { x: 2, z: 2 }, yawRadians: Math.PI / 2,
    };

    const result = applyQueueCommand(scene, { type: 'person:add', person });

    assert.equal(result.valid, true);
    assert.deepEqual(result.scene.people, [person]);
    assert.deepEqual(result.scene.queue.personIds, [person.id]);
    assert.deepEqual(scene.people, []);
    const routePerson = { ...person, routeId: bentRoute.id, distanceAlongRouteMeters: 0 };
    assert.equal(applyQueueCommand(scene, { type: 'person:add', person: routePerson }).valid, false);
  });

  it('moves or rotates only the selected route person and converts it to free placement', () => {
    const routeScene = applyQueueCommand(createScene(), { type: 'route:set', route: bentRoute }).scene;
    const filled = applyQueueCommand(routeScene, {
      type: 'people:fill', routeId: bentRoute.id, idPrefix: 'move-',
    }).scene;
    const targetId = filled.people[0]!.id;
    const untouched = filled.people[1]!;
    const moved = applyQueueCommand(filled, {
      type: 'person:move', id: targetId, position: { x: 2, z: 5 },
    });

    assert.equal(moved.valid, true);
    assert.equal(moved.scene.people.find((person) => person.id === targetId)?.routeId, null);
    assert.equal(moved.scene.people.find((person) => person.id === targetId)?.distanceAlongRouteMeters, null);
    assert.equal(moved.scene.people.find((person) => person.id === untouched.id), untouched);
    const rotated = applyQueueCommand(moved.scene, { type: 'person:rotate', id: targetId, yawRadians: Math.PI / 2 });
    assert.equal(rotated.valid, true);
    assert.equal(rotated.scene.people.find((person) => person.id === targetId)?.yawRadians, Math.PI / 2);
    assert.equal(rotated.scene.people.find((person) => person.id === untouched.id), untouched);
  });

  it('appends behind the last person using its yaw and configured spacing', () => {
    const scene = createScene();
    scene.people = [{
      id: 'source', routeId: null, distanceAlongRouteMeters: null,
      position: { x: 4, z: 4 }, yawRadians: 0,
    }];
    scene.queue = { personIds: ['source'] };
    const history = createQueueHistory(scene);
    const result = executeQueueCommand(history, { type: 'person:append', sourceId: 'source', id: 'appended' });
    const appended = result.history.present.people.find((person) => person.id === 'appended');

    assert.equal(result.valid, true);
    assert.deepEqual(appended?.position, { x: 4, z: 3.2 });
    assert.equal(appended?.routeId, null);
    assert.equal(appended?.distanceAlongRouteMeters, null);
    assert.equal(appended?.yawRadians, 0);
    assert.equal(scene.people.length, 1);
    assert.equal(undoQueue(result.history).present, scene);
    assert.equal(redoQueue(undoQueue(result.history)).present, result.history.present);
  });

  it('rejects an append that collides without changing the input reference', () => {
    const scene = createScene();
    scene.restrictedAreas = [{
      id: 'append-zone',
      name: 'Zona de bloqueio',
      vertices: [
        { id: 'append-zone-a', x: 3.8, z: 3 }, { id: 'append-zone-b', x: 4.2, z: 3 },
        { id: 'append-zone-c', x: 4.2, z: 3.4 }, { id: 'append-zone-d', x: 3.8, z: 3.4 },
      ],
    }];
    scene.people = [{
      id: 'source', routeId: null, distanceAlongRouteMeters: null,
      position: { x: 4, z: 4 }, yawRadians: 0,
    }];
    scene.queue = { personIds: ['source'] };
    const result = applyQueueCommand(scene, { type: 'person:append', sourceId: 'source', id: 'colliding' });

    assert.equal(result.valid, false);
    assert.match(result.errors.join(), /conflito/);
    assert.equal(result.scene, scene);
    assert.equal(scene.people.length, 1);
  });

  it('keeps free people and their placement unchanged when spacing redistributes routes', () => {
    const routeScene = applyQueueCommand(createScene(), { type: 'route:set', route: bentRoute }).scene;
    const withRoutePeople = applyQueueCommand(routeScene, {
      type: 'people:fill', routeId: bentRoute.id, idPrefix: 'route-',
    }).scene;
    const freePerson = {
      id: 'free-person', routeId: null, distanceAlongRouteMeters: null,
      position: { x: 8, z: 6 }, yawRadians: 0.3,
    };
    const mixedScene = { ...withRoutePeople, people: [...withRoutePeople.people, freePerson] };
    assert.equal(validateQueueScene(mixedScene).valid, true);

    const result = applyQueueCommand(mixedScene, { type: 'simulation:spacing', spacingMeters: 0.5 });

    assert.equal(result.valid, true);
    assert.equal(result.scene.people.find((person) => person.id === freePerson.id), freePerson);
    assert.deepEqual(freePerson.position, { x: 8, z: 6 });
    assert.equal(freePerson.yawRadians, 0.3);
  });

  it('reduces route occupancy around a free person without rejecting the spacing edit', () => {
    const route: QueueRoute = {
      id: 'shared-space',
      points: [{ id: 'shared-a', x: 1, z: 2 }, { id: 'shared-b', x: 5, z: 2 }],
    };
    const routeScene = applyQueueCommand(createScene(), { type: 'route:set', route }).scene;
    const filledScene = applyQueueCommand(routeScene, {
      type: 'people:fill', routeId: route.id, idPrefix: 'queued-',
    }).scene;
    const freePerson = {
      id: 'free-near-route', routeId: null, distanceAlongRouteMeters: null,
      position: { x: 1.4, z: 2.4 }, yawRadians: 0,
    };
    const mixedScene = { ...filledScene, people: [...filledScene.people, freePerson] };
    assert.equal(validateQueueScene(mixedScene).valid, true);

    const result = applyQueueCommand(mixedScene, { type: 'simulation:spacing', spacingMeters: 0.5 });

    assert.equal(result.valid, true);
    assert.equal(result.scene.people.filter((person) => person.routeId === route.id).length, 1);
    assert.equal(result.scene.people.find((person) => person.id === freePerson.id), freePerson);
    assert.equal(validateQueueScene(result.scene).valid, true);
  });

  it('moves a perimeter vertex, clears confirmation and rejects invalidating existing geometry atomically', () => {
    const scene = createScene();
    scene.environment = { ...scene.environment, confirmedAt: '2026-10-28T12:00:00.000Z' };
    const moved = applyQueueCommand(scene, {
      type: 'environment:vertex-move', id: 'corner-2', position: { x: 9, z: 0 },
    });

    assert.equal(moved.valid, true);
    assert.equal(moved.scene.environment.confirmedAt, null);
    assert.equal(moved.scene.environment.perimeter.find((vertex) => vertex.id === 'corner-2')?.x, 9);

    const guardedScene = createScene();
    guardedScene.posts = [{
      id: 'edge-post', position: { x: 9.5, z: 4 }, heightMeters: 0.95, baseRadiusMeters: 0.16,
    }];
    assert.equal(validateQueueScene(guardedScene).valid, true);
    const invalidatingMove = applyQueueCommand(guardedScene, {
      type: 'environment:vertex-move', id: 'corner-2', position: { x: 8.8, z: 0 },
    });

    assert.equal(invalidatingMove.valid, false);
    assert.equal(invalidatingMove.scene, guardedScene);
  });

  it('confirms environment only with valid ISO timestamps and history can undo confirmation', () => {
    const scene = createScene();
    const invalid = applyQueueCommand(scene, { type: 'environment:confirm', confirmedAt: 'not-a-date' });
    assert.equal(invalid.valid, false);
    assert.equal(invalid.scene, scene);
    const history = createQueueHistory(scene);
    const confirmed = executeQueueCommand(history, {
      type: 'environment:confirm', confirmedAt: '2026-10-28T12:30:00.000Z',
    });

    assert.equal(confirmed.valid, true);
    assert.equal(confirmed.history.present.environment.confirmedAt, '2026-10-28T12:30:00.000Z');
    assert.equal(undoQueue(confirmed.history).present, scene);
  });

  it('does not shorten configured spacing to occupy a closer route endpoint', () => {
    const route: QueueRoute = {
      id: 'seven-meters',
      points: [{ id: 'seven-a', x: 1, z: 2 }, { id: 'seven-b', x: 8, z: 2 }],
    };
    const routeScene = applyQueueCommand(createScene(), { type: 'route:set', route }).scene;
    const result = applyQueueCommand(routeScene, {
      type: 'people:fill', routeId: route.id, idPrefix: 'seven-',
    });

    assert.equal(result.valid, true);
    assert.equal(result.scene.people.length, 9);
    assert.equal(result.scene.people[0]?.distanceAlongRouteMeters, 0);
    const lastPerson = result.scene.people.at(-1);
    assert.ok(lastPerson);
    assert.ok(typeof lastPerson.distanceAlongRouteMeters === 'number');
    assert.ok(Math.abs(lastPerson.distanceAlongRouteMeters - 6.4) < 1e-9);
  });

  it('includes the endpoint when route length is an exact spacing multiple', () => {
    const route: QueueRoute = {
      id: 'endpoint',
      points: [{ id: 'endpoint-a', x: 1, z: 1 }, { id: 'endpoint-b', x: 6.6, z: 1 }],
    };
    const routeScene = applyQueueCommand(createScene(), { type: 'route:set', route }).scene;
    const result = applyQueueCommand(routeScene, {
      type: 'people:fill', routeId: route.id, idPrefix: 'endpoint-',
    });

    assert.equal(result.valid, true);
    const lastPerson = result.scene.people.at(-1);
    assert.ok(lastPerson);
    assert.ok(typeof lastPerson.distanceAlongRouteMeters === 'number');
    assert.ok(Math.abs(lastPerson.distanceAlongRouteMeters - 5.6) < 1e-9);
  });

  it('removes dependent belts atomically and undo/redo restores the full scene', () => {
    const scene = createScene();
    scene.posts = [
      { id: 'post-a', position: { x: 2, z: 2 }, heightMeters: 0.95, baseRadiusMeters: 0.16 },
      { id: 'post-b', position: { x: 4, z: 2 }, heightMeters: 0.95, baseRadiusMeters: 0.16 },
    ];
    scene.belts = [{ id: 'belt-a', fromPostId: 'post-a', toPostId: 'post-b', heightMeters: 0.86 }];
    assert.equal(validateQueueScene(scene).valid, true);
    const history = createQueueHistory(scene);
    const removal = executeQueueCommand(history, { type: 'post:remove', id: 'post-a' });

    assert.equal(removal.valid, true);
    assert.equal(removal.history.present.belts.length, 0);
    assert.deepEqual(undoQueue(removal.history).present, scene);
    assert.deepEqual(redoQueue(removal.history).present, removal.history.present);
  });

  it('checks position/yaw caches and returns the same scene for invalid commands', () => {
    const routeScene = applyQueueCommand(createScene(), { type: 'route:set', route: bentRoute }).scene;
    const filledScene = applyQueueCommand(routeScene, {
      type: 'people:fill', routeId: bentRoute.id, idPrefix: 'cache-',
    }).scene;
    const staleCache = {
      ...filledScene,
      people: [{ ...filledScene.people[0]!, position: { x: 9, z: 7 } }],
    };
    const invalidRoute: QueueRoute = {
      id: bentRoute.id,
      points: [{ id: 'bad-a', x: 0, z: 0 }, { id: 'bad-b', x: 0, z: 0 }],
    };

    assert.equal(validateQueueScene(staleCache).valid, false);
    const result = applyQueueCommand(routeScene, { type: 'route:set', route: invalidRoute });
    assert.equal(result.valid, false);
    assert.equal(result.scene, routeScene);
  });

  it('rejects inverse duplicate belt connections', () => {
    const scene = createScene();
    scene.posts = [
      { id: 'post-a', position: { x: 2, z: 2 }, heightMeters: 0.95, baseRadiusMeters: 0.16 },
      { id: 'post-b', position: { x: 4, z: 2 }, heightMeters: 0.95, baseRadiusMeters: 0.16 },
    ];
    scene.belts = [
      { id: 'belt-a', fromPostId: 'post-a', toPostId: 'post-b', heightMeters: 0.86 },
      { id: 'belt-b', fromPostId: 'post-b', toPostId: 'post-a', heightMeters: 0.86 },
    ];

    assert.equal(validateQueueScene(scene).valid, false);
  });

  it('keeps history at 100 actions and clears redo after a new command', () => {
    let history = createQueueHistory(createScene());
    for (let index = 0; index < 101; index++) {
      history = executeQueueCommand(history, {
        type: 'simulation:spacing', spacingMeters: index % 2 ? 0.8 : 1,
      }).history;
    }

    assert.equal(history.past.length, 100);
    const undone = undoQueue(history);
    assert.equal(redoQueue(undone).present, history.present);
    const freshEdit = executeQueueCommand(undone, { type: 'people:clear' }).history;
    assert.equal(freshEdit.future.length, 0);
  });

  it('does not exceed the 10,000-person generation limit', () => {
    const route: QueueRoute = {
      id: 'short-route',
      points: [{ id: 'short-a', x: 1, z: 1 }, { id: 'short-b', x: 1, z: 7 }],
    };
    const routeScene = applyQueueCommand(createScene(), { type: 'route:set', route }).scene;
    const result = applyQueueCommand(routeScene, {
      type: 'people:fill', routeId: route.id, idPrefix: 'limited-',
    });

    assert.equal(result.valid, true);
    assert.ok(result.scene.people.length <= 10_000);
  });

  it('fills and validates at the defensive ceiling of 10,000 people', () => {
    const scene = createScene();
    scene.environment = createRectangleEnvironment({ widthMeters: 10_000, depthMeters: 8 });
    const route: QueueRoute = {
      id: 'long-route',
      points: [{ id: 'long-a', x: 0.5, z: 2 }, { id: 'long-b', x: 9_999.5, z: 2 }],
    };
    const routeScene = applyQueueCommand(scene, { type: 'route:set', route });
    assert.equal(routeScene.valid, true);

    const result = applyQueueCommand(routeScene.scene, {
      type: 'people:fill', routeId: route.id, idPrefix: 'limited-',
    });

    assert.equal(result.valid, true);
    assert.equal(result.scene.people.length, 10_000);
    assert.equal(validateQueueScene(result.scene).valid, true);
  });

  it('rejects a belt crossing a restricted area while accepting its own endpoint posts', () => {
    const scene = createScene();
    scene.restrictedAreas = [{
      id: 'zone',
      name: 'Zona',
      vertices: [
        { id: 'zone-a', x: 4, z: 2 }, { id: 'zone-b', x: 6, z: 2 },
        { id: 'zone-c', x: 6, z: 4 }, { id: 'zone-d', x: 4, z: 4 },
      ],
    }];
    scene.posts = [
      { id: 'post-a', position: { x: 2, z: 3 }, heightMeters: 0.95, baseRadiusMeters: 0.16 },
      { id: 'post-b', position: { x: 8, z: 3 }, heightMeters: 0.95, baseRadiusMeters: 0.16 },
    ];
    assert.equal(validateQueueScene(scene).valid, true);

    const result = applyQueueCommand(scene, {
      type: 'belt:add',
      belt: { id: 'crossing-belt', fromPostId: 'post-a', toPostId: 'post-b', heightMeters: 0.86 },
    });

    assert.equal(result.valid, false);
    assert.equal(result.scene, scene);
  });

  it('requires post base radius plus clearance to fit against each wall', () => {
    const scene = createScene();
    scene.posts = [{
      id: 'near-wall', position: { x: 0.18, z: 2 }, heightMeters: 0.95, baseRadiusMeters: 0.16,
    }];

    const result = validateQueueScene(scene);

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((message) => message.includes('folga')));
  });

  it('rejects an area edge that crosses a concave environment notch', () => {
    const scene = createScene();
    scene.environment = {
      ...scene.environment,
      perimeter: [
        { id: 'env-a', x: 0, z: 0 }, { id: 'env-b', x: 8, z: 0 },
        { id: 'env-c', x: 8, z: 3 }, { id: 'env-d', x: 3, z: 3 },
        { id: 'env-e', x: 3, z: 8 }, { id: 'env-f', x: 0, z: 8 },
      ],
    };
    scene.restrictedAreas = [{
      id: 'triangle',
      name: 'Triângulo',
      vertices: [
        { id: 'triangle-a', x: 1, z: 6 }, { id: 'triangle-b', x: 6, z: 1 },
        { id: 'triangle-c', x: 1, z: 1 },
      ],
    }];

    assert.equal(validateQueueScene(scene).valid, false);
  });

  it('rejects duplicate belt connections in the same direction', () => {
    const scene = createScene();
    scene.posts = [
      { id: 'post-a', position: { x: 2, z: 2 }, heightMeters: 0.95, baseRadiusMeters: 0.16 },
      { id: 'post-b', position: { x: 5, z: 2 }, heightMeters: 0.95, baseRadiusMeters: 0.16 },
    ];
    scene.belts = [
      { id: 'belt-a', fromPostId: 'post-a', toPostId: 'post-b', heightMeters: 0.86 },
      { id: 'belt-b', fromPostId: 'post-a', toPostId: 'post-b', heightMeters: 0.86 },
    ];

    assert.equal(validateQueueScene(scene).valid, false);
  });

  it('rejects adjacent 180-degree reversals and IDs duplicated across entities', () => {
    const scene = createScene();
    const reversal: QueueRoute = {
      id: 'backtrack',
      points: [
        { id: 'back-a', x: 1, z: 1 }, { id: 'back-b', x: 4, z: 1 },
        { id: 'back-c', x: 2, z: 1 },
      ],
    };
    const invalidRoute = applyQueueCommand(scene, { type: 'route:set', route: reversal });
    const duplicateArea = applyQueueCommand(scene, {
      type: 'area:add',
      area: {
        id: 'duplicate-area',
        name: 'Área',
        vertices: [
          { id: 'corner-1', x: 1, z: 1 }, { id: 'area-b', x: 2, z: 1 },
          { id: 'area-c', x: 2, z: 2 },
        ],
      },
    });

    assert.equal(invalidRoute.valid, false);
    assert.equal(duplicateArea.valid, false);
  });

  it('rejects invalid dimensions and negative person distances', () => {
    const invalidPostScene = createScene();
    invalidPostScene.posts = [{
      id: 'invalid-post', position: { x: 2, z: 2 }, heightMeters: 0, baseRadiusMeters: 0.16,
    }];
    const routeScene = applyQueueCommand(createScene(), { type: 'route:set', route: bentRoute }).scene;
    const negativeDistanceScene = {
      ...routeScene,
      people: [{
        id: 'negative-person', routeId: bentRoute.id, distanceAlongRouteMeters: -0.1,
        position: { x: 1, z: 2 }, yawRadians: Math.PI / 2,
      }],
    };

    assert.equal(validateQueueScene(invalidPostScene).valid, false);
    assert.equal(validateQueueScene(negativeDistanceScene).valid, false);
  });

  it('treats person footprint tangency at the required clearance as a collision', () => {
    const routeScene = applyQueueCommand(createScene(), { type: 'route:set', route: bentRoute }).scene;
    const tangentScene = {
      ...routeScene,
      people: [
        { id: 'person-a', routeId: bentRoute.id, distanceAlongRouteMeters: 0, position: { x: 1, z: 2 }, yawRadians: Math.PI / 2 },
        { id: 'person-b', routeId: bentRoute.id, distanceAlongRouteMeters: 0.45, position: { x: 1.45, z: 2 }, yawRadians: Math.PI / 2 },
      ],
    };

    assert.equal(validateQueueScene(tangentScene).valid, false);
  });

  it('fills around people on another route without invalidating the scene', () => {
    const firstRouteScene = applyQueueCommand(createScene(), { type: 'route:set', route: bentRoute }).scene;
    const twoRouteScene = applyQueueCommand(firstRouteScene, {
      type: 'route:set',
      route: { id: 'other-route', points: [{ id: 'other-a', x: 1, z: 2 }, { id: 'other-b', x: 5, z: 2 }] },
    }).scene;
    const firstFill = applyQueueCommand(twoRouteScene, {
      type: 'people:fill', routeId: bentRoute.id, idPrefix: 'main-',
    });
    const secondFill = applyQueueCommand(firstFill.scene, {
      type: 'people:fill', routeId: 'other-route', idPrefix: 'other-',
    });

    assert.equal(firstFill.valid, true);
    assert.equal(secondFill.valid, true);
    assert.equal(validateQueueScene(secondFill.scene).valid, true);
  });

  it('counts total route length and joint capacity without duplicating shared slots', () => {
    const routeScene = applyQueueCommand(createScene(), { type: 'route:set', route: bentRoute }).scene;
    const combinedScene = applyQueueCommand(routeScene, {
      type: 'route:set',
      route: { id: 'same-slots', points: [{ id: 'same-a', x: 1, z: 2 }, { id: 'same-b', x: 5, z: 2 }] },
    }).scene;

    assert.equal(getQueueStats(routeScene).capacity, getQueueStats(combinedScene).capacity);
    assert.equal(getQueueStats(combinedScene).routeLengthMeters, 12);
  });

  it('rejects a belt passing through the footprint of a third post', () => {
    const scene = createScene();
    scene.posts = [
      { id: 'post-a', position: { x: 2, z: 2 }, heightMeters: 0.95, baseRadiusMeters: 0.16 },
      { id: 'post-b', position: { x: 8, z: 2 }, heightMeters: 0.95, baseRadiusMeters: 0.16 },
      { id: 'post-c', position: { x: 5, z: 2.2 }, heightMeters: 0.95, baseRadiusMeters: 0.16 },
    ];
    assert.equal(validateQueueScene(scene).valid, true);

    const result = applyQueueCommand(scene, {
      type: 'belt:add',
      belt: { id: 'blocked-belt', fromPostId: 'post-a', toPostId: 'post-b', heightMeters: 0.86 },
    });

    assert.equal(result.valid, false);
  });

  it('rejects an area that encloses a vertex in an environment notch', () => {
    const scene = createScene();
    scene.environment = {
      ...scene.environment,
      perimeter: [
        { id: 'env-a', x: 0, z: 0 }, { id: 'env-b', x: 8, z: 0 },
        { id: 'env-c', x: 8, z: 3 }, { id: 'env-d', x: 3, z: 3 },
        { id: 'env-e', x: 3, z: 8 }, { id: 'env-f', x: 0, z: 8 },
      ],
    };
    scene.restrictedAreas = [{
      id: 'wrap-area',
      name: 'Área',
      vertices: [
        { id: 'wrap-a', x: 1, z: 1 }, { id: 'wrap-b', x: 7, z: 1 },
        { id: 'wrap-c', x: 7, z: 2.8 }, { id: 'wrap-d', x: 2.8, z: 7 },
        { id: 'wrap-e', x: 1, z: 7 },
      ],
    }];

    assert.equal(validateQueueScene(scene).valid, false);
  });

  it('redistributes spacing immutably and undo/redo restores the exact scene', () => {
    const routeScene = applyQueueCommand(createScene(), { type: 'route:set', route: bentRoute }).scene;
    const filledScene = applyQueueCommand(routeScene, {
      type: 'people:fill', routeId: bentRoute.id, idPrefix: 'spaced-',
    }).scene;
    const history = createQueueHistory(filledScene);
    const result = executeQueueCommand(history, { type: 'simulation:spacing', spacingMeters: 0.5 });

    assert.equal(result.valid, true);
    assert.equal(filledScene.simulation.spacingMeters, 0.8);
    assert.equal(filledScene.people[1]?.distanceAlongRouteMeters, 0.8);
    assert.equal(undoQueue(result.history).present, filledScene);
    assert.equal(redoQueue(undoQueue(result.history)).present, result.history.present);
  });
});
