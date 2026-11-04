import type { PointXZ } from '@testafila/core/contracts/project';
import type { XrPoint } from '../xr-check/xr-check-logic.ts';
import type { XrTracking } from '../session/xr-session.ts';
import { createEnvironmentFromMeasuredPoints, type MeasuredEnvironmentResult, type SessionToProject } from '@testafila/core/domain/measured-environment';

/** Below the reticle's own size: closer marks are a double tap, not a wall. */
export const MIN_CORNER_SPACING_METERS = 0.1;
export const MIN_CORNERS_TO_CLOSE = 3;

export type AddCornerResult =
  | Readonly<{ added: true; corners: readonly PointXZ[] }>
  | Readonly<{ added: false; corners: readonly PointXZ[]; reason: string }>;

/** Marking needs a visible session and a live floor hit; anything else blocks it. */
export function canMarkCorner(state: Readonly<{ visible: boolean; tracking: XrTracking; hit: XrPoint | null }>): boolean {
  return state.visible && state.tracking === 'surface' && state.hit !== null;
}

/** Walls run along the floor, so height differences between hits do not count. */
export function floorDistanceMeters(a: PointXZ, b: PointXZ): number {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

export function addCorner(corners: readonly PointXZ[], point: PointXZ): AddCornerResult {
  if (corners.some((corner) => floorDistanceMeters(corner, point) < MIN_CORNER_SPACING_METERS)) {
    return { added: false, corners, reason: 'Este ponto está colado em um canto já marcado. Mova o aparelho para o próximo canto.' };
  }
  return { added: true, corners: [...corners, point] };
}

export function undoLastCorner(corners: readonly PointXZ[]): readonly PointXZ[] {
  return corners.slice(0, -1);
}

export function wallLengthsMeters(corners: readonly PointXZ[]): number[] {
  return corners.slice(1).map((corner, index) => floorDistanceMeters(corners[index], corner));
}

/** The wall that closing would create, from the last corner back to the first. */
export function closingWallMeters(corners: readonly PointXZ[]): number | null {
  return corners.length >= MIN_CORNERS_TO_CLOSE ? floorDistanceMeters(corners[corners.length - 1], corners[0]) : null;
}

export function closeFloorplan(corners: readonly PointXZ[], recordedAt: string): MeasuredEnvironmentResult {
  return createEnvironmentFromMeasuredPoints({ points: corners.map(({ x, z }) => ({ x, z })), recordedAt });
}

export function formatMeters(value: number): string {
  return `${value.toFixed(2).replace('.', ',')} m`;
}

/**
 * Pose that lays project coordinates over the floor of this session, for a root
 * THREE.Group. `sessionToProject` turns session points into project points, so
 * the group applies the inverse. `rotation.y` keeps the same value because
 * Three's Y rotation already turns the opposite way of that transform.
 */
export function projectRootPose(transform: SessionToProject, floorY: number) {
  return {
    position: { x: transform.origin.x, y: floorY, z: transform.origin.z },
    rotationY: transform.rotationRadians,
  };
}
