import {
  addPerimeterVertex,
  createMeasurementEvidence,
  createRectangleEnvironment,
  getEnvironmentArea,
  getEnvironmentPerimeterLength,
  movePerimeterVertex,
  removePerimeterVertex,
  validateEnvironment,
} from "@testafila/core/domain";
import type { Environment, PointXZ, ProjectScene, ValidationResult, Vertex } from "@testafila/core/domain/types";

export { getEnvironmentArea, getEnvironmentPerimeterLength };

export function measurementSourceLabel(environment: Environment): string {
  const { source } = environment.measurement;
  if (source === "webxr") return "Medida com a câmera";
  return source === "calibrated" ? "Planta calibrada" : "Medidas digitadas";
}

export function createEmptyProjectScene(): ProjectScene {
  const recordedAt = new Date().toISOString();
  return {
    schemaVersion: 2,
    units: "meters",
    coordinateSystem: "right-handed-y-up-xz-floor",
    environment: {
      perimeter: [],
      wallHeightMeters: 2.8,
      measurement: createMeasurementEvidence("manual", [], [], recordedAt),
      confirmedAt: null,
    },
    restrictedAreas: [],
    posts: [],
    belts: [],
    routes: [],
    queue: { personIds: [] },
    people: [],
    simulation: {
      spacingMeters: 0.8,
      personHeightMeters: 1.7,
      personRadiusMeters: 0.22,
      clearanceMeters: 0.05,
    },
  };
}

export function createManualRectangle(widthMeters: number, depthMeters: number, wallHeightMeters: number): Environment {
  return createRectangleEnvironment({
    widthMeters,
    depthMeters,
    wallHeightMeters,
    source: "manual",
    checks: [],
  });
}

function changedEnvironment(environment: Environment, perimeter: Vertex[]): Environment {
  return {
    ...environment,
    perimeter,
    confirmedAt: null,
    measurement: {
      source: "manual",
      recordedAt: environment.measurement.recordedAt,
      checks: [],
    },
  };
}

export function appendManualVertex(environment: Environment, vertex: Vertex): Environment {
  if (environment.perimeter.length < 2) {
    return changedEnvironment(environment, [...environment.perimeter, vertex]);
  }

  const lastVertex = environment.perimeter[environment.perimeter.length - 1];
  const result = addPerimeterVertex(environment, vertex, lastVertex.id);
  if (result.validation.valid) return result.environment;
  return changedEnvironment(environment, [...environment.perimeter, vertex]);
}

export function moveManualVertex(environment: Environment, vertexId: string, point: PointXZ): Environment {
  const result = movePerimeterVertex(environment, vertexId, point);
  if (result.validation.valid) return result.environment;

  return changedEnvironment(
    environment,
    environment.perimeter.map((vertex) => vertex.id === vertexId ? { ...vertex, ...point } : vertex),
  );
}

export function removeManualVertex(environment: Environment, vertexId: string): Environment {
  const result = removePerimeterVertex(environment, vertexId);
  if (result.validation.valid) return result.environment;
  return changedEnvironment(environment, environment.perimeter.filter((vertex) => vertex.id !== vertexId));
}

export function validateManualEnvironment(environment: Environment): ValidationResult {
  return validateEnvironment(environment);
}

export function confirmManualEnvironment(environment: Environment): Environment {
  return { ...environment, confirmedAt: new Date().toISOString() };
}

export function updateManualWallHeight(environment: Environment, wallHeightMeters: number): Environment {
  return { ...environment, wallHeightMeters, confirmedAt: null };
}
