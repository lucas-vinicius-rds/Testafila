import type {
  EntityId,
  Meters,
  MeasurementEvidence,
  MeasurementSource,
  Vertex,
} from './types.ts';
import { distance, isFiniteNumber, isFinitePointXZ } from './math2d.ts';

const VALID_SOURCES: ReadonlySet<MeasurementSource> = new Set(['manual', 'calibrated', 'webxr']);

export interface MeasurementCheck {
  fromVertexId: EntityId;
  toVertexId: EntityId;
  measuredMeters: Meters;
}

export interface MeasurementValidationResult {
  valid: boolean;
  errors: string[];
  derivedErrorPercent?: number;
}

export interface CheckEvaluationResult {
  fromVertexId: EntityId;
  toVertexId: EntityId;
  modelMeters: Meters;
  measuredMeters: Meters;
  errorPercent: number;
}

/**
 * Validates an ISO 8601 date-time string.
 */
export function isValidIsoDateString(str: unknown): str is string {
  if (typeof str !== 'string' || str.trim().length === 0) return false;
  const timestamp = Date.parse(str);
  return !Number.isNaN(timestamp);
}

/**
 * Computes observed error percent from checks against a list of vertices.
 * Returns undefined if there are no checks. Never assumes zero.
 */
export function computeObservedErrorPercent(
  checks: readonly MeasurementCheck[],
  vertices: readonly Vertex[]
): number | undefined {
  if (checks.length === 0) {
    return undefined;
  }

  const vertexMap = new Map<string, Vertex>();
  for (const v of vertices) {
    if (!v || typeof v !== 'object' || typeof v.id !== 'string' || v.id.trim() === '')
      throw new Error('Vertices must have non-empty string IDs');
    if (vertexMap.has(v.id)) throw new Error(`Duplicate vertex ID: ${v.id}`);
    vertexMap.set(v.id, v);
  }

  let maxErrorPercent = 0;
  for (const check of checks) {
    const vFrom = vertexMap.get(check.fromVertexId);
    const vTo = vertexMap.get(check.toVertexId);
    if (!vFrom || !vTo) {
      throw new Error(`Check references missing vertex: ${check.fromVertexId} or ${check.toVertexId}`);
    }
    if (!isFinitePointXZ(vFrom) || !isFinitePointXZ(vTo)) {
      throw new Error('Referenced vertices must have finite XZ coordinates');
    }
    if (check.fromVertexId === check.toVertexId) {
      throw new Error(`Check endpoints must be distinct: ${check.fromVertexId}`);
    }
    if (!isFiniteNumber(check.measuredMeters, 1e-7)) {
      throw new Error(`Measured distance must be a positive finite number, received: ${check.measuredMeters}`);
    }

    const modelDist = distance(vFrom, vTo);
    const err = (100 * Math.abs(modelDist - check.measuredMeters)) / check.measuredMeters;
    if (!isFiniteNumber(err, 0)) throw new Error('Derived measurement error must be finite');
    if (err > maxErrorPercent) {
      maxErrorPercent = err;
    }
  }

  return maxErrorPercent;
}

/**
 * Validates MeasurementEvidence according to contract rules:
 * - source must be 'manual' | 'calibrated' | 'webxr'
 * - recordedAt must be valid ISO 8601 date string
 * - checks must be an array
 * - each check must reference distinct existing vertex IDs
 * - measuredMeters must be finite and > 0
 * - observedErrorPercent must not be assumed 0 when checks is empty
 */
