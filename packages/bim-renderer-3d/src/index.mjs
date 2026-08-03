import {
  validateCamera3d,
} from "./camera.mjs";
import {
  createMeasurement3d,
} from "./measurement.mjs";

export const BIM_RENDERER_3D_CONTRACT =
  "bim-explorer-bim-renderer-3d/0.1";
export const BIM_RENDERER_3D_RECEIPT =
  "bim-explorer-bim-renderer-3d-receipt/0.1";
export const BIM_RENDERER_3D_VIEW_RECEIPT =
  "bim-explorer-bim-renderer-3d-view-receipt/0.1";
export const BIM_RENDERER_3D_PICK_RECEIPT =
  "bim-explorer-bim-renderer-3d-pick-receipt/0.1";
export const BIM_RENDERER_3D_MEASUREMENT_RECEIPT =
  "bim-explorer-bim-renderer-3d-measurement-receipt/0.1";
export const BIM_RENDERER_3D_RANGE_RECEIPT =
  "bim-explorer-bim-renderer-3d-range-receipt/0.1";
export const BIM_RENDERER_3D_DELTA_RECEIPT =
  "bim-explorer-bim-renderer-3d-delta-receipt/0.1";
export const BIM_GEOMETRY_MEDIA_TYPE =
  "application/vnd.bim-explorer.geometry-range.v1";

const SHA256 = /^[0-9a-f]{64}$/u;
const SOURCE_FINGERPRINT = /^sha256:[0-9a-f]{64}$/u;
const MAXIMUM_CLIPPING_PLANES = 6;
const DEFAULT_LIMITS = Object.freeze({
  maximumFirstFrameRanges: 1,
  maximumRangeBytes: 4 * 1024 * 1024,
  maximumSourceReadBytes: 4 * 1024 * 1024,
  maximumReadBytes: 1024 * 1024,
  maximumGeometryRecords: 100_000,
  maximumGeometryPayloadBytes: 8 * 1024 * 1024,
  maximumInstances: 100_000,
  maximumInstancedTriangles: 5_000_000,
  maximumDrawCalls: 100_000,
  maximumCpuStagingBytes: 16 * 1024 * 1024,
  maximumGpuCacheBytes: 16 * 1024 * 1024,
});

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
  return Object.freeze([...value]);
}

function worldBounds(value, label) {
  const bounds = plainRecord(value, label);
  const min = finiteVector(bounds.min, 3, `${label}.min`);
  const max = finiteVector(bounds.max, 3, `${label}.max`);
  if (min.some((value, axis) => value >= max[axis])) {
    throw new RangeError(`${label} must have positive extent`);
  }
  return Object.freeze({ min, max });
}

function clippingPlane(value, label) {
  const plane = plainRecord(value, label);
  const normal = finiteVector(
    plane.normal,
    3,
    `${label}.normal`,
  );
  if (
    typeof plane.constant !== "number" ||
    !Number.isFinite(plane.constant)
  ) {
    throw new TypeError(`${label}.constant must be finite`);
  }
  const magnitude = Math.hypot(...normal);
  if (!(magnitude > 0)) {
    throw new RangeError(`${label}.normal must have length`);
  }
  return Object.freeze({
    normal: Object.freeze(
      normal.map((component) => component / magnitude),
    ),
    constant: plane.constant / magnitude,
  });
}

function clippingState(
  clippingPlanesValue,
  sectionBoxValue,
) {
  if (
    !Array.isArray(clippingPlanesValue) ||
    clippingPlanesValue.length > MAXIMUM_CLIPPING_PLANES
  ) {
    throw new RangeError(
      "renderer clipping planes exceed the configured limit",
    );
  }
  const clippingPlanes = Object.freeze(
    clippingPlanesValue.map((plane, index) =>
      clippingPlane(plane, `renderer clipping plane ${index}`)),
  );
  let sectionBox = null;
  let activePlanes = [...clippingPlanes];
  if (sectionBoxValue !== null) {
    const value = plainRecord(
      sectionBoxValue,
      "renderer section box",
    );
    const min = finiteVector(
      value.min,
      3,
      "renderer section box.min",
    );
    const max = finiteVector(
      value.max,
      3,
      "renderer section box.max",
    );
    if (min.some((minimum, axis) =>
      minimum >= max[axis])) {
      throw new RangeError("renderer section box is invalid");
    }
    sectionBox = Object.freeze({ min, max });
    activePlanes = [
      ...activePlanes,
      { normal: [1, 0, 0], constant: -min[0] },
      { normal: [-1, 0, 0], constant: max[0] },
      { normal: [0, 1, 0], constant: -min[1] },
      { normal: [0, -1, 0], constant: max[1] },
      { normal: [0, 0, 1], constant: -min[2] },
      { normal: [0, 0, -1], constant: max[2] },
    ];
  }
  if (activePlanes.length > MAXIMUM_CLIPPING_PLANES) {
    throw new RangeError(
      "renderer clipping and section box exceed six planes",
    );
  }
  return Object.freeze({
    activePlanes: Object.freeze(
      activePlanes.map((plane, index) =>
        clippingPlane(
          plane,
          `renderer active clipping plane ${index}`,
        )),
    ),
    clippingPlanes,
    sectionBox,
  });
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

function bytesToHex(bytes) {
  return [...bytes]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function digest(bytes) {
  if (globalThis.crypto?.subtle === undefined) {
    throw new Error("SHA-256 Web Crypto is unavailable");
  }
  const result = await globalThis.crypto.subtle.digest(
    "SHA-256",
    bytes,
  );
  return bytesToHex(new Uint8Array(result));
}

function validatedLimits(overrides = {}) {
  const additions = plainRecord(overrides, "renderer limits");
  for (const key of Object.keys(additions)) {
    if (!(key in DEFAULT_LIMITS)) {
      throw new TypeError(`renderer limit ${key} is unsupported`);
    }
  }
  const limits = {
    ...DEFAULT_LIMITS,
    ...additions,
  };
  for (const [label, value] of Object.entries(limits)) {
    positiveInteger(value, `renderer limits.${label}`);
  }
  return Object.freeze(limits);
}

export function decodeBimGeometryRange(
  bytes,
  {
    maximumRecords = DEFAULT_LIMITS.maximumGeometryRecords,
    maximumPayloadBytes =
      DEFAULT_LIMITS.maximumGeometryPayloadBytes,
  } = {},
) {
  positiveInteger(maximumRecords, "maximumRecords");
  positiveInteger(maximumPayloadBytes, "maximumPayloadBytes");
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError("geometry range must be a Uint8Array");
  }
  const headerBytes = 16;
  const recordHeaderBytes = 20;
  if (bytes.byteLength < headerBytes) {
    throw new RangeError("geometry range header is truncated");
  }
  if (
    new TextDecoder().decode(bytes.slice(0, 8)) !== "BEXGEO01"
  ) {
    throw new Error("geometry range magic is invalid");
  }
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  );
  if (view.getUint32(8, true) !== 1) {
    throw new Error("geometry range version is unsupported");
  }
  const recordCount = view.getUint32(12, true);
  if (recordCount === 0 || recordCount > maximumRecords) {
    throw new RangeError(
      "geometry range record count exceeds the configured limit",
    );
  }
  const records = [];
  const geometryExpressIds = new Set();
  let offset = headerBytes;
  let payloadBytes = 0;
  let vertices = 0;
  let indices = 0;
  let triangles = 0;
  for (let index = 0; index < recordCount; index += 1) {
    const label = `geometry range record ${index}`;
    if (offset + recordHeaderBytes > bytes.byteLength) {
      throw new RangeError(`${label} header is truncated`);
    }
    const recordOffset = offset;
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
        indexCount * Uint32Array.BYTES_PER_ELEMENT ||
      geometryExpressIds.has(geometryExpressId)
    ) {
      throw new Error(`${label} header is malformed`);
    }
    offset += recordHeaderBytes;
    const vertexOffset = offset;
    const vertexEnd = vertexOffset + vertexByteLength;
    const indexOffset = vertexEnd;
    const indexEnd = indexOffset + indexByteLength;
    payloadBytes += vertexByteLength + indexByteLength;
    if (
      indexEnd > bytes.byteLength ||
      payloadBytes > maximumPayloadBytes
    ) {
      throw new RangeError(
        `${label} payload exceeds the configured limit`,
      );
    }
    for (
      let cursor = vertexOffset;
      cursor < vertexEnd;
      cursor += Float32Array.BYTES_PER_ELEMENT
    ) {
      if (!Number.isFinite(view.getFloat32(cursor, true))) {
        throw new Error(`${label} has a non-finite vertex`);
      }
    }
    const vertexCount = vertexFloatCount / 6;
    for (
      let cursor = indexOffset;
      cursor < indexEnd;
      cursor += Uint32Array.BYTES_PER_ELEMENT
    ) {
      if (view.getUint32(cursor, true) >= vertexCount) {
        throw new RangeError(`${label} has an out-of-range index`);
      }
    }
    const recordTriangles = indexCount / 3;
    records.push(Object.freeze({
      geometryExpressId,
      vertexCount,
      indexCount,
      triangles: recordTriangles,
      slice: Object.freeze({
        offset: recordOffset,
        byteLength: indexEnd - recordOffset,
      }),
      vertexPayload: Object.freeze({
        offset: vertexOffset,
        byteLength: vertexByteLength,
      }),
      indexPayload: Object.freeze({
        offset: indexOffset,
        byteLength: indexByteLength,
      }),
    }));
    geometryExpressIds.add(geometryExpressId);
    vertices += vertexCount;
    indices += indexCount;
    triangles += recordTriangles;
    offset = indexEnd;
  }
  if (offset !== bytes.byteLength) {
    throw new Error("geometry range has unindexed trailing bytes");
  }
  return Object.freeze({
    schema: "bim-explorer-decoded-geometry-range/1",
    byteLength: bytes.byteLength,
    recordCount,
    payloadBytes,
    vertices,
    indices,
    triangles,
    records: Object.freeze(records),
  });
}

