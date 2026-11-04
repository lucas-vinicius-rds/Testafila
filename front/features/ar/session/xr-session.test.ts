import assert from 'node:assert/strict';
import test from 'node:test';
import { detectArCapability } from './ar-capability.ts';
import { createXrSessionController, DomOverlayUnavailableError, type XrSessionOptions, type XrSessionRuntime, type XrTracking } from './xr-session.ts';

const FLOOR_ORIENTATION = { x: 0, y: 0, z: 0, w: 1 };
const WALL_ORIENTATION = { x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 };

function createHarness(overrides: Partial<XrSessionOptions> & { overlayNegotiated?: boolean } = {}) {
  const calls: string[] = [];
  const listeners = new Map<string, () => void>();
  const world = { pose: true, orientation: FLOOR_ORIENTATION, hit: true as boolean, cameraFinite: true };
  let loop: ((time: number, frame: XRFrame) => void) | null = null;

  const session = {
    visibilityState: 'visible' as XRVisibilityState,
    domOverlayState: overrides.overlayNegotiated === false ? undefined : { type: 'screen' },
    addEventListener(type: string, listener: () => void) { calls.push(`add:${type}`); listeners.set(type, listener); },
    removeEventListener(type: string) { calls.push(`remove:${type}`); listeners.delete(type); },
    async requestReferenceSpace(type: string) { calls.push(`space:${type}`); return { type }; },
    async requestHitTestSource() { calls.push('hit-source'); return { cancel() { calls.push('hit-cancel'); } }; },
    async end() { calls.push('end'); listeners.get('end')?.(); },
  };
  const frame = {
    getViewerPose() { return world.pose ? {} : null; },
    getHitTestResults() {
      return world.hit
        ? [{ getPose: () => ({ transform: { position: { x: 1, y: 0, z: 2 }, orientation: world.orientation } }) }]
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
    tick() { calls.length = 0; loop?.(0, frame); return [...calls]; },
    setVisibility(state: XRVisibilityState) { session.visibilityState = state; listeners.get('visibilitychange')?.(); },
  };
}

const START_ORDER = ['request', 'add:end', 'add:visibilitychange', 'add:select', 'space:viewer', 'hit-source', 'set-session', 'floor-space', 'active', 'loop:on'];

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
