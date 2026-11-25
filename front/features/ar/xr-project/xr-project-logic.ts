import type { PointXZ } from '@testafila/core/contracts/project';

export type XrPoint = Readonly<{ x: number; y: number; z: number }>;

export type Correspondence = Readonly<{ project: PointXZ; session: XrPoint }>;

export type SessionTransform = Readonly<{
  yawRadians: number;
  translation: XrPoint;
}>;

export type AlignmentResult = Readonly<{
  transform: SessionTransform;
  residualsMeters: number[];
  maxResidualMeters: number;
  fitDistanceMeters: number;
  observedFitDistanceMeters: number;
  fitDimensionErrorPercent: number;
}>;

function finitePoint(point: PointXZ | XrPoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.z) && ('y' in point ? Number.isFinite(point.y) : true);
}

export function transformProjectPoint(point: PointXZ, transform: SessionTransform): XrPoint {
  const cosine = Math.cos(transform.yawRadians);
  const sine = Math.sin(transform.yawRadians);
  return {
    x: point.x * cosine - point.z * sine + transform.translation.x,
    y: transform.translation.y,
    z: point.x * sine + point.z * cosine + transform.translation.z,
  };
}

/**
 * Fits only yaw and translation. Scale is deliberately fixed at one meter per
 * model unit: a distance disagreement is reported instead of being corrected.
 */
export function alignFromCorrespondences(correspondences: readonly Correspondence[]): AlignmentResult | null {
  if (correspondences.length < 2 || !correspondences.every(({ project, session }) => finitePoint(project) && finitePoint(session))) return null;
  const [first, second] = correspondences;
  const projectDx = second.project.x - first.project.x;
  const projectDz = second.project.z - first.project.z;
  const sessionDx = second.session.x - first.session.x;
  const sessionDz = second.session.z - first.session.z;
  const fitDistanceMeters = Math.hypot(projectDx, projectDz);
  const observedFitDistanceMeters = Math.hypot(sessionDx, sessionDz);
  if (fitDistanceMeters < 1e-6 || observedFitDistanceMeters < 1e-6) return null;

  const yawRadians = Math.atan2(sessionDz, sessionDx) - Math.atan2(projectDz, projectDx);
  const cosine = Math.cos(yawRadians);
  const sine = Math.sin(yawRadians);
  const rotatedFirstX = first.project.x * cosine - first.project.z * sine;
  const rotatedFirstZ = first.project.x * sine + first.project.z * cosine;
  const transform: SessionTransform = {
    yawRadians,
    translation: {
      x: first.session.x - rotatedFirstX,
      y: first.session.y,
      z: first.session.z - rotatedFirstZ,
    },
  };
  const residualsMeters = correspondences.map(({ project, session }) => {
    const transformed = transformProjectPoint(project, transform);
    return Math.hypot(transformed.x - session.x, transformed.y - session.y, transformed.z - session.z);
  });
  return {
    transform,
    residualsMeters,
    maxResidualMeters: Math.max(...residualsMeters),
    fitDistanceMeters,
    observedFitDistanceMeters,
    fitDimensionErrorPercent: Math.abs(observedFitDistanceMeters - fitDistanceMeters) / fitDistanceMeters * 100,
  };
}

/**
 * Pose for the THREE.Group that holds the project. `transformProjectPoint` turns
 * +X toward +Z for a positive yaw, while Three's `rotation.y` turns the other way.
 */
export function projectRootPose(transform: SessionTransform) {
  return { position: transform.translation, rotationY: -transform.yawRadians };
}

/** A positive manual turn follows Three's `rotation.y`, as the rotate buttons always did. */
export function withManualRotation(transform: SessionTransform, radians: number): SessionTransform {
  return { ...transform, yawRadians: transform.yawRadians - radians };
}

export type MinimapPoint = Readonly<{ x: number; y: number }>;

/**
 * Fits the plan into a `width` × `height` box seen from above, keeping proportions:
 * +X to the right and +Z down, the same top view the 3D editor shows.
 */
export function minimapPoints(points: readonly PointXZ[], width: number, height: number, padding: number): MinimapPoint[] {
  if (!points.length) return [];
  const xs = points.map((p) => p.x);
  const zs = points.map((p) => p.z);
  const minX = Math.min(...xs); const minZ = Math.min(...zs);
  const spanX = Math.max(...xs) - minX; const spanZ = Math.max(...zs) - minZ;
  const scale = Math.min((width - 2 * padding) / Math.max(spanX, 1e-6), (height - 2 * padding) / Math.max(spanZ, 1e-6));
  const offsetX = (width - spanX * scale) / 2; const offsetY = (height - spanZ * scale) / 2;
  return points.map((p) => ({ x: offsetX + (p.x - minX) * scale, y: offsetY + (p.z - minZ) * scale }));
}

export type AimGuide =
  | Readonly<{ kind: 'none' }>
  /** One point registered: compare the walked distance with the plan's. */
  | Readonly<{ kind: 'from-first'; observedMeters: number; plannedMeters: number }>
  /** Two or more: the plan says where the target corner is. */
  | Readonly<{ kind: 'to-target'; distanceMeters: number; expected: XrPoint }>;

export function aimGuide(correspondences: readonly Correspondence[], target: PointXZ | null, aim: XrPoint | null, alignment: AlignmentResult | null): AimGuide {
  if (!target) return { kind: 'none' };
  if (alignment) {
    const expected = transformProjectPoint(target, alignment.transform);
    return { kind: 'to-target', distanceMeters: aim ? Math.hypot(aim.x - expected.x, aim.z - expected.z) : Number.NaN, expected };
  }
  const [first] = correspondences;
  if (!first || !aim) return { kind: 'none' };
  return {
    kind: 'from-first',
    observedMeters: Math.hypot(aim.x - first.session.x, aim.z - first.session.z),
    plannedMeters: Math.hypot(target.x - first.project.x, target.z - first.project.z),
  };
}