export function validateMeasurementEvidence(
  evidence: unknown,
  vertices: readonly Vertex[]
): MeasurementValidationResult {
  const errors: string[] = [];

  if (!evidence || typeof evidence !== 'object') {
    return { valid: false, errors: ['Measurement evidence must be an object'] };
  }

  const ev = evidence as Partial<MeasurementEvidence>;

  if (!ev.source || !VALID_SOURCES.has(ev.source as MeasurementSource)) {
    errors.push(`Invalid measurement source: '${String(ev.source)}'. Allowed: manual, calibrated, webxr`);
  }

  if (!isValidIsoDateString(ev.recordedAt)) {
    errors.push(`recordedAt must be a valid ISO date-time string, received: '${String(ev.recordedAt)}'`);
  }

  if (!Array.isArray(ev.checks)) {
    errors.push('checks must be an array of measurement checks');
    return { valid: false, errors };
  }

  const vertexMap = new Map<string, Vertex>();
  for (const v of vertices) {
    if (!v || typeof v !== 'object' || typeof v.id !== 'string' || v.id.trim() === '') {
      errors.push('Vertices must have non-empty string IDs');
      continue;
    }
    if (vertexMap.has(v.id)) {
      errors.push(`Duplicate vertex ID '${v.id}'`);
      continue;
    }
    vertexMap.set(v.id, v);
  }

  const evaluations: CheckEvaluationResult[] = [];

  for (let i = 0; i < ev.checks.length; i++) {
    const ch = ev.checks[i];
    if (!ch || typeof ch !== 'object') {
      errors.push(`Check at index ${i} is not a valid object`);
      continue;
    }

    const { fromVertexId, toVertexId, measuredMeters } = ch;

    if (!fromVertexId || typeof fromVertexId !== 'string') {
      errors.push(`Check at index ${i} missing valid fromVertexId`);
    }
    if (!toVertexId || typeof toVertexId !== 'string') {
      errors.push(`Check at index ${i} missing valid toVertexId`);
    }

    if (fromVertexId && toVertexId && fromVertexId === toVertexId) {
      errors.push(`Check at index ${i} has identical endpoints: '${fromVertexId}'`);
    }

    if (!isFiniteNumber(measuredMeters, 1e-7)) {
      errors.push(`Check at index ${i} has invalid measuredMeters (${String(measuredMeters)}). Must be finite and > 0`);
    }

    if (fromVertexId && toVertexId && fromVertexId !== toVertexId) {
      const vFrom = vertexMap.get(fromVertexId);
      const vTo = vertexMap.get(toVertexId);

      if (!vFrom) {
        errors.push(`Check at index ${i} references non-existent fromVertexId '${fromVertexId}'`);
      }
      if (!vTo) {
        errors.push(`Check at index ${i} references non-existent toVertexId '${toVertexId}'`);
      }

      if (vFrom && !isFinitePointXZ(vFrom)) {
        errors.push(`Check at index ${i} references fromVertexId '${fromVertexId}' with non-finite coordinates`);
      }
      if (vTo && !isFinitePointXZ(vTo)) {
        errors.push(`Check at index ${i} references toVertexId '${toVertexId}' with non-finite coordinates`);
      }

      if (vFrom && vTo && isFinitePointXZ(vFrom) && isFinitePointXZ(vTo) && isFiniteNumber(measuredMeters, 1e-7)) {
        const modelDist = distance(vFrom, vTo);
        const err = (100 * Math.abs(modelDist - measuredMeters)) / measuredMeters;
        if (!isFiniteNumber(err, 0)) {
          errors.push(`Check at index ${i} derived non-finite error percent`);
        } else {
          evaluations.push({
            fromVertexId,
            toVertexId,
            modelMeters: modelDist,
            measuredMeters,
            errorPercent: err,
          });
        }
      }
    }
  }

  if (ev.checks.length === 0) {
    // When no checks, observedErrorPercent must be undefined (omitted)
    if (ev.observedErrorPercent !== undefined) {
      errors.push('observedErrorPercent must be omitted when checks array is empty; never assume zero');
    }
    return {
      valid: errors.length === 0,
      errors,
      derivedErrorPercent: undefined,
    };
  }

  const derivedMaxError = evaluations.length > 0 ? Math.max(...evaluations.map((e) => e.errorPercent)) : undefined;

  if (ev.observedErrorPercent !== undefined) {
    if (!isFiniteNumber(ev.observedErrorPercent, 0)) {
      errors.push(`observedErrorPercent must be a non-negative finite number, received: ${String(ev.observedErrorPercent)}`);
    } else if (derivedMaxError !== undefined && Math.abs(ev.observedErrorPercent - derivedMaxError) > 1e-4) {
      errors.push(
        `observedErrorPercent mismatch: stated ${ev.observedErrorPercent}%, derived ${derivedMaxError.toFixed(4)}%`
      );
    }
  }

  const finiteDerivedError = derivedMaxError !== undefined && isFiniteNumber(derivedMaxError, 0);
  if (derivedMaxError !== undefined && !finiteDerivedError) errors.push('Derived measurement error must be finite');
  return {
    valid: errors.length === 0,
    errors,
    ...(finiteDerivedError ? { derivedErrorPercent: derivedMaxError } : {}),
  };
}

