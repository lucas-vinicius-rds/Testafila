'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import styles from './xr-check.module.css';
import { distanceMeters, horizontalHitPoint, type XrPoint } from './xr-check-logic.ts';

type Capability = 'checking' | 'supported' | 'unsupported' | 'insecure' | 'error';
type TrackingState = 'inactive' | 'searching' | 'surface' | 'lost' | 'hidden';

type XrRuntime = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  reticle: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  markerGeometry: THREE.SphereGeometry;
  markerMaterial: THREE.MeshBasicMaterial;
  markers: THREE.Mesh[];
  line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial> | null;
};

const trackingCopy: Record<TrackingState, string> = {
  inactive: 'Sessão XR não iniciada.',
  searching: 'Tracking ativo; procure uma superfície horizontal.',
  surface: 'Superfície horizontal detectada. Você pode marcar um ponto.',
  lost: 'Pose de tracking indisponível. Retículo oculto e marcação suspensa.',
  hidden: 'Sessão XR fora de primeiro plano. Retículo oculto e marcação suspensa.',
};

function messageFromError(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === 'NotSupportedError') return 'O aparelho ou navegador não aceitou o hit-test obrigatório ou o espaço local do piso.';
    if (error.name === 'SecurityError') return 'WebXR exige contexto seguro HTTPS (ou localhost) e permissões do navegador.';
    if (error.name === 'NotAllowedError') return 'O acesso à sessão XR foi recusado. Verifique a permissão e tente novamente por este botão.';
  }
  if (error instanceof Error) return `Não foi possível iniciar a sessão WebXR (${error.name}: ${error.message}).`;
  return 'Não foi possível iniciar a sessão WebXR por um erro não identificado.';
}

function clearMeasurementMeshes(runtime: XrRuntime | null) {
  if (!runtime) return;
  for (const marker of runtime.markers) runtime.scene.remove(marker);
  runtime.markers.length = 0;
  if (runtime.line) {
    runtime.scene.remove(runtime.line);
    runtime.line.geometry.dispose();
    runtime.line.material.dispose();
    runtime.line = null;
  }
}

function disposeRuntime(runtime: XrRuntime) {
  clearMeasurementMeshes(runtime);
  runtime.reticle.geometry.dispose();
  runtime.reticle.material.dispose();
  runtime.markerGeometry.dispose();
  runtime.markerMaterial.dispose();
  runtime.renderer.setAnimationLoop(null);
  runtime.renderer.dispose();
}