function validateMountInput(session, snapshot, limits) {
  if (typeof session?.readRange !== "function") {
    throw new TypeError("renderer session must provide readRange");
  }
  const value = plainRecord(snapshot, "renderer snapshot");
  for (const field of [
    "protocolVersion",
    "sessionId",
    "sourceId",
    "revisionId",
    "snapshotId",
    "layerId",
  ]) {
    nonEmptyString(value[field], `renderer snapshot.${field}`);
  }
  if (!SOURCE_FINGERPRINT.test(value.source?.fingerprint ?? "")) {
    throw new TypeError(
      "renderer snapshot source fingerprint is invalid",
    );
  }
  const coordinateSystem = plainRecord(
    value.coordinateSystem,
    "renderer snapshot coordinateSystem",
  );
  nonEmptyString(
    coordinateSystem.storage,
    "renderer snapshot coordinateSystem.storage",
  );
  nonEmptyString(
    coordinateSystem.source,
    "renderer snapshot coordinateSystem.source",
  );
  const sourceFromStorage = finiteVector(
    coordinateSystem.sourceFromStorage,
    16,
    "renderer snapshot coordinateSystem.sourceFromStorage",
  );
  const geometry = plainRecord(
    value.geometry,
    "renderer snapshot geometry",
  );
  const geometryBounds = plainRecord(
    geometry.bounds,
    "renderer snapshot geometry.bounds",
  );
  const bounds = Object.freeze({
    min: finiteVector(
      geometryBounds.min,
      3,
      "renderer snapshot geometry.bounds.min",
    ),
    max: finiteVector(
      geometryBounds.max,
      3,
      "renderer snapshot geometry.bounds.max",
    ),
  });
  if (
    bounds.min.some((minimum, axis) =>
      minimum > bounds.max[axis]) ||
    bounds.min.every((minimum, axis) =>
      minimum === bounds.max[axis])
  ) {
    throw new RangeError("renderer snapshot bounds are invalid");
  }
  if (!Array.isArray(value.layers)) {
    throw new TypeError("renderer snapshot layers must be a list");
  }
  const layer = value.layers.find(
    (candidate) =>
      candidate.layerId === value.layerId &&
      candidate.representation === "3d",
  );
  if (layer === undefined || !Array.isArray(layer.rangeHandles)) {
    throw new TypeError("renderer snapshot has no 3D range layer");
  }
  if (
    layer.sourceId !== value.sourceId ||
    layer.revisionId !== value.revisionId
  ) {
    throw new RangeError("renderer 3D layer is outside the snapshot");
  }
  const handles = new Map();
  for (const handleValue of layer.rangeHandles) {
    const handle = plainRecord(handleValue, "renderer range handle");
    nonEmptyString(handle.handleId, "renderer range handle.handleId");
    positiveInteger(
      handle.byteLength,
      "renderer range handle.byteLength",
    );
    positiveInteger(
      handle.maximumRequestBytes,
      "renderer range handle.maximumRequestBytes",
    );
    if (
      handle.mediaType !== BIM_GEOMETRY_MEDIA_TYPE ||
      !SHA256.test(handle.sha256 ?? "") ||
      handle.maximumRequestBytes > handle.byteLength ||
      handles.has(handle.handleId) ||
      [
        "protocolVersion",
        "sessionId",
        "sourceId",
        "revisionId",
        "snapshotId",
        "layerId",
      ].some((field) => handle[field] !== value[field])
    ) {
      throw new Error("renderer range handle is invalid");
    }
    handles.set(handle.handleId, handle);
  }
  const firstRangeIds = value.loadPlan?.firstFrameRangeIds;
  const deferredRangeIds = value.loadPlan?.deferredRangeIds;
  if (
    !Array.isArray(firstRangeIds) ||
    firstRangeIds.length === 0 ||
    firstRangeIds.length > limits.maximumFirstFrameRanges ||
    new Set(firstRangeIds).size !== firstRangeIds.length
  ) {
    throw new RangeError(
      "renderer first-frame range plan exceeds its limit",
    );
  }
  if (
    !Array.isArray(deferredRangeIds) ||
    new Set(deferredRangeIds).size !== deferredRangeIds.length ||
    new Set([...firstRangeIds, ...deferredRangeIds]).size !==
      handles.size ||
    deferredRangeIds.some((rangeId) =>
      !handles.has(rangeId) || firstRangeIds.includes(rangeId))
  ) {
    throw new RangeError("renderer deferred range plan is invalid");
  }
  let totalReadBytes = 0;
  const firstHandles = firstRangeIds.map((rangeId) => {
    const handle = handles.get(rangeId);
    if (
      handle === undefined ||
      handle.byteLength > limits.maximumRangeBytes
    ) {
      throw new RangeError(
        "renderer first-frame range exceeds its byte limit",
      );
    }
    totalReadBytes += handle.byteLength;
    return handle;
  });
  if (totalReadBytes > limits.maximumSourceReadBytes) {
    throw new RangeError(
      "renderer first-frame source read exceeds its byte limit",
    );
  }
  if (!Array.isArray(value.entities) || value.entities.length === 0) {
    throw new TypeError("renderer snapshot entities must be non-empty");
  }
  return {
    snapshot: value,
    firstHandles,
    handles,
    totalReadBytes,
    presentation: Object.freeze({
      coordinateSystem: Object.freeze({
        storage: coordinateSystem.storage,
        source: coordinateSystem.source,
        sourceFromStorage,
      }),
      bounds,
    }),
  };
}

async function readRange(session, handle, limits, signal) {
  const bytes = new Uint8Array(handle.byteLength);
  try {
    let reads = 0;
    for (let offset = 0; offset < handle.byteLength;) {
      aborted(signal);
      const length = Math.min(
        handle.maximumRequestBytes,
        limits.maximumReadBytes,
        handle.byteLength - offset,
      );
      const chunk = await session.readRange(
        handle,
        offset,
        length,
        { signal },
      );
      if (
        !(chunk instanceof Uint8Array) ||
        chunk.byteLength !== length
      ) {
        throw new Error("renderer range read returned invalid bytes");
      }
      bytes.set(chunk, offset);
      reads += 1;
      offset += length;
    }
    const sha256 = await digest(bytes);
    if (sha256 !== handle.sha256) {
      throw new Error("renderer range digest does not match its handle");
    }
    return {
      handleId: handle.handleId,
      sha256,
      reads,
      bytes,
      decoded: decodeBimGeometryRange(bytes, {
        maximumRecords: limits.maximumGeometryRecords,
        maximumPayloadBytes: limits.maximumGeometryPayloadBytes,
      }),
    };
  } catch (error) {
    bytes.fill(0);
    throw error;
  }
}

