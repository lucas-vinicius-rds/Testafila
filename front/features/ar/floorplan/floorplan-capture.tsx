'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Environment } from '@testafila/core/contracts/project';
import type { XrPoint } from '../xr-check/xr-check-logic.ts';
import { useArCapability } from '../session/use-ar-capability.ts';
import { DomOverlayUnavailableError, createXrSessionController, type XrTracking } from '../session/xr-session.ts';
import { addCorner, canMarkCorner, closeFloorplan, closingWallMeters, floorDistanceMeters, formatMeters, MIN_CORNERS_TO_CLOSE, undoLastCorner, wallLengthsMeters } from './floorplan-capture-logic.ts';
import { createFloorplanScene, type FloorplanScene } from './floorplan-scene.ts';
import type { SessionToProject } from '@testafila/core/domain/measured-environment';
import styles from './floorplan-capture.module.css';

export type FloorplanCaptureResult = Readonly<{
  environment: Environment;
  /** Valid only for the session that just ended. Keep in memory; never save it. */
  sessionToProject: SessionToProject;
}>;

export type FloorplanCaptureProps = Readonly<{
  onComplete: (result: FloorplanCaptureResult) => void;
  onUseTypedMeasures: () => void;
  onCancel: () => void;
}>;

const UNAVAILABLE = 'A medição pela câmera não está disponível neste aparelho.';

const guidance: Record<XrTracking, string> = {
  inactive: '',
  searching: 'Aponte para o chão e mova o aparelho devagar.',
  surface: 'Chão encontrado. Leve o círculo até o canto e marque.',
  lost: 'O aparelho perdeu a referência do lugar. Marcação pausada: mova devagar até voltar.',
  hidden: 'A câmera está pausada. Volte para esta tela para continuar.',
};

function startFailureMessage(cause: unknown): string {
  if (cause instanceof DomOverlayUnavailableError) return 'Este aparelho abriu a câmera, mas não mostra os controles sobre a imagem. Sem eles não dá para medir aqui.';
  if (cause instanceof DOMException && cause.name === 'NotAllowedError') return 'A câmera não foi liberada. Aceite a permissão e tente de novo.';
  return 'Não foi possível abrir a medição pela câmera neste aparelho.';
}

