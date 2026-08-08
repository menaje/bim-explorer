import {
  createFitCamera3d,
  validateCamera3d,
} from "./camera.mjs";

export const BIM_POINT_RANGE_MEDIA_TYPE =
  "application/vnd.bim-explorer.point-range.v1";
export const BIM_POINT_RENDERER_CONTRACT =
  "bim-explorer-bounded-point-renderer/0.1";
export const BIM_POINT_RENDERER_RECEIPT =
  "bim-explorer-bounded-point-renderer-receipt/0.1";
export const BIM_POINT_RENDERER_RELEASE_RECEIPT =
  "bim-explorer-bounded-point-renderer-release-receipt/0.1";
export const BIM_POINT_RENDERER_PICK_RECEIPT =
  "bim-explorer-bounded-point-renderer-pick-receipt/0.1";
export const BIM_POINT_IDENTITY_AUTHORITY =
  "derived-point-range-order";

const MAGIC = "BEXPTS01";
const HEADER_BYTES = 48;
const POINT_STRIDE_BYTES = 16;
const RGBA8_FLAG = 1;
const SHA256 = /^[0-9a-f]{64}$/u;
const SOURCE_FINGERPRINT = /^sha256:[0-9a-f]{64}$/u;
export const BIM_POINT_RANGE_MAXIMUM_BYTES = 32 * 1024 * 1024;
export const BIM_POINT_RANGE_MAXIMUM_POINTS = 2_000_000;
const DEFAULT_LIMITS = Object.freeze({
  maximumCpuStagingBytes: 8 * 1024 * 1024,
  maximumGpuBytes: 8 * 1024 * 1024,
  maximumIdentityMapBytes: 2 * 1024 * 1024,
  maximumPointPayloadBytes: 8 * 1024 * 1024,
  maximumPoints: 500_000,
  maximumRangeBytes: 8 * 1024 * 1024,
  maximumPointSize: 16,
});
const ABSOLUTE_LIMITS = Object.freeze({
  maximumCpuStagingBytes: BIM_POINT_RANGE_MAXIMUM_BYTES,
  maximumGpuBytes: BIM_POINT_RANGE_MAXIMUM_BYTES,
  maximumIdentityMapBytes: 8 * 1024 * 1024,
  maximumPointPayloadBytes: BIM_POINT_RANGE_MAXIMUM_BYTES,
  maximumPoints: BIM_POINT_RANGE_MAXIMUM_POINTS,
  maximumRangeBytes: BIM_POINT_RANGE_MAXIMUM_BYTES,
  maximumPointSize: DEFAULT_LIMITS.maximumPointSize,
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
  return value;
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return value;
}

function finiteVector(value, length, label) {
  if (
    !Array.isArray(value) ||
    value.length !== length ||
    value.some((item) =>
      typeof item !== "number" || !Number.isFinite(item))
  ) {
    throw new TypeError(`${label} must be a finite ${length}D vector`);
  }
  return Object.freeze([...value]);
}

function invalidState(message) {
  return new DOMException(message, "InvalidStateError");
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
  const additions = plainRecord(
    overrides,
    "point renderer limits",
  );
  for (const key of Object.keys(additions)) {
    if (!(key in DEFAULT_LIMITS)) {
      throw new TypeError(
        `point renderer limit ${key} is unsupported`,
      );
    }
  }
  const limits = { ...DEFAULT_LIMITS, ...additions };
  for (const [key, value] of Object.entries(limits)) {
    positiveInteger(value, `point renderer limits.${key}`);
    if (value > ABSOLUTE_LIMITS[key]) {
      throw new RangeError(
        `point renderer limits.${key} exceeds its absolute bound`,
      );
    }
  }
  if (
    limits.maximumPointPayloadBytes > limits.maximumGpuBytes ||
    limits.maximumRangeBytes > limits.maximumCpuStagingBytes ||
    limits.maximumPoints * Uint32Array.BYTES_PER_ELEMENT >
      limits.maximumIdentityMapBytes ||
    limits.maximumPoints * POINT_STRIDE_BYTES >
      limits.maximumPointPayloadBytes
  ) {
    throw new RangeError(
      "point renderer limits do not form a bounded allocation envelope",
    );
  }
  return Object.freeze(limits);
}

function validatedPointSize(value, maximumPointSize) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 1 ||
    value > maximumPointSize
  ) {
    throw new RangeError(
      `point size must be between 1 and ${maximumPointSize}`,
    );
  }
  return value;
}

