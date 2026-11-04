import * as THREE from 'three';
import type { Belt, Environment, PersonPlacement, PointXZ, ProjectScene, QueueRoute, RestrictedArea, Stanchion } from '@testafila/core/contracts/project';

export const projectColors = { floor: 0xf8f6ef, line: 0x214b40, wall: 0xd8dcd4, area: 0xb6c8bc, belt: 0x355b48, person: 0x606963 };

export function disposeObject(root: THREE.Object3D) {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const material of materials) material.dispose();
  });
}

function polygonGeometry(points: readonly PointXZ[], y: number): THREE.BufferGeometry | null {
  if (points.length < 3) return null;
  const contour = points.map((point) => new THREE.Vector2(point.x, point.z));
  const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(contour.flatMap((point) => [point.x, y, point.y]), 3));
  geometry.setIndex(triangles.flatMap(([a, b, c]) => [a, c, b]));
  geometry.computeVertexNormals();
  return geometry;
}

function cylinderBetween(start: THREE.Vector3, end: THREE.Vector3, radius: number, material: THREE.Material) {
  const direction = end.clone().sub(start);
  const length = direction.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 10), material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}

export function createEnvironmentObject(environment: Environment): THREE.Group {
  const group = new THREE.Group();
  const floorGeometry = polygonGeometry(environment.perimeter, 0);
  if (floorGeometry) group.add(new THREE.Mesh(floorGeometry, new THREE.MeshBasicMaterial({ color: projectColors.floor, transparent: true, opacity: 0.30, side: THREE.DoubleSide, depthWrite: false })));

  const wallMaterial = new THREE.MeshBasicMaterial({ color: projectColors.wall, transparent: true, opacity: 0.35, depthWrite: false });
  for (let index = 0; index < environment.perimeter.length; index += 1) {
    const start = environment.perimeter[index];
    const end = environment.perimeter[(index + 1) % environment.perimeter.length];
    const length = Math.hypot(end.x - start.x, end.z - start.z);
    if (length < 1e-6) continue;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(length, environment.wallHeightMeters, 0.035), wallMaterial.clone());
    wall.position.set((start.x + end.x) / 2, environment.wallHeightMeters / 2, (start.z + end.z) / 2);
    wall.rotation.y = -Math.atan2(end.z - start.z, end.x - start.x);
    group.add(wall);
  }
  wallMaterial.dispose();
  return group;
}

export function createAreaObject(area: RestrictedArea): THREE.Object3D {
  const geometry = polygonGeometry(area.vertices, 0.008);
  return geometry
    ? new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: projectColors.area, transparent: true, opacity: 0.48, side: THREE.DoubleSide, depthWrite: false }))
    : new THREE.Group();
}

/** Built at the origin of the floor: `placePostObject` sets where it stands. */
export function createPostObject(post: Stanchion): THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial> {
  return new THREE.Mesh(new THREE.CylinderGeometry(post.baseRadiusMeters, post.baseRadiusMeters, post.heightMeters, 14), new THREE.MeshBasicMaterial({ color: projectColors.line }));
}

export function placePostObject(object: THREE.Object3D, post: Stanchion) {
  object.position.set(post.position.x, post.heightMeters / 2, post.position.z);
}

export function createBeltObject(belt: Belt, from: Stanchion, to: Stanchion): THREE.Object3D {
  return cylinderBetween(new THREE.Vector3(from.position.x, belt.heightMeters, from.position.z), new THREE.Vector3(to.position.x, belt.heightMeters, to.position.z), 0.012, new THREE.MeshBasicMaterial({ color: projectColors.belt }));
}

export function createRouteObject(route: QueueRoute): THREE.Object3D {
  const geometry = new THREE.BufferGeometry().setFromPoints(route.points.map((point) => new THREE.Vector3(point.x, 0.02, point.z)));
  return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: projectColors.belt, transparent: true, opacity: 0.7 }));
}

export function createPersonObject(simulation: ProjectScene['simulation']): THREE.Group {
  const personObject = new THREE.Group();
  const height = simulation.personHeightMeters;
  const radius = simulation.personRadiusMeters;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(radius * 0.65, Math.max(0.01, height * 0.56), 5, 10), new THREE.MeshBasicMaterial({ color: projectColors.person }));
  body.position.y = height / 2;
  personObject.add(body);
  const direction = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.38, radius * 0.9, 8), new THREE.MeshBasicMaterial({ color: projectColors.line }));
  direction.rotation.x = Math.PI / 2;
  direction.position.set(0, radius * 0.35, radius * 0.9);
  personObject.add(direction);
  return personObject;
}

export function placePersonObject(object: THREE.Object3D, person: PersonPlacement) {
  object.position.set(person.position.x, 0, person.position.z);
  object.rotation.y = person.yawRadians;
}

export function buildProjectObject(project: ProjectScene): THREE.Group {
  const root = new THREE.Group();
  root.add(createEnvironmentObject(project.environment));
  for (const area of project.restrictedAreas) root.add(createAreaObject(area));

  const posts = new Map(project.posts.map((post) => [post.id, post]));
  for (const post of project.posts) {
    const mesh = createPostObject(post);
    placePostObject(mesh, post);
    root.add(mesh);
  }
  for (const belt of project.belts) {
    const from = posts.get(belt.fromPostId); const to = posts.get(belt.toPostId);
    if (from && to) root.add(createBeltObject(belt, from, to));
  }
  for (const route of project.routes) {
    if (route.points.length >= 2) root.add(createRouteObject(route));
  }
  for (const person of project.people) {
    const personObject = createPersonObject(project.simulation);
    placePersonObject(personObject, person);
    root.add(personObject);
  }
  return root;
}