function buildMountPlan(
  snapshot,
  rangeResults,
  limits,
  presentation,
) {
  const byGeometry = new Map();
  const ranges = rangeResults.map((result) => {
    for (const record of result.decoded.records) {
      const key = `${result.handleId}:${record.geometryExpressId}`;
      if (byGeometry.has(key)) {
        throw new Error("renderer geometry identity is duplicated");
      }
      byGeometry.set(key, record);
    }
    return Object.freeze({
      handleId: result.handleId,
      sha256: result.sha256,
      reads: result.reads,
      bytes: result.bytes,
      decoded: result.decoded,
    });
  });
  const selectedRangeIds = new Set(
    ranges.map((range) => range.handleId),
  );
  const referencedGeometry = new Set();
  const instances = [];
  let instancedTriangles = 0;
  for (const entity of snapshot.entities) {
    if (!Array.isArray(entity.primitives)) {
      throw new TypeError("renderer entity primitives must be a list");
    }
    for (const primitive of entity.primitives) {
      if (!selectedRangeIds.has(primitive.slice?.rangeId)) {
        continue;
      }
      if (
        entity.renderable !== true ||
        typeof entity.globalId !== "string" ||
        entity.globalId.length === 0 ||
        typeof entity.renderId !== "string" ||
        entity.renderId.length === 0 ||
        typeof entity.pickId !== "string" ||
        entity.pickId.length === 0 ||
        typeof entity.externalIdentityToken !== "string" ||
        entity.externalIdentityToken.length === 0
      ) {
        throw new Error(
          "renderer primitive has no renderable source identity",
        );
      }
      const key =
        `${primitive.slice.rangeId}:${primitive.geometryExpressId}`;
      const record = byGeometry.get(key);
      if (
        record === undefined ||
        record.slice.offset !== primitive.slice.offset ||
        record.slice.byteLength !== primitive.slice.byteLength ||
        record.vertexCount !== primitive.vertexCount ||
        record.indexCount !== primitive.indexCount ||
        record.triangles !== primitive.triangles
      ) {
        throw new Error(
          "renderer primitive does not match its geometry record",
        );
      }
      instances.push(Object.freeze({
        expressId: entity.expressId,
        globalId: entity.globalId,
        renderId: entity.renderId,
        pickId: entity.pickId,
        externalIdentityToken: entity.externalIdentityToken,
        geometryExpressId: primitive.geometryExpressId,
        rangeId: primitive.slice.rangeId,
        transform: finiteVector(
          primitive.transform,
          16,
          "renderer primitive transform",
        ),
        color: finiteVector(
          primitive.color,
          4,
          "renderer primitive color",
        ),
        triangles: primitive.triangles,
      }));
      referencedGeometry.add(key);
      instancedTriangles += primitive.triangles;
    }
  }
  if (
    instances.length === 0 ||
    instances.length > limits.maximumInstances ||
    instances.length > limits.maximumDrawCalls ||
    instancedTriangles > limits.maximumInstancedTriangles ||
    referencedGeometry.size !== byGeometry.size
  ) {
    throw new RangeError(
      "renderer first-frame instance plan exceeds its limit",
    );
  }
  const sourceReadBytes = ranges.reduce(
    (sum, range) => sum + range.bytes.byteLength,
    0,
  );
  const sourceReads = ranges.reduce(
    (sum, range) => sum + range.reads,
    0,
  );
  const geometryPayloadBytes = ranges.reduce(
    (sum, range) => sum + range.decoded.payloadBytes,
    0,
  );
  const geometryRecords = ranges.reduce(
    (sum, range) => sum + range.decoded.recordCount,
    0,
  );
  const vertices = ranges.reduce(
    (sum, range) => sum + range.decoded.vertices,
    0,
  );
  const indices = ranges.reduce(
    (sum, range) => sum + range.decoded.indices,
    0,
  );
  const uniqueTriangles = ranges.reduce(
    (sum, range) => sum + range.decoded.triangles,
    0,
  );
  const instanceBytes = instances.length * 20 *
    Float32Array.BYTES_PER_ELEMENT;
  const cpuStagingBytes = sourceReadBytes + instanceBytes;
  if (
    geometryRecords > limits.maximumGeometryRecords ||
    geometryPayloadBytes > limits.maximumGeometryPayloadBytes ||
    cpuStagingBytes > limits.maximumCpuStagingBytes
  ) {
    throw new RangeError(
      "renderer CPU staging exceeds its byte limit",
    );
  }
  return Object.freeze({
    schema: BIM_RENDERER_3D_CONTRACT,
    source: Object.freeze({
      fingerprint: snapshot.source.fingerprint,
      revisionId: snapshot.revisionId,
      snapshotId: snapshot.snapshotId,
      layerId: snapshot.layerId,
    }),
    presentation,
    ranges: Object.freeze(ranges),
    instances: Object.freeze(instances),
    metrics: Object.freeze({
      sourceReadBytes,
      sourceReads,
      geometryPayloadBytes,
      geometryRecords,
      vertices,
      indices,
      uniqueTriangles,
      instances: instances.length,
      instancedTriangles,
      drawCalls: instances.length,
      instanceBytes,
      cpuStagingBytes,
    }),
  });
}

function activeMetrics(rangePlans) {
  const fields = [
    "geometryPayloadBytes",
    "geometryRecords",
    "vertices",
    "indices",
    "uniqueTriangles",
    "instances",
    "instancedTriangles",
    "drawCalls",
    "instanceBytes",
  ];
  const metrics = Object.fromEntries(
    fields.map((field) => [
      field,
      rangePlans.reduce(
        (sum, plan) => sum + plan.metrics[field],
        0,
      ),
    ]),
  );
  return Object.freeze({
    ...metrics,
    uploadedBytes:
      metrics.geometryPayloadBytes + metrics.instanceBytes,
  });
}

function validateActiveMetrics(metrics, limits) {
  if (
    metrics.geometryRecords > limits.maximumGeometryRecords ||
    metrics.instances > limits.maximumInstances ||
    metrics.instancedTriangles >
      limits.maximumInstancedTriangles ||
    metrics.drawCalls > limits.maximumDrawCalls ||
    metrics.uploadedBytes > limits.maximumGpuCacheBytes
  ) {
    throw new RangeError(
      "renderer resident GPU cache exceeds its configured limit",
    );
  }
}

function validateBackend(value) {
  const backend = plainRecord(value, "renderer backend");
  for (const method of ["mount", "unmount", "dispose"]) {
    if (typeof backend[method] !== "function") {
      throw new TypeError(`renderer backend.${method} must be a function`);
    }
  }
  return backend;
}

function validateBackendMount(value, metrics) {
  const result = plainRecord(value, "renderer backend mount result");
  const receipt = plainRecord(
    result.receipt,
    "renderer backend mount receipt",
  );
  nonEmptyString(result.handleId, "renderer backend handleId");
  nonEmptyString(receipt.backendId, "renderer backend receipt.backendId");
  nonEmptyString(receipt.frameId, "renderer backend receipt.frameId");
  if (
    typeof receipt.rendered !== "boolean" ||
    receipt.geometryBytes !== metrics.geometryPayloadBytes ||
    receipt.instanceBytes !== metrics.instanceBytes ||
    receipt.uploadedBytes !==
      metrics.geometryPayloadBytes + metrics.instanceBytes ||
    receipt.drawCalls !== metrics.drawCalls
  ) {
    throw new Error("renderer backend mount receipt is invalid");
  }
  return {
    handleId: result.handleId,
    receipt: Object.freeze({ ...receipt }),
  };
}

