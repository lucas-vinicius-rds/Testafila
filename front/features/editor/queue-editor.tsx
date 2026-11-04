"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Belt, PointXZ, ProjectScene, PersonPlacement, RestrictedArea, Stanchion, Vertex } from "@testafila/core/contracts/project";
import type { EditorSelection, QueueCommand, QueueHistory } from "@testafila/core/contracts/queue-editor";
import type {
  CameraActionType,
  CanvasTool,
  FloorProjector,
  GridStepMeters,
  InteractionMode,
  AreaWallDistances
} from "@testafila/core/contracts/scene-viewer";
import {
  createQueueHistory,
  executeQueueCommand,
  getChainPeople,
  getQueueMode,
  getQueueStats,
  redoQueue,
  undoQueue,
  validateQueueScene
} from "@testafila/core/domain/queue";
import { queueErrorsForUser } from "./queue-errors";
import { ScenePreview } from "./scene-preview";
import { UndoRedoBar } from "./undo-redo-bar";
import { ItemThumbnail } from "./item-thumbnail";
import { AreaInspector, BeltInspector, PersonInspector, PostInspector, RouteInspector } from "./selection-inspector";
import { defaultEditorPreferences, readEditorPreferences, saveEditorPreferences } from "../../shared/editor-preferences";
import { Check, Compass, HandPointing } from "@phosphor-icons/react/dist/ssr";

type EditorMode = "create" | "edit";
type Props = {
  initialScene: ProjectScene;
  mode: EditorMode;
  onSceneChange: (scene: ProjectScene) => void;
  onBack?: () => void;
  onContinue?: (scene: ProjectScene) => void;
  onSave?: (scene: ProjectScene) => void | Promise<void>;
};
type AreaDraft = { start: PointXZ; end: PointXZ };

const selectionLabels: Record<EditorSelection["kind"], string> = { post: "Poste", person: "Pessoa", belt: "Fita", area: "Área restrita", route: "Percurso" };

function newId(prefix: string): string { return `${prefix}-${crypto.randomUUID()}`; }
function formatMeters(value: number): string { return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value); }
function makeAreaVertices(start: PointXZ, end: PointXZ): Vertex[] {
  const minX = Math.min(start.x, end.x); const maxX = Math.max(start.x, end.x);
  const minZ = Math.min(start.z, end.z); const maxZ = Math.max(start.z, end.z);
  return [
    { id: newId("vertex"), x: minX, z: minZ }, { id: newId("vertex"), x: maxX, z: minZ },
    { id: newId("vertex"), x: maxX, z: maxZ }, { id: newId("vertex"), x: minX, z: maxZ },
  ];
}

