import type * as THREE from 'three';
import { horizontalHitPoint, type XrPoint } from '../xr-check/xr-check-logic.ts';
import { fitDrift, NO_DRIFT, toRaw, toStable, type AnchorPair, type Drift } from './anchor-drift.ts';
import { createFloorGuidance, type XrFloorHint } from './floor-guidance.ts';
import type { HitStabilizer, XrRay } from './hit-stabilizer.ts';

export type XrTracking = 'inactive' | 'searching' | 'surface' | 'lost' | 'hidden';

export type XrSessionRuntime = Readonly<{
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
  reticle: THREE.Object3D;
  /**
   * Parent of everything placed on the floor. With `anchors`, the controller moves
   * it to follow the device's map corrections; the reticle stays outside it.
   */
  worldRoot?: THREE.Object3D;
  /** Feedback on the reticle: 0..1 while the aim settles, `stable` once it can be marked. */
  setAim?: (progress: number, stable: boolean) => void;
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
  /** Runs per frame with the point under the reticle: mutate objects or refs here, never React state. */
  onFrame?: (hit: XrPoint | null) => void;
  /**
   * Optional filter for the raw hit-test. With it, the reticle follows the smoothed
   * point and tracking reaches `surface` (and `currentHit` returns a point) only once
   * the point holds still on the locked floor.
   */
  stabilizer?: HitStabilizer;
  /**
   * Asks for the optional `anchors` feature. Where the device grants it, anchors
   * are dropped on stable floor points and the points reported by `currentHit`
   * and `onFrame` are expressed in a frame that follows the device's map
   * corrections, so marked work stays on the same physical spot. `worldRoot`
   * is kept in step. Without the feature nothing changes.
   */
  anchors?: boolean;
  /**
   * Asks for the optional `plane-detection` feature and feeds the stabilizer the
   * height of the lowest large horizontal plane, so a table is not taken for floor.
   */
  planes?: boolean;
  /** Needs `stabilizer`. Reports what to tell the user about finding the floor. */
  onFloorHintChange?: (hint: XrFloorHint) => void;
  /** Reports whether a `placeWhenStable` request is waiting for the aim to settle. */
  onPendingPlaceChange?: (pending: boolean) => void;
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
  /**
   * Places now when the aim is stable; otherwise waits up to `timeoutMs` for it to
   * settle and places then. The point is the same stable one either way, so the
   * user can tap early without losing precision. A new request replaces the old one.
   */
  placeWhenStable: (place: (hit: XrPoint) => void, timeoutMs?: number) => void;
}>;

const PENDING_PLACE_TIMEOUT_MS = 2500;

export class DomOverlayUnavailableError extends Error {
  constructor() {
    super('A sessão não negociou dom-overlay.');
    this.name = 'DomOverlayUnavailableError';
  }
}

const RETICLE_LIFT_METERS = 0.008;
const MAX_ANCHORS = 6;
const ANCHOR_SPACING_METERS = 2;
const FLOOR_PLANE_MIN_AREA_M2 = 1.5;
const PLANE_SCAN_EVERY_FRAMES = 15;

type TrackedAnchor = { anchor: XRAnchor; base: XrPoint | null };

function polygonArea(polygon: readonly DOMPointReadOnly[]): number {
  let twice = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    twice += a.x * b.z - b.x * a.z;
  }
  return Math.abs(twice) / 2;
}

/** Height of the lowest horizontal plane large enough to be a floor, or null. */
function lowestFloorPlaneY(frame: XRFrame, space: XRReferenceSpace): number | null {
  const planes = frame.detectedPlanes;
  if (!planes) return null;
  let lowest: number | null = null;
  for (const plane of planes) {
    if (plane.orientation !== 'horizontal' || polygonArea(plane.polygon) < FLOOR_PLANE_MIN_AREA_M2) continue;
    let y: number | undefined;
    try { y = frame.getPose(plane.planeSpace, space)?.transform.position.y; } catch { continue; }
    if (y === undefined || !Number.isFinite(y)) continue;
    if (lowest === null || y < lowest) lowest = y;
  }
  return lowest;
}

/** Keeps taps on overlay controls from also firing the session `select`. */
export function preventXrSelectOn(element: Element): () => void {
  const prevent = (event: Event) => event.preventDefault();
  element.addEventListener('beforexrselect', prevent);
  return () => element.removeEventListener('beforexrselect', prevent);
}