function validateBackendRangeLoad(
  value,
  metrics,
  activeBytesBefore,
) {
  const receipt = plainRecord(
    value?.receipt,
    "renderer backend range-load receipt",
  );
  nonEmptyString(
    receipt.backendId,
    "renderer backend range-load receipt.backendId",
  );
  nonEmptyString(
    receipt.frameId,
    "renderer backend range-load receipt.frameId",
  );
  const addedBytes =
    metrics.geometryPayloadBytes + metrics.instanceBytes;
  if (
    typeof receipt.rendered !== "boolean" ||
    receipt.cacheHit !== false ||
    receipt.addedBytes !== addedBytes ||
    receipt.activeBytes !== activeBytesBefore + addedBytes ||
    receipt.addedInstances !== metrics.instances ||
    receipt.addedDrawCalls !== metrics.drawCalls
  ) {
    throw new Error(
      "renderer backend range-load receipt is invalid",
    );
  }
  return Object.freeze({ ...receipt });
}

function validateBackendRangeEviction(
  value,
  expectedBytes,
  activeBytesBefore,
) {
  const receipt = plainRecord(
    value?.receipt,
    "renderer backend range-eviction receipt",
  );
  nonEmptyString(
    receipt.backendId,
    "renderer backend range-eviction receipt.backendId",
  );
  nonEmptyString(
    receipt.frameId,
    "renderer backend range-eviction receipt.frameId",
  );
  if (
    typeof receipt.rendered !== "boolean" ||
    receipt.releasedBytes !== expectedBytes ||
    receipt.activeBytes !== activeBytesBefore - expectedBytes
  ) {
    throw new Error(
      "renderer backend range-eviction receipt is invalid",
    );
  }
  return Object.freeze({ ...receipt });
}

function validateBackendDeltaRedraw(value, affectedBounds) {
  const receipt = plainRecord(
    value?.receipt,
    "renderer backend delta-redraw receipt",
  );
  nonEmptyString(
    receipt.backendId,
    "renderer backend delta-redraw receipt.backendId",
  );
  nonEmptyString(
    receipt.frameId,
    "renderer backend delta-redraw receipt.frameId",
  );
  if (
    receipt.rendered !== true ||
    receipt.atomic !== true ||
    receipt.redrawScope !== "affected-world-bounds" ||
    !Number.isSafeInteger(receipt.redrawPixels) ||
    receipt.redrawPixels <= 0 ||
    !equalBounds(receipt.affectedWorldBounds, affectedBounds) ||
    typeof receipt.frameMs !== "number" ||
    !Number.isFinite(receipt.frameMs) ||
    receipt.frameMs < 0 ||
    receipt.glError !== 0
  ) {
    throw new Error(
      "renderer backend delta-redraw receipt is invalid",
    );
  }
  return Object.freeze({ ...receipt });
}

function equalBounds(left, right) {
  return (
    Array.isArray(left?.min) &&
    Array.isArray(left?.max) &&
    left.min.length === 3 &&
    left.max.length === 3 &&
    left.min.every((value, axis) =>
      value === right.min[axis]) &&
    left.max.every((value, axis) =>
      value === right.max[axis])
  );
}

function validateBackendView(
  value,
  {
    clippingPlanes,
    highlightedInstances,
    hiddenInstances,
    selectedInstances,
    visibleInstances,
  },
) {
  const receipt = plainRecord(
    value?.receipt,
    "renderer backend view receipt",
  );
  nonEmptyString(
    receipt.backendId,
    "renderer backend view receipt.backendId",
  );
  nonEmptyString(
    receipt.frameId,
    "renderer backend view receipt.frameId",
  );
  if (
    receipt.rendered !== true ||
    receipt.visibleInstances !== visibleInstances ||
    receipt.hiddenInstances !== hiddenInstances ||
    receipt.selectedInstances !== selectedInstances ||
    receipt.highlightedInstances !== highlightedInstances ||
    receipt.clippingPlanes !== clippingPlanes ||
    receipt.drawCalls !== visibleInstances ||
    !Number.isSafeInteger(receipt.nonBackgroundPixels) ||
    receipt.nonBackgroundPixels < 0 ||
    !Number.isSafeInteger(receipt.highlightPixels) ||
    receipt.highlightPixels < 0 ||
    typeof receipt.frameMs !== "number" ||
    !Number.isFinite(receipt.frameMs) ||
    receipt.frameMs < 0 ||
    receipt.glError !== 0
  ) {
    throw new Error("renderer backend view receipt is invalid");
  }
  return Object.freeze({ ...receipt });
}

function validateBackendPick(
  value,
  {
    coordinates,
    identities,
    visibleInstances,
  },
) {
  const receipt = plainRecord(
    value?.receipt,
    "renderer backend pick receipt",
  );
  nonEmptyString(
    receipt.backendId,
    "renderer backend pick receipt.backendId",
  );
  nonEmptyString(
    receipt.frameId,
    "renderer backend pick receipt.frameId",
  );
  if (
    typeof receipt.hit !== "boolean" ||
    receipt.x !== coordinates.x ||
    receipt.y !== coordinates.y ||
    receipt.drawCalls !== visibleInstances ||
    !Number.isSafeInteger(receipt.temporaryTargetBytes) ||
    receipt.temporaryTargetBytes <= 0 ||
    receipt.temporaryReleased !== true ||
    typeof receipt.frameMs !== "number" ||
    !Number.isFinite(receipt.frameMs) ||
    receipt.frameMs < 0 ||
    receipt.glError !== 0
  ) {
    throw new Error("renderer backend pick receipt is invalid");
  }
  if (receipt.hit === false) {
    if (
      receipt.identity !== null ||
      receipt.depth !== null ||
      receipt.worldPosition !== null
    ) {
      throw new Error("renderer backend miss has a surface");
    }
    return Object.freeze({ ...receipt });
  }
  const identity = plainRecord(
    receipt.identity,
    "renderer backend pick identity",
  );
  const match = identities.some((candidate) =>
    candidate.expressId === identity.expressId &&
    candidate.globalId === identity.globalId &&
    candidate.renderId === identity.renderId &&
    candidate.pickId === identity.pickId &&
    candidate.externalIdentityToken ===
      identity.externalIdentityToken);
  if (!match) {
    throw new RangeError(
      "renderer backend pick is outside the active revision",
    );
  }
  const worldPosition = finiteVector(
    receipt.worldPosition,
    3,
    "renderer backend pick worldPosition",
  );
  if (
    typeof receipt.depth !== "number" ||
    !Number.isFinite(receipt.depth) ||
    receipt.depth < 0 ||
    receipt.depth > 1
  ) {
    throw new RangeError(
      "renderer backend pick depth is invalid",
    );
  }
  return Object.freeze({
    ...receipt,
    identity: Object.freeze({ ...identity }),
    worldPosition,
  });
}

export class Headless3dBackend {
  #active = null;
  #disposed = false;
  #mounts = 0;
  #rangeUpdates = 0;
  #unmounts = 0;

  get state() {
    return Object.freeze({
      disposed: this.#disposed,
      mounts: this.#mounts,
      unmounts: this.#unmounts,
      rangeUpdates: this.#rangeUpdates,
      activeHandleId: this.#active?.handleId ?? null,
      activeBytes: this.#active?.uploadedBytes ?? 0,
      residentRanges: this.#active?.ranges.size ?? 0,
    });
  }

