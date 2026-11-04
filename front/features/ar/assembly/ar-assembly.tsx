'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProjectScene } from '@testafila/core/contracts/project';
import { sessionPointToProject } from '@testafila/core/domain/measured-environment';
import { canMarkCorner, closingWallMeters, floorDistanceMeters, formatMeters, MIN_CORNERS_TO_CLOSE, wallLengthsMeters } from '../floorplan/floorplan-capture-logic.ts';
import { useArCapability } from '../session/use-ar-capability.ts';
import { DomOverlayUnavailableError, createXrSessionController, type XrTracking } from '../session/xr-session.ts';
import { createAssemblyScene, type AssemblyScene } from './assembly-scene.ts';
import {
  appendPerson, ASSEMBLY_STEPS, canRedo, canReview, canUndo, closeArea, closePlan, createAssembly, currentDraft, currentScene, goToStep,
  hasPeople, hasWork, needsRealignment, PERSON_TURN_RADIANS, placeAtHit, postNear, realignTargets, redo, restartRealignment, sceneForReview,
  sessionEnded, setSpacing, SPACING_OPTIONS_METERS, turnQueue, undo, type AssemblyState, type AssemblyStep,
} from './assembly-state.ts';
import styles from './ar-assembly.module.css';

export type ArAssemblyProps = Readonly<{
  /** Omitted or null: starts by marking corners. With a plan: realigns and goes on from the areas. */
  initialScene?: ProjectScene | null;
  /** Finish or review in the editor. The session has already ended when this runs. */
  onComplete: (scene: ProjectScene) => void;
  /** The camera does not work on this device, or the user prefers to type. */
  onUseTypedMeasures: () => void;
  /** The user left. If there was work, they already confirmed discarding it. */
  onCancel: () => void;
}>;

const UNAVAILABLE = 'A medição pela câmera não está disponível neste aparelho.';

const stepNames: Record<AssemblyStep, string> = { corners: 'Cantos', areas: 'Áreas restritas', posts: 'Postes', belts: 'Fitas', people: 'Pessoas' };

const trackingProblem: Partial<Record<XrTracking, string>> = {
  lost: 'O aparelho perdeu a referência do lugar. Nada foi perdido: mova devagar até voltar.',
  hidden: 'A câmera está pausada. Volte para esta tela para continuar.',
};

function stepGuidance(state: AssemblyState): string {
  if (needsRealignment(state)) return `Encontre no chão o canto ${state.realignMarks.length + 1} da planta e marque.`;
  switch (state.step) {
    case 'corners': return 'Leve o círculo até um canto do ambiente e marque.';
    case 'areas': return 'Marque os cantos de uma área restrita, ou siga em frente.';
    case 'posts': return 'Leve o círculo até onde fica cada poste.';
    case 'belts': return state.beltStartPostId ? 'Agora aponte para o outro poste da fita.' : 'Aponte para o primeiro poste da fita.';
    case 'people': return hasPeople(state) ? 'Gire a fila e use +1 para aumentar.' : 'Leve o círculo até o início da fila.';
  }
}

function primaryLabel(state: AssemblyState): string {
  if (needsRealignment(state)) return `Marcar canto ${state.realignMarks.length + 1}`;
  switch (state.step) {
    case 'corners': return 'Marcar canto';
    case 'areas': return 'Marcar canto da área';
    case 'posts': return 'Colocar poste';
    case 'belts': return 'Escolher poste';
    case 'people': return hasPeople(state) ? '+1 pessoa' : 'Colocar primeira pessoa';
  }
}

