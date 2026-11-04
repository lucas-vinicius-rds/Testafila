import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRectangleEnvironment } from '../../domain/environment.ts';
import {
  applyQueueCommand,
  createQueueHistory,
  executeQueueCommand,
  getChainPeople,
  getQueueMode,
  redoQueue,
  undoQueue,
  validateQueueScene,
} from '../../domain/queue/index.ts';
import type { PersonPlacement, ProjectScene } from '../../contracts/project.ts';
import type { QueueCommand } from '../../contracts/queue-editor.ts';

function emptyScene(): ProjectScene {
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
    simulation: { spacingMeters: 0.8, personHeightMeters: 1.7, personRadiusMeters: 0.2, clearanceMeters: 0.05 },
  };
}

const person = (id: string, x: number, z: number, yawRadians = 0): PersonPlacement => ({
  id, routeId: null, distanceAlongRouteMeters: null, position: { x, z }, yawRadians,
});

function run(scene: ProjectScene, ...commands: QueueCommand[]): ProjectScene {
  return commands.reduce((current, command) => {
    const result = applyQueueCommand(current, command);
    assert.deepEqual(result.errors, [], command.type);
    return result.scene;
  }, scene);
}

/** Cabeça em (5, 6) olhando para +Z; as demais ficam atrás, em z decrescente. */
function chainScene(count = 4): ProjectScene {
  const appends = Array.from({ length: count - 1 }, (_, index): QueueCommand => ({ type: 'person:append', id: `p${index + 1}` }));
  return run(emptyScene(), { type: 'person:add', person: person('p0', 5, 6) }, ...appends);
}

const gaps = (scene: ProjectScene): number[] => {
  const chain = getChainPeople(scene);
  return chain.slice(1).map((current, index) => Math.hypot(
    current.position.x - chain[index]!.position.x,
    current.position.z - chain[index]!.position.z,
  ));
};
const assertGaps = (scene: ProjectScene, expected: number) => {
  for (const gap of gaps(scene)) assert.ok(Math.abs(gap - expected) < 1e-9, `gap ${gap}`);
};
const assertNear = (actual: { x: number; z: number }, x: number, z: number) => {
  assert.ok(Math.abs(actual.x - x) < 1e-9 && Math.abs(actual.z - z) < 1e-9, `${actual.x},${actual.z}`);
};
const byId = (scene: ProjectScene, id: string) => scene.people.find((item) => item.id === id)!;