  async mount(plan, { signal } = {}) {
    aborted(signal);
    if (this.#disposed) {
      throw invalidState("headless 3D backend is disposed");
    }
    if (this.#active !== null) {
      throw invalidState("headless 3D backend already has a mount");
    }
    plainRecord(plan, "headless 3D mount plan");
    const metrics = plainRecord(
      plan.metrics,
      "headless 3D mount metrics",
    );
    this.#mounts += 1;
    const handleId = `headless-3d-mount:${this.#mounts}`;
    const uploadedBytes =
      metrics.geometryPayloadBytes + metrics.instanceBytes;
    this.#active = {
      handleId,
      ranges: new Map(
        plan.ranges.map((range) => [
          range.handleId,
          uploadedBytes,
        ]),
      ),
      uploadedBytes,
    };
    return {
      handleId,
      receipt: {
        backendId: "headless",
        frameId: `headless-3d-frame:${this.#mounts}`,
        rendered: false,
        geometryBytes: metrics.geometryPayloadBytes,
        instanceBytes: metrics.instanceBytes,
        uploadedBytes,
        drawCalls: metrics.drawCalls,
      },
    };
  }

  async appendRange(handleId, plan, { signal } = {}) {
    aborted(signal);
    if (this.#disposed) {
      throw invalidState("headless 3D backend is disposed");
    }
    if (
      this.#active === null ||
      this.#active.handleId !== handleId
    ) {
      throw new RangeError(
        "headless 3D mount handle is not active",
      );
    }
    plainRecord(plan, "headless 3D range plan");
    const metrics = plainRecord(
      plan.metrics,
      "headless 3D range metrics",
    );
    if (
      !Array.isArray(plan.ranges) ||
      plan.ranges.length !== 1 ||
      this.#active.ranges.has(plan.ranges[0].handleId)
    ) {
      throw new Error("headless 3D range plan is invalid");
    }
    const addedBytes =
      metrics.geometryPayloadBytes + metrics.instanceBytes;
    this.#active.ranges.set(
      plan.ranges[0].handleId,
      addedBytes,
    );
    this.#active.uploadedBytes += addedBytes;
    this.#rangeUpdates += 1;
    return {
      receipt: {
        backendId: "headless",
        frameId:
          `headless-3d-range:${this.#mounts}:` +
          `${this.#rangeUpdates}`,
        rendered: false,
        cacheHit: false,
        addedBytes,
        activeBytes: this.#active.uploadedBytes,
        addedInstances: metrics.instances,
        addedDrawCalls: metrics.drawCalls,
      },
    };
  }

  async evictRange(handleId, rangeId, { signal } = {}) {
    aborted(signal);
    if (this.#disposed) {
      throw invalidState("headless 3D backend is disposed");
    }
    if (
      this.#active === null ||
      this.#active.handleId !== handleId
    ) {
      throw new RangeError(
        "headless 3D mount handle is not active",
      );
    }
    const releasedBytes = this.#active.ranges.get(rangeId);
    if (
      releasedBytes === undefined ||
      this.#active.ranges.size <= 1
    ) {
      throw new RangeError(
        "headless 3D resident range cannot be evicted",
      );
    }
    this.#active.ranges.delete(rangeId);
    this.#active.uploadedBytes -= releasedBytes;
    this.#rangeUpdates += 1;
    return {
      receipt: {
        backendId: "headless",
        frameId:
          `headless-3d-range:${this.#mounts}:` +
          `${this.#rangeUpdates}`,
        rendered: false,
        releasedBytes,
        activeBytes: this.#active.uploadedBytes,
      },
    };
  }

  async unmount(handleId) {
    if (
      this.#active === null ||
      this.#active.handleId !== handleId
    ) {
      throw new RangeError("headless 3D mount handle is not active");
    }
    const releasedBytes = this.#active.uploadedBytes;
    this.#active = null;
    this.#unmounts += 1;
    return Object.freeze({
      released: true,
      releasedBytes,
    });
  }

  async dispose() {
    if (this.#disposed) {
      return false;
    }
    this.#active = null;
    this.#disposed = true;
    return true;
  }
}

export class Bounded3dRenderer {
  #active = null;
  #backend;
  #cacheHits = 0;
  #deltas = 0;
  #disposed = false;
  #mounting = false;
  #mounts = 0;
  #measurements = 0;
  #picks = 0;
  #rangeEvictions = 0;
  #rangeLoads = 0;
  #unmounts = 0;
  #updating = false;
  #viewUpdates = 0;

  constructor({
    backend = new Headless3dBackend(),
    limits = {},
  } = {}) {
    this.#backend = validateBackend(backend);
    this.limits = validatedLimits(limits);
  }

  get state() {
    return Object.freeze({
      disposed: this.#disposed,
      deltas: this.#deltas,
      mounting: this.#mounting,
      updating: this.#updating,
      mounted: this.#active !== null,
      mounts: this.#mounts,
      measurements: this.#measurements,
      picks: this.#picks,
      rangeCacheHits: this.#cacheHits,
      rangeEvictions: this.#rangeEvictions,
      rangeLoads: this.#rangeLoads,
      residentRangeIds: Object.freeze(
        [...(this.#active?.rangePlans.keys() ?? [])],
      ),
      unmounts: this.#unmounts,
      viewUpdates: this.#viewUpdates,
      activeRevisionId: this.#active?.revisionId ?? null,
      activeBackendBytes:
        this.#active?.activeBackendBytes ?? 0,
    });
  }

  async #releaseActive() {
    if (this.#active === null) {
      return false;
    }
    const active = this.#active;
    const result = plainRecord(
      await this.#backend.unmount(active.handleId),
      "renderer backend unmount receipt",
    );
    if (
      result.released !== true ||
      result.releasedBytes !==
        active.activeBackendBytes
    ) {
      throw new Error("renderer backend did not release its mount");
    }
    this.#active = null;
    this.#unmounts += 1;
    return Object.freeze({
      released: true,
      releasedBytes: result.releasedBytes,
      revisionId: active.revisionId,
    });
  }

  async mount({ session, snapshot, signal } = {}) {
    if (this.#disposed) {
      throw invalidState("bounded 3D renderer is disposed");
    }
    if (this.#mounting || this.#updating) {
      throw invalidState(
        "bounded 3D renderer operation is in progress",
      );
    }
    this.#mounting = true;
    const rangeResults = [];
    try {
      aborted(signal);
      if (this.#active !== null) {
        await this.#releaseActive();
      }
      const input = validateMountInput(
        session,
        snapshot,
        this.limits,
      );
      for (const handle of input.firstHandles) {
        rangeResults.push(
          await readRange(session, handle, this.limits, signal),
        );
      }
      aborted(signal);
      const plan = buildMountPlan(
        input.snapshot,
        rangeResults,
        this.limits,
        input.presentation,
      );
      validateActiveMetrics(
        activeMetrics([plan]),
        this.limits,
      );
      let backendResult;
      let backendMount;
      try {
        backendResult = await this.#backend.mount(plan, { signal });
        backendMount = validateBackendMount(
          backendResult,
          plan.metrics,
        );
      } catch (error) {
        if (typeof backendResult?.handleId === "string") {
          try {
            await this.#backend.unmount(backendResult.handleId);
          } catch (cleanupError) {
            throw new AggregateError(
              [error, cleanupError],
              "renderer backend mount and cleanup failed",
            );
          }
        }
        throw error;
      }
      const receipt = Object.freeze({
        schema: BIM_RENDERER_3D_RECEIPT,
        status: "mounted",
        source: plan.source,
        rangeIds: Object.freeze(
          plan.ranges.map((range) => range.handleId),
        ),
        deferredRangeIds: Object.freeze([
          ...(snapshot.loadPlan?.deferredRangeIds ?? []),
        ]),
        metrics: plan.metrics,
        identity: Object.freeze({
          renderPickBoundToRevision: plan.instances.every(
            (instance) =>
              typeof instance.renderId === "string" &&
              typeof instance.pickId === "string",
          ),
          nonRenderableInstances: 0,
        }),
        backend: backendMount.receipt,
        cpuRangeStagingReleased: true,
      });
      this.#active = {
        activeBackendBytes: backendMount.receipt.uploadedBytes,
        deltaSequence: 0,
        handleId: backendMount.handleId,
        handles: input.handles,
        initialRangeIds: new Set(
          plan.ranges.map((range) => range.handleId),
        ),
        rangePlans: new Map(
          plan.ranges.map((range) => [
            range.handleId,
            plan,
          ]),
        ),
        revisionId: snapshot.revisionId,
        receipt,
        session,
        snapshot: input.snapshot,
        presentation: input.presentation,
        instanceRenderIds: Object.freeze(
          plan.instances.map((instance) => instance.renderId),
        ),
        instancePickIds: Object.freeze(
          plan.instances.map((instance) => instance.pickId),
        ),
        identities: Object.freeze(
          plan.instances.map((instance) => Object.freeze({
            expressId: instance.expressId,
            globalId: instance.globalId,
            renderId: instance.renderId,
            pickId: instance.pickId,
            rangeId: instance.rangeId,
            externalIdentityToken:
              instance.externalIdentityToken,
          })),
        ),
        camera: backendMount.receipt.camera ?? null,
        clipping: clippingState([], null),
        hiddenRenderIds: Object.freeze([]),
        selectedPickIds: Object.freeze([]),
        viewRevision: 0,
      };
      this.#mounts += 1;
      return receipt;
    } finally {
      for (const result of rangeResults) {
        result.bytes.fill(0);
      }
      this.#mounting = false;
    }
  }