function counted(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function sceneSummary(scene: ProjectScene | null): string {
  if (!scene) return '';
  return [
    counted(scene.restrictedAreas.length, 'área', 'áreas'),
    counted(scene.posts.length, 'poste', 'postes'),
    counted(scene.belts.length, 'fita', 'fitas'),
    counted(scene.people.length, 'pessoa', 'pessoas'),
  ].join(' · ');
}

function startFailureMessage(cause: unknown): string {
  if (cause instanceof DomOverlayUnavailableError) return 'Este aparelho abriu a câmera, mas não mostra os controles sobre a imagem. Sem eles não dá para medir aqui.';
  if (cause instanceof DOMException && cause.name === 'NotAllowedError') return 'A câmera não foi liberada. Aceite a permissão e tente de novo.';
  return 'Não foi possível abrir a câmera neste aparelho.';
}

const createId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

export function ArAssembly({ initialScene, onComplete, onUseTypedMeasures, onCancel }: ArAssemblyProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const liveMeasureRef = useRef<HTMLParagraphElement | null>(null);
  const sceneRef = useRef<AssemblyScene | null>(null);
  const selectHandlerRef = useRef<() => void>(() => undefined);
  const aimedPostRef = useRef<string | null>(null);
  const exitOpenRef = useRef(false);
  const planChoiceRef = useRef(false);

  const capability = useArCapability();
  const [state, setState] = useState(() => createAssembly(initialScene));
  const stateRef = useRef(state);
  const [sceneReady, setSceneReady] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [tracking, setTracking] = useState<XrTracking>('inactive');
  const [exitOpen, setExitOpen] = useState(false);
  const [startFailure, setStartFailure] = useState<string | null>(null);
  const [planChoice, setPlanChoice] = useState(false);

  const drawState = useCallback((next: AssemblyState) => {
    const highlightedPostIds = next.beltStartPostId ? [next.beltStartPostId] : [];
    sceneRef.current?.sync({ scene: currentScene(next), draft: currentDraft(next), highlightedPostIds }, next.alignment);
  }, []);

  const commit = useCallback((next: AssemblyState) => {
    stateRef.current = next;
    setState(next);
    drawState(next);
  }, [drawState]);

  const showExit = useCallback((open: boolean) => {
    exitOpenRef.current = open;
    setExitOpen(open);
  }, []);

  const showPlanChoice = useCallback((open: boolean) => {
    planChoiceRef.current = open;
    setPlanChoice(open);
  }, []);

  const [xrSession] = useState(() => createXrSessionController({
    requireDomOverlay: true,
    getXr: () => navigator.xr,
    getRuntime: () => sceneRef.current,
    getOverlayRoot: () => overlayRef.current,
    onTrackingChange: setTracking,
    onActive: () => setSessionActive(true),
    onFinished: () => {
      // Only what belongs to the session goes away; the work stays for Continuar.
      commit(sessionEnded(stateRef.current));
      sceneRef.current?.setPreview(null, null);
      showPlanChoice(false);
      setSessionActive(false);
    },
    onSelect: () => selectHandlerRef.current(),
    onFrame: (hit) => {
      const current = stateRef.current;
      const projectHit = hit && current.alignment ? sessionPointToProject(hit, current.alignment.transform) : null;
      const draft = currentDraft(current);
      const last = draft[draft.length - 1] ?? null;
      sceneRef.current?.setPreview(last, projectHit);

      const text = last && projectHit ? `Parede atual: ${formatMeters(floorDistanceMeters(last, projectHit))}` : '';
      if (liveMeasureRef.current && liveMeasureRef.current.textContent !== text) liveMeasureRef.current.textContent = text;

      const aimed = current.step === 'belts' && projectHit ? postNear(current, projectHit) : null;
      if (aimed !== aimedPostRef.current) {
        aimedPostRef.current = aimed;
        sceneRef.current?.highlightPosts([current.beltStartPostId, aimed].filter((id): id is string => id !== null));
      }
    },
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let scene: AssemblyScene;
    try {
      scene = createAssemblyScene(canvas);
    } catch {
      setStartFailure(UNAVAILABLE);
      return;
    }
    sceneRef.current = scene;
    drawState(stateRef.current);
    setSceneReady(true);
    return () => {
      xrSession.finish(true);
      sceneRef.current = null;
      scene.dispose();
    };
  }, [drawState, xrSession]);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    // Taps on controls stay on the controls; taps on the open area act on the floor.
    const preventOnControls = (event: Event) => { if (event.target !== overlay) event.preventDefault(); };
    overlay.addEventListener('beforexrselect', preventOnControls);
    return () => overlay.removeEventListener('beforexrselect', preventOnControls);
  }, []);

  const placeHere = useCallback(() => {
    const hit = xrSession.currentHit();
    if (exitOpenRef.current || planChoiceRef.current || !hit || !canMarkCorner({ visible: xrSession.isVisible(), tracking: xrSession.tracking(), hit })) return;
    commit(placeAtHit(stateRef.current, hit, createId));
  }, [commit, xrSession]);

  useEffect(() => { selectHandlerRef.current = placeHere; }, [placeHere]);

  const start = useCallback(async () => {
    // start() calls requestSession synchronously, inside this click's user activation.
    const started = xrSession.start();
    setStarting(true);
    setStartFailure(null);
    showExit(false);
    try {
      await started;
    } catch (cause) {
      setStartFailure(startFailureMessage(cause));
    } finally {
      setStarting(false);
    }
  }, [showExit, xrSession]);

  const finishAndReview = useCallback(() => {
    const review = sceneForReview(stateRef.current, new Date().toISOString());
    commit(review.state);
    if (!review.scene) {
      showExit(false);
      return;
    }
    xrSession.finish(true);
    onComplete(review.scene);
  }, [commit, onComplete, showExit, xrSession]);

  const closeAndChoose = useCallback(() => {
    const next = closePlan(stateRef.current, new Date().toISOString());
    commit(next);
    if (next.history) showPlanChoice(true);
  }, [commit, showPlanChoice]);

  const discard = useCallback(() => {
    xrSession.finish(true);
    onCancel();
  }, [onCancel, xrSession]);

  const requestExit = useCallback(() => {
    if (hasWork(stateRef.current)) showExit(true);
    else discard();
  }, [discard, showExit]);

  const realign = useCallback(() => {
    commit(restartRealignment(stateRef.current));
    showExit(false);
  }, [commit, showExit]);

  const scene = currentScene(state);
  const realigning = needsRealignment(state);
  const draft = currentDraft(state);
  const stepIndex = ASSEMBLY_STEPS.indexOf(state.step);
  const previousStep = stepIndex > 1 ? ASSEMBLY_STEPS[stepIndex - 1] : null;
  const nextStep = ASSEMBLY_STEPS[stepIndex + 1] ?? null;
  const appending = state.step === 'people' && hasPeople(state) && !realigning;
  const suspended = tracking === 'lost' || tracking === 'hidden';
  const canPlace = appending ? !suspended : tracking === 'surface';
  const walls = wallLengthsMeters(draft);
  const closingWall = closingWallMeters(draft);
  const unavailable = capability.status !== 'checking' && capability.status !== 'supported';
  const work = hasWork(state);
  const spacing = scene?.simulation.spacingMeters;
  const failure = startFailure ?? (unavailable ? UNAVAILABLE : null);

  const exitPanel = <div className={styles.panel}>
    <h2 className={styles.title}>Sair sem terminar?</h2>
    <p className={styles.guidance}>{canReview(state) ? 'Você pode revisar no editor o que já montou.' : 'Com menos de três cantos ainda não há planta para revisar.'}</p>
    {state.areaDraft.length > 0 && <p className={styles.guidance}>A área que não foi fechada não entra na revisão.</p>}
    <button type="button" className={styles.primary} onClick={() => showExit(false)}>Continuar montando</button>
    {canReview(state) && <button type="button" className={styles.secondary} onClick={finishAndReview}>Revisar no editor</button>}
    {sessionActive && realignTargets(state).length > 0 && <button type="button" className={styles.secondary} onClick={realign}>Refazer o alinhamento</button>}
    <button type="button" className={styles.danger} onClick={discard}>Descartar e sair</button>
  </div>;

  const livePanels = <>
    <div className={styles.topBar}>
      <div className={styles.heading}>
        <p className={styles.step}>{realigning ? 'Alinhar de novo' : `Etapa ${stepIndex + 1} de ${ASSEMBLY_STEPS.length} · ${stepNames[state.step]}`}</p>
        <button type="button" className={styles.quiet} onClick={requestExit}>Sair</button>
      </div>
      <p className={suspended ? styles.warning : styles.guidance} role="status" aria-live="polite">{trackingProblem[tracking] ?? stepGuidance(state)}</p>
      <p ref={liveMeasureRef} className={styles.liveMeasure} aria-hidden="true" />
      {state.realignDifferenceMeters !== null && !realigning && <p className={styles.guidance}>Diferença entre a planta e o chão: {formatMeters(Math.abs(state.realignDifferenceMeters))}</p>}
    </div>
    <div className={styles.panel}>
      {!realigning && (walls.length > 0
        ? <ul className={styles.walls} aria-label="Paredes marcadas">
          {closingWall !== null && <li className={styles.muted}><span>Ao fechar</span><span>{formatMeters(closingWall)}</span></li>}
          {walls.map((length, index) => ({ length, index })).reverse().map(({ length, index }) => <li key={index}><span>Parede {index + 1}</span><span>{formatMeters(length)}</span></li>)}
        </ul>
        : scene && <p className={styles.summary}>{sceneSummary(scene)}</p>)}
      {state.rejection && <p className={styles.error} role="alert">{state.rejection}</p>}
      {appending && <div className={styles.tools}>
        <button type="button" className={styles.tool} aria-label="Girar a fila 15 graus para um lado" onClick={() => commit(turnQueue(stateRef.current, -PERSON_TURN_RADIANS))}>−15°</button>
        <button type="button" className={styles.tool} aria-label="Girar a fila 15 graus para o outro lado" onClick={() => commit(turnQueue(stateRef.current, PERSON_TURN_RADIANS))}>+15°</button>
        {SPACING_OPTIONS_METERS.map((option) => <button key={option} type="button" className={option === spacing ? styles.toolActive : styles.tool} aria-pressed={option === spacing} aria-label={`Espaçamento de ${formatMeters(option)}`} onClick={() => commit(setSpacing(stateRef.current, option))}>{String(option).replace('.', ',')}</button>)}
      </div>}
      <button type="button" className={styles.primary} disabled={!canPlace} onClick={appending ? () => commit(appendPerson(stateRef.current, createId)) : placeHere}>{primaryLabel(state)}</button>
      {!realigning && <>
        <div className={styles.row}>
          <button type="button" className={styles.secondary} disabled={!canUndo(state)} onClick={() => commit(undo(stateRef.current))}>Desfazer</button>
          <button type="button" className={styles.secondary} disabled={!canRedo(state)} onClick={() => commit(redo(stateRef.current))}>Refazer</button>
        </div>
        <div className={styles.row}>
          {state.step === 'corners'
            ? <button type="button" className={styles.wide} disabled={state.corners.length < MIN_CORNERS_TO_CLOSE} onClick={closeAndChoose}>Fechar planta</button>
            : state.step === 'areas'
              ? <button type="button" className={styles.secondary} disabled={state.areaDraft.length < MIN_CORNERS_TO_CLOSE} onClick={() => commit(closeArea(stateRef.current, createId))}>Fechar área</button>
              : previousStep && <button type="button" className={styles.secondary} onClick={() => commit(goToStep(stateRef.current, previousStep))}>Voltar</button>}
          {state.step !== 'corners' && (nextStep
            ? <button type="button" className={styles.secondary} onClick={() => commit(goToStep(stateRef.current, nextStep))}>Próxima</button>
            : <button type="button" className={styles.primary} onClick={finishAndReview}>Concluir</button>)}
        </div>
      </>}
    </div>
  </>;

  const choicePanels = <>
    <div className={styles.topBar}>
      <div className={styles.heading}>
        <p className={styles.step}>Planta medida</p>
        <button type="button" className={styles.quiet} onClick={requestExit}>Sair</button>
      </div>
    </div>
    <div className={styles.panel}>
      <h2 className={styles.title}>Como quer montar a fila?</h2>
      {scene && <p className={styles.summary}>{sceneSummary(scene)}</p>}
      <div className={styles.row}>
        <button type="button" className={styles.choice} onClick={() => showPlanChoice(false)}>Montar na câmera</button>
        <button type="button" className={styles.choice} onClick={finishAndReview}>Montar no 3D</button>
      </div>
    </div>
  </>;

  const recoveryPanel = <div className={styles.panel}>
    <h2 className={styles.title}>Seu trabalho está guardado</h2>
    <p className={styles.guidance}>{realignTargets(state).length > 1 ? 'A câmera está fechada. Para continuar, marque de novo dois cantos da planta.' : 'A câmera está fechada. Para continuar, marque de novo o primeiro canto.'}</p>
    {scene && <p className={styles.summary}>{sceneSummary(scene)}</p>}
    {!scene && state.corners.length > 0 && <p className={styles.summary}>{counted(state.corners.length, 'canto marcado', 'cantos marcados')}</p>}
    {state.rejection && <p className={styles.error} role="alert">{state.rejection}</p>}
    {failure && <p className={styles.error} role="alert">{failure}</p>}
    {!unavailable && <button type="button" className={styles.primary} disabled={!sceneReady || starting} onClick={start}>{starting ? 'Abrindo a câmera…' : 'Continuar'}</button>}
    {canReview(state) && <button type="button" className={styles.secondary} onClick={finishAndReview}>Revisar no editor</button>}
    <button type="button" className={styles.quiet} onClick={requestExit}>Sair</button>
  </div>;

  const introPanel = <div className={styles.panel}>
    <h2 className={styles.title}>Medir com a câmera</h2>
    <p className={styles.guidance}>Ande pelo ambiente e marque cada canto no chão, na ordem. As medidas são aproximadas: confira com uma trena.</p>
    {failure && <p className={styles.error} role="alert">{failure}</p>}
    {failure
      ? <button type="button" className={styles.primary} onClick={onUseTypedMeasures}>Digitar medidas</button>
      : <button type="button" className={styles.primary} disabled={capability.status !== 'supported' || !sceneReady || starting} onClick={start}>{starting ? 'Abrindo a câmera…' : 'Começar a medir'}</button>}
    {startFailure && !unavailable && <button type="button" className={styles.secondary} onClick={start}>Tentar de novo</button>}
    {!failure && <button type="button" className={styles.quiet} onClick={onUseTypedMeasures}>Digitar medidas</button>}
    <button type="button" className={styles.quiet} onClick={onCancel}>Cancelar</button>
  </div>;

  return (
    <section className={styles.assembly} aria-label="Montar a fila com a câmera">
      <div className={styles.viewport} aria-hidden="true">
        <canvas ref={canvasRef} className={styles.canvas} />
      </div>
      <div ref={overlayRef} className={sessionActive && !exitOpen ? styles.overlayActive : styles.overlay}>
        {exitOpen ? exitPanel : sessionActive ? (planChoice ? choicePanels : livePanels) : work ? recoveryPanel : introPanel}
      </div>
    </section>
  );
}
