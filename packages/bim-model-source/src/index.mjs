import {
  BIM_SOURCE_ARTIFACT_SCHEMA,
} from "./artifact-schema.mjs";
import {
  BIM_SOURCE_SEMANTIC_QUERY_RESULT,
  BimSemanticIndex,
} from "./semantic-index.mjs";
import {
  sha256Hex,
} from "./sha256.mjs";

export const BIM_SOURCE_PROTOCOL_VERSION =
  "bim-explorer-bim-source/0.2";
export const BIM_ENTITY_DETAILS_SCHEMA =
  "bim-explorer-bim-entity-details/0.1";
export const BIM_PROPERTY_SET_VALUES_SCHEMA =
  "bim-explorer-bim-property-set-values/0.1";

const SHA256 = /^[0-9a-f]{64}$/u;
const IFC_GLOBAL_ID = /^[0-3][0-9A-Za-z_$]{21}$/u;
const DOCUMENT_ID = /^document:[a-z0-9][a-z0-9:._-]*$/u;
const RANGE_ID = /^range:[a-z0-9][a-z0-9:._-]*$/u;
const GEOMETRY_MEDIA_TYPE =
  "application/vnd.bim-explorer.geometry-range.v1";
const SEMANTIC_DETAIL_MEDIA_TYPE =
  "application/vnd.bim-explorer.semantic-detail-range.v1";
const PROPERTY_DETAIL_MEDIA_TYPE =
  "application/vnd.bim-explorer.property-detail-range.v1";

