import type { PointXZ } from '@testafila/core/contracts/project';
import type { SessionToProject } from '@testafila/core/domain/measured-environment';

const MIN_ALIGNMENT_SPAN_METERS = 0.1;

export type TwoPointAlignment = Readonly<{
  transform: SessionToProject;
  /** Measured span minus planned span. Reported, never corrected by scaling. */
  differenceMeters: number;
}>;

function rotate(point: PointXZ, radians: number): PointXZ {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: point.x * cos - point.z * sin, z: point.x * sin + point.z * cos };
}

function midpoint(a: PointXZ, b: PointXZ): PointXZ {
  return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
}

/** A single known point fixes position only, which is all a lone corner can give. */
export function alignFromOnePoint(project: PointXZ, session: PointXZ): SessionToProject {
  return { origin: { x: session.x - project.x, z: session.z - project.z }, rotationRadians: 0 };
}

/**
 * Rigid fit of two known project points to two marks in a new session. Scale stays
 * at one: the midpoints coincide, so a span mismatch splits evenly between both ends.
 */
export function alignFromTwoPoints(project: readonly [PointXZ, PointXZ], session: readonly [PointXZ, PointXZ]): TwoPointAlignment | null {
  const projectDx = project[1].x - project[0].x;
  const projectDz = project[1].z - project[0].z;
  const sessionDx = session[1].x - session[0].x;
  const sessionDz = session[1].z - session[0].z;
  const projectSpan = Math.hypot(projectDx, projectDz);
  const sessionSpan = Math.hypot(sessionDx, sessionDz);
  if (projectSpan < MIN_ALIGNMENT_SPAN_METERS || sessionSpan < MIN_ALIGNMENT_SPAN_METERS) return null;

  const rotationRadians = Math.atan2(projectDz, projectDx) - Math.atan2(sessionDz, sessionDx);
  const sessionMiddle = midpoint(session[0], session[1]);
  const projectMiddle = rotate(midpoint(project[0], project[1]), -rotationRadians);
  return {
    transform: { origin: { x: sessionMiddle.x - projectMiddle.x, z: sessionMiddle.z - projectMiddle.z }, rotationRadians },
    differenceMeters: sessionSpan - projectSpan,
  };
}

/** Session to project through `first`, then through `second`. */
export function composeSessionToProject(first: SessionToProject, second: SessionToProject): SessionToProject {
  const offset = rotate(second.origin, -first.rotationRadians);
  return {
    origin: { x: first.origin.x + offset.x, z: first.origin.z + offset.z },
    rotationRadians: first.rotationRadians + second.rotationRadians,
  };
}
