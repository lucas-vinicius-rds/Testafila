import * as THREE from 'three';
import type { PointXZ } from '@testafila/core/contracts/project';

const LABEL_LIFT_METERS = 0.05;
const LABEL_HEIGHT = 0.05; // Fração da tela: sizeAttenuation desligado mantém o tamanho a qualquer distância.
const CANVAS_WIDTH = 256;
const CANVAS_HEIGHT = 96;
const metersFormat = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Label = Readonly<{ sprite: THREE.Sprite; context: CanvasRenderingContext2D; texture: THREE.CanvasTexture; material: THREE.SpriteMaterial }> & { text: string };

export type Segment = readonly [PointXZ, PointXZ];

export type MeasureLabels = Readonly<{
  setLive: (from: PointXZ | null, to: PointXZ | null) => void;
  setSegments: (segments: readonly Segment[]) => void;
  dispose: () => void;
}>;

function createLabel(parent: THREE.Object3D): Label | null {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false, toneMapped: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(LABEL_HEIGHT * (CANVAS_WIDTH / CANVAS_HEIGHT), LABEL_HEIGHT, 1);
  sprite.renderOrder = 20;
  sprite.frustumCulled = false;
  sprite.visible = false;
  parent.add(sprite);
  return { sprite, context, texture, material, text: '' };
}

function show(label: Label, from: PointXZ, to: PointXZ) {
  label.sprite.visible = true;
  label.sprite.position.set((from.x + to.x) / 2, LABEL_LIFT_METERS, (from.z + to.z) / 2);
  const text = `${metersFormat.format(Math.hypot(to.x - from.x, to.z - from.z))} m`;
  if (text === label.text) return;
  label.text = text;
  const { context } = label;
  context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  context.fillStyle = '#214b40';
  context.beginPath();
  context.roundRect(4, 4, CANVAS_WIDTH - 8, CANVAS_HEIGHT - 8, 16);
  context.fill();
  context.fillStyle = '#ffffff';
  context.font = '700 56px Arial, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 3);
  label.texture.needsUpdate = true;
}

/** Medidas junto das linhas, nas coordenadas do projeto. A distância é a real, sem escala. */
export function createMeasureLabels(parent: THREE.Object3D): MeasureLabels {
  const live = createLabel(parent);
  const pool: Label[] = [];
  return {
    setLive: (from, to) => {
      if (!live) return;
      if (from && to) show(live, from, to);
      else live.sprite.visible = false;
    },
    setSegments: (segments) => {
      while (pool.length < segments.length) {
        const label = createLabel(parent);
        if (!label) break;
        pool.push(label);
      }
      pool.forEach((label, index) => {
        const segment = segments[index];
        if (segment) show(label, segment[0], segment[1]);
        else label.sprite.visible = false;
      });
    },
    dispose: () => {
      for (const label of live ? [live, ...pool] : pool) {
        parent.remove(label.sprite);
        label.material.dispose();
        label.texture.dispose();
      }
    },
  };
}
