import type { ProjectScene } from '../../contracts/project.ts';

type ProjectSceneV1 = Omit<ProjectScene, 'schemaVersion' | 'queue'> & { schemaVersion: 1 };

/**
 * Converte uma cena salva para a versão atual, sem mutar a entrada.
 * Pessoas de cenas v1 ficam fora da cadeia: a conversão delas é explícita
 * (`queue:convert-legacy`), nunca feita ao ler.
 */
export function migrateProjectScene(input: unknown): ProjectScene {
  const scene = input as { schemaVersion?: unknown } | null | undefined;
  if (scene?.schemaVersion === 2) return input as ProjectScene;
  if (scene?.schemaVersion !== 1) throw new Error('Documento de cena incompatível');
  return { ...(input as ProjectSceneV1), schemaVersion: 2, queue: { personIds: [] } };
}
