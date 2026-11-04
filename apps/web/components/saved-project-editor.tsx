"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { ProjectScene, SaveProjectInput, SavedProject } from "../../../contracts/project.ts";
import { apiFetch, readApiError } from "../lib/http";
import { QueueEditor } from "./queue-editor";
import { BrandLogo } from "./brand-logo";

export function SavedProjectEditor() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<SavedProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<ProjectScene | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [reloadingVersion, setReloadingVersion] = useState(false);
  const [editorGeneration, setEditorGeneration] = useState(0);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true); setError("");
      try {
        const response = await apiFetch(`/api/projects/${encodeURIComponent(id)}`);
        if (response.status === 404) throw new Error("Este projeto não existe ou não está disponível nesta conta.");
        if (!response.ok) throw new Error(await readApiError(response, "Não foi possível carregar o projeto para edição."));
        const saved = (await response.json()) as SavedProject;
        if (active) { setProject(saved); setDraft(saved.scene); }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Não foi possível carregar o projeto.");
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [id, router]);

  const saveScene = useCallback(async (scene: ProjectScene) => {
    if (!project) return;
    if (conflict) {
      setError("Este projeto mudou no servidor. Recarregue a versão atual antes de tentar salvar novamente; seu rascunho continua aberto.");
      return;
    }
    setSaving(true); setError("");
    setNotice("");
    try {
      const input: SaveProjectInput = { name: project.name, scene, expectedRevision: project.revision };
      const response = await apiFetch(`/api/projects/${encodeURIComponent(project.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (response.status === 409) {
        setConflict(true);
        setError("Este projeto mudou desde que você abriu a edição. Suas alterações continuam neste rascunho e nada foi sobrescrito. Reabra a versão atual antes de tentar salvar novamente.");
        return;
      }
      if (response.status === 413) {
        setError("O projeto excedeu o limite aceito para salvamento. Seu rascunho permanece aberto; reduza os itens e tente novamente.");
        return;
      }
      if (response.status === 400) {
        setError(await readApiError(response, "O servidor não aceitou esta edição. Confira as mensagens e tente novamente."));
        return;
      }
      if (!response.ok) {
        setError(await readApiError(response, "Não foi possível salvar agora. Suas alterações permanecem abertas."));
        return;
      }
      router.replace(`/projects/${encodeURIComponent(project.id)}`);
      router.refresh();
    } catch {
      setError("Não foi possível conectar ao serviço. Suas alterações permanecem abertas.");
    } finally { setSaving(false); }
  }, [conflict, project, router]);

  async function reloadServerVersionAndDiscardDraft() {
    if (!project) return;
    const confirmed = window.confirm("Descartar todas as alterações deste rascunho e carregar a versão atual do servidor?");
    if (!confirmed) return;
    setReloadingVersion(true); setError("");
    try {
      const response = await apiFetch(`/api/projects/${encodeURIComponent(project.id)}`);
      if (!response.ok) {
        setError(await readApiError(response, "Não foi possível carregar a versão atual. Seu rascunho continua aberto."));
        return;
      }
      const current = (await response.json()) as SavedProject;
      setProject(current); setDraft(current.scene);
      setEditorGeneration((generation) => generation + 1);
      setConflict(false); setNotice("A versão atual do servidor foi carregada. O rascunho anterior foi descartado.");
    } catch {
      setError("Não foi possível conectar para recarregar. Seu rascunho continua aberto.");
    } finally { setReloadingVersion(false); }
  }

  const handleDraftChange = useCallback((scene: ProjectScene) => {
    setDraft((current) => current === scene ? current : scene);
  }, []);

  if (loading) return <main className="project-shell"><div className="flow-loading" role="status">Carregando projeto…</div></main>;
  if (error && !project) return <main className="project-shell"><section className="project-flow-content project-load-error" role="alert">
    <h1>Não foi possível abrir a edição.</h1><p>{error}</p><div><Link className="button-quiet" href="/dashboard">Voltar aos projetos</Link></div>
  </section></main>;
  if (!project || !draft) return null;

  return <main className="project-shell editor-viewport">
    <header className="project-header">
      <BrandLogo href={`/projects/${encodeURIComponent(project.id)}`} className="dashboard-wordmark" label="Voltar ao projeto" />
      <span className="project-header-label">EDIÇÃO <span>·</span> REV. {project.revision}</span>
      <Link className="button-quiet" href={`/projects/${encodeURIComponent(project.id)}`}>Cancelar edição</Link>
    </header>
    <div className="project-flow-content">
      {error && <p className="queue-error queue-save-notice" role="alert">{error}</p>}
      {notice && <p className="queue-message queue-save-notice" role="status">{notice}</p>}
      {conflict && <section className="queue-conflict-panel" aria-label="Conflito de versão">
        <p>O servidor tem uma versão mais recente. Você pode manter este rascunho aberto ou descartar suas alterações e carregar a versão atual.</p>
        <div><button className="button-quiet" type="button" onClick={() => { setError(""); setNotice("Seu rascunho foi mantido aberto. Para salvar, carregue a versão atual do servidor."); }}>Manter meu rascunho aberto</button>
          <button className="queue-danger-button" type="button" onClick={() => void reloadServerVersionAndDiscardDraft()} disabled={reloadingVersion}>{reloadingVersion ? "Carregando versão…" : "Descartar rascunho e carregar versão atual"}</button></div>
      </section>}
      <QueueEditor
        key={`${project.id}:${project.revision}:${editorGeneration}`}
        initialScene={project.scene}
        mode="edit"
        onSceneChange={handleDraftChange}
        onSave={saveScene}
      />
    </div>
  </main>;
}
