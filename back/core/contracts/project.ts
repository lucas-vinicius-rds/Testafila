/** Contrato de referência v1. Ainda não integrado ao protótipo Vite. */
export type EntityId = string;
export type Meters = number; // Runtime: número finito; limites específicos por campo.
export interface PointXZ { x: Meters; z: Meters }
export interface Vertex extends PointXZ { id: EntityId }
export type MeasurementSource = 'manual' | 'calibrated' | 'webxr';

export interface MeasurementEvidence {
  source: MeasurementSource;
  recordedAt: string;
  // Derivado: máximo de 100 * abs(distância do modelo - measuredMeters) /
  // measuredMeters entre checks válidos. Sem checks, omitir; nunca assumir zero.
  // Referência medida deve ser finita e > 0; extremos distintos e existentes.
  // Não representa garantia de precisão nem incerteza do sensor.
  observedErrorPercent?: number;
  checks: Array<{ fromVertexId: EntityId; toVertexId: EntityId; measuredMeters: Meters }>;
}

export interface Environment {
  // Fechamento implícito último -> primeiro. Não repetir vértice final.
  perimeter: Vertex[];
  wallHeightMeters: Meters;
  measurement: MeasurementEvidence;
  confirmedAt: string | null;
}

export interface RestrictedArea {
  id: EntityId;
  name: string;
  vertices: Vertex[];
}

export interface Stanchion {
  id: EntityId;
  position: PointXZ;
  heightMeters: Meters;
  baseRadiusMeters: Meters;
}

export interface Belt {
  id: EntityId;
  fromPostId: EntityId;
  toPostId: EntityId;
  heightMeters: Meters;
}

export interface QueueRoute {
  id: EntityId;
  // Percurso das pessoas, independente das barreiras (fitas).
  points: Vertex[];
}

export interface PersonPlacement {
  id: EntityId;
  // null/null = colocação livre no editor visual; string/número = percurso legado.
  routeId: EntityId | null;
  distanceAlongRouteMeters: Meters | null;
  // Para percurso, cache validado no servidor; livre: posição e yaw são a fonte.
  position: PointXZ;
  yawRadians: number;
}

export interface ProjectScene {
  schemaVersion: 1;
  units: 'meters';
  coordinateSystem: 'right-handed-y-up-xz-floor';
  environment: Environment;
  restrictedAreas: RestrictedArea[];
  posts: Stanchion[];
  belts: Belt[];
  routes: QueueRoute[];
  people: PersonPlacement[];
  simulation: {
    spacingMeters: Meters;
    personHeightMeters: Meters;
    personRadiusMeters: Meters;
    clearanceMeters: Meters;
  };
}

export interface SavedProject {
  id: EntityId;
  ownerId: EntityId; // Somente servidor atribui.
  name: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  scene: ProjectScene;
  previewKey: string | null;
}

export interface SaveProjectInput {
  name: string;
  scene: ProjectScene;
  // null para criação; atualização exige revisão atual do banco.
  expectedRevision: number | null;
}

/** Apenas memória da sessão; não integrar ao SavedProject. Escala sempre 1. */
export interface SessionAlignment {
  sessionId: string;
  projectId: EntityId;
  yawRadians: number;
  translation: { x: Meters; y: Meters; z: Meters };
  // Dois pares distintos ajustam translação/yaw; terceiro par independente confere.
  correspondences: Array<{
    project: PointXZ;
    session: { x: Meters; y: Meters; z: Meters };
    purpose: 'fit' | 'check';
  }>;
  // Derivado em XZ após a transformação, sobre TODOS os pares.
  maxResidualMeters: Meters;
  // Política aprovada após validação em aparelho; não inventar valores padrão.
  tolerance: {
    policyId: string;
    maxResidualMeters: Meters;
    maxDimensionErrorPercent: number;
  };
  // Índices de correspondências. Distâncias XZ; todas devem passar na tolerância.
  // originalMeters > 0; erro = 100 * abs(observed - original) / original.
  dimensionChecks: Array<{
    fromCorrespondenceIndex: number;
    toCorrespondenceIndex: number;
    originalMeters: Meters;
    observedMeters: Meters;
    errorPercent: number;
  }>;
  // Só confirmar com >= 2 fit + >= 1 check, resíduos e dimensões aprovados.
  // Cache de diagnósticos deve ser recalculado; não confiar em valores recebidos.
  confirmedAt: string;
}
