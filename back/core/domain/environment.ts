import type {
  EntityId,
  Environment,
  Meters,
  PointXZ,
  MeasurementSource,
  Vertex,
  BoundingBoxXZ,
} from './types.ts';
import type { ValidationResult } from './types.ts';
import {
  DEFAULT_MAX_METRIC_BOUND,
  EPSILON,
  assertFiniteNumber,
  assertFinitePointXZ,
  computeAABB,
  isFiniteNumber,
  snapToGrid,
} from './math2d.ts';
import {
  perimeterLength,
  polygonArea,
  validateSimplePolygon,
} from './polygon.ts';
import {
  createMeasurementEvidence,
  isValidIsoDateString,
  validateMeasurementEvidence,
  type MeasurementCheck,
} from './measurement.ts';

export const DEFAULT_WALL_HEIGHT_METERS: Meters = 2.8;
export const MAX_WALL_HEIGHT_METERS: Meters = 50.0;

/**
 * Validates a complete Environment object against metric and contractual rules.
 */
export function validateEnvironment(
  env: unknown,
  options: {
    maxWallHeight?: Meters;
    maxCoordinate?: Meters;
  } = {}
): ValidationResult {
  const errors: string[] = [];
  const maxWallHeight = options.maxWallHeight ?? MAX_WALL_HEIGHT_METERS;
  const maxCoord = options.maxCoordinate ?? DEFAULT_MAX_METRIC_BOUND;

  if (!env || typeof env !== 'object') {
    return { valid: false, errors: ['Environment must be a non-null object'] };
  }

  const e = env as Partial<Environment>;

  // 1. Validate wall height
  if (!isFiniteNumber(e.wallHeightMeters, EPSILON, maxWallHeight)) {
    errors.push(
      `wallHeightMeters must be a positive finite number between ${EPSILON}m and ${maxWallHeight}m, received: ${String(
        e.wallHeightMeters
      )}`
    );
  }

  // 2. Validate perimeter as a simple polygon
  if (!Array.isArray(e.perimeter)) {
    errors.push('perimeter must be an array of vertices');
  } else {
    const polyResult = validateSimplePolygon(e.perimeter, {
      requireUniqueIds: true,
      maxCoordinate: maxCoord,
    });
    if (!polyResult.valid) {
      errors.push(...polyResult.errors.map((err) => `Perimeter invalid: ${err}`));
    }
  }

  // 3. Validate confirmedAt
  if (e.confirmedAt !== null && e.confirmedAt !== undefined && !isValidIsoDateString(e.confirmedAt)) {
    errors.push(`confirmedAt must be null or a valid ISO date-time string, received: '${String(e.confirmedAt)}'`);
  }

  // 4. Validate measurement evidence
  if (Array.isArray(e.perimeter)) {
    const measResult = validateMeasurementEvidence(e.measurement, e.perimeter);
    if (!measResult.valid) {
      errors.push(...measResult.errors.map((err) => `Measurement evidence invalid: ${err}`));
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Parameters for creating a rectangular manual floor plan.
 */
export interface CreateRectangleEnvironmentOptions {
  widthMeters: Meters;
  depthMeters: Meters;
  origin?: PointXZ;
  wallHeightMeters?: Meters;
  source?: MeasurementSource;
  recordedAt?: string;
  confirmed?: boolean;
  checks?: readonly MeasurementCheck[];
}

/**
 * Creates a valid rectangular Environment on the XZ floor plan.
 * Corner 0: (origin.x, origin.z)
 * Corner 1: (origin.x + width, origin.z)
 * Corner 2: (origin.x + width, origin.z + depth)
 * Corner 3: (origin.x, origin.z + depth)
 * With implicit closure back to Corner 0.
 *
 * Measurement checks start empty by default, avoiding tautological zero-error claims.
 * Explicit physical checks can be provided via options.checks.
 */
export function createRectangleEnvironment(options: CreateRectangleEnvironmentOptions): Environment {
  const {
    widthMeters,
    depthMeters,
    origin = { x: 0, z: 0 },
    wallHeightMeters = DEFAULT_WALL_HEIGHT_METERS,
    source = 'manual',
    recordedAt = new Date().toISOString(),
    confirmed = false,
    checks = [],
  } = options;

  assertFiniteNumber(widthMeters, 'widthMeters', 0.1);
  assertFiniteNumber(depthMeters, 'depthMeters', 0.1);
  assertFinitePointXZ(origin, 'origin');
  assertFiniteNumber(wallHeightMeters, 'wallHeightMeters', 0.1, MAX_WALL_HEIGHT_METERS);

  const vertices: Vertex[] = [
    { id: 'corner-1', x: origin.x, z: origin.z },
    { id: 'corner-2', x: origin.x + widthMeters, z: origin.z },
    { id: 'corner-3', x: origin.x + widthMeters, z: origin.z + depthMeters },
    { id: 'corner-4', x: origin.x, z: origin.z + depthMeters },
  ];

  const measurement = createMeasurementEvidence(source, checks, vertices, recordedAt);

  const env: Environment = {
    perimeter: vertices,
    wallHeightMeters,
    measurement,
    confirmedAt: confirmed ? recordedAt : null,
  };

  const validation = validateEnvironment(env);
  if (!validation.valid) {
    throw new Error(`Generated rectangle environment is invalid: ${validation.errors.join('; ')}`);
  }

  return env;
}

/**
 * Moves a perimeter vertex to a new position and validates the updated environment.
 */
export function movePerimeterVertex(
  env: Environment,
  vertexId: EntityId,
  newPosition: PointXZ
): { environment: Environment; validation: ValidationResult } {
  assertFinitePointXZ(newPosition, 'newPosition');

  const index = env.perimeter.findIndex((v) => v.id === vertexId);
  if (index === -1) {
    return {
      environment: env,
      validation: { valid: false, errors: [`Vertex '${vertexId}' not found in perimeter`] },
    };
  }

  const updatedPerimeter: Vertex[] = env.perimeter.map((v, i) =>
    i === index ? { ...v, x: newPosition.x, z: newPosition.z } : v
  );

  // Re-evaluate measurement evidence with updated perimeter
  const updatedMeasurement = createMeasurementEvidence(
    env.measurement.source,
    env.measurement.checks,
    updatedPerimeter,
    env.measurement.recordedAt
  );

  const updatedEnv: Environment = {
    ...env,
    perimeter: updatedPerimeter,
    measurement: updatedMeasurement,
    confirmedAt: null, // Any geometry change invalidates previous confirmation
  };

  const validation = validateEnvironment(updatedEnv);
  return {
    environment: validation.valid ? updatedEnv : env,
    validation,
  };
}

/**
 * Inserts a new vertex into the perimeter after a specified existing vertex.
 */
export function addPerimeterVertex(
  env: Environment,
  newVertex: Vertex,
  afterVertexId: EntityId
): { environment: Environment; validation: ValidationResult } {
  assertFinitePointXZ(newVertex, 'newVertex');
  if (!newVertex.id || typeof newVertex.id !== 'string') {
    return {
      environment: env,
      validation: { valid: false, errors: ['New vertex must have a valid string id'] },
    };
  }

  const index = env.perimeter.findIndex((v) => v.id === afterVertexId);
  if (index === -1) {
    return {
      environment: env,
      validation: { valid: false, errors: [`Reference vertex '${afterVertexId}' not found in perimeter`] },
    };
  }

  const updatedPerimeter = [...env.perimeter];
  updatedPerimeter.splice(index + 1, 0, { ...newVertex });

  const updatedMeasurement = createMeasurementEvidence(
    env.measurement.source,
    env.measurement.checks,
    updatedPerimeter,
    env.measurement.recordedAt
  );

  const updatedEnv: Environment = {
    ...env,
    perimeter: updatedPerimeter,
    measurement: updatedMeasurement,
    confirmedAt: null, // Any geometry change invalidates previous confirmation
  };

  const validation = validateEnvironment(updatedEnv);
  return {
    environment: validation.valid ? updatedEnv : env,
    validation,
  };
}

/**
 * Removes a vertex from the perimeter, ensuring at least 3 vertices remain.
 */
export function removePerimeterVertex(
  env: Environment,
  vertexId: EntityId
): { environment: Environment; validation: ValidationResult } {
  if (env.perimeter.length <= 3) {
    return {
      environment: env,
      validation: { valid: false, errors: ['Cannot remove vertex: polygon must have at least 3 vertices'] },
    };
  }

  const index = env.perimeter.findIndex((v) => v.id === vertexId);
  if (index === -1) {
    return {
      environment: env,
      validation: { valid: false, errors: [`Vertex '${vertexId}' not found in perimeter`] },
    };
  }

  const updatedPerimeter = env.perimeter.filter((v) => v.id !== vertexId);

  // Filter out any checks referencing the deleted vertex
  const remainingChecks = env.measurement.checks.filter(
    (c) => c.fromVertexId !== vertexId && c.toVertexId !== vertexId
  );

  const updatedMeasurement = createMeasurementEvidence(
    env.measurement.source,
    remainingChecks,
    updatedPerimeter,
    env.measurement.recordedAt
  );

  const updatedEnv: Environment = {
    ...env,
    perimeter: updatedPerimeter,
    measurement: updatedMeasurement,
    confirmedAt: null, // Any geometry change invalidates previous confirmation
  };

  const validation = validateEnvironment(updatedEnv);
  return {
    environment: validation.valid ? updatedEnv : env,
    validation,
  };
}

/**
 * Snaps all vertices of an Environment's perimeter to a metric grid.
 */
export function snapEnvironmentToGrid(
  env: Environment,
  gridSizeMeters: Meters,
  origin: PointXZ = { x: 0, z: 0 }
): { environment: Environment; validation: ValidationResult } {
  const updatedPerimeter = env.perimeter.map((v) => ({
    ...v,
    ...snapToGrid(v, gridSizeMeters, origin),
  }));

  const updatedMeasurement = createMeasurementEvidence(
    env.measurement.source,
    env.measurement.checks,
    updatedPerimeter,
    env.measurement.recordedAt
  );

  const updatedEnv: Environment = {
    ...env,
    perimeter: updatedPerimeter,
    measurement: updatedMeasurement,
    confirmedAt: null, // Any geometry change invalidates previous confirmation
  };

  const validation = validateEnvironment(updatedEnv);
  return {
    environment: validation.valid ? updatedEnv : env,
    validation,
  };
}

/**
 * Returns the surface area of an environment in square meters.
 */
export function getEnvironmentArea(env: Environment): Meters {
  return polygonArea(env.perimeter);
}

/**
 * Returns the perimeter length of an environment in meters.
 */
export function getEnvironmentPerimeterLength(env: Environment): Meters {
  return perimeterLength(env.perimeter);
}

/**
 * Returns the bounding box of an environment.
 */
export function getEnvironmentBoundingBox(env: Environment): BoundingBoxXZ {
  return computeAABB(env.perimeter);
}
