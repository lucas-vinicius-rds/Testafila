import * as THREE from 'three';
import type { PointXZ } from '@testafila/core/contracts/project';
import { projectRootPose } from '../floorplan/floorplan-capture-logic.ts';
import { projectColors } from '../scene/project-objects.ts';
import { createSceneLayers, type SceneLayersView } from '../scene/scene-layers.ts';
import type { XrSessionRuntime } from '../session/xr-session.ts';
import type { SessionAlignmentState } from './assembly-state.ts';

const FLOOR_LIFT_METERS = 0.012;
const PREVIEW_LIFT_METERS = 0.012;

export type AssemblyScene = XrSessionRuntime & Readonly<{
  sync: (view: SceneLayersView, alignment: SessionAlignmentState | null) => void;
  /** Line from the last marked point to the reticle, in project coordinates. Allocates nothing. */
  setPreview: (from: PointXZ | null, to: PointXZ | null) => void;
  highlightPosts: (ids: readonly string[]) => void;
  dispose: () => void;
}>;

/** Same renderer setup as the routes that already ran on a phone. */
export function createAssemblyScene(canvas: HTMLCanvasElement): AssemblyScene {
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
    new THREE.MeshBasicMaterial({ color: projectColors.line, side: THREE.DoubleSide, depthTest: false }),
  );
  reticle.rotation.x = -Math.PI / 2;
  reticle.visible = false;
  scene.add(reticle);

  const layers = createSceneLayers();
  layers.root.visible = false;
  scene.add(layers.root);

  const previewPositions = new THREE.BufferAttribute(new Float32Array(6), 3);
  const previewGeometry = new THREE.BufferGeometry().setAttribute('position', previewPositions);
  const previewMaterial = new THREE.LineBasicMaterial({ color: projectColors.line });
  const preview = new THREE.Line(previewGeometry, previewMaterial);
  preview.frustumCulled = false;
  preview.visible = false;
  layers.root.add(preview);

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

  return {
    renderer,
    scene,
    camera,
    reticle,
    sync: (view, alignment) => {
      layers.sync(view);
      layers.root.visible = alignment !== null;
      if (!alignment) return;
      const pose = projectRootPose(alignment.transform, alignment.floorY + FLOOR_LIFT_METERS);
      layers.root.position.set(pose.position.x, pose.position.y, pose.position.z);
      layers.root.rotation.set(0, pose.rotationY, 0);
    },
    setPreview: (from, to) => {
      preview.visible = Boolean(from && to);
      if (!from || !to) return;
      previewPositions.setXYZ(0, from.x, PREVIEW_LIFT_METERS, from.z);
      previewPositions.setXYZ(1, to.x, PREVIEW_LIFT_METERS, to.z);
      previewPositions.needsUpdate = true;
    },
    highlightPosts: layers.highlightPosts,
    dispose: () => {
      window.removeEventListener('resize', resize);
      renderer.setAnimationLoop(null);
      layers.dispose();
      reticle.geometry.dispose();
      reticle.material.dispose();
      previewGeometry.dispose();
      previewMaterial.dispose();
      renderer.dispose();
    },
  };
}
