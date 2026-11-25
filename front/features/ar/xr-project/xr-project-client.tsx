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
import { createXrSessionController, type XrTracking } from '../session/xr-session.ts';
import type { XrFloorHint } from '../session/floor-guidance.ts';
import { createHitStabilizer } from '../session/hit-stabilizer.ts';
import { aimGuide, alignFromCorrespondences, minimapPoints, projectRootPose, withManualRotation, type AlignmentResult, type Correspondence, type SessionTransform, type XrPoint } from './xr-project-logic.ts';
import styles from './xr-project.module.css';

type Runtime = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  reticle: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  /** Seguido pelas âncoras do aparelho; contém a planta alinhada. */
  worldRoot: THREE.Group;
  projectRoot: THREE.Group;
  /** Onde a planta diz que está o próximo canto, depois de dois pontos. */
  targetMarker: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  setAim: (progress: number, stable: boolean) => void;
};

const RETICLE_SETTLING_OPACITY = 0.4;
/** Opacidade da planta enquanto é só prévia (dois pontos, ainda sem confirmar). */
const PREVIEW_OPACITY = 0.45;
const MIN_POINTS = 2;
const MAX_POINTS = 3;
const MINIMAP = { width: 240, height: 112, padding: 16 };

/** Multiplica a opacidade original de cada material; 1 restaura a planta. */
function setPlanOpacity(root: THREE.Object3D, factor: number) {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const material of materials) {
      material.userData.baseOpacity ??= material.opacity;
      material.userData.baseTransparent ??= material.transparent;
      const transparent = material.userData.baseTransparent || factor < 1;
      if (material.transparent !== transparent) material.needsUpdate = true;
      material.transparent = transparent;
      material.opacity = material.userData.baseOpacity * factor;
    }
  });
}

function formatMeters(value: number): string {
  return `${value.toFixed(2).replace('.', ',')} m`;
}

function guideText(guide: ReturnType<typeof aimGuide>, firstIndex: number | null): string {
  if (guide.kind === 'from-first') return `Do canto ${(firstIndex ?? 0) + 1} até o círculo: ${formatMeters(guide.observedMeters)} · na planta: ${formatMeters(guide.plannedMeters)}`;
  if (guide.kind === 'to-target' && Number.isFinite(guide.distanceMeters)) return guide.distanceMeters < 0.05 ? 'O círculo está sobre o canto previsto.' : `O canto previsto está a ${formatMeters(guide.distanceMeters)} do círculo (anel no chão).`;
  return '';
}