export function XrCheckClient() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<XrRuntime | null>(null);
  const activeSessionRef = useRef<XRSession | null>(null);
  const hitTestSourceRef = useRef<XRHitTestSource | null>(null);
  const viewerSpaceRef = useRef<XRReferenceSpace | null>(null);
  const floorSpaceRef = useRef<XRReferenceSpace | null>(null);
  const latestHitRef = useRef<XrPoint | null>(null);
  const marksRef = useRef<XrPoint[]>([]);
  const sessionListenersCleanupRef = useRef<(() => void) | null>(null);
  const aliveRef = useRef(true);
  const trackingStateRef = useRef<TrackingState>('inactive');

  const [capability, setCapability] = useState<Capability>('checking');
  const [capabilityMessage, setCapabilityMessage] = useState('Verificando contexto seguro e disponibilidade de immersive-ar…');
  const [rendererReady, setRendererReady] = useState(false);
  const [rendererError, setRendererError] = useState<string | null>(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [trackingState, setTrackingState] = useState<TrackingState>('inactive');
  const [marks, setMarks] = useState<XrPoint[]>([]);
  const [error, setError] = useState<string | null>(null);

  const setTracking = useCallback((next: TrackingState) => {
    if (trackingStateRef.current === next) return;
    trackingStateRef.current = next;
    if (aliveRef.current) setTrackingState(next);
  }, []);

  const resetMarks = useCallback(() => {
    marksRef.current = [];
    clearMeasurementMeshes(runtimeRef.current);
    if (aliveRef.current) setMarks([]);
  }, []);

  const finishSession = useCallback((session: XRSession, requestEnd: boolean): Promise<void> | undefined => {
    if (activeSessionRef.current !== session) return undefined;
    sessionListenersCleanupRef.current?.();
    sessionListenersCleanupRef.current = null;
    try { hitTestSourceRef.current?.cancel(); } catch { /* session teardown may already have canceled the source */ }
    hitTestSourceRef.current = null;
    viewerSpaceRef.current = null;
    floorSpaceRef.current = null;
    latestHitRef.current = null;
    activeSessionRef.current = null;
    const runtime = runtimeRef.current;
    if (runtime) {
      runtime.renderer.setAnimationLoop(null);
      runtime.reticle.visible = false;
    }
    resetMarks();
    setTracking('inactive');
    if (aliveRef.current) setSessionActive(false);
    if (requestEnd) {
      try { return session.end().catch(() => undefined); } catch { return Promise.resolve(); }
    }
    return undefined;
  }, [resetMarks, setTracking]);

  useEffect(() => {
    aliveRef.current = true;
    const secure = window.isSecureContext;
    if (!secure) {
      setCapability('insecure');
      setCapabilityMessage('WebXR indisponível: abra esta rota em HTTPS ou localhost, em um contexto seguro.');
      return;
    }
    const xr = navigator.xr;
    if (!xr) {
      setCapability('unsupported');
      setCapabilityMessage('Este navegador não expõe a API WebXR. Uma câmera comum não será usada como substituta.');
      return;
    }
    let cancelled = false;
    void xr.isSessionSupported('immersive-ar').then((supported) => {
      if (cancelled) return;
      setCapability(supported ? 'supported' : 'unsupported');
      setCapabilityMessage(supported
        ? 'immersive-ar anunciado como disponível. O hit-test ainda será exigido ao iniciar.'
        : 'Este aparelho/navegador não anunciou suporte a immersive-ar.');
    }).catch((reason: unknown) => {
      if (cancelled) return;
      setCapability('error');
      setCapabilityMessage(`Não foi possível consultar WebXR: ${reason instanceof Error ? reason.message : 'erro desconhecido'}.`);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const preventXrSelect = (event: Event) => event.preventDefault();
    overlay.addEventListener('beforexrselect', preventXrSelect);
    return () => overlay.removeEventListener('beforexrselect', preventXrSelect);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    aliveRef.current = true;
    let runtime: XrRuntime;
    try {
      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
      renderer.xr.enabled = true;
      renderer.xr.setReferenceSpaceType('local-floor');
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(65, 1, 0.01, 30);
      const reticle = new THREE.Mesh(
        new THREE.RingGeometry(0.075, 0.105, 32),
        new THREE.MeshBasicMaterial({ color: 0x214b40, side: THREE.DoubleSide, depthTest: false }),
      );
      reticle.rotation.x = -Math.PI / 2;
      reticle.visible = false;
      scene.add(reticle);
      runtime = {
        renderer,
        scene,
        camera,
        reticle,
        markerGeometry: new THREE.SphereGeometry(0.035, 16, 12),
        markerMaterial: new THREE.MeshBasicMaterial({ color: 0x214b40 }),
        markers: [],
        line: null,
      };
      runtimeRef.current = runtime;

      const resize = () => {
        if (renderer.xr.isPresenting) return;
        const width = Math.max(canvas.clientWidth, 1);
        const height = Math.max(canvas.clientHeight, 1);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };
      resize();
      window.addEventListener('resize', resize);
      setRendererReady(true);
      setRendererError(null);

      return () => {
        aliveRef.current = false;
        window.removeEventListener('resize', resize);
        const session = activeSessionRef.current;
        const endPromise = session ? finishSession(session, true) : undefined;
        runtimeRef.current = null;
        if (endPromise) void endPromise.finally(() => disposeRuntime(runtime));
        else disposeRuntime(runtime);
      };
    } catch (reason) {
      setRendererReady(false);
      setRendererError(`WebGL indisponível neste navegador: ${reason instanceof Error ? reason.message : 'não foi possível criar o renderer.'}`);
    }
  }, [finishSession]);

  const markCurrentHit = useCallback(() => {
    const session = activeSessionRef.current;
    const runtime = runtimeRef.current;
    const hit = latestHitRef.current;
    if (!session || session.visibilityState !== 'visible' || !runtime?.renderer.xr.isPresenting || trackingStateRef.current !== 'surface' || !hit || marksRef.current.length >= 2) return;

    const point = { x: hit.x, y: hit.y, z: hit.z };
    marksRef.current = [...marksRef.current, point];
    const marker = new THREE.Mesh(runtime.markerGeometry, runtime.markerMaterial);
    marker.position.set(point.x, point.y + 0.025, point.z);
    runtime.scene.add(marker);
    runtime.markers.push(marker);
    if (marksRef.current.length === 2) {
      const [first, second] = marksRef.current;
      const lineGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(first.x, first.y + 0.035, first.z),
        new THREE.Vector3(second.x, second.y + 0.035, second.z),
      ]);
      const line = new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({ color: 0x355b48 }));
      runtime.scene.add(line);
      runtime.line = line;
    }
    if (aliveRef.current) setMarks([...marksRef.current]);
  }, []);

  const startSession = useCallback(async () => {
    const xr = navigator.xr;
    if (!window.isSecureContext) {
      setError('WebXR exige HTTPS ou localhost.');
      return;
    }
    if (!xr || capability !== 'supported' || !runtimeRef.current || !rendererReady) {
      setError('A sessão não está pronta. Confirme suporte immersive-ar e disponibilidade de WebGL.');
      return;
    }

    // requestSession is deliberately the first asynchronous browser action in this click handler.
    let request: Promise<XRSession>;
    try {
      const options: XRSessionInit = { requiredFeatures: ['hit-test', 'local-floor'] };
      if (overlayRef.current) {
        options.optionalFeatures = ['dom-overlay'];
        options.domOverlay = { root: overlayRef.current };
      }
      request = xr.requestSession('immersive-ar', options);
    } catch (reason) {
      if (aliveRef.current) setError(messageFromError(reason));
      return;
    }

    setStarting(true);
    setError(null);
    try {
      const session = await request;
      const runtime = runtimeRef.current;
      if (!runtime) {
        await session.end().catch(() => undefined);
        return;
      }
      activeSessionRef.current = session;
      const onEnd = () => finishSession(session, false);
      const onVisibilityChange = () => {
        if (session.visibilityState !== 'visible') {
          latestHitRef.current = null;
          runtime.reticle.visible = false;
          setTracking('hidden');
        } else {
          setTracking('searching');
        }
      };
      const onSelect = () => markCurrentHit();
      session.addEventListener('end', onEnd);
      session.addEventListener('visibilitychange', onVisibilityChange);
      session.addEventListener('select', onSelect);
      sessionListenersCleanupRef.current = () => {
        session.removeEventListener('end', onEnd);
        session.removeEventListener('visibilitychange', onVisibilityChange);
        session.removeEventListener('select', onSelect);
      };

      viewerSpaceRef.current = await session.requestReferenceSpace('viewer');
      if (activeSessionRef.current !== session) return;
      const hitTestPromise = session.requestHitTestSource?.({ space: viewerSpaceRef.current });
      if (!hitTestPromise) throw new Error('O navegador não implementa requestHitTestSource.');
      const hitTestSource = await hitTestPromise;
      if (activeSessionRef.current !== session) {
        hitTestSource.cancel();
        return;
      }
      hitTestSourceRef.current = hitTestSource;

      runtime.renderer.xr.setReferenceSpaceType('local-floor');
      await runtime.renderer.xr.setSession(session);
      if (activeSessionRef.current !== session) return;
      const floorSpace = runtime.renderer.xr.getReferenceSpace();
      if (!floorSpace) throw new Error('O renderer XR não forneceu o reference space local-floor.');
      floorSpaceRef.current = floorSpace;
      const xrCamera = runtime.renderer.xr.getCamera();
      if (!xrCamera) throw new Error('A câmera real do WebXR não ficou disponível.');

      setTracking('searching');
      setSessionActive(true);
      runtime.renderer.setAnimationLoop((_time, frame) => {
        const activeRuntime = runtimeRef.current;
        const localSpace = floorSpaceRef.current;
        const source = hitTestSourceRef.current;
        if (!activeRuntime || !localSpace || !source || activeSessionRef.current !== session) return;
        if (session.visibilityState !== 'visible') {
          latestHitRef.current = null;
          activeRuntime.reticle.visible = false;
          setTracking('hidden');
          activeRuntime.renderer.render(activeRuntime.scene, activeRuntime.camera);
          return;
        }

        const viewerPose = frame.getViewerPose(localSpace);
        const camera = activeRuntime.renderer.xr.getCamera();
        const cameraTracked = activeRuntime.renderer.xr.isPresenting
          && camera.matrixWorld.elements.every(Number.isFinite);
        if (!viewerPose || !cameraTracked) {
          latestHitRef.current = null;
          activeRuntime.reticle.visible = false;
          setTracking('lost');
          activeRuntime.renderer.render(activeRuntime.scene, activeRuntime.camera);
          return;
        }

        let nextHit: XrPoint | null = null;
        for (const result of frame.getHitTestResults(source)) {
          nextHit = horizontalHitPoint(result.getPose(localSpace));
          if (nextHit) break;
        }
        latestHitRef.current = nextHit;
        activeRuntime.reticle.visible = Boolean(nextHit);
        if (nextHit) {
          activeRuntime.reticle.position.set(nextHit.x, nextHit.y + 0.008, nextHit.z);
          setTracking('surface');
        } else {
          setTracking('searching');
        }
        // WebXRManager updates the stereo XR camera from this frame; render() uses it while presenting.
        activeRuntime.renderer.render(activeRuntime.scene, activeRuntime.camera);
      });
    } catch (reason) {
      const session = activeSessionRef.current;
      if (session) finishSession(session, true);
      if (aliveRef.current) setError(messageFromError(reason));
    } finally {
      if (aliveRef.current) setStarting(false);
    }
  }, [capability, finishSession, markCurrentHit, rendererReady, setTracking]);

  const stopSession = useCallback(() => {
    const session = activeSessionRef.current;
    if (!session) return;
    void session.end().catch((reason: unknown) => {
      if (aliveRef.current) setError(messageFromError(reason));
    });
  }, []);

  const supported = capability === 'supported' && rendererReady && !rendererError;
  const measurement = marks.length === 2 ? distanceMeters(marks[0], marks[1]) : null;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a className={styles.back} href="/">TestaFila <span>/ Spike WebXR</span></a>
        <p className={styles.kicker}>DIAGNÓSTICO EXPERIMENTAL · 27 OUT 2026</p>
      </header>

      <section className={styles.intro} aria-labelledby="xr-check-title">
        <p className={styles.eyebrow}>CAPTURA ESPACIAL · FORA DO EDITOR</p>
        <h1 id="xr-check-title">Piso por <em>WebXR</em></h1>
        <p>Uma verificação isolada de hit-test e distância em uma sessão imersiva. Nenhum dado é salvo no projeto ou alinhado à planta.</p>
      </section>

      <section className={styles.layout}>
        <div className={styles.viewport}>
          <canvas ref={canvasRef} className={styles.canvas} aria-label="Visualização WebXR com retículo de superfície" />
          {!sessionActive && <div className={styles.canvasHint} aria-hidden="true">A visualização do retículo aparece durante uma sessão AR compatível.</div>}
        </div>

        <div ref={overlayRef} className={styles.controls}>
          <div className={styles.statusBlock}>
            <p className={styles.sectionLabel}>DISPONIBILIDADE</p>
            <p className={capability === 'supported' ? styles.statusOk : capability === 'unsupported' || capability === 'insecure' || capability === 'error' ? styles.statusError : styles.statusText} role="status" aria-live="polite">{capabilityMessage}</p>
            {rendererError && <p className={styles.statusError} role="alert">{rendererError}</p>}
          </div>

          <div className={styles.sessionControls}>
            {!sessionActive ? (
              <button type="button" className={styles.primaryButton} onClick={startSession} disabled={!supported || starting}>
                {starting ? 'Iniciando sessão…' : 'Iniciar sessão AR'}
              </button>
            ) : (
              <>
                <button type="button" className={styles.primaryButton} onClick={markCurrentHit} disabled={trackingState !== 'surface' || marks.length >= 2}>
                  Marcar ponto {marks.length + 1} de 2
                </button>
                <button type="button" className={styles.secondaryButton} onClick={stopSession}>Encerrar sessão</button>
              </>
            )}
            {marks.length > 0 && <button type="button" className={styles.secondaryButton} onClick={resetMarks}>Limpar marcas</button>}
          </div>

          <div className={styles.statusBlock}>
            <p className={styles.sectionLabel}>TRACKING E SUPERFÍCIE</p>
            <p className={trackingState === 'surface' ? styles.statusOk : styles.statusText} role="status" aria-live="polite">{trackingCopy[trackingState]}</p>
            <p className={styles.note}>O retículo aparece somente para pose válida em plano quase horizontal. Toque na cena ou use “Marcar ponto”.</p>
          </div>

          <div className={styles.measurement} aria-live="polite">
            <p className={styles.sectionLabel}>DISTÂNCIA ENTRE DUAS MARCAS</p>
            {measurement === null ? <p>{marks.length === 0 ? 'Nenhuma marca nesta sessão.' : '1 de 2 pontos marcados.'}</p> : <p className={styles.measureValue}>{measurement.toFixed(2)} <span>m</span></p>}
            {measurement !== null && <p className={styles.note}>Fonte: coordenadas locais do hit-test WebXR.</p>}
          </div>

          <p className={styles.caution}>Medição experimental sem tolerância validada. Não substitui trena, não mede a planta inteira e não é enviada ao editor.</p>
          {error && <p className={styles.error} role="alert">{error}</p>}
        </div>
      </section>

      <footer className={styles.footer}>
        <span>TESTAFILA · PREPARAÇÃO DE SPIKE</span>
        <span>HTTPS + aparelho compatível necessários</span>
      </footer>
    </main>
  );
}
