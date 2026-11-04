'use client';

import { Canvas, type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Component, createContext, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { Belt, PointXZ, ProjectScene, Stanchion } from '@testafila/core/contracts/project';
import type { EditorSelection } from '@testafila/core/contracts/queue-editor';
import type { AreaWallDistances, CanvasTool, FloorProjector, GridStepMeters, InteractionMode, SceneViewerProps } from '@testafila/core/contracts/scene-viewer';

const palette = { floor: '#f8f6ef', wall: '#d8dcd4', green: '#355b48', dark: '#243c32', line: '#c8c5b8', area: '#e8ece4', person: '#606963', guide: '#1e382b' };

type ScenePointerEvent = ThreeEvent<PointerEvent>;
type DragPreview = { selection: EditorSelection; delta: PointXZ };
type PointerCaptureTarget = { setPointerCapture: (pointerId: number) => void; releasePointerCapture: (pointerId: number) => void };
type DragSession = DragPreview & { pointerId: number; start: PointXZ; target: PointerCaptureTarget };
type FloorGesture = { pointerId: number; start: PointXZ; end: PointXZ; target: PointerCaptureTarget };
type PickTargetEntry = { sprite: THREE.Sprite | null; worldPosition: THREE.Vector3; maxWorldSize: number };
type EntityHandlers = {
  onPointerDown: (event: ScenePointerEvent) => void;
  onPointerMove: (event: ScenePointerEvent) => void;
  onPointerUp: (event: ScenePointerEvent) => void;
  onPointerCancel: (event: ScenePointerEvent) => void;
  onLostPointerCapture: (event: ScenePointerEvent) => void;
  onClick: (event: ThreeEvent<MouseEvent>) => void;
};
interface SceneInteraction {
  selection: EditorSelection | null;
  preview: DragPreview | null;
  dragging: boolean;
  controlsRef: { current: OrbitControlsImpl | null };
  select: (selection: EditorSelection | null) => void;
  handlers: (selection: EditorSelection, draggable?: boolean) => EntityHandlers;
  tool: SceneViewerProps['tool'];
  interactionMode: InteractionMode;
  gridStep: GridStepMeters;
  areaGesture: FloorGesture | null;
  setAreaGesture: (gesture: FloorGesture | null) => void;
  onAreaDraw?: SceneViewerProps['onAreaDraw'];
  perimeterHandlers: (id: string, position: PointXZ) => Record<string, (event: ScenePointerEvent) => void>;
  perimeterPreview: { id: string; position: PointXZ } | null;
  onAppendPerson?: SceneViewerProps['onAppendPerson'];
  registerPickTarget: (entry: PickTargetEntry) => () => void;
}
const SceneInteractionContext = createContext<SceneInteraction | null>(null);

function releasePointerCapture(target: PointerCaptureTarget, pointerId: number) {
  try { target.releasePointerCapture(pointerId); }
  catch (error) {
    if (!(error instanceof Error && error.name === 'NotFoundError')) console.error('Falha ao liberar captura de ponteiro da cena.', error);
  }
}

function useSceneInteraction() {
  const value = useContext(SceneInteractionContext);
  if (!value) throw new Error('Scene interaction context missing');
  return value;
}

function useEntityHandlers(selection: EditorSelection, draggable = false) {
  return useSceneInteraction().handlers(selection, draggable);
}

function snapPoint(point: PointXZ, step: GridStepMeters): PointXZ {
  if (!step || step <= 0) return point;
  return {
    x: Math.round(point.x / step) * step,
    z: Math.round(point.z / step) * step,
  };
}

function calculateAreaDistances(areaVertices: PointXZ[], perimeterVertices: PointXZ[]): { north: number; south: number; east: number; west: number } | null {
  if (perimeterVertices.length < 4 || areaVertices.length < 3) return null;
  // Verifica se o perímetro é ortogonal/retangular alinhado aos eixos
  let perimMinX = Infinity; let perimMaxX = -Infinity;
  let perimMinZ = Infinity; let perimMaxZ = -Infinity;
  for (const v of perimeterVertices) {
    if (v.x < perimMinX) perimMinX = v.x;
    if (v.x > perimMaxX) perimMaxX = v.x;
    if (v.z < perimMinZ) perimMinZ = v.z;
    if (v.z > perimMaxZ) perimMaxZ = v.z;
  }
  for (let i = 0; i < perimeterVertices.length; i++) {
    const a = perimeterVertices[i];
    const b = perimeterVertices[(i + 1) % perimeterVertices.length];
    const isHoriz = Math.abs(a.z - b.z) < 1e-4;
    const isVert = Math.abs(a.x - b.x) < 1e-4;
    if (!isHoriz && !isVert) return null;
  }
  let areaMinX = Infinity; let areaMaxX = -Infinity;
  let areaMinZ = Infinity; let areaMaxZ = -Infinity;
  for (const v of areaVertices) {
    if (v.x < areaMinX) areaMinX = v.x;
    if (v.x > areaMaxX) areaMaxX = v.x;
    if (v.z < areaMinZ) areaMinZ = v.z;
    if (v.z > areaMaxZ) areaMaxZ = v.z;
  }
  const north = Math.max(0, perimMaxZ - areaMaxZ); // +Z
  const south = Math.max(0, areaMinZ - perimMinZ); // -Z
  const east = Math.max(0, perimMaxX - areaMaxX);   // +X
  const west = Math.max(0, areaMinX - perimMinX);   // -X
  return { north, south, east, west };
}

function boundsOf(scene: ProjectScene) {
  const points = [
    ...scene.environment.perimeter,
    ...scene.restrictedAreas.flatMap((area) => area.vertices),
    ...scene.posts.map((post) => post.position),
    ...scene.routes.flatMap((route) => route.points),
    ...scene.people.map((person) => person.position),
  ];
  if (!points.length) return { minX: -5, maxX: 5, minZ: -4, maxZ: 4 };
  const minX = Math.min(...points.map((p) => p.x)); const maxX = Math.max(...points.map((p) => p.x));
  const minZ = Math.min(...points.map((p) => p.z)); const maxZ = Math.max(...points.map((p) => p.z));
  const pad = Math.max(0.35, Math.max(maxX - minX, maxZ - minZ) * 0.06);
  return { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };
}

function polygonGeometry(vertices: PointXZ[], y: number) {
  const contour = vertices.map((point) => new THREE.Vector2(point.x, point.z));
  const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
  const positions = contour.flatMap((point) => [point.x, y, point.y]);
  const indices = triangles.flatMap(([a, b, c]) => [a, c, b]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function pointInPolygon(point: PointXZ, vertices: PointXZ[]) {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const a = vertices[i]; const b = vertices[j];
    if ((a.z > point.z) !== (b.z > point.z) && point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

function Floor({ scene, bounds, onFloorPoint, gridStep }: { scene: ProjectScene; bounds: ReturnType<typeof boundsOf>; onFloorPoint?: SceneViewerProps['onFloorPoint']; gridStep: GridStepMeters }) {
  const { select, tool, areaGesture, setAreaGesture, onAreaDraw } = useSceneInteraction();
  const geometry = useMemo(() => polygonGeometry(scene.environment.perimeter, 0), [scene.environment.perimeter]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const click = useCallback((event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (tool && tool !== 'post' && tool !== 'person') return;
    select(null);
    const pt = snapPoint({ x: event.point.x, z: event.point.z }, gridStep);
    onFloorPoint?.(pt);
  }, [gridStep, onFloorPoint, select, tool]);
  const areaPointerDown = (event: ScenePointerEvent) => {
    if (tool !== 'area') return;
    event.stopPropagation(); event.nativeEvent.stopImmediatePropagation();
    const target = event.target as unknown as PointerCaptureTarget;
    try { target.setPointerCapture(event.pointerId); } catch (error) {
      releasePointerCapture(target, event.pointerId);
      if (!(error instanceof Error && error.name === 'NotFoundError')) console.error('O navegador recusou a captura do desenho da área.', error);
      return;
    }
    const point = snapPoint({ x: event.point.x, z: event.point.z }, gridStep);
    setAreaGesture({ pointerId: event.pointerId, start: point, end: point, target });
  };
  const areaPointerMove = (event: ScenePointerEvent) => {
    const gesture = areaGesture;
    if (tool !== 'area' || !gesture || gesture.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const end = snapPoint({ x: event.point.x, z: event.point.z }, gridStep);
    if (pointInPolygon(end, scene.environment.perimeter)) setAreaGesture({ ...gesture, end });
  };
  const areaFinish = (event: ScenePointerEvent, commit: boolean) => {
    const gesture = areaGesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.stopPropagation(); event.nativeEvent.stopImmediatePropagation();
    const end = snapPoint({ x: event.point.x, z: event.point.z }, gridStep);
    setAreaGesture(null);
    releasePointerCapture(gesture.target, event.pointerId);
    if (commit && pointInPolygon(end, scene.environment.perimeter) && Math.hypot(end.x - gesture.start.x, end.z - gesture.start.z) > 0.05) onAreaDraw?.(gesture.start, end);
  };
  const grid = useMemo(() => {
    if (gridStep === null) return null;
    const step = gridStep;
    const vertices: number[] = [];
    const startX = Math.floor(bounds.minX / step) * step;
    const endX = Math.ceil(bounds.maxX / step) * step;
    const startZ = Math.floor(bounds.minZ / step) * step;
    const endZ = Math.ceil(bounds.maxZ / step) * step;
    for (let x = startX; x <= endX + 1e-6; x += step) vertices.push(x, 0.006, startZ, x, 0.006, endZ);
    for (let z = startZ; z <= endZ + 1e-6; z += step) vertices.push(startX, 0.006, z, endX, 0.006, z);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    return geo;
  }, [bounds.maxX, bounds.maxZ, bounds.minX, bounds.minZ, gridStep]);
  useEffect(() => () => { grid?.dispose(); }, [grid]);
  return <group>
    <mesh onClick={click} onPointerDown={areaPointerDown} onPointerMove={areaPointerMove} onPointerUp={(event) => areaFinish(event, true)} onPointerCancel={(event) => areaFinish(event, false)} onLostPointerCapture={(event) => areaFinish(event, false)}>
      <primitive object={geometry} attach="geometry" />
      <meshStandardMaterial color={palette.floor} side={THREE.DoubleSide} />
    </mesh>
    {grid && <lineSegments raycast={() => null}><primitive object={grid} attach="geometry" /><lineBasicMaterial color={palette.line} transparent opacity={0.5} /></lineSegments>}
  </group>;
}

function FloorProjectorRegistration({ scene, register }: { scene: ProjectScene; register?: SceneViewerProps['onRegisterFloorProjector'] }) {
  const { camera, gl, raycaster } = useThree();
  const projector = useMemo<FloorProjector>(() => (clientX, clientY) => {
    const rect = gl.domElement.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom || !rect.width || !rect.height) return null;
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc as never, camera);
    const direction = raycaster.ray.direction;
    if (Math.abs(direction.y) < 1e-8) return null;
    const distance = -raycaster.ray.origin.y / direction.y;
    if (distance < 0) return null;
    const xz = { x: raycaster.ray.origin.x + direction.x * distance, z: raycaster.ray.origin.z + direction.z * distance };
    return pointInPolygon(xz, scene.environment.perimeter) ? xz : null;
  }, [camera, gl.domElement, raycaster, scene.environment.perimeter]);
  useEffect(() => { register?.(projector); return () => register?.(null); }, [projector, register]);
  return null;
}

function DraftArea({ vertices }: { vertices: PointXZ[] }) {
  const geometry = useMemo(() => vertices.length >= 3 ? polygonGeometry(vertices, 0.025) : null, [vertices]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  const outline = useMemo(() => { const g = new THREE.BufferGeometry(); if (vertices.length) g.setFromPoints(vertices.map((p) => new THREE.Vector3(p.x, 0.04, p.z))); return g; }, [vertices]);
  useEffect(() => () => outline.dispose(), [outline]);
  return <group raycast={() => null}>
    {geometry && <mesh raycast={() => null}><primitive object={geometry} attach="geometry" /><meshBasicMaterial color={palette.area} transparent opacity={0.55} side={THREE.DoubleSide} depthWrite={false} /></mesh>}
    {vertices.length > 1 && <lineLoop raycast={() => null}><primitive object={outline} attach="geometry" /><lineBasicMaterial color={palette.green} /></lineLoop>}
  </group>;
}

function DraftBelt({ from, to }: { from: Stanchion; to: Stanchion }) {
  const dx = to.position.x - from.position.x; const dz = to.position.z - from.position.z;
  const length = Math.hypot(dx, dz);
  return <mesh position={[(from.position.x + to.position.x) / 2, 0.72, (from.position.z + to.position.z) / 2]} rotation={[0, -Math.atan2(dz, dx), 0]} raycast={() => null}>
    <boxGeometry args={[length, 0.035, 0.025]} /><meshBasicMaterial color={palette.green} transparent opacity={0.52} />
  </mesh>;
}

function PlacementPreview({ preview, scene }: { preview: NonNullable<SceneViewerProps['placementPreview']>; scene: ProjectScene }) {
  if (preview.kind === 'post') return <group position={[preview.point.x, 0, preview.point.z]} raycast={() => null}>
    <mesh position={[0, 0.04, 0]}><cylinderGeometry args={[0.08, 0.08, 0.08, 20]} /><meshBasicMaterial color={palette.dark} transparent opacity={0.45} /></mesh>
    <mesh position={[0, 0.515, 0]}><cylinderGeometry args={[0.025, 0.03, 0.95, 12]} /><meshBasicMaterial color={palette.green} transparent opacity={0.48} /></mesh>
  </group>;
  return <mesh position={[preview.point.x, scene.simulation.personHeightMeters / 2, preview.point.z]} raycast={() => null}>
    <capsuleGeometry args={[scene.simulation.personRadiusMeters, Math.max(0.01, scene.simulation.personHeightMeters - scene.simulation.personRadiusMeters * 2), 6, 10]} />
    <meshBasicMaterial color={palette.person} transparent opacity={0.42} />
  </mesh>;
}

function createLabelTexture(text: string, kind: 'dimension' | 'area', selected: boolean) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Não foi possível criar o contexto 2D dos rótulos da cena.');
  const fontSize = 40;
  const paddingX = 18;
  const paddingY = 12;
  context.font = `${selected ? 700 : 400} ${fontSize}px Arial, sans-serif`;
  const textWidth = Math.ceil(context.measureText(text).width);
  canvas.width = textWidth + paddingX * 2;
  canvas.height = fontSize + paddingY * 2;
  context.font = `${selected ? 700 : 400} ${fontSize}px Arial, sans-serif`;
  context.textBaseline = 'middle';
  context.fillStyle = '#f8f6ef';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = selected ? palette.dark : kind === 'dimension' ? palette.green : '#c8c5b8';
  context.lineWidth = selected ? 6 : 3;
  context.strokeRect(context.lineWidth / 2, context.lineWidth / 2, canvas.width - context.lineWidth, canvas.height - context.lineWidth);
  context.fillStyle = palette.dark;
  context.fillText(text, paddingX, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createActionTexture(text: string) {
  const canvas = document.createElement('canvas'); canvas.width = 192; canvas.height = 96;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Não foi possível criar o contexto 2D da ação da cena.');
  context.fillStyle = palette.dark; context.beginPath(); context.roundRect(4, 4, 184, 88, 28); context.fill();
  context.strokeStyle = '#f8f6ef'; context.lineWidth = 4; context.stroke();
  context.fillStyle = '#f8f6ef'; context.font = '700 54px Arial, sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(text, 96, 50);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true; return texture;
}

function SceneLabel({ text, kind, selected = false, position }: { text: string; kind: 'dimension' | 'area'; selected?: boolean; position: [number, number, number] }) {
  const spriteRef = useRef<THREE.Sprite | null>(null);
  const worldPosition = useRef(new THREE.Vector3());
  const texture = useMemo(() => createLabelTexture(text, kind, selected), [kind, selected, text]);
  const material = useMemo(() => new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }), [texture]);
  useEffect(() => () => { material.dispose(); texture.dispose(); }, [material, texture]);
  useFrame(({ camera: activeCamera, size: activeSize }) => {
    const sprite = spriteRef.current;
    if (!sprite) return;
    let worldUnitsPerPixel = 0;
    if (activeCamera instanceof THREE.PerspectiveCamera) {
      const distance = activeCamera.position.distanceTo(sprite.getWorldPosition(worldPosition.current));
      worldUnitsPerPixel = (2 * distance * Math.tan(THREE.MathUtils.degToRad(activeCamera.fov / 2))) / Math.max(activeSize.height, 1);
    } else if (activeCamera instanceof THREE.OrthographicCamera) {
      worldUnitsPerPixel = (activeCamera.top - activeCamera.bottom) / (Math.max(activeCamera.zoom, 1e-6) * Math.max(activeSize.height, 1));
    }
    const height = worldUnitsPerPixel * 19;
    const width = height * (texture.image.width / texture.image.height);
    if (Math.abs(sprite.scale.x - width) > 1e-4 || Math.abs(sprite.scale.y - height) > 1e-4) sprite.scale.set(width, height, 1);
  });
  return <sprite ref={spriteRef} position={position} raycast={() => null}>
    <primitive object={material} attach="material" />
  </sprite>;
}

function Walls({ scene, view }: { scene: ProjectScene; view: SceneViewerProps['view'] }) {
  const vertices = scene.environment.perimeter; const height = scene.environment.wallHeightMeters;
  const opacity = view === 'top' ? 0.16 : 0.26;
  return <group>{vertices.map((a, index) => {
    const b = vertices[(index + 1) % vertices.length]; const dx = b.x - a.x; const dz = b.z - a.z; const length = Math.hypot(dx, dz);
    if (!length) return null;
    return <mesh key={`wall-${index}`} position={[(a.x + b.x) / 2, height / 2, (a.z + b.z) / 2]} rotation={[0, -Math.atan2(dz, dx), 0]}>
      <boxGeometry args={[length, height, 0.12]} /><meshStandardMaterial color={palette.wall} transparent opacity={opacity} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>;
  })}</group>;
}

function Dimensions({ scene }: { scene: ProjectScene }) {
  const vertices = scene.environment.perimeter;
  return <group>{vertices.map((a, index) => {
    const b = vertices[(index + 1) % vertices.length]; const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (!length) return null;
    return <SceneLabel key={`dimension-${index}`} kind="dimension" text={`${length.toFixed(2)} m`} position={[(a.x + b.x) / 2, 0.045, (a.z + b.z) / 2]} />;
  })}</group>;
}

function AreaPolygon({ area, perimeter }: { area: ProjectScene['restrictedAreas'][number]; perimeter: PointXZ[] }) {
  const { selection, preview } = useSceneInteraction();
  const handlers = useEntityHandlers({ kind: 'area', id: area.id }, true);
  const selected = selection?.kind === 'area' && selection.id === area.id;
  const delta = preview?.selection.kind === 'area' && preview.selection.id === area.id ? preview.delta : { x: 0, z: 0 };
  const geometry = useMemo(() => polygonGeometry(area.vertices, 0.018), [area.vertices]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const outline = useMemo(() => {
    const outlineGeometry = new THREE.BufferGeometry();
    outlineGeometry.setFromPoints(area.vertices.map((vertex) => new THREE.Vector3(vertex.x, 0.035, vertex.z)));
    return outlineGeometry;
  }, [area.vertices]);
  useEffect(() => () => outline.dispose(), [outline]);
  const label: [number, number, number] = [area.vertices.reduce((s, p) => s + p.x, 0) / area.vertices.length, 0.04, area.vertices.reduce((s, p) => s + p.z, 0) / area.vertices.length];
  
  // Distâncias externas até as paredes em planta ortogonal/retangular
  const distances = useMemo(() => selected ? calculateAreaDistances(area.vertices, perimeter) : null, [area.vertices, perimeter, selected]);

  const guideLines = useMemo(() => {
    if (!selected || !distances) return null;
    let minX = Infinity; let maxX = -Infinity;
    let minZ = Infinity; let maxZ = -Infinity;
    for (const v of area.vertices) {
      if (v.x < minX) minX = v.x;
      if (v.x > maxX) maxX = v.x;
      if (v.z < minZ) minZ = v.z;
      if (v.z > maxZ) maxZ = v.z;
    }
    const midX = (minX + maxX) / 2;
    const midZ = (minZ + maxZ) / 2;
    let perimMinX = Infinity; let perimMaxX = -Infinity;
    let perimMinZ = Infinity; let perimMaxZ = -Infinity;
    for (const v of perimeter) {
      if (v.x < perimMinX) perimMinX = v.x;
      if (v.x > perimMaxX) perimMaxX = v.x;
      if (v.z < perimMinZ) perimMinZ = v.z;
      if (v.z > perimMaxZ) perimMaxZ = v.z;
    }
    // Segmentos: midX de maxZ até perimMaxZ (norte), midX de minZ até perimMinZ (sul), midZ de maxX até perimMaxX (leste), midZ de minX até perimMinX (oeste)
    const pts = [
      new THREE.Vector3(midX, 0.03, maxZ), new THREE.Vector3(midX, 0.03, perimMaxZ),
      new THREE.Vector3(midX, 0.03, minZ), new THREE.Vector3(midX, 0.03, perimMinZ),
      new THREE.Vector3(maxX, 0.03, midZ), new THREE.Vector3(perimMaxX, 0.03, midZ),
      new THREE.Vector3(minX, 0.03, midZ), new THREE.Vector3(perimMinX, 0.03, midZ),
    ];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    return {
      geo,
      northLabelPos: [midX, 0.05, (maxZ + perimMaxZ) / 2] as [number, number, number],
      southLabelPos: [midX, 0.05, (minZ + perimMinZ) / 2] as [number, number, number],
      eastLabelPos: [(maxX + perimMaxX) / 2, 0.05, midZ] as [number, number, number],
      westLabelPos: [(minX + perimMinX) / 2, 0.05, midZ] as [number, number, number],
    };
  }, [area.vertices, distances, perimeter, selected]);

  useEffect(() => () => { guideLines?.geo.dispose(); }, [guideLines]);

  return <group position={[delta.x, 0, delta.z]}>
    <mesh {...handlers}>
      <primitive object={geometry} attach="geometry" />
      <meshStandardMaterial color={palette.area} transparent opacity={selected ? 0.95 : 0.85} side={THREE.DoubleSide} />
    </mesh>
    <SceneLabel kind="area" text={area.name} selected={selected} position={label} />
    {selected && <lineLoop raycast={() => null}><primitive object={outline} attach="geometry" /><lineBasicMaterial color={palette.dark} linewidth={2} /></lineLoop>}
    {selected && guideLines && distances && (
      <group raycast={() => null}>
        <lineSegments raycast={() => null}><primitive object={guideLines.geo} attach="geometry" /><lineBasicMaterial color={palette.green} transparent opacity={0.65} /></lineSegments>
        <SceneLabel kind="dimension" text={`${distances.north.toFixed(2)} m`} position={guideLines.northLabelPos} />
        <SceneLabel kind="dimension" text={`${distances.south.toFixed(2)} m`} position={guideLines.southLabelPos} />
        <SceneLabel kind="dimension" text={`${distances.east.toFixed(2)} m`} position={guideLines.eastLabelPos} />
        <SceneLabel kind="dimension" text={`${distances.west.toFixed(2)} m`} position={guideLines.westLabelPos} />
      </group>
    )}
  </group>;
}

function Areas({ scene }: { scene: ProjectScene }) {
  return <group>{scene.restrictedAreas.map((area) => <AreaPolygon key={area.id} area={area} perimeter={scene.environment.perimeter} />)}</group>;
}

function ScreenPickTarget({ position, maxWorldSize }: { position: [number, number, number]; maxWorldSize: number }) {
  const { registerPickTarget } = useSceneInteraction();
  const spriteRef = useRef<THREE.Sprite | null>(null);
  const entry = useRef<PickTargetEntry>({ sprite: null, worldPosition: new THREE.Vector3(), maxWorldSize });
  entry.current.maxWorldSize = maxWorldSize;
  const setSprite = useCallback((sprite: THREE.Sprite | null) => { entry.current.sprite = sprite; }, []);
  useEffect(() => registerPickTarget(entry.current), [registerPickTarget]);
  return <sprite ref={setSprite} position={position} scale={[0.04, 0.04, 1]}>
    <spriteMaterial color="#ffffff" transparent opacity={0} depthWrite={false} />
  </sprite>;
}

function PostObject({ post, maxPickWorldSize }: { post: Stanchion; maxPickWorldSize: number }) {
  const { selection, preview } = useSceneInteraction();
  const handlers = useEntityHandlers({ kind: 'post', id: post.id }, true);
  const selected = selection?.kind === 'post' && selection.id === post.id;
  const delta = preview?.selection.kind === 'post' && preview.selection.id === post.id ? preview.delta : { x: 0, z: 0 };
  return <group position={[post.position.x + delta.x, 0, post.position.z + delta.z]} {...handlers}>
    <ScreenPickTarget position={[0, post.heightMeters / 2, 0]} maxWorldSize={maxPickWorldSize} />
    <mesh position={[0, 0.035, 0]}><cylinderGeometry args={[post.baseRadiusMeters, post.baseRadiusMeters, 0.07, 20]} /><meshStandardMaterial color={palette.dark} /></mesh>
    <mesh position={[0, post.heightMeters / 2, 0]}><cylinderGeometry args={[0.035, 0.045, post.heightMeters, 12]} /><meshStandardMaterial color={palette.green} /></mesh>
    {selected && <>
      <mesh position={[0, 0.085, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}><torusGeometry args={[post.baseRadiusMeters + 0.055, 0.025, 8, 24]} /><meshBasicMaterial color={palette.dark} /></mesh>
      <mesh position={[0, post.heightMeters + 0.13, 0]} raycast={() => null}><sphereGeometry args={[0.07, 12, 10]} /><meshBasicMaterial color={palette.dark} /></mesh>
    </>}
  </group>;
}

function BeltObject({ belt, from, to }: { belt: Belt; from: Stanchion; to: Stanchion }) {
  const { selection } = useSceneInteraction();
  const handlers = useEntityHandlers({ kind: 'belt', id: belt.id });
  const selected = selection?.kind === 'belt' && selection.id === belt.id;
  const dx = to.position.x - from.position.x; const dz = to.position.z - from.position.z;
  const length = Math.hypot(dx, dz);
  const position: [number, number, number] = [(from.position.x + to.position.x) / 2, belt.heightMeters, (from.position.z + to.position.z) / 2];
  const rotation: [number, number, number] = [0, -Math.atan2(dz, dx), 0];
  return <mesh {...handlers} position={position} rotation={rotation}>
    <boxGeometry args={[length, 0.035, 0.018]} /><meshStandardMaterial color={palette.green} />
    <mesh scale={[1, 4, 10]}><boxGeometry args={[length, 0.035, 0.018]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
    {selected && <mesh scale={[1.08, 1.8, 3]} raycast={() => null}><boxGeometry args={[length, 0.035, 0.018]} /><meshBasicMaterial color={palette.dark} wireframe depthTest={false} /></mesh>}
  </mesh>;
}

function RouteObject({ route }: { route: ProjectScene['routes'][number] }) {
  const { selection } = useSceneInteraction();
  const handlers = useEntityHandlers({ kind: 'route', id: route.id });
  const selected = selection?.kind === 'route' && selection.id === route.id;
  return <group>{route.points.slice(1).map((point, index) => {
    const from = route.points[index]; const length = Math.hypot(point.x - from.x, point.z - from.z);
    const position: [number, number, number] = [(from.x + point.x) / 2, 0.025, (from.z + point.z) / 2];
    const rotation: [number, number, number] = [-Math.PI / 2, 0, Math.atan2(point.z - from.z, point.x - from.x)];
    return <group key={`${route.id}-${index}`} {...handlers} position={position} rotation={rotation}>
      {selected && <mesh raycast={() => null}><planeGeometry args={[length, 0.14]} /><meshBasicMaterial color={palette.dark} side={THREE.DoubleSide} /></mesh>}
      <mesh><planeGeometry args={[length, selected ? 0.07 : 0.055]} /><meshBasicMaterial color={palette.person} side={THREE.DoubleSide} /></mesh>
    </group>;
  })}
    {selected && route.points.map((point) => <group key={`route-handle-${route.id}-${point.id}`} {...handlers} position={[point.x, 0.05, point.z]} raycast={() => null}>
      <mesh><sphereGeometry args={[0.075, 12, 10]} /><meshBasicMaterial color={palette.dark} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.09, 0.115, 20]} /><meshBasicMaterial color={palette.dark} side={THREE.DoubleSide} /></mesh>
    </group>)}
  </group>;
}

function PersonObject({ person, scene, maxPickWorldSize }: { person: ProjectScene['people'][number]; scene: ProjectScene; maxPickWorldSize: number }) {
  const { selection, onAppendPerson, preview } = useSceneInteraction();
  const handlers = useEntityHandlers({ kind: 'person', id: person.id }, true);
  const selected = selection?.kind === 'person' && selection.id === person.id;
  const delta = preview?.selection.kind === 'person' && preview.selection.id === person.id ? preview.delta : { x: 0, z: 0 };
  const height = scene.simulation.personHeightMeters;
  const radius = scene.simulation.personRadiusMeters;
  const headRadius = Math.min(radius * 0.38, height * 0.085);
  const legLength = height * 0.31;
  const legRadius = radius * 0.2;
  const appendTexture = useMemo(() => selected && onAppendPerson ? createActionTexture('+1') : null, [onAppendPerson, selected]);
  const appendMaterial = useMemo(() => appendTexture ? new THREE.SpriteMaterial({ map: appendTexture, transparent: true, depthWrite: false, toneMapped: false }) : null, [appendTexture]);
  useEffect(() => () => { appendMaterial?.dispose(); appendTexture?.dispose(); }, [appendMaterial, appendTexture]);
  return <group position={[person.position.x + delta.x, 0, person.position.z + delta.z]} rotation={[0, person.yawRadians, 0]} {...handlers}>
    <ScreenPickTarget position={[0, height * 0.55, 0]} maxWorldSize={maxPickWorldSize} />
    {selected && <>
      <mesh position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}><ringGeometry args={[scene.simulation.personRadiusMeters + 0.035, scene.simulation.personRadiusMeters + 0.075, 24]} /><meshBasicMaterial color={palette.dark} side={THREE.DoubleSide} /></mesh>
      <mesh position={[0, scene.simulation.personHeightMeters + 0.1, 0]} raycast={() => null}><sphereGeometry args={[0.07, 12, 10]} /><meshBasicMaterial color={palette.dark} /></mesh>
    </>}
    <mesh position={[0, height * 0.6, 0]} scale={[radius * 0.66, height * 0.19, radius * 0.46]}><sphereGeometry args={[1, 16, 12]} /><meshStandardMaterial color={palette.person} /></mesh>
    <mesh position={[0, height * 0.385, 0]} scale={[radius * 0.48, height * 0.11, radius * 0.38]}><sphereGeometry args={[1, 14, 10]} /><meshStandardMaterial color={palette.person} /></mesh>
    {[-1, 1].map((side) => <group key={`leg-${side}`}>
      <mesh position={[side * radius * 0.28, height * 0.23, 0]}><cylinderGeometry args={[legRadius, legRadius * 0.9, legLength, 10]} /><meshStandardMaterial color={palette.dark} /></mesh>
      <mesh position={[side * radius * 0.28, height * 0.045, radius * 0.18]}><boxGeometry args={[radius * 0.34, height * 0.07, radius * 0.42]} /><meshStandardMaterial color={palette.dark} /></mesh>
    </group>)}
    <mesh position={[0, height * 0.88, radius * 0.025]}><sphereGeometry args={[headRadius, 16, 12]} /><meshStandardMaterial color={palette.dark} /></mesh>
    <mesh position={[0, height * 0.61, radius * 0.455]}><boxGeometry args={[radius * 0.38, height * 0.035, radius * 0.025]} /><meshStandardMaterial color={palette.green} /></mesh>
    {selected && onAppendPerson && appendMaterial && <group position={[0, 0.015, -scene.simulation.spacingMeters]}
      onPointerDown={(event) => { event.stopPropagation(); event.nativeEvent.stopImmediatePropagation(); }}
      onPointerMove={(event) => { event.stopPropagation(); event.nativeEvent.stopImmediatePropagation(); }}
      onPointerUp={(event) => { event.stopPropagation(); event.nativeEvent.stopImmediatePropagation(); }}
      onPointerCancel={(event) => { event.stopPropagation(); event.nativeEvent.stopImmediatePropagation(); }}
      onLostPointerCapture={(event) => { event.stopPropagation(); event.nativeEvent.stopImmediatePropagation(); }}
      onClick={(event) => { event.stopPropagation(); onAppendPerson(person.id); }}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.2, 24]} /><meshBasicMaterial color={palette.dark} /></mesh>
      <sprite position={[0, 0.055, 0]} scale={[0.34, 0.17, 1]} raycast={() => null}><primitive object={appendMaterial} attach="material" /></sprite>
    </group>}
  </group>;
}

function QueueObjects({ scene }: { scene: ProjectScene }) {
  const posts = useMemo(() => new Map<string, Stanchion>(scene.posts.map((post) => [post.id, post])), [scene.posts]);
  const { selection, onAppendPerson } = useSceneInteraction();
  const pickSizes = useMemo(() => {
    type PickPoint = { kind: 'post' | 'person' | 'append'; id: string; position: PointXZ };
    const cellSize = 1;
    const points: PickPoint[] = [];
    for (const post of scene.posts) points.push({ kind: 'post', id: post.id, position: post.position });
    for (const person of scene.people) {
      points.push({ kind: 'person', id: person.id, position: person.position });
      if (onAppendPerson && selection?.kind === 'person' && selection.id === person.id) {
        const spacing = scene.simulation.spacingMeters;
        points.push({ kind: 'append', id: person.id, position: { x: person.position.x - Math.sin(person.yawRadians) * spacing, z: person.position.z - Math.cos(person.yawRadians) * spacing } });
      }
    }
    const grid = new Map<string, PickPoint[]>();
    for (const point of points) {
      const key = `${Math.floor(point.position.x / cellSize)},${Math.floor(point.position.z / cellSize)}`;
      const bucket = grid.get(key);
      if (bucket) bucket.push(point); else grid.set(key, [point]);
    }
    const postSizes = new Map<string, number>();
    const personSizes = new Map<string, number>();
    for (const point of points) {
      if (point.kind === 'append') continue;
      const cellX = Math.floor(point.position.x / cellSize);
      const cellZ = Math.floor(point.position.z / cellSize);
      let nearest = Infinity;
      let nearestAppend = Infinity;
      for (let dx = -1; dx <= 1; dx += 1) for (let dz = -1; dz <= 1; dz += 1) {
        const bucket = grid.get(`${cellX + dx},${cellZ + dz}`);
        if (!bucket) continue;
        for (const other of bucket) {
          if (other.kind === point.kind && other.id === point.id) continue;
          const distance = Math.hypot(other.position.x - point.position.x, other.position.z - point.position.z);
          nearest = Math.min(nearest, distance);
          if (other.kind === 'append') nearestAppend = Math.min(nearestAppend, distance);
        }
      }
      let maxSize = Number.isFinite(nearest) ? Math.min(0.85, nearest * 0.65) : 0.85;
      if (point.kind === 'person') maxSize = Math.min(maxSize, scene.simulation.spacingMeters * 0.65);
      if (Number.isFinite(nearestAppend)) maxSize = Math.min(maxSize, Math.max(0, 2 * (nearestAppend - 0.21)));
      if (point.kind === 'post') postSizes.set(point.id, maxSize); else personSizes.set(point.id, maxSize);
    }
    return { posts: postSizes, people: personSizes };
  }, [onAppendPerson, scene.people, scene.posts, scene.simulation.spacingMeters, selection]);
  return <group>
    {scene.posts.map((post) => <PostObject key={post.id} post={post} maxPickWorldSize={pickSizes.posts.get(post.id) ?? 0.4} />)}
    {scene.belts.map((belt) => { const from = posts.get(belt.fromPostId); const to = posts.get(belt.toPostId); return from && to ? <BeltObject key={belt.id} belt={belt} from={from} to={to} /> : null; })}
    {scene.routes.map((route) => <RouteObject key={route.id} route={route} />)}
    {scene.people.map((person) => <PersonObject key={person.id} person={person} scene={scene} maxPickWorldSize={pickSizes.people.get(person.id) ?? 0.4} />)}
  </group>;
}

function PerimeterHandles({ scene }: { scene: ProjectScene }) {
  const { tool, perimeterHandlers, perimeterPreview } = useSceneInteraction();
  if (tool !== 'perimeter') return null;
  return <group>{scene.environment.perimeter.map((vertex) => {
    const handlers = perimeterHandlers(vertex.id, vertex);
    const position = perimeterPreview?.id === vertex.id ? perimeterPreview.position : vertex;
    return <mesh key={vertex.id} position={[position.x, 0.08, position.z]} {...handlers}>
      <sphereGeometry args={[0.12, 16, 12]} /><meshStandardMaterial color={palette.dark} />
      <mesh position={[0, 0.04, 0]} raycast={() => null}><sphereGeometry args={[0.17, 12, 10]} /><meshBasicMaterial color={palette.green} wireframe /></mesh>
    </mesh>;
  })}</group>;
}

function ViewControls({ view, center, width, depth, wallHeight, disabled, controlsRef, cameraAction, selectedPosition }: { view: SceneViewerProps['view']; center: [number, number, number]; width: number; depth: number; wallHeight: number; disabled: boolean; controlsRef: { current: OrbitControlsImpl | null }; cameraAction?: SceneViewerProps['cameraAction']; selectedPosition?: PointXZ | null }) {
  const { camera, size, invalidate } = useThree();
  const lastCameraActionId = useRef<number | null>(null);
  useEffect(() => {
    const aspect = Math.max(0.2, size.width / Math.max(size.height, 1));
    const verticalHalfFov = THREE.MathUtils.degToRad((camera instanceof THREE.PerspectiveCamera ? camera.fov : 42) / 2);
    const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * aspect);
    const diagonal = Math.hypot(width, depth);
    const distance = view === 'top'
      ? Math.max(depth / (2 * Math.tan(verticalHalfFov)), width / (2 * Math.tan(horizontalHalfFov))) * 1.2
      : Math.max(diagonal / (2 * Math.tan(horizontalHalfFov)), (diagonal * 0.55 + wallHeight) / (2 * Math.tan(verticalHalfFov))) * 1.25;
    if (view === 'top') camera.up.set(0, 0, -1);
    else camera.up.set(0, 1, 0);
    camera.position.set(center[0] + (view === 'top' ? 0 : distance * 0.58), center[1] + (view === 'top' ? distance : distance * 0.58), center[2] + (view === 'top' ? 0.001 : distance * 0.58));
    camera.lookAt(...center);
    camera.updateProjectionMatrix();
    controlsRef.current?.target.set(...center);
    controlsRef.current?.update();
    invalidate();
  }, [camera, center, depth, invalidate, size.height, size.width, view, wallHeight, width]);
  useEffect(() => {
    if (!cameraAction) return;
    const controls = controlsRef.current;
    if (!controls) return;
    if (lastCameraActionId.current === cameraAction.id) return;
    lastCameraActionId.current = cameraAction.id;
    const offset = camera.position.clone().sub(controls.target);
    const target = controls.target;
    const unit = Math.max(width, depth, 1) * 0.08;
    switch (cameraAction.type) {
      case 'rotate-left': if (view === 'top') camera.up.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 12); else offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 12); break;
      case 'rotate-right': if (view === 'top') camera.up.applyAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 12); else offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 12); break;
      case 'tilt-up': offset.applyAxisAngle(new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion), -Math.PI / 36); break;
      case 'tilt-down': offset.applyAxisAngle(new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion), Math.PI / 36); break;
      case 'zoom-in': offset.multiplyScalar(0.86); break;
      case 'zoom-out': offset.multiplyScalar(1.16); break;
      case 'pan-left': target.add(new THREE.Vector3(-1, 0, 0).applyQuaternion(camera.quaternion).setY(0).normalize().multiplyScalar(unit)); break;
      case 'pan-right': target.add(new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).setY(0).normalize().multiplyScalar(unit)); break;
      case 'pan-up': target.add(new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).setY(0).normalize().multiplyScalar(unit)); break;
      case 'pan-down': target.add(new THREE.Vector3(0, -1, 0).applyQuaternion(camera.quaternion).setY(0).normalize().multiplyScalar(unit)); break;
      case 'center-selection':
        if (selectedPosition) {
          const shift = new THREE.Vector3(selectedPosition.x - target.x, 0, selectedPosition.z - target.z);
          target.add(shift);
          camera.position.add(shift);
        }
        break;
      case 'center-bounds':
      case 'reset':
        if (view === 'top') camera.up.set(0, 0, -1); else camera.up.set(0, 1, 0);
        {
          const aspect = Math.max(0.2, size.width / Math.max(size.height, 1));
          const verticalHalfFov = THREE.MathUtils.degToRad((camera instanceof THREE.PerspectiveCamera ? camera.fov : 42) / 2);
          const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * aspect);
          const diagonal = Math.hypot(width, depth);
          const distance = view === 'top'
            ? Math.max(depth / (2 * Math.tan(verticalHalfFov)), width / (2 * Math.tan(horizontalHalfFov))) * 1.2
            : Math.max(diagonal / (2 * Math.tan(horizontalHalfFov)), (diagonal * 0.55 + wallHeight) / (2 * Math.tan(verticalHalfFov))) * 1.25;
          camera.position.set(center[0] + (view === 'top' ? 0 : distance * 0.58), center[1] + (view === 'top' ? distance : distance * 0.58), center[2] + (view === 'top' ? 0.001 : distance * 0.58));
        }
        target.set(...center);
        break;
    }
    if (cameraAction.type !== 'reset' && cameraAction.type !== 'center-bounds' && cameraAction.type !== 'center-selection') {
      camera.position.copy(target).add(offset);
    }
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    controls.update();
    invalidate();
  }, [camera, cameraAction?.id, cameraAction?.type, center, controlsRef, depth, invalidate, selectedPosition, size.height, size.width, view, wallHeight, width]);
  const span = Math.max(width, depth, wallHeight, 1);
  return <OrbitControls ref={controlsRef} target={center} makeDefault enabled={!disabled} enableRotate={view !== 'top'} enableDamping={false} minDistance={Math.max(0.5, span * 0.12)} maxDistance={span * 10} />;
}