/**
 * Creates a valid MeasurementEvidence object, automatically deriving observedErrorPercent if checks are present.
 */
export function createMeasurementEvidence(
  source: MeasurementSource,
  checks: readonly MeasurementCheck[] = [],
  vertices: readonly Vertex[] = [],
  recordedAt = new Date().toISOString()
): MeasurementEvidence {
  if (!VALID_SOURCES.has(source)) {
    throw new Error(`Invalid measurement source: ${source}`);
  }
  if (!isValidIsoDateString(recordedAt)) {
    throw new Error(`Invalid recordedAt ISO date: ${recordedAt}`);
  }

  const derivedError = checks.length > 0 ? computeObservedErrorPercent(checks, vertices) : undefined;

  const evidence: MeasurementEvidence = {
    source,
    recordedAt,
    checks: checks.map((c) => ({
      fromVertexId: c.fromVertexId,
      toVertexId: c.toVertexId,
      measuredMeters: c.measuredMeters,
    })),
  };

  if (derivedError !== undefined) {
    evidence.observedErrorPercent = derivedError;
  }

  return evidence;
}

/**
 * Evaluates whether all checks in an evidence object satisfy a maximum allowable error percentage.
 * Fails if checks array is empty, if evidence is invalid, or if any check has non-positive/invalid measured distance.
 */
export function evaluateMeasurementTolerance(
  evidence: unknown,
  vertices: readonly Vertex[],
  maxAllowedErrorPercent: number
): {
  pass: boolean;
  maxErrorPercent: number | undefined;
  evaluations: CheckEvaluationResult[];
} {
  // Policy tolerance must be a non-negative finite number
  if (!isFiniteNumber(maxAllowedErrorPercent, 0)) {
    return {
      pass: false,
      maxErrorPercent: undefined,
      evaluations: [],
    };
  }

  // Validate entire measurement evidence against vertices
  const validation = validateMeasurementEvidence(evidence, vertices);
  if (!validation.valid) {
    return {
      pass: false,
      maxErrorPercent: undefined,
      evaluations: [],
    };
  }

  const ev = evidence as MeasurementEvidence;
  if (!ev.checks || ev.checks.length === 0) {
    return {
      pass: false,
      maxErrorPercent: undefined,
      evaluations: [],
    };
  }

  const vertexMap = new Map<string, Vertex>();
  for (const v of vertices) {
    if (v && typeof v === 'object' && v.id) {
      vertexMap.set(v.id, v);
    }
  }

  const evaluations: CheckEvaluationResult[] = [];
  let maxError: number | undefined = undefined;

  for (const check of ev.checks) {
    const vFrom = vertexMap.get(check.fromVertexId)!;
    const vTo = vertexMap.get(check.toVertexId)!;
    const modelDist = distance(vFrom, vTo);
    const err = (100 * Math.abs(modelDist - check.measuredMeters)) / check.measuredMeters;

    evaluations.push({
      fromVertexId: check.fromVertexId,
      toVertexId: check.toVertexId,
      modelMeters: modelDist,
      measuredMeters: check.measuredMeters,
      errorPercent: err,
    });

    if (maxError === undefined || err > maxError) {
      maxError = err;
    }
  }

  const pass = maxError !== undefined && maxError <= maxAllowedErrorPercent;

  return {
    pass,
    maxErrorPercent: maxError,
    evaluations,
  };
}
