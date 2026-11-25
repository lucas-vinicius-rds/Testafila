import type { Belt, PointXZ, Stanchion } from '../../contracts/project.ts';

/**
 * Modelos de fila prontos: corredores de fitas entre postes que o usuário posiciona,
 * gira e depois ajusta peça por peça. Tudo em metros, no plano XZ.
 *
 * Coordenadas locais: as raias correm ao longo de +X e se empilham em +Z. A primeira
 * pessoa (cabeça da fila) fica na saída e olha para fora; a fila cresce para trás.
 */
export type QueueTemplateKind = 'straight' | 'u' | 'l' | 'zigzag';

export interface QueueTemplateParams {
  kind: QueueTemplateKind;
  /** Comprimento de cada raia (no L, a primeira perna). */
  laneLengthMeters: number;
  /** Largura livre do corredor entre fitas. */
  corridorWidthMeters: number;
  /** Número de raias do zigue-zague. Reta = 1, U = 2. */
  lanes: number;
  /** Segunda perna do L. */
  secondLegMeters: number;
  /** Centro do modelo na planta. */
  center: PointXZ;
  /** Giro em torno do centro; positivo leva +X para +Z. */
  rotationRadians: number;
}

export interface QueueTemplateInfo {
  kind: QueueTemplateKind;
  label: string;
  description: string;
}

export const QUEUE_TEMPLATES: readonly QueueTemplateInfo[] = [
  { kind: 'straight', label: 'Reta', description: 'Um corredor único.' },
  { kind: 'l', label: 'Em L', description: 'Um corredor com uma curva de 90°.' },
  { kind: 'u', label: 'Em U', description: 'Duas raias com um retorno.' },
  { kind: 'zigzag', label: 'Zigue-zague', description: 'Várias raias com retornos alternados, como em aeroportos e bancos.' },
];

export const QUEUE_TEMPLATE_LIMITS = {
  laneLengthMeters: { min: 2, max: 30 },
  corridorWidthMeters: { min: 0.7, max: 2 },
  lanes: { min: 3, max: 12 },
  secondLegMeters: { min: 2, max: 30 },
} as const;

export const POST_HEIGHT_METERS = 0.95;
export const POST_BASE_RADIUS_METERS = 0.08;
export const BELT_HEIGHT_METERS = 0.86;
/** Fitas retráteis comuns têm de 2 a 3 m; trechos maiores ganham postes intermediários. */
export const MAX_BELT_METERS = 2.5;
/** Distância da cabeça da fila até a ponta da saída. */
const HEAD_INSET_METERS = 0.4;

export function defaultQueueTemplate(kind: QueueTemplateKind, center: PointXZ): QueueTemplateParams {
  return {
    kind,
    laneLengthMeters: kind === 'l' ? 5 : 6,
    corridorWidthMeters: 1,
    lanes: kind === 'straight' ? 1 : kind === 'u' ? 2 : 4,
    secondLegMeters: 4,
    center,
    rotationRadians: 0,
  };
}

export interface QueueTemplateLayout {
  posts: Stanchion[];
  belts: Belt[];
  /** Onde fica a primeira pessoa e para onde olha (yaw 0 olha para +Z). */
  head: { position: PointXZ; yawRadians: number };
}

const clamp = (value: number, { min, max }: { min: number; max: number }) => Math.min(max, Math.max(min, value));

function laneCount(params: QueueTemplateParams): number {
  if (params.kind === 'straight') return 1;
  if (params.kind === 'u') return 2;
  return Math.round(clamp(params.lanes, QUEUE_TEMPLATE_LIMITS.lanes));
}

