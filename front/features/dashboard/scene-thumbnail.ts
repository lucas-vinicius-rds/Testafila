/**
 * Gera uma miniatura SVG métrica a partir de uma ProjectScene.
 * Produz uma string SVG que pode ser usada como data URI ou inline.
 * Sem Canvas WebGL, sem dependências externas, sem dados de outro proprietário.
 */
import type { ProjectScene, PointXZ } from "@testafila/core/contracts/project";

function bounds(points: PointXZ[]): { minX: number; maxX: number; minZ: number; maxZ: number } {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  return { minX, maxX, minZ, maxZ };
}

function escAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export function generateSceneThumbnailSvg(scene: ProjectScene, width = 300, height = 194): string {
  const perimeter = scene.environment.perimeter;
  if (perimeter.length < 3) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#eceee7"/><text x="${width / 2}" y="${height / 2}" text-anchor="middle" fill="#606963" font-family="Consolas,monospace" font-size="10">Prévia indisponível</text></svg>`;
  }

  const allPoints: PointXZ[] = [
    ...perimeter,
    ...scene.posts.map((p) => p.position),
    ...scene.people.map((p) => p.position),
    ...scene.restrictedAreas.flatMap((a) => a.vertices),
  ];
  const b = bounds(allPoints);
  const sceneW = b.maxX - b.minX || 1;
  const sceneH = b.maxZ - b.minZ || 1;

  const padding = 16;
  const drawW = width - padding * 2;
  const drawH = height - padding * 2;
  const scale = Math.min(drawW / sceneW, drawH / sceneH);
  const offsetX = padding + (drawW - sceneW * scale) / 2;
  const offsetZ = padding + (drawH - sceneH * scale) / 2;

  function tx(x: number): number { return offsetX + (x - b.minX) * scale; }
  function tz(z: number): number { return offsetZ + (z - b.minZ) * scale; }

  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`);
  parts.push(`<rect width="${width}" height="${height}" fill="#eceee7" rx="0"/>`);

  // Perimeter
  const perimPoints = perimeter.map((v) => `${tx(v.x).toFixed(1)},${tz(v.z).toFixed(1)}`).join(" ");
  parts.push(`<polygon points="${escAttr(perimPoints)}" fill="none" stroke="#89978e" stroke-width="1.5"/>`);

  // Restricted areas
  for (const area of scene.restrictedAreas) {
    const areaPoints = area.vertices.map((v) => `${tx(v.x).toFixed(1)},${tz(v.z).toFixed(1)}`).join(" ");
    parts.push(`<polygon points="${escAttr(areaPoints)}" fill="#214b40" fill-opacity="0.08" stroke="#214b40" stroke-width="0.8" stroke-dasharray="3 2"/>`);
  }

  // Belts
  for (const belt of scene.belts) {
    const from = scene.posts.find((p) => p.id === belt.fromPostId);
    const to = scene.posts.find((p) => p.id === belt.toPostId);
    if (from && to) {
      parts.push(`<line x1="${tx(from.position.x).toFixed(1)}" y1="${tz(from.position.z).toFixed(1)}" x2="${tx(to.position.x).toFixed(1)}" y2="${tz(to.position.z).toFixed(1)}" stroke="#214b40" stroke-width="1.2"/>`);
    }
  }

  // Posts
  for (const post of scene.posts) {
    parts.push(`<circle cx="${tx(post.position.x).toFixed(1)}" cy="${tz(post.position.z).toFixed(1)}" r="3.5" fill="#214b40"/>`);
  }

  // People
  for (const person of scene.people) {
    parts.push(`<circle cx="${tx(person.position.x).toFixed(1)}" cy="${tz(person.position.z).toFixed(1)}" r="2.8" fill="#214b40" fill-opacity="0.55"/>`);
  }

  // Routes
  for (const route of scene.routes) {
    if (route.points.length >= 2) {
      const routeD = route.points.map((p, i) => `${i === 0 ? "M" : "L"}${tx(p.x).toFixed(1)},${tz(p.z).toFixed(1)}`).join(" ");
      parts.push(`<path d="${escAttr(routeD)}" fill="none" stroke="#214b40" stroke-width="0.7" stroke-dasharray="4 2" opacity="0.5"/>`);
    }
  }

  parts.push("</svg>");
  return parts.join("\n");
}

export function sceneThumbnailDataUri(scene: ProjectScene, width?: number, height?: number): string {
  const svg = generateSceneThumbnailSvg(scene, width, height);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
