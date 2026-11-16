import assert from 'node:assert/strict';
import test from 'node:test';
import { detectArCapability } from './ar-capability.ts';
import { createHitStabilizer } from './hit-stabilizer.ts';
import { createXrSessionController, DomOverlayUnavailableError, type XrSessionOptions, type XrSessionRuntime, type XrTracking } from './xr-session.ts';

const FLOOR_ORIENTATION = { x: 0, y: 0, z: 0, w: 1 };
const WALL_ORIENTATION = { x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 };

function createHarness(overrides: Partial<XrSessionOptions> & { overlayNegotiated?: boolean } = {}) {
  const calls: string[] = [];
  const listeners = new Map<string, () => void>();
  const world = { pose: true, orientation: FLOOR_ORIENTATION, hit: true as boolean, at: { x: 1, y: 0, z: 2 }, cameraFinite: true, root: { x: 0, y: 0, z: 0, rotationY: 0 }, floorY: undefined as number | null | undefined };
  let loop: ((time: number, frame: XRFrame) => void) | null = null;

  const session = {
    visibilityState: 'visible' as XRVisibilityState,
    domOverlayState: overrides.overlayNegotiated === false ? undefined : { type: 'screen' },
    addEventListener(type: string, listener: () => void) { calls.push(`add:${type}`); listeners.set(type, listener); },
    removeEventListener(type: string) { calls.push(`remove:${type}`); listeners.delete(type); },
    async requestReferenceSpace(type: string) { calls.push(`space:${type}`); return { type }; },
    async requestHitTestSource(_options?: XRHitTestOptionsInit) { calls.push('hit-source'); return { cancel() { calls.push('hit-cancel'); } }; },
    async end() { calls.push('end'); listeners.get('end')?.(); },
  };
  const frame = {
    getViewerPose() { return world.pose ? {} : null; },
    getHitTestResults() {
      return world.hit
        ? [{ getPose: () => ({ transform: { position: { ...world.at }, orientation: world.orientation } }) }]
        : [];
    },
  } as unknown as XRFrame;

  const reticle = { visible: false, position: { set() { calls.push('reticle'); } } };
  const runtime = {
    renderer: {
      xr: {
        isPresenting: true,
        async setSession() { calls.push('set-session'); },
        getReferenceSpace() { calls.push('floor-space'); return { type: 'local-floor' }; },
        getCamera() { return { matrixWorld: { elements: [world.cameraFinite ? 1 : Number.NaN] } }; },
      },
      setAnimationLoop(callback: typeof loop) { calls.push(callback ? 'loop:on' : 'loop:off'); loop = callback; },
      render() { calls.push('render'); },
    },
    scene: {},
    camera: {},
    reticle,
    worldRoot: {
      position: { set(x: number, y: number, z: number) { Object.assign(world.root, { x, y, z }); } },
      rotation: { set(_x: number, y: number) { world.root.rotationY = y; } },
    },
    setFloorY(y: number | null) { world.floorY = y; },
  } as unknown as XrSessionRuntime;

  const tracking: XrTracking[] = [];
  const controller = createXrSessionController({
    getXr: () => ({ requestSession: (async () => { calls.push('request'); return session; }) as unknown as XRSystem['requestSession'] }),
    getRuntime: () => runtime,
    getOverlayRoot: () => ({}) as Element,
    onTrackingChange: (next) => tracking.push(next),
    onActive: () => calls.push('active'),
    onFinished: () => calls.push('finished'),
    onSelect: () => calls.push('select'),
    ...overrides,
  });

  return {
    calls, controller, frame, listeners, reticle, session, tracking, world,
    tick(time = 0) { calls.length = 0; loop?.(time, frame); return [...calls]; },
    /** Sweeps the aim 1 m sideways for 1.5 s, as the user is asked to, then rests at (1, 0, 2). Returns the end time. */
    sweepFloor(start = 0) {
      for (let i = 0; i < 90; i += 1) { world.at = { x: i / 90, y: 0, z: 2 }; loop?.(start + i * FRAME_MS, frame); }
      world.at = { x: 1, y: 0, z: 2 };
      return start + 90 * FRAME_MS;
    },
    /** Holds the aim still for a second. Returns the end time. */
    hold(start: number) {
      for (let i = 0; i < 60; i += 1) loop?.(start + i * FRAME_MS, frame);
      return start + 60 * FRAME_MS;
    },
    tickWithoutFrame() { calls.length = 0; if (loop) Reflect.apply(loop, undefined, [0]); return [...calls]; },
    setVisibility(state: XRVisibilityState) { session.visibilityState = state; listeners.get('visibilitychange')?.(); },
  };
}

