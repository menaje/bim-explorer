import { createHash } from "node:crypto";

export const REPORT_SCHEMA = "bim-explorer-ifc-engine-report/0.2";
export const FINGERPRINT_PROJECTION =
  "bim-explorer-ifc-engine-fingerprint/0.2";

export const CAPABILITY_NAMES = Object.freeze([
  "parse",
  "semanticIndex",
  "geometry",
  "placements",
  "mappedRepresentations",
  "identity",
  "typeOccurrence",
  "propertySets",
  "quantities",
  "materials",
  "classifications",
  "relations",
  "sharedGeometryInstances",
  "writeRoundTrip",
  "cancellation",
  "corruptInputCleanup",
  "packagingMacos",
  "packagingLinux",
  "packagingBrowser",
  "packagingVscode",
]);

export const CAPABILITY_STATUSES = Object.freeze([
  "native",
  "mapped",
  "opaque",
  "lossy",
  "blocked",
]);

const CAPABILITY_STATUS_SET = new Set(CAPABILITY_STATUSES);
const SHA256 = /^[0-9a-f]{64}$/u;

function plainRecord(value, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function nonEmptyString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
}

function nonNegativeNumber(value, label) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new TypeError(`${label} must be a non-negative finite number`);
  }
}

function finiteNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number`);
  }
}

function nonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`);
  }
}

function stringList(value, label) {
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === "string")
  ) {
    throw new TypeError(`${label} must be a string list`);
  }
}

function assertPathFree(value, label = "report") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      assertPathFree(item, `${label}[${index}]`);
    });
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (key.toLowerCase().includes("path")) {
        throw new Error(`${label}.${key} must not expose a source path`);
      }
      assertPathFree(item, `${label}.${key}`);
    }
  }
}

function validateCountRecord(value, label) {
  const record = plainRecord(value, label);
  for (const [name, count] of Object.entries(record)) {
    nonEmptyString(name, `${label} key`);
    nonNegativeInteger(count, `${label}.${name}`);
  }
}

function validateNumericRecord(value, label) {
  const record = plainRecord(value, label);
  for (const [name, measurement] of Object.entries(record)) {
    nonEmptyString(name, `${label} key`);
    finiteNumber(measurement, `${label}.${name}`);
  }
}

function validateBounds(value, label) {
  const bounds = plainRecord(value, label);
  for (const field of ["min", "max"]) {
    if (
      !Array.isArray(bounds[field]) ||
      bounds[field].length !== 3
    ) {
      throw new TypeError(`${label}.${field} must be a 3D vector`);
    }
    bounds[field].forEach((coordinate, index) => {
      finiteNumber(coordinate, `${label}.${field}[${index}]`);
    });
  }
  for (let axis = 0; axis < 3; axis += 1) {
    if (bounds.min[axis] > bounds.max[axis]) {
      throw new Error(`${label} has an inverted axis ${axis}`);
    }
  }
}

export function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function fingerprintProjection(report) {
  return {
    projection: FINGERPRINT_PROJECTION,
    engine: {
      id: report.engine.id,
      version: report.engine.version,
      backend: report.engine.backend,
    },
    fixture: report.fixture,
    capabilities: report.capabilities,
    semantics: report.semantics,
    relations: report.relations,
    representationSharing: report.representationSharing,
    geometry: report.geometry,
  };
}

export function calculateFingerprint(report) {
  return createHash("sha256")
    .update(canonicalJson(fingerprintProjection(report)))
    .digest("hex");
}

export function finalizeReport(report) {
  const finalized = structuredClone(report);
  finalized.fingerprint = {
    algorithm: "sha256",
    projection: FINGERPRINT_PROJECTION,
    value: calculateFingerprint(finalized),
  };
  validateIfcEngineReport(finalized);
  return finalized;
}

