'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import styles from './xr-check.module.css';
import { distanceMeters, type XrPoint } from './xr-check-logic.ts';
import type { ArCapabilityState } from '../session/use-ar-capability.ts';
import { useArCapability } from '../session/use-ar-capability.ts';
import { createXrSessionController, preventXrSelectOn, type XrTracking } from '../session/xr-session.ts';

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

const trackingCopy: Record<XrTracking, string> = {
  inactive: 'Sessão XR não iniciada.',
  searching: 'Tracking ativo; procure uma superfície horizontal.',
  surface: 'Superfície horizontal detectada. Você pode marcar um ponto.',
  lost: 'Pose de tracking indisponível. Retículo oculto e marcação suspensa.',
  hidden: 'Sessão XR fora de primeiro plano. Retículo oculto e marcação suspensa.',
};

function capabilityCopy({ status, reason }: ArCapabilityState): string {
  switch (status) {
    case 'checking': return 'Verificando contexto seguro e disponibilidade de immersive-ar…';
    case 'supported': return 'immersive-ar anunciado como disponível. O hit-test ainda será exigido ao iniciar.';
    case 'unsupported': return 'Este aparelho/navegador não anunciou suporte a immersive-ar.';
    case 'no-webxr': return 'Este navegador não expõe a API WebXR. Uma câmera comum não será usada como substituta.';
    case 'insecure': return 'WebXR indisponível: abra esta rota em HTTPS ou localhost, em um contexto seguro.';
    case 'error': return `Não foi possível consultar WebXR: ${reason ?? 'erro desconhecido'}.`;
  }
}

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
  const selectHandlerRef = useRef<() => void>(() => undefined);
  const marksRef = useRef<XrPoint[]>([]);
  const aliveRef = useRef(true);

  const capabilityState = useArCapability();
  const capability = capabilityState.status;
  const capabilityMessage = capabilityCopy(capabilityState);
  const [rendererReady, setRendererReady] = useState(false);
  const [rendererError, setRendererError] = useState<string | null>(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [trackingState, setTrackingState] = useState<XrTracking>('inactive');
  const [marks, setMarks] = useState<XrPoint[]>([]);
  const [error, setError] = useState<string | null>(null);

  const resetMarks = useCallback(() => {
    marksRef.current = [];
    clearMeasurementMeshes(runtimeRef.current);
    if (aliveRef.current) setMarks([]);
  }, []);

  const [xrSession] = useState(() => createXrSessionController({
    variant: 'check',
    getXr: () => navigator.xr,
    getRuntime: () => runtimeRef.current,
    getOverlayRoot: () => overlayRef.current,
    onTrackingChange: (next) => { if (aliveRef.current) setTrackingState(next); },
    onActive: () => setSessionActive(true),
    onFinished: () => {
      marksRef.current = [];
      clearMeasurementMeshes(runtimeRef.current);
      if (aliveRef.current) { setMarks([]); setSessionActive(false); }
    },
    onSelect: () => selectHandlerRef.current(),
  }));

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    return preventXrSelectOn(overlay);
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
        const endPromise = xrSession.finish(true);
        runtimeRef.current = null;
        if (endPromise) void endPromise.finally(() => disposeRuntime(runtime));
        else disposeRuntime(runtime);
      };
    } catch (reason) {
      setRendererReady(false);
      setRendererError(`WebGL indisponível neste navegador: ${reason instanceof Error ? reason.message : 'não foi possível criar o renderer.'}`);
    }
  }, [xrSession]);

  const markCurrentHit = useCallback(() => {
    const runtime = runtimeRef.current;
    const hit = xrSession.currentHit();
    if (!xrSession.isVisible() || !runtime?.renderer.xr.isPresenting || xrSession.tracking() !== 'surface' || !hit || marksRef.current.length >= 2) return;

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
  }, [xrSession]);

  useEffect(() => { selectHandlerRef.current = markCurrentHit; }, [markCurrentHit]);

  const startSession = useCallback(async () => {
    if (!window.isSecureContext) {
      setError('WebXR exige HTTPS ou localhost.');
      return;
    }
    if (!navigator.xr || capability !== 'supported' || !runtimeRef.current || !rendererReady) {
      setError('A sessão não está pronta. Confirme suporte immersive-ar e disponibilidade de WebGL.');
      return;
    }

    // start() calls requestSession synchronously, inside this click's user activation.
    const started = xrSession.start();
    setStarting(true);
    setError(null);
    try {
      await started;
    } catch (reason) {
      if (aliveRef.current) setError(messageFromError(reason));
    } finally {
      if (aliveRef.current) setStarting(false);
    }
  }, [capability, rendererReady, xrSession]);

  const stopSession = useCallback(() => {
    void xrSession.stop()?.catch((reason: unknown) => {
      if (aliveRef.current) setError(messageFromError(reason));
    });
  }, [xrSession]);

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
