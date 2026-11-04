import * as THREE from 'three';
import type { XrPoint } from '../xr-check/xr-check-logic.ts';
import type { XrSessionRuntime } from '../session/xr-session.ts';

const GREEN = 0x214b40;
const LINE_LIFT_METERS = 0.012;
const MARKER_LIFT_METERS = 0.025;

export type FloorplanScene = XrSessionRuntime & Readonly<{
  /** Redraws marked corners and walls. Runs per corner change, not per frame. */
  setCorners: (corners: readonly XrPoint[]) => void;
  /** Moves the line from the last corner to the reticle. Allocates nothing. */
  setPreview: (from: XrPoint | null, to: XrPoint | null) => void;
  dispose: () => void;
}>;

function lifted(point: XrPoint) {
  return new THREE.Vector3(point.x, point.y + LINE_LIFT_METERS, point.z);
}

/** Same renderer setup as the routes that already run on a phone. */
export function createFloorplanScene(canvas: HTMLCanvasElement): FloorplanScene {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(65, 1, 0.01, 40);
  const reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.075, 0.11, 32),
    new THREE.MeshBasicMaterial({ color: GREEN, side: THREE.DoubleSide, depthTest: false }),
  );
  reticle.rotation.x = -Math.PI / 2;
  reticle.visible = false;
  scene.add(reticle);

  const markerGeometry = new THREE.SphereGeometry(0.035, 16, 12);
  const markerMaterial = new THREE.MeshBasicMaterial({ color: GREEN });
  const lineMaterial = new THREE.LineBasicMaterial({ color: GREEN });
  const markers: THREE.Mesh[] = [];
  const walls = new THREE.Line(new THREE.BufferGeometry(), lineMaterial);
  walls.frustumCulled = false;
  scene.add(walls);

  const previewPositions = new THREE.BufferAttribute(new Float32Array(6), 3);
  const previewGeometry = new THREE.BufferGeometry().setAttribute('position', previewPositions);
  const preview = new THREE.Line(previewGeometry, lineMaterial);
  preview.frustumCulled = false;
  preview.visible = false;
  scene.add(preview);

  const resize = () => {
    if (renderer.xr.isPresenting) return;
    const width = Math.max(canvas.clientWidth, 1);
    const height = Math.max(canvas.clientHeight, 1);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);

  const setCorners = (corners: readonly XrPoint[]) => {
    while (markers.length > corners.length) scene.remove(markers.pop() as THREE.Mesh);
    while (markers.length < corners.length) {
      const marker = new THREE.Mesh(markerGeometry, markerMaterial);
      markers.push(marker);
      scene.add(marker);
    }
    corners.forEach((corner, index) => markers[index].position.set(corner.x, corner.y + MARKER_LIFT_METERS, corner.z));
    walls.geometry.dispose();
    walls.geometry = new THREE.BufferGeometry().setFromPoints(corners.map(lifted));
  };

  const setPreview = (from: XrPoint | null, to: XrPoint | null) => {
    preview.visible = Boolean(from && to);
    if (!from || !to) return;
    previewPositions.setXYZ(0, from.x, from.y + LINE_LIFT_METERS, from.z);
    previewPositions.setXYZ(1, to.x, to.y + LINE_LIFT_METERS, to.z);
    previewPositions.needsUpdate = true;
  };

  const dispose = () => {
    window.removeEventListener('resize', resize);
    renderer.setAnimationLoop(null);
    reticle.geometry.dispose();
    reticle.material.dispose();
    markerGeometry.dispose();
    markerMaterial.dispose();
    lineMaterial.dispose();
    walls.geometry.dispose();
    previewGeometry.dispose();
    renderer.dispose();
  };

  return { renderer, scene, camera, reticle, setCorners, setPreview, dispose };
}