  async loadRange({ rangeId, signal } = {}) {
    if (this.#disposed) {
      throw invalidState("bounded 3D renderer is disposed");
    }
    if (this.#mounting || this.#updating) {
      throw invalidState(
        "bounded 3D renderer operation is in progress",
      );
    }
    if (this.#active === null) {
      throw invalidState("bounded 3D renderer is not mounted");
    }
    nonEmptyString(rangeId, "renderer rangeId");
    if (!this.#active.handles.has(rangeId)) {
      throw new RangeError(
        "renderer range is outside the active revision",
      );
    }
    if (this.#active.rangePlans.has(rangeId)) {
      this.#cacheHits += 1;
      return Object.freeze({
        schema: BIM_RENDERER_3D_RANGE_RECEIPT,
        status: "resident",
        operation: "load",
        cacheHit: true,
        source: this.#active.receipt.source,
        rangeId,
        residentRangeIds: Object.freeze([
          ...this.#active.rangePlans.keys(),
        ]),
        deferredRangeIds: Object.freeze(
          this.#active.snapshot.loadPlan.deferredRangeIds
            .filter((id) =>
              !this.#active.rangePlans.has(id)),
        ),
        metrics: null,
        backend: null,
        activeBackendBytes: this.#active.activeBackendBytes,
      });
    }
    if (typeof this.#backend.appendRange !== "function") {
      throw new DOMException(
        "renderer backend does not support progressive ranges",
        "NotSupportedError",
      );
    }
    const handle = this.#active.handles.get(rangeId);
    if (
      handle.byteLength > this.limits.maximumRangeBytes ||
      handle.byteLength > this.limits.maximumSourceReadBytes
    ) {
      throw new RangeError(
        "renderer deferred range exceeds its byte limit",
      );
    }
    this.#updating = true;
    let rangeResult = null;
    try {
      rangeResult = await readRange(
        this.#active.session,
        handle,
        this.limits,
        signal,
      );
      aborted(signal);
      const plan = buildMountPlan(
        this.#active.snapshot,
        [rangeResult],
        this.limits,
        this.#active.presentation,
      );
      const residentPlans = [
        ...new Set(this.#active.rangePlans.values()),
        plan,
      ];
      validateActiveMetrics(
        activeMetrics(residentPlans),
        this.limits,
      );
      let backendResult;
      let backend;
      try {
        backendResult = await this.#backend.appendRange(
          this.#active.handleId,
          plan,
          { signal },
        );
        backend = validateBackendRangeLoad(
          backendResult,
          plan.metrics,
          this.#active.activeBackendBytes,
        );
      } catch (error) {
        if (
          typeof backendResult?.receipt?.activeBytes === "number" &&
          typeof this.#backend.evictRange === "function"
        ) {
          try {
            await this.#backend.evictRange(
              this.#active.handleId,
              rangeId,
            );
          } catch (cleanupError) {
            throw new AggregateError(
              [error, cleanupError],
              "renderer range load and cleanup failed",
            );
          }
        }
        throw error;
      }
      this.#active.rangePlans.set(rangeId, plan);
      this.#active.instanceRenderIds = Object.freeze([
        ...this.#active.instanceRenderIds,
        ...plan.instances.map((instance) => instance.renderId),
      ]);
      this.#active.instancePickIds = Object.freeze([
        ...this.#active.instancePickIds,
        ...plan.instances.map((instance) => instance.pickId),
      ]);
      this.#active.identities = Object.freeze([
        ...this.#active.identities,
        ...plan.instances.map((instance) => Object.freeze({
          expressId: instance.expressId,
          globalId: instance.globalId,
          renderId: instance.renderId,
          pickId: instance.pickId,
          rangeId: instance.rangeId,
          externalIdentityToken:
            instance.externalIdentityToken,
        })),
      ]);
      this.#active.activeBackendBytes = backend.activeBytes;
      this.#rangeLoads += 1;
      return Object.freeze({
        schema: BIM_RENDERER_3D_RANGE_RECEIPT,
        status: "loaded",
        operation: "load",
        cacheHit: false,
        source: this.#active.receipt.source,
        rangeId,
        residentRangeIds: Object.freeze([
          ...this.#active.rangePlans.keys(),
        ]),
        deferredRangeIds: Object.freeze(
          this.#active.snapshot.loadPlan.deferredRangeIds
            .filter((id) =>
              !this.#active.rangePlans.has(id)),
        ),
        metrics: plan.metrics,
        backend,
        activeBackendBytes: backend.activeBytes,
        cpuRangeStagingReleased: true,
      });
    } finally {
      rangeResult?.bytes.fill(0);
      this.#updating = false;
    }
  }

  async evictRange({ rangeId, signal } = {}) {
    if (this.#disposed) {
      throw invalidState("bounded 3D renderer is disposed");
    }
    if (this.#mounting || this.#updating) {
      throw invalidState(
        "bounded 3D renderer operation is in progress",
      );
    }
    if (this.#active === null) {
      throw invalidState("bounded 3D renderer is not mounted");
    }
    nonEmptyString(rangeId, "renderer rangeId");
    if (this.#active.initialRangeIds.has(rangeId)) {
      throw new RangeError(
        "renderer initial range must remain resident",
      );
    }
    const plan = this.#active.rangePlans.get(rangeId);
    if (plan === undefined) {
      throw new RangeError("renderer range is not resident");
    }
    if (typeof this.#backend.evictRange !== "function") {
      throw new DOMException(
        "renderer backend does not support range eviction",
        "NotSupportedError",
      );
    }
    const expectedBytes =
      plan.metrics.geometryPayloadBytes +
      plan.metrics.instanceBytes;
    this.#updating = true;
    try {
      aborted(signal);
      const result = await this.#backend.evictRange(
        this.#active.handleId,
        rangeId,
        { signal },
      );
      const backend = validateBackendRangeEviction(
        result,
        expectedBytes,
        this.#active.activeBackendBytes,
      );
      this.#active.rangePlans.delete(rangeId);
      this.#active.identities = Object.freeze(
        this.#active.identities.filter(
          (identity) => identity.rangeId !== rangeId,
        ),
      );
      this.#active.instanceRenderIds = Object.freeze(
        this.#active.identities.map(
          (identity) => identity.renderId,
        ),
      );
      this.#active.instancePickIds = Object.freeze(
        this.#active.identities.map(
          (identity) => identity.pickId,
        ),
      );
      const knownRenderIds = new Set(
        this.#active.instanceRenderIds,
      );
      const knownPickIds = new Set(
        this.#active.instancePickIds,
      );
      this.#active.hiddenRenderIds = Object.freeze(
        this.#active.hiddenRenderIds.filter((id) =>
          knownRenderIds.has(id)),
      );
      this.#active.selectedPickIds = Object.freeze(
        this.#active.selectedPickIds.filter((id) =>
          knownPickIds.has(id)),
      );
      this.#active.activeBackendBytes = backend.activeBytes;
      this.#rangeEvictions += 1;
      return Object.freeze({
        schema: BIM_RENDERER_3D_RANGE_RECEIPT,
        status: "evicted",
        operation: "evict",
        cacheHit: false,
        source: this.#active.receipt.source,
        rangeId,
        residentRangeIds: Object.freeze([
          ...this.#active.rangePlans.keys(),
        ]),
        deferredRangeIds: Object.freeze(
          this.#active.snapshot.loadPlan.deferredRangeIds
            .filter((id) =>
              !this.#active.rangePlans.has(id)),
        ),
        metrics: plan.metrics,
        backend,
        activeBackendBytes: backend.activeBytes,
      });
    } finally {
      this.#updating = false;
    }
  }

  async applyRenderDelta({ delta: deltaValue, signal } = {}) {
    if (this.#disposed) {
      throw invalidState("bounded 3D renderer is disposed");
    }
    if (this.#mounting || this.#updating) {
      throw invalidState(
        "bounded 3D renderer operation is in progress",
      );
    }
    if (this.#active === null) {
      throw invalidState("bounded 3D renderer is not mounted");
    }
    const delta = plainRecord(
      deltaValue,
      "renderer delta",
    );
    for (const field of [
      "deltaId",
      "sourceId",
      "fromRevisionId",
      "toRevisionId",
    ]) {
      nonEmptyString(delta[field], `renderer delta.${field}`);
    }
    if (
      delta.sourceId !== this.#active.snapshot.sourceId ||
      delta.fromRevisionId !== this.#active.revisionId
    ) {
      throw new RangeError(
        "renderer delta is outside the active source revision",
      );
    }
    if (
      !Number.isSafeInteger(delta.sequence) ||
      delta.sequence !== this.#active.deltaSequence + 1
    ) {
      throw new RangeError(
        "renderer delta sequence is stale or out of order",
      );
    }
    const affectedWorldBounds = worldBounds(
      delta.affectedWorldBounds,
      "renderer delta.affectedWorldBounds",
    );
    if (
      !Array.isArray(delta.operations) ||
      delta.operations.length === 0 ||
      delta.operations.length > this.limits.maximumInstances
    ) {
      throw new RangeError(
        "renderer delta operations exceed their limit",
      );
    }
    const knownRenderIds = new Set(
      this.#active.instanceRenderIds,
    );
    const operations = delta.operations.map(
      (operationValue, index) => {
        const operation = plainRecord(
          operationValue,
          `renderer delta operation ${index}`,
        );
        nonEmptyString(
          operation.operationId,
          `renderer delta operation ${index}.operationId`,
        );
        if (
          !["invalidate", "upsert", "tombstone"]
            .includes(operation.kind) ||
          !["presentation", "geometry", "entity"]
            .includes(operation.aspect) ||
          operation.sourceId !== this.#active.snapshot.sourceId ||
          operation.layerId !== this.#active.snapshot.layerId ||
          !Array.isArray(operation.renderIds) ||
          new Set(operation.renderIds).size !==
            operation.renderIds.length ||
          operation.renderIds.some((renderId) =>
            typeof renderId !== "string" ||
            renderId.length === 0)
        ) {
          throw new Error(
            `renderer delta operation ${index} is invalid`,
          );
        }
        const bounds = worldBounds(
          operation.affectedWorldBounds,
          `renderer delta operation ${index}.affectedWorldBounds`,
        );
        if (
          bounds.min.some((value, axis) =>
            value < affectedWorldBounds.min[axis]) ||
          bounds.max.some((value, axis) =>
            value > affectedWorldBounds.max[axis])
        ) {
          throw new RangeError(
            "renderer delta operation exceeds affected bounds",
          );
        }
        if (
          operation.kind === "invalidate" &&
          operation.aspect === "presentation" &&
          operation.renderIds.some((renderId) =>
            !knownRenderIds.has(renderId))
        ) {
          throw new RangeError(
            "renderer presentation delta has an unknown Render ID",
          );
        }
        return Object.freeze({
          aspect: operation.aspect,
          bounds,
          kind: operation.kind,
        });
      },
    );
    const presentationOnly =
      delta.fromRevisionId === delta.toRevisionId &&
      delta.payload === null &&
      operations.every((operation) =>
        operation.kind === "invalidate" &&
        operation.aspect === "presentation");
    if (!presentationOnly) {
      return Object.freeze({
        schema: BIM_RENDERER_3D_DELTA_RECEIPT,
        status: "remount-required",
        atomic: true,
        applied: false,
        reason: "unsupported-source-mutation",
        source: this.#active.receipt.source,
        deltaId: delta.deltaId,
        sequence: delta.sequence,
        fromRevisionId: delta.fromRevisionId,
        toRevisionId: delta.toRevisionId,
        affectedWorldBounds,
        operationCount: operations.length,
        backend: null,
      });
    }
    if (
      typeof this.#backend.redrawAffectedBounds !== "function"
    ) {
      throw new DOMException(
        "renderer backend does not support delta redraw",
        "NotSupportedError",
      );
    }
    this.#updating = true;
    try {
      aborted(signal);
      const result =
        await this.#backend.redrawAffectedBounds(
          this.#active.handleId,
          affectedWorldBounds,
          { signal },
        );
      const backend = validateBackendDeltaRedraw(
        result,
        affectedWorldBounds,
      );
      this.#active.deltaSequence = delta.sequence;
      this.#active.viewRevision += 1;
      this.#deltas += 1;
      return Object.freeze({
        schema: BIM_RENDERER_3D_DELTA_RECEIPT,
        status: "applied",
        atomic: true,
        applied: true,
        reason: null,
        source: this.#active.receipt.source,
        deltaId: delta.deltaId,
        sequence: delta.sequence,
        fromRevisionId: delta.fromRevisionId,
        toRevisionId: delta.toRevisionId,
        affectedWorldBounds,
        operationCount: operations.length,
        viewRevision: this.#active.viewRevision,
        backend,
      });
    } finally {
      this.#updating = false;
    }
  }

  async renderView({
    camera: cameraValue,
    clippingPlanes = [],
    hiddenRenderIds = [],
    isolateRenderIds = null,
    selectedPickIds = [],
    sectionBox = null,
    signal,
  } = {}) {
    if (this.#disposed) {
      throw invalidState("bounded 3D renderer is disposed");
    }
    if (this.#mounting || this.#updating) {
      throw invalidState(
        "bounded 3D renderer operation is in progress",
      );
    }
    if (this.#active === null) {
      throw invalidState("bounded 3D renderer is not mounted");
    }
    if (typeof this.#backend.renderView !== "function") {
      throw new DOMException(
        "renderer backend does not support view updates",
        "NotSupportedError",
      );
    }
    const camera = validateCamera3d(cameraValue);
    const clipping = clippingState(
      clippingPlanes,
      sectionBox,
    );
    if (
      !Array.isArray(hiddenRenderIds) ||
      hiddenRenderIds.length >
        this.limits.maximumInstances ||
      new Set(hiddenRenderIds).size !== hiddenRenderIds.length ||
      hiddenRenderIds.some((renderId) =>
        typeof renderId !== "string" || renderId.length === 0)
    ) {
      throw new TypeError(
        "renderer hidden Render IDs must be a unique list",
      );
    }
    const known = new Set(this.#active.instanceRenderIds);
    if (hiddenRenderIds.some((renderId) => !known.has(renderId))) {
      throw new RangeError(
        "renderer hidden Render ID is outside the active revision",
      );
    }
    if (
      isolateRenderIds !== null &&
      (
        !Array.isArray(isolateRenderIds) ||
        isolateRenderIds.length === 0 ||
        isolateRenderIds.length >
          this.limits.maximumInstances ||
        new Set(isolateRenderIds).size !==
          isolateRenderIds.length ||
        isolateRenderIds.some((renderId) =>
          typeof renderId !== "string" ||
          renderId.length === 0)
      )
    ) {
      throw new TypeError(
        "renderer isolate Render IDs must be a non-empty unique list",
      );
    }
    if (
      isolateRenderIds !== null &&
      hiddenRenderIds.length > 0
    ) {
      throw new RangeError(
        "renderer isolate and hidden Render IDs are mutually exclusive",
      );
    }
    if (
      isolateRenderIds?.some((renderId) =>
        !known.has(renderId))
    ) {
      throw new RangeError(
        "renderer isolate Render ID is outside the active revision",
      );
    }
    if (
      !Array.isArray(selectedPickIds) ||
      selectedPickIds.length >
        this.limits.maximumInstances ||
      new Set(selectedPickIds).size !== selectedPickIds.length ||
      selectedPickIds.some((pickId) =>
        typeof pickId !== "string" || pickId.length === 0)
    ) {
      throw new TypeError(
        "renderer selected Pick IDs must be a unique list",
      );
    }
    const knownPickIds = new Set(this.#active.instancePickIds);
    if (selectedPickIds.some((pickId) =>
      !knownPickIds.has(pickId))) {
      throw new RangeError(
        "renderer selected Pick ID is outside the active revision",
      );
    }
    const isolated = isolateRenderIds === null
      ? null
      : new Set(isolateRenderIds);
    const effectiveHiddenRenderIds = isolated === null
      ? [...hiddenRenderIds]
      : [...new Set(this.#active.instanceRenderIds)]
          .filter((renderId) => !isolated.has(renderId));
    const hidden = new Set(effectiveHiddenRenderIds);
    const selected = new Set(selectedPickIds);
    const hiddenInstances =
      this.#active.instanceRenderIds.filter((renderId) =>
        hidden.has(renderId)).length;
    const selectedInstances =
      this.#active.instancePickIds.filter((pickId) =>
        selected.has(pickId)).length;
    const highlightedInstances =
      this.#active.identities.filter((identity) =>
        selected.has(identity.pickId) &&
        !hidden.has(identity.renderId)).length;
    const visibleInstances =
      this.#active.instanceRenderIds.length - hiddenInstances;
    if (visibleInstances <= 0) {
      throw new RangeError(
        "renderer view must keep at least one visible instance",
      );
    }
    this.#updating = true;
    try {
      aborted(signal);
      const result = await this.#backend.renderView(
        this.#active.handleId,
        {
          camera,
          clippingPlanes: clipping.activePlanes,
          hiddenRenderIds: Object.freeze([
            ...effectiveHiddenRenderIds,
          ]),
          selectedPickIds: Object.freeze([...selectedPickIds]),
        },
        { signal },
      );
      const backend = validateBackendView(result, {
        clippingPlanes: clipping.activePlanes.length,
        highlightedInstances,
        hiddenInstances,
        selectedInstances,
        visibleInstances,
      });
      this.#active.viewRevision += 1;
      this.#active.camera = camera;
      this.#active.clipping = clipping;
      this.#active.hiddenRenderIds =
        Object.freeze([...effectiveHiddenRenderIds]);
      this.#active.selectedPickIds =
        Object.freeze([...selectedPickIds]);
      this.#viewUpdates += 1;
      return Object.freeze({
        schema: BIM_RENDERER_3D_VIEW_RECEIPT,
        status: "rendered",
        source: this.#active.receipt.source,
        viewRevision: this.#active.viewRevision,
        camera,
        clipping: Object.freeze({
          planes: clipping.clippingPlanes,
          sectionBox: clipping.sectionBox,
          activePlanes: clipping.activePlanes.length,
        }),
        visibility: Object.freeze({
          mode: isolated === null
            ? effectiveHiddenRenderIds.length > 0
              ? "hide"
              : "show-all"
            : "isolate",
          hiddenRenderIds: Object.freeze([
            ...effectiveHiddenRenderIds,
          ]),
          isolatedRenderIds: Object.freeze(
            isolateRenderIds === null
              ? []
              : [...isolateRenderIds],
          ),
          hiddenInstances,
          visibleInstances,
        }),
        selection: Object.freeze({
          selectedPickIds: Object.freeze([...selectedPickIds]),
          selectedInstances,
          highlightedInstances,
        }),
        backend,
      });
    } finally {
      this.#updating = false;
    }
  }

  async pick({ x, y, signal } = {}) {
    if (this.#disposed) {
      throw invalidState("bounded 3D renderer is disposed");
    }
    if (this.#mounting || this.#updating) {
      throw invalidState(
        "bounded 3D renderer operation is in progress",
      );
    }
    if (this.#active === null) {
      throw invalidState("bounded 3D renderer is not mounted");
    }
    if (typeof this.#backend.pick !== "function") {
      throw new DOMException(
        "renderer backend does not support picking",
        "NotSupportedError",
      );
    }
    if (
      !Number.isSafeInteger(x) ||
      !Number.isSafeInteger(y) ||
      x < 0 ||
      y < 0
    ) {
      throw new TypeError(
        "renderer pick coordinates must be non-negative integers",
      );
    }
    const hidden = new Set(this.#active.hiddenRenderIds);
    const visibleInstances =
      this.#active.identities.filter((identity) =>
        !hidden.has(identity.renderId)).length;
    this.#updating = true;
    try {
      aborted(signal);
      const result = await this.#backend.pick(
        this.#active.handleId,
        {
          x,
          y,
        },
        { signal },
      );
      const backend = validateBackendPick(result, {
        coordinates: { x, y },
        identities: this.#active.identities,
        visibleInstances,
      });
      this.#picks += 1;
      return Object.freeze({
        schema: BIM_RENDERER_3D_PICK_RECEIPT,
        status: backend.hit ? "hit" : "miss",
        source: this.#active.receipt.source,
        viewRevision: this.#active.viewRevision,
        coordinates: Object.freeze({
          x,
          y,
          origin: "canvas-top-left",
        }),
        identity: backend.identity,
        worldPosition: backend.worldPosition,
        backend,
      });
    } finally {
      this.#updating = false;
    }
  }

  measure({
    picks,
    type,
  } = {}) {
    if (this.#disposed) {
      throw invalidState("bounded 3D renderer is disposed");
    }
    if (this.#mounting || this.#updating) {
      throw invalidState(
        "bounded 3D renderer operation is in progress",
      );
    }
    if (this.#active === null) {
      throw invalidState("bounded 3D renderer is not mounted");
    }
    if (!Array.isArray(picks)) {
      throw new TypeError(
        "renderer measurement picks must be a list",
      );
    }
    const expectedCount = type === "distance"
      ? [2]
      : type === "angle"
        ? [3]
        : type === "area"
          ? [3, 4, 5, 6, 7, 8]
          : [];
    if (!expectedCount.includes(picks.length)) {
      throw new RangeError(
        "renderer measurement pick count is invalid",
      );
    }
    const knownPickIds = new Set(this.#active.instancePickIds);
    const points = [];
    const pickIds = [];
    for (const [index, pickValue] of picks.entries()) {
      const pick = plainRecord(
        pickValue,
        `renderer measurement pick ${index}`,
      );
      if (
        pick.schema !== BIM_RENDERER_3D_PICK_RECEIPT ||
        pick.status !== "hit" ||
        pick.source?.fingerprint !==
          this.#active.receipt.source.fingerprint ||
        pick.source?.revisionId !== this.#active.revisionId ||
        typeof pick.identity?.pickId !== "string" ||
        !knownPickIds.has(pick.identity.pickId)
      ) {
        throw new RangeError(
          "renderer measurement pick is outside the active revision",
        );
      }
      points.push(
        finiteVector(
          pick.worldPosition,
          3,
          `renderer measurement pick ${index}.worldPosition`,
        ),
      );
      pickIds.push(pick.identity.pickId);
    }
    const measurement = createMeasurement3d({
      points,
      type,
    });
    this.#measurements += 1;
    return Object.freeze({
      schema: BIM_RENDERER_3D_MEASUREMENT_RECEIPT,
      status: "measured",
      source: this.#active.receipt.source,
      viewRevision: this.#active.viewRevision,
      pickIds: Object.freeze(pickIds),
      measurement,
    });
  }

  async unmount() {
    if (this.#mounting || this.#updating) {
      throw invalidState(
        "bounded 3D renderer operation is in progress",
      );
    }
    return this.#releaseActive();
  }

  async dispose() {
    if (this.#disposed) {
      return false;
    }
    if (this.#mounting || this.#updating) {
      throw invalidState(
        "bounded 3D renderer operation is in progress",
      );
    }
    await this.#releaseActive();
    const backendDisposed = await this.#backend.dispose();
    if (backendDisposed !== true) {
      throw new Error("renderer backend did not dispose");
    }
    this.#disposed = true;
    return true;
  }
}

export function createBounded3dRenderer(options) {
  return new Bounded3dRenderer(options);
}

export function createHeadless3dBackend() {
  return new Headless3dBackend();
}

export {
  WebGl2Backend,
  createWebGl2Backend,
} from "./webgl2-backend.mjs";

export {
  BIM_CAMERA_3D_SCHEMA,
  cameraViewProjectionMatrix,
  createFitCamera3d,
  orbitCamera3d,
  panCamera3d,
  unprojectCameraPoint3d,
  validateCamera3d,
  zoomCamera3d,
} from "./camera.mjs";

export {
  BIM_MEASUREMENT_3D_SCHEMA,
  createMeasurement3d,
  measureAngle3d,
  measureArea3d,
  measureDistance3d,
} from "./measurement.mjs";
