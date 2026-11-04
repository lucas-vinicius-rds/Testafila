import type {
  EntityId,
  Meters,
  PointXZ,
  Vertex,
  MeasurementSource,
  MeasurementEvidence,
  Environment,
  RestrictedArea,
  Stanchion,
  Belt,
  QueueRoute,
  PersonPlacement,
  ProjectScene,
  SavedProject,
  SaveProjectInput,
  SessionAlignment,
} from '../contracts/project.ts';

export type {
  EntityId,
  Meters,
  PointXZ,
  Vertex,
  MeasurementSource,
  MeasurementEvidence,
  Environment,
  RestrictedArea,
  Stanchion,
  Belt,
  QueueRoute,
  PersonPlacement,
  ProjectScene,
  SavedProject,
  SaveProjectInput,
  SessionAlignment,
};

export type Vector2D = PointXZ;

export interface Segment2D {
  start: PointXZ;
  end: PointXZ;
}

export interface BoundingBoxXZ {
  minX: Meters;
  minZ: Meters;
  maxX: Meters;
  maxZ: Meters;
  width: Meters;
  depth: Meters;
}

export type IntersectionKind = 'none' | 'cross' | 'endpoint_touch' | 'collinear_overlap';

export interface SegmentIntersectionResult {
  type: IntersectionKind;
  intersects: boolean;
  point?: PointXZ;
  overlap?: [PointXZ, PointXZ];
}

export interface CircleSegmentIntersectionResult {
  intersects: boolean;
  isTangent: boolean;
  distance: Meters;
  closestPoint: PointXZ;
}

export interface CircleCircleIntersectionResult {
  intersects: boolean;
  isTangent: boolean;
  distance: Meters;
}

export interface CircularFootprint {
  center: PointXZ;
  radius: Meters;
}

export interface PointInPolygonResult {
  inside: boolean;
  onBoundary: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
