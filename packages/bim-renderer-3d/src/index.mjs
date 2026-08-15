import {
  validateCamera3d,
} from "./camera.mjs";
import {
  createMeasurement3d,
} from "./measurement.mjs";
import {
  BIM_TEXTURED_GEOMETRY_MEDIA_TYPE,
  BIM_TEXTURED_GEOMETRY_MEDIA_TYPE_V3,
  decodeBimTexturedGeometryRange,
} from "./textured-geometry.mjs";
import {
  BIM_RETAINED_OVERLAY_CHECKPOINT_RECEIPT,
  BIM_RETAINED_OVERLAY_DELTA_RECEIPT,
  BIM_RETAINED_OVERLAY_PACKET_MEDIA_TYPE,
  BIM_RETAINED_OVERLAY_PACKET_SCHEMA,
  decodeBimRetainedOverlayPacket,
  encodeBimRetainedOverlayPacket,
  sha256BimRetainedOverlayPacket,
} from "./retained-overlay.mjs";

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
  maximumTextureSourceBytes: 8 * 1024 * 1024,
  maximumTextureDecodedBytes: 16 * 1024 * 1024,
  maximumTextureCompressionRatio: 256,
  maximumTextures: 16,
  maximumInstances: 100_000,
  maximumInstancedTriangles: 5_000_000,
  maximumDrawCalls: 100_000,
  maximumCpuStagingBytes: 16 * 1024 * 1024,
  maximumGpuCacheBytes: 16 * 1024 * 1024,
  maximumRetainedOverlayPacketBytes: 8 * 1024 * 1024,
  maximumRetainedOverlayObjects: 32_768,
  maximumRetainedOverlayStagingBytes: 16 * 1024 * 1024,
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
      textureIndex: null,
      texcoordByteOffset: null,
      vertexStrideBytes:
        6 * Float32Array.BYTES_PER_ELEMENT,
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
    mediaType: BIM_GEOMETRY_MEDIA_TYPE,
    byteLength: bytes.byteLength,
    recordCount,
    payloadBytes,
    geometryPayloadBytes: payloadBytes,
    textureSourceBytes: 0,
    textureDecodedBytes: 0,
    textureGpuBytes: 0,
    textureCount: 0,
    vertices,
    indices,
    triangles,
    records: Object.freeze(records),
    textures: Object.freeze([]),
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
      ![
        BIM_GEOMETRY_MEDIA_TYPE,
        BIM_TEXTURED_GEOMETRY_MEDIA_TYPE,
        BIM_TEXTURED_GEOMETRY_MEDIA_TYPE_V3,
      ].includes(handle.mediaType) ||
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
      decoded: [
        BIM_TEXTURED_GEOMETRY_MEDIA_TYPE,
        BIM_TEXTURED_GEOMETRY_MEDIA_TYPE_V3,
      ].includes(handle.mediaType)
        ? decodeBimTexturedGeometryRange(bytes, {
            maximumRecords: limits.maximumGeometryRecords,
            maximumPayloadBytes:
              limits.maximumGeometryPayloadBytes,
            maximumTextureCompressionRatio:
              limits.maximumTextureCompressionRatio,
            maximumTextureDecodedBytes:
              limits.maximumTextureDecodedBytes,
            maximumTextureSourceBytes:
              limits.maximumTextureSourceBytes,
            maximumTextures: limits.maximumTextures,
          })
        : decodeBimGeometryRange(bytes, {
            maximumRecords: limits.maximumGeometryRecords,
            maximumPayloadBytes:
              limits.maximumGeometryPayloadBytes,
          }),
    };
  } catch (error) {
    bytes.fill(0);
    throw error;
  }
}