function SceneContents({
  scene,
  view,
  interactionMode = 'edit',
  gridStep = 0.25,
  onFloorPoint,
  selection: controlledSelection,
  onSelectEntity,
  onMoveEntity,
  tool,
  cameraAction,
  onRegisterFloorProjector,
  placementPreview,
  draftArea,
  draftBelt,
  onAreaDraw,
  onMovePerimeterVertex,
  onAppendPerson,
  onAreaDistancesChange,
  showWalls = false,
}: SceneViewerProps) {
  const connected = useThree((state) => state.events.connected);
  const [localSelection, setLocalSelection] = useState<EditorSelection | null>(null);
  const [preview, setPreview] = useState<DragPreview | null>(null);
  const [dragging, setDragging] = useState(false);
  const [areaGesture, setAreaGestureState] = useState<FloorGesture | null>(null);
  const [perimeterPreview, setPerimeterPreview] = useState<{ id: string; position: PointXZ } | null>(null);
  const dragSession = useRef<DragSession | null>(null);
  const perimeterSession = useRef<{ id: string; start: PointXZ; target: PointerCaptureTarget; pointerId: number } | null>(null);
  const areaGestureRef = useRef<FloorGesture | null>(null);
  const dragPointerIds = useRef(new Set<number>());
  const suppressedClickPointerIds = useRef(new Set<number>());
  const pickTargets = useRef(new Set<PickTargetEntry>());
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const registerPickTarget = useCallback((entry: PickTargetEntry) => {
    pickTargets.current.add(entry);
    return () => { pickTargets.current.delete(entry); };
  }, []);
  const setAreaGesture = useCallback((gesture: FloorGesture | null) => {
    const previous = areaGestureRef.current;
    areaGestureRef.current = gesture;
    setAreaGestureState(gesture);
    if (gesture) { dragPointerIds.current.add(gesture.pointerId); setDragging(true); if (controlsRef.current) controlsRef.current.enabled = false; }
    else if (previous) { dragPointerIds.current.delete(previous.pointerId); suppressedClickPointerIds.current.add(previous.pointerId); setDragging(false); if (controlsRef.current) controlsRef.current.enabled = true; }
  }, []);
  const cancelDrag = useCallback((pointerId: number, releaseCapture: boolean) => {
    const wasDragPointer = dragPointerIds.current.delete(pointerId);
    if (wasDragPointer) suppressedClickPointerIds.current.add(pointerId);
    const session = dragSession.current;
    if (!session || session.pointerId !== pointerId) return wasDragPointer;

    // Clear the session before releasing capture: release can synchronously or
    // asynchronously produce lostpointercapture, and cancellation must never commit.
    dragSession.current = null;
    setPreview(null);
    setDragging(false);
    if (controlsRef.current) controlsRef.current.enabled = true;
    if (releaseCapture) {
      try { session.target.releasePointerCapture(pointerId); } catch { /* capture may already be released */ }
    }
    return true;
  }, []);
  const cancelOtherGesture = useCallback((pointerId: number, releaseCapture: boolean) => {
    const area = areaGestureRef.current;
    if (area?.pointerId === pointerId) {
      areaGestureRef.current = null; setAreaGestureState(null); dragPointerIds.current.delete(pointerId); suppressedClickPointerIds.current.add(pointerId);
      setDragging(false);
      if (controlsRef.current) controlsRef.current.enabled = true;
      if (releaseCapture) releasePointerCapture(area.target, pointerId);
      return;
    }
    const perimeter = perimeterSession.current;
    if (perimeter?.pointerId === pointerId) {
      perimeterSession.current = null; setPerimeterPreview(null); dragPointerIds.current.delete(pointerId); suppressedClickPointerIds.current.add(pointerId);
      setDragging(false); if (controlsRef.current) controlsRef.current.enabled = true;
      if (releaseCapture) releasePointerCapture(perimeter.target, pointerId);
    }
  }, []);
  useEffect(() => {
    if (!connected) return;
    const onPointerDown = (event: PointerEvent) => {
      // A new physical sequence makes any missed compatibility click stale.
      suppressedClickPointerIds.current.delete(event.pointerId);
    };
    const onPointerCancel = (event: PointerEvent) => {
      if (!dragPointerIds.current.has(event.pointerId)) return;
      // OrbitControls did not receive pointerdown for this drag. Keep its
      // unconditional pointercancel release from touching an unrelated gesture.
      event.stopImmediatePropagation();
      cancelDrag(event.pointerId, true); cancelOtherGesture(event.pointerId, true);
    };
    const onLostPointerCapture = (event: PointerEvent) => {
      cancelDrag(event.pointerId, false); cancelOtherGesture(event.pointerId, false);
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!suppressedClickPointerIds.current.has(event.pointerId)) return;
      event.stopImmediatePropagation();
    };
    const onClick = (event: MouseEvent) => {
      const pointerId = 'pointerId' in event && typeof event.pointerId === 'number' ? event.pointerId : null;
      const suppressedId = pointerId !== null && suppressedClickPointerIds.current.has(pointerId)
        ? pointerId
        : pointerId === null && suppressedClickPointerIds.current.size === 1
          ? suppressedClickPointerIds.current.values().next().value ?? null
          : null;
      if (suppressedId === null) return;
      event.stopImmediatePropagation();
      suppressedClickPointerIds.current.delete(suppressedId);
    };
    connected.addEventListener('pointerdown', onPointerDown, true);
    connected.addEventListener('pointercancel', onPointerCancel, true);
    connected.addEventListener('lostpointercapture', onLostPointerCapture, true);
    connected.addEventListener('pointerup', onPointerUp, true);
    connected.addEventListener('click', onClick, true);
    return () => {
      connected.removeEventListener('pointerdown', onPointerDown, true);
      connected.removeEventListener('pointercancel', onPointerCancel, true);
      connected.removeEventListener('lostpointercapture', onLostPointerCapture, true);
      connected.removeEventListener('pointerup', onPointerUp, true);
      connected.removeEventListener('click', onClick, true);
    };
  }, [cancelDrag, cancelOtherGesture, connected]);
  const selection = controlledSelection !== undefined ? controlledSelection : localSelection;
  const select = useCallback((next: EditorSelection | null) => {
    setLocalSelection(next);
    onSelectEntity?.(next);
  }, [onSelectEntity]);
  const handlers = useCallback((entity: EditorSelection, draggable = false): EntityHandlers => {
    const stop = (event: ScenePointerEvent) => event.stopPropagation();
    const intersection = (event: ScenePointerEvent): PointXZ | null => {
      const { origin, direction } = event.ray;
      if (Math.abs(direction.y) < 1e-8) return null;
      const distance = -origin.y / direction.y;
      if (distance < 0) return null;
      return { x: origin.x + direction.x * distance, z: origin.z + direction.z * distance };
    };
    const release = (session: DragSession) => { try { session.target.releasePointerCapture(session.pointerId); } catch { /* capture may already be released */ } };
    const finish = (event: ScenePointerEvent, commit: boolean) => {
      stop(event);
      const wasDragPointer = dragPointerIds.current.delete(event.pointerId);
      if (commit && wasDragPointer) suppressedClickPointerIds.current.add(event.pointerId);
      if (event.nativeEvent.type === 'pointercancel' && wasDragPointer) event.nativeEvent.stopImmediatePropagation();
      const session = dragSession.current;
      if (!session || session.pointerId !== event.pointerId) return;
      const hit = intersection(event);
      if (commit && hit) {
        const rawDelta = { x: hit.x - session.start.x, z: hit.z - session.start.z };
        session.delta = snapPoint(rawDelta, gridStep);
      }
      dragSession.current = null;
      setPreview(null);
      setDragging(false);
      if (controlsRef.current) controlsRef.current.enabled = true;
      release(session);
      if (commit && (Math.abs(session.delta.x) > 1e-5 || Math.abs(session.delta.z) > 1e-5)) onMoveEntity?.(session.selection, session.delta);
    };
    return {
      onPointerDown: (event: ScenePointerEvent) => {
        suppressedClickPointerIds.current.delete(event.pointerId);
        stop(event);
        select(entity);
        if (!draggable || interactionMode === 'navigate') return;
        // OrbitControls listens on this same DOM target after R3F. Keep a drag
        // pointer out of its pointer tracking so cancel has no unmatched release.
        event.nativeEvent.stopImmediatePropagation();
        dragPointerIds.current.add(event.pointerId);
        const hit = intersection(event);
        if (!hit) return;
        const target = event.target as PointerCaptureTarget | null;
        if (!target || !('setPointerCapture' in target)) return;
        const session: DragSession = { selection: entity, delta: { x: 0, z: 0 }, start: { x: hit.x, z: hit.z }, pointerId: event.pointerId, target };
        try {
          target.setPointerCapture(event.pointerId);
        } catch (error) {
          // R3F records capture before calling the browser API; unwind that
          // record if a synthetic or otherwise inactive pointer is rejected.
          try { target.releasePointerCapture(event.pointerId); } catch (cleanupError) {
            if (!(cleanupError instanceof Error && cleanupError.name === 'NotFoundError')) console.error('Falha ao limpar captura de ponteiro da cena.', cleanupError);
          }
          dragPointerIds.current.delete(event.pointerId);
          console.warn('Arraste da cena cancelado: o navegador não concedeu captura do ponteiro.', error);
          return;
        }
        dragSession.current = session;
        if (controlsRef.current) controlsRef.current.enabled = false;
        setDragging(true);
      },
      onPointerMove: (event: ScenePointerEvent) => {
        stop(event);
        const session = dragSession.current;
        if (!session || session.pointerId !== event.pointerId) return;
        const hit = intersection(event);
        if (!hit) return;
        const rawDelta = { x: hit.x - session.start.x, z: hit.z - session.start.z };
        session.delta = snapPoint(rawDelta, gridStep);
        setPreview({ selection: session.selection, delta: session.delta });
      },
      onPointerUp: (event: ScenePointerEvent) => finish(event, true),
      onPointerCancel: (event: ScenePointerEvent) => finish(event, false),
      onLostPointerCapture: (event: ScenePointerEvent) => finish(event, false),
      onClick: (event: ThreeEvent<MouseEvent>) => event.stopPropagation(),
    };
  }, [onMoveEntity, select]);
  const perimeterHandlers = useCallback((id: string, original: PointXZ) => {
    const positionOnPlane = (event: ScenePointerEvent): PointXZ | null => {
      const { origin, direction } = event.ray;
      if (Math.abs(direction.y) < 1e-8) return null;
      const t = -origin.y / direction.y; if (t < 0) return null;
      return { x: origin.x + direction.x * t, z: origin.z + direction.z * t };
    };
    return {
      onPointerDown: (event: ScenePointerEvent) => {
        event.stopPropagation(); event.nativeEvent.stopImmediatePropagation();
        const target = event.target as unknown as PointerCaptureTarget;
        try { target.setPointerCapture(event.pointerId); } catch (error) {
          releasePointerCapture(target, event.pointerId);
          if (!(error instanceof Error && error.name === 'NotFoundError')) console.error('O navegador recusou a captura do canto da planta.', error);
          return;
        }
        perimeterSession.current = { id, start: original, target, pointerId: event.pointerId };
        dragPointerIds.current.add(event.pointerId); setDragging(true); if (controlsRef.current) controlsRef.current.enabled = false;
      },
      onPointerMove: (event: ScenePointerEvent) => {
        const active = perimeterSession.current; if (!active || active.pointerId !== event.pointerId) return;
        event.stopPropagation(); const point = positionOnPlane(event); if (point) setPerimeterPreview({ id, position: point });
      },
      onPointerUp: (event: ScenePointerEvent) => {
        const active = perimeterSession.current; if (!active || active.pointerId !== event.pointerId) return;
        event.stopPropagation(); event.nativeEvent.stopImmediatePropagation();
        const point = positionOnPlane(event); perimeterSession.current = null; setPerimeterPreview(null); dragPointerIds.current.delete(event.pointerId); suppressedClickPointerIds.current.add(event.pointerId); setDragging(false); if (controlsRef.current) controlsRef.current.enabled = true;
        releasePointerCapture(active.target, event.pointerId);
        if (point && Math.hypot(point.x - active.start.x, point.z - active.start.z) > 1e-5) onMovePerimeterVertex?.(id, point);
      },
      onPointerCancel: (event: ScenePointerEvent) => cancelOtherGesture(event.pointerId, true),
      onLostPointerCapture: (event: ScenePointerEvent) => cancelOtherGesture(event.pointerId, false),
    };
  }, [cancelOtherGesture, onMovePerimeterVertex]);
  const selectedPosition = useMemo<PointXZ | null>(() => {
    if (!selection) return null;
    if (selection.kind === 'post') {
      const p = scene.posts.find((post) => post.id === selection.id);
      return p ? p.position : null;
    }
    if (selection.kind === 'person') {
      const p = scene.people.find((person) => person.id === selection.id);
      return p ? p.position : null;
    }
    if (selection.kind === 'area') {
      const a = scene.restrictedAreas.find((area) => area.id === selection.id);
      if (!a || !a.vertices.length) return null;
      return {
        x: a.vertices.reduce((s, v) => s + v.x, 0) / a.vertices.length,
        z: a.vertices.reduce((s, v) => s + v.z, 0) / a.vertices.length,
      };
    }
    return null;
  }, [scene.people, scene.posts, scene.restrictedAreas, selection]);

  useEffect(() => {
    if (!onAreaDistancesChange) return;
    if (selection?.kind === 'area') {
      const a = scene.restrictedAreas.find((area) => area.id === selection.id);
      if (a) {
        const d = calculateAreaDistances(a.vertices, scene.environment.perimeter);
        if (d) {
          onAreaDistancesChange({ areaId: a.id, ...d });
          return;
        }
      }
    }
    onAreaDistancesChange(null);
  }, [onAreaDistancesChange, scene.environment.perimeter, scene.restrictedAreas, selection]);

  const interaction = useMemo<SceneInteraction>(
    () => ({
      selection,
      preview,
      dragging,
      controlsRef,
      select,
      handlers,
      tool,
      interactionMode,
      gridStep,
      areaGesture,
      setAreaGesture,
      onAreaDraw,
      perimeterHandlers,
      perimeterPreview,
      onAppendPerson,
      registerPickTarget,
    }),
    [
      selection,
      preview,
      dragging,
      controlsRef,
      select,
      handlers,
      tool,
      interactionMode,
      gridStep,
      areaGesture,
      setAreaGesture,
      onAreaDraw,
      perimeterHandlers,
      perimeterPreview,
      onAppendPerson,
      registerPickTarget,
    ],
  );
  useFrame(({ camera, size }) => {
    for (const target of pickTargets.current) {
      const sprite = target.sprite;
      if (!sprite) continue;
      let worldUnitsPerPixel = 0;
      if (camera instanceof THREE.PerspectiveCamera) {
        const distance = camera.position.distanceTo(sprite.getWorldPosition(target.worldPosition));
        worldUnitsPerPixel = (2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / Math.max(size.height, 1);
      } else if (camera instanceof THREE.OrthographicCamera) {
        worldUnitsPerPixel = (camera.top - camera.bottom) / (Math.max(camera.zoom, 1e-6) * Math.max(size.height, 1));
      }
      const worldSize = Math.min(44 * worldUnitsPerPixel, target.maxWorldSize);
      if (Math.abs(sprite.scale.x - worldSize) > 1e-4 || Math.abs(sprite.scale.y - worldSize) > 1e-4) sprite.scale.set(worldSize, worldSize, 1);
    }
  });
  useEffect(() => () => {
    const session = dragSession.current;
    dragSession.current = null;
    dragPointerIds.current.clear();
    suppressedClickPointerIds.current.clear();
    if (session) {
      releasePointerCapture(session.target, session.pointerId);
    }
    const area = areaGestureRef.current; areaGestureRef.current = null;
    if (area) releasePointerCapture(area.target, area.pointerId);
    const perimeter = perimeterSession.current; perimeterSession.current = null;
    if (perimeter) releasePointerCapture(perimeter.target, perimeter.pointerId);
    if (controlsRef.current) controlsRef.current.enabled = true;
  }, []);
  const bounds = useMemo(() => boundsOf(scene), [scene]);
  const center = useMemo<[number, number, number]>(() => [(bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2], [bounds.maxX, bounds.maxZ, bounds.minX, bounds.minZ]);
  const width = bounds.maxX - bounds.minX; const depth = bounds.maxZ - bounds.minZ;
  const rectangleDraft = areaGesture ? [areaGesture.start, { x: areaGesture.end.x, z: areaGesture.start.z }, areaGesture.end, { x: areaGesture.start.x, z: areaGesture.end.z }] : null;
  const selectedScenePosts = useMemo(() => new Map(scene.posts.map((post) => [post.id, post])), [scene.posts]);
  return <SceneInteractionContext.Provider value={interaction}>
    <color attach="background" args={['#f8f6ef']} />
    <ambientLight intensity={1.8} /><directionalLight position={[center[0] + width * 0.5, Math.max(width, depth), center[2] + depth * 0.5]} intensity={0.9} />
    <FloorProjectorRegistration scene={scene} register={onRegisterFloorProjector} />
    <Floor scene={scene} bounds={bounds} onFloorPoint={onFloorPoint} gridStep={gridStep} />{showWalls && <Walls scene={scene} view={view} />}<Dimensions scene={scene} /><Areas scene={scene} /><QueueObjects scene={scene} />
    <PerimeterHandles scene={scene} />
    {placementPreview && <PlacementPreview preview={placementPreview} scene={scene} />}
    {draftArea && <DraftArea vertices={draftArea} />}{rectangleDraft && <DraftArea vertices={rectangleDraft} />}
    {draftBelt && selectedScenePosts.has(draftBelt.fromPostId) && selectedScenePosts.has(draftBelt.toPostId) && <DraftBelt from={selectedScenePosts.get(draftBelt.fromPostId)!} to={selectedScenePosts.get(draftBelt.toPostId)!} />}
    <ViewControls view={view ?? 'perspective'} center={center} width={width} depth={depth} wallHeight={scene.environment.wallHeightMeters} disabled={dragging || interactionMode === 'edit' && false} controlsRef={controlsRef} cameraAction={cameraAction} selectedPosition={selectedPosition} />
  </SceneInteractionContext.Provider>;
}

class CanvasErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Falha ao renderizar a cena 3D.', error, info.componentStack);
  }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function WebGLFallback() { return <div role="status" style={{ display: 'grid', placeItems: 'center', minHeight: 0, height: '100%', padding: 24, color: palette.dark, background: palette.floor, border: '1px solid #c8c5b8', font: '14px Arial, sans-serif', textAlign: 'center' }}>Este navegador não conseguiu iniciar o WebGL. Abra a planta em um navegador com aceleração gráfica habilitada.</div>; }

export default function SceneViewer({ scene, view = 'perspective', className, ...sceneProps }: SceneViewerProps) {
  const ratio = typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
  return <div className={className} style={{ width: '100%', height: '100%', minWidth: 0, minHeight: sceneProps.tool ? 0 : 300, position: 'relative', overflow: 'hidden', background: '#f8f6ef', touchAction: 'none' }}>
    <CanvasErrorBoundary fallback={<WebGLFallback />}>
    <Canvas dpr={ratio} frameloop="demand" camera={{ position: [0, 12, 12], fov: 42, near: 0.01, far: 10000 }} gl={{ antialias: true, alpha: false }} fallback="WebGL indisponível neste navegador.">
        <Suspense fallback={null}><SceneContents scene={scene} view={view} {...sceneProps} /></Suspense>
      </Canvas>
    </CanvasErrorBoundary>
  </div>;
}
