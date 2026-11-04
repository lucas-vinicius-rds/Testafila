'use client';

import { type ThreeEvent, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

const BUTTON_WIDTH_PX = 80;
const BUTTON_HEIGHT_PX = 48;
const MIN_OFFSET_PX = 72;
const TAP_TOLERANCE_PX = 12;

export function worldUnitsPerPixel(camera: THREE.Camera, viewportHeight: number, worldPosition: THREE.Vector3): number {
  const height = Math.max(viewportHeight, 1);
  if (camera instanceof THREE.PerspectiveCamera) {
    return (2 * camera.position.distanceTo(worldPosition) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / height;
  }
  if (camera instanceof THREE.OrthographicCamera) {
    return (camera.top - camera.bottom) / (Math.max(camera.zoom, 1e-6) * height);
  }
  return 0;
}

function createTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = BUTTON_WIDTH_PX * 3;
  canvas.height = BUTTON_HEIGHT_PX * 3;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Não foi possível criar o contexto 2D da ação da cena.');
  context.fillStyle = '#214b40';
  context.beginPath();
  context.roundRect(6, 6, canvas.width - 12, canvas.height - 12, 24);
  context.fill();
  context.strokeStyle = '#f8f6ef';
  context.lineWidth = 6;
  context.stroke();
  context.fillStyle = '#ffffff';
  context.font = '700 78px Arial, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('+1', canvas.width / 2, canvas.height / 2 + 4);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Botão +1 nas costas da pessoa, com tamanho fixo em pixels em qualquer zoom. */
export function AppendPersonButton({ spacingMeters, heightMeters, onAppend }: { spacingMeters: number; heightMeters: number; onAppend: () => void }) {
  const anchorRef = useRef<THREE.Group | null>(null);
  const spriteRef = useRef<THREE.Sprite | null>(null);
  const worldPosition = useRef(new THREE.Vector3());
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const texture = useMemo(createTexture, []);
  const material = useMemo(() => new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }), [texture]);
  useEffect(() => () => { material.dispose(); texture.dispose(); }, [material, texture]);

  useFrame(({ camera, size }) => {
    const sprite = spriteRef.current;
    const anchor = anchorRef.current;
    if (!sprite || !anchor) return;
    const unit = worldUnitsPerPixel(camera, size.height, sprite.getWorldPosition(worldPosition.current));
    if (!unit) return;
    sprite.scale.set(BUTTON_WIDTH_PX * unit, BUTTON_HEIGHT_PX * unit, 1);
    // Longe da câmera, afasta o botão para ele não cobrir a pessoa selecionada.
    anchor.position.z = -Math.max(spacingMeters, MIN_OFFSET_PX * unit);
  });

  const isolate = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();
  };

  return <group ref={anchorRef} position={[0, heightMeters + 0.15, -spacingMeters]}>
    <sprite
      ref={spriteRef}
      renderOrder={10}
      onPointerDown={(event) => { isolate(event); pressStart.current = { x: event.nativeEvent.clientX, y: event.nativeEvent.clientY }; }}
      onPointerMove={isolate}
      onPointerUp={isolate}
      onPointerCancel={(event) => { isolate(event); pressStart.current = null; }}
      onLostPointerCapture={isolate}
      onClick={(event) => {
        event.stopPropagation();
        const start = pressStart.current;
        pressStart.current = null;
        if (start && Math.hypot(event.nativeEvent.clientX - start.x, event.nativeEvent.clientY - start.y) <= TAP_TOLERANCE_PX) onAppend();
      }}
    >
      <primitive object={material} attach="material" />
    </sprite>
  </group>;
}