function selectVisibilityRange(snapshot, handles, camera) {
  const ranges = new Map(
    [...handles.keys()].map((rangeId, order) => [
      rangeId,
      {
        max: [-Infinity, -Infinity, -Infinity],
        members: [],
        min: [Infinity, Infinity, Infinity],
        order,
        primitives: 0,
      },
    ]),
  );
  for (const entity of snapshot.entities) {
    if (!Array.isArray(entity.primitives)) {
      throw new TypeError(
        "renderer entity primitives must be a list",
      );
    }
    const candidateIds = new Set(
      entity.primitives
        .map((primitive) => primitive.slice?.rangeId)
        .filter((rangeId) => ranges.has(rangeId)),
    );
    if (candidateIds.size === 0) {
      continue;
    }
    const boundsValue = plainRecord(
      entity.bounds,
      "renderer visibility entity.bounds",
    );
    const min = finiteVector(
      boundsValue.min,
      3,
      "renderer visibility entity.bounds.min",
    );
    const max = finiteVector(
      boundsValue.max,
      3,
      "renderer visibility entity.bounds.max",
    );
    if (
      min.some((value, axis) => value > max[axis]) ||
      min.every((value, axis) => value === max[axis])
    ) {
      throw new RangeError(
        "renderer visibility entity bounds are invalid",
      );
    }
    for (const rangeId of candidateIds) {
      const range = ranges.get(rangeId);
      for (let axis = 0; axis < 3; axis += 1) {
        range.min[axis] = Math.min(range.min[axis], min[axis]);
        range.max[axis] = Math.max(range.max[axis], max[axis]);
      }
      range.members.push(Object.freeze({
        center: Object.freeze(min.map(
          (value, axis) => (value + max[axis]) / 2,
        )),
        radius: Math.hypot(
          ...max.map(
            (value, axis) => (value - min[axis]) / 2,
          ),
        ),
      }));
      range.primitives += entity.primitives.filter(
        (primitive) => primitive.slice?.rangeId === rangeId,
      ).length;
    }
  }
  const ranking = [...ranges.entries()].map(
    ([rangeId, range]) => {
      if (
        range.primitives === 0 ||
        range.min.some((value) => !Number.isFinite(value)) ||
        range.max.some((value) => !Number.isFinite(value))
      ) {
        throw new Error(
          "renderer range has no visibility bounds",
        );
      }
      const center = range.min.map(
        (value, axis) => (value + range.max[axis]) / 2,
      );
      const memberDistances = range.members.map((member) => {
        const targetDistance = Math.hypot(
          ...member.center.map(
            (value, axis) => value - camera.target[axis],
          ),
        );
        return Object.freeze({
          targetDistance,
          targetGap: Math.max(
            0,
            targetDistance - member.radius,
          ),
        });
      }).sort((left, right) =>
        left.targetGap - right.targetGap ||
        left.targetDistance - right.targetDistance);
      return Object.freeze({
        rangeId,
        bounds: Object.freeze({
          min: Object.freeze([...range.min]),
          max: Object.freeze([...range.max]),
        }),
        center: Object.freeze(center),
        targetDistance: memberDistances[0].targetDistance,
        targetGap: memberDistances[0].targetGap,
        primitives: range.primitives,
        order: range.order,
      });
    },
  ).sort((left, right) =>
    left.targetGap - right.targetGap ||
    left.targetDistance - right.targetDistance ||
    left.order - right.order);
  return Object.freeze({
    rangeId: ranking[0].rangeId,
    ranking: Object.freeze(ranking),
  });
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
      const globalId =
        typeof entity.globalId === "string" &&
        entity.globalId.length > 0
          ? entity.globalId
          : null;
      const nativeId =
        typeof entity.nativeId === "string" &&
        entity.nativeId.length > 0
          ? entity.nativeId
          : globalId;
      if (
        entity.renderable !== true ||
        nativeId === null ||
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
      const primitiveTextureIndex =
        primitive.textureIndex === undefined
          ? null
          : primitive.textureIndex;
      if (
        record === undefined ||
        record.slice.offset !== primitive.slice.offset ||
        record.slice.byteLength !== primitive.slice.byteLength ||
        record.vertexCount !== primitive.vertexCount ||
        record.indexCount !== primitive.indexCount ||
        record.triangles !== primitive.triangles ||
        record.textureIndex !== primitiveTextureIndex
      ) {
        throw new Error(
          "renderer primitive does not match its geometry record",
        );
      }
      instances.push(Object.freeze({
        expressId: entity.expressId,
        globalId,
        nativeId,
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
        textureIndex: record.textureIndex,
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
  const textureSourceBytes = ranges.reduce(
    (sum, range) => sum + range.decoded.textureSourceBytes,
    0,
  );
  const textureDecodedBytes = ranges.reduce(
    (sum, range) => sum + range.decoded.textureDecodedBytes,
    0,
  );
  const textureGpuBytes = ranges.reduce(
    (sum, range) => sum + range.decoded.textureGpuBytes,
    0,
  );
  const textures = ranges.reduce(
    (sum, range) => sum + range.decoded.textureCount,
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
    textureSourceBytes > limits.maximumTextureSourceBytes ||
    textureDecodedBytes > limits.maximumTextureDecodedBytes ||
    textures > limits.maximumTextures ||
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
      ...(textures === 0
        ? {}
        : {
            textureSourceBytes,
            textureDecodedBytes,
            textureGpuBytes,
            textures,
          }),
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
    "textureSourceBytes",
    "textureDecodedBytes",
    "textureGpuBytes",
    "textures",
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
        (sum, plan) => sum + (plan.metrics[field] ?? 0),
        0,
      ),
    ]),
  );
  return Object.freeze({
    ...metrics,
    uploadedBytes:
      metrics.geometryPayloadBytes +
      metrics.instanceBytes +
      metrics.textureGpuBytes,
  });
}

function validateActiveMetrics(metrics, limits) {
  if (
    metrics.geometryRecords > limits.maximumGeometryRecords ||
    metrics.textures > limits.maximumTextures ||
    metrics.textureDecodedBytes >
      limits.maximumTextureDecodedBytes ||
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

function boundsContain(outer, inner) {
  return outer.min.every((value, axis) => value <= inner.min[axis]) &&
    outer.max.every((value, axis) => value >= inner.max[axis]);
}

function retainedIdentity(value, overlay) {
  return Object.freeze({
    expressId: value.expressId ?? null,
    globalId: value.globalId ?? null,
    nativeId: value.nativeId,
    renderId: value.renderId,
    pickId: value.pickId,
    rangeId: value.rangeId ?? null,
    externalIdentityToken: value.externalIdentityToken,
    retainedOverlay: Object.freeze({
      overlayId: overlay.overlayId,
      sourceId: overlay.sourceId,
      layerId: overlay.layerId,
      sourceRenderId: value.sourceRenderId,
      sourcePickId: value.sourcePickId,
      revisionId: overlay.revisionId,
    }),
  });
}

function retainedSourceRegistration(value, activeInstances, limits) {
  const input = plainRecord(
    value,
    "renderer retained overlay source",
  );
  for (const field of [
    "overlayId",
    "sourceId",
    "layerId",
    "revisionId",
  ]) {
    nonEmptyString(
      input[field],
      `renderer retained overlay source.${field}`,
    );
  }
  if (
    !Array.isArray(input.identities) ||
    input.identities.length > limits.maximumRetainedOverlayObjects
  ) {
    throw new RangeError(
      "renderer retained overlay source identities exceed their bound",
    );
  }
  const activeByRenderId = new Map();
  for (const identity of activeInstances) {
    const values = activeByRenderId.get(identity.renderId) ?? [];
    values.push(identity);
    activeByRenderId.set(identity.renderId, values);
  }
  const objects = new Map();
  const sourceToProjected = new Map();
  for (const [index, identityValue] of input.identities.entries()) {
    const identity = plainRecord(
      identityValue,
      `renderer retained overlay identity ${index}`,
    );
    for (const field of [
      "sourceRenderId",
      "sourcePickId",
      "renderId",
      "pickId",
      "nativeId",
      "externalIdentityToken",
    ]) {
      nonEmptyString(
        identity[field],
        `renderer retained overlay identity ${index}.${field}`,
      );
    }
    const activeMatches = activeByRenderId.get(identity.renderId);
    const active = activeMatches?.[0];
    if (
      active === undefined ||
      activeMatches.some((candidate) =>
        candidate.pickId !== identity.pickId ||
        candidate.nativeId !== identity.nativeId ||
        candidate.externalIdentityToken !==
          identity.externalIdentityToken) ||
      objects.has(identity.sourceRenderId) ||
      sourceToProjected.has(identity.sourceRenderId)
    ) {
      throw new RangeError(
        "renderer retained overlay identity is outside the active mount",
      );
    }
    if (
      identity.visible !== undefined &&
      typeof identity.visible !== "boolean"
    ) {
      throw new TypeError(
        `renderer retained overlay identity ${index}.visible must be boolean`,
      );
    }
    const identityColor = finiteVector(
      identity.color ?? active.color,
      4,
      `renderer retained overlay identity ${index}.color`,
    );
    if (identityColor.some((component) => component < 0 || component > 1)) {
      throw new RangeError(
        `renderer retained overlay identity ${index}.color is invalid`,
      );
    }
    const record = Object.freeze({
      ...active,
      sourceRenderId: identity.sourceRenderId,
      sourcePickId: identity.sourcePickId,
      instanceCount: activeMatches.length,
      transform: finiteVector(
        identity.transform ?? active.transform,
        16,
        `renderer retained overlay identity ${index}.transform`,
      ),
      color: identityColor,
      visible: identity.visible ?? true,
      bounds: identity.bounds === undefined
        ? null
        : worldBounds(
          identity.bounds,
          `renderer retained overlay identity ${index}.bounds`,
        ),
    });
    objects.set(identity.sourceRenderId, record);
    sourceToProjected.set(identity.sourceRenderId, Object.freeze({
      renderId: identity.renderId,
      pickId: identity.pickId,
    }));
  }
  return {
    overlayId: input.overlayId,
    sourceId: input.sourceId,
    layerId: input.layerId,
    revisionId: input.revisionId,
    sequence: 0,
    checkpoints: 0,
    objects,
    sourceToProjected,
  };
}

function refreshRetainedOverlayIdentities(active) {
  const claimedRenderIds = new Set();
  for (const overlay of active.retainedOverlays.values()) {
    for (const projected of overlay.sourceToProjected.values()) {
      claimedRenderIds.add(projected.renderId);
    }
  }
  const identities = active.baseIdentities.filter(
    (identity) => !claimedRenderIds.has(identity.renderId),
  );
  for (const overlay of active.retainedOverlays.values()) {
    for (const object of overlay.objects.values()) {
      for (
        let index = 0;
        index < (object.instanceCount ?? 1);
        index += 1
      ) {
        identities.push(retainedIdentity(object, overlay));
      }
    }
  }
  active.identities = Object.freeze(identities);
  active.instanceRenderIds = Object.freeze(
    identities.map((identity) => identity.renderId),
  );
  active.instancePickIds = Object.freeze(
    identities.map((identity) => identity.pickId),
  );
  const knownRenderIds = new Set(active.instanceRenderIds);
  const knownPickIds = new Set(active.instancePickIds);
  active.retainedInvisibleRenderIds = Object.freeze(
    [...active.retainedOverlays.values()].flatMap((overlay) =>
      [...overlay.objects.values()]
        .filter((object) => !object.visible)
        .map((object) => object.renderId)),
  );
  active.hiddenRenderIds = Object.freeze(
    [...new Set([
      ...active.requestedHiddenRenderIds.filter((id) =>
        knownRenderIds.has(id)),
      ...active.retainedInvisibleRenderIds,
    ])],
  );
  active.selectedPickIds = Object.freeze(
    active.selectedPickIds.filter((id) => knownPickIds.has(id)),
  );
}

async function retainedProjectedId(kind, overlayId, sourceIdentity) {
  const bytes = new TextEncoder().encode(
    `${kind}\u0000${overlayId}\u0000${sourceIdentity}`,
  );
  const value = await digest(bytes);
  bytes.fill(0);
  return `${kind}:retained-overlay:${value}`;
}

function retainedDeltaOperation(value, index, overlay, affectedBounds) {
  const operation = plainRecord(
    value,
    `renderer retained overlay operation ${index}`,
  );
  nonEmptyString(
    operation.operationId,
    `renderer retained overlay operation ${index}.operationId`,
  );
  if (
    !["upsert", "tombstone"].includes(operation.kind) ||
    !["entity", "geometry", "identity", "style", "transform"]
      .includes(operation.aspect) ||
    operation.sourceId !== overlay.sourceId ||
    operation.layerId !== overlay.layerId ||
    !Array.isArray(operation.renderIds) ||
    operation.renderIds.length === 0 ||
    new Set(operation.renderIds).size !== operation.renderIds.length ||
    operation.renderIds.some((renderId) =>
      typeof renderId !== "string" || renderId.length === 0)
  ) {
    throw new TypeError(
      `renderer retained overlay operation ${index} is invalid`,
    );
  }
  if (
    operation.kind === "tombstone" &&
    operation.aspect !== "entity"
  ) {
    throw new TypeError(
      "renderer retained overlay tombstone must target entity",
    );
  }
  const operationBounds = worldBounds(
    operation.affectedWorldBounds,
    `renderer retained overlay operation ${index}.affectedWorldBounds`,
  );
  if (!boundsContain(affectedBounds, operationBounds)) {
    throw new RangeError(
      "renderer retained overlay operation exceeds delta bounds",
    );
  }
  return Object.freeze({
    operationId: operation.operationId,
    kind: operation.kind,
    aspect: operation.aspect,
    sourceId: operation.sourceId,
    layerId: operation.layerId,
    renderIds: Object.freeze([...operation.renderIds]),
    affectedWorldBounds: operationBounds,
    externalIdentityToken:
      operation.externalIdentityToken ?? null,
  });
}

function retainedEntryKey(operationId, sourceRenderId) {
  return `${operationId}\u0000${sourceRenderId}`;
}

async function buildRetainedOverlayPlan({
  delta: deltaValue,
  overlay,
  payloadBytes: payloadValue,
  limits,
}) {
  const delta = plainRecord(
    deltaValue,
    "renderer retained overlay delta",
  );
  for (const field of [
    "deltaId",
    "sourceId",
    "fromRevisionId",
    "toRevisionId",
  ]) {
    nonEmptyString(
      delta[field],
      `renderer retained overlay delta.${field}`,
    );
  }
  if (
    delta.sourceId !== overlay.sourceId ||
    delta.fromRevisionId !== overlay.revisionId ||
    delta.toRevisionId === delta.fromRevisionId
  ) {
    throw new RangeError(
      "renderer retained overlay delta is outside the active revision",
    );
  }
  if (
    !Number.isSafeInteger(delta.sequence) ||
    delta.sequence !== overlay.sequence + 1
  ) {
    throw new RangeError(
      "renderer retained overlay delta sequence is stale or out of order",
    );
  }
  const affectedWorldBounds = worldBounds(
    delta.affectedWorldBounds,
    "renderer retained overlay delta.affectedWorldBounds",
  );
  if (
    !Array.isArray(delta.operations) ||
    delta.operations.length === 0 ||
    delta.operations.length > limits.maximumRetainedOverlayObjects
  ) {
    throw new RangeError(
      "renderer retained overlay operations exceed their bound",
    );
  }
  const operations = Object.freeze(
    delta.operations.map((operation, index) =>
      retainedDeltaOperation(
        operation,
        index,
        overlay,
        affectedWorldBounds,
      )),
  );
  const changed = new Set();
  for (const operation of operations) {
    for (const renderId of operation.renderIds) {
      if (changed.has(renderId)) {
        throw new RangeError(
          "renderer retained overlay Render ID changes more than once",
        );
      }
      changed.add(renderId);
    }
  }
  let packet = null;
  let payloadBytes = null;
  if (delta.payload === null) {
    if (operations.some((operation) => operation.kind !== "tombstone")) {
      throw new TypeError(
        "renderer retained overlay upsert requires a packet payload",
      );
    }
    if (payloadValue !== null && payloadValue !== undefined) {
      throw new TypeError(
        "renderer retained overlay tombstone cannot carry payload bytes",
      );
    }
  } else {
    const descriptor = plainRecord(
      delta.payload,
      "renderer retained overlay payload descriptor",
    );
    if (!(payloadValue instanceof Uint8Array)) {
      throw new TypeError(
        "renderer retained overlay payload must be a Uint8Array",
      );
    }
    payloadBytes = Uint8Array.from(payloadValue);
    if (
      descriptor.mediaType !== BIM_RETAINED_OVERLAY_PACKET_MEDIA_TYPE ||
      descriptor.byteLength !== payloadBytes.byteLength ||
      descriptor.byteLength > limits.maximumRetainedOverlayPacketBytes ||
      !SHA256.test(descriptor.sha256 ?? "") ||
      await sha256BimRetainedOverlayPacket(payloadBytes) !==
        descriptor.sha256
    ) {
      payloadBytes.fill(0);
      throw new Error(
        "renderer retained overlay payload identity is invalid",
      );
    }
    packet = decodeBimRetainedOverlayPacket(payloadBytes, {
      maximumBytes: limits.maximumRetainedOverlayPacketBytes,
      maximumEntries: limits.maximumRetainedOverlayObjects,
    });
    if (
      packet.deltaId !== delta.deltaId ||
      packet.sourceId !== delta.sourceId ||
      packet.layerId !== overlay.layerId ||
      packet.fromRevisionId !== delta.fromRevisionId ||
      packet.toRevisionId !== delta.toRevisionId ||
      packet.sequence !== delta.sequence
    ) {
      payloadBytes.fill(0);
      throw new RangeError(
        "renderer retained overlay packet is outside the delta",
      );
    }
  }
  const packetEntries = new Map();
  for (const entry of packet?.entries ?? []) {
    const key = retainedEntryKey(entry.operationId, entry.renderId);
    if (packetEntries.has(key)) {
      payloadBytes?.fill(0);
      throw new RangeError(
        "renderer retained overlay packet entry is duplicated",
      );
    }
    packetEntries.set(key, entry);
  }
  const entries = [];
  const nextObjects = new Map(overlay.objects);
  const nextSourceToProjected = new Map(
    overlay.sourceToProjected,
  );
  for (const operation of operations) {
    for (const sourceRenderId of operation.renderIds) {
      const key = retainedEntryKey(
        operation.operationId,
        sourceRenderId,
      );
      let entry = packetEntries.get(key) ?? null;
      if (operation.kind === "tombstone" && entry === null) {
        entry = Object.freeze({
          operationId: operation.operationId,
          kind: "tombstone",
          aspect: "entity",
          renderId: sourceRenderId,
          bounds: operation.affectedWorldBounds,
          pickId: null,
          nativeId: null,
          externalIdentityToken: null,
          transform: null,
          color: null,
          visible: null,
          geometry: null,
        });
      }
      if (
        entry === null ||
        entry.kind !== operation.kind ||
        entry.aspect !== operation.aspect ||
        !equalBounds(entry.bounds, operation.affectedWorldBounds) ||
        (
          operation.externalIdentityToken !== null &&
          entry.externalIdentityToken !==
            operation.externalIdentityToken
        )
      ) {
        payloadBytes?.fill(0);
        throw new RangeError(
          "renderer retained overlay packet does not match its operation",
        );
      }
      packetEntries.delete(key);
      const current = nextObjects.get(sourceRenderId) ?? null;
      let projected = nextSourceToProjected.get(sourceRenderId);
      if (projected === undefined) {
        projected = Object.freeze({
          renderId: await retainedProjectedId(
            "render",
            overlay.overlayId,
            sourceRenderId,
          ),
          pickId: entry.pickId === null
            ? null
            : await retainedProjectedId(
              "pick",
              overlay.overlayId,
              entry.pickId,
            ),
        });
        nextSourceToProjected.set(sourceRenderId, projected);
      }
      if (entry.kind === "tombstone") {
        if (current === null) {
          payloadBytes?.fill(0);
          throw new RangeError(
            "renderer retained overlay tombstone has no current object",
          );
        }
        nextObjects.delete(sourceRenderId);
        entries.push(Object.freeze({
          ...entry,
          sourceRenderId,
          renderId: projected.renderId,
          current,
          retainedOverlay: Object.freeze({
            overlayId: overlay.overlayId,
            sourceId: overlay.sourceId,
            layerId: overlay.layerId,
            revisionId: delta.toRevisionId,
          }),
        }));
        continue;
      }
      if (
        !["entity", "geometry"].includes(entry.aspect) &&
        current === null
      ) {
        payloadBytes?.fill(0);
        throw new RangeError(
          "renderer retained overlay update has no current object",
        );
      }
      if (
        (current?.instanceCount ?? 1) > 1 &&
        !["entity", "geometry"].includes(entry.aspect)
      ) {
        payloadBytes?.fill(0);
        throw new DOMException(
          "retained metadata update requires single-instance geometry",
          "NotSupportedError",
        );
      }
      const sourcePickId = entry.pickId ?? current?.sourcePickId;
      const projectedPickId = entry.pickId === null
        ? current?.pickId
        : await retainedProjectedId(
          "pick",
          overlay.overlayId,
          entry.pickId,
        );
      const logical = Object.freeze({
        sourceRenderId,
        sourcePickId,
        renderId: projected.renderId,
        pickId: projectedPickId,
        nativeId: entry.nativeId ?? current?.nativeId,
        externalIdentityToken:
          entry.externalIdentityToken ??
          current?.externalIdentityToken,
        expressId: current?.expressId ?? null,
        globalId: current?.globalId ?? null,
        rangeId: current?.rangeId ?? null,
        bounds: entry.bounds,
        transform: entry.transform ?? current?.transform ?? null,
        color: entry.color ?? current?.color ?? null,
        visible: entry.visible ?? current?.visible ?? true,
        instanceCount: entry.geometry === null
          ? current?.instanceCount ?? 1
          : 1,
      });
      const next = Object.freeze({
        ...logical,
        geometry: entry.geometry,
        aspect: entry.aspect,
        kind: entry.kind,
        operationId: entry.operationId,
        current,
        retainedOverlay: Object.freeze({
          overlayId: overlay.overlayId,
          sourceId: overlay.sourceId,
          layerId: overlay.layerId,
          revisionId: delta.toRevisionId,
        }),
      });
      for (const field of [
        "sourcePickId",
        "pickId",
        "nativeId",
        "externalIdentityToken",
      ]) {
        nonEmptyString(
          next[field],
          `renderer retained overlay entry.${field}`,
        );
      }
      if (next.transform === null || next.color === null) {
        payloadBytes?.fill(0);
        throw new TypeError(
          "renderer retained overlay entry has no transform or style",
        );
      }
      nextObjects.set(sourceRenderId, logical);
      nextSourceToProjected.set(sourceRenderId, Object.freeze({
        renderId: next.renderId,
        pickId: next.pickId,
      }));
      entries.push(next);
    }
  }
  if (packetEntries.size !== 0) {
    payloadBytes?.fill(0);
    throw new RangeError(
      "renderer retained overlay packet has unbound entries",
    );
  }
  if (nextObjects.size > limits.maximumRetainedOverlayObjects) {
    payloadBytes?.fill(0);
    throw new RangeError(
      "renderer retained overlay resident objects exceed their bound",
    );
  }
  const pickIds = [...nextObjects.values()].map((item) => item.pickId);
  if (new Set(pickIds).size !== pickIds.length) {
    payloadBytes?.fill(0);
    throw new RangeError(
      "renderer retained overlay Pick ID is duplicated",
    );
  }
  const geometryBytes = entries.reduce(
    (sum, entry) => sum + (entry.geometry?.byteLength ?? 0),
    0,
  );
  const instanceBytes = entries.filter((entry) =>
    entry.kind === "upsert" &&
    ["entity", "geometry", "style", "transform"]
      .includes(entry.aspect)).length * 20 * Float32Array.BYTES_PER_ELEMENT;
  const stagingBytes =
    (payloadBytes?.byteLength ?? 0) + geometryBytes + instanceBytes;
  if (stagingBytes > limits.maximumRetainedOverlayStagingBytes) {
    payloadBytes?.fill(0);
    throw new RangeError(
      "renderer retained overlay staging exceeds its byte limit",
    );
  }
  return {
    schema: BIM_RETAINED_OVERLAY_PACKET_SCHEMA,
    deltaId: delta.deltaId,
    overlayId: overlay.overlayId,
    sourceId: overlay.sourceId,
    layerId: overlay.layerId,
    fromRevisionId: delta.fromRevisionId,
    toRevisionId: delta.toRevisionId,
    sequence: delta.sequence,
    affectedWorldBounds,
    entries: Object.freeze(entries),
    nextObjects,
    nextSourceToProjected,
    metrics: Object.freeze({
      packetBytes: payloadBytes?.byteLength ?? 0,
      geometryBytes,
      instanceBytes,
      stagingBytes,
      operations: operations.length,
      changedObjects: entries.length,
      residentObjects: nextObjects.size,
    }),
    releaseCpuStaging() {
      payloadBytes?.fill(0);
      for (const entry of entries) {
        entry.geometry?.vertices.fill(0);
        entry.geometry?.indices.fill(0);
      }
    },
  };
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
    (receipt.textureBytes ?? 0) !==
      (metrics.textureGpuBytes ?? 0) ||
    receipt.uploadedBytes !==
      metrics.geometryPayloadBytes +
        metrics.instanceBytes +
        (metrics.textureGpuBytes ?? 0) ||
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
    metrics.geometryPayloadBytes +
    metrics.instanceBytes +
    (metrics.textureGpuBytes ?? 0);
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
    candidate.nativeId === identity.nativeId &&
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
  #retainedCommits = 0;
  #retainedRollbacks = 0;
  #retainedStages = 0;
  #unmounts = 0;

  get state() {
    return Object.freeze({
      disposed: this.#disposed,
      mounts: this.#mounts,
      unmounts: this.#unmounts,
      rangeUpdates: this.#rangeUpdates,
      retainedCommits: this.#retainedCommits,
      retainedRollbacks: this.#retainedRollbacks,
      retainedStages: this.#retainedStages,
      activeHandleId: this.#active?.handleId ?? null,
      activeBytes: this.#active?.uploadedBytes ?? 0,
      residentRanges: this.#active?.ranges.size ?? 0,
      retainedObjects:
        this.#active?.retainedObjects.size ?? 0,
      stagedRetainedDelta:
        this.#active?.staged !== null &&
        this.#active?.staged !== undefined,
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
      metrics.geometryPayloadBytes +
      metrics.instanceBytes +
      (metrics.textureGpuBytes ?? 0);
    this.#active = {
      baseInstances: Object.freeze([...plan.instances]),
      baseUploadedBytes: uploadedBytes,
      handleId,
      ranges: new Map(
        plan.ranges.map((range) => [
          range.handleId,
          uploadedBytes,
        ]),
      ),
      retainedObjects: new Map(),
      staged: null,
      suppressedBaseRenderIds: new Set(),
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
        ...(metrics.textureGpuBytes === undefined
          ? {}
          : { textureBytes: metrics.textureGpuBytes }),
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
      metrics.geometryPayloadBytes +
      metrics.instanceBytes +
      (metrics.textureGpuBytes ?? 0);
    this.#active.ranges.set(
      plan.ranges[0].handleId,
      addedBytes,
    );
    this.#active.uploadedBytes += addedBytes;
    this.#active.baseUploadedBytes += addedBytes;
    this.#active.baseInstances = Object.freeze([
      ...this.#active.baseInstances,
      ...plan.instances,
    ]);
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
    this.#active.baseUploadedBytes -= releasedBytes;
    this.#active.baseInstances = Object.freeze(
      this.#active.baseInstances.filter(
        (instance) => instance.rangeId !== rangeId,
      ),
    );
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

  async stageRetainedOverlayDelta(
    handleId,
    planValue,
    { signal } = {},
  ) {
    aborted(signal);
    if (this.#disposed) {
      throw invalidState("headless 3D backend is disposed");
    }
    if (
      this.#active === null ||
      this.#active.handleId !== handleId
    ) {
      throw new RangeError("headless 3D mount handle is not active");
    }
    if (this.#active.staged !== null) {
      throw invalidState(
        "headless 3D backend already owns a retained transaction",
      );
    }
    const plan = plainRecord(
      planValue,
      "headless retained overlay plan",
    );
    const retainedObjects = new Map(this.#active.retainedObjects);
    const suppressed = new Set(
      this.#active.suppressedBaseRenderIds,
    );
    for (const entry of plan.entries) {
      suppressed.add(entry.renderId);
      if (entry.kind === "tombstone") {
        retainedObjects.delete(entry.renderId);
        continue;
      }
      const current = retainedObjects.get(entry.renderId);
      const ownedBytes = entry.geometry !== null
        ? entry.geometry.byteLength + 80
        : ["style", "transform"].includes(entry.aspect)
          ? (current?.geometryBytes ?? 0) + 80
          : current?.ownedBytes ?? 0;
      retainedObjects.set(entry.renderId, Object.freeze({
        renderId: entry.renderId,
        pickId: entry.pickId,
        visible: entry.visible,
        geometryBytes:
          entry.geometry?.byteLength ?? current?.geometryBytes ?? 0,
        ownedBytes,
      }));
    }
    const retainedBytes = [...retainedObjects.values()].reduce(
      (sum, entry) => sum + entry.ownedBytes,
      0,
    );
    const candidateActiveBytes =
      this.#active.baseUploadedBytes + retainedBytes;
    if (candidateActiveBytes > plan.maximumActiveBytes) {
      throw new RangeError(
        "headless retained overlay exceeds the active GPU budget",
      );
    }
    const visibleInstances =
      this.#active.baseInstances.filter((instance) =>
        !suppressed.has(instance.renderId)).length +
      [...retainedObjects.values()].filter((entry) => entry.visible)
        .length;
    const staged = {
      id: `headless-retained-stage:${this.#retainedStages + 1}`,
      retainedObjects,
      suppressed,
      candidateActiveBytes,
      visibleInstances,
    };
    this.#active.staged = staged;
    this.#retainedStages += 1;
    let closed = false;
    const close = () => {
      if (this.#active?.staged === staged) {
        this.#active.staged = null;
      }
      closed = true;
    };
    return Object.freeze({
      receipt: Object.freeze({
        backendId: "headless",
        staged: true,
        stageId: staged.id,
        stagedBytes: plan.metrics.stagingBytes,
        currentActiveBytes: this.#active.uploadedBytes,
        candidateActiveBytes,
        retainedObjects: retainedObjects.size,
        currentFramebufferPreserved: true,
        currentPickMapPreserved: true,
      }),
      commit: () => {
        if (closed || this.#active?.staged !== staged) {
          throw invalidState(
            "headless retained overlay transaction is closed",
          );
        }
        this.#active.retainedObjects = retainedObjects;
        this.#active.suppressedBaseRenderIds = suppressed;
        this.#active.uploadedBytes = candidateActiveBytes;
        close();
        this.#retainedCommits += 1;
        return Object.freeze({
          backendId: "headless",
          committed: true,
          atomic: true,
          frameId:
            `headless-retained-frame:${this.#retainedCommits}`,
          activeBytes: candidateActiveBytes,
          retainedObjects: retainedObjects.size,
          visibleInstances,
          geometryPickRevisionAtomic: true,
          currentFramebufferPreserved: false,
        });
      },
      rollback: async () => {
        if (closed) {
          return false;
        }
        close();
        this.#retainedRollbacks += 1;
        return Object.freeze({
          backendId: "headless",
          rolledBack: true,
          releasedStagedBytes: plan.metrics.stagingBytes,
          activeBytes: this.#active.uploadedBytes,
        });
      },
      dispose: async () => {
        if (!closed) {
          if (this.#active?.staged !== staged) {
            return false;
          }
          close();
          this.#retainedRollbacks += 1;
          return true;
        }
        return false;
      },
    });
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
  #retainedCheckpoints = 0;
  #retainedCommits = 0;
  #retainedRollbacks = 0;
  #retainedStages = 0;
  #stagedRetained = null;
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
      retainedCheckpoints: this.#retainedCheckpoints,
      retainedCommits: this.#retainedCommits,
      retainedObjects: [...(this.#active?.retainedOverlays.values() ?? [])]
        .reduce((sum, overlay) => sum + overlay.objects.size, 0),
      retainedOverlaySources:
        this.#active?.retainedOverlays.size ?? 0,
      retainedRollbacks: this.#retainedRollbacks,
      retainedStages: this.#retainedStages,
      stagedRetainedDelta: this.#stagedRetained !== null,
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

  async mount({
    initialCamera: initialCameraValue = null,
    initialRangeStrategy = "source-plan",
    session,
    snapshot,
    signal,
  } = {}) {
    if (this.#disposed) {
      throw invalidState("bounded 3D renderer is disposed");
    }
    if (this.#mounting || this.#updating || this.#stagedRetained !== null) {
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
      if (
        !["source-plan", "camera-visibility"]
          .includes(initialRangeStrategy)
      ) {
        throw new TypeError(
          "renderer initial range strategy is invalid",
        );
      }
      const initialCamera = initialCameraValue === null
        ? null
        : validateCamera3d(initialCameraValue);
      if (
        initialRangeStrategy === "camera-visibility" &&
        initialCamera === null
      ) {
        throw new TypeError(
          "renderer camera-visibility strategy requires a camera",
        );
      }
      const visibilitySelection =
        initialRangeStrategy === "camera-visibility"
          ? selectVisibilityRange(
            input.snapshot,
            input.handles,
            initialCamera,
          )
          : null;
      const selectedHandles = visibilitySelection === null
        ? input.firstHandles
        : [input.handles.get(visibilitySelection.rangeId)];
      const selectedReadBytes = selectedHandles.reduce(
        (sum, handle) => sum + handle.byteLength,
        0,
      );
      if (
        selectedHandles.some((handle) =>
          handle.byteLength > this.limits.maximumRangeBytes) ||
        selectedReadBytes > this.limits.maximumSourceReadBytes
      ) {
        throw new RangeError(
          "renderer selected first range exceeds its byte limit",
        );
      }
      for (const handle of selectedHandles) {
        rangeResults.push(
          await readRange(session, handle, this.limits, signal),
        );
      }
      aborted(signal);
      const plan = buildMountPlan(
        input.snapshot,
        rangeResults,
        this.limits,
        Object.freeze({
          ...input.presentation,
          initialCamera,
        }),
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
          ...input.handles.keys(),
        ].filter((rangeId) =>
          !plan.ranges.some((range) =>
            range.handleId === rangeId),
        )),
        initialRangeSelection: Object.freeze({
          strategy: initialRangeStrategy,
          sourcePlanRangeIds: Object.freeze([
            ...snapshot.loadPlan.firstFrameRangeIds,
          ]),
          selectedRangeIds: Object.freeze(
            plan.ranges.map((range) => range.handleId),
          ),
          cameraDriven: visibilitySelection !== null,
          ranking: visibilitySelection?.ranking ?? null,
        }),
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
      const baseInstances = Object.freeze([...plan.instances]);
      const baseIdentities = Object.freeze(
        baseInstances.map((instance) => Object.freeze({
          expressId: instance.expressId,
          globalId: instance.globalId,
          nativeId: instance.nativeId,
          renderId: instance.renderId,
          pickId: instance.pickId,
          rangeId: instance.rangeId,
          externalIdentityToken:
            instance.externalIdentityToken,
        })),
      );
      this.#active = {
        activeBackendBytes: backendMount.receipt.uploadedBytes,
        deltaSequence: 0,
        handleId: backendMount.handleId,
        handles: input.handles,
        allRangeIds: Object.freeze([
          ...input.handles.keys(),
        ]),
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
        presentation: plan.presentation,
        baseInstances,
        baseIdentities,
        retainedOverlays: new Map(),
        instanceRenderIds: Object.freeze(
          baseInstances.map((instance) => instance.renderId),
        ),
        instancePickIds: Object.freeze(
          baseInstances.map((instance) => instance.pickId),
        ),
        identities: Object.freeze(
          baseIdentities,
        ),
        camera: backendMount.receipt.camera ?? null,
        clipping: clippingState([], null),
        hiddenRenderIds: Object.freeze([]),
        requestedHiddenRenderIds: Object.freeze([]),
        retainedInvisibleRenderIds: Object.freeze([]),
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
    if (this.#mounting || this.#updating || this.#stagedRetained !== null) {
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
          this.#active.allRangeIds
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
      this.#active.baseInstances = Object.freeze([
        ...this.#active.baseInstances,
        ...plan.instances,
      ]);
      this.#active.baseIdentities = Object.freeze([
        ...this.#active.baseIdentities,
        ...plan.instances.map((instance) => Object.freeze({
          expressId: instance.expressId,
          globalId: instance.globalId,
          nativeId: instance.nativeId,
          renderId: instance.renderId,
          pickId: instance.pickId,
          rangeId: instance.rangeId,
          externalIdentityToken:
            instance.externalIdentityToken,
        })),
      ]);
      refreshRetainedOverlayIdentities(this.#active);
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
          this.#active.allRangeIds
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
    if (this.#mounting || this.#updating || this.#stagedRetained !== null) {
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
    if ([...this.#active.retainedOverlays.values()].some(
      (overlay) => [...overlay.objects.values()].some(
        (object) => object.rangeId === rangeId,
      ),
    )) {
      throw invalidState(
        "renderer range is retained by an overlay source",
      );
    }
    if (typeof this.#backend.evictRange !== "function") {
      throw new DOMException(
        "renderer backend does not support range eviction",
        "NotSupportedError",
      );
    }
    const expectedBytes =
      plan.metrics.geometryPayloadBytes +
      plan.metrics.instanceBytes +
      (plan.metrics.textureGpuBytes ?? 0);
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
      this.#active.baseInstances = Object.freeze(
        this.#active.baseInstances.filter(
          (instance) => instance.rangeId !== rangeId,
        ),
      );
      this.#active.baseIdentities = Object.freeze(
        this.#active.baseIdentities.filter(
          (identity) => identity.rangeId !== rangeId,
        ),
      );
      refreshRetainedOverlayIdentities(this.#active);
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
          this.#active.allRangeIds
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

  registerRetainedOverlaySource(value) {
    if (this.#disposed) {
      throw invalidState("bounded 3D renderer is disposed");
    }
    if (this.#mounting || this.#updating || this.#stagedRetained !== null) {
      throw invalidState(
        "bounded 3D renderer operation is in progress",
      );
    }
    if (this.#active === null) {
      throw invalidState("bounded 3D renderer is not mounted");
    }
    const registration = retainedSourceRegistration(
      value,
      this.#active.baseInstances,
      this.limits,
    );
    if (this.#active.retainedOverlays.has(registration.overlayId)) {
      throw new RangeError(
        "renderer retained overlay source is already registered",
      );
    }
    const claimed = new Set(
      [...this.#active.retainedOverlays.values()].flatMap(
        (overlay) => [...overlay.sourceToProjected.values()]
          .map((projected) => projected.renderId),
      ),
    );
    if ([...registration.sourceToProjected.values()].some(
      (projected) => claimed.has(projected.renderId),
    )) {
      throw new RangeError(
        "renderer retained overlay sources overlap",
      );
    }
    this.#active.retainedOverlays.set(
      registration.overlayId,
      registration,
    );
    return Object.freeze({
      schema: "bim-explorer-retained-overlay-source-receipt/0.1",
      status: "registered",
      overlayId: registration.overlayId,
      sourceId: registration.sourceId,
      layerId: registration.layerId,
      revisionId: registration.revisionId,
      identities: registration.objects.size,
      activeBackendBytes: this.#active.activeBackendBytes,
    });
  }

  retainedOverlaySnapshot({ overlayId } = {}) {
    if (this.#disposed) {
      throw invalidState("bounded 3D renderer is disposed");
    }
    if (this.#active === null) {
      throw invalidState("bounded 3D renderer is not mounted");
    }
    nonEmptyString(overlayId, "renderer retained overlayId");
    const overlay = this.#active.retainedOverlays.get(overlayId);
    if (overlay === undefined) {
      throw new RangeError(
        "renderer retained overlay source is not registered",
      );
    }
    return Object.freeze({
      overlayId: overlay.overlayId,
      sourceId: overlay.sourceId,
      layerId: overlay.layerId,
      revisionId: overlay.revisionId,
      sequence: overlay.sequence,
      checkpoints: overlay.checkpoints,
      identities: Object.freeze(
        [...overlay.objects.values()].map((object) =>
          retainedIdentity(object, overlay)),
      ),
      activeBackendBytes: this.#active.activeBackendBytes,
    });
  }

  async prepareRetainedOverlayDelta({
    overlayId,
    delta,
    payloadBytes = null,
    signal,
  } = {}) {
    if (this.#disposed) {
      throw invalidState("bounded 3D renderer is disposed");
    }
    if (this.#mounting || this.#updating || this.#stagedRetained !== null) {
      throw invalidState(
        "bounded 3D renderer operation is in progress",
      );
    }
    if (this.#active === null) {
      throw invalidState("bounded 3D renderer is not mounted");
    }
    if (typeof this.#backend.stageRetainedOverlayDelta !== "function") {
      throw new DOMException(
        "renderer backend does not support retained overlays",
        "NotSupportedError",
      );
    }
    nonEmptyString(overlayId, "renderer retained overlayId");
    const active = this.#active;
    const overlay = active.retainedOverlays.get(overlayId);
    if (overlay === undefined) {
      throw new RangeError(
        "renderer retained overlay source is not registered",
      );
    }
    this.#updating = true;
    let plan = null;
    let backendTransaction = null;
    try {
      aborted(signal);
      plan = await buildRetainedOverlayPlan({
        delta,
        overlay,
        payloadBytes,
        limits: this.limits,
      });
      aborted(signal);
      backendTransaction = await this.#backend.stageRetainedOverlayDelta(
        active.handleId,
        Object.freeze({
          ...plan,
          maximumActiveBytes: this.limits.maximumGpuCacheBytes,
          maximumStagingBytes:
            this.limits.maximumRetainedOverlayStagingBytes,
          presentation: active.presentation,
        }),
        { signal },
      );
      aborted(signal);
      const stageReceipt = plainRecord(
        backendTransaction?.receipt,
        "renderer retained overlay backend stage receipt",
      );
      for (const method of ["commit", "rollback", "dispose"]) {
        if (typeof backendTransaction?.[method] !== "function") {
          throw new TypeError(
            `renderer retained overlay transaction.${method} must be a function`,
          );
        }
      }
      if (
        stageReceipt.staged !== true ||
        typeof stageReceipt.stageId !== "string" ||
        stageReceipt.stageId.length === 0 ||
        stageReceipt.currentActiveBytes !== active.activeBackendBytes ||
        !Number.isSafeInteger(stageReceipt.candidateActiveBytes) ||
        stageReceipt.candidateActiveBytes < 0 ||
        stageReceipt.candidateActiveBytes >
          this.limits.maximumGpuCacheBytes ||
        stageReceipt.currentFramebufferPreserved !== true ||
        stageReceipt.currentPickMapPreserved !== true
      ) {
        throw new Error(
          "renderer retained overlay backend stage receipt is invalid",
        );
      }
      const staged = {
        active,
        backendTransaction,
        overlay,
        plan,
        stageReceipt: Object.freeze({ ...stageReceipt }),
      };
      this.#stagedRetained = staged;
      this.#retainedStages += 1;
      let status = "open";
      const assertOpen = () => {
        if (
          status !== "open" ||
          this.#stagedRetained !== staged ||
          this.#active !== active
        ) {
          throw invalidState(
            "renderer retained overlay transaction is closed",
          );
        }
      };
      const close = (nextStatus) => {
        if (this.#stagedRetained === staged) {
          this.#stagedRetained = null;
        }
        status = nextStatus;
      };
      return Object.freeze({
        receipt: Object.freeze({
          schema: BIM_RETAINED_OVERLAY_DELTA_RECEIPT,
          status: "prepared",
          atomic: true,
          applied: false,
          overlayId,
          deltaId: plan.deltaId,
          sequence: plan.sequence,
          fromRevisionId: plan.fromRevisionId,
          toRevisionId: plan.toRevisionId,
          affectedWorldBounds: plan.affectedWorldBounds,
          metrics: plan.metrics,
          backend: staged.stageReceipt,
          cpuStagingReleased: true,
        }),
        commit: () => {
          assertOpen();
          const backend = plainRecord(
            backendTransaction.commit(),
            "renderer retained overlay backend commit receipt",
          );
          if (
            backend.committed !== true ||
            backend.atomic !== true ||
            backend.geometryPickRevisionAtomic !== true ||
            backend.activeBytes !==
              stageReceipt.candidateActiveBytes
          ) {
            throw new Error(
              "renderer retained overlay backend commit receipt is invalid",
            );
          }
          const nextOverlay = {
            ...overlay,
            revisionId: plan.toRevisionId,
            sequence: plan.sequence,
            objects: plan.nextObjects,
            sourceToProjected: plan.nextSourceToProjected,
          };
          active.retainedOverlays.set(overlayId, nextOverlay);
          active.activeBackendBytes = backend.activeBytes;
          active.viewRevision += 1;
          refreshRetainedOverlayIdentities(active);
          close("committed");
          this.#retainedCommits += 1;
          return Object.freeze({
            schema: BIM_RETAINED_OVERLAY_DELTA_RECEIPT,
            status: "applied",
            atomic: true,
            applied: true,
            overlayId,
            sourceId: nextOverlay.sourceId,
            layerId: nextOverlay.layerId,
            deltaId: plan.deltaId,
            sequence: plan.sequence,
            fromRevisionId: plan.fromRevisionId,
            toRevisionId: plan.toRevisionId,
            affectedWorldBounds: plan.affectedWorldBounds,
            identities: Object.freeze(
              [...nextOverlay.objects.values()].map((object) =>
                retainedIdentity(object, nextOverlay)),
            ),
            activeBackendBytes: backend.activeBytes,
            viewRevision: active.viewRevision,
            backend: Object.freeze({ ...backend }),
          });
        },
        rollback: async () => {
          if (status !== "open") {
            return false;
          }
          assertOpen();
          const result = await backendTransaction.rollback();
          close("rolled-back");
          this.#retainedRollbacks += 1;
          return result;
        },
        dispose: async () => {
          if (status === "open") {
            assertOpen();
            const result = await backendTransaction.dispose();
            close("disposed");
            this.#retainedRollbacks += 1;
            return result;
          }
          return await backendTransaction.dispose();
        },
      });
    } catch (error) {
      if (backendTransaction !== null) {
        const cleanupErrors = [];
        for (const method of ["rollback", "dispose"]) {
          try {
            await backendTransaction[method]();
          } catch (cleanupError) {
            cleanupErrors.push(cleanupError);
          }
        }
        if (cleanupErrors.length > 0) {
          throw new AggregateError(
            [error, ...cleanupErrors],
            "renderer retained overlay preparation cleanup failed",
            { cause: error },
          );
        }
      }
      throw error;
    } finally {
      plan?.releaseCpuStaging();
      this.#updating = false;
    }
  }

  checkpointRetainedOverlay({
    checkpointId,
    expectedRevisionId,
    overlayId,
  } = {}) {
    if (this.#disposed) {
      throw invalidState("bounded 3D renderer is disposed");
    }
    if (this.#mounting || this.#updating || this.#stagedRetained !== null) {
      throw invalidState(
        "bounded 3D renderer operation is in progress",
      );
    }
    if (this.#active === null) {
      throw invalidState("bounded 3D renderer is not mounted");
    }
    for (const [label, value] of Object.entries({
      checkpointId,
      expectedRevisionId,
      overlayId,
    })) {
      nonEmptyString(value, `renderer retained checkpoint.${label}`);
    }
    const overlay = this.#active.retainedOverlays.get(overlayId);
    if (
      overlay === undefined ||
      overlay.revisionId !== expectedRevisionId
    ) {
      throw new RangeError(
        "renderer retained checkpoint is outside the active revision",
      );
    }
    overlay.checkpoints += 1;
    this.#retainedCheckpoints += 1;
    return Object.freeze({
      schema: BIM_RETAINED_OVERLAY_CHECKPOINT_RECEIPT,
      status: "checkpointed",
      overlayId,
      checkpointId,
      revisionId: overlay.revisionId,
      sequence: overlay.sequence,
      retainedObjects: overlay.objects.size,
      activeBackendBytes: this.#active.activeBackendBytes,
      externalSourceRangeReads: 0,
      externalSourceParses: 0,
      externalSourceRangeUploads: 0,
      cameraPreserved: true,
      clippingPreserved: true,
      anchorPreserved: true,
    });
  }

  async applyRenderDelta({ delta: deltaValue, signal } = {}) {
    if (this.#disposed) {
      throw invalidState("bounded 3D renderer is disposed");
    }
    if (this.#mounting || this.#updating || this.#stagedRetained !== null) {
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
    if (this.#mounting || this.#updating || this.#stagedRetained !== null) {
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
    const requestedHiddenRenderIds = isolated === null
      ? [...hiddenRenderIds]
      : [...new Set(this.#active.instanceRenderIds)]
          .filter((renderId) => !isolated.has(renderId));
    const effectiveHiddenRenderIds = [
      ...new Set([
        ...requestedHiddenRenderIds,
        ...this.#active.retainedInvisibleRenderIds,
      ]),
    ];
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
      this.#active.requestedHiddenRenderIds =
        Object.freeze([...requestedHiddenRenderIds]);
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
    if (this.#mounting || this.#updating || this.#stagedRetained !== null) {
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
    if (this.#mounting || this.#updating || this.#stagedRetained !== null) {
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
    if (this.#mounting || this.#updating || this.#stagedRetained !== null) {
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
    if (this.#mounting || this.#updating || this.#stagedRetained !== null) {
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
  BIM_TEXTURED_GEOMETRY_MEDIA_TYPE,
  BIM_TEXTURED_GEOMETRY_MEDIA_TYPE_V3,
  decodeBimTexturedGeometryRange,
};

export {
  BIM_RETAINED_OVERLAY_CHECKPOINT_RECEIPT,
  BIM_RETAINED_OVERLAY_DELTA_RECEIPT,
  BIM_RETAINED_OVERLAY_PACKET_MEDIA_TYPE,
  BIM_RETAINED_OVERLAY_PACKET_SCHEMA,
  decodeBimRetainedOverlayPacket,
  encodeBimRetainedOverlayPacket,
  sha256BimRetainedOverlayPacket,
};

export {
  BIM_POINT_IDENTITY_AUTHORITY,
  BIM_POINT_RANGE_MEDIA_TYPE,
  BIM_POINT_RANGE_MAXIMUM_BYTES,
  BIM_POINT_RANGE_MAXIMUM_POINTS,
  BIM_POINT_RENDERER_CONTRACT,
  BIM_POINT_RENDERER_PICK_RECEIPT,
  BIM_POINT_RENDERER_RECEIPT,
  BIM_POINT_RENDERER_RELEASE_RECEIPT,
  BoundedPointCloudRenderer,
  HeadlessPointCloudBackend,
  createBoundedPointCloudRenderer,
  createHeadlessPointCloudBackend,
  decodeBimPointRange,
  encodeBimPointRange,
} from "./point-cloud.mjs";

export {
  PointCloudWebGl2Backend,
  createPointCloudWebGl2Backend,
} from "./point-cloud-webgl2-backend.mjs";

export {
  BIM_POINT_HIERARCHY_CONTRACT,
  BIM_POINT_LOD_RANGE_RECEIPT,
  DerivedPointCloudHierarchy,
  createDerivedPointCloudHierarchy,
} from "./point-cloud-lod.mjs";

export {
  BIM_RENDERER_3D_HOST_CONTRACT,
  BIM_RENDERER_3D_HOST_RECEIPT,
  BimRenderer3dHost,
  createBimRenderer3dHost,
} from "./host-adapter.mjs";

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
  CameraInteraction3d,
  attachCameraControls3d,
  createCameraInteraction3d,
} from "./camera-controls.mjs";

export {
  BIM_MEASUREMENT_3D_SCHEMA,
  createMeasurement3d,
  measureAngle3d,
  measureArea3d,
  measureDistance3d,
} from "./measurement.mjs";