const FRAME_MS = 1000 / 60;

const START_ORDER = ['request', 'add:end', 'add:visibilitychange', 'add:select', 'space:viewer', 'hit-source', 'set-session', 'floor-space', 'active', 'loop:on'];

test('animation callback without an XR frame is a no-op and preserves session call order', async () => {
  for (const variant of ['project', 'check'] as const) {
    const hits: unknown[] = [];
    const harness = createHarness({ variant, onFrame: (hit) => hits.push(hit) });
    await harness.controller.start();
    assert.deepEqual(harness.calls, START_ORDER);
    assert.deepEqual(harness.tick(), ['reticle', 'render']);
    const snapshot = {
      hit: harness.controller.currentHit(), reticle: harness.reticle.visible,
      tracking: [...harness.tracking], hits: [...hits], visible: harness.controller.isVisible(),
    };
    assert.doesNotThrow(() => assert.deepEqual(harness.tickWithoutFrame(), []));
    assert.deepEqual({
      hit: harness.controller.currentHit(), reticle: harness.reticle.visible,
      tracking: [...harness.tracking], hits: [...hits], visible: harness.controller.isVisible(),
    }, snapshot);
    assert.deepEqual(harness.tick(), ['reticle', 'render']);
    assert.equal(hits.length, 2, 'only real XR frames reach onFrame');
  }
});

test('start keeps the order recorded from the routes before the extraction', async () => {
  for (const variant of ['project', 'check'] as const) {
    const harness = createHarness({ variant });
    await harness.controller.start();
    assert.deepEqual(harness.calls, START_ORDER);
    assert.deepEqual(harness.tracking, ['searching']);
  }
});

test('requestSession runs synchronously, inside the click activation', () => {
  const harness = createHarness();
  void harness.controller.start();
  assert.deepEqual(harness.calls, ['request']);
});

test('the request keeps dom-overlay optional, even when the flow requires it', async () => {
  let init: XRSessionInit | undefined;
  const harness = createHarness({
    requireDomOverlay: true,
    getXr: () => ({ requestSession: (async (_mode: string, options: XRSessionInit) => { init = options; return harness.session; }) as unknown as XRSystem['requestSession'] }),
  });
  await harness.controller.start();
  assert.deepEqual(init?.requiredFeatures, ['hit-test', 'local-floor']);
  assert.deepEqual(init?.optionalFeatures, ['dom-overlay']);
});

test('project finish cancels before ending and keeps the listeners', async () => {
  const harness = createHarness();
  await harness.controller.start();
  harness.calls.length = 0;
  await harness.controller.finish(true);
  assert.deepEqual(harness.calls, ['hit-cancel', 'loop:off', 'finished', 'end']);
  assert.deepEqual(harness.tracking, ['searching', 'inactive']);
});

test('check stop ends first, then cleans up from the end event', async () => {
  const harness = createHarness({ variant: 'check' });
  await harness.controller.start();
  harness.calls.length = 0;
  await harness.controller.stop();
  assert.deepEqual(harness.calls, ['end', 'remove:end', 'remove:visibilitychange', 'remove:select', 'hit-cancel', 'loop:off', 'finished']);
});

test('a source already canceled by the browser does not stop the cleanup', async () => {
  const harness = createHarness();
  harness.session.requestHitTestSource = async () => ({ cancel() { throw new Error('InvalidStateError'); } });
  await harness.controller.start();
  harness.calls.length = 0;
  await harness.controller.finish(false);
  assert.deepEqual(harness.calls, ['loop:off', 'finished']);
});

test('a session without dom-overlay ends when the flow requires it', async () => {
  const harness = createHarness({ requireDomOverlay: true, overlayNegotiated: false });
  await assert.rejects(harness.controller.start(), DomOverlayUnavailableError);
  assert.deepEqual(harness.calls, ['request', 'loop:off', 'finished', 'end']);
  assert.equal(harness.controller.isVisible(), false);
});

test('a route that does not require dom-overlay still starts without it', async () => {
  const harness = createHarness({ overlayNegotiated: false });
  await harness.controller.start();
  assert.deepEqual(harness.calls, START_ORDER);
});

