import * as THREE from 'three';
import type { PointXZ, ProjectScene } from '@testafila/core/contracts/project';
import { createAreaObject, createBeltObject, createEnvironmentObject, createPersonObject, createPostObject, createRouteObject, disposeObject, placePersonObject, placePostObject, projectColors } from './project-objects.ts';

const DRAFT_LIFT_METERS = 0.012;
const HIGHLIGHT_COLOR = 0xc8a23a;

type LayerItem<T> = Readonly<{
  id: string;
  /** Changing this rebuilds the object. Leave position out when `place` handles it. */
  shape: string;
  value: T;
}>;

/** Keeps one object per id: builds what is new, frees what left, moves the rest. */
class Layer<T> {
  readonly group = new THREE.Group();
  readonly entries = new Map<string, { shape: string; object: THREE.Object3D }>();
  private readonly build: (value: T) => THREE.Object3D;
  private readonly place?: (object: THREE.Object3D, value: T) => void;

  constructor(build: (value: T) => THREE.Object3D, place?: (object: THREE.Object3D, value: T) => void) {
    this.build = build;
    this.place = place;
  }

  sync(items: readonly LayerItem<T>[]) {
    const ids = new Set(items.map((item) => item.id));
    for (const id of [...this.entries.keys()]) {
      if (!ids.has(id)) this.remove(id);
    }
    for (const { id, shape, value } of items) {
      if (this.entries.get(id)?.shape !== shape) {
        this.remove(id);
        const object = this.build(value);
        this.entries.set(id, { shape, object });
        this.group.add(object);
      }
      const entry = this.entries.get(id);
      if (entry) this.place?.(entry.object, value);
    }
  }

  private remove(id: string) {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.group.remove(entry.object);
    disposeObject(entry.object);
    this.entries.delete(id);
  }

  dispose() {
    this.sync([]);
  }
}

function createDraftObject(points: readonly PointXZ[]): THREE.Group {
  const group = new THREE.Group();
  const geometry = new THREE.BufferGeometry().setFromPoints(points.map((point) => new THREE.Vector3(point.x, DRAFT_LIFT_METERS, point.z)));
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: projectColors.line }));
  line.frustumCulled = false;
  group.add(line);
  for (const point of points) {
    const marker = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), new THREE.MeshBasicMaterial({ color: projectColors.line }));
    marker.position.set(point.x, 0.025, point.z);
    group.add(marker);
  }
  return group;
}

export type SceneLayersView = Readonly<{
  scene: ProjectScene | null;
  draft: readonly PointXZ[];
  highlightedPostIds: readonly string[];
}>;

export type SceneLayers = Readonly<{
  root: THREE.Group;
  sync: (view: SceneLayersView) => void;
  /** Colors only: safe to call per frame. */
  highlightPosts: (ids: readonly string[]) => void;
  dispose: () => void;
}>;

/** Objects in project coordinates. Moving `root` lays them over the real floor. */
export function createSceneLayers(): SceneLayers {
  const root = new THREE.Group();
  const environment = new Layer<ProjectScene['environment']>(createEnvironmentObject);
  const areas = new Layer<ProjectScene['restrictedAreas'][number]>(createAreaObject);
  const posts = new Layer<ProjectScene['posts'][number]>(createPostObject, placePostObject);
  const belts = new Layer<{ belt: ProjectScene['belts'][number]; from: ProjectScene['posts'][number]; to: ProjectScene['posts'][number] }>(({ belt, from, to }) => createBeltObject(belt, from, to));
  const routes = new Layer<ProjectScene['routes'][number]>(createRouteObject);
  let simulation: ProjectScene['simulation'] | null = null;
  const people = new Layer<ProjectScene['people'][number]>(() => createPersonObject(simulation as ProjectScene['simulation']), placePersonObject);
  const draft = new Layer<readonly PointXZ[]>(createDraftObject);
  const layers = [environment, areas, posts, belts, routes, people, draft];
  for (const layer of layers) root.add(layer.group);

  const highlightPosts = (ids: readonly string[]) => {
    for (const [id, { object }] of posts.entries) {
      ((object as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setHex(ids.includes(id) ? HIGHLIGHT_COLOR : projectColors.line);
    }
  };

  const sync = ({ scene, draft: draftPoints, highlightedPostIds }: SceneLayersView) => {
    simulation = scene?.simulation ?? null;
    const environmentShape = scene ? JSON.stringify([scene.environment.perimeter, scene.environment.wallHeightMeters]) : '';
    environment.sync(scene && scene.environment.perimeter.length ? [{ id: 'environment', shape: environmentShape, value: scene.environment }] : []);
    areas.sync((scene?.restrictedAreas ?? []).map((area) => ({ id: area.id, shape: JSON.stringify(area.vertices), value: area })));
    posts.sync((scene?.posts ?? []).map((post) => ({ id: post.id, shape: `${post.heightMeters}:${post.baseRadiusMeters}`, value: post })));
    const postsById = new Map((scene?.posts ?? []).map((post) => [post.id, post]));
    belts.sync((scene?.belts ?? []).flatMap((belt) => {
      const from = postsById.get(belt.fromPostId);
      const to = postsById.get(belt.toPostId);
      return from && to ? [{ id: belt.id, shape: JSON.stringify([from.position, to.position, belt.heightMeters]), value: { belt, from, to } }] : [];
    }));
    routes.sync((scene?.routes ?? []).filter((route) => route.points.length >= 2).map((route) => ({ id: route.id, shape: JSON.stringify(route.points), value: route })));
    const personShape = simulation ? `${simulation.personHeightMeters}:${simulation.personRadiusMeters}` : '';
    people.sync((scene?.people ?? []).map((person) => ({ id: person.id, shape: personShape, value: person })));
    draft.sync(draftPoints.length ? [{ id: 'draft', shape: JSON.stringify(draftPoints), value: draftPoints }] : []);
    highlightPosts(highlightedPostIds);
  };

  return { root, sync, highlightPosts, dispose: () => { for (const layer of layers) layer.dispose(); } };
}