function paddedCameraBounds(bounds) {
  const span = bounds.max.map(
    (value, axis) => value - bounds.min[axis],
  );
  if (span.some((value) => value > 0)) {
    return bounds;
  }
  return Object.freeze({
    min: Object.freeze(
      bounds.min.map((value) => value - 0.001),
    ),
    max: Object.freeze(
      bounds.max.map((value) => value + 0.001),
    ),
  });
}

export function encodeBimPointRange({
  colors,
  origin,
  positions,
} = {}, {
  maximumPayloadBytes =
    DEFAULT_LIMITS.maximumPointPayloadBytes,
  maximumPoints = DEFAULT_LIMITS.maximumPoints,
} = {}) {
  positiveInteger(maximumPayloadBytes, "maximumPayloadBytes");
  positiveInteger(maximumPoints, "maximumPoints");
  if (
    maximumPayloadBytes >
      ABSOLUTE_LIMITS.maximumPointPayloadBytes ||
    maximumPoints > ABSOLUTE_LIMITS.maximumPoints
  ) {
    throw new RangeError(
      "point range encoder limits exceed the absolute profile",
    );
  }
  const valueOrigin = finiteVector(origin, 3, "point range origin");
  if (
    !(positions instanceof Float32Array) ||
    positions.length === 0 ||
    positions.length % 3 !== 0
  ) {
    throw new TypeError(
      "point range positions must be a non-empty Float32Array",
    );
  }
  const pointCount = positions.length / 3;
  const payloadBytes = pointCount * POINT_STRIDE_BYTES;
  if (
    !(colors instanceof Uint8Array) ||
    colors.length !== pointCount * 4
  ) {
    throw new TypeError(
      "point range colors must provide one RGBA8 value per point",
    );
  }
  if (
    pointCount > maximumPoints ||
    payloadBytes > maximumPayloadBytes ||
    positions.some((value) => !Number.isFinite(value))
  ) {
    throw new RangeError(
      "point range encoder input exceeds the bounded profile",
    );
  }
  const bytes = new Uint8Array(
    HEADER_BYTES + pointCount * POINT_STRIDE_BYTES,
  );
  bytes.set(new TextEncoder().encode(MAGIC));
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 1, true);
  view.setUint32(12, pointCount, true);
  view.setUint32(16, POINT_STRIDE_BYTES, true);
  view.setUint32(20, RGBA8_FLAG, true);
  for (let axis = 0; axis < 3; axis += 1) {
    view.setFloat64(24 + axis * 8, valueOrigin[axis], true);
  }
  for (let index = 0; index < pointCount; index += 1) {
    const offset = HEADER_BYTES + index * POINT_STRIDE_BYTES;
    view.setFloat32(offset, positions[index * 3], true);
    view.setFloat32(offset + 4, positions[index * 3 + 1], true);
    view.setFloat32(offset + 8, positions[index * 3 + 2], true);
    bytes.set(
      colors.subarray(index * 4, index * 4 + 4),
      offset + 12,
    );
  }
  return bytes;
}

