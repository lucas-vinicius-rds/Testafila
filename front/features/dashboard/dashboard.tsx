"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch, readApiError } from "../../shared/http";
import type { ProjectSummary, ProjectsResponse } from "../../shared/contracts";
import type { ProjectScene } from "@testafila/core/contracts/project";
import { BrandLogo } from "../../shared/brand-logo";
import { AppNav } from "../../shared/app-nav";
import { SettingsPanel, type GridStep, type NavigationMode } from "../settings/settings-panel";
import { generateSceneThumbnailSvg } from "./scene-thumbnail";
import {
  Plus,
  ArrowSquareOut,
  SlidersHorizontal,
  WarningCircle,
  FolderOpen,
  Trash
} from "@phosphor-icons/react/dist/ssr";

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data indisponível";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function ProjectThumbnail({ projectId }: { projectId: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function fetchScene() {
      try {
        const res = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (active && data?.project?.scene) {
          const generated = generateSceneThumbnailSvg(data.project.scene as ProjectScene, 300, 194);
          setSvg(generated);
        }
      } catch {
        // Fallback default
      } finally {
        if (active) setLoading(false);
      }
    }
    void fetchScene();
    return () => { active = false; };
  }, [projectId]);

  if (loading) {
    return <div className="skeleton-preview" aria-hidden="true" />;
  }

  if (svg) {
    return (
      <div
        className="project-preview project-preview-svg"
        dangerouslySetInnerHTML={{ __html: svg }}
        aria-label="Miniatura métrica da cena"
      />
    );
  }

  return (
    <div className="project-preview" aria-label="Prévia simplificada">
      <span className="preview-label">PRÉVIA MÉTRICA</span>
    </div>
  );
}

