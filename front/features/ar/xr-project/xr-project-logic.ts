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