export function decodeBimPointRange(
  bytes,
  {
    maximumPayloadBytes =
      DEFAULT_LIMITS.maximumPointPayloadBytes,
    maximumPoints = DEFAULT_LIMITS.maximumPoints,
  } = {},
) {
  positiveInteger(maximumPayloadBytes, "maximumPayloadBytes");
  positiveInteger(maximumPoints, "maximumPoints");
  if (
    maximumPayloadBytes >
      ABSOLUTE_LIMITS.maximumPointPayloadBytes ||
    maximumPoints > ABSOLUTE_LIMITS.maximumPoints
  ) {
    throw new RangeError(
      "point range decoder limits exceed the absolute profile",
    );
  }
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError("point range must be a Uint8Array");
  }
  if (bytes.byteLength < HEADER_BYTES) {
    throw new RangeError("point range header is truncated");
  }
  if (
    new TextDecoder().decode(bytes.subarray(0, 8)) !== MAGIC
  ) {
    throw new Error("point range magic is invalid");
  }
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  );
  const version = view.getUint32(8, true);
  const pointCount = view.getUint32(12, true);
  const pointStrideBytes = view.getUint32(16, true);
  const flags = view.getUint32(20, true);
  if (
    version !== 1 ||
    pointStrideBytes !== POINT_STRIDE_BYTES ||
    flags !== RGBA8_FLAG
  ) {
    throw new Error("point range header profile is unsupported");
  }
  const payloadBytes = pointCount * pointStrideBytes;
  if (
    pointCount === 0 ||
    pointCount > maximumPoints ||
    payloadBytes > maximumPayloadBytes
  ) {
    throw new RangeError(
      "point range payload exceeds the configured limit",
    );
  }
  if (bytes.byteLength !== HEADER_BYTES + payloadBytes) {
    throw new RangeError(
      "point range payload is truncated or has trailing bytes",
    );
  }
  const origin = [0, 1, 2].map((axis) =>
    view.getFloat64(24 + axis * 8, true));
  if (origin.some((value) => !Number.isFinite(value))) {
    throw new TypeError("point range origin must be finite");
  }
  const relativeMin = [Infinity, Infinity, Infinity];
  const relativeMax = [-Infinity, -Infinity, -Infinity];
  const colorMin = [255, 255, 255, 255];
  const colorMax = [0, 0, 0, 0];
  for (let index = 0; index < pointCount; index += 1) {
    const offset = HEADER_BYTES + index * pointStrideBytes;
    for (let axis = 0; axis < 3; axis += 1) {
      const position = view.getFloat32(offset + axis * 4, true);
      if (!Number.isFinite(position)) {
        throw new TypeError(
          `point range point ${index} position is non-finite`,
        );
      }
      relativeMin[axis] = Math.min(relativeMin[axis], position);
      relativeMax[axis] = Math.max(relativeMax[axis], position);
    }
    for (let channel = 0; channel < 4; channel += 1) {
      const color = view.getUint8(offset + 12 + channel);
      colorMin[channel] = Math.min(colorMin[channel], color);
      colorMax[channel] = Math.max(colorMax[channel], color);
    }
  }
  const bounds = Object.freeze({
    min: Object.freeze(relativeMin.map((value, axis) => {
      const world = origin[axis] + value;
      if (!Number.isFinite(world)) {
        throw new RangeError("point range world bounds overflow");
      }
      return world;
    })),
    max: Object.freeze(relativeMax.map((value, axis) => {
      const world = origin[axis] + value;
      if (!Number.isFinite(world)) {
        throw new RangeError("point range world bounds overflow");
      }
      return world;
    })),
  });
  return Object.freeze({
    schema: "bim-explorer-decoded-point-range/1",
    byteLength: bytes.byteLength,
    payloadBytes,
    pointCount,
    pointStrideBytes,
    origin: Object.freeze(origin),
    relativeBounds: Object.freeze({
      min: Object.freeze(relativeMin),
      max: Object.freeze(relativeMax),
    }),
    bounds,
    colorRange: Object.freeze({
      min: Object.freeze(colorMin),
      max: Object.freeze(colorMax),
    }),
    payload: Object.freeze({
      offset: HEADER_BYTES,
      byteLength: payloadBytes,
    }),
  });
}

function validatedSource(value) {
  const source = plainRecord(value, "point renderer source");
  nonEmptyString(source.format, "point renderer source.format");
  nonEmptyString(
    source.revisionId,
    "point renderer source.revisionId",
  );
  if (
    !SOURCE_FINGERPRINT.test(source.fingerprint ?? "") ||
    source.semanticAuthority !== false ||
    !["qualified", "unqualified"].includes(
      source.coordinateReferenceStatus,
    )
  ) {
    throw new TypeError("point renderer source identity is invalid");
  }
  return Object.freeze({
    coordinateReferenceStatus: source.coordinateReferenceStatus,
    fingerprint: source.fingerprint,
    format: source.format,
    revisionId: source.revisionId,
    semanticAuthority: false,
  });
}

