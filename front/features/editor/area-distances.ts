import type { PointXZ } from "@testafila/core/contracts/project";

export type AreaDistances = { north: number; south: number; east: number; west: number };

const EPSILON = 1e-4;

function withoutCollinear(points: PointXZ[]): PointXZ[] {
  return points.filter((point, index) => {
    const previous = points[(index + points.length - 1) % points.length];
    const next = points[(index + 1) % points.length];
    const cross = (point.x - previous.x) * (next.z - point.z) - (point.z - previous.z) * (next.x - point.x);
    return Math.abs(cross) > EPSILON;
  });
}

function extent(points: PointXZ[]) {
  const xs = points.map((point) => point.x);
  const zs = points.map((point) => point.z);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}

/** Só uma planta retangular alinhada aos eixos tem uma parede por direção. */
export function isAxisAlignedRectangle(perimeter: PointXZ[]): boolean {
  const corners = withoutCollinear(perimeter);
  if (corners.length !== 4) return false;
  const { minX, maxX, minZ, maxZ } = extent(corners);
  return corners.every((corner, index) => {
    const next = corners[(index + 1) % corners.length];
    const onCornerX = Math.abs(corner.x - minX) < EPSILON || Math.abs(corner.x - maxX) < EPSILON;
    const onCornerZ = Math.abs(corner.z - minZ) < EPSILON || Math.abs(corner.z - maxZ) < EPSILON;
    const axisAligned = Math.abs(corner.x - next.x) < EPSILON || Math.abs(corner.z - next.z) < EPSILON;
    return onCornerX && onCornerZ && axisAligned;
  });
}

/** Devolve null quando a planta não é retangular: nesse caso não há medida confiável. */
export function calculateAreaDistances(areaVertices: PointXZ[], perimeter: PointXZ[]): AreaDistances | null {
  if (areaVertices.length < 3 || !isAxisAlignedRectangle(perimeter)) return null;
  const room = extent(perimeter);
  const area = extent(areaVertices);
  return {
    north: Math.max(0, room.maxZ - area.maxZ),
    south: Math.max(0, area.minZ - room.minZ),
    east: Math.max(0, room.maxX - area.maxX),
    west: Math.max(0, area.minX - room.minX),
  };
}