describe('fila interligada', () => {
  it('primeira pessoa define início e orientação; só existe uma fila', () => {
    const scene = run(emptyScene(), { type: 'person:add', person: person('p0', 5, 6, 0.4) });
    assert.equal(getQueueMode(scene), 'chain');
    assert.deepEqual(scene.queue.personIds, ['p0']);
    assert.equal(byId(scene, 'p0').yawRadians, 0.4);
    const second = applyQueueCommand(scene, { type: 'person:add', person: person('p1', 2, 2) });
    assert.equal(second.valid, false);
    assert.match(second.errors[0]!, /\+1/);
    assert.equal(second.scene, scene);
  });

  it('+1 entra atrás da última pessoa, mesmo com outra origem informada', () => {
    const scene = run(chainScene(3), { type: 'person:append', id: 'novo', sourceId: 'p0' });
    assert.deepEqual(scene.queue.personIds, ['p0', 'p1', 'p2', 'novo']);
    assertNear(byId(scene, 'novo').position, 5, 3.6);
    assert.equal(byId(scene, 'novo').routeId, null);
  });

  it('+1 sem primeira pessoa é rejeitado', () => {
    const scene = emptyScene();
    const result = applyQueueCommand(scene, { type: 'person:append', id: 'x' });
    assert.equal(result.valid, false);
    assert.equal(result.scene, scene);
  });

  it('+1 que colide não altera a cena', () => {
    const scene = chainScene(2);
    scene.restrictedAreas = [{
      id: 'zona', name: 'Zona', vertices: [
        { id: 'a', x: 4.8, z: 4.2 }, { id: 'b', x: 5.2, z: 4.2 }, { id: 'c', x: 5.2, z: 4.6 }, { id: 'd', x: 4.8, z: 4.6 },
      ],
    }];
    assert.equal(validateQueueScene(scene).valid, true);
    const result = applyQueueCommand(scene, { type: 'person:append', id: 'x' });
    assert.equal(result.valid, false);
    assert.match(result.errors.join(), /conflito/);
    assert.equal(result.scene, scene);
  });

  for (const spacing of [0.5, 1]) {
    it(`espaçamento ${spacing} recompõe a cadeia inteira a partir da primeira pessoa`, () => {
      const scene = run(chainScene(), { type: 'simulation:spacing', spacingMeters: spacing });
      assertGaps(scene, spacing);
      assertNear(byId(scene, 'p0').position, 5, 6);
      assertNear(byId(scene, 'p3').position, 5, 6 - 3 * spacing);
    });
  }

  it('espaçamento preserva curvas da fila', () => {
    const bent = run(chainScene(), { type: 'person:rotate', id: 'p1', yawRadians: Math.PI / 2 });
    const scene = run(bent, { type: 'simulation:spacing', spacingMeters: 0.5 });
    assertGaps(scene, 0.5);
    assertNear(byId(scene, 'p1').position, 5, 5.5);
    assertNear(byId(scene, 'p3').position, 4, 5.5);
  });

  it('girar pessoa do meio gira o trecho seguinte e não muda as anteriores', () => {
    const before = chainScene();
    const scene = run(before, { type: 'person:rotate', id: 'p1', yawRadians: Math.PI / 2 });
    assert.equal(byId(scene, 'p0'), byId(before, 'p0'));
    assert.deepEqual(byId(scene, 'p1').position, byId(before, 'p1').position);
    assert.equal(byId(scene, 'p1').yawRadians, Math.PI / 2);
    assertNear(byId(scene, 'p2').position, 4.2, 5.2);
    assertNear(byId(scene, 'p3').position, 3.4, 5.2);
    assert.ok(Math.abs(byId(scene, 'p3').yawRadians - Math.PI / 2) < 1e-9);
    assertGaps(scene, 0.8);
  });

  it('girar a última pessoa só muda a orientação dela', () => {
    const before = chainScene();
    const scene = run(before, { type: 'person:rotate', id: 'p3', yawRadians: 1 });
    assert.deepEqual(byId(scene, 'p3').position, byId(before, 'p3').position);
    assert.equal(byId(scene, 'p2'), byId(before, 'p2'));
  });

  it('mover a primeira pessoa translada a cadeia inteira', () => {
    const scene = run(chainScene(), { type: 'person:move', id: 'p0', position: { x: 6, z: 7 } });
    assertNear(byId(scene, 'p0').position, 6, 7);
    assertNear(byId(scene, 'p3').position, 6, 4.6);
    assertGaps(scene, 0.8);
  });

  it('mover pessoa do meio mantém o vínculo com a anterior e leva o trecho seguinte', () => {
    const before = chainScene();
    const scene = run(before, { type: 'person:move', id: 'p2', position: { x: 8, z: 5.2 } });
    assert.equal(byId(scene, 'p0'), byId(before, 'p0'));
    assert.equal(byId(scene, 'p1'), byId(before, 'p1'));
    assertNear(byId(scene, 'p2').position, 5.8, 5.2);
    assertNear(byId(scene, 'p3').position, 6.6, 5.2);
    assertGaps(scene, 0.8);
  });

  it('mover sobre a pessoa anterior é rejeitado', () => {
    const scene = chainScene();
    const result = applyQueueCommand(scene, { type: 'person:move', id: 'p1', position: { x: 5, z: 6 } });
    assert.equal(result.valid, false);
    assert.equal(result.scene, scene);
  });

  it('remover fecha a cadeia sem órfãos, no meio, no início e no fim', () => {
    const middle = run(chainScene(), { type: 'person:remove', id: 'p1' });
    assert.deepEqual(middle.queue.personIds, ['p0', 'p2', 'p3']);
    assert.equal(middle.people.length, 3);
    assertNear(byId(middle, 'p2').position, 5, 5.2);
    assertGaps(middle, 0.8);

    const head = run(chainScene(), { type: 'person:remove', id: 'p0' });
    assert.deepEqual(head.queue.personIds, ['p1', 'p2', 'p3']);
    assertNear(byId(head, 'p1').position, 5, 6);
    assertGaps(head, 0.8);

    const tail = run(chainScene(), { type: 'person:remove', id: 'p3' });
    assert.deepEqual(tail.queue.personIds, ['p0', 'p1', 'p2']);

    const none = run(chainScene(1), { type: 'person:remove', id: 'p0' });
    assert.equal(getQueueMode(none), 'empty');
    assert.equal(validateQueueScene(none).valid, true);
  });

  it('limpar esvazia pessoas e cadeia', () => {
    const scene = run(chainScene(), { type: 'people:clear' });
    assert.equal(getQueueMode(scene), 'empty');
    assert.deepEqual(scene.queue.personIds, []);
  });

  it('operação que sai do ambiente ou colide deixa a cena intacta', () => {
    const scene = chainScene();
    const nearLeftWall = run(scene, { type: 'person:move', id: 'p0', position: { x: 0.5, z: 6 } });
    const nearBackWall = run(scene, { type: 'person:move', id: 'p0', position: { x: 5, z: 3.1 } });
    const rejected: Array<readonly [ProjectScene, QueueCommand]> = [
      [scene, { type: 'person:move', id: 'p0', position: { x: 5, z: 1.5 } }],
      [scene, { type: 'person:move', id: 'p0', position: { x: 12, z: 6 } }],
      [nearLeftWall, { type: 'person:rotate', id: 'p0', yawRadians: Math.PI / 2 }],
      [nearBackWall, { type: 'simulation:spacing', spacingMeters: 1 }],
    ];
    for (const [input, command] of rejected) {
      const snapshot = structuredClone(input);
      const result = applyQueueCommand(input, command);
      assert.equal(result.valid, false, command.type);
      assert.equal(result.scene, input);
      assert.deepEqual(input, snapshot);
    }
  });

  it('desfazer e refazer atravessam a propagação da cadeia', () => {
    const start = chainScene();
    let history = createQueueHistory(start);
    history = executeQueueCommand(history, { type: 'person:rotate', id: 'p1', yawRadians: 1 }).history;
    history = executeQueueCommand(history, { type: 'simulation:spacing', spacingMeters: 0.5 }).history;
    history = executeQueueCommand(history, { type: 'person:remove', id: 'p2' }).history;
    const end = history.present;
    const undone = undoQueue(undoQueue(undoQueue(history)));
    assert.equal(undone.present, start);
    assert.equal(redoQueue(redoQueue(redoQueue(undone))).present, end);
  });

  it('comandos de percurso legado são rejeitados com cadeia', () => {
    const scene = chainScene(2);
    const route = { id: 'r', points: [{ id: 'r1', x: 1, z: 1 }, { id: 'r2', x: 2, z: 1 }] };
    assert.equal(applyQueueCommand(scene, { type: 'route:set', route }).valid, false);
    assert.equal(applyQueueCommand(scene, { type: 'people:add', routeId: 'r', id: 'x' }).valid, false);
    assert.equal(applyQueueCommand(scene, { type: 'people:fill', routeId: 'r', idPrefix: 'x' }).valid, false);
  });

  it('rejeita documentos com cadeia inconsistente', () => {
    const valid = chainScene(3);
    assert.equal(validateQueueScene(valid).valid, true);
    const cases: Array<[string, (scene: ProjectScene) => void, RegExp]> = [
      ['distância', (s) => { s.people[1]!.position.z -= 0.1; }, /espaçamento/],
      ['referência', (s) => { s.queue.personIds[1] = 'fantasma'; }, /inexistente/],
      ['repetição', (s) => { s.queue.personIds[2] = 'p0'; }, /repete/],
      ['pessoa fora', (s) => { s.people.push(person('solta', 1, 1)); }, /fora da fila/],
      ['fora da ordem', (s) => { s.queue.personIds.reverse(); s.queue.personIds.push(s.queue.personIds.shift()!); }, /espaçamento/],
      ['percurso', (s) => { s.people[0]!.routeId = 'r'; s.people[0]!.distanceAlongRouteMeters = 0; }, /percurso/],
    ];
    for (const [name, mutate, message] of cases) {
      const scene = structuredClone(valid);
      mutate(scene);
      const result = validateQueueScene(scene);
      assert.equal(result.valid, false, name);
      assert.match(result.errors.join(' | '), message, name);
    }
  });

  it('rejeita vínculo que atravessa uma fita', () => {
    const scene = chainScene(2);
    scene.simulation = { ...scene.simulation, personRadiusMeters: 0.1, clearanceMeters: 0.05 };
    scene.posts = [
      { id: 'a', position: { x: 3, z: 5.6 }, heightMeters: 0.95, baseRadiusMeters: 0.08 },
      { id: 'b', position: { x: 7, z: 5.6 }, heightMeters: 0.95, baseRadiusMeters: 0.08 },
    ];
    scene.belts = [{ id: 'fita', fromPostId: 'a', toPostId: 'b', heightMeters: 0.86 }];
    assert.match(validateQueueScene(scene).errors.join(), /cruza um obstáculo/);
  });
});