function validatedRange(value, limits) {
  const range = plainRecord(value, "point renderer range");
  nonEmptyString(range.handleId, "point renderer range.handleId");
  if (
    range.mediaType !== BIM_POINT_RANGE_MEDIA_TYPE ||
    !SHA256.test(range.sha256 ?? "") ||
    !(range.bytes instanceof Uint8Array) ||
    range.bytes.byteLength === 0 ||
    range.bytes.byteLength > limits.maximumRangeBytes ||
    range.bytes.byteLength > limits.maximumCpuStagingBytes
  ) {
    throw new TypeError("point renderer range is invalid or unbounded");
  }
  const hasIdentityMetadata =
    range.identityRangeHandleId !== undefined ||
    range.identityRangeSha256 !== undefined ||
    range.pointIndices !== undefined ||
    range.sourcePointCount !== undefined;
  if (
    hasIdentityMetadata &&
    (
      typeof range.identityRangeHandleId !== "string" ||
      range.identityRangeHandleId.length === 0 ||
      !SHA256.test(range.identityRangeSha256 ?? "") ||
      !Number.isSafeInteger(range.sourcePointCount) ||
      range.sourcePointCount <= 0 ||
      (
        range.pointIndices !== null &&
        !(range.pointIndices instanceof Uint32Array)
      ) ||
      (range.pointIndices?.byteLength ?? 0) >
        limits.maximumIdentityMapBytes
    )
  ) {
    throw new TypeError("point renderer range identity map is invalid");
  }
  return range;
}

function validatedLod(value, pointCount) {
  if (value === undefined) {
    return null;
  }
  const lod = plainRecord(value, "point renderer range.lod");
  if (
    !Number.isSafeInteger(lod.chunkCount) ||
    lod.chunkCount <= 0 ||
    typeof lod.fullDetail !== "boolean" ||
    typeof lod.hierarchyId !== "string" ||
    lod.hierarchyId.length === 0 ||
    typeof lod.levelId !== "string" ||
    lod.levelId.length === 0 ||
    !Number.isSafeInteger(lod.levelIndex) ||
    lod.levelIndex < 0 ||
    lod.pointCount !== pointCount ||
    !SHA256.test(lod.selectionSha256 ?? "") ||
    !Number.isSafeInteger(lod.stride) ||
    lod.stride <= 0
  ) {
    throw new TypeError("point renderer range LOD metadata is invalid");
  }
  return Object.freeze({ ...lod });
}

function validateBackendMount(value, metrics) {
  const result = plainRecord(
    value,
    "point renderer backend mount result",
  );
  nonEmptyString(
    result.handleId,
    "point renderer backend handleId",
  );
  const receipt = plainRecord(
    result.receipt,
    "point renderer backend mount receipt",
  );
  nonEmptyString(
    receipt.backendId,
    "point renderer backend receipt.backendId",
  );
  nonEmptyString(
    receipt.frameId,
    "point renderer backend receipt.frameId",
  );
  if (
    typeof receipt.actualGpu !== "boolean" ||
    typeof receipt.rendered !== "boolean" ||
    receipt.pointPrimitive !== "POINTS" ||
    receipt.points !== metrics.points ||
    receipt.pointSize !== metrics.pointSize ||
    receipt.uploadedBytes !== metrics.gpuBytes ||
    receipt.drawCalls !== 1 ||
    !Number.isSafeInteger(receipt.nonBackgroundPixels) ||
    receipt.nonBackgroundPixels < 0 ||
    receipt.glError !== 0 ||
    receipt.stagingConsumed !== true ||
    (receipt.actualGpu &&
      (!receipt.rendered || receipt.nonBackgroundPixels === 0))
  ) {
    throw new Error("point renderer backend mount receipt is invalid");
  }
  return Object.freeze({ ...receipt });
}

function validateBackendRelease(value, expectedBytes) {
  const receipt = plainRecord(
    value?.receipt,
    "point renderer backend release receipt",
  );
  nonEmptyString(
    receipt.backendId,
    "point renderer backend release receipt.backendId",
  );
  if (
    receipt.releasedBytes !== expectedBytes ||
    receipt.activeBytes !== 0 ||
    receipt.residentRanges !== 0
  ) {
    throw new Error("point renderer backend release receipt is invalid");
  }
  return Object.freeze({ ...receipt });
}