export function Dashboard() {
  const searchParams = useSearchParams();
  const showSettingsParam = searchParams.get("settings") === "1";

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(showSettingsParam);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);

  const [gridStep, setGridStep] = useState<GridStep>(0.25);
  const [navigationMode, setNavigationMode] = useState<NavigationMode>("navigate");

  useEffect(() => {
    if (showSettingsParam) {
      setSettingsOpen(true);
    }
  }, [showSettingsParam]);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch("/api/projects");
      if (!response.ok) throw new Error(await readApiError(response, "Não foi possível carregar os projetos."));
      const payload = (await response.json()) as ProjectsResponse;
      if (!Array.isArray(payload.projects)) throw new Error("A resposta de projetos está em formato inesperado.");
      setProjects(payload.projects);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar os projetos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadProjects(); }, [loadProjects]);

  async function deleteProject(project: ProjectSummary) {
    if (!window.confirm(`Apagar “${project.name}”? Esta ação não pode ser desfeita.`)) return;
    setDeletingProjectId(project.id);
    setError("");
    try {
      const response = await apiFetch(`/api/projects/${encodeURIComponent(project.id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await readApiError(response, "Não foi possível apagar o projeto."));
      setProjects((current) => current.filter((item) => item.id !== project.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível apagar o projeto.");
    } finally {
      setDeletingProjectId(null);
    }
  }

  return (
    <>
    <a className="skip-link" href="#main-content">Pular para o conteúdo</a>
    <main className="dashboard-page" id="main-content">
      <header className="dashboard-header">
        <BrandLogo href="/" className="dashboard-wordmark" label="TestaFila, início" />
        <AppNav />
        <div className="account-menu">
          <button
            type="button"
            className="button-quiet header-settings-btn"
            onClick={() => setSettingsOpen((prev) => !prev)}
            aria-label="Abrir configurações de visualização"
            title="Configurações"
          >
            <SlidersHorizontal size={18} weight="bold" aria-hidden="true" />
            <span className="desktop-only-inline">Opções</span>
          </button>
          <span className="account-name">Modo local</span>
        </div>
      </header>

      {settingsOpen && (
        <div className="dashboard-settings-overlay">
          <SettingsPanel
            gridStep={gridStep}
            navigationMode={navigationMode}
            onGridStepChange={setGridStep}
            onNavigationModeChange={setNavigationMode}
            onClose={() => setSettingsOpen(false)}
          />
        </div>
      )}

      <section className="dashboard-main" aria-labelledby="dashboard-title">
        <div className="dashboard-heading">
          <div><p className="eyebrow">ESPAÇO DE TRABALHO</p>
            <h1 id="dashboard-title">Seus projetos<span className="heading-period">.</span></h1>
            <p className="dashboard-subtitle">Projetos salvos nesta conta com geometria métrica real.</p>
          </div>
          <div className="dashboard-actions">
            <span className="project-count">{loading ? "…" : String(projects.length).padStart(2, "0")} <span>PROJETOS</span></span>
            <Link className="button-primary create-project" href="/projects/new">
              <Plus size={16} weight="bold" aria-hidden="true" />
              <span>Criar nova fila</span>
            </Link>
          </div>
        </div>

        {error && (
          <div className="notice-error" role="alert">
            <WarningCircle size={20} weight="bold" aria-hidden="true" />
            <span>{error}</span>
            <button className="button-quiet" type="button" onClick={() => void loadProjects()}>Tentar novamente</button>
          </div>
        )}

        {loading ? (
          <div className="project-grid" aria-label="Carregando projetos" aria-busy="true">
            {[0, 1, 2].map((item) => (
              <div className="project-skeleton" key={item}>
                <div className="skeleton-preview" />
                <div className="skeleton-line" />
                <div className="skeleton-line skeleton-short" />
              </div>
            ))}
          </div>
        ) : !error && projects.length === 0 ? (
          <div className="empty-state">
            <div className="empty-drawing" aria-hidden="true"><span /><span /><span /><span /></div>
            <p className="eyebrow">AINDA SEM PROJETOS</p>
            <h2>Seu espaço começa aqui.</h2>
            <p>Quando um projeto for salvo, ele aparecerá nesta galeria com prévia métrica gerada.</p>
            <Link className="button-primary" href="/projects/new" style={{ marginTop: "16px" }}>
              <Plus size={16} weight="bold" aria-hidden="true" />
              <span>Criar primeira fila</span>
            </Link>
          </div>
        ) : !error ? (
          <div className="project-grid" aria-label="Projetos salvos">
            {projects.map((project, index) => (
              <article className="project-card" key={project.id} style={{ "--item-delay": `${index * 55}ms` } as React.CSSProperties}>
                <ProjectThumbnail projectId={project.id} />
                <div className="project-card-info">
                  <div>
                    <h2>{project.name}</h2>
                    <p>Atualizado em {formatDate(project.updatedAt)}</p>
                  </div>
                  <div className="project-card-ctas">
                    <Link
                      className="button-primary card-open-cta"
                      href={`/projects/${encodeURIComponent(project.id)}`}
                      aria-label={`Abrir e visualizar ${project.name}`}
                    >
                      <FolderOpen size={16} weight="bold" aria-hidden="true" />
                      <span>Abrir</span>
                    </Link>
                    <Link
                      className="button-secondary card-edit-cta"
                      href={`/projects/${encodeURIComponent(project.id)}/edit`}
                      aria-label={`Editar projeto ${project.name}`}
                    >
                      <ArrowSquareOut size={16} weight="bold" aria-hidden="true" />
                      <span>Editar</span>
                    </Link>
                    <button
                      className="button-secondary card-delete-cta"
                      type="button"
                      onClick={() => void deleteProject(project)}
                      disabled={deletingProjectId === project.id}
                      aria-label={`Apagar projeto ${project.name}`}
                    >
                      <Trash size={16} weight="bold" aria-hidden="true" />
                      <span>{deletingProjectId === project.id ? "Apagando…" : "Apagar"}</span>
                    </button>
                  </div>
                </div>
                <p className="project-status"><span /> SALVO · REV. {project.revision}</p>
              </article>
            ))}
          </div>
        ) : null}
        <div className="dashboard-bottom">
          <span>TESTAFILA · PROJETOS DA CONTA</span>
          <span>UMA UNIDADE ESPACIAL = 1 METRO</span>
        </div>
      </section>
    </main>
    </>
  );
}
