import type { PointXZ, ProjectScene } from './project.ts';
import type { EditorSelection } from './queue-editor.ts';

export type CanvasTool = 'select' | 'post' | 'person' | 'belt' | 'area' | 'perimeter';
export type InteractionMode = 'navigate' | 'edit';
export type GridStepMeters = 0.1 | 0.25 | 0.5 | 1 | null;
export type CameraActionType =
  | 'rotate-left'
  | 'rotate-right'
  | 'tilt-up'
  | 'tilt-down'
  | 'zoom-in'
  | 'zoom-out'
  | 'pan-left'
  | 'pan-right'
  | 'pan-up'
  | 'pan-down'
  | 'center-bounds'
  | 'center-selection'
  | 'reset';
export type FloorProjector = (clientX: number, clientY: number) => PointXZ | null;

export interface AreaWallDistances {
  areaId: string;
  north: number; // +Z
  south: number; // -Z
  east: number;  // +X
  west: number;  // -X
}

/** Interface comum entre o fluxo guiado e a cena R3F. Coordenadas sempre métricas. */
export interface SceneViewerProps {
  scene: ProjectScene;
  view?: 'perspective' | 'top';
  className?: string;
  interactionMode?: InteractionMode;
  gridStep?: GridStepMeters;
  onFloorPoint?: (point: PointXZ) => void;
  selection?: EditorSelection | null;
  onSelectEntity?: (selection: EditorSelection | null) => void;
  /** Delta XZ em metros desde o início do arraste; aplicado somente ao soltar. */
  onMoveEntity?: (selection: EditorSelection, delta: PointXZ) => void;
  tool?: CanvasTool;
  cameraAction?: { id: number; type: CameraActionType };
  onRegisterFloorProjector?: (projector: FloorProjector | null) => void;
  placementPreview?: { kind: 'post' | 'person'; point: PointXZ } | null;
  draftArea?: PointXZ[] | null;
  draftBelt?: { fromPostId: string; toPostId: string } | null;
  onAreaDraw?: (start: PointXZ, end: PointXZ) => void;
  onMovePerimeterVertex?: (id: string, position: PointXZ) => void;
  onAppendPerson?: (id: string) => void;
  onAreaDistancesChange?: (distances: AreaWallDistances | null) => void;
  showWalls?: boolean;
}
