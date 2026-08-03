export const BIM_RENDERER_3D_CONTRACT =
  "bim-explorer-bim-renderer-3d/0.1";
export const BIM_RENDERER_3D_RECEIPT =
  "bim-explorer-bim-renderer-3d-receipt/0.1";
export const BIM_GEOMETRY_MEDIA_TYPE =
  "application/vnd.bim-explorer.geometry-range.v1";

const SHA256 = /^[0-9a-f]{64}$/u;
const SOURCE_FINGERPRINT = /^sha256:[0-9a-f]{64}$/u;
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
    totalReadBytes,
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

function buildMountPlan(snapshot, rangeResults, limits) {
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

export class Headless3dBackend {
  #active = null;
  #disposed = false;
  #mounts = 0;
  #unmounts = 0;

  get state() {
    return Object.freeze({
      disposed: this.#disposed,
      mounts: this.#mounts,
      unmounts: this.#unmounts,
      activeHandleId: this.#active?.handleId ?? null,
      activeBytes: this.#active?.uploadedBytes ?? 0,
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
  #disposed = false;
  #mounting = false;
  #mounts = 0;
  #unmounts = 0;

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
      mounting: this.#mounting,
      mounted: this.#active !== null,
      mounts: this.#mounts,
      unmounts: this.#unmounts,
      activeRevisionId: this.#active?.revisionId ?? null,
      activeBackendBytes:
        this.#active?.receipt.backend.uploadedBytes ?? 0,
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
        active.receipt.backend.uploadedBytes
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
    if (this.#mounting) {
      throw invalidState("bounded 3D renderer mount is in progress");
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
        handleId: backendMount.handleId,
        revisionId: snapshot.revisionId,
        receipt,
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

  async unmount() {
    if (this.#mounting) {
      throw invalidState("bounded 3D renderer mount is in progress");
    }
    return this.#releaseActive();
  }

  async dispose() {
    if (this.#disposed) {
      return false;
    }
    if (this.#mounting) {
      throw invalidState("bounded 3D renderer mount is in progress");
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