describe('pessoas legadas', () => {
  const legacy = (): ProjectScene => ({
    ...emptyScene(),
    people: [person('a', 5, 6), person('b', 5.5, 5), person('c', 5.5, 3, 0.7)],
  });

  it('abrem como legado, sem alteração, e continuam válidas', () => {
    const scene = legacy();
    assert.equal(getQueueMode(scene), 'legacy');
    assert.equal(validateQueueScene(scene).valid, true);
  });

  it('não crescem sem conversão explícita', () => {
    const scene = legacy();
    for (const command of [
      { type: 'person:append', id: 'x' },
      { type: 'person:add', person: person('x', 1, 1) },
    ] as QueueCommand[]) {
      const result = applyQueueCommand(scene, command);
      assert.equal(result.valid, false);
      assert.match(result.errors[0]!, /Converta/);
      assert.equal(result.scene, scene);
    }
  });

  it('podem ser movidas e removidas uma a uma, sem perda das demais', () => {
    const scene = legacy();
    const moved = run(scene, { type: 'person:move', id: 'b', position: { x: 7, z: 5 } });
    assert.equal(byId(moved, 'a'), byId(scene, 'a'));
    assert.equal(run(moved, { type: 'person:remove', id: 'b' }).people.length, 2);
  });

  it('conversão explícita é determinística e mantém ordem, início e direções', () => {
    const scene = legacy();
    const first = run(scene, { type: 'queue:convert-legacy' });
    assert.deepEqual(first, run(legacy(), { type: 'queue:convert-legacy' }));
    assert.equal(getQueueMode(first), 'chain');
    assert.deepEqual(first.queue.personIds, ['a', 'b', 'c']);
    assert.deepEqual(byId(first, 'a').position, byId(scene, 'a').position);
    assert.equal(byId(first, 'c').yawRadians, 0.7);
    assertGaps(first, 0.8);
    const unit = 0.8 / Math.hypot(0.5, 1);
    assertNear(byId(first, 'b').position, 5 + 0.5 * unit, 6 - unit);
    assert.equal(getQueueMode(scene), 'legacy');
  });

  it('conversão também desfaz referências de percurso', () => {
    const scene = legacy();
    scene.routes = [{ id: 'r', points: [{ id: 'r1', x: 5, z: 6 }, { id: 'r2', x: 5, z: 2 }] }];
    scene.people = [
      { ...person('a', 5, 6, Math.PI), routeId: 'r', distanceAlongRouteMeters: 0 },
      { ...person('b', 5, 5.2, Math.PI), routeId: 'r', distanceAlongRouteMeters: 0.8 },
    ];
    assert.equal(validateQueueScene(scene).valid, true);
    const converted = run(scene, { type: 'queue:convert-legacy' });
    assert.ok(converted.people.every((item) => item.routeId === null && item.distanceAlongRouteMeters === null));
  });

  it('conversão que colide é rejeitada com a cena intacta', () => {
    // c volta para trás de b: com espaçamento 1, cairia em cima de a.
    const scene = { ...emptyScene(), people: [person('a', 2, 4), person('b', 3.5, 4), person('c', 2.5, 4)] };
    scene.simulation = { ...scene.simulation, spacingMeters: 1 };
    assert.equal(validateQueueScene(scene).valid, true);
    const result = applyQueueCommand(scene, { type: 'queue:convert-legacy' });
    assert.equal(result.valid, false);
    assert.equal(result.scene, scene);
    assert.equal(getQueueMode(scene), 'legacy');
  });

  it('conversão sem pessoas legadas é rejeitada', () => {
    assert.equal(applyQueueCommand(emptyScene(), { type: 'queue:convert-legacy' }).valid, false);
    assert.equal(applyQueueCommand(chainScene(2), { type: 'queue:convert-legacy' }).valid, false);
  });
});