test('a failure during start cleans up and reaches the caller', async () => {
  const harness = createHarness();
  harness.session.requestReferenceSpace = async () => { throw new Error('sem espaço'); };
  await assert.rejects(harness.controller.start(), /sem espaço/);
  assert.deepEqual(harness.calls.slice(-2), ['finished', 'end']);
});

test('a floor hit shows the reticle and is available for marking', async () => {
  const harness = createHarness();
  await harness.controller.start();
  assert.deepEqual(harness.tick(), ['reticle', 'render']);
  assert.equal(harness.reticle.visible, true);
  assert.equal(harness.controller.tracking(), 'surface');
  assert.deepEqual(harness.controller.currentHit(), { x: 1, y: 0, z: 2 });
});

test('a wall hit is ignored', async () => {
  const harness = createHarness();
  await harness.controller.start();
  harness.world.orientation = WALL_ORIENTATION;
  harness.tick();
  assert.equal(harness.controller.currentHit(), null);
  assert.equal(harness.controller.tracking(), 'searching');
});

test('losing the pose clears the hit and the reticle', async () => {
  const harness = createHarness();
  await harness.controller.start();
  harness.tick();
  harness.world.pose = false;
  assert.deepEqual(harness.tick(), ['render']);
  assert.equal(harness.controller.currentHit(), null);
  assert.equal(harness.reticle.visible, false);
  assert.equal(harness.controller.tracking(), 'lost');
});

test('only the check variant requires a finite camera matrix', async () => {
  for (const [variant, expected] of [['project', 'surface'], ['check', 'lost']] as const) {
    const harness = createHarness({ variant });
    await harness.controller.start();
    harness.world.cameraFinite = false;
    harness.tick();
    assert.equal(harness.controller.tracking(), expected);
  }
});

test('hiding the session clears the hit; only check keeps rendering', async () => {
  for (const [variant, frameCalls] of [['project', []], ['check', ['render']]] as const) {
    const harness = createHarness({ variant });
    await harness.controller.start();
    harness.tick();
    harness.setVisibility('hidden');
    assert.equal(harness.controller.currentHit(), null);
    assert.equal(harness.controller.isVisible(), false);
    assert.equal(harness.controller.tracking(), 'hidden');
    assert.deepEqual(harness.tick(), frameCalls);
    harness.setVisibility('visible');
    assert.equal(harness.controller.tracking(), 'searching');
  }
});

test('repeated frames report a tracking change only once', async () => {
  const harness = createHarness();
  await harness.controller.start();
  harness.tick(); harness.tick(); harness.tick();
  assert.deepEqual(harness.tracking, ['searching', 'surface']);
});

test('frames report the hit to onFrame', async () => {
  const seen: unknown[] = [];
  const harness = createHarness({ onFrame: (hit) => seen.push(hit) });
  await harness.controller.start();
  harness.tick();
  harness.world.pose = false;
  harness.tick();
  assert.deepEqual(seen, [{ x: 1, y: 0, z: 2 }, null]);
});

test('capability comes only from the secure context and isSessionSupported', async () => {
  const xr = (result: boolean | Error) => ({
    isSessionSupported: async () => { if (result instanceof Error) throw result; return result; },
  });
  assert.deepEqual(await detectArCapability({ isSecureContext: false, xr: xr(true) }), { status: 'insecure' });
  assert.deepEqual(await detectArCapability({ isSecureContext: true }), { status: 'no-webxr' });
  assert.deepEqual(await detectArCapability({ isSecureContext: true, xr: xr(false) }), { status: 'unsupported' });
  assert.deepEqual(await detectArCapability({ isSecureContext: true, xr: xr(true) }), { status: 'supported' });
  assert.deepEqual(await detectArCapability({ isSecureContext: true, xr: xr(new Error('falhou')) }), { status: 'error', reason: 'falhou' });
});

test('with a stabilizer, marking waits until the floor is learned and the aim holds still', async () => {
  const locked: boolean[] = [];
  const harness = createHarness({ stabilizer: createHitStabilizer(), onFloorLockedChange: (next) => locked.push(next) });
  await harness.controller.start();
  harness.tick(0);
  assert.equal(harness.reticle.visible, true);
  assert.equal(harness.controller.tracking(), 'searching');
  assert.equal(harness.controller.currentHit(), null);
  // Holding still never teaches the floor.
  const t = harness.hold(FRAME_MS);
  assert.equal(harness.controller.tracking(), 'searching');
  assert.deepEqual(locked, []);
  harness.hold(harness.sweepFloor(t + 3000));
  assert.deepEqual(locked, [true]);
  assert.equal(harness.controller.tracking(), 'surface');
  const hit = harness.controller.currentHit();
  assert.ok(hit && Math.abs(hit.x - 1) < 1e-9 && hit.y === 0 && Math.abs(hit.z - 2) < 1e-9);
  assert.equal(harness.world.floorY, 0);
});

