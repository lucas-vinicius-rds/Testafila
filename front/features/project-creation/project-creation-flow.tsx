"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectScene, SaveProjectInput } from "@testafila/core/contracts/project";
import { apiFetch, readApiError } from "../../shared/http";
import { confirmManualEnvironment, createEmptyProjectScene, createManualRectangle, getEnvironmentArea, measurementSourceLabel } from "../editor/project-scene";
import { QueueEditor } from "../editor/queue-editor";
import { ScenePreview } from "../editor/scene-preview";
import { BrandLogo } from "../../shared/brand-logo";
import { useArCapability } from "../ar/session/use-ar-capability";
import { ArAssemblySlot } from "./ar-assembly-slot";

type Stage = "entry" | "camera" | "measure" | "queue" | "name";
type Dimensions = { width: number; depth: number };

function parseMeters(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatMeters(value: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
}

export function ProjectCreationFlow() {
  const router = useRouter();
  const [scene, setScene] = useState<ProjectScene>(createEmptyProjectScene);
  const [stage, setStage] = useState<Stage>("entry");
  const [editorMounted, setEditorMounted] = useState(false);
  const [editorGeneration, setEditorGeneration] = useState(0);
  const [appliedDimensions, setAppliedDimensions] = useState<Dimensions | null>(null);
  const [widthInput, setWidthInput] = useState("10");
  const [depthInput, setDepthInput] = useState("8");
  const [projectName, setProjectName] = useState("");
  const [geometryError, setGeometryError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const { status: arStatus } = useArCapability();
  const cameraAvailable = arStatus === "supported";
  const [saved, setSaved] = useState(false);
  // A montagem guarda o trabalho só em memória, então a etapa da câmera conta como não salva.
  const unsavedWork = !saved && (stage === "camera" || editorMounted);

  // Criar nova fila vai direto para a câmera, ou para as medidas se ela não existir.
  useEffect(() => {
    if (stage === "entry" && arStatus !== "checking") setStage(cameraAvailable ? "camera" : "measure");
  }, [arStatus, cameraAvailable, stage]);

  useEffect(() => {
    if (!unsavedWork) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsavedWork]);

  function openCanvas() {
    const width = parseMeters(widthInput);
    const depth = parseMeters(depthInput);
    if (width === null || depth === null) { setGeometryError("Informe largura e profundidade maiores que zero, em metros."); return; }
    const dimensionsChanged = appliedDimensions !== null && (appliedDimensions.width !== width || appliedDimensions.depth !== depth);
    const hasAssembly = scene.posts.length + scene.people.length + scene.belts.length + scene.restrictedAreas.length + scene.routes.length > 0;
    if (editorMounted && dimensionsChanged && hasAssembly
      && !window.confirm("Ao aplicar novas medidas, a montagem atual será descartada. Continuar?")) return;
    try {
      const environment = confirmManualEnvironment(createManualRectangle(width, depth, 2.8));
      if (!appliedDimensions || dimensionsChanged) {
        setScene({ ...createEmptyProjectScene(), environment });
        if (editorMounted) setEditorGeneration((generation) => generation + 1);
      }
      setAppliedDimensions({ width, depth });
      setGeometryError(""); setStage("queue"); setEditorMounted(true);
    } catch (cause) {
      setGeometryError(cause instanceof Error ? cause.message : "Confira as medidas informadas.");
    }
  }

  function openCameraResult(nextScene: ProjectScene) {
    setScene(nextScene);
    setAppliedDimensions(null);
    setEditorGeneration((generation) => generation + 1);
    setEditorMounted(true);
    setStage("queue");
  }

  function handleSceneChange(nextScene: ProjectScene) {
    setScene((current) => current === nextScene ? current : nextScene);
  }

  async function saveProject(sceneToSave: ProjectScene = scene, projectNameToSave: string = projectName) {
    if (!sceneToSave.environment.confirmedAt) { setSaveError("Confirme a planta no canvas antes de salvar."); setStage("queue"); return; }
    if (!projectNameToSave.trim()) { setSaveError("Informe um nome para esta fila."); return; }
    setSaving(true); setSaveError("");
    try {
      const input: SaveProjectInput = { name: projectNameToSave.trim(), scene: sceneToSave, expectedRevision: null };
      const response = await apiFetch("/api/projects", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
      });
      if (response.status === 400) {
        setSaveError(await readApiError(response, "O servidor não aceitou a planta. Confira os itens e tente novamente.")); return;
      }
      if (response.status === 409) {
        setSaveError("O servidor sinalizou um conflito. Nada foi sobrescrito; suas edições continuam nesta tela."); return;
      }
      if (response.status === 413) {
        setSaveError("Esta fila excede o tamanho aceito para salvar. Suas edições continuam nesta tela; reduza os itens e tente novamente."); return;
      }
      if (!response.ok) {
        setSaveError(await readApiError(response, "Não foi possível salvar agora. Suas edições continuam nesta tela.")); return;
      }
      const created = (await response.json()) as { id?: string };
      if (!created.id) { setSaveError("O servidor confirmou a gravação sem retornar o identificador do projeto."); return; }
      setSaved(true);
      router.push(`/projects/${encodeURIComponent(created.id)}`);
    } catch {
      setSaveError("Não foi possível conectar ao serviço. Suas edições continuam nesta tela.");
    } finally { setSaving(false); }
  }

  return <main className={stage === "queue" ? "project-shell editor-viewport" : "project-shell creation-shell"}>
    <header className="project-header"><BrandLogo href="/dashboard" className="dashboard-wordmark" /><span className="project-header-label">NOVA FILA</span>{stage !== "camera" && <Link className="button-quiet" href="/dashboard">Cancelar</Link>}</header>
    <div className="project-flow-content creation-content">
      {stage === "entry" && <div className="flow-loading" role="status">Preparando…</div>}

      {stage === "camera" && <section className="creation-camera-stage" aria-label="Montagem pela câmera">
        <ArAssemblySlot onComplete={openCameraResult} onUseTypedMeasures={() => setStage("measure")} onCancel={() => router.push("/dashboard")} />
      </section>}

      {stage === "measure" && <section className="creation-measure-stage" aria-labelledby="measure-title">
        <h1 id="measure-title">Digite as medidas do local</h1>
        <p>Use as medidas tiradas no local. Depois você monta a fila sobre a planta.</p>
        {arStatus !== "checking" && !cameraAvailable && <p className="measurement-note">A medição pela câmera não está disponível neste aparelho</p>}
        <div className="measure-fields creation-dimensions">
          <label>Largura<input type="text" inputMode="decimal" value={widthInput} onChange={(event) => setWidthInput(event.target.value)} aria-label="Largura medida em metros" /><span>m</span></label>
          <label>Profundidade<input type="text" inputMode="decimal" value={depthInput} onChange={(event) => setDepthInput(event.target.value)} aria-label="Profundidade medida em metros" /><span>m</span></label>
        </div>
        <p className="measurement-note">Confira as medidas antes de montar a fila.</p>
        {geometryError && <p className="geometry-error" role="alert">{geometryError}</p>}
        <div className="stage-footer">{cameraAvailable ? <button className="button-quiet" type="button" onClick={() => setStage("camera")}>Voltar</button> : <Link className="button-quiet" href="/dashboard">Voltar</Link>}<button className="button-primary" type="button" onClick={openCanvas}>{appliedDimensions ? "Abrir canvas" : "Montar no canvas"}</button></div>
      </section>}

      {editorMounted && <div hidden={stage !== "queue"} className="creation-editor-stage">
        <QueueEditor key={`create:${editorGeneration}`} initialScene={scene} mode="create" onSceneChange={handleSceneChange}
          onBack={scene.environment.measurement.source === "manual" ? () => setStage("measure") : undefined} onContinue={(nextScene) => { setScene(nextScene); setStage("name"); }} />
      </div>}

      {stage === "name" && <section className="creation-save-stage" aria-labelledby="save-title">
        <div className="creation-save-controls"><h1 id="save-title">Nomeie e salve a fila</h1>
          <label htmlFor="project-name">Nome do projeto</label><input id="project-name" name="projectName" maxLength={100} value={projectName} onChange={(event) => { setProjectName(event.target.value); setSaveError(""); }} placeholder="Ex.: Salão principal" />
          <p>{formatMeters(getEnvironmentArea(scene.environment))} m² · {measurementSourceLabel(scene.environment)} · {scene.posts.length} postes · {scene.people.length} pessoas</p>
          {saveError && <p className="save-error" role="alert">{saveError}</p>}
          <button className="button-primary save-button" type="button" onClick={() => void saveProject()} disabled={saving || !projectName.trim()}>{saving ? "Salvando…" : "Salvar projeto"}</button>
          <button className="button-quiet" type="button" onClick={() => setStage("queue")}>Voltar ao canvas</button>
        </div>
        <div className="creation-save-preview"><ScenePreview scene={scene} view="top" showWalls={false} /></div>
      </section>}
    </div>
  </main>;
}