/** Camera forward ray (-Z of the viewer pose) in the floor space. */
function viewerRay(pose: XRViewerPose): XrRay | null {
  const transform = pose.transform;
  if (!transform) return null;
  const { position: p, orientation: q } = transform;
  // Rotate (0, 0, -1) by the quaternion.
  const direction = {
    x: -2 * (q.x * q.z + q.w * q.y),
    y: -2 * (q.y * q.z - q.w * q.x),
    z: -(1 - 2 * (q.x * q.x + q.y * q.y)),
  };
  return { origin: { x: p.x, y: p.y, z: p.z }, direction };
}

export function createXrSessionController(options: XrSessionOptions): XrSessionController {
  const variant = options.variant ?? 'project';
  let activeSession: XRSession | null = null;
  let hitTestSource: XRHitTestSource | null = null;
  let floorSpace: XRReferenceSpace | null = null;
  let latestHit: XrPoint | null = null;
  let tracking: XrTracking = 'inactive';
  let removeListeners: (() => void) | null = null;
  const guidance = options.stabilizer && options.onFloorHintChange ? createFloorGuidance() : null;
  let floorHint: XrFloorHint = 'none';
  let anchors: TrackedAnchor[] = [];
  let anchorPending = false;
  let anchorsUnavailable = false;
  let drift: Drift = NO_DRIFT;
  let planeY: number | null = null;
  let frameCount = 0;
  let pendingPlace: { place: (hit: XrPoint) => void; until: number } | null = null;

  const setPendingPlace = (next: typeof pendingPlace) => {
    const changed = Boolean(pendingPlace) !== Boolean(next);
    pendingPlace = next;
    if (changed) options.onPendingPlaceChange?.(Boolean(next));
  };

  const setFloorHint = (next: XrFloorHint) => {
    if (floorHint === next) return;
    floorHint = next;
    options.onFloorHintChange?.(next);
  };

  const applyDrift = (next: Drift) => {
    drift = next;
    const root = options.getRuntime()?.worldRoot;
    if (!root) return;
    root.position.set(next.dx, next.dy, next.dz);
    // Three turns +X toward −Z for a positive rotation.y; the drift turns it toward +Z.
    root.rotation.set(0, -next.rotationRadians, 0);
  };

  const dropAnchors = () => {
    for (const { anchor } of anchors) { try { anchor.delete(); } catch { /* already gone with the session */ } }
    anchors = [];
    anchorPending = false;
    anchorsUnavailable = false;
    planeY = null;
    frameCount = 0;
    applyDrift(NO_DRIFT);
  };

  /** Refits the drift from the anchors the device still tracks; keeps the last fit otherwise. */
  const updateDrift = (frame: XRFrame, space: XRReferenceSpace) => {
    if (!anchors.length) return;
    const pairs: AnchorPair[] = [];
    for (const entry of anchors) {
      if (frame.trackedAnchors && !frame.trackedAnchors.has(entry.anchor)) continue;
      let pose: XRPose | undefined;
      try { pose = frame.getPose(entry.anchor.anchorSpace, space); } catch { continue; }
      if (!pose) continue;
      const { x, y, z } = pose.transform.position;
      if (![x, y, z].every(Number.isFinite)) continue;
      const current = { x, y, z };
      // A later anchor joins in the frame the earlier ones define.
      entry.base ??= toStable(drift, current);
      pairs.push({ base: entry.base, current });
    }
    if (pairs.length) applyDrift(fitDrift(pairs));
  };

  /** Anchors spread over the floor: each new one at least ANCHOR_SPACING_METERS from the rest. */
  const maybeAnchor = (session: XRSession, result: XRHitTestResult | null, point: XrPoint) => {
    if (!options.anchors || anchorsUnavailable || anchorPending || !result?.createAnchor || anchors.length >= MAX_ANCHORS) return;
    for (const { base } of anchors) {
      if (!base) return;
      const at = toRaw(drift, base);
      if (Math.hypot(at.x - point.x, at.z - point.z) < ANCHOR_SPACING_METERS) return;
    }
    anchorPending = true;
    let created: Promise<XRAnchor> | undefined;
    try { created = result.createAnchor(); } catch { created = undefined; }
    if (!created) { anchorPending = false; anchorsUnavailable = true; return; }
    created.then((anchor) => {
      anchorPending = false;
      if (activeSession !== session) { try { anchor.delete(); } catch { /* session gone */ } return; }
      anchors.push({ anchor, base: null });
    }, () => {
      // Feature not granted or not supported: stop asking for this session.
      anchorPending = false;
      anchorsUnavailable = true;
    });
  };

  const setTracking = (next: XrTracking) => {
    if (tracking === next) return;
    tracking = next;
    options.onTrackingChange(next);
  };

  const hideReticle = () => {
    latestHit = null;
    setPendingPlace(null);
    options.stabilizer?.interrupt();
    guidance?.reset();
    setFloorHint('none');
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
    options.stabilizer?.reset();
    guidance?.reset();
    setFloorHint('none');
    dropAnchors();
    setPendingPlace(null);
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

  const renderFrame = (session: XRSession, frame: XRFrame, timeMs: number) => {
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

    if (options.anchors) updateDrift(frame, space);
    if (options.planes && frameCount % PLANE_SCAN_EVERY_FRAMES === 0) planeY = lowestFloorPlaneY(frame, space);
    frameCount += 1;

    let hit: XrPoint | null = null;
    let hitResult: XRHitTestResult | null = null;
    for (const result of frame.getHitTestResults(source)) {
      hit = horizontalHitPoint(result.getPose(space));
      if (hit) { hitResult = result; break; }
    }
    let ready = Boolean(hit);
    let shown = hit;
    if (options.stabilizer) {
      const result = options.stabilizer.update(hit, viewerRay(viewerPose), timeMs, planeY);
      runtime.reticle.visible = Boolean(result.point);
      if (result.point) runtime.reticle.position.set(result.point.x, result.point.y + RETICLE_LIFT_METERS, result.point.z);
      runtime.setAim?.(result.progress, result.stable);
      if (guidance) setFloorHint(guidance.update({ floorLocked: result.floorY !== null, hasPoint: Boolean(result.point), timeMs }));
      // The preview follows the smoothed point; marking waits for a stable one.
      shown = result.point;
      hit = result.stable ? result.point : null;
      ready = result.stable;
    } else {
      runtime.reticle.visible = Boolean(hit);
      if (hit) runtime.reticle.position.set(hit.x, hit.y + RETICLE_LIFT_METERS, hit.z);
    }
    if (hit) maybeAnchor(session, hitResult, hit);
    if (options.anchors) {
      // The reticle is drawn where the device sees it; the work is stored in the stable frame.
      if (hit) hit = toStable(drift, hit);
      if (shown) shown = toStable(drift, shown);
    }
    latestHit = hit;
    if (ready) {
      setTracking('surface');
    } else {
      setTracking('searching');
    }
    // After the tracking update, so the placement sees the same state as a tap would.
    if (pendingPlace) {
      const request = pendingPlace;
      if (hit) { setPendingPlace(null); request.place(hit); }
      else if (performance.now() > request.until) setPendingPlace(null);
    }
    options.onFrame?.(shown);
    draw();
  };

  const start = async () => {
    const xr = options.getXr();
    if (!xr) throw new Error('O navegador não expõe WebXR.');

    // Keep this before any await: it is the call that consumes the user activation.
    const init: XRSessionInit = { requiredFeatures: ['hit-test', 'local-floor'] };
    const overlayRoot = options.getOverlayRoot();
    const optional = [
      ...(overlayRoot ? ['dom-overlay'] : []),
      ...(options.anchors ? ['anchors'] : []),
      ...(options.planes ? ['plane-detection'] : []),
    ];
    if (optional.length) init.optionalFeatures = optional;
    if (overlayRoot) init.domOverlay = { root: overlayRoot };
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
      options.stabilizer?.reset();
      dropAnchors();
      runtime.renderer.setAnimationLoop((time, frame) => {
        if (!frame) return;
        renderFrame(session, frame, time);
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
    placeWhenStable: (place, timeoutMs = PENDING_PLACE_TIMEOUT_MS) => {
      if (!activeSession) return;
      if (latestHit && tracking === 'surface') { setPendingPlace(null); place(latestHit); return; }
      setPendingPlace({ place, until: performance.now() + timeoutMs });
    },
  };
}
