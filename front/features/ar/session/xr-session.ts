import type * as THREE from 'three';
import { horizontalHitPoint, type XrPoint } from '../xr-check/xr-check-logic.ts';

export type XrTracking = 'inactive' | 'searching' | 'surface' | 'lost' | 'hidden';

export type XrSessionRuntime = Readonly<{
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
  reticle: THREE.Object3D;
}>;

/**
 * The start sequence is the same for every variant. They differ only where the
 * two original routes differed, and each route keeps its own behavior:
 *
 * - `project` (/projects/:id/ar): hidden frames skip rendering, session
 *   listeners stay attached, and a missing viewer pose is the only lost state.
 * - `check` (/xr-check): hidden frames still render, listeners are removed on
 *   finish, and the XR camera matrix must also be finite to count as tracked.
 */
export type XrSessionVariant = 'project' | 'check';

export type XrSessionOptions = Readonly<{
  getXr: () => Pick<XRSystem, 'requestSession'> | undefined;
  getRuntime: () => XrSessionRuntime | null;
  getOverlayRoot: () => Element | null;
  variant?: XrSessionVariant;
  /** Ends the session and rejects with DomOverlayUnavailableError when not negotiated. */
  requireDomOverlay?: boolean;
  onTrackingChange: (tracking: XrTracking) => void;
  /** Runs once the session is live, right before the render loop starts. */
  onActive?: () => void;
  /** Runs on every session finish, before `session.end()` when one is requested. */
  onFinished?: () => void;
  onSelect: () => void;
  /** Runs per frame: mutate objects or refs here, never React state. */
  onFrame?: (hit: XrPoint | null) => void;
}>;

export type XrSessionController = Readonly<{
  /**
   * Must be called synchronously from the click handler: `requestSession` is
   * the first browser call and needs the user activation. Rejects when the
   * session cannot start, after cleaning up.
   */
  start: () => Promise<void>;
  /** Cleans up first, then asks the browser to end the session when `requestEnd`. */
  finish: (requestEnd: boolean) => Promise<void> | undefined;
  /** Asks the browser to end the session; cleanup follows from the `end` event. */
  stop: () => Promise<void> | undefined;
  isVisible: () => boolean;
  tracking: () => XrTracking;
  /** Latest floor hit, or null while tracking is lost or the session is hidden. */
  currentHit: () => XrPoint | null;
}>;

export class DomOverlayUnavailableError extends Error {
  constructor() {
    super('A sessão não negociou dom-overlay.');
    this.name = 'DomOverlayUnavailableError';
  }
}

const RETICLE_LIFT_METERS = 0.008;

/** Keeps taps on overlay controls from also firing the session `select`. */
export function preventXrSelectOn(element: Element): () => void {
  const prevent = (event: Event) => event.preventDefault();
  element.addEventListener('beforexrselect', prevent);
  return () => element.removeEventListener('beforexrselect', prevent);
}