describe('área restrita: mover e girar', () => {
  const withArea = (): ProjectScene => ({
    ...emptyScene(),
    restrictedAreas: [{
      id: 'zona', name: 'Zona', vertices: [
        { id: 'a', x: 4, z: 3 }, { id: 'b', x: 6, z: 3 }, { id: 'c', x: 6, z: 4 }, { id: 'd', x: 4, z: 4 },
      ],
    }],
  });

  it('gira em torno do centroide preservando identificadores', () => {
    const scene = run(withArea(), { type: 'area:rotate', id: 'zona', angleRadians: Math.PI / 2 });
    const [a, b] = scene.restrictedAreas[0]!.vertices;
    assert.equal(a!.id, 'a');
    assertNear(a!, 4.5, 4.5);
    assertNear(b!, 4.5, 2.5);
  });

  it('move todos os vértices pelo mesmo deslocamento', () => {
    const scene = run(withArea(), { type: 'area:move', id: 'zona', delta: { x: 1, z: -1 } });
    assertNear(scene.restrictedAreas[0]!.vertices[0]!, 5, 2);
  });

  it('rejeita sair do ambiente, atingir pessoa ou área inexistente', () => {
    const scene = withArea();
    assert.equal(applyQueueCommand(scene, { type: 'area:move', id: 'zona', delta: { x: 9, z: 0 } }).valid, false);
    assert.equal(applyQueueCommand(scene, { type: 'area:rotate', id: 'nada', angleRadians: 1 }).valid, false);
    assert.equal(applyQueueCommand(scene, { type: 'area:rotate', id: 'zona', angleRadians: Number.NaN }).valid, false);
    const occupied = run(scene, { type: 'person:add', person: person('p', 5, 4.7) });
    const result = applyQueueCommand(occupied, { type: 'area:rotate', id: 'zona', angleRadians: Math.PI / 2 });
    assert.equal(result.valid, false);
    assert.equal(result.scene, occupied);
  });
});

