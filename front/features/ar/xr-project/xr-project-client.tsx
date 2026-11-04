'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import * as THREE from 'three';
import type { PointXZ, SavedProject } from '@testafila/core/contracts/project';
import { apiFetch, readApiError } from '../../../shared/http.ts';
import { buildProjectObject, disposeObject, projectColors } from '../scene/project-objects.ts';
import type { ArCapabilityState } from '../session/use-ar-capability.ts';
import { useArCapability } from '../session/use-ar-capability.ts';
import { createXrSessionController, preventXrSelectOn, type XrTracking } from '../session/xr-session.ts';
import { alignFromCorrespondences, projectRootPose, withManualRotation, type AlignmentResult, type Correspondence, type SessionTransform } from './xr-project-logic.ts';
import styles from './xr-project.module.css';

type Runtime = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  reticle: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  projectRoot: THREE.Group;
};

function capabilityCopy({ status, reason }: ArCapabilityState): string {
  switch (status) {
    case 'checking': return 'Verificando contexto seguro e suporte a immersive-ar…';
    case 'supported': return 'immersive-ar disponível; hit-test será confirmado ao iniciar.';
    case 'unsupported': return 'Este aparelho não anunciou suporte a immersive-ar.';
    case 'no-webxr': return 'Este navegador não expõe WebXR. A câmera comum não substitui a sessão AR.';
    case 'insecure': return 'WebXR exige HTTPS ou localhost em contexto seguro.';
    case 'error': return reason ?? 'Falha ao consultar WebXR.';
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotSupportedError') return 'O navegador não aceitou hit-test e local-floor, que são obrigatórios para esta visualização.';
    if (error.name === 'SecurityError') return 'WebXR exige HTTPS ou localhost e as permissões do navegador.';
    if (error.name === 'NotAllowedError') return 'A sessão XR foi recusada. Aceite a permissão e inicie novamente pelo botão.';
  }
  return error instanceof Error ? `Não foi possível iniciar a sessão WebXR: ${error.message}` : 'Não foi possível iniciar a sessão WebXR.';
}

function applyTransform(root: THREE.Group, transform: SessionTransform) {
  const { position, rotationY } = projectRootPose(transform);
  root.rotation.set(0, rotationY, 0);
  root.position.set(position.x, position.y + 0.012, position.z);
}

