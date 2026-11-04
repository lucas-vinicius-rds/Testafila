export type XrPoint = Readonly<{ x: number; y: number; z: number }>;

type HitPoseLike = Readonly<{
  transform: Readonly<{
    position: Readonly<{ x: number; y: number; z: number }>;
    orientation: Readonly<{ x: number; y: number; z: number; w: number }>;
  }>;
}>;

const HORIZONTAL_NORMAL_Y_MIN = Math.cos((20 * Math.PI) / 180);

/**
 * Accept a hit only when its pose is finite and its local +Y surface normal
 * points within 20 degrees of world-up. This is a conservative spike filter,
 * not a validated floor classifier.
 */
export function horizontalHitPoint(pose: HitPoseLike | null | undefined): XrPoint | null {
  if (!pose) return null;
  const { position, orientation } = pose.transform;
  const values = [position.x, position.y, position.z, orientation.x, orientation.y, orientation.z, orientation.w];
  if (!values.every(Number.isFinite)) return null;

  const length = Math.hypot(orientation.x, orientation.y, orientation.z, orientation.w);
  if (length < 1e-8) return null;
  const x = orientation.x / length;
  const y = orientation.y / length;
  const z = orientation.z / length;
  const w = orientation.w / length;
  const normalY = 1 - 2 * (x * x + z * z);
  if (normalY < HORIZONTAL_NORMAL_Y_MIN) return null;

  return { x: position.x, y: position.y, z: position.z };
}

export function distanceMeters(a: XrPoint, b: XrPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}