/** Linhas de fita (polilinhas) e cabeça da fila, em coordenadas locais. */
function localShape(params: QueueTemplateParams): { lines: PointXZ[][]; head: PointXZ; headDirection: PointXZ } {
  const length = clamp(params.laneLengthMeters, QUEUE_TEMPLATE_LIMITS.laneLengthMeters);
  const width = clamp(params.corridorWidthMeters, QUEUE_TEMPLATE_LIMITS.corridorWidthMeters);

  if (params.kind === 'l') {
    const leg = clamp(params.secondLegMeters, QUEUE_TEMPLATE_LIMITS.secondLegMeters);
    // Entra em x = 0 andando em +X, vira na quina e sai andando em +Z.
    return {
      lines: [
        [{ x: 0, z: 0 }, { x: length, z: 0 }, { x: length, z: leg }],
        [{ x: 0, z: width }, { x: length - width, z: width }, { x: length - width, z: leg }],
      ],
      head: { x: length - width / 2, z: leg - HEAD_INSET_METERS },
      headDirection: { x: 0, z: 1 },
    };
  }

  // Serpentina: a raia 0 sai em x = length andando em +X; a raia k entra pela
  // ponta oposta. O retorno entre as raias i-1 e i fica à esquerda (x = 0) quando
  // i é ímpar e à direita (x = length) quando é par.
  const lanes = laneCount(params);
  const lines: PointXZ[][] = [];
  for (let i = 0; i <= lanes; i += 1) {
    const z = i * width;
    if (i === 0 || i === lanes) lines.push([{ x: 0, z }, { x: length, z }]);
    else if (i % 2 === 1) lines.push([{ x: width, z }, { x: length, z }]);
    else lines.push([{ x: 0, z }, { x: length - width, z }]);
  }
  for (let i = 1; i < lanes; i += 1) {
    const x = i % 2 === 1 ? 0 : length;
    lines.push([{ x, z: (i - 1) * width }, { x, z: (i + 1) * width }]);
  }
  return { lines, head: { x: length - HEAD_INSET_METERS, z: width / 2 }, headDirection: { x: 1, z: 0 } };
}

/** Divide cada trecho em pedaços de até MAX_BELT_METERS. */
function splitLine(line: readonly PointXZ[]): PointXZ[] {
  const points: PointXZ[] = [line[0]!];
  for (let index = 1; index < line.length; index += 1) {
    const start = line[index - 1]!;
    const end = line[index]!;
    const pieces = Math.max(1, Math.ceil(Math.hypot(end.x - start.x, end.z - start.z) / MAX_BELT_METERS - 1e-9));
    for (let piece = 1; piece <= pieces; piece += 1) {
      const t = piece / pieces;
      points.push({ x: start.x + (end.x - start.x) * t, z: start.z + (end.z - start.z) * t });
    }
  }
  return points;
}

export function buildQueueTemplate(params: QueueTemplateParams, createId: (prefix: string) => string): QueueTemplateLayout {
  const shape = localShape(params);
  const all = shape.lines.flat();
  const minX = Math.min(...all.map((p) => p.x)); const maxX = Math.max(...all.map((p) => p.x));
  const minZ = Math.min(...all.map((p) => p.z)); const maxZ = Math.max(...all.map((p) => p.z));
  const pivot = { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
  const cos = Math.cos(params.rotationRadians);
  const sin = Math.sin(params.rotationRadians);
  const place = (p: PointXZ): PointXZ => {
    const x = p.x - pivot.x; const z = p.z - pivot.z;
    return { x: params.center.x + x * cos - z * sin, z: params.center.z + x * sin + z * cos };
  };

  const posts: Stanchion[] = [];
  const postsByKey = new Map<string, Stanchion>();
  const postAt = (local: PointXZ): Stanchion => {
    // Linhas que se encontram dividem o mesmo poste.
    const key = `${Math.round(local.x * 1000)},${Math.round(local.z * 1000)}`;
    let post = postsByKey.get(key);
    if (!post) {
      post = { id: createId('post'), position: place(local), heightMeters: POST_HEIGHT_METERS, baseRadiusMeters: POST_BASE_RADIUS_METERS };
      postsByKey.set(key, post);
      posts.push(post);
    }
    return post;
  };

  const belts: Belt[] = [];
  for (const line of shape.lines) {
    const points = splitLine(line);
    for (let index = 1; index < points.length; index += 1) {
      const from = postAt(points[index - 1]!);
      const to = postAt(points[index]!);
      belts.push({ id: createId('belt'), fromPostId: from.id, toPostId: to.id, heightMeters: BELT_HEIGHT_METERS });
    }
  }

  const direction = { x: shape.headDirection.x * cos - shape.headDirection.z * sin, z: shape.headDirection.x * sin + shape.headDirection.z * cos };
  return { posts, belts, head: { position: place(shape.head), yawRadians: Math.atan2(direction.x, direction.z) } };
}