test('with a stabilizer, a wall in front blocks the aim even with floor behind it', async () => {
  const hints: string[] = [];
  const harness = createHarness({ stabilizer: createHitStabilizer(), onFloorHintChange: (hint) => hints.push(hint) });
  await harness.controller.start();
  const t = harness.hold(harness.sweepFloor());
  assert.equal(harness.controller.tracking(), 'surface');
  (harness.frame as unknown as Record<string, unknown>).getHitTestResults = () => [
    { getPose: () => ({ transform: { position: { x: 1, y: 1, z: 1 }, orientation: WALL_ORIENTATION } }) },
    { getPose: () => ({ transform: { position: { x: 1, y: 0, z: 2 }, orientation: FLOOR_ORIENTATION } }) },
  ];
  harness.hold(t);
  assert.equal(harness.controller.currentHit(), null);
  assert.equal(harness.reticle.visible, false);
  assert.equal(harness.controller.tracking(), 'searching');
  assert.equal(hints.at(-1), 'blocked');
});

test('learning the floor again forgets the height, keeps the session, and reports the new one', async () => {
  const locked: boolean[] = [];
  const harness = createHarness({ stabilizer: createHitStabilizer(), onFloorLockedChange: (next) => locked.push(next) });
  await harness.controller.start();
  let t = harness.hold(harness.sweepFloor());
  assert.equal(harness.world.floorY, 0);
  harness.calls.length = 0;
  harness.controller.relearnFloor();
  assert.deepEqual(harness.calls, [], 'no session call: nothing is restarted');
  assert.equal(harness.controller.currentHit(), null);
  assert.deepEqual(locked, [true, false]);
  // The real floor turns out 20 cm lower; what is drawn follows the height only.
  for (let i = 0; i < 90; i += 1) { harness.world.at = { x: i / 90, y: -0.2, z: 2 }; harness.tick(t + i * FRAME_MS); }
  t += 90 * FRAME_MS;
  assert.deepEqual(locked, [true, false, true]);
  assert.equal(harness.world.floorY, -0.2);
  harness.hold(t);
  const hit = harness.controller.currentHit();
  assert.ok(hit && Math.abs(hit.y + 0.2) < 1e-9);
  await harness.controller.finish(true);
  assert.equal(harness.world.floorY, null);
  assert.deepEqual(locked, [true, false, true, false]);
});

test('entity types are requested for the hit-test source, with the default source as fallback', async () => {
  const seen: (XRHitTestOptionsInit | undefined)[] = [];
  const accepting = createHarness({ hitEntityTypes: ['plane', 'point'] });
  const original = accepting.session.requestHitTestSource;
  accepting.session.requestHitTestSource = async (options) => { seen.push(options); return original(options); };
  await accepting.controller.start();
  assert.deepEqual(seen.map((options) => options?.entityTypes), [['plane', 'point']]);
  assert.deepEqual(accepting.calls, START_ORDER);

  const refused: (XRHitTestOptionsInit | undefined)[] = [];
  const refusing = createHarness({ hitEntityTypes: ['plane', 'point'] });
  const fallback = refusing.session.requestHitTestSource;
  refusing.session.requestHitTestSource = async (options) => {
    refused.push(options);
    if (options?.entityTypes) throw new TypeError('entityTypes');
    return fallback(options);
  };
  await refusing.controller.start();
  assert.deepEqual(refused.map((options) => options?.entityTypes), [['plane', 'point'], undefined]);
  assert.deepEqual(refusing.calls, START_ORDER);
});

test('debug info reports the floor, the point source and the anchors', async () => {
  const seen: { floorY: number | null; source: string; anchors: number; entityTypes: boolean }[] = [];
  const harness = createHarness({ stabilizer: createHitStabilizer(), onDebug: (info) => seen.push(info) });
  await harness.controller.start();
  harness.hold(harness.sweepFloor());
  assert.ok(seen.length > 5);
  assert.equal(seen[0].floorY, null);
  const last = seen.at(-1)!;
  assert.equal(last.floorY, 0);
  assert.equal(last.source, 'hit');
  assert.equal(last.anchors, 0);
  assert.equal(last.entityTypes, false);
});

