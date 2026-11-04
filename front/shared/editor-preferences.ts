import type { GridStepMeters, InteractionMode } from "@testafila/core/contracts/scene-viewer";

/** Preferência local de interface. Dados do projeto continuam só no banco. */
export type EditorPreferences = { gridStep: GridStepMeters; navigationMode: InteractionMode };

const STORAGE_KEY = "testafila.editor-preferences";
const GRID_STEPS: GridStepMeters[] = [0.1, 0.25, 0.5, 1, null];

export const defaultEditorPreferences: EditorPreferences = { gridStep: 0.25, navigationMode: "edit" };

export function readEditorPreferences(): EditorPreferences {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<EditorPreferences>;
    return {
      gridStep: stored.gridStep !== undefined && GRID_STEPS.includes(stored.gridStep) ? stored.gridStep : defaultEditorPreferences.gridStep,
      navigationMode: stored.navigationMode === "navigate" || stored.navigationMode === "edit" ? stored.navigationMode : defaultEditorPreferences.navigationMode,
    };
  } catch {
    return defaultEditorPreferences;
  }
}

export function saveEditorPreferences(change: Partial<EditorPreferences>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readEditorPreferences(), ...change }));
  } catch {
    // Sem armazenamento, a escolha vale só nesta tela.
  }
}