describe('poste com várias fitas', () => {
  const post = (id: string, x: number, z: number) => ({ id, position: { x, z }, heightMeters: 0.95, baseRadiusMeters: 0.08 });
  const belt = (id: string, fromPostId: string, toPostId: string): QueueCommand => ({
    type: 'belt:add', belt: { id, fromPostId, toPostId, heightMeters: 0.86 },
  });
  const star = (): ProjectScene => ({
    ...emptyScene(),
    posts: [post('centro', 5, 4), post('leste', 7, 4), post('oeste', 3, 4), post('norte', 5, 6), post('sul', 5, 2)],
  });

  it('aceita quatro fitas em lados distintos, com o poste em qualquer ponta', () => {
    const scene = run(star(), belt('f1', 'centro', 'leste'), belt('f2', 'oeste', 'centro'), belt('f3', 'centro', 'norte'), belt('f4', 'sul', 'centro'));
    assert.equal(scene.belts.length, 4);
    assert.equal(validateQueueScene(scene).valid, true);
  });

  it('segue rejeitando duplicata A-B e B-A', () => {
    const scene = run(star(), belt('f1', 'centro', 'leste'));
    assert.equal(applyQueueCommand(scene, belt('f2', 'centro', 'leste')).valid, false);
    assert.equal(applyQueueCommand(scene, belt('f3', 'leste', 'centro')).valid, false);
  });

  it('segue rejeitando passagem por terceiro poste', () => {
    const scene = { ...star(), posts: [...star().posts, post('longe', 9, 4)] };
    const result = applyQueueCommand(run(scene, belt('f1', 'centro', 'leste')), belt('f2', 'centro', 'longe'));
    assert.equal(result.valid, false);
  });

  it('rejeita fita quase sobreposta a outra que sai do mesmo poste', () => {
    // A ponta livre de c fica a 0,3 m da linha a-b no caso aberto e a 0,03 m no fechado.
    const fan = (cz: number): ProjectScene => ({
      ...emptyScene(),
      posts: [post('a', 2, 4), post('b', 8, 4), post('c', 5, cz)],
    });
    const open = run(fan(4.3), belt('f1', 'a', 'c'));
    assert.equal(applyQueueCommand(open, belt('f2', 'a', 'b')).valid, true);
    const closed = { ...fan(4.03), belts: [{ id: 'f1', fromPostId: 'a', toPostId: 'c', heightMeters: 0.86 }] };
    assert.equal(applyQueueCommand(closed, belt('f2', 'a', 'b')).valid, false);
  });

  it('rejeita cruzamento entre fitas sem poste comum', () => {
    const scene = run(star(), belt('f1', 'norte', 'leste'));
    const crossing = { ...scene, posts: [...scene.posts, post('canto', 7, 6), post('meio', 5.2, 4.2)] };
    assert.match(applyQueueCommand(crossing, belt('f2', 'canto', 'meio')).errors.join(), /Fita f2 cruza/);
  });
});