export function validateIfcEngineReport(value) {
  const report = plainRecord(value, "IFC engine report");
  if (report.schema !== REPORT_SCHEMA) {
    throw new Error(`unsupported IFC engine report schema ${report.schema}`);
  }
  assertPathFree(report);

  const engine = plainRecord(report.engine, "engine");
  for (const field of ["id", "version", "backend", "license"]) {
    nonEmptyString(engine[field], `engine.${field}`);
  }

  const fixture = plainRecord(report.fixture, "fixture");
  nonEmptyString(fixture.id, "fixture.id");
  nonEmptyString(fixture.schema, "fixture.schema");
  nonEmptyString(fixture.view, "fixture.view");
  nonNegativeInteger(fixture.byteLength, "fixture.byteLength");
  if (!SHA256.test(fixture.sha256)) {
    throw new Error("fixture.sha256 must be a lowercase SHA-256 digest");
  }

  const capabilities = plainRecord(report.capabilities, "capabilities");
  for (const capability of CAPABILITY_NAMES) {
    if (!CAPABILITY_STATUS_SET.has(capabilities[capability])) {
      throw new Error(
        `capabilities.${capability} must use the operation matrix`,
      );
    }
  }
  const extraCapabilities = Object.keys(capabilities)
    .filter((name) => !CAPABILITY_NAMES.includes(name));
  if (extraCapabilities.length > 0) {
    throw new Error(
      `unknown capabilities: ${extraCapabilities.join(", ")}`,
    );
  }

  const semantics = plainRecord(report.semantics, "semantics");
  validateCountRecord(semantics.entityCounts, "semantics.entityCounts");
  const globalIds = plainRecord(semantics.globalIds, "semantics.globalIds");
  for (const field of ["count", "duplicates", "missingOnIfcRoot"]) {
    nonNegativeInteger(globalIds[field], `semantics.globalIds.${field}`);
  }
  const expressIds = plainRecord(
    semantics.expressIds,
    "semantics.expressIds",
  );
  for (const field of ["count", "duplicates", "minimum", "maximum"]) {
    nonNegativeInteger(expressIds[field], `semantics.expressIds.${field}`);
  }
  if (
    expressIds.minimum > expressIds.maximum ||
    !SHA256.test(expressIds.globalIdMapSha256)
  ) {
    throw new Error("invalid Express ID identity diagnostics");
  }
  stringList(semantics.spatialHierarchy, "semantics.spatialHierarchy");
  const wall = plainRecord(semantics.wall, "semantics.wall");
  for (const field of ["name", "tag", "type"]) {
    nonEmptyString(wall[field], `semantics.wall.${field}`);
  }
  stringList(wall.materials, "semantics.wall.materials");
  stringList(wall.propertySets, "semantics.wall.propertySets");
  validateNumericRecord(wall.quantities, "semantics.wall.quantities");
  if (!Array.isArray(wall.classifications)) {
    throw new TypeError("semantics.wall.classifications must be a list");
  }
  wall.classifications.forEach((value, index) => {
    const classification = plainRecord(
      value,
      `semantics.wall.classifications[${index}]`,
    );
    for (const field of ["identification", "name", "source"]) {
      nonEmptyString(
        classification[field],
        `semantics.wall.classifications[${index}].${field}`,
      );
    }
  });

  validateCountRecord(report.relations, "relations");

  const geometry = plainRecord(report.geometry, "geometry");
  const sharing = plainRecord(
    report.representationSharing,
    "representationSharing",
  );
  for (const field of [
    "representationMaps",
    "mappedItems",
    "productsUsingMappedItems",
    "distinctMappingSources",
  ]) {
    nonNegativeInteger(sharing[field], `representationSharing.${field}`);
  }
  if (
    sharing.distinctMappingSources > sharing.representationMaps ||
    sharing.productsUsingMappedItems > geometry.products
  ) {
    throw new Error("invalid mapped representation sharing counts");
  }

  for (const field of [
    "products",
    "geometries",
    "vertices",
    "triangles",
  ]) {
    nonNegativeInteger(geometry[field], `geometry.${field}`);
  }
  if (geometry.coordinateSystem !== "ifc-world-z-up") {
    throw new Error("geometry.coordinateSystem must be ifc-world-z-up");
  }
  validateBounds(geometry.bounds, "geometry.bounds");
  if (!Array.isArray(geometry.instances)) {
    throw new TypeError("geometry.instances must be a list");
  }
  for (const [index, value] of geometry.instances.entries()) {
    const instance = plainRecord(value, `geometry.instances[${index}]`);
    nonEmptyString(instance.globalId, `geometry.instances[${index}].globalId`);
    nonNegativeInteger(
      instance.expressId,
      `geometry.instances[${index}].expressId`,
    );
    nonNegativeInteger(
      instance.triangles,
      `geometry.instances[${index}].triangles`,
    );
    validateBounds(
      instance.bounds,
      `geometry.instances[${index}].bounds`,
    );
  }
  if (
    geometry.instances.length !== geometry.products ||
    new Set(
      geometry.instances.map((instance) => instance.expressId),
    ).size !== geometry.instances.length
  ) {
    throw new Error("geometry instances must map one-to-one to products");
  }

  const performance = plainRecord(report.performance, "performance");
  for (const field of [
    "initializationMs",
    "openMs",
    "semanticMs",
    "geometryMs",
    "totalMs",
    "peakRssBytes",
    "heapUsedBytes",
  ]) {
    nonNegativeNumber(performance[field], `performance.${field}`);
  }

  const cleanup = plainRecord(report.cleanup, "cleanup");
  for (const field of ["modelClosed", "engineDisposed"]) {
    if (typeof cleanup[field] !== "boolean") {
      throw new TypeError(`cleanup.${field} must be boolean`);
    }
  }
  stringList(report.diagnostics, "diagnostics");

  const fingerprint = plainRecord(report.fingerprint, "fingerprint");
  if (
    fingerprint.algorithm !== "sha256" ||
    fingerprint.projection !== FINGERPRINT_PROJECTION ||
    !SHA256.test(fingerprint.value)
  ) {
    throw new Error("invalid deterministic fingerprint descriptor");
  }
  if (fingerprint.value !== calculateFingerprint(report)) {
    throw new Error("deterministic fingerprint does not match report");
  }

  return Object.freeze({
    schema: report.schema,
    engine: `${engine.id}@${engine.version}`,
    fingerprint: fingerprint.value,
    triangles: geometry.triangles,
  });
}