test('anchors and plane detection are requested as optional features only when asked', async () => {
  let init: XRSessionInit | undefined;
  const harness = createHarness({
    anchors: true,
    planes: true,
    getXr: () => ({ requestSession: (async (_mode: string, options: XRSessionInit) => { init = options; return harness.session; }) as unknown as XRSystem['requestSession'] }),
  });
  await harness.controller.start();
  assert.deepEqual(init?.requiredFeatures, ['hit-test', 'local-floor']);
  assert.deepEqual(init?.optionalFeatures, ['dom-overlay', 'anchors', 'plane-detection']);
});

test('with an anchor, a map correction moves the world root and keeps hits in the stable frame', async () => {
  const harness = createHarness({ anchors: true });
  const anchor = { anchorSpace: { anchor: true }, delete() { harness.calls.push('anchor-delete'); } };
  const anchorAt = { x: 1, y: 0, z: 2 };
  let created = 0;
  const frame = harness.frame as unknown as Record<string, unknown>;
  frame.getHitTestResults = () => [{
    getPose: () => ({ transform: { position: { x: 1, y: 0, z: 2 }, orientation: FLOOR_ORIENTATION } }),
    createAnchor: async () => { created += 1; return anchor; },
  }];
  frame.getPose = (space: unknown) => (space === anchor.anchorSpace ? { transform: { position: anchorAt } } : undefined);

  await harness.controller.start();
  harness.tick();
  await Promise.resolve();
  harness.tick();
  assert.equal(created, 1);
  assert.deepEqual(harness.controller.currentHit(), { x: 1, y: 0, z: 2 });
  assert.deepEqual(harness.world.root, { x: 0, y: 0, z: 0, rotationY: -0 });

  // The device shifts its map 20 cm: the anchor and the same physical floor point move together.
  anchorAt.x = 1.2;
  frame.getHitTestResults = () => [{ getPose: () => ({ transform: { position: { x: 1.2, y: 0, z: 2 }, orientation: FLOOR_ORIENTATION } }) }];
  harness.tick();
  // The correction is eased in, not applied in one frame.
  assert.ok(harness.world.root.x > 0 && harness.world.root.x < 0.05, String(harness.world.root.x));
  for (let i = 0; i < 60; i += 1) harness.tick();
  const hit = harness.controller.currentHit();
  assert.ok(hit && Math.abs(hit.x - 1) <= 0.02 && Math.abs(hit.z - 2) < 1e-9, JSON.stringify(hit));
  assert.ok(Math.abs(harness.world.root.x - 0.2) <= 0.02, String(harness.world.root.x));
  assert.equal(created, 1);

  await harness.controller.finish(true);
  assert.ok(harness.calls.includes('anchor-delete'));
  assert.equal(harness.world.root.x, 0);
});

test('a device that refuses anchors keeps working without them', async () => {
  const harness = createHarness({ anchors: true });
  let attempts = 0;
  const frame = harness.frame as unknown as Record<string, unknown>;
  frame.getHitTestResults = () => [{
    getPose: () => ({ transform: { position: { x: 1, y: 0, z: 2 }, orientation: FLOOR_ORIENTATION } }),
    createAnchor: async () => { attempts += 1; throw new Error('not supported'); },
  }];
  await harness.controller.start();
  harness.tick();
  await Promise.resolve(); await Promise.resolve();
  harness.tick(); harness.tick();
  assert.equal(attempts, 1);
  assert.deepEqual(harness.controller.currentHit(), { x: 1, y: 0, z: 2 });
});

test('floor hints follow the stabilizer and clear when tracking is lost', async () => {
  const hints: string[] = [];
  const harness = createHarness({ stabilizer: createHitStabilizer(), onFloorHintChange: (hint) => hints.push(hint) });
  await harness.controller.start();
  harness.tick(0);
  assert.deepEqual(hints, ['scan']);
  let t = harness.sweepFloor(FRAME_MS);
  assert.deepEqual(hints, ['scan', 'none']);
  harness.world.hit = false;
  for (let i = 0; i < 140; i += 1) harness.tick(t + i * FRAME_MS);
  t += 140 * FRAME_MS;
  assert.deepEqual(hints, ['scan', 'none', 'aim-floor']);
  harness.world.pose = false;
  harness.tick(t);
  assert.deepEqual(hints, ['scan', 'none', 'aim-floor', 'none']);
});