export function createXrSessionController(options: XrSessionOptions): XrSessionController {
  const variant = options.variant ?? 'project';
  let activeSession: XRSession | null = null;
  let hitTestSource: XRHitTestSource | null = null;
  let floorSpace: XRReferenceSpace | null = null;
  let latestHit: XrPoint | null = null;
  let tracking: XrTracking = 'inactive';
  let removeListeners: (() => void) | null = null;

  const setTracking = (next: XrTracking) => {
    if (tracking === next) return;
    tracking = next;
    options.onTrackingChange(next);
  };

  const hideReticle = () => {
    latestHit = null;
    const runtime = options.getRuntime();
    if (runtime) runtime.reticle.visible = false;
  };

  const finishSession = (session: XRSession, requestEnd: boolean): Promise<void> | undefined => {
    if (activeSession !== session) return undefined;
    removeListeners?.();
    removeListeners = null;
    // The browser may already have canceled the source while tearing the session down.
    try { hitTestSource?.cancel(); } catch { /* already canceled */ }
    hitTestSource = null;
    floorSpace = null;
    latestHit = null;
    activeSession = null;
    const runtime = options.getRuntime();
    if (runtime) {
      runtime.renderer.setAnimationLoop(null);
      runtime.reticle.visible = false;
    }
    options.onFinished?.();
    setTracking('inactive');
    if (!requestEnd) return undefined;
    try { return session.end().catch(() => undefined); } catch { return Promise.resolve(); }
  };

  const isCameraTracked = (runtime: XrSessionRuntime) => {
    if (variant !== 'check') return true;
    return runtime.renderer.xr.isPresenting && runtime.renderer.xr.getCamera().matrixWorld.elements.every(Number.isFinite);
  };

  const renderFrame = (session: XRSession, frame: XRFrame) => {
    const runtime = options.getRuntime();
    const space = floorSpace;
    const source = hitTestSource;
    if (!runtime || !space || !source || activeSession !== session) return;
    const draw = () => runtime.renderer.render(runtime.scene, runtime.camera);

    if (session.visibilityState !== 'visible') {
      if (variant !== 'check') return;
      hideReticle();
      setTracking('hidden');
      options.onFrame?.(null);
      draw();
      return;
    }

    const viewerPose = frame.getViewerPose(space);
    if (!viewerPose || !isCameraTracked(runtime)) {
      hideReticle();
      setTracking('lost');
      options.onFrame?.(null);
      draw();
      return;
    }

    let hit: XrPoint | null = null;
    for (const result of frame.getHitTestResults(source)) {
      hit = horizontalHitPoint(result.getPose(space));
      if (hit) break;
    }
    latestHit = hit;
    runtime.reticle.visible = Boolean(hit);
    if (hit) {
      runtime.reticle.position.set(hit.x, hit.y + RETICLE_LIFT_METERS, hit.z);
      setTracking('surface');
    } else {
      setTracking('searching');
    }
    options.onFrame?.(hit);
    draw();
  };

  const start = async () => {
    const xr = options.getXr();
    if (!xr) throw new Error('O navegador não expõe WebXR.');

    // Keep this before any await: it is the call that consumes the user activation.
    const init: XRSessionInit = { requiredFeatures: ['hit-test', 'local-floor'] };
    const overlayRoot = options.getOverlayRoot();
    if (overlayRoot) {
      init.optionalFeatures = ['dom-overlay'];
      init.domOverlay = { root: overlayRoot };
    }
    const request = xr.requestSession('immersive-ar', init);

    try {
      const session = await request;
      if (!options.getRuntime()) {
        await session.end().catch(() => undefined);
        return;
      }
      activeSession = session;

      // dom-overlay stays optional in the request so negotiation matches the routes;
      // a required feature would fail with the same error as hit-test and local-floor.
      if (options.requireDomOverlay && !session.domOverlayState) {
        await finishSession(session, true);
        throw new DomOverlayUnavailableError();
      }

      const onEnd = () => { finishSession(session, false); };
      const onVisibilityChange = () => {
        if (session.visibilityState !== 'visible') {
          hideReticle();
          setTracking('hidden');
        } else {
          setTracking('searching');
        }
      };
      const onSelect = () => options.onSelect();
      session.addEventListener('end', onEnd);
      session.addEventListener('visibilitychange', onVisibilityChange);
      session.addEventListener('select', onSelect);
      if (variant === 'check') {
        removeListeners = () => {
          session.removeEventListener('end', onEnd);
          session.removeEventListener('visibilitychange', onVisibilityChange);
          session.removeEventListener('select', onSelect);
        };
      }

      const viewerSpace = await session.requestReferenceSpace('viewer');
      if (activeSession !== session) return;
      const hitTestRequest = session.requestHitTestSource?.({ space: viewerSpace });
      if (!hitTestRequest) throw new Error('O navegador não implementa requestHitTestSource.');
      const source = await hitTestRequest;
      if (!source) throw new Error('O navegador não retornou uma fonte de hit-test.');
      if (activeSession !== session) {
        source.cancel();
        return;
      }
      hitTestSource = source;

      const runtime = options.getRuntime();
      if (!runtime) throw new Error('Renderizador não está disponível.');
      await runtime.renderer.xr.setSession(session);
      if (activeSession !== session) return;
      const space = runtime.renderer.xr.getReferenceSpace();
      if (!space) throw new Error('O navegador não forneceu o espaço local do piso.');
      floorSpace = space;

      setTracking('searching');
      options.onActive?.();
      runtime.renderer.setAnimationLoop((_time, frame) => {
        if (!frame) return;
        renderFrame(session, frame);
      });
    } catch (cause) {
      if (activeSession) finishSession(activeSession, true);
      throw cause;
    }
  };

  return {
    start,
    finish: (requestEnd) => (activeSession ? finishSession(activeSession, requestEnd) : undefined),
    stop: () => activeSession?.end(),
    isVisible: () => activeSession?.visibilityState === 'visible',
    tracking: () => tracking,
    currentHit: () => latestHit,
  };
}