const floorHintText: Partial<Record<XrFloorHint, string>> = {
  scan: 'Aponte para o chão e mova o celular devagar para os lados, até o círculo firmar.',
  'scan-slow': 'Está difícil achar o chão. Procure um lugar mais claro e aponte para um piso com textura, sem reflexo.',
  'aim-floor': 'Aponte o celular para o chão.',
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
  const alignmentRef = useRef<AlignmentResult | null>(null);
  const firstIndexRef = useRef<number | null>(null);
  const guideRef = useRef<HTMLParagraphElement | null>(null);

  const [project, setProject] = useState<SavedProject | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const capabilityState = useArCapability();
  const capability = capabilityState.status;
  const capabilityMessage = capabilityCopy(capabilityState);
  const [rendererReady, setRendererReady] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [tracking, setTracking] = useState<XrTracking>('inactive');
  const [floorHint, setFloorHint] = useState<XrFloorHint>('none');
  const [placing, setPlacing] = useState(false);
  const [correspondences, setCorrespondences] = useState<Correspondence[]>([]);
  const [selectedPointIndex, setSelectedPointIndex] = useState(0);
  const [alignment, setAlignment] = useState<AlignmentResult | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [xrSession] = useState(() => createXrSessionController({
    getXr: () => navigator.xr,
    getRuntime: () => runtimeRef.current,
    getOverlayRoot: () => overlayRef.current,
    // Mesmo filtro da montagem: piso travado, mira suavizada e marcação só com o ponto parado.
    stabilizer: createHitStabilizer(),
    anchors: true,
    planes: true,
    onFloorHintChange: setFloorHint,
    onPendingPlaceChange: setPlacing,
    onTrackingChange: setTracking,
    onActive: () => setSessionActive(true),
    onFinished: () => {
      if (runtimeRef.current) { runtimeRef.current.projectRoot.visible = false; runtimeRef.current.targetMarker.visible = false; }
      alignmentRef.current = null; firstIndexRef.current = null;
      setSessionActive(false); setConfirmed(false); setAlignment(null); setCorrespondences([]); correspondencesRef.current = [];
    },
    onSelect: () => selectHandlerRef.current(),
    // Por quadro: só refs e objetos 3D, nunca estado React.
    onFrame: (aim: XrPoint | null) => {
      const target = correspondencesRef.current.length < MAX_POINTS ? selectedPointRef.current : null;
      const fitted = alignmentRef.current;
      // O anel acompanha o giro manual, como a planta.
      const shown = fitted && { ...fitted, transform: withManualRotation(fitted.transform, rotationAdjustmentRef.current) };
      const guide = aimGuide(correspondencesRef.current, target, aim, shown);
      const marker = runtimeRef.current?.targetMarker;
      if (marker) {
        marker.visible = guide.kind === 'to-target';
        if (guide.kind === 'to-target') marker.position.set(guide.expected.x, guide.expected.y + 0.006, guide.expected.z);
      }
      const text = guideText(guide, firstIndexRef.current);
      if (guideRef.current && guideRef.current.textContent !== text) guideRef.current.textContent = text;
    },
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
    // Toques nos controles ficam nos controles; toque na área livre registra o ponto.
    const preventOnControls = (event: Event) => { if (event.target !== overlay) event.preventDefault(); };
    overlay.addEventListener('beforexrselect', preventOnControls);
    return () => overlay.removeEventListener('beforexrselect', preventOnControls);
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
    const reticle = new THREE.Mesh(new THREE.RingGeometry(0.075, 0.11, 32), new THREE.MeshBasicMaterial({ color: projectColors.line, side: THREE.DoubleSide, depthTest: false, transparent: true, opacity: RETICLE_SETTLING_OPACITY }));
    reticle.rotation.x = -Math.PI / 2; reticle.visible = false; scene.add(reticle);
    const aimDot = new THREE.Mesh(new THREE.CircleGeometry(0.028, 24), new THREE.MeshBasicMaterial({ color: projectColors.line, side: THREE.DoubleSide, depthTest: false }));
    aimDot.visible = false; reticle.add(aimDot);
    const worldRoot = new THREE.Group(); scene.add(worldRoot);
    const projectRoot = buildProjectObject(project.scene); projectRoot.visible = false; worldRoot.add(projectRoot);
    const setAim = (progress: number, stable: boolean) => {
      reticle.material.opacity = stable ? 1 : RETICLE_SETTLING_OPACITY + (0.9 - RETICLE_SETTLING_OPACITY) * Math.min(Math.max(progress, 0), 1);
      aimDot.visible = stable;
    };
    const targetMarker = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.2, 40), new THREE.MeshBasicMaterial({ color: projectColors.belt, side: THREE.DoubleSide, depthTest: false, transparent: true, opacity: 0.85 }));
    targetMarker.rotation.x = -Math.PI / 2; targetMarker.visible = false; worldRoot.add(targetMarker);
    const runtime = { renderer, scene, camera, reticle, worldRoot, projectRoot, targetMarker, setAim }; runtimeRef.current = runtime;
    const resize = () => { if (renderer.xr.isPresenting) return; const width = Math.max(canvas.clientWidth, 1); const height = Math.max(canvas.clientHeight, 1); renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.render(scene, camera); };
    resize(); window.addEventListener('resize', resize); setRendererReady(true);
    return () => { aliveRef.current = false; window.removeEventListener('resize', resize); xrSession.finish(true); runtimeRef.current = null; disposeObject(projectRoot); reticle.geometry.dispose(); reticle.material.dispose(); aimDot.geometry.dispose(); aimDot.material.dispose(); targetMarker.geometry.dispose(); targetMarker.material.dispose(); renderer.dispose(); };
  }, [project, xrSession]);

  const resetAlignment = useCallback(() => {
    correspondencesRef.current = []; rotationAdjustmentRef.current = 0; alignmentRef.current = null; firstIndexRef.current = null;
    setCorrespondences([]); setAlignment(null); setConfirmed(false); setSelectedPointIndex(0);
    if (runtimeRef.current) { runtimeRef.current.projectRoot.visible = false; runtimeRef.current.targetMarker.visible = false; }
  }, []);

  const registerPoint = useCallback((hit: XrPoint) => {
    const runtime = runtimeRef.current; const projectPoint = selectedPointRef.current;
    if (!runtime || !projectPoint || correspondencesRef.current.length >= MAX_POINTS) return;
    if (correspondencesRef.current.some(({ project: existing }) => existing.x === projectPoint.x && existing.z === projectPoint.z)) { setError('Escolha outro canto da planta antes de registrar.'); return; }
    const next = [...correspondencesRef.current, { project: projectPoint, session: hit }];
    if (next.length === 1) firstIndexRef.current = candidates.findIndex((candidate) => candidate.x === projectPoint.x && candidate.z === projectPoint.z);
    correspondencesRef.current = next; setCorrespondences(next); setError(null);
    const nextPointIndex = candidates.findIndex((candidate) => !next.some(({ project: existing }) => existing.x === candidate.x && existing.z === candidate.z));
    if (nextPointIndex >= 0) setSelectedPointIndex(nextPointIndex);
    const nextAlignment = alignFromCorrespondences(next);
    if (next.length === MIN_POINTS && !nextAlignment) setError('Os dois pontos ficaram no mesmo lugar. Reinicie e marque cantos distantes.');
    // Os dois primeiros pontos definem o ajuste; o terceiro só acrescenta o resíduo de conferência.
    alignmentRef.current = nextAlignment; setAlignment(nextAlignment);
    if (nextAlignment && next.length === MIN_POINTS) {
      applyTransform(runtime.projectRoot, nextAlignment.transform);
      setPlanOpacity(runtime.projectRoot, PREVIEW_OPACITY);
      runtime.projectRoot.visible = true;
    }
  }, [candidates]);

  const collectCurrentHit = useCallback(() => {
    if (!xrSession.isVisible() || correspondencesRef.current.length >= MAX_POINTS) return;
    // Tocar antes da hora fica guardado: registra assim que o círculo firmar, no mesmo ponto estável.
    xrSession.placeWhenStable(registerPoint);
  }, [registerPoint, xrSession]);

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
    if (!runtime || !alignment || correspondencesRef.current.length < MIN_POINTS) return;
    applyTransform(runtime.projectRoot, withManualRotation(alignment.transform, rotationAdjustmentRef.current));
    setPlanOpacity(runtime.projectRoot, 1); runtime.projectRoot.visible = true; setConfirmed(true);
  }, [alignment]);

  const rotate = useCallback((delta: number) => {
    const runtime = runtimeRef.current; if (!runtime || !alignment) return;
    rotationAdjustmentRef.current += delta;
    applyTransform(runtime.projectRoot, withManualRotation(alignment.transform, rotationAdjustmentRef.current));
  }, [alignment]);

  if (loadError) return <main className={styles.page}><p className={styles.error}>{loadError}</p><Link href="/dashboard">Voltar aos projetos</Link></main>;
  if (!project) return <main className={styles.page}><p>Carregando projeto…</p></main>;
  const used = (point: PointXZ) => correspondences.some(({ project: entry }) => entry.x === point.x && entry.z === point.z);
  // Piso conhecido e círculo sobre ele: o toque é aceito e espera o círculo firmar.
  const aiming = tracking === 'surface' || (tracking === 'searching' && floorHint === 'none');
  const canMark = sessionActive && aiming && correspondences.length < MAX_POINTS && selectedPoint !== null && !used(selectedPoint);
  const count = correspondences.length;
  const mapPoints = minimapPoints(candidates, MINIMAP.width, MINIMAP.height, MINIMAP.padding);
  const heading = confirmed ? 'Planta alinhada' : count < MIN_POINTS ? `Ponto ${count + 1} de ${MIN_POINTS}` : 'Confira a prévia';
  const instruction = confirmed
    ? (count < MAX_POINTS ? 'Opcional: registre mais um canto para conferir o alinhamento.' : 'Use os botões de girar para o ajuste fino.')
    : count < MIN_POINTS
      ? `Ache no chão o canto ${selectedPointIndex + 1}, destacado na planta, e aponte o círculo para ele.`
      : 'A planta aparece transparente no chão. Se estiver certa, confirme. Para conferir, registre mais um canto (opcional).';
  const statusText = tracking === 'surface' ? 'Círculo firme. Toque em Registrar ou na tela.' : tracking === 'lost' ? 'Tracking perdido; registro suspenso.' : floorHintText[floorHint] ?? 'Segure o celular parado até o círculo firmar.';
  const registerButton = count < MAX_POINTS && <button type="button" className={count >= MIN_POINTS ? styles.secondary : styles.primary} disabled={!canMark} onClick={collectCurrentHit}>{placing ? 'Segure parado…' : count >= MIN_POINTS ? `Conferir com o canto ${selectedPointIndex + 1}` : `Registrar canto ${selectedPointIndex + 1}`}</button>;

  return <main className={styles.page}>
    <header className={styles.header}><Link href={`/projects/${encodeURIComponent(project.id)}`} className={styles.back}>TestaFila <span>/ {project.name}</span></Link><p>WEBAR EXPERIMENTAL · ALINHAMENTO POR SESSÃO</p></header>
    <section className={styles.intro}><p>VISUALIZAÇÃO DA PLANTA EM ESCALA NOMINAL</p><h1>Alinhar no <em>espaço físico</em></h1><span>A origem e a geometria salvas não são modificadas. Cada sessão pede novo alinhamento.</span></section>
    <section className={styles.layout}>
      <div className={styles.viewport}><canvas ref={canvasRef} className={styles.canvas} aria-label="Visualização WebAR da fila" />{!sessionActive && <p className={styles.canvasHint}>A visualização da planta aparece após o alinhamento em uma sessão AR compatível.</p>}</div>
      <div ref={overlayRef} className={sessionActive ? styles.controlsActive : styles.controls}>
        {!sessionActive ? <>
          <section><h2>Disponibilidade</h2><p className={capability === 'supported' ? styles.ok : styles.muted}>{capabilityMessage}</p></section>
          <button type="button" className={styles.primary} disabled={capability !== 'supported' || !rendererReady || starting || candidates.length < 3} onClick={startSession}>{starting ? 'Iniciando sessão…' : 'Iniciar WebAR'}</button>
          <p className={styles.caution}>Use HTTPS e aparelho compatível. A visualização é experimental e não substitui medição com trena ou validação física.</p>
          {error && <p className={styles.error} role="alert">{error}</p>}
        </> : <>
          {/* Na sessão, este é o overlay em tela cheia e transparente: controles nas bordas, centro livre para a mira. */}
          <div className={styles.liveTop}>
            <h2>{heading}</h2>
            {count < MAX_POINTS && <svg className={styles.minimap} viewBox={`0 0 ${MINIMAP.width} ${MINIMAP.height}`} role="group" aria-label="Planta vista de cima. Toque num canto para escolher.">
              <polygon points={mapPoints.map((p) => `${p.x},${p.y}`).join(' ')} className={styles.minimapPlan} />
              {mapPoints.map((p, index) => {
                const point = candidates[index]; const done = used(point); const selected = index === selectedPointIndex && !done;
                return <g key={point.id} role="button" tabIndex={done ? -1 : 0} aria-label={`Canto ${index + 1}${done ? ', registrado' : selected ? ', escolhido' : ''}`} aria-pressed={selected}
                  className={done ? styles.cornerDone : selected ? styles.cornerSelected : styles.corner}
                  onClick={() => { if (!done) setSelectedPointIndex(index); }}
                  onKeyDown={(event) => { if (!done && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setSelectedPointIndex(index); } }}>
                  <circle cx={p.x} cy={p.y} r={16} className={styles.cornerHit} />
                  {selected && <circle cx={p.x} cy={p.y} r={13} className={styles.cornerHalo} />}
                  <circle cx={p.x} cy={p.y} r={9} />
                  <text x={p.x} y={p.y} dy="0.35em" textAnchor="middle">{done ? '✓' : index + 1}</text>
                </g>;
              })}
            </svg>}
            <p className={styles.muted}>{instruction}</p>
            <p className={tracking === 'surface' ? styles.ok : tracking === 'lost' ? styles.error : styles.muted} role="status" aria-live="polite">{statusText}</p>
            <p ref={guideRef} className={styles.metric} aria-hidden="true" />
          </div>
          <div className={styles.liveBottom}>
            {alignment && <p className={styles.metric}>Diferença de medida entre os 2 pontos: {alignment.fitDimensionErrorPercent.toFixed(1).replace('.', ',')}%{count >= MAX_POINTS && ` · canto de conferência a ${formatMeters(alignment.maxResidualMeters)} do previsto`}</p>}
            {error && <p className={styles.error} role="alert">{error}</p>}
            {count >= MIN_POINTS && !confirmed && <button type="button" className={styles.primary} onClick={confirmAlignment}>Confirmar alinhamento</button>}
            {registerButton}
            {count >= MIN_POINTS && <div className={styles.row}><button type="button" className={styles.secondary} onClick={() => rotate(-Math.PI / 36)}>Girar −5°</button><button type="button" className={styles.secondary} onClick={() => rotate(Math.PI / 36)}>Girar +5°</button></div>}
            <div className={styles.row}><button type="button" className={styles.secondary} onClick={resetAlignment}>Reiniciar alinhamento</button><button type="button" className={styles.secondary} onClick={() => xrSession.finish(true)}>Encerrar sessão</button></div>
          </div>
        </>}
      </div>
    </section>
  </main>;
}
