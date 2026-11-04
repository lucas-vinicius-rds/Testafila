import type { ProjectScene } from '../../contracts/project.ts';

type LegacyProjectScene = Omit<ProjectScene, 'schemaVersion' | 'postGroups'> & { schemaVersion: 1 };

/** Converts the only historical persisted format into the canonical v2 scene. */
export function migrateProjectScene(input: unknown): ProjectScene {
  const scene = input as { schemaVersion?: unknown; posts?: unknown };
  if (scene?.schemaVersion === 2) return scene as ProjectScene;
  if (scene?.schemaVersion !== 1 || !Array.isArray(scene.posts)) {
    throw new Error('Documento de cena incompatível');
  }
  const legacy = scene as unknown as LegacyProjectScene;
  return {
    ...legacy,
    schemaVersion: 2,
    postGroups: [{
      id: 'legacy-post-group',
      name: 'Conjunto existente',
      postIds: legacy.posts.map((post) => post.id),
    }],
  };
}
