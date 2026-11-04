"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { SavedProject } from "@testafila/core/contracts/project";
import { validateManualEnvironment, getEnvironmentArea, getEnvironmentPerimeterLength } from "./project-scene";
import { apiFetch, readApiError } from "../../shared/http";
import { ScenePreview } from "./scene-preview";
import { BrandLogo } from "../../shared/brand-logo";

function formatMeters(value: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data indisponível";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function SavedProjectView() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [project, setProject] = useState<SavedProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<"top" | "perspective">("perspective");

  const loadProject = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}`);
      if (response.status === 404) {
        setError("Este projeto não existe ou não está disponível nesta conta.");
        return;
      }
      if (!response.ok) throw new Error(await readApiError(response, "Não foi possível abrir o projeto."));
      setProject((await response.json()) as SavedProject);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível abrir o projeto.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void loadProject(); }, [loadProject]);

  const validation = useMemo(() => project ? validateManualEnvironment(project.scene.environment) : null, [project]);

  if (loading) {
    return <main className="project-shell"><div className="flow-loading" role="status">Carregando projeto…</div></main>;
  }

  if (error || !project) {
    return <main className="project-shell">
      <header className="project-header"><BrandLogo href="/dashboard" className="dashboard-wordmark" /></header>
      <section className="project-flow-content project-load-error" role="alert">
        <p className="eyebrow">PROJETO INDISPONÍVEL</p><h1>Não foi possível abrir esta planta.</h1>
        <p>{error || "O servidor não retornou os dados do projeto."}</p>
        <div><button className="button-secondary" type="button" onClick={() => void loadProject()}>Tentar novamente</button>
          <Link className="button-quiet" href="/dashboard">Voltar aos projetos</Link></div>
      </section>
    </main>;
  }

  const environment = project.scene.environment;
  const environmentIsValid = validation?.valid === true;
  const sourceLabel = environment.measurement.source === "manual"
    ? "Medição manual"
    : environment.measurement.source === "calibrated" ? "Planta calibrada" : "Sessão WebXR";

  return (
    <main className="project-shell">
      <header className="project-header">
        <BrandLogo href="/dashboard" className="dashboard-wordmark" label="Voltar aos projetos" />
        <span className="project-header-label">PROJETO <span>·</span> REVISÃO</span>
        <Link className="button-quiet" href="/dashboard">Meus projetos</Link>
      </header>

      <section className="saved-project-content" aria-labelledby="saved-project-title">
        <div className="saved-project-heading">
          <div><p className="eyebrow">PLANTA SALVA · REVISÃO {project.revision}</p>
            <h1 id="saved-project-title">{project.name}</h1>
            <p>Atualizado em {formatDate(project.updatedAt)}</p>
          </div>
          <div className="view-switch" role="group" aria-label="Ângulo da visualização">
            <button type="button" className={view === "top" ? "selected" : ""} onClick={() => setView("top")}>Planta</button>
            <button type="button" className={view === "perspective" ? "selected" : ""} onClick={() => setView("perspective")}>Perspectiva</button>
          </div>
        </div>

        {environmentIsValid ? <ScenePreview scene={project.scene} view={view} showWalls={false} /> : (
          <div className="validation-list" role="alert"><p>A geometria salva não passou na validação local.</p>
            <ul>{validation?.errors.map((message, index) => <li key={`${index}-${message}`}>{message}</li>)}</ul>
          </div>
        )}

        <div className="saved-project-data">
          <div><span className="eyebrow">ÁREA</span><strong>{environmentIsValid ? `${formatMeters(getEnvironmentArea(environment))} m²` : "Indisponível"}</strong></div>
          <div><span className="eyebrow">PERÍMETRO</span><strong>{environmentIsValid ? `${formatMeters(getEnvironmentPerimeterLength(environment))} m` : "Indisponível"}</strong></div>
          <div><span className="eyebrow">FONTE</span><strong>{sourceLabel}</strong></div>
        </div>
        <p className="measurement-note">{environment.measurement.checks.length === 0
          ? "Nenhuma conferência de medida foi registrada. Sem uma segunda medida para comparar, não há erro calculado."
          : `${environment.measurement.checks.length} ${environment.measurement.checks.length === 1 ? "conferência de medida registrada" : "conferências de medida registradas"}.`}</p>
        <div className="saved-project-actions"><Link className="button-secondary" href="/dashboard">Voltar à galeria</Link>
          <div><Link className="button-primary" href={`/projects/${encodeURIComponent(project.id)}/edit`}>Editar fila</Link>
            <Link className="button-secondary" href={`/projects/${encodeURIComponent(project.id)}/ar`}>Abrir WebAR experimental</Link>
            <span>Exige HTTPS, aparelho compatível e realinhamento nesta sessão.</span></div></div>
      </section>
    </main>
  );
}