export function XrProjectClient() {
  const { id: projectId } = useParams<{ id: string }>();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const selectHandlerRef = useRef<() => void>(() => undefined);
  const correspondencesRef = useRef<Correspondence[]>([]);
  const selectedPointRef = useRef<PointXZ | null>(null);
  const rotationAdjustmentRef = useRef(0);
  const aliveRef = useRef(true);

  const [project, setProject] = useState<SavedProject | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const capabilityState = useArCapability();
  const capability = capabilityState.status;
  const capabilityMessage = capabilityCopy(capabilityState);
  const [rendererReady, setRendererReady] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [tracking, setTracking] = useState<XrTracking>('inactive');
  const [correspondences, setCorrespondences] = useState<Correspondence[]>([]);
  const [selectedPointIndex, setSelectedPointIndex] = useState(0);
  const [alignment, setAlignment] = useState<AlignmentResult | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [xrSession] = useState(() => createXrSessionController({
    getXr: () => navigator.xr,
    getRuntime: () => runtimeRef.current,
    getOverlayRoot: () => overlayRef.current,
    onTrackingChange: setTracking,
    onActive: () => setSessionActive(true),
    onFinished: () => {
      if (runtimeRef.current) runtimeRef.current.projectRoot.visible = false;
      setSessionActive(false); setConfirmed(false); setAlignment(null); setCorrespondences([]); correspondencesRef.current = [];
    },
    onSelect: () => selectHandlerRef.current(),
  }));

  const candidates = useMemo(() => project?.scene.environment.perimeter ?? [], [project]);
  const selectedPoint = candidates[selectedPointIndex] ?? null;

  useEffect(() => { selectedPointRef.current = selectedPoint; }, [selectedPoint]);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}`);
        if (!response.ok) throw new Error(await readApiError(response, 'Não foi possível abrir este projeto.'));
        if (!cancelled) setProject(await response.json() as SavedProject);
      } catch (cause) {
        if (!cancelled) setLoadError(cause instanceof Error ? cause.message : 'Não foi possível abrir este projeto.');
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    return preventXrSelectOn(overlay);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !project) return;
    aliveRef.current = true;
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.xr.enabled = true; renderer.xr.setReferenceSpaceType('local-floor'); renderer.setClearColor(0x000000, 0); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(65, 1, 0.01, 40);
    const light = new THREE.HemisphereLight(0xffffff, 0x355b48, 2); scene.add(light);
    const reticle = new THREE.Mesh(new THREE.RingGeometry(0.075, 0.11, 32), new THREE.MeshBasicMaterial({ color: projectColors.line, side: THREE.DoubleSide, depthTest: false }));
    reticle.rotation.x = -Math.PI / 2; reticle.visible = false; scene.add(reticle);
    const projectRoot = buildProjectObject(project.scene); projectRoot.visible = false; scene.add(projectRoot);
    const runtime = { renderer, scene, camera, reticle, projectRoot }; runtimeRef.current = runtime;
    const resize = () => { if (renderer.xr.isPresenting) return; const width = Math.max(canvas.clientWidth, 1); const height = Math.max(canvas.clientHeight, 1); renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.render(scene, camera); };
    resize(); window.addEventListener('resize', resize); setRendererReady(true);
    return () => { aliveRef.current = false; window.removeEventListener('resize', resize); xrSession.finish(true); runtimeRef.current = null; disposeObject(projectRoot); reticle.geometry.dispose(); reticle.material.dispose(); renderer.dispose(); };
  }, [project, xrSession]);

  const resetAlignment = useCallback(() => {
    correspondencesRef.current = []; rotationAdjustmentRef.current = 0; setCorrespondences([]); setAlignment(null); setConfirmed(false);
    if (runtimeRef.current) runtimeRef.current.projectRoot.visible = false;
  }, []);

  const collectCurrentHit = useCallback(() => {
    const runtime = runtimeRef.current; const projectPoint = selectedPointRef.current; const hit = xrSession.currentHit();
    if (!runtime || !xrSession.isVisible() || !projectPoint || !hit || correspondencesRef.current.length >= 3) return;
    if (correspondencesRef.current.some(({ project: existing }) => existing.x === projectPoint.x && existing.z === projectPoint.z)) { setError('Escolha outro ponto da planta antes de registrar uma nova correspondência.'); return; }
    const next = [...correspondencesRef.current, { project: projectPoint, session: hit }];
    correspondencesRef.current = next; setCorrespondences(next); setError(null);
    const nextPointIndex = candidates.findIndex((candidate) => !next.some(({ project: existing }) => existing.x === candidate.x && existing.z === candidate.z));
    if (nextPointIndex >= 0) setSelectedPointIndex(nextPointIndex);
    const nextAlignment = alignFromCorrespondences(next); setAlignment(nextAlignment);
    if (nextAlignment && next.length === 2) {
      applyTransform(runtime.projectRoot, nextAlignment.transform);
    }
  }, [candidates, xrSession]);

  useEffect(() => { selectHandlerRef.current = collectCurrentHit; }, [collectCurrentHit]);

  const startSession = useCallback(async () => {
    if (!window.isSecureContext || !navigator.xr || capability !== 'supported' || !runtimeRef.current || !rendererReady) { setError('A sessão não está pronta. Confirme HTTPS, suporte immersive-ar e WebGL.'); return; }
    setStarting(true); setError(null); resetAlignment();
    try { await xrSession.start(); }
    catch (cause) { if (aliveRef.current) setError(errorMessage(cause)); }
    finally { if (aliveRef.current) setStarting(false); }
  }, [capability, rendererReady, resetAlignment, xrSession]);

  const confirmAlignment = useCallback(() => {
    const runtime = runtimeRef.current;
    if (!runtime || !alignment || correspondencesRef.current.length < 3) return;
    applyTransform(runtime.projectRoot, alignment.transform); runtime.projectRoot.visible = true; setConfirmed(true);
  }, [alignment]);

  const rotate = useCallback((delta: number) => {
    const runtime = runtimeRef.current; if (!runtime || !alignment || !confirmed) return;
    rotationAdjustmentRef.current += delta;
    applyTransform(runtime.projectRoot, withManualRotation(alignment.transform, rotationAdjustmentRef.current));
  }, [alignment, confirmed]);

  if (loadError) return <main className={styles.page}><p className={styles.error}>{loadError}</p><Link href="/dashboard">Voltar aos projetos</Link></main>;
  if (!project) return <main className={styles.page}><p>Carregando projeto…</p></main>;
  const used = (point: PointXZ) => correspondences.some(({ project: entry }) => entry.x === point.x && entry.z === point.z);
  const canMark = sessionActive && tracking === 'surface' && correspondences.length < 3 && selectedPoint !== null && !used(selectedPoint);

  return <main className={styles.page}>
    <header className={styles.header}><Link href={`/projects/${encodeURIComponent(project.id)}`} className={styles.back}>TestaFila <span>/ {project.name}</span></Link><p>WEBAR EXPERIMENTAL · ALINHAMENTO POR SESSÃO</p></header>
    <section className={styles.intro}><p>VISUALIZAÇÃO DA PLANTA EM ESCALA NOMINAL</p><h1>Alinhar no <em>espaço físico</em></h1><span>A origem e a geometria salvas não são modificadas. Cada sessão pede novo alinhamento.</span></section>
    <section className={styles.layout}>
      <div className={styles.viewport}><canvas ref={canvasRef} className={styles.canvas} aria-label="Visualização WebAR da fila" />{!sessionActive && <p className={styles.canvasHint}>A visualização da planta aparece após o alinhamento em uma sessão AR compatível.</p>}</div>
      <div ref={overlayRef} className={styles.controls}>
        <section><h2>Disponibilidade</h2><p className={capability === 'supported' ? styles.ok : styles.muted}>{capabilityMessage}</p></section>
        {!sessionActive ? <button type="button" className={styles.primary} disabled={capability !== 'supported' || !rendererReady || starting || candidates.length < 3} onClick={startSession}>{starting ? 'Iniciando sessão…' : 'Iniciar WebAR'}</button> : <>
          <section><h2>Correspondência {Math.min(correspondences.length + 1, 3)} de 3</h2><p className={styles.muted}>Selecione um vértice da planta e toque no ponto físico correspondente.</p><div className={styles.pointList}>{candidates.map((point, index) => <button key={point.id} type="button" className={selectedPointIndex === index ? styles.pointSelected : styles.point} disabled={used(point)} onClick={() => setSelectedPointIndex(index)}>Canto {index + 1} · {point.x.toFixed(2)} × {point.z.toFixed(2)} m</button>)}</div></section>
          <button type="button" className={styles.primary} disabled={!canMark} onClick={collectCurrentHit}>Registrar ponto {Math.min(correspondences.length + 1, 3)}</button>
          <p className={tracking === 'surface' ? styles.ok : styles.muted}>{tracking === 'surface' ? 'Piso detectado. O ponto pode ser registrado.' : tracking === 'lost' ? 'Tracking perdido; registro suspenso.' : 'Procure uma superfície horizontal.'}</p>
          {alignment && <section><h2>Conferência métrica</h2><p className={styles.metric}>Erro entre os dois pontos de ajuste: {alignment.fitDimensionErrorPercent.toFixed(2)}%</p>{correspondences.length >= 3 && <p className={styles.metric}>Resíduo máximo com o terceiro ponto: {alignment.maxResidualMeters.toFixed(2)} m</p>}<p className={styles.muted}>Os valores são observados nesta sessão. Nenhuma tolerância física foi validada ainda.</p></section>}
          {correspondences.length >= 3 && !confirmed && <button type="button" className={styles.primary} onClick={confirmAlignment}>Confirmar visualização</button>}
          {confirmed && <section className={styles.actions}><h2>Ajuste temporário</h2><button type="button" className={styles.secondary} onClick={() => rotate(-Math.PI / 36)}>Girar −5°</button><button type="button" className={styles.secondary} onClick={() => rotate(Math.PI / 36)}>Girar +5°</button></section>}
          <button type="button" className={styles.secondary} onClick={resetAlignment}>Reiniciar alinhamento</button><button type="button" className={styles.secondary} onClick={() => xrSession.finish(true)}>Encerrar sessão</button>
        </>}
        <p className={styles.caution}>Use HTTPS e aparelho compatível. A visualização é experimental e não substitui medição com trena ou validação física.</p>{error && <p className={styles.error} role="alert">{error}</p>}
      </div>
    </section>
  </main>;
}