function plainRecord(value, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ArrayBuffer.isView(value)
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

function nonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`);
  }
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
}

function finiteVector(value, length, label) {
  if (
    !Array.isArray(value) ||
    value.length !== length ||
    !value.every((item) =>
      typeof item === "number" && Number.isFinite(item))
  ) {
    throw new TypeError(`${label} must be a finite ${length}D vector`);
  }
  return [...value];
}

function boundsValue(value, label) {
  const bounds = plainRecord(value, label);
  const min = finiteVector(bounds.min, 3, `${label}.min`);
  const max = finiteVector(bounds.max, 3, `${label}.max`);
  for (let axis = 0; axis < 3; axis += 1) {
    if (min[axis] > max[axis]) {
      throw new RangeError(`${label} has an inverted axis ${axis}`);
    }
  }
  return { min, max };
}

function canonicalize(value) {
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

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function deepFreeze(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    ArrayBuffer.isView(value)
  ) {
    return value;
  }
  for (const item of Object.values(value)) {
    deepFreeze(item);
  }
  return Object.freeze(value);
}

function aborted(signal) {
  signal?.throwIfAborted?.();
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException(
      "operation aborted",
      "AbortError",
    );
  }
}

function invalidState(message) {
  return new DOMException(message, "InvalidStateError");
}

function digest(bytes) {
  return sha256Hex(bytes);
}

function parseGeometryRange(bytes, label) {
  const headerBytes = 16;
  const recordHeaderBytes = 20;
  if (bytes.byteLength < headerBytes) {
    throw new RangeError(`${label} geometry header is truncated`);
  }
  if (
    new TextDecoder().decode(bytes.slice(0, 8)) !== "BEXGEO01"
  ) {
    throw new Error(`${label} geometry magic is invalid`);
  }
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  );
  if (view.getUint32(8, true) !== 1) {
    throw new Error(`${label} geometry version is unsupported`);
  }
  const recordCount = view.getUint32(12, true);
  if (recordCount === 0) {
    throw new Error(`${label} geometry records must be non-empty`);
  }
  const records = new Map();
  let offset = headerBytes;
  for (let index = 0; index < recordCount; index += 1) {
    const recordLabel = `${label} geometry record ${index}`;
    if (offset + recordHeaderBytes > bytes.byteLength) {
      throw new RangeError(`${recordLabel} header is truncated`);
    }
    const start = offset;
    const geometryExpressId = view.getUint32(offset, true);
    const vertexFloatCount = view.getUint32(offset + 4, true);
    const indexCount = view.getUint32(offset + 8, true);
    const vertexByteLength = view.getUint32(offset + 12, true);
    const indexByteLength = view.getUint32(offset + 16, true);
    if (
      geometryExpressId === 0 ||
      vertexFloatCount === 0 ||
      vertexFloatCount % 6 !== 0 ||
      indexCount === 0 ||
      indexCount % 3 !== 0 ||
      vertexByteLength !==
        vertexFloatCount * Float32Array.BYTES_PER_ELEMENT ||
      indexByteLength !==
        indexCount * Uint32Array.BYTES_PER_ELEMENT
    ) {
      throw new Error(`${recordLabel} header is malformed`);
    }
    offset += recordHeaderBytes;
    const vertexEnd = offset + vertexByteLength;
    const indexEnd = vertexEnd + indexByteLength;
    if (indexEnd > bytes.byteLength) {
      throw new RangeError(`${recordLabel} payload is truncated`);
    }
    for (
      let vertexOffset = offset;
      vertexOffset < vertexEnd;
      vertexOffset += Float32Array.BYTES_PER_ELEMENT
    ) {
      if (!Number.isFinite(view.getFloat32(vertexOffset, true))) {
        throw new Error(`${recordLabel} contains a non-finite vertex`);
      }
    }
    const vertexCount = vertexFloatCount / 6;
    for (
      let indexOffset = vertexEnd;
      indexOffset < indexEnd;
      indexOffset += Uint32Array.BYTES_PER_ELEMENT
    ) {
      if (view.getUint32(indexOffset, true) >= vertexCount) {
        throw new RangeError(
          `${recordLabel} contains an out-of-range index`,
        );
      }
    }
    if (records.has(geometryExpressId)) {
      throw new Error(`${label} geometry Express IDs must be unique`);
    }
    records.set(geometryExpressId, {
      geometryExpressId,
      vertexCount,
      indexCount,
      triangles: indexCount / 3,
      offset: start,
      byteLength: indexEnd - start,
    });
    offset = indexEnd;
  }
  if (offset !== bytes.byteLength) {
    throw new Error(`${label} has unindexed trailing geometry bytes`);
  }
  return records;
}

function validateSemanticDetails(value, label) {
  const details = plainRecord(value, label);
  const quantities = plainRecord(
    details.quantities,
    `${label}.quantities`,
  );
  for (const [name, measurement] of Object.entries(quantities)) {
    nonEmptyString(name, `${label}.quantities name`);
    if (
      typeof measurement !== "number" ||
      !Number.isFinite(measurement)
    ) {
      throw new TypeError(
        `${label}.quantities.${name} must be finite`,
      );
    }
  }
  if (
    !Array.isArray(details.materials) ||
    !details.materials.every((name) =>
      typeof name === "string" && name.length > 0)
  ) {
    throw new TypeError(
      `${label}.materials must be a string list`,
    );
  }
  if (!Array.isArray(details.classifications)) {
    throw new TypeError(
      `${label}.classifications must be a list`,
    );
  }
  const classifications = details.classifications.map(
    (value, index) => {
      const classification = plainRecord(
        value,
        `${label}.classifications[${index}]`,
      );
      for (const field of [
        "identification",
        "name",
        "source",
      ]) {
        nonEmptyString(
          classification[field],
          `${label}.classifications[${index}].${field}`,
        );
      }
      return structuredClone(classification);
    },
  );
  return {
    quantities: structuredClone(quantities),
    materials: [...details.materials],
    classifications,
  };
}

function validatePropertySetValues(value, label) {
  const details = plainRecord(value, label);
  if (!Array.isArray(details.propertySets)) {
    throw new TypeError(
      `${label}.propertySets must be a list`,
    );
  }
  const propertySets = details.propertySets.map(
    (value, setIndex) => {
      const setLabel =
        `${label}.propertySets[${setIndex}]`;
      const propertySet = plainRecord(value, setLabel);
      positiveInteger(
        propertySet.expressId,
        `${setLabel}.expressId`,
      );
      nonEmptyString(propertySet.name, `${setLabel}.name`);
      if (!["occurrence", "type"].includes(propertySet.scope)) {
        throw new TypeError(`${setLabel}.scope is invalid`);
      }
      if (!Array.isArray(propertySet.properties)) {
        throw new TypeError(
          `${setLabel}.properties must be a list`,
        );
      }
      const properties = propertySet.properties.map(
        (value, propertyIndex) => {
          const propertyLabel =
            `${setLabel}.properties[${propertyIndex}]`;
          const property = plainRecord(
            value,
            propertyLabel,
          );
          positiveInteger(
            property.expressId,
            `${propertyLabel}.expressId`,
          );
          nonEmptyString(
            property.name,
            `${propertyLabel}.name`,
          );
          nonEmptyString(
            property.propertyClass,
            `${propertyLabel}.propertyClass`,
          );
          const nominal = plainRecord(
            property.nominalValue,
            `${propertyLabel}.nominalValue`,
          );
          if (
            !["value", "null", "opaque"].includes(
              nominal.status,
            )
          ) {
            throw new TypeError(
              `${propertyLabel}.nominalValue.status is invalid`,
            );
          }
          nonEmptyString(
            nominal.ifcType,
            `${propertyLabel}.nominalValue.ifcType`,
          );
          if (
            (
              nominal.status === "value" &&
              !(
                typeof nominal.value === "string" ||
                typeof nominal.value === "boolean" ||
                (
                  typeof nominal.value === "number" &&
                  Number.isFinite(nominal.value)
                )
              )
            ) ||
            (
              nominal.status !== "value" &&
              nominal.value !== null
            )
          ) {
            throw new TypeError(
              `${propertyLabel}.nominalValue.value is invalid`,
            );
          }
          let unit = null;
          if (property.unit !== null) {
            const unitValue = plainRecord(
              property.unit,
              `${propertyLabel}.unit`,
            );
            positiveInteger(
              unitValue.expressId,
              `${propertyLabel}.unit.expressId`,
            );
            for (const field of [
              "ifcClass",
              "unitType",
              "prefix",
              "name",
            ]) {
              if (typeof unitValue[field] !== "string") {
                throw new TypeError(
                  `${propertyLabel}.unit.${field} must be a string`,
                );
              }
            }
            unit = structuredClone(unitValue);
          }
          return {
            expressId: property.expressId,
            name: property.name,
            propertyClass: property.propertyClass,
            nominalValue: structuredClone(nominal),
            unit,
          };
        },
      );
      if (
        new Set(
          properties.map((property) => property.expressId),
        ).size !== properties.length
      ) {
        throw new Error(
          `${setLabel} property Express IDs must be unique`,
        );
      }
      return {
        expressId: propertySet.expressId,
        name: propertySet.name,
        scope: propertySet.scope,
        properties,
      };
    },
  );
  if (
    new Set(
      propertySets.map((propertySet) =>
        `${propertySet.scope}:${propertySet.expressId}`),
    ).size !== propertySets.length
  ) {
    throw new Error(
      `${label} property-set identities must be unique`,
    );
  }
  return { propertySets };
}

function parseSemanticDetailRange(bytes, label) {
  const headerBytes = 16;
  const recordHeaderBytes = 8;
  if (bytes.byteLength < headerBytes) {
    throw new RangeError(
      `${label} semantic detail header is truncated`,
    );
  }
  if (
    new TextDecoder().decode(bytes.slice(0, 8)) !==
      "BEXDET01"
  ) {
    throw new Error(
      `${label} semantic detail magic is invalid`,
    );
  }
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  );
  if (view.getUint32(8, true) !== 1) {
    throw new Error(
      `${label} semantic detail version is unsupported`,
    );
  }
  const recordCount = view.getUint32(12, true);
  if (recordCount === 0) {
    throw new Error(
      `${label} semantic detail records must be non-empty`,
    );
  }
  const records = new Map();
  const decoder = new TextDecoder("utf-8", {
    fatal: true,
  });
  let offset = headerBytes;
  for (let index = 0; index < recordCount; index += 1) {
    const recordLabel =
      `${label} semantic detail record ${index}`;
    if (offset + recordHeaderBytes > bytes.byteLength) {
      throw new RangeError(
        `${recordLabel} header is truncated`,
      );
    }
    const expressId = view.getUint32(offset, true);
    const byteLength = view.getUint32(offset + 4, true);
    offset += recordHeaderBytes;
    if (
      expressId === 0 ||
      byteLength === 0 ||
      offset + byteLength > bytes.byteLength
    ) {
      throw new RangeError(
        `${recordLabel} payload is malformed`,
      );
    }
    let value;
    try {
      value = JSON.parse(
        decoder.decode(bytes.slice(offset, offset + byteLength)),
      );
    } catch {
      throw new Error(
        `${recordLabel} JSON is malformed`,
      );
    }
    validateSemanticDetails(value, recordLabel);
    if (records.has(expressId)) {
      throw new Error(
        `${label} semantic detail Express IDs must be unique`,
      );
    }
    records.set(expressId, {
      expressId,
      offset,
      byteLength,
    });
    offset += byteLength;
  }
  if (offset !== bytes.byteLength) {
    throw new Error(
      `${label} has unindexed semantic detail bytes`,
    );
  }
  return records;
}

function parsePropertyDetailRange(bytes, label) {
  const headerBytes = 16;
  const recordHeaderBytes = 8;
  if (bytes.byteLength < headerBytes) {
    throw new RangeError(
      `${label} property detail header is truncated`,
    );
  }
  if (
    new TextDecoder().decode(bytes.slice(0, 8)) !==
      "BEXPRP01"
  ) {
    throw new Error(
      `${label} property detail magic is invalid`,
    );
  }
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  );
  if (view.getUint32(8, true) !== 1) {
    throw new Error(
      `${label} property detail version is unsupported`,
    );
  }
  const recordCount = view.getUint32(12, true);
  if (recordCount === 0) {
    throw new Error(
      `${label} property detail records must be non-empty`,
    );
  }
  const records = new Map();
  const decoder = new TextDecoder("utf-8", {
    fatal: true,
  });
  let offset = headerBytes;
  for (let index = 0; index < recordCount; index += 1) {
    const recordLabel =
      `${label} property detail record ${index}`;
    if (offset + recordHeaderBytes > bytes.byteLength) {
      throw new RangeError(
        `${recordLabel} header is truncated`,
      );
    }
    const expressId = view.getUint32(offset, true);
    const byteLength = view.getUint32(offset + 4, true);
    offset += recordHeaderBytes;
    if (
      expressId === 0 ||
      byteLength === 0 ||
      offset + byteLength > bytes.byteLength
    ) {
      throw new RangeError(
        `${recordLabel} payload is malformed`,
      );
    }
    let value;
    try {
      value = JSON.parse(
        decoder.decode(bytes.slice(offset, offset + byteLength)),
      );
    } catch {
      throw new Error(`${recordLabel} JSON is malformed`);
    }
    validatePropertySetValues(value, recordLabel);
    if (records.has(expressId)) {
      throw new Error(
        `${label} property detail Express IDs must be unique`,
      );
    }
    records.set(expressId, {
      expressId,
      offset,
      byteLength,
    });
    offset += byteLength;
  }
  if (offset !== bytes.byteLength) {
    throw new Error(
      `${label} has unindexed property detail bytes`,
    );
  }
  return records;
}

function validateSource(value) {
  const source = plainRecord(value, "artifact.source");
  if (!DOCUMENT_ID.test(source.documentId ?? "")) {
    throw new TypeError(
      "artifact.source.documentId must be an opaque document ID",
    );
  }
  positiveInteger(source.byteLength, "artifact.source.byteLength");
  if (!SHA256.test(source.sha256 ?? "")) {
    throw new TypeError(
      "artifact.source.sha256 must be a lowercase SHA-256 digest",
    );
  }
  nonEmptyString(source.ifcSchema, "artifact.source.ifcSchema");
  nonEmptyString(source.profile, "artifact.source.profile");
  return structuredClone(source);
}

function validateAdapter(value) {
  const adapter = plainRecord(value, "artifact.adapter");
  for (const field of ["id", "version", "backend", "license"]) {
    nonEmptyString(adapter[field], `artifact.adapter.${field}`);
  }
  const cleanup = plainRecord(adapter.cleanup, "artifact.adapter.cleanup");
  if (
    cleanup.modelClosed !== true ||
    cleanup.engineDisposed !== true
  ) {
    throw new Error(
      "artifact adapter must prove model and engine cleanup",
    );
  }
  return structuredClone(adapter);
}

function validateRange(value, index) {
  const range = plainRecord(value, `artifact.ranges[${index}]`);
  if (!RANGE_ID.test(range.rangeId ?? "")) {
    throw new TypeError(
      `artifact.ranges[${index}].rangeId is invalid`,
    );
  }
  nonEmptyString(
    range.mediaType,
    `artifact.ranges[${index}].mediaType`,
  );
  if (range.mediaType !== GEOMETRY_MEDIA_TYPE) {
    throw new Error(
      `artifact.ranges[${index}].mediaType is unsupported`,
    );
  }
  if (!(range.bytes instanceof Uint8Array) || range.bytes.byteLength === 0) {
    throw new TypeError(
      `artifact.ranges[${index}].bytes must be a non-empty Uint8Array`,
    );
  }
  const bytes = Uint8Array.from(range.bytes);
  const sha256 = digest(bytes);
  if (range.sha256 !== sha256) {
    throw new Error(
      `artifact.ranges[${index}] digest does not match its bytes`,
    );
  }
  const geometryRecords = parseGeometryRange(
    bytes,
    `artifact.ranges[${index}]`,
  );
  return {
    rangeId: range.rangeId,
    mediaType: range.mediaType,
    sha256,
    bytes,
    geometryRecords,
  };
}

function validateDetailRange(value, index) {
  const label = `artifact.detailRanges[${index}]`;
  const range = plainRecord(value, label);
  if (!RANGE_ID.test(range.rangeId ?? "")) {
    throw new TypeError(`${label}.rangeId is invalid`);
  }
  if (range.mediaType !== SEMANTIC_DETAIL_MEDIA_TYPE) {
    throw new Error(`${label}.mediaType is unsupported`);
  }
  if (
    !(range.bytes instanceof Uint8Array) ||
    range.bytes.byteLength === 0
  ) {
    throw new TypeError(
      `${label}.bytes must be a non-empty Uint8Array`,
    );
  }
  const bytes = Uint8Array.from(range.bytes);
  const sha256 = digest(bytes);
  if (range.sha256 !== sha256) {
    throw new Error(
      `${label} digest does not match its bytes`,
    );
  }
  return {
    rangeId: range.rangeId,
    mediaType: range.mediaType,
    sha256,
    bytes,
    records: parseSemanticDetailRange(bytes, label),
  };
}

function validatePropertyDetailRange(value, index) {
  const label =
    `artifact.propertyDetails.ranges[${index}]`;
  const range = plainRecord(value, label);
  if (!RANGE_ID.test(range.rangeId ?? "")) {
    throw new TypeError(`${label}.rangeId is invalid`);
  }
  if (range.mediaType !== PROPERTY_DETAIL_MEDIA_TYPE) {
    throw new Error(`${label}.mediaType is unsupported`);
  }
  if (
    !(range.bytes instanceof Uint8Array) ||
    range.bytes.byteLength === 0
  ) {
    throw new TypeError(
      `${label}.bytes must be a non-empty Uint8Array`,
    );
  }
  const bytes = Uint8Array.from(range.bytes);
  const sha256 = digest(bytes);
  if (range.sha256 !== sha256) {
    throw new Error(
      `${label} digest does not match its bytes`,
    );
  }
  return {
    rangeId: range.rangeId,
    mediaType: range.mediaType,
    sha256,
    bytes,
    records: parsePropertyDetailRange(bytes, label),
  };
}

function validatePropertyDetails(
  value,
  entities,
  occupiedRangeIds,
) {
  const details = plainRecord(
    value,
    "artifact.propertyDetails",
  );
  if (details.mediaType !== PROPERTY_DETAIL_MEDIA_TYPE) {
    throw new Error(
      "artifact.propertyDetails.mediaType is unsupported",
    );
  }
  if (
    !Array.isArray(details.ranges) ||
    details.ranges.length === 0
  ) {
    throw new TypeError(
      "artifact.propertyDetails.ranges must be non-empty",
    );
  }
  const ranges = details.ranges.map(
    validatePropertyDetailRange,
  );
  const rangeById = new Map(
    ranges.map((range) => [range.rangeId, range]),
  );
  if (
    rangeById.size !== ranges.length ||
    ranges.some((range) =>
      occupiedRangeIds.has(range.rangeId))
  ) {
    throw new Error(
      "artifact property range IDs must be globally unique",
    );
  }
  if (
    !Array.isArray(details.slices) ||
    details.slices.length !== entities.length
  ) {
    throw new Error(
      "artifact property slices must match entities",
    );
  }
  const slices = details.slices.map((value, index) => {
    const label =
      `artifact.propertyDetails.slices[${index}]`;
    const slice = plainRecord(value, label);
    positiveInteger(slice.expressId, `${label}.expressId`);
    const range = rangeById.get(slice.rangeId);
    if (range === undefined) {
      throw new RangeError(
        `${label}.rangeId is outside property ranges`,
      );
    }
    nonNegativeInteger(slice.offset, `${label}.offset`);
    positiveInteger(slice.byteLength, `${label}.byteLength`);
    const record = range.records.get(slice.expressId);
    if (
      record === undefined ||
      record.offset !== slice.offset ||
      record.byteLength !== slice.byteLength
    ) {
      throw new Error(
        `${label} does not match its property record`,
      );
    }
    return structuredClone(slice);
  });
  if (
    new Set(slices.map((slice) => slice.expressId)).size !==
      slices.length ||
    entities.some(
      (entity) =>
        !slices.some((slice) =>
          slice.expressId === entity.expressId),
    )
  ) {
    throw new Error(
      "artifact property detail identities are incomplete",
    );
  }
  const resources = structuredClone(
    plainRecord(
      details.resources,
      "artifact.propertyDetails.resources",
    ),
  );
  const limits = plainRecord(
    resources.limits,
    "artifact.propertyDetails.resources.limits",
  );
  const observed = plainRecord(
    resources.observed,
    "artifact.propertyDetails.resources.observed",
  );
  for (const field of [
    "maximumBytes",
    "maximumRangeBytes",
    "maximumRanges",
  ]) {
    positiveInteger(
      limits[field],
      `artifact.propertyDetails.resources.limits.${field}`,
    );
  }
  for (const field of [
    "bytes",
    "ranges",
    "largestRangeBytes",
    "records",
  ]) {
    nonNegativeInteger(
      observed[field],
      `artifact.propertyDetails.resources.observed.${field}`,
    );
  }
  const totalBytes = ranges.reduce(
    (sum, range) => sum + range.bytes.byteLength,
    0,
  );
  const largestRangeBytes = Math.max(
    ...ranges.map((range) => range.bytes.byteLength),
  );
  if (
    observed.bytes !== totalBytes ||
    observed.ranges !== ranges.length ||
    observed.largestRangeBytes !== largestRangeBytes ||
    observed.records !== slices.length ||
    observed.bytes > limits.maximumBytes ||
    observed.ranges > limits.maximumRanges ||
    observed.largestRangeBytes >
      limits.maximumRangeBytes
  ) {
    throw new Error(
      "artifact property detail resources do not match content",
    );
  }
  return {
    mediaType: details.mediaType,
    ranges,
    slices,
    resources,
  };
}

function validateGeoreferencing(value) {
  const georeferencing = plainRecord(
    value,
    "artifact.georeferencing",
  );
  if (georeferencing.status === "absent") {
    if (georeferencing.reason !== "no-ifc-map-conversion") {
      throw new Error(
        "absent georeferencing requires a bounded reason",
      );
    }
    return structuredClone(georeferencing);
  }
  if (georeferencing.status === "invalid") {
    if (
      !Array.isArray(georeferencing.diagnostics) ||
      georeferencing.diagnostics.length === 0 ||
      georeferencing.diagnostics.some(
        (diagnostic) =>
          typeof diagnostic?.code !== "string" ||
          diagnostic.code.length === 0,
      )
    ) {
      throw new Error(
        "invalid georeferencing requires diagnostics",
      );
    }
    return structuredClone(georeferencing);
  }
  if (georeferencing.status !== "mapped") {
    throw new Error(
      "artifact georeferencing status is unsupported",
    );
  }
  const crs = plainRecord(
    georeferencing.projectedCrs,
    "artifact.georeferencing.projectedCrs",
  );
  positiveInteger(
    crs.expressId,
    "artifact.georeferencing.projectedCrs.expressId",
  );
  for (const field of [
    "name",
    "description",
    "geodeticDatum",
    "verticalDatum",
    "mapProjection",
    "mapZone",
  ]) {
    if (typeof crs[field] !== "string") {
      throw new TypeError(
        `artifact.georeferencing.projectedCrs.${field} must be a string`,
      );
    }
  }
  const conversion = plainRecord(
    georeferencing.mapConversion,
    "artifact.georeferencing.mapConversion",
  );
  for (const field of [
    "expressId",
    "sourceContextExpressId",
    "targetCrsExpressId",
  ]) {
    positiveInteger(
      conversion[field],
      `artifact.georeferencing.mapConversion.${field}`,
    );
  }
  for (const field of [
    "eastings",
    "northings",
    "orthogonalHeight",
    "xAxisAbscissa",
    "xAxisOrdinate",
    "scale",
  ]) {
    if (
      typeof conversion[field] !== "number" ||
      !Number.isFinite(conversion[field])
    ) {
      throw new TypeError(
        `artifact.georeferencing.mapConversion.${field} must be finite`,
      );
    }
  }
  if (
    conversion.scale <= 0 ||
    conversion.targetCrsExpressId !== crs.expressId ||
    conversion.numericPrecision !== "float64-metadata"
  ) {
    throw new Error(
      "artifact map conversion identity or scale is invalid",
    );
  }
  finiteVector(
    conversion.normalizedXAxis,
    2,
    "artifact.georeferencing.mapConversion.normalizedXAxis",
  );
  finiteVector(
    conversion.mapFromIfcWorld,
    16,
    "artifact.georeferencing.mapConversion.mapFromIfcWorld",
  );
  return structuredClone(georeferencing);
}

function validateSemanticSummary(value, label) {
  const semantics = plainRecord(value, label);
  for (const field of [
    "propertySets",
    "quantityNames",
    "materialNames",
    "classificationNames",
  ]) {
    if (
      !Array.isArray(semantics[field]) ||
      !semantics[field].every((item) =>
        typeof item === "string" && item.length > 0)
    ) {
      throw new TypeError(
        `${label}.${field} must be a string list`,
      );
    }
  }
  for (const field of ["container", "type"]) {
    if (
      semantics[field] !== null &&
      (
        typeof semantics[field] !== "object" ||
        Array.isArray(semantics[field])
      )
    ) {
      throw new TypeError(
        `${label}.${field} must be an object or null`,
      );
    }
  }
  return structuredClone(semantics);
}

function validatePrimitive(value, label, rangeById) {
  const primitive = plainRecord(value, label);
  positiveInteger(
    primitive.geometryExpressId,
    `${label}.geometryExpressId`,
  );
  positiveInteger(primitive.vertexCount, `${label}.vertexCount`);
  positiveInteger(primitive.indexCount, `${label}.indexCount`);
  positiveInteger(primitive.triangles, `${label}.triangles`);
  const transform = finiteVector(
    primitive.transform,
    16,
    `${label}.transform`,
  );
  const color = finiteVector(primitive.color, 4, `${label}.color`);
  const slice = plainRecord(primitive.slice, `${label}.slice`);
  if (!rangeById.has(slice.rangeId)) {
    throw new RangeError(`${label}.slice references an unknown range`);
  }
  nonNegativeInteger(slice.offset, `${label}.slice.offset`);
  positiveInteger(slice.byteLength, `${label}.slice.byteLength`);
  if (
    slice.offset + slice.byteLength >
      rangeById.get(slice.rangeId).bytes.byteLength
  ) {
    throw new RangeError(`${label}.slice exceeds its geometry range`);
  }
  const geometryRecord = rangeById
    .get(slice.rangeId)
    .geometryRecords
    .get(primitive.geometryExpressId);
  if (
    geometryRecord === undefined ||
    geometryRecord.offset !== slice.offset ||
    geometryRecord.byteLength !== slice.byteLength ||
    geometryRecord.vertexCount !== primitive.vertexCount ||
    geometryRecord.indexCount !== primitive.indexCount ||
    geometryRecord.triangles !== primitive.triangles
  ) {
    throw new Error(`${label} does not match its geometry record`);
  }
  return {
    geometryExpressId: primitive.geometryExpressId,
    vertexCount: primitive.vertexCount,
    indexCount: primitive.indexCount,
    triangles: primitive.triangles,
    transform,
    color,
    slice: structuredClone(slice),
  };
}

function validateEntity(
  value,
  index,
  rangeById,
  detailRangeById,
) {
  const label = `artifact.entities[${index}]`;
  const entity = plainRecord(value, label);
  positiveInteger(entity.expressId, `${label}.expressId`);
  if (!IFC_GLOBAL_ID.test(entity.globalId ?? "")) {
    throw new TypeError(`${label}.globalId is not an IFC GlobalId`);
  }
  nonEmptyString(entity.ifcClass, `${label}.ifcClass`);
  nonEmptyString(entity.name, `${label}.name`);
  if (typeof entity.renderable !== "boolean") {
    throw new TypeError(`${label}.renderable must be boolean`);
  }
  nonNegativeInteger(entity.triangles, `${label}.triangles`);
  if (!Array.isArray(entity.primitives)) {
    throw new TypeError(`${label}.primitives must be a list`);
  }
  const primitives = entity.primitives.map((primitive, primitiveIndex) =>
    validatePrimitive(
      primitive,
      `${label}.primitives[${primitiveIndex}]`,
      rangeById,
    ));
  if (!Array.isArray(entity.diagnostics)) {
    throw new TypeError(`${label}.diagnostics must be a list`);
  }
  const diagnostics = entity.diagnostics.map((value, diagnosticIndex) => {
    const diagnosticLabel =
      `${label}.diagnostics[${diagnosticIndex}]`;
    const diagnostic = plainRecord(value, diagnosticLabel);
    nonEmptyString(diagnostic.code, `${diagnosticLabel}.code`);
    if (diagnostic.code !== "empty-tessellation") {
      throw new Error(`${diagnosticLabel}.code is unsupported`);
    }
    positiveInteger(
      diagnostic.geometryExpressId,
      `${diagnosticLabel}.geometryExpressId`,
    );
    return structuredClone(diagnostic);
  });
  if (
    entity.renderable !== (primitives.length > 0) ||
    entity.triangles !==
      primitives.reduce(
        (sum, primitive) => sum + primitive.triangles,
        0,
      ) ||
    (
      entity.renderable &&
      (
        entity.bounds === null ||
        entity.triangles === 0
      )
    ) ||
    (
      !entity.renderable &&
      (
        entity.bounds !== null ||
        entity.triangles !== 0 ||
        diagnostics.length === 0
      )
    )
  ) {
    throw new Error(`${label} renderability is inconsistent`);
  }
  const bounds = entity.renderable
    ? boundsValue(entity.bounds, `${label}.bounds`)
    : null;
  const detailSlice = plainRecord(
    entity.detailSlice,
    `${label}.detailSlice`,
  );
  if (!detailRangeById.has(detailSlice.rangeId)) {
    throw new RangeError(
      `${label}.detailSlice references an unknown range`,
    );
  }
  nonNegativeInteger(
    detailSlice.offset,
    `${label}.detailSlice.offset`,
  );
  positiveInteger(
    detailSlice.byteLength,
    `${label}.detailSlice.byteLength`,
  );
  const detailRecord = detailRangeById
    .get(detailSlice.rangeId)
    .records
    .get(entity.expressId);
  if (
    detailRecord === undefined ||
    detailRecord.offset !== detailSlice.offset ||
    detailRecord.byteLength !== detailSlice.byteLength
  ) {
    throw new Error(
      `${label}.detailSlice does not match its semantic record`,
    );
  }
  return {
    expressId: entity.expressId,
    globalId: entity.globalId,
    ifcClass: entity.ifcClass,
    name: entity.name,
    tag: typeof entity.tag === "string" ? entity.tag : "",
    renderable: entity.renderable,
    triangles: entity.triangles,
    bounds,
    primitives,
    diagnostics,
    semantics: validateSemanticSummary(
      entity.semantics,
      `${label}.semantics`,
    ),
    detailSlice: structuredClone(detailSlice),
  };
}

function validateTree(value, entities) {
  const tree = plainRecord(value, "artifact.tree");
  if (!Array.isArray(tree.nodes) || tree.nodes.length === 0) {
    throw new TypeError("artifact.tree.nodes must be non-empty");
  }
  const nodes = tree.nodes.map((value, index) => {
    const label = `artifact.tree.nodes[${index}]`;
    const node = plainRecord(value, label);
    positiveInteger(node.expressId, `${label}.expressId`);
    if (!IFC_GLOBAL_ID.test(node.globalId ?? "")) {
      throw new TypeError(`${label}.globalId is not an IFC GlobalId`);
    }
    nonEmptyString(node.ifcClass, `${label}.ifcClass`);
    nonEmptyString(node.name, `${label}.name`);
    if (!["spatial", "product"].includes(node.kind)) {
      throw new TypeError(`${label}.kind is invalid`);
    }
    if (node.parentExpressId !== null) {
      positiveInteger(node.parentExpressId, `${label}.parentExpressId`);
      if (node.parentExpressId === node.expressId) {
        throw new Error(`${label} cannot be its own parent`);
      }
    }
    return structuredClone(node);
  });
  const byId = new Map(nodes.map((node) => [node.expressId, node]));
  if (byId.size !== nodes.length) {
    throw new Error("artifact tree Express IDs must be unique");
  }
  if (
    new Set(nodes.map((node) => node.globalId)).size !== nodes.length
  ) {
    throw new Error("artifact tree GlobalIds must be unique");
  }
  for (const node of nodes) {
    if (
      node.parentExpressId !== null &&
      !byId.has(node.parentExpressId)
    ) {
      throw new RangeError(
        `artifact tree parent ${node.parentExpressId} is unknown`,
      );
    }
    const seen = new Set([node.expressId]);
    let cursor = node;
    while (cursor.parentExpressId !== null) {
      if (seen.has(cursor.parentExpressId)) {
        throw new Error("artifact tree contains a cycle");
      }
      seen.add(cursor.parentExpressId);
      cursor = byId.get(cursor.parentExpressId);
    }
  }
  const productById = new Map(
    nodes
      .filter((node) => node.kind === "product")
      .map((node) => [node.expressId, node]),
  );
  for (const entity of entities) {
    const node = productById.get(entity.expressId);
    if (
      node?.globalId !== entity.globalId ||
      node?.ifcClass !== entity.ifcClass
    ) {
      throw new Error(
        `artifact tree does not preserve entity ${entity.expressId}`,
      );
    }
  }
  if (
    productById.size !== entities.length ||
    !Array.isArray(tree.roots) ||
    !tree.roots.every(Number.isSafeInteger)
  ) {
    throw new Error("artifact tree product/root index is incomplete");
  }
  const expectedRoots = nodes
    .filter((node) => node.parentExpressId === null)
    .map((node) => node.expressId)
    .sort((left, right) => left - right);
  const roots = [...tree.roots].sort((left, right) => left - right);
  if (
    roots.length !== expectedRoots.length ||
    roots.some((root, index) => root !== expectedRoots[index])
  ) {
    throw new Error("artifact tree roots do not match parent links");
  }
  return { roots, nodes };
}

function validateResources(
  value,
  source,
  ranges,
  detailRanges,
  entities,
  tree,
) {
  const resources = plainRecord(value, "artifact.resources");
  const limits = structuredClone(
    plainRecord(resources.limits, "artifact.resources.limits"),
  );
  const observed = structuredClone(
    plainRecord(resources.observed, "artifact.resources.observed"),
  );
  const limitFields = [
    "maximumSourceBytes",
    "maximumProducts",
    "maximumGeometryBytes",
    "maximumRangeBytes",
    "maximumRanges",
    "maximumDetailBytes",
    "maximumDetailRangeBytes",
    "maximumDetailRanges",
    "maximumRelationEntries",
    "maximumTreeNodes",
    "maximumMetadataBytes",
  ];
  const observedFields = [
    "sourceBytes",
    "geometryBytes",
    "ranges",
    "largestRangeBytes",
    "detailBytes",
    "detailRanges",
    "largestDetailRangeBytes",
    "metadataBytes",
    "products",
    "relationEntries",
    "treeNodes",
  ];
  for (const field of limitFields) {
    positiveInteger(limits[field], `artifact.resources.limits.${field}`);
  }
  for (const field of observedFields) {
    nonNegativeInteger(
      observed[field],
      `artifact.resources.observed.${field}`,
    );
  }
  const totalGeometryBytes = ranges.reduce(
    (sum, range) => sum + range.bytes.byteLength,
    0,
  );
  const metadataBytes = new TextEncoder().encode(
    JSON.stringify({ tree, entities }),
  ).byteLength;
  const totalDetailBytes = detailRanges.reduce(
    (sum, range) => sum + range.bytes.byteLength,
    0,
  );
  if (
    observed.sourceBytes !== source.byteLength ||
    observed.geometryBytes !== totalGeometryBytes ||
    observed.ranges !== ranges.length ||
    observed.largestRangeBytes !== Math.max(
      ...ranges.map((range) => range.bytes.byteLength),
    ) ||
    observed.detailBytes !== totalDetailBytes ||
    observed.detailRanges !== detailRanges.length ||
    observed.largestDetailRangeBytes !== Math.max(
      ...detailRanges.map((range) => range.bytes.byteLength),
    ) ||
    observed.metadataBytes !== metadataBytes ||
    observed.products !== entities.length ||
    observed.treeNodes !== tree.nodes.length
  ) {
    throw new Error("artifact observed resources do not match content");
  }
  for (const [observedField, limitField] of [
    ["sourceBytes", "maximumSourceBytes"],
    ["geometryBytes", "maximumGeometryBytes"],
    ["largestRangeBytes", "maximumRangeBytes"],
    ["ranges", "maximumRanges"],
    ["detailBytes", "maximumDetailBytes"],
    ["largestDetailRangeBytes", "maximumDetailRangeBytes"],
    ["detailRanges", "maximumDetailRanges"],
    ["metadataBytes", "maximumMetadataBytes"],
    ["products", "maximumProducts"],
    ["relationEntries", "maximumRelationEntries"],
    ["treeNodes", "maximumTreeNodes"],
  ]) {
    if (observed[observedField] > limits[limitField]) {
      throw new RangeError(
        `artifact resource ${observedField} exceeds ${limitField}`,
      );
    }
  }
  return { limits, observed };
}

function validateArtifact(value) {
  const artifact = plainRecord(value, "BIM source artifact");
  if (artifact.schema !== BIM_SOURCE_ARTIFACT_SCHEMA) {
    throw new Error(`unsupported BIM source artifact ${artifact.schema}`);
  }
  const source = validateSource(artifact.source);
  const adapter = validateAdapter(artifact.adapter);
  const coordinateSystem = structuredClone(
    plainRecord(artifact.coordinateSystem, "artifact.coordinateSystem"),
  );
  nonEmptyString(
    coordinateSystem.storage,
    "artifact.coordinateSystem.storage",
  );
  nonEmptyString(
    coordinateSystem.source,
    "artifact.coordinateSystem.source",
  );
  coordinateSystem.sourceFromStorage = finiteVector(
    coordinateSystem.sourceFromStorage,
    16,
    "artifact.coordinateSystem.sourceFromStorage",
  );
  const georeferencing = validateGeoreferencing(
    artifact.georeferencing,
  );
  const coverage = structuredClone(
    plainRecord(artifact.coverage, "artifact.coverage"),
  );
  for (const field of ["supported", "unsupported"]) {
    if (
      !Array.isArray(coverage[field]) ||
      !coverage[field].every((item) =>
        typeof item === "string" && item.length > 0)
    ) {
      throw new TypeError(`artifact.coverage.${field} must be a string list`);
    }
  }
  if (!Array.isArray(artifact.ranges) || artifact.ranges.length === 0) {
    throw new TypeError("artifact.ranges must be non-empty");
  }
  const ranges = artifact.ranges.map(validateRange);
  const rangeById = new Map(ranges.map((range) => [range.rangeId, range]));
  if (rangeById.size !== ranges.length) {
    throw new Error("artifact range IDs must be unique");
  }
  if (
    !Array.isArray(artifact.detailRanges) ||
    artifact.detailRanges.length === 0
  ) {
    throw new TypeError(
      "artifact.detailRanges must be non-empty",
    );
  }
  const detailRanges = artifact.detailRanges.map(
    validateDetailRange,
  );
  const detailRangeById = new Map(
    detailRanges.map((range) => [range.rangeId, range]),
  );
  if (
    detailRangeById.size !== detailRanges.length ||
    detailRanges.some((range) => rangeById.has(range.rangeId))
  ) {
    throw new Error("artifact range IDs must be globally unique");
  }
  if (!Array.isArray(artifact.entities) || artifact.entities.length === 0) {
    throw new TypeError("artifact.entities must be non-empty");
  }
  const entities = artifact.entities.map((entity, index) =>
    validateEntity(
      entity,
      index,
      rangeById,
      detailRangeById,
    ));
  const detailExpressIds = new Set(
    detailRanges.flatMap((range) =>
      [...range.records.keys()]),
  );
  if (
    detailExpressIds.size !== entities.length ||
    entities.some((entity) =>
      !detailExpressIds.has(entity.expressId))
  ) {
    throw new Error(
      "artifact semantic details do not match entities",
    );
  }
  const propertyDetails = validatePropertyDetails(
    artifact.propertyDetails,
    entities,
    new Set([
      ...rangeById.keys(),
      ...detailRangeById.keys(),
    ]),
  );
  for (const [field, values] of [
    ["Express ID", entities.map((entity) => entity.expressId)],
    ["GlobalId", entities.map((entity) => entity.globalId)],
  ]) {
    if (new Set(values).size !== values.length) {
      throw new Error(`artifact ${field} values must be unique`);
    }
  }
  const tree = validateTree(artifact.tree, entities);
  const geometry = structuredClone(
    plainRecord(artifact.geometry, "artifact.geometry"),
  );
  for (const field of [
    "products",
    "placements",
    "renderableProducts",
    "primitives",
    "uniqueGeometries",
    "vertices",
    "instancedVertices",
    "triangles",
  ]) {
    positiveInteger(geometry[field], `artifact.geometry.${field}`);
  }
  for (const field of [
    "nonRenderableProducts",
    "emptyUniqueGeometries",
    "skippedEmptyGeometries",
  ]) {
    nonNegativeInteger(geometry[field], `artifact.geometry.${field}`);
  }
  geometry.bounds = boundsValue(
    geometry.bounds,
    "artifact.geometry.bounds",
  );
  if (
    geometry.products !== entities.length ||
    geometry.renderableProducts !== entities.filter(
      (entity) => entity.renderable,
    ).length ||
    geometry.nonRenderableProducts !== entities.filter(
      (entity) => !entity.renderable,
    ).length ||
    geometry.products !==
      geometry.renderableProducts + geometry.nonRenderableProducts ||
    geometry.placements !==
      geometry.primitives + geometry.skippedEmptyGeometries ||
    geometry.skippedEmptyGeometries !== entities.reduce(
      (sum, entity) => sum + entity.diagnostics.length,
      0,
    ) ||
    geometry.emptyUniqueGeometries >
      geometry.skippedEmptyGeometries ||
    geometry.primitives !== entities.reduce(
      (sum, entity) => sum + entity.primitives.length,
      0,
    ) ||
    geometry.uniqueGeometries !== ranges.reduce(
      (sum, range) => sum + range.geometryRecords.size,
      0,
    ) ||
    geometry.vertices !== ranges.reduce(
      (sum, range) =>
        sum +
        [...range.geometryRecords.values()].reduce(
          (rangeSum, record) => rangeSum + record.vertexCount,
          0,
        ),
      0,
    ) ||
    geometry.instancedVertices !== entities.reduce(
      (sum, entity) =>
        sum +
        entity.primitives.reduce(
          (entitySum, primitive) =>
            entitySum + primitive.vertexCount,
          0,
        ),
      0,
    ) ||
    geometry.triangles !==
      entities.reduce((sum, entity) => sum + entity.triangles, 0)
  ) {
    throw new Error("artifact geometry totals do not match entities");
  }
  const resources = validateResources(
    artifact.resources,
    source,
    ranges,
    detailRanges,
    entities,
    tree,
  );
  return {
    schema: artifact.schema,
    source,
    adapter,
    coordinateSystem,
    georeferencing,
    coverage,
    tree,
    geometry,
    resources,
    entities,
    ranges,
    detailRanges,
    propertyDetails,
  };
}

function projection(artifact) {
  return {
    schema: artifact.schema,
    source: artifact.source,
    adapter: artifact.adapter,
    coordinateSystem: artifact.coordinateSystem,
    coverage: artifact.coverage,
    tree: artifact.tree,
    geometry: artifact.geometry,
    resources: artifact.resources,
    entities: artifact.entities,
    ranges: artifact.ranges.map((range) => ({
      rangeId: range.rangeId,
      mediaType: range.mediaType,
      byteLength: range.bytes.byteLength,
      sha256: range.sha256,
    })),
    detailRanges: artifact.detailRanges.map((range) => ({
      rangeId: range.rangeId,
      mediaType: range.mediaType,
      byteLength: range.bytes.byteLength,
      sha256: range.sha256,
    })),
  };
}

function contextFields(source) {
  return {
    protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
    sessionId: source.sessionId,
    sourceId: source.sourceId,
    revisionId: source.revisionId,
    snapshotId: source.snapshotId,
    layerId: source.layerId,
  };
}

export class BimModelSource {
  #artifact;
  #rangeById;
  #detailRangeById;
  #propertyRangeById;
  #propertySliceByExpressId;
  #detailByExpressId = new Map();
  #propertyByExpressId = new Map();
  #entityByExpressId;
  #entityByGlobalId;
  #entityByRenderId;
  #entityByPickId;
  #semanticIndex;
  #snapshot;
  #opened = false;
  #sessionDisposed = false;
  #disposed = false;
  #rangeReads = 0;
  #rangeBytesRead = 0;
  #entityReads = 0;
  #pickResolutions = 0;
  #detailReads = 0;
  #detailBytesRead = 0;
  #propertyReads = 0;
  #propertyBytesRead = 0;

  constructor(artifact, {
    maximumRequestBytes = 1_048_576,
    maximumDetailRequestBytes = 1_048_576,
    maximumPropertyRequestBytes = 1_048_576,
    detailReadBudgetBytes,
    propertyReadBudgetBytes,
    sessionReadBudgetBytes,
  } = {}) {
    positiveInteger(maximumRequestBytes, "maximumRequestBytes");
    positiveInteger(
      maximumDetailRequestBytes,
      "maximumDetailRequestBytes",
    );
    positiveInteger(
      maximumPropertyRequestBytes,
      "maximumPropertyRequestBytes",
    );
    this.#artifact = validateArtifact(artifact);
    const totalRangeBytes = this.#artifact.ranges.reduce(
      (sum, range) => sum + range.bytes.byteLength,
      0,
    );
    const totalDetailRangeBytes =
      this.#artifact.detailRanges.reduce(
        (sum, range) => sum + range.bytes.byteLength,
        0,
      );
    const totalPropertyRangeBytes =
      this.#artifact.propertyDetails.ranges.reduce(
        (sum, range) => sum + range.bytes.byteLength,
        0,
      );
    const readBudget = sessionReadBudgetBytes ?? totalRangeBytes;
    const detailBudget =
      detailReadBudgetBytes ?? totalDetailRangeBytes;
    const propertyBudget =
      propertyReadBudgetBytes ?? totalPropertyRangeBytes;
    positiveInteger(readBudget, "sessionReadBudgetBytes");
    positiveInteger(
      detailBudget,
      "detailReadBudgetBytes",
    );
    positiveInteger(
      propertyBudget,
      "propertyReadBudgetBytes",
    );
    const sourceDigest = this.#artifact.source.sha256;
    this.sourceFingerprint = `sha256:${sourceDigest}`;
    this.revisionId = `source-snapshot:${this.sourceFingerprint}`;
    this.cacheFingerprint = `sha256:${sha256Hex(
      new TextEncoder().encode(
        canonicalJson(projection(this.#artifact)),
      ),
    )}`;
    this.semanticCacheFingerprint = `sha256:${sha256Hex(
      new TextEncoder().encode(
        canonicalJson({
          cacheFingerprint: this.cacheFingerprint,
          georeferencing: this.#artifact.georeferencing,
          propertyDetails: {
            mediaType:
              this.#artifact.propertyDetails.mediaType,
            slices: this.#artifact.propertyDetails.slices,
            ranges:
              this.#artifact.propertyDetails.ranges.map(
                (range) => ({
                  rangeId: range.rangeId,
                  mediaType: range.mediaType,
                  byteLength: range.bytes.byteLength,
                  sha256: range.sha256,
                }),
              ),
          },
        }),
      ),
    )}`;
    this.sourceId = `source:ifc:${sourceDigest.slice(0, 24)}`;
    this.sessionId = `session:bim-source:${sourceDigest.slice(0, 24)}`;
    this.snapshotId = `snapshot:bim-source:${sourceDigest}:0`;
    this.layerId = "layer:bim-source:base-3d";
    this.supportedProtocolVersions = Object.freeze([
      BIM_SOURCE_PROTOCOL_VERSION,
    ]);

    this.#rangeById = new Map(
      this.#artifact.ranges.map((range) => [range.rangeId, range]),
    );
    this.#detailRangeById = new Map(
      this.#artifact.detailRanges.map(
        (range) => [range.rangeId, range],
      ),
    );
    this.#propertyRangeById = new Map(
      this.#artifact.propertyDetails.ranges.map(
        (range) => [range.rangeId, range],
      ),
    );
    this.#propertySliceByExpressId = new Map(
      this.#artifact.propertyDetails.slices.map(
        (slice) => [slice.expressId, slice],
      ),
    );
    const idPrefix = sourceDigest.slice(0, 16);
    const entities = this.#artifact.entities.map((entity) =>
      deepFreeze({
        ...structuredClone(entity),
        renderId: entity.renderable
          ? `render:ifc:${idPrefix}:${entity.expressId}`
          : null,
        pickId: entity.renderable
          ? `pick:ifc:${idPrefix}:${entity.expressId}`
          : null,
        externalIdentityToken:
          `ifc-globalid:${this.sourceFingerprint}:${entity.globalId}`,
      }));
    const entityByExpressId = new Map(
      entities.map((entity) => [entity.expressId, entity]),
    );
    const tree = {
      roots: [...this.#artifact.tree.roots],
      nodes: this.#artifact.tree.nodes.map((node) => {
        const entity = entityByExpressId.get(node.expressId);
        return {
          ...structuredClone(node),
          renderId: entity?.renderId ?? null,
          pickId: entity?.pickId ?? null,
          externalIdentityToken:
            `ifc-globalid:${this.sourceFingerprint}:${node.globalId}`,
        };
      }),
    };
    this.#entityByExpressId = new Map(
      entities.map((entity) => [entity.expressId, entity]),
    );
    this.#entityByGlobalId = new Map(
      entities.map((entity) => [entity.globalId, entity]),
    );
    this.#entityByRenderId = new Map(
      entities
        .filter((entity) => entity.renderId !== null)
        .map((entity) => [entity.renderId, entity]),
    );
    this.#entityByPickId = new Map(
      entities
        .filter((entity) => entity.pickId !== null)
        .map((entity) => [entity.pickId, entity]),
    );
    const baseContext = contextFields(this);
    this.#semanticIndex = new BimSemanticIndex({
      context: baseContext,
      coverage: this.#artifact.coverage,
      entities,
      tree,
    });
    const rangeHandles = this.#artifact.ranges.map((range) =>
      deepFreeze({
        ...baseContext,
        handleId: range.rangeId,
        mediaType: range.mediaType,
        byteLength: range.bytes.byteLength,
        maximumRequestBytes: Math.min(
          maximumRequestBytes,
          range.bytes.byteLength,
        ),
        sha256: range.sha256,
        expiresAt: null,
        disposeWithSession: true,
      }));
    const detailRangeHandles =
      this.#artifact.detailRanges.map((range) =>
        deepFreeze({
          ...baseContext,
          handleId: range.rangeId,
          mediaType: range.mediaType,
          byteLength: range.bytes.byteLength,
          maximumRequestBytes: Math.min(
            maximumDetailRequestBytes,
            range.bytes.byteLength,
          ),
          sha256: range.sha256,
          expiresAt: null,
          disposeWithSession: true,
        }));
    const propertyRangeHandles =
      this.#artifact.propertyDetails.ranges.map((range) =>
        deepFreeze({
          ...baseContext,
          handleId: range.rangeId,
          mediaType: range.mediaType,
          byteLength: range.bytes.byteLength,
          maximumRequestBytes: Math.min(
            maximumPropertyRequestBytes,
            range.bytes.byteLength,
          ),
          sha256: range.sha256,
          expiresAt: null,
          disposeWithSession: true,
        }));
    const descriptor = {
      documentId: this.#artifact.source.documentId,
      fingerprint: this.sourceFingerprint,
      byteLength: this.#artifact.source.byteLength,
      ifcSchema: this.#artifact.source.ifcSchema,
      profile: this.#artifact.source.profile,
      adapter: this.#artifact.adapter,
    };
    this.#snapshot = deepFreeze({
      ...baseContext,
      sequence: 0,
      cacheFingerprint: this.cacheFingerprint,
      semanticCacheFingerprint:
        this.semanticCacheFingerprint,
      source: descriptor,
      coordinateSystem: this.#artifact.coordinateSystem,
      georeferencing: this.#artifact.georeferencing,
      coverage: this.#artifact.coverage,
      tree,
      geometry: this.#artifact.geometry,
      resources: this.#artifact.resources,
      entities,
      layers: [
        {
          layerId: this.layerId,
          sourceId: this.sourceId,
          revisionId: this.revisionId,
          kind: "base",
          representation: "3d",
          order: 0,
          visible: true,
          rangeHandles,
        },
      ],
      details: {
        mediaType: SEMANTIC_DETAIL_MEDIA_TYPE,
        rangeHandles: detailRangeHandles,
      },
      propertyDetails: {
        schema: BIM_PROPERTY_SET_VALUES_SCHEMA,
        mediaType: PROPERTY_DETAIL_MEDIA_TYPE,
        rangeHandles: propertyRangeHandles,
        deferred: true,
      },
      geometryRepresentations: {
        sourcePrecision: {
          authority: "external-source-document",
          documentId: descriptor.documentId,
          fingerprint: descriptor.fingerprint,
          numericEncoding: "ifc-step-source-defined",
          geometryRangeExposed: false,
          mutable: false,
        },
        displayTessellation: {
          authority: "derived-render-cache",
          mediaType: GEOMETRY_MEDIA_TYPE,
          numericEncoding:
            "float32-position-normal-uint32-index",
          adapterId: descriptor.adapter.id,
          adapterVersion: descriptor.adapter.version,
          lossiness: "lossy",
          sourceMutationAuthority: false,
          rangeIds: rangeHandles.map(
            (handle) => handle.handleId,
          ),
        },
      },
      extensionCoverage: {
        propertySetValues: "deferred-bounded",
        georeferencing:
          this.#artifact.georeferencing.status,
        sourcePrecisionDisplaySeparation: "explicit",
      },
      loadPlan: {
        firstFrameRangeIds: rangeHandles
          .slice(0, 1)
          .map((handle) => handle.handleId),
        deferredRangeIds: rangeHandles
          .slice(1)
          .map((handle) => handle.handleId),
        deferredDetailRangeIds: detailRangeHandles
          .map((handle) => handle.handleId),
      },
    });
    this.maximumRequestBytes = maximumRequestBytes;
    this.maximumDetailRequestBytes =
      maximumDetailRequestBytes;
    this.maximumPropertyRequestBytes =
      maximumPropertyRequestBytes;
    this.sessionReadBudgetBytes = readBudget;
    this.detailReadBudgetBytes = detailBudget;
    this.propertyReadBudgetBytes = propertyBudget;
    this.totalRangeBytes = totalRangeBytes;
    this.totalDetailRangeBytes = totalDetailRangeBytes;
    this.totalPropertyRangeBytes = totalPropertyRangeBytes;
  }

  get state() {
    return Object.freeze({
      opened: this.#opened,
      sessionDisposed: this.#sessionDisposed,
      disposed: this.#disposed,
      rangeReads: this.#rangeReads,
      rangeBytesRead: this.#rangeBytesRead,
      remainingReadBytes: Math.max(
        0,
        this.sessionReadBudgetBytes - this.#rangeBytesRead,
      ),
      entityReads: this.#entityReads,
      pickResolutions: this.#pickResolutions,
      detailReads: this.#detailReads,
      detailBytesRead: this.#detailBytesRead,
      remainingDetailReadBytes: Math.max(
        0,
        this.detailReadBudgetBytes -
          this.#detailBytesRead,
      ),
      propertyReads: this.#propertyReads,
      propertyBytesRead: this.#propertyBytesRead,
      remainingPropertyReadBytes: Math.max(
        0,
        this.propertyReadBudgetBytes -
          this.#propertyBytesRead,
      ),
    });
  }

  #assertSourceOpen() {
    if (this.#disposed) {
      throw invalidState("BIM model source is disposed");
    }
  }

  #assertSessionOpen() {
    this.#assertSourceOpen();
    if (this.#sessionDisposed) {
      throw invalidState("BIM model source session is disposed");
    }
  }

  #assertContext(value, label) {
    for (const [field, expected] of Object.entries(contextFields(this))) {
      if (value?.[field] !== expected) {
        throw new RangeError(`${label} ${field} is outside the snapshot`);
      }
    }
  }

  async open({ protocolVersion, signal } = {}) {
    this.#assertSourceOpen();
    aborted(signal);
    if (this.#opened) {
      throw invalidState("BIM model source supports one session");
    }
    if (!this.supportedProtocolVersions.includes(protocolVersion)) {
      throw new RangeError(`unsupported BIM source protocol ${protocolVersion}`);
    }
    this.#opened = true;
    const descriptor = deepFreeze({
      protocolVersion,
      sessionId: this.sessionId,
      sourceId: this.sourceId,
      currentRevisionId: this.revisionId,
      lastSuccessfulRevisionId: this.revisionId,
      sourceFingerprint: this.sourceFingerprint,
      cacheFingerprint: this.cacheFingerprint,
      semanticCacheFingerprint:
        this.semanticCacheFingerprint,
      capabilities: [
        "immutable-snapshot",
        "tree-index",
        "semantic-index",
        "binary-range-read",
        "entity-resolve",
        "deferred-entity-details",
        "deferred-property-set-values",
        "georeferencing-metadata",
        "source-display-geometry-separation",
        "pick-resolve",
        "bounded-tree-query",
        "bounded-semantic-search",
        "bounded-relation-query",
      ],
      resourceBudgetBytes: this.sessionReadBudgetBytes,
      detailResourceBudgetBytes:
        this.detailReadBudgetBytes,
      propertyResourceBudgetBytes:
        this.propertyReadBudgetBytes,
    });
    return {
      descriptor,
      getSnapshot: async ({ signal: snapshotSignal } = {}) => {
        this.#assertSessionOpen();
        aborted(snapshotSignal);
        return this.#snapshot;
      },
      readRange: async (
        handle,
        offset,
        length,
        { signal: rangeSignal } = {},
      ) => {
        this.#assertSessionOpen();
        aborted(rangeSignal);
        this.#assertContext(handle, "range handle");
        const range = this.#rangeById.get(handle?.handleId);
        if (
          range === undefined ||
          handle.mediaType !== range.mediaType ||
          handle.byteLength !== range.bytes.byteLength ||
          handle.sha256 !== range.sha256 ||
          handle.maximumRequestBytes !== Math.min(
            this.maximumRequestBytes,
            range.bytes.byteLength,
          )
        ) {
          throw new RangeError("range handle is outside the snapshot");
        }
        if (
          !Number.isSafeInteger(offset) ||
          !Number.isSafeInteger(length) ||
          offset < 0 ||
          length <= 0 ||
          length > handle.maximumRequestBytes ||
          offset + length > range.bytes.byteLength
        ) {
          throw new RangeError("BIM geometry range request is invalid");
        }
        if (
          this.#rangeBytesRead + length >
            this.sessionReadBudgetBytes
        ) {
          throw new RangeError("BIM source session read budget is exhausted");
        }
        this.#rangeReads += 1;
        this.#rangeBytesRead += length;
        return range.bytes.slice(offset, offset + length);
      },
      getEntity: async (
        request,
        { signal: entitySignal } = {},
      ) => {
        this.#assertSessionOpen();
        aborted(entitySignal);
        this.#assertContext(request, "entity request");
        const lookups = [
          ["expressId", this.#entityByExpressId],
          ["globalId", this.#entityByGlobalId],
          ["renderId", this.#entityByRenderId],
          ["pickId", this.#entityByPickId],
        ].filter(([field]) => request?.[field] !== undefined);
        if (lookups.length !== 1) {
          throw new TypeError(
            "entity request must contain exactly one source-local identity",
          );
        }
        const [field, index] = lookups[0];
        const entity = index.get(request[field]);
        if (entity === undefined) {
          throw new RangeError("entity identity is outside the snapshot");
        }
        this.#entityReads += 1;
        return entity;
      },
      getEntityDetails: async (
        request,
        { signal: detailSignal } = {},
      ) => {
        this.#assertSessionOpen();
        aborted(detailSignal);
        this.#assertContext(request, "entity detail request");
        if (
          !Number.isSafeInteger(request?.expressId) ||
          request.expressId <= 0
        ) {
          throw new TypeError(
            "entity detail request must contain an Express ID",
          );
        }
        const entity = this.#entityByExpressId.get(
          request.expressId,
        );
        if (entity === undefined) {
          throw new RangeError(
            "entity detail identity is outside the snapshot",
          );
        }
        const cached = this.#detailByExpressId.get(
          entity.expressId,
        );
        if (cached !== undefined) {
          return cached;
        }
        const slice = entity.detailSlice;
        const range = this.#detailRangeById.get(
          slice.rangeId,
        );
        if (
          range === undefined ||
          slice.byteLength > this.maximumDetailRequestBytes ||
          this.#detailBytesRead + slice.byteLength >
            this.detailReadBudgetBytes
        ) {
          throw new RangeError(
            "entity detail range exceeds its read budget",
          );
        }
        let semantics;
        try {
          semantics = validateSemanticDetails(
            JSON.parse(
              new TextDecoder("utf-8", {
                fatal: true,
              }).decode(
                range.bytes.slice(
                  slice.offset,
                  slice.offset + slice.byteLength,
                ),
              ),
            ),
            "entity semantic details",
          );
        } catch {
          throw new Error(
            "entity semantic detail payload is malformed",
          );
        }
        this.#detailReads += 1;
        this.#detailBytesRead += slice.byteLength;
        const result = deepFreeze({
          schema: BIM_ENTITY_DETAILS_SCHEMA,
          ...contextFields(this),
          expressId: entity.expressId,
          globalId: entity.globalId,
          semantics,
          receipt: {
            handleId: range.rangeId,
            offset: slice.offset,
            byteLength: slice.byteLength,
          },
        });
        this.#detailByExpressId.set(entity.expressId, result);
        return result;
      },
      getPropertySetValues: async (
        request,
        { signal: propertySignal } = {},
      ) => {
        this.#assertSessionOpen();
        aborted(propertySignal);
        this.#assertContext(
          request,
          "property detail request",
        );
        if (
          !Number.isSafeInteger(request?.expressId) ||
          request.expressId <= 0
        ) {
          throw new TypeError(
            "property detail request must contain an Express ID",
          );
        }
        const entity = this.#entityByExpressId.get(
          request.expressId,
        );
        if (entity === undefined) {
          throw new RangeError(
            "property detail identity is outside the snapshot",
          );
        }
        const cached = this.#propertyByExpressId.get(
          entity.expressId,
        );
        if (cached !== undefined) {
          return cached;
        }
        const slice = this.#propertySliceByExpressId.get(
          entity.expressId,
        );
        const range = this.#propertyRangeById.get(
          slice?.rangeId,
        );
        if (
          slice === undefined ||
          range === undefined ||
          slice.byteLength >
            this.maximumPropertyRequestBytes ||
          this.#propertyBytesRead + slice.byteLength >
            this.propertyReadBudgetBytes
        ) {
          throw new RangeError(
            "property detail range exceeds its read budget",
          );
        }
        let propertyValues;
        try {
          propertyValues = validatePropertySetValues(
            JSON.parse(
              new TextDecoder("utf-8", {
                fatal: true,
              }).decode(
                range.bytes.slice(
                  slice.offset,
                  slice.offset + slice.byteLength,
                ),
              ),
            ),
            "entity property details",
          );
        } catch {
          throw new Error(
            "entity property detail payload is malformed",
          );
        }
        this.#propertyReads += 1;
        this.#propertyBytesRead += slice.byteLength;
        const result = deepFreeze({
          schema: BIM_PROPERTY_SET_VALUES_SCHEMA,
          ...contextFields(this),
          expressId: entity.expressId,
          globalId: entity.globalId,
          ...propertyValues,
          receipt: {
            handleId: range.rangeId,
            offset: slice.offset,
            byteLength: slice.byteLength,
          },
        });
        this.#propertyByExpressId.set(
          entity.expressId,
          result,
        );
        return result;
      },
      resolvePick: async (
        request,
        { signal: pickSignal } = {},
      ) => {
        this.#assertSessionOpen();
        aborted(pickSignal);
        this.#assertContext(request, "pick request");
        const entity = this.#entityByPickId.get(request?.pickId);
        if (
          entity === undefined ||
          entity.renderId !== request?.renderId
        ) {
          throw new RangeError("pick identity is outside the snapshot");
        }
        this.#pickResolutions += 1;
        return deepFreeze({
          ...contextFields(this),
          expressId: entity.expressId,
          globalId: entity.globalId,
          renderId: entity.renderId,
          pickId: entity.pickId,
          externalIdentityToken: entity.externalIdentityToken,
        });
      },
      queryTree: async (
        request,
        { signal: querySignal } = {},
      ) => {
        this.#assertSessionOpen();
        aborted(querySignal);
        this.#assertContext(request, "tree query");
        return this.#semanticIndex.queryTree(request);
      },
      searchEntities: async (
        request,
        { signal: querySignal } = {},
      ) => {
        this.#assertSessionOpen();
        aborted(querySignal);
        this.#assertContext(request, "semantic search");
        return this.#semanticIndex.search(request);
      },
      queryRelations: async (
        request,
        { signal: querySignal } = {},
      ) => {
        this.#assertSessionOpen();
        aborted(querySignal);
        this.#assertContext(request, "relation query");
        return this.#semanticIndex.queryRelations(request);
      },
      dispose: async () => {
        if (this.#sessionDisposed) {
          return false;
        }
        this.#sessionDisposed = true;
        return true;
      },
    };
  }

  async dispose() {
    if (this.#disposed) {
      return false;
    }
    this.#disposed = true;
    for (const range of this.#rangeById.values()) {
      range.bytes.fill(0);
    }
    for (const range of this.#detailRangeById.values()) {
      range.bytes.fill(0);
    }
    for (const range of this.#propertyRangeById.values()) {
      range.bytes.fill(0);
    }
    this.#rangeById.clear();
    this.#detailRangeById.clear();
    this.#propertyRangeById.clear();
    this.#propertySliceByExpressId.clear();
    this.#detailByExpressId.clear();
    this.#propertyByExpressId.clear();
    this.#entityByExpressId.clear();
    this.#entityByGlobalId.clear();
    this.#entityByRenderId.clear();
    this.#entityByPickId.clear();
    return true;
  }
}

export function createBimModelSource(artifact, options) {
  return new BimModelSource(artifact, options);
}

export {
  BIM_SOURCE_ARTIFACT_SCHEMA,
  BIM_SOURCE_SEMANTIC_QUERY_RESULT,
};
