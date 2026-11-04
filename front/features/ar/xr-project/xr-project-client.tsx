'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import * as THREE from 'three';
import type { PointXZ, ProjectScene, SavedProject } from '@testafila/core/contracts/project';
import { apiFetch, readApiError } from '../../../shared/http.ts';
import { horizontalHitPoint } from '../xr-check/xr-check-logic.ts';
import { alignFromCorrespondences, type AlignmentResult, type Correspondence, type SessionTransform, type XrPoint } from './xr-project-logic.ts';
import styles from './xr-project.module.css';

type Capability = 'checking' | 'supported' | 'unsupported' | 'insecure' | 'error';
type Tracking = 'inactive' | 'searching' | 'surface' | 'lost' | 'hidden';
type Runtime = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  reticle: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  projectRoot: THREE.Group;
};

const projectColors = { floor: 0xf8f6ef, line: 0x214b40, wall: 0xd8dcd4, area: 0xb6c8bc, belt: 0x355b48, person: 0x606963 };

function errorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotSupportedError') return 'O navegador não aceitou hit-test e local-floor, que são obrigatórios para esta visualização.';
    if (error.name === 'SecurityError') return 'WebXR exige HTTPS ou localhost e as permissões do navegador.';
    if (error.name === 'NotAllowedError') return 'A sessão XR foi recusada. Aceite a permissão e inicie novamente pelo botão.';
  }
  return error instanceof Error ? `Não foi possível iniciar a sessão WebXR: ${error.message}` : 'Não foi possível iniciar a sessão WebXR.';
}

function disposeObject(root: THREE.Object3D) {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const material of materials) material.dispose();
  });
}

function polygonGeometry(points: readonly PointXZ[], y: number): THREE.BufferGeometry | null {
  if (points.length < 3) return null;
  const contour = points.map((point) => new THREE.Vector2(point.x, point.z));
  const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(contour.flatMap((point) => [point.x, y, point.y]), 3));
  geometry.setIndex(triangles.flatMap(([a, b, c]) => [a, c, b]));
  geometry.computeVertexNormals();
  return geometry;
}

function cylinderBetween(start: THREE.Vector3, end: THREE.Vector3, radius: number, material: THREE.Material) {
  const direction = end.clone().sub(start);
  const length = direction.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 10), material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}

function buildProjectObject(project: ProjectScene): THREE.Group {
  const root = new THREE.Group();
  const floorGeometry = polygonGeometry(project.environment.perimeter, 0);
  if (floorGeometry) root.add(new THREE.Mesh(floorGeometry, new THREE.MeshBasicMaterial({ color: projectColors.floor, transparent: true, opacity: 0.30, side: THREE.DoubleSide, depthWrite: false })));

  const wallMaterial = new THREE.MeshBasicMaterial({ color: projectColors.wall, transparent: true, opacity: 0.35, depthWrite: false });
  for (let index = 0; index < project.environment.perimeter.length; index += 1) {
    const start = project.environment.perimeter[index];
    const end = project.environment.perimeter[(index + 1) % project.environment.perimeter.length];
    const length = Math.hypot(end.x - start.x, end.z - start.z);
    if (length < 1e-6) continue;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(length, project.environment.wallHeightMeters, 0.035), wallMaterial.clone());
    wall.position.set((start.x + end.x) / 2, project.environment.wallHeightMeters / 2, (start.z + end.z) / 2);
    wall.rotation.y = -Math.atan2(end.z - start.z, end.x - start.x);
    root.add(wall);
  }

  for (const area of project.restrictedAreas) {
    const geometry = polygonGeometry(area.vertices, 0.008);
    if (geometry) root.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: projectColors.area, transparent: true, opacity: 0.48, side: THREE.DoubleSide, depthWrite: false })));
  }

  const posts = new Map(project.posts.map((post) => [post.id, post]));
  for (const post of project.posts) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(post.baseRadiusMeters, post.baseRadiusMeters, post.heightMeters, 14), new THREE.MeshBasicMaterial({ color: projectColors.line }));
    mesh.position.set(post.position.x, post.heightMeters / 2, post.position.z);
    root.add(mesh);
  }
  for (const belt of project.belts) {
    const from = posts.get(belt.fromPostId); const to = posts.get(belt.toPostId);
    if (!from || !to) continue;
    root.add(cylinderBetween(new THREE.Vector3(from.position.x, belt.heightMeters, from.position.z), new THREE.Vector3(to.position.x, belt.heightMeters, to.position.z), 0.012, new THREE.MeshBasicMaterial({ color: projectColors.belt })));
  }
  for (const route of project.routes) {
    if (route.points.length < 2) continue;
    const geometry = new THREE.BufferGeometry().setFromPoints(route.points.map((point) => new THREE.Vector3(point.x, 0.02, point.z)));
    root.add(new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: projectColors.belt, transparent: true, opacity: 0.7 })));
  }
  for (const person of project.people) {
    const personObject = new THREE.Group();
    const height = project.simulation.personHeightMeters;
    const radius = project.simulation.personRadiusMeters;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(radius * 0.65, Math.max(0.01, height * 0.56), 5, 10), new THREE.MeshBasicMaterial({ color: projectColors.person }));
    body.position.y = height / 2;
    personObject.add(body);
    const direction = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.38, radius * 0.9, 8), new THREE.MeshBasicMaterial({ color: projectColors.line }));
    direction.rotation.x = Math.PI / 2;
    direction.position.set(0, radius * 0.35, radius * 0.9);
    personObject.add(direction);
    personObject.position.set(person.position.x, 0, person.position.z);
    personObject.rotation.y = person.yawRadians;
    root.add(personObject);
  }
  return root;
}

