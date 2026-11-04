import crypto from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.ts';
import { AppError } from '../common/types.ts';
import { validateSaveProjectInput } from './validation.ts';
import type { SavedProject } from '../../../../contracts/project.ts';

const LOCAL_OWNER_ID = 'local-project-owner';

export interface ProjectListItem {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  previewKey: string | null;
}

@Injectable()
export class ProjectsService {
  private readonly db: DatabaseService;

  constructor(db: DatabaseService) {
    this.db = db;
  }

  public listProjects(): { projects: ProjectListItem[] } {
    const rows = this.db
      .prepare('SELECT id, name, created_at, updated_at, revision, preview_key FROM projects ORDER BY updated_at DESC')
      .all() as Array<{
      id: string;
      name: string;
      created_at: string;
      updated_at: string;
      revision: number;
      preview_key: string | null;
    }>;

    return {
      projects: rows.map((r) => ({
        id: r.id,
        name: r.name,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        revision: r.revision,
        previewKey: r.preview_key,
      })),
    };
  }

  public getProject(id: string): SavedProject {
    const row = this.db
      .prepare(
        'SELECT id, owner_id, name, created_at, updated_at, revision, scene, preview_key FROM projects WHERE id = ?'
      )
      .get(id) as
      | {
          id: string;
          owner_id: string;
          name: string;
          created_at: string;
          updated_at: string;
          revision: number;
          scene: string;
          preview_key: string | null;
        }
      | undefined;

    if (!row) {
      throw new AppError(404, 'NOT_FOUND', 'Projeto não encontrado');
    }

    let sceneObj;
    try {
      sceneObj = JSON.parse(row.scene);
    } catch {
      throw new AppError(500, 'INTERNAL_SERVER_ERROR', 'Erro ao ler dados da cena do projeto');
    }

    return {
      id: row.id,
      ownerId: row.owner_id,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      revision: row.revision,
      scene: sceneObj,
      previewKey: row.preview_key,
    };
  }

  public createProject(rawInput: any): SavedProject {
    const validatedInput = validateSaveProjectInput(rawInput, true);

    const projectId = crypto.randomUUID();
    const now = new Date().toISOString();
    const revision = 1;
    const schemaVersion = 1;
    const sceneJson = JSON.stringify(validatedInput.scene);

    this.db.transaction(() => {
      this.db
        .prepare(
          'INSERT INTO projects (id, owner_id, name, created_at, updated_at, revision, schema_version, scene, preview_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .run(projectId, LOCAL_OWNER_ID, validatedInput.name, now, now, revision, schemaVersion, sceneJson, null);
    });

    return {
      id: projectId,
      ownerId: LOCAL_OWNER_ID,
      name: validatedInput.name,
      createdAt: now,
      updatedAt: now,
      revision,
      scene: validatedInput.scene,
      previewKey: null,
    };
  }

  public updateProject(id: string, rawInput: any): SavedProject {
    const validatedInput = validateSaveProjectInput(rawInput, false);

    return this.db.transaction(() => {
      const current = this.db
        .prepare('SELECT id, owner_id, revision, created_at, preview_key FROM projects WHERE id = ?')
        .get(id) as { id: string; owner_id: string; revision: number; created_at: string; preview_key: string | null } | undefined;

      if (!current) {
        throw new AppError(404, 'NOT_FOUND', 'Projeto não encontrado');
      }

      if (current.revision !== validatedInput.expectedRevision) {
        throw new AppError(409, 'CONFLICT', 'Conflito de revisão: a versão informada diverge da atual');
      }

      const nextRevision = validatedInput.expectedRevision + 1;
      const now = new Date().toISOString();
      const sceneJson = JSON.stringify(validatedInput.scene);

      const result = this.db
        .prepare(
          'UPDATE projects SET name = ?, scene = ?, revision = ?, updated_at = ? WHERE id = ? AND revision = ?'
        )
        .run(validatedInput.name, sceneJson, nextRevision, now, id, validatedInput.expectedRevision);

      if (result.changes !== 1) {
        throw new AppError(409, 'CONFLICT', 'Falha ao aplicar revisão atômica no projeto');
      }

      return {
        id,
        ownerId: current.owner_id,
        name: validatedInput.name,
        createdAt: current.created_at,
        updatedAt: now,
        revision: nextRevision,
        scene: validatedInput.scene,
        previewKey: current.preview_key,
      };
    });
  }

  public deleteProject(id: string): void {
    const result = this.db
      .prepare('DELETE FROM projects WHERE id = ?')
      .run(id);

    if (result.changes !== 1) {
      throw new AppError(404, 'NOT_FOUND', 'Projeto não encontrado');
    }
  }
}
