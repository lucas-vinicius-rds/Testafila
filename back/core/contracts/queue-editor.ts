import type { Belt, EntityId, PersonPlacement, PointXZ, ProjectScene, QueueRoute, RestrictedArea, Stanchion } from './project.ts';

export interface EditorSelection { kind: 'area' | 'post' | 'belt' | 'route' | 'person'; id: EntityId }
export type QueueCommand =
  | { type: 'environment:vertex-move'; id: EntityId; position: PointXZ }
  | { type: 'environment:confirm'; confirmedAt: string }
  | { type: 'area:add'; area: RestrictedArea }
  | { type: 'area:update'; area: RestrictedArea }
  | { type: 'area:move'; id: EntityId; delta: PointXZ }
  | { type: 'area:rotate'; id: EntityId; angleRadians: number }
  | { type: 'area:remove'; id: EntityId }
  | { type: 'post:add'; post: Stanchion }
  | { type: 'post:move'; id: EntityId; position: PointXZ }
  | { type: 'post:remove'; id: EntityId }
  | { type: 'belt:add'; belt: Belt }
  | { type: 'belt:remove'; id: EntityId }
  | { type: 'route:set'; route: QueueRoute }
  | { type: 'route:remove'; id: EntityId }
  | { type: 'people:add'; routeId: EntityId; id: EntityId }
  | { type: 'people:fill'; routeId: EntityId; idPrefix: string }
  | { type: 'person:remove'; id: EntityId }
  | { type: 'person:add'; person: PersonPlacement }
  | { type: 'person:move'; id: EntityId; position: PointXZ }
  | { type: 'person:rotate'; id: EntityId; yawRadians: number }
  // Sempre atrás da última pessoa da cadeia. sourceId é aceito e ignorado.
  | { type: 'person:append'; id: EntityId; sourceId?: EntityId }
  | { type: 'queue:convert-legacy' }
  | { type: 'people:clear'; routeId?: EntityId }
  | { type: 'simulation:spacing'; spacingMeters: number };

export interface QueueValidation { valid: boolean; errors: string[] }
export interface QueueCommandResult extends QueueValidation { scene: ProjectScene }
export interface QueueHistory { past: ProjectScene[]; present: ProjectScene; future: ProjectScene[] }
export interface QueueHistoryResult extends QueueValidation { history: QueueHistory }
export type QueueMode = 'empty' | 'chain' | 'legacy';
export interface QueueStats { routeLengthMeters: number; peopleCount: number; capacity: number }

/** API de back/core/domain/queue/index.ts:
 * validateQueueScene(scene: ProjectScene): QueueValidation
 * applyQueueCommand(scene: ProjectScene, command: QueueCommand): QueueCommandResult
 * createQueueHistory(scene: ProjectScene): QueueHistory
 * executeQueueCommand(history: QueueHistory, command: QueueCommand): QueueHistoryResult
 * undoQueue(history: QueueHistory): QueueHistory
 * redoQueue(history: QueueHistory): QueueHistory
 * getQueueStats(scene: ProjectScene): QueueStats
 * getQueueMode(scene: ProjectScene): QueueMode
 * getChainPeople(scene: ProjectScene): PersonPlacement[]
 * Comando inválido devolve a instância original; nenhuma mutação.
 */