function validateBackendPick(value, {
  pointCount,
  x,
  y,
}) {
  const result = plainRecord(
    value,
    "point renderer backend pick result",
  );
  const receipt = plainRecord(
    result.receipt,
    "point renderer backend pick receipt",
  );
  nonEmptyString(
    receipt.backendId,
    "point renderer backend pick receipt.backendId",
  );
  nonEmptyString(
    receipt.frameId,
    "point renderer backend pick receipt.frameId",
  );
  const hit = receipt.hit === true;
  const pointIndex = hit ? receipt.pointIndex : null;
  const worldPosition = hit
    ? finiteVector(
        receipt.worldPosition,
        3,
        "point renderer backend pick worldPosition",
      )
    : null;
  if (
    typeof receipt.actualGpu !== "boolean" ||
    typeof receipt.hit !== "boolean" ||
    receipt.x !== x ||
    receipt.y !== y ||
    receipt.drawCalls !== 1 ||
    receipt.temporaryReleased !== true ||
    !Number.isSafeInteger(receipt.temporaryTargetBytes) ||
    receipt.temporaryTargetBytes <= 0 ||
    receipt.glError !== 0 ||
    (
      hit &&
      (
        !Number.isSafeInteger(pointIndex) ||
        pointIndex < 0 ||
        pointIndex >= pointCount
      )
    ) ||
    (
      !hit &&
      (
        receipt.pointIndex !== null ||
        receipt.worldPosition !== null
      )
    )
  ) {
    throw new Error("point renderer backend pick receipt is invalid");
  }
  return Object.freeze({
    ...receipt,
    pointIndex,
    worldPosition,
  });
}

export class HeadlessPointCloudBackend {
  #active = null;
  #disposed = false;
  #mounts = 0;
  #unmounts = 0;

  get state() {
    return Object.freeze({
      activeBytes: this.#active?.uploadedBytes ?? 0,
      disposed: this.#disposed,
      mounts: this.#mounts,
      residentRanges: this.#active === null ? 0 : 1,
      unmounts: this.#unmounts,
    });
  }

  async mount(plan, { signal } = {}) {
    aborted(signal);
    if (this.#disposed) {
      throw invalidState("headless point backend is disposed");
    }
    if (this.#active !== null) {
      throw invalidState("headless point backend already has a mount");
    }
    const value = plainRecord(plan, "headless point mount plan");
    const metrics = plainRecord(
      value.metrics,
      "headless point mount metrics",
    );
    this.#mounts += 1;
    const handleId = `headless-point-mount:${this.#mounts}`;
    this.#active = {
      handleId,
      uploadedBytes: metrics.gpuBytes,
    };
    return {
      handleId,
      receipt: {
        actualGpu: false,
        backendId: "headless-points",
        drawCalls: 1,
        frameId: `headless-point-frame:${this.#mounts}`,
        glError: 0,
        nonBackgroundPixels: 0,
        pointPrimitive: "POINTS",
        pointSize: metrics.pointSize,
        points: metrics.points,
        rendered: false,
        stagingConsumed: true,
        uploadedBytes: metrics.gpuBytes,
      },
    };
  }

  async unmount(handleId) {
    if (this.#disposed) {
      throw invalidState("headless point backend is disposed");
    }
    if (
      this.#active === null ||
      this.#active.handleId !== handleId
    ) {
      throw new RangeError("headless point mount handle is not active");
    }
    const releasedBytes = this.#active.uploadedBytes;
    this.#active = null;
    this.#unmounts += 1;
    return {
      receipt: {
        activeBytes: 0,
        backendId: "headless-points",
        releasedBytes,
        residentRanges: 0,
      },
    };
  }

  async dispose() {
    if (this.#disposed) {
      return false;
    }
    if (this.#active !== null) {
      await this.unmount(this.#active.handleId);
    }
    this.#disposed = true;
    return true;
  }
}

export class BoundedPointCloudRenderer {
  #active = null;
  #backend;
  #disposed = false;
  #mounting = false;
  #mounts = 0;
  #picking = false;
  #picks = 0;
  #pointSize;
  #unmounts = 0;