function applyTransform(root: THREE.Group, transform: SessionTransform) {
  root.rotation.set(0, transform.yawRadians, 0);
  root.position.set(transform.translation.x, transform.translation.y + 0.012, transform.translation.z);
}

export function XrProjectClient() {
  const { id: projectId } = useParams<{ id: string }>();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const sessionRef = useRef<XRSession | null>(null);
  const hitTestRef = useRef<XRHitTestSource | null>(null);
  const floorSpaceRef = useRef<XRReferenceSpace | null>(null);
  const latestHitRef = useRef<XrPoint | null>(null);
  const correspondencesRef = useRef<Correspondence[]>([]);
  const selectedPointRef = useRef<PointXZ | null>(null);
  const rotationAdjustmentRef = useRef(0);
  const aliveRef = useRef(true);

  const [project, setProject] = useState<SavedProject | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [capability, setCapability] = useState<Capability>('checking');
  const [capabilityMessage, setCapabilityMessage] = useState('Verificando contexto seguro e suporte a immersive-ar…');
  const [rendererReady, setRendererReady] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [tracking, setTracking] = useState<Tracking>('inactive');
  const [correspondences, setCorrespondences] = useState<Correspondence[]>([]);
  const [selectedPointIndex, setSelectedPointIndex] = useState(0);
  const [alignment, setAlignment] = useState<AlignmentResult | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (!window.isSecureContext) {
      setCapability('insecure'); setCapabilityMessage('WebXR exige HTTPS ou localhost em contexto seguro.'); return;
    }
    if (!navigator.xr) {
      setCapability('unsupported'); setCapabilityMessage('Este navegador não expõe WebXR. A câmera comum não substitui a sessão AR.'); return;
    }
    let cancelled = false;
    void navigator.xr.isSessionSupported('immersive-ar').then((supported) => {
      if (!cancelled) { setCapability(supported ? 'supported' : 'unsupported'); setCapabilityMessage(supported ? 'immersive-ar disponível; hit-test será confirmado ao iniciar.' : 'Este aparelho não anunciou suporte a immersive-ar.'); }
    }).catch((cause: unknown) => { if (!cancelled) { setCapability('error'); setCapabilityMessage(cause instanceof Error ? cause.message : 'Falha ao consultar WebXR.'); } });
    return () => { cancelled = true; };
  }, []);

  const endSession = useCallback((requestEnd: boolean) => {
    const session = sessionRef.current;
    if (!session) return;
    hitTestRef.current?.cancel(); hitTestRef.current = null; floorSpaceRef.current = null; latestHitRef.current = null;
    sessionRef.current = null;
    const runtime = runtimeRef.current;
    if (runtime) { runtime.renderer.setAnimationLoop(null); runtime.reticle.visible = false; runtime.projectRoot.visible = false; }
    setSessionActive(false); setTracking('inactive'); setConfirmed(false); setAlignment(null); setCorrespondences([]); correspondencesRef.current = [];
    if (requestEnd) void session.end().catch(() => undefined);
  }, []);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const prevent = (event: Event) => event.preventDefault();
    overlay.addEventListener('beforexrselect', prevent);
    return () => overlay.removeEventListener('beforexrselect', prevent);
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
    return () => { aliveRef.current = false; window.removeEventListener('resize', resize); endSession(true); runtimeRef.current = null; disposeObject(projectRoot); reticle.geometry.dispose(); reticle.material.dispose(); renderer.dispose(); };
  }, [endSession, project]);

  const resetAlignment = useCallback(() => {
    correspondencesRef.current = []; rotationAdjustmentRef.current = 0; setCorrespondences([]); setAlignment(null); setConfirmed(false);
    if (runtimeRef.current) runtimeRef.current.projectRoot.visible = false;
  }, []);

  const collectCurrentHit = useCallback(() => {
    const runtime = runtimeRef.current; const session = sessionRef.current; const projectPoint = selectedPointRef.current; const hit = latestHitRef.current;
    if (!runtime || !session || session.visibilityState !== 'visible' || !projectPoint || !hit || correspondencesRef.current.length >= 3) return;
    if (correspondencesRef.current.some(({ project: existing }) => existing.x === projectPoint.x && existing.z === projectPoint.z)) { setError('Escolha outro ponto da planta antes de registrar uma nova correspondência.'); return; }
    const next = [...correspondencesRef.current, { project: projectPoint, session: hit }];
    correspondencesRef.current = next; setCorrespondences(next); setError(null);
    const nextPointIndex = candidates.findIndex((candidate) => !next.some(({ project: existing }) => existing.x === candidate.x && existing.z === candidate.z));
    if (nextPointIndex >= 0) setSelectedPointIndex(nextPointIndex);
    const nextAlignment = alignFromCorrespondences(next); setAlignment(nextAlignment);
    if (nextAlignment && next.length === 2) {
      applyTransform(runtime.projectRoot, nextAlignment.transform);
    }
  }, [candidates]);

  const startSession = useCallback(async () => {
    if (!window.isSecureContext || !navigator.xr || capability !== 'supported' || !runtimeRef.current || !rendererReady) { setError('A sessão não está pronta. Confirme HTTPS, suporte immersive-ar e WebGL.'); return; }
    setStarting(true); setError(null); resetAlignment();
    try {
      const options: XRSessionInit = { requiredFeatures: ['hit-test', 'local-floor'] };
      if (overlayRef.current) { options.optionalFeatures = ['dom-overlay']; options.domOverlay = { root: overlayRef.current }; }
      const session = await navigator.xr.requestSession('immersive-ar', options);
      sessionRef.current = session;
      const onEnd = () => endSession(false);
      const onVisibility = () => { if (session.visibilityState !== 'visible') { latestHitRef.current = null; if (runtimeRef.current) runtimeRef.current.reticle.visible = false; setTracking('hidden'); } else setTracking('searching'); };
      const onSelect = () => collectCurrentHit();
      session.addEventListener('end', onEnd); session.addEventListener('visibilitychange', onVisibility); session.addEventListener('select', onSelect);
      const viewer = await session.requestReferenceSpace('viewer');
      const requestHitTestSource = session.requestHitTestSource;
      if (!requestHitTestSource) throw new Error('O navegador não implementa requestHitTestSource.');
      const source = await requestHitTestSource.call(session, { space: viewer });
      if (!source) throw new Error('O navegador não retornou uma fonte de hit-test.');
      hitTestRef.current = source;
      const runtime = runtimeRef.current; if (!runtime) throw new Error('Renderizador não está disponível.');
      await runtime.renderer.xr.setSession(session);
      const floorSpace = runtime.renderer.xr.getReferenceSpace(); if (!floorSpace) throw new Error('O navegador não forneceu o espaço local do piso.'); floorSpaceRef.current = floorSpace;
      setTracking('searching'); setSessionActive(true);
      runtime.renderer.setAnimationLoop((_time, frame) => {
        if (!sessionRef.current || !floorSpaceRef.current || !hitTestRef.current || session.visibilityState !== 'visible') return;
        const viewerPose = frame.getViewerPose(floorSpaceRef.current);
        if (!viewerPose) { latestHitRef.current = null; runtime.reticle.visible = false; setTracking('lost'); runtime.renderer.render(runtime.scene, runtime.camera); return; }
        let hit: XrPoint | null = null;
        for (const result of frame.getHitTestResults(hitTestRef.current)) { hit = horizontalHitPoint(result.getPose(floorSpaceRef.current)); if (hit) break; }
        latestHitRef.current = hit; runtime.reticle.visible = Boolean(hit);
        if (hit) { runtime.reticle.position.set(hit.x, hit.y + 0.008, hit.z); setTracking('surface'); } else setTracking('searching');
        runtime.renderer.render(runtime.scene, runtime.camera);
      });
    } catch (cause) { endSession(true); if (aliveRef.current) setError(errorMessage(cause)); }
    finally { if (aliveRef.current) setStarting(false); }
  }, [capability, collectCurrentHit, endSession, rendererReady, resetAlignment]);

  const confirmAlignment = useCallback(() => {
    const runtime = runtimeRef.current;
    if (!runtime || !alignment || correspondencesRef.current.length < 3) return;
    applyTransform(runtime.projectRoot, alignment.transform); runtime.projectRoot.visible = true; setConfirmed(true);
  }, [alignment]);

  const rotate = useCallback((delta: number) => {
    const runtime = runtimeRef.current; if (!runtime || !alignment || !confirmed) return;
    rotationAdjustmentRef.current += delta;
    applyTransform(runtime.projectRoot, { ...alignment.transform, yawRadians: alignment.transform.yawRadians + rotationAdjustmentRef.current });
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
          <button type="button" className={styles.secondary} onClick={resetAlignment}>Reiniciar alinhamento</button><button type="button" className={styles.secondary} onClick={() => endSession(true)}>Encerrar sessão</button>
        </>}
        <p className={styles.caution}>Use HTTPS e aparelho compatível. A visualização é experimental e não substitui medição com trena ou validação física.</p>{error && <p className={styles.error} role="alert">{error}</p>}
      </div>
    </section>
  </main>;
}