export function QueueEditor({ initialScene, mode, onSceneChange, onBack, onContinue, onSave }: Props) {
  const [history, setHistory] = useState<QueueHistory>(() => createQueueHistory(initialScene));
  const [tool, setTool] = useState<CanvasTool>("post");
  const [interactionMode, setInteractionMode] = useState<InteractionMode>(defaultEditorPreferences.navigationMode);
  const [gridStep, setGridStep] = useState<GridStepMeters>(defaultEditorPreferences.gridStep);
  const [compactLayout, setCompactLayout] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [view, setView] = useState<"top" | "perspective">("top");
  const [selection, setSelection] = useState<EditorSelection | null>(null);
  const [pendingBelt, setPendingBelt] = useState<{ fromPostId: string; toPostId?: string } | null>(null);
  const [areaDraft, setAreaDraft] = useState<AreaDraft | null>(null);
  const [areaName, setAreaName] = useState("Área restrita");
  const [areaDistances, setAreaDistances] = useState<AreaWallDistances | null>(null);
  const [projector, setProjector] = useState<FloorProjector | null>(null);
  const [placementPreview, setPlacementPreview] = useState<{ kind: "post" | "person"; point: PointXZ } | null>(null);
  const [moveSelectedMode, setMoveSelectedMode] = useState(false);
  const [cameraAction, setCameraAction] = useState<{ id: number; type: CameraActionType }>();
  const cameraActionId = useRef(0);
  const lastAppendAt = useRef(0);
  const palettePointer = useRef<{ pointerId: number; kind: "post" | "person"; x: number; y: number; moved: boolean } | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const scene = history.present;
  const validation = useMemo(() => validateQueueScene(scene), [scene]);
  const stats = useMemo(() => getQueueStats(scene), [scene]);
  const queueMode = useMemo(() => getQueueMode(scene), [scene]);
  const lastPersonId = useMemo(() => getChainPeople(scene).at(-1)?.id ?? null, [scene]);
  const selectedPost = selection?.kind === "post" ? scene.posts.find((post) => post.id === selection.id) : undefined;
  const selectedPerson = selection?.kind === "person" ? scene.people.find((person) => person.id === selection.id) : undefined;
  const selectedArea = selection?.kind === "area" ? scene.restrictedAreas.find((area) => area.id === selection.id) : undefined;
  const selectedBelt = selection?.kind === "belt" ? scene.belts.find((belt) => belt.id === selection.id) : undefined;
  const showInspector = !compactLayout || inspectorOpen;

  useEffect(() => {
    const query = window.matchMedia("(max-width: 760px)");
    const update = () => setCompactLayout(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  // Lido depois da montagem para o HTML do servidor e o do cliente coincidirem.
  useEffect(() => {
    const preferences = readEditorPreferences();
    setGridStep(preferences.gridStep);
    setInteractionMode(preferences.navigationMode);
  }, []);

  useEffect(() => {
    if (tool !== "belt") setPendingBelt(null);
  }, [tool]);

  useEffect(() => {
    setMoveSelectedMode(false);
  }, [selection]);

  const run = useCallback((command: QueueCommand, successText?: string): boolean => {
    const result = executeQueueCommand(history, command);
    if (!result.valid) {
      setError(queueErrorsForUser(result.errors, "Não foi possível aplicar essa alteração. Confira o espaço livre e tente novamente.").join(" "));
      setMessage("");
      return false;
    }
    if (result.history.present === history.present) {
      setError("A alteração não mudou a planta.");
      setMessage("");
      return false;
    }
    setHistory(result.history);
    setError("");
    setMessage(successText ?? "Alteração aplicada.");
    onSceneChange(result.history.present);
    return true;
  }, [history, onSceneChange]);

  const placePost = useCallback((point: PointXZ) => {
    const post: Stanchion = { id: newId("post"), position: point, heightMeters: 0.95, baseRadiusMeters: 0.08 };
    if (run({ type: "post:add", post }, "Poste adicionado.")) {
      setSelection({ kind: "post", id: post.id });
      setInspectorOpen(true);
    }
  }, [run]);

  const placePerson = useCallback((point: PointXZ) => {
    if (scene.people.length > 0) return;
    const person: PersonPlacement = {
      id: newId("person"),
      routeId: null,
      distanceAlongRouteMeters: null,
      position: point,
      yawRadians: 0,
    };
    if (run({ type: "person:add", person }, "Início da fila definido. Gire se precisar e use +1.")) {
      setSelection({ kind: "person", id: person.id });
      setInspectorOpen(true);
      setTool("select");
    }
  }, [run, scene.people.length]);

  const handleFloorPoint = useCallback((point: PointXZ) => {
    if (interactionMode === "navigate") return;

    if (moveSelectedMode && selection) {
      if (selectedPost) run({ type: "post:move", id: selectedPost.id, position: point }, "Poste movido.");
      else if (selectedPerson) run({ type: "person:move", id: selectedPerson.id, position: point }, "Pessoa movida.");
      else if (selectedArea) {
        const count = selectedArea.vertices.length;
        const delta = {
          x: point.x - selectedArea.vertices.reduce((sum, vertex) => sum + vertex.x, 0) / count,
          z: point.z - selectedArea.vertices.reduce((sum, vertex) => sum + vertex.z, 0) / count,
        };
        run({ type: "area:move", id: selectedArea.id, delta }, "Área movida.");
      }
      setMoveSelectedMode(false);
      setSelection(selection); // o toque no piso desmarca; mover mantém o item em foco
      return;
    }
    if (tool === "post") placePost(point);
    else if (tool === "person") placePerson(point);
  }, [interactionMode, moveSelectedMode, placePerson, placePost, run, selectedArea, selectedPerson, selectedPost, selection, tool]);

  const handleSelect = useCallback((next: EditorSelection | null) => {
    setSelection(next);
    if (next) setInspectorOpen(true);
    if (tool === "belt" && next?.kind === "post") {
      if (!pendingBelt) {
        setPendingBelt({ fromPostId: next.id });
        setMessage("Primeiro poste selecionado. Toque no segundo poste.");
      } else if (!pendingBelt.toPostId && pendingBelt.fromPostId !== next.id) {
        setPendingBelt({ ...pendingBelt, toPostId: next.id });
        setMessage("Dois postes selecionados. Conecte ou cancele.");
      } else if (pendingBelt.fromPostId === next.id) {
        setPendingBelt(null);
        setMessage("Seleção cancelada.");
      } else {
        setPendingBelt({ fromPostId: next.id });
        setMessage("Par reiniciado. Toque no segundo poste.");
      }
    }
    setError("");
  }, [pendingBelt, tool]);

  const handleMove = useCallback((entity: EditorSelection, delta: PointXZ) => {
    if (entity.kind === "post") {
      const item = scene.posts.find((post) => post.id === entity.id);
      if (item) run({ type: "post:move", id: item.id, position: { x: item.position.x + delta.x, z: item.position.z + delta.z } }, "Poste movido.");
      return;
    }
    if (entity.kind === "person") {
      const item = scene.people.find((person) => person.id === entity.id);
      if (item) run({ type: "person:move", id: item.id, position: { x: item.position.x + delta.x, z: item.position.z + delta.z } }, "Pessoa movida.");
      return;
    }
    if (entity.kind === "area") {
      run({ type: "area:move", id: entity.id, delta }, "Área movida.");
    }
  }, [run, scene]);

  const registerProjector = useCallback((next: FloorProjector | null) => setProjector(() => next), []);
  const onAreaDraw = useCallback((start: PointXZ, end: PointXZ) => {
    setAreaDraft({ start, end });
    setTool("area");
    setInspectorOpen(true);
    setError("");
  }, []);

  const areaPreview = useMemo(() => areaDraft ? [
    { x: areaDraft.start.x, z: areaDraft.start.z }, { x: areaDraft.end.x, z: areaDraft.start.z },
    { x: areaDraft.end.x, z: areaDraft.end.z }, { x: areaDraft.start.x, z: areaDraft.end.z },
  ] : null, [areaDraft]);

  function confirmArea() {
    if (!areaDraft) return;
    const area: RestrictedArea = { id: newId("area"), name: areaName.trim() || "Área restrita", vertices: makeAreaVertices(areaDraft.start, areaDraft.end) };
    if (run({ type: "area:add", area }, "Área adicionada.")) {
      setAreaDraft(null);
      setAreaName("Área restrita");
    }
  }

  function connectBelt() {
    if (!pendingBelt?.toPostId) return;
    const belt: Belt = { id: newId("belt"), fromPostId: pendingBelt.fromPostId, toPostId: pendingBelt.toPostId, heightMeters: 0.86 };
    if (run({ type: "belt:add", belt }, "Fita conectada.")) setPendingBelt(null);
  }

  function appendPerson() {
    const now = performance.now();
    if (now - lastAppendAt.current < 350) return;
    lastAppendAt.current = now;
    const id = newId("person");
    if (run({ type: "person:append", id }, "Pessoa adicionada ao fim da fila.")) {
      setSelection({ kind: "person", id });
      setInspectorOpen(true);
    }
  }

  function convertLegacyQueue() {
    setInspectorOpen(true);
    run({ type: "queue:convert-legacy" }, "Pessoas ligadas em fila. Use desfazer para voltar.");
  }

  function handlePerimeterVertexMove(id: string, position: PointXZ) {
    run({ type: "environment:vertex-move", id, position }, "Canto ajustado. Confirme a planta antes de salvar.");
  }

  function confirmEnvironment() {
    run({ type: "environment:confirm", confirmedAt: new Date().toISOString() }, "Planta confirmada.");
  }

  function sendCameraAction(type: CameraActionType) {
    cameraActionId.current += 1;
    setCameraAction({ id: cameraActionId.current, type });
  }

  function onPalettePointerDown(event: ReactPointerEvent<HTMLButtonElement>, kind: "post" | "person") {
    setTool(kind);
    setInteractionMode("edit");
    palettePointer.current = { pointerId: event.pointerId, kind, x: event.clientX, y: event.clientY, moved: false };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* pointer fallback */ }
  }

  function onPalettePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const active = palettePointer.current;
    if (!active || active.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - active.x, event.clientY - active.y) > 8) active.moved = true;
    if (active.moved) setPlacementPreview(projector?.(event.clientX, event.clientY) ? { kind: active.kind, point: projector(event.clientX, event.clientY)! } : null);
  }

  function onPalettePointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    const active = palettePointer.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const point = active.moved ? projector?.(event.clientX, event.clientY) ?? null : null;
    palettePointer.current = null;
    setPlacementPreview(null);
    if (point) {
      if (active.kind === "post") placePost(point);
      else placePerson(point);
    } else {
      setTool(active.kind);
    }
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* pointer fallback */ }
  }

  function cancelPalettePointer(event: ReactPointerEvent<HTMLButtonElement>) {
    if (palettePointer.current?.pointerId !== event.pointerId) return;
    palettePointer.current = null;
    setPlacementPreview(null);
  }

  function undo() {
    if (history.past.length) {
      const next = undoQueue(history);
      setHistory(next);
      onSceneChange(next.present);
      setSelection(null);
      setError("");
      setMessage("Última alteração desfeita.");
    }
  }

  function redo() {
    if (history.future.length) {
      const next = redoQueue(history);
      setHistory(next);
      onSceneChange(next.present);
      setSelection(null);
      setError("");
      setMessage("Alteração refeita.");
    }
  }

  function removeSelection() {
    if (!selection) return;
    if (selection.kind === "post") run({ type: "post:remove", id: selection.id }, "Poste removido junto com as fitas conectadas.");
    else if (selection.kind === "person") run({ type: "person:remove", id: selection.id }, "Pessoa removida.");
    else if (selection.kind === "belt") run({ type: "belt:remove", id: selection.id }, "Fita removida.");
    else if (selection.kind === "area") run({ type: "area:remove", id: selection.id }, "Área removida.");
    else if (selection.kind === "route") run({ type: "route:remove", id: selection.id }, "Percurso removido.");
    setSelection(null);
  }

  function updateSpacing(value: string) {
    const spacingMeters = Number(value);
    if (spacingMeters === scene.simulation.spacingMeters) return;
    run({ type: "simulation:spacing", spacingMeters }, "Espaçamento atualizado na fila inteira.");
  }

  async function continueOrSave() {
    if (!scene.environment.confirmedAt) {
      setError("Ajuste e confirme a planta antes de continuar.");
      setTool("perimeter");
      return;
    }
    if (!validation.valid) {
      setError(queueErrorsForUser(validation.errors, "Revise os itens destacados antes de continuar.").join(" "));
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (mode === "edit") await onSave?.(scene);
      else onContinue?.(scene);
    } finally {
      setSaving(false);
    }
  }

  const sceneElement = (
    <div className="scene-frame-container" style={{ position: "relative", width: "100%", height: "100%" }}>
      <ScenePreview
        scene={scene}
        view={view}
        selection={selection}
        interactionMode={interactionMode}
        gridStep={gridStep}
        onSelectEntity={handleSelect}
        onMoveEntity={handleMove}
        onFloorPoint={handleFloorPoint}
        // Com Mover ativo, o piso precisa aceitar o toque em qualquer ferramenta.
        tool={moveSelectedMode ? "post" : tool}
        cameraAction={cameraAction}
        onRegisterFloorProjector={registerProjector}
        placementPreview={placementPreview}
        draftArea={areaPreview}
        draftBelt={pendingBelt?.toPostId ? { fromPostId: pendingBelt.fromPostId, toPostId: pendingBelt.toPostId } : null}
        onAreaDraw={onAreaDraw}
        onMovePerimeterVertex={handlePerimeterVertexMove}
        onAreaDistancesChange={setAreaDistances}
        onAppendPerson={selectedPerson?.id === lastPersonId && lastPersonId !== null ? appendPerson : undefined}
        showWalls={false}
      />
      <UndoRedoBar
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        changeCount={history.past.length}
        onUndo={undo}
        onRedo={redo}
      />
    </div>
  );

  return (
    <section className="queue-editor visual-queue-editor" aria-label="Editor visual da fila">
      <div className="queue-workspace">
        <div className="queue-canvas-column">
          <div className="queue-canvas-toolbar">
            <div className="view-switch" role="group" aria-label="Ângulo da visualização">
              <button
                type="button"
                className={view === "top" ? "selected" : ""}
                onClick={() => setView("top")}
              >
                Planta
              </button>
              <button
                type="button"
                className={view === "perspective" ? "selected" : ""}
                onClick={() => setView("perspective")}
              >
                Perspectiva
              </button>
            </div>

            <div className="interaction-switch" role="group" aria-label="Modo de interação">
              <button
                type="button"
                className={interactionMode === "navigate" ? "selected" : ""}
                onClick={() => setInteractionMode("navigate")}
                title="Modo Navegar: mover e girar câmera sem arrastar objetos"
              >
                <Compass size={16} weight="bold" aria-hidden="true" />
                <span>Navegar</span>
              </button>
              <button
                type="button"
                className={interactionMode === "edit" ? "selected" : ""}
                onClick={() => setInteractionMode("edit")}
                title="Modo Editar: selecionar, posicionar e arrastar objetos"
              >
                <HandPointing size={16} weight="bold" aria-hidden="true" />
                <span>Editar</span>
              </button>
            </div>

            <div className="grid-selector">
              <label htmlFor="grid-step-select" className="sr-only">Grade</label>
              <select
                id="grid-step-select"
                value={gridStep === null ? "off" : String(gridStep)}
                onChange={(e) => {
                  const next = e.target.value === "off" ? null : (Number(e.target.value) as GridStepMeters);
                  setGridStep(next);
                  saveEditorPreferences({ gridStep: next });
                }}
                title="Passo da grade métrica"
              >
                <option value="0.1">Grade 0,10 m</option>
                <option value="0.25">Grade 0,25 m</option>
                <option value="0.5">Grade 0,50 m</option>
                <option value="1">Grade 1,00 m</option>
                <option value="off">Sem grade</option>
              </select>
            </div>

            {/* Indicador textual discreto — sem botão, borda ou fundo clicável */}
            <span
              className={validation.valid ? "status-indicator-valid" : "status-indicator-invalid"}
              role="status"
            >
              {validation.valid ? "• Pronta para salvar" : "• Revise a planta"}
            </span>
          </div>

          <div className="camera-quick-tools" role="toolbar" aria-label="Controles da câmera">
            <span>Câmera</span>
            {([
              ["rotate-left", "↶", "Girar à esquerda"],
              ["rotate-right", "↷", "Girar à direita"],
              ["tilt-up", "↑", "Inclinar para cima"],
              ["tilt-down", "↓", "Inclinar para baixo"],
              ["zoom-in", "+", "Aproximar"],
              ["zoom-out", "−", "Afastar"],
              ["pan-left", "←", "Mover à esquerda"],
              ["pan-right", "→", "Mover à direita"],
              ["center-bounds", "⌖", "Recentrar planta"],
              ["center-selection", "◎", "Focar seleção"],
              ["reset", "↺", "Repor vista"],
            ] as const).map(([action, icon, label]) => (
              <button
                key={action}
                type="button"
                title={label}
                aria-label={label}
                onClick={() => sendCameraAction(action)}
              >
                <span aria-hidden="true">{icon}</span>
                <small>{label.split(" ")[0]}</small>
              </button>
            ))}
          </div>

          {sceneElement}

          <div className="queue-canvas-foot">
            <span>{stats.peopleCount === 1 ? "1 pessoa" : `${formatMeters(stats.peopleCount)} pessoas`}</span>
            {scene.routes.length > 0 && <span>{formatMeters(stats.routeLengthMeters)} m em percursos</span>}
            <span>{scene.restrictedAreas.length} áreas</span>
            {gridStep && <span>Grade {gridStep} m</span>}
          </div>
        </div>

        <aside
          className={showInspector ? "queue-bottom-tray inspector-open" : "queue-bottom-tray inspector-collapsed"}
          aria-label="Ferramentas e inspetor da fila"
        >
          <div className="mobile-tray-heading">
            <strong>
              {selection ? selectionLabels[selection.kind] : tool === "area" ? "Área restrita" : tool === "belt" ? "Fita" : tool === "person" ? "Fila" : "Poste"}
            </strong>
            <button
              type="button"
              className="button-quiet inspector-toggle"
              onClick={() => setInspectorOpen((open) => !open)}
              aria-expanded={showInspector}
            >
              {showInspector ? "Recolher" : "Ações"}
            </button>
          </div>

          <div className="tool-palette" role="toolbar" aria-label="Adicionar itens">
            <button
              type="button"
              className={tool === "post" ? "palette-item active" : "palette-item"}
              onClick={() => { setTool("post"); setInteractionMode("edit"); }}
              onPointerDown={(event) => onPalettePointerDown(event, "post")}
              onPointerMove={onPalettePointerMove}
              onPointerUp={onPalettePointerUp}
              onPointerCancel={cancelPalettePointer}
              onLostPointerCapture={cancelPalettePointer}
              aria-label="Selecionar ou arrastar poste para a planta"
            >
              <ItemThumbnail kind="post" />
              <span>Poste</span>
            </button>

            <button
              type="button"
              className={tool === "belt" ? "palette-item active" : "palette-item"}
              onClick={() => { setTool("belt"); setInteractionMode("edit"); }}
              aria-label="Conectar postes com fita"
            >
              <ItemThumbnail kind="belt" />
              <span>Fita</span>
            </button>

            {queueMode === "empty" ? (
              <button
                type="button"
                className={tool === "person" ? "palette-item active" : "palette-item"}
                onClick={() => { setTool("person"); setInteractionMode("edit"); }}
                onPointerDown={(event) => onPalettePointerDown(event, "person")}
                onPointerMove={onPalettePointerMove}
                onPointerUp={onPalettePointerUp}
                onPointerCancel={cancelPalettePointer}
                onLostPointerCapture={cancelPalettePointer}
                aria-label="Posicionar início da fila"
              >
                <ItemThumbnail kind="person" />
                <span>Início da fila</span>
              </button>
            ) : (
              <button
                type="button"
                className="palette-item"
                onClick={queueMode === "chain" ? appendPerson : convertLegacyQueue}
                aria-label={queueMode === "chain" ? "Acrescentar uma pessoa no fim da fila" : "Ligar as pessoas soltas em uma fila"}
              >
                <ItemThumbnail kind="person" />
                <span>{queueMode === "chain" ? "+1 pessoa" : "Ligar fila"}</span>
              </button>
            )}
          </div>

          <button
            type="button"
            className={tool === "area" ? "tool-link selected area-quick-action" : "tool-link area-quick-action"}
            onClick={() => { setTool("area"); setAreaDraft(null); setInspectorOpen(true); setInteractionMode("edit"); }}
          >
            Área restrita
          </button>

          <p className="tool-hint" aria-live="polite">
            {tool === "post"
              ? "Arraste um poste ou toque no piso para adicionar."
              : tool === "person"
              ? "Toque no piso para definir o início da fila."
              : tool === "belt"
              ? "Toque no primeiro poste e depois no segundo para ligar."
              : tool === "area"
              ? "Arraste no piso para desenhar o retângulo da área."
              : tool === "perimeter"
              ? "Arraste um canto para ajustar a planta."
              : queueMode === "legacy"
              ? "As pessoas deste projeto estão soltas. Use Ligar fila para interligá-las."
              : "Toque em qualquer objeto para ver ações e medidas."}
          </p>

          {areaDraft && (
            <div className="pending-area-actions" role="group" aria-label="Confirmar área desenhada">
              <span>Prévia da área</span>
              <label>
                Nome
                <input value={areaName} maxLength={80} onChange={(event) => setAreaName(event.target.value)} />
              </label>
              <button className="button-primary" type="button" onClick={confirmArea}>
                <Check size={16} weight="bold" aria-hidden="true" />
                <span>Usar área</span>
              </button>
              <button className="button-secondary" type="button" onClick={() => { setAreaDraft(null); setTool("area"); }}>
                Desenhar outra
              </button>
              <button className="button-quiet" type="button" onClick={() => { setAreaDraft(null); setTool("select"); }}>
                Cancelar
              </button>
            </div>
          )}

          {tool === "belt" && (
            <div className="pending-belt" aria-live="polite">
              <ItemThumbnail kind="belt" />
              <span>
                {!pendingBelt
                  ? "Toque no primeiro poste."
                  : !pendingBelt.toPostId
                  ? "Agora toque no segundo poste."
                  : "Conectar estes dois postes?"}
              </span>
              {pendingBelt?.toPostId && (
                <button className="button-primary" type="button" onClick={connectBelt}>
                  Conectar
                </button>
              )}
              {pendingBelt && (
                <button className="button-quiet" type="button" onClick={() => { setPendingBelt(null); setMessage(""); }}>
                  Cancelar
                </button>
              )}
            </div>
          )}

          {selectedPerson && (
            <PersonInspector
              key={selectedPerson.id}
              person={selectedPerson}
              scene={scene}
              moveActive={moveSelectedMode}
              onToggleMove={() => setMoveSelectedMode((current) => !current)}
              onRotate={(radians) => run({ type: "person:rotate", id: selectedPerson.id, yawRadians: selectedPerson.yawRadians + radians }, "Pessoa girada.")}
              onAppend={appendPerson}
              onClose={() => setSelection(null)}
              onDelete={removeSelection}
            />
          )}
          {selectedPost && tool !== "belt" && (
            <PostInspector
              key={selectedPost.id}
              post={selectedPost}
              moveActive={moveSelectedMode}
              onToggleMove={() => setMoveSelectedMode((current) => !current)}
              onConnect={() => {
                setTool("belt");
                setPendingBelt({ fromPostId: selectedPost.id });
                setMessage("Primeiro poste selecionado. Toque no segundo poste para ligar fita.");
              }}
              onClose={() => setSelection(null)}
              onDelete={removeSelection}
            />
          )}
          {selectedBelt && <BeltInspector key={selectedBelt.id} belt={selectedBelt} onClose={() => setSelection(null)} onDelete={removeSelection} />}
          {selectedArea && (
            <AreaInspector
              key={selectedArea.id}
              area={selectedArea}
              distances={areaDistances}
              moveActive={moveSelectedMode}
              onToggleMove={() => setMoveSelectedMode((current) => !current)}
              onRotate={(radians) => run({ type: "area:rotate", id: selectedArea.id, angleRadians: radians }, "Área girada.")}
              onClose={() => setSelection(null)}
              onDelete={removeSelection}
            />
          )}
          {selection?.kind === "route" && <RouteInspector onClose={() => setSelection(null)} onDelete={removeSelection} />}

          <div className="editor-utility-row">
            <label>
              Espaçamento da fila
              <select value={scene.simulation.spacingMeters} onChange={(event) => updateSpacing(event.target.value)}>
                <option value="0.5">0,5 m (compacto)</option>
                <option value="0.8">0,8 m (padrão)</option>
                <option value="1">1,0 m (confortável)</option>
              </select>
            </label>
            <span>{scene.people.length} pessoas na planta</span>
          </div>

          <details className="editor-more-tools">
            <summary>Ajustes de Ambiente e Planta</summary>
            <div className="secondary-tools">
              <button
                type="button"
                className={tool === "area" ? "tool-link selected" : "tool-link"}
                onClick={() => { setTool("area"); setAreaDraft(null); setInteractionMode("edit"); }}
              >
                Desenhar área restrita
              </button>
              <button
                type="button"
                className={tool === "perimeter" ? "tool-link selected" : "tool-link"}
                onClick={() => { setTool("perimeter"); setInteractionMode("edit"); }}
              >
                Ajustar cantos da planta
              </button>
            </div>
            {scene.routes.length > 0 && (
              <div className="legacy-routes">
                <p>Este projeto contém rotas legadas compatíveis. O espaçamento também se aplica a elas.</p>
              </div>
            )}
          </details>

          {!validation.valid && (
            <ul className="queue-user-validation" role="status">
              {queueErrorsForUser(validation.errors, "Revise a planta antes de salvar.").map((item, index) => (
                <li key={`${index}-${item}`}>{item}</li>
              ))}
            </ul>
          )}

          {error && <p className="queue-error" role="alert">{error}</p>}
          {message && <p className="queue-message" role="status">{message}</p>}

          <div className="tray-actions">
            {onBack && (
              <button className="button-quiet" type="button" onClick={onBack}>
                Voltar às medidas
              </button>
            )}
            {scene.environment.confirmedAt ? (
              <button
                className="button-primary"
                type="button"
                onClick={() => void continueOrSave()}
                disabled={saving || !validation.valid}
              >
                {saving ? "Salvando…" : mode === "edit" ? "Salvar alterações" : "Nomear e salvar"}
              </button>
            ) : (
              <button className="button-primary" type="button" onClick={confirmEnvironment}>Confirmar planta</button>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
