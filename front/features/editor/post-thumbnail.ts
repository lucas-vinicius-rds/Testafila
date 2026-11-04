import * as THREE from "three";

export const POST_MODEL = { heightMeters: 0.95, baseRadiusMeters: 0.08, baseColor: "#243c32", poleColor: "#355b48" };

let cached: Promise<string | null> | null = null;

function render(): string | null {
  const canvas = document.createElement("canvas");
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  } catch {
    return null;
  }
  const { heightMeters, baseRadiusMeters, baseColor, poleColor } = POST_MODEL;
  const scene = new THREE.Scene();
  const baseGeometry = new THREE.CylinderGeometry(baseRadiusMeters * 2, baseRadiusMeters * 2, 0.07, 32);
  const poleGeometry = new THREE.CylinderGeometry(0.035, 0.045, heightMeters, 20);
  const baseMaterial = new THREE.MeshStandardMaterial({ color: baseColor });
  const poleMaterial = new THREE.MeshStandardMaterial({ color: poleColor });
  const base = new THREE.Mesh(baseGeometry, baseMaterial);
  base.position.y = 0.035;
  const pole = new THREE.Mesh(poleGeometry, poleMaterial);
  pole.position.y = heightMeters / 2;
  const light = new THREE.DirectionalLight("#ffffff", 1.4);
  light.position.set(1, 2, 2);
  scene.add(base, pole, new THREE.AmbientLight("#ffffff", 1.8), light);
  const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 20);
  camera.position.set(0.9, 1.2, 2.2);
  camera.lookAt(0, heightMeters / 2, 0);
  renderer.setSize(128, 128, false);
  renderer.render(scene, camera);
  const url = canvas.toDataURL("image/png");
  baseGeometry.dispose();
  poleGeometry.dispose();
  baseMaterial.dispose();
  poleMaterial.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return url;
}

/** Renderiza o poste uma única vez, em um contexto WebGL que é liberado em seguida. */
export function getPostThumbnail(): Promise<string | null> {
  cached ??= Promise.resolve().then(render).catch(() => null);
  return cached;
}