export function FloorplanCapture({ onComplete, onUseTypedMeasures, onCancel }: FloorplanCaptureProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const liveWallRef = useRef<HTMLParagraphElement | null>(null);
  const sceneRef = useRef<FloorplanScene | null>(null);
  const cornersRef = useRef<readonly XrPoint[]>([]);
  const selectHandlerRef = useRef<() => void>(() => undefined);
  const endingOnPurposeRef = useRef(false);

  const capability = useArCapability();
  const [sceneReady, setSceneReady] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [tracking, setTracking] = useState<XrTracking>('inactive');
  const [corners, setCorners] = useState<readonly XrPoint[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [startFailure, setStartFailure] = useState<string | null>(null);

  const [xrSession] = useState(() => createXrSessionController({
    requireDomOverlay: true,
    getXr: () => navigator.xr,
    getRuntime: () => sceneRef.current,
    getOverlayRoot: () => overlayRef.current,
    onTrackingChange: setTracking,
    onActive: () => setSessionActive(true),
    onFinished: () => {
      // Corners are session coordinates: a new session cannot reuse them.
      const lostWork = !endingOnPurposeRef.current && cornersRef.current.length > 0;
      cornersRef.current = [];
      sceneRef.current?.setCorners([]);
      sceneRef.current?.setPreview(null, null);
      setCorners([]);
      setSessionActive(false);
      setNotice(lostWork ? 'A câmera foi encerrada e os cantos marcados se perderam. Comece de novo.' : null);
    },
    onSelect: () => selectHandlerRef.current(),
    onFrame: (hit) => {
      const last = cornersRef.current[cornersRef.current.length - 1] ?? null;
      sceneRef.current?.setPreview(last, hit);
      const text = last && hit ? `Parede atual: ${formatMeters(floorDistanceMeters(last, hit))}` : '';
      if (liveWallRef.current && liveWallRef.current.textContent !== text) liveWallRef.current.textContent = text;
    },
  }));

  // finish() runs onFinished synchronously, or not at all when no session is live,
  // so the flag must not outlive this call.
  const endOnPurpose = useCallback(() => {
    endingOnPurposeRef.current = true;
    xrSession.finish(true);
    endingOnPurposeRef.current = false;
  }, [xrSession]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let scene: FloorplanScene;
    try {
      scene = createFloorplanScene(canvas);
    } catch {
      setStartFailure(UNAVAILABLE);
      return;
    }
    sceneRef.current = scene;
    setSceneReady(true);
    return () => {
      endOnPurpose();
      sceneRef.current = null;
      scene.dispose();
    };
  }, [endOnPurpose]);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    // Taps on controls stay on the controls; taps on the open area mark a corner.
    const preventOnControls = (event: Event) => { if (event.target !== overlay) event.preventDefault(); };
    overlay.addEventListener('beforexrselect', preventOnControls);
    return () => overlay.removeEventListener('beforexrselect', preventOnControls);
  }, []);

  const applyCorners = useCallback((next: readonly XrPoint[]) => {
    cornersRef.current = next;
    sceneRef.current?.setCorners(next);
    setCorners(next);
  }, []);

  const markCorner = useCallback(() => {
    const hit = xrSession.currentHit();
    if (!hit || !canMarkCorner({ visible: xrSession.isVisible(), tracking: xrSession.tracking(), hit })) return;
    const result = addCorner(cornersRef.current, hit);
    if (result.added) applyCorners(result.corners);
    setNotice(result.added ? null : result.reason);
  }, [applyCorners, xrSession]);

  useEffect(() => { selectHandlerRef.current = markCorner; }, [markCorner]);

  const undo = useCallback(() => {
    applyCorners(undoLastCorner(cornersRef.current));
    setNotice(null);
  }, [applyCorners]);

  const closePlan = useCallback(() => {
    const result = closeFloorplan(cornersRef.current, new Date().toISOString());
    if (!result.valid) {
      setNotice('Estes cantos não formam uma planta: há paredes se cruzando ou sobrepostas. Desfaça o último canto e marque de novo.');
      return;
    }
    endOnPurpose();
    onComplete({ environment: result.environment, sessionToProject: result.sessionToProject });
  }, [endOnPurpose, onComplete]);

  const cancel = useCallback(() => {
    endOnPurpose();
    onCancel();
  }, [endOnPurpose, onCancel]);

  const start = useCallback(async () => {
    // start() calls requestSession synchronously, inside this click's user activation.
    const started = xrSession.start();
    setStarting(true);
    setNotice(null);
    setStartFailure(null);
    try {
      await started;
    } catch (cause) {
      setStartFailure(startFailureMessage(cause));
    } finally {
      setStarting(false);
    }
  }, [xrSession]);

  const checking = capability.status === 'checking';
  const available = capability.status === 'supported' && sceneReady;
  const unavailable = !checking && capability.status !== 'supported';
  const walls = wallLengthsMeters(corners);
  const closingWall = closingWallMeters(corners);
  const canMark = tracking === 'surface';
  const canClose = corners.length >= MIN_CORNERS_TO_CLOSE && tracking !== 'hidden';
  const failure = startFailure ?? (unavailable ? UNAVAILABLE : null);

  return (
    <section className={styles.capture} aria-label="Medir a planta com a câmera">
      <div className={styles.viewport} aria-hidden="true">
        <canvas ref={canvasRef} className={styles.canvas} />
      </div>
      <div ref={overlayRef} className={sessionActive ? styles.overlayActive : styles.overlay}>
        {sessionActive ? <>
          <div className={styles.topBar}>
            <div className={styles.heading}>
              <p className={styles.step}>Canto {corners.length + 1}</p>
              <button type="button" className={styles.quiet} onClick={cancel}>Cancelar</button>
            </div>
            <p className={tracking === 'lost' || tracking === 'hidden' ? styles.warning : styles.guidance} role="status" aria-live="polite">{guidance[tracking]}</p>
            <p ref={liveWallRef} className={styles.liveWall} aria-hidden="true" />
          </div>
          <div className={styles.panel}>
            {walls.length > 0 && <ul className={styles.walls} aria-label="Paredes marcadas">
              {closingWall !== null && <li className={styles.closing}><span>Ao fechar</span><span>{formatMeters(closingWall)}</span></li>}
              {walls.map((length, index) => ({ length, index })).reverse().map(({ length, index }) => <li key={index}><span>Parede {index + 1}</span><span>{formatMeters(length)}</span></li>)}
            </ul>}
            {notice && <p className={styles.error} role="alert">{notice}</p>}
            <button type="button" className={styles.primary} disabled={!canMark} onClick={markCorner}>Marcar canto</button>
            <div className={styles.row}>
              <button type="button" className={styles.secondary} disabled={corners.length === 0} onClick={undo}>Desfazer</button>
              <button type="button" className={styles.secondary} disabled={!canClose} onClick={closePlan}>Fechar planta</button>
            </div>
          </div>
        </> : <div className={styles.panel}>
          <h2 className={styles.title}>Medir com a câmera</h2>
          <p className={styles.guidance}>Ande pelo ambiente e marque cada canto no chão, na ordem. As medidas são aproximadas: confira com uma trena.</p>
          {notice && <p className={styles.error} role="alert">{notice}</p>}
          {failure && <p className={styles.error} role="alert">{failure}</p>}
          {failure
            ? <button type="button" className={styles.primary} onClick={onUseTypedMeasures}>Digitar medidas</button>
            : <button type="button" className={styles.primary} disabled={!available || starting} onClick={start}>{starting ? 'Abrindo a câmera…' : 'Começar a medir'}</button>}
          {startFailure && !unavailable && <button type="button" className={styles.secondary} onClick={start}>Tentar de novo</button>}
          <button type="button" className={styles.quiet} onClick={onCancel}>Cancelar</button>
        </div>}
      </div>
    </section>
  );
}