  constructor({
    backend,
    limits = {},
    pointSize = 3,
  } = {}) {
    if (
      typeof backend?.mount !== "function" ||
      typeof backend?.unmount !== "function" ||
      typeof backend?.dispose !== "function"
    ) {
      throw new TypeError(
        "point renderer backend lifecycle is incomplete",
      );
    }
    this.limits = validatedLimits(limits);
    this.#pointSize = validatedPointSize(
      pointSize,
      this.limits.maximumPointSize,
    );
    this.#backend = backend;
  }

  get state() {
    return Object.freeze({
      active: this.#active !== null,
      activeBytes: this.#active?.gpuBytes ?? 0,
      activeIdentityMapBytes:
        this.#active?.pointIndices?.byteLength ?? 0,
      activeLodLevel: this.#active?.lod?.levelId ?? null,
      activePoints: this.#active?.points ?? 0,
      disposed: this.#disposed,
      mounting: this.#mounting,
      mounts: this.#mounts,
      picking: this.#picking,
      picks: this.#picks,
      unmounts: this.#unmounts,
    });
  }

  async mount({
    camera: cameraValue,
    range: rangeValue,
    signal,
    source: sourceValue,
  } = {}) {
    if (this.#disposed) {
      throw invalidState("bounded point renderer is disposed");
    }
    if (this.#mounting || this.#picking || this.#active !== null) {
      throw invalidState("bounded point renderer is already active");
    }
    const source = validatedSource(sourceValue);
    const range = validatedRange(rangeValue, this.limits);
    this.#mounting = true;
    const staging = range.bytes.slice();
    let pointIndices = range.pointIndices?.slice() ?? null;
    let pointIndicesRetained = false;
    let backendHandleId = null;
    try {
      aborted(signal);
      const sha256 = await digest(staging);
      if (sha256 !== range.sha256) {
        throw new Error(
          "point renderer range digest does not match its descriptor",
        );
      }
      const decoded = decodeBimPointRange(staging, {
        maximumPayloadBytes:
          this.limits.maximumPointPayloadBytes,
        maximumPoints: this.limits.maximumPoints,
      });
      if (decoded.payloadBytes > this.limits.maximumGpuBytes) {
        throw new RangeError(
          "point renderer upload exceeds its GPU byte limit",
        );
      }
      if (
        pointIndices !== null &&
        (
          pointIndices.length !== decoded.pointCount ||
          pointIndices.some((value) =>
            value >= range.sourcePointCount)
        )
      ) {
        throw new RangeError(
          "point renderer identity map does not cover the decoded range",
        );
      }
      const identityRange = Object.freeze({
        handleId:
          range.identityRangeHandleId ?? range.handleId,
        sha256: range.identityRangeSha256 ?? sha256,
        sourcePointCount:
          range.sourcePointCount ?? decoded.pointCount,
      });
      const lod = validatedLod(range.lod, decoded.pointCount);
      const camera = cameraValue === undefined
        ? createFitCamera3d(paddedCameraBounds(decoded.bounds), {
            aspect: 4 / 3,
          })
        : validateCamera3d(cameraValue);
      const metrics = Object.freeze({
        cpuStagingPeakBytes:
          staging.byteLength + (pointIndices?.byteLength ?? 0),
        drawCalls: 1,
        gpuBytes: decoded.payloadBytes,
        identityMapBytes: pointIndices?.byteLength ?? 0,
        pointSize: this.#pointSize,
        points: decoded.pointCount,
        rangeBytes: staging.byteLength,
      });
      const result = await this.#backend.mount(
        Object.freeze({
          contract: BIM_POINT_RENDERER_CONTRACT,
          camera,
          decoded,
          metrics,
          payload: staging.subarray(
            decoded.payload.offset,
            decoded.payload.offset + decoded.payload.byteLength,
          ),
          range: Object.freeze({
            handleId: range.handleId,
            mediaType: range.mediaType,
            sha256,
          }),
          source,
        }),
        { signal },
      );
      backendHandleId = result?.handleId ?? null;
      const backend = validateBackendMount(result, metrics);
      this.#mounts += 1;
      this.#active = {
        backendHandleId,
        gpuBytes: metrics.gpuBytes,
        identityRange,
        lod,
        pointIndices,
        points: metrics.points,
        range: Object.freeze({
          handleId: range.handleId,
          mediaType: range.mediaType,
          sha256,
        }),
        source,
      };
      pointIndicesRetained = true;
      return Object.freeze({
        schema: BIM_POINT_RENDERER_RECEIPT,
        status: "mounted",
        source,
        range: Object.freeze({
          handleId: range.handleId,
          mediaType: range.mediaType,
          sha256,
          byteLength: decoded.byteLength,
        }),
        identityRange,
        lod,
        geometry: Object.freeze({
          bounds: decoded.bounds,
          colorRange: decoded.colorRange,
          origin: decoded.origin,
          relativeBounds: decoded.relativeBounds,
        }),
        camera,
        metrics,
        backend,
        cleanup: Object.freeze({
          cpuRangeStagingReleased: true,
        }),
      });
    } catch (error) {
      if (typeof backendHandleId === "string") {
        try {
          await this.#backend.unmount(backendHandleId);
        } catch {
          // The original backend receipt failure remains authoritative.
        }
      }
      throw error;
    } finally {
      staging.fill(0);
      if (!pointIndicesRetained) {
        pointIndices?.fill(0);
        pointIndices = null;
      }
      this.#mounting = false;
    }
  }

  async pick({ x, y, signal } = {}) {
    if (this.#disposed) {
      throw invalidState("bounded point renderer is disposed");
    }
    if (this.#mounting || this.#picking) {
      throw invalidState(
        "bounded point renderer operation is in progress",
      );
    }
    if (this.#active === null) {
      throw invalidState("bounded point renderer is not mounted");
    }
    if (typeof this.#backend.pick !== "function") {
      throw new DOMException(
        "point renderer backend does not support picking",
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
        "point renderer pick coordinates must be non-negative integers",
      );
    }
    const active = this.#active;
    this.#picking = true;
    try {
      aborted(signal);
      const result = await this.#backend.pick(
        active.backendHandleId,
        { x, y },
        { signal },
      );
      const backend = validateBackendPick(result, {
        pointCount: active.points,
        x,
        y,
      });
      this.#picks += 1;
      const pointIndex = backend.hit
        ? active.pointIndices?.[backend.pointIndex] ??
          backend.pointIndex
        : null;
      const identity = backend.hit
        ? Object.freeze({
            authority: BIM_POINT_IDENTITY_AUTHORITY,
            nativeId: `point:${pointIndex}`,
            pointIndex,
            rangeHandleId: active.identityRange.handleId,
            rangeSha256: active.identityRange.sha256,
            renderedPointIndex: backend.pointIndex,
            renderedRangeHandleId: active.range.handleId,
            renderedRangeSha256: active.range.sha256,
          })
        : null;
      return Object.freeze({
        schema: BIM_POINT_RENDERER_PICK_RECEIPT,
        status: backend.hit ? "hit" : "miss",
        source: active.source,
        range: active.range,
        coordinates: Object.freeze({
          origin: "canvas-top-left",
          x,
          y,
        }),
        identity,
        worldPosition: backend.worldPosition,
        backend,
      });
    } finally {
      this.#picking = false;
    }
  }

  async #releaseActive() {
    if (this.#active === null) {
      return null;
    }
    const active = this.#active;
    const backend = validateBackendRelease(
      await this.#backend.unmount(active.backendHandleId),
      active.gpuBytes,
    );
    const releasedIdentityMapBytes =
      active.pointIndices?.byteLength ?? 0;
    active.pointIndices?.fill(0);
    this.#active = null;
    this.#unmounts += 1;
    return Object.freeze({
      schema: BIM_POINT_RENDERER_RELEASE_RECEIPT,
      status: "released",
      source: active.source,
      releasedBytes: active.gpuBytes,
      releasedIdentityMapBytes,
      releasedPoints: active.points,
      backend,
    });
  }

  async unmount() {
    if (this.#mounting || this.#picking) {
      throw invalidState("bounded point renderer operation is in progress");
    }
    return this.#releaseActive();
  }

  async dispose() {
    if (this.#disposed) {
      return false;
    }
    if (this.#mounting || this.#picking) {
      throw invalidState("bounded point renderer operation is in progress");
    }
    await this.#releaseActive();
    if (await this.#backend.dispose() !== true) {
      throw new Error("point renderer backend did not dispose");
    }
    this.#disposed = true;
    return true;
  }
}

export function createBoundedPointCloudRenderer(options) {
  return new BoundedPointCloudRenderer(options);
}

export function createHeadlessPointCloudBackend() {
  return new HeadlessPointCloudBackend();
}
