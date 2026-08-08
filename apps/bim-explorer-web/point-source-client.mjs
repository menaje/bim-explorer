import {
  LAS_LAZ_MAXIMUM_SOURCE_BYTES,
  LAS_LAZ_POINT_SOURCE_CONTRACT,
} from "../../packages/las-laz-point-source/src/index.mjs";
import {
  E57_MULTIPLE_SCAN_MAXIMUM_POINTS,
  E57_MULTIPLE_SCAN_MAXIMUM_SOURCE_BYTES,
  E57_POINT_SOURCE_CONTRACT,
} from "../../packages/e57-point-source/src/index.mjs";
import {
  BIM_POINT_HIERARCHY_CONTRACT,
  BIM_POINT_LOD_RANGE_RECEIPT,
} from "../../packages/bim-renderer-3d/src/point-cloud-lod.mjs";
import {
  BIM_POINT_RANGE_MEDIA_TYPE,
  BIM_POINT_RANGE_MAXIMUM_BYTES,
} from "../../packages/bim-renderer-3d/src/point-cloud.mjs";

export const POINT_SOURCE_WORKER_REQUEST =
  "bim-explorer-point-source-worker-request/0.2";
export const POINT_SOURCE_WORKER_RESPONSE =
  "bim-explorer-point-source-worker-response/0.2";

const DEFAULT_LIMITS = Object.freeze({
  maximumSourceBytes: Math.max(
    LAS_LAZ_MAXIMUM_SOURCE_BYTES,
    E57_MULTIPLE_SCAN_MAXIMUM_SOURCE_BYTES,
  ),
  openTimeoutMs: 15_000,
});
const FORMATS = new Set(["e57", "las", "laz"]);
const SOURCE_LIMITS = Object.freeze({
  e57: E57_MULTIPLE_SCAN_MAXIMUM_SOURCE_BYTES,
  las: LAS_LAZ_MAXIMUM_SOURCE_BYTES,
  laz: LAS_LAZ_MAXIMUM_SOURCE_BYTES,
});
const CONTRACTS = new Map([
  ["e57", E57_POINT_SOURCE_CONTRACT],
  ["las", LAS_LAZ_POINT_SOURCE_CONTRACT],
  ["laz", LAS_LAZ_POINT_SOURCE_CONTRACT],
]);
const SHA256 = /^[0-9a-f]{64}$/u;
const FINGERPRINT = /^sha256:[0-9a-f]{64}$/u;

function invalidState(message) {
  return new DOMException(message, "InvalidStateError");
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
}

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

function pathFree(value, label = "point source Worker response") {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      pathFree(item, `${label}[${index}]`));
    return;
  }
  if (
    value !== null &&
    typeof value === "object" &&
    !ArrayBuffer.isView(value) &&
    !(value instanceof ArrayBuffer)
  ) {
    for (const [key, item] of Object.entries(value)) {
      if (key.toLocaleLowerCase().includes("path")) {
        throw new Error(`${label}.${key} exposes a path`);
      }
      pathFree(item, `${label}.${key}`);
    }
  }
}

function operationError(value) {
  const error = new Error(
    `BIM point source operation failed: ` +
      `${value?.code ?? "POINT_SOURCE_OPERATION_FAILED"}`,
  );
  error.code = value?.code ?? "POINT_SOURCE_OPERATION_FAILED";
  error.retryable = value?.retryable === true;
  return error;
}

function validateOptions(options) {
  const value = plainRecord(options, "point source client options");
  for (const field of [
    "lazPerfScriptUrl",
    "lazPerfWasmUrl",
    "workerUrl",
  ]) {
    if (
      typeof value[field] !== "string" ||
      value[field].length === 0
    ) {
      throw new TypeError(`point source client ${field} is invalid`);
    }
  }
  if (typeof value.workerFactory !== "function") {
    throw new TypeError("point source client workerFactory is invalid");
  }
  const limits = {
    ...DEFAULT_LIMITS,
    ...(value.limits ?? {}),
  };
  positiveInteger(
    limits.maximumSourceBytes,
    "point source maximumSourceBytes",
  );
  positiveInteger(limits.openTimeoutMs, "point source openTimeoutMs");
  if (
    limits.maximumSourceBytes >
      E57_MULTIPLE_SCAN_MAXIMUM_SOURCE_BYTES
  ) {
    throw new RangeError("point source byte limit exceeds its profile");
  }
  return Object.freeze({
    ...value,
    limits: Object.freeze(limits),
  });
}

function rangeBytes(value) {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  throw new TypeError("point source range bytes are invalid");
}

function pointIndices(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Uint32Array) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint32Array(value);
  }
  throw new TypeError("point source identity map is invalid");
}

function validateHierarchy(artifact, range, expected) {
  const hierarchy = plainRecord(
    artifact.hierarchy,
    "point source hierarchy",
  );
  const rootRange = plainRecord(
    artifact.rootRange,
    "point source root range",
  );
  const levels = hierarchy.levels;
  const chunks = hierarchy.chunks;
  const lod = plainRecord(range.lod, "point source initial LOD");
  const indices = pointIndices(range.pointIndices);
  if (
    hierarchy.contract !== BIM_POINT_HIERARCHY_CONTRACT ||
    typeof hierarchy.hierarchyId !== "string" ||
    hierarchy.hierarchyId.length === 0 ||
    !SHA256.test(hierarchy.digest ?? "") ||
    !Array.isArray(levels) ||
    levels.length === 0 ||
    levels.length > 9 ||
    !Array.isArray(chunks) ||
    chunks.length === 0 ||
    chunks.length > 65_536 ||
    hierarchy.sourcePointCount !== artifact.model?.points ||
    hierarchy.source?.fingerprint !== artifact.source?.fingerprint ||
    hierarchy.source?.revisionId !== artifact.source?.revisionId ||
    hierarchy.source?.semanticAuthority !== false ||
    hierarchy.identity?.authority !== "derived-point-range-order" ||
    hierarchy.identity?.rangeHandleId !== rootRange.handleId ||
    hierarchy.identity?.rangeSha256 !== rootRange.sha256 ||
    hierarchy.identity?.scope !==
      "source-revision-and-root-range-digest" ||
    rootRange.mediaType !== BIM_POINT_RANGE_MEDIA_TYPE ||
    !SHA256.test(rootRange.sha256 ?? "") ||
    !Number.isSafeInteger(rootRange.byteLength) ||
    rootRange.byteLength <= 48 ||
    rootRange.byteLength > expected.maximumRangeBytes ||
    hierarchy.initialLevelId !== levels[0]?.id ||
    levels.some((level, index) =>
      typeof level?.id !== "string" ||
      level.id !== `lod:${index}` ||
      level.index !== index ||
      !Number.isSafeInteger(level.pointCount) ||
      level.pointCount <= 0 ||
      level.pointCount > artifact.model.points ||
      !Number.isSafeInteger(level.rangeBytes) ||
      level.rangeBytes !== 48 + level.pointCount * 16 ||
      !Number.isSafeInteger(level.stride) ||
      level.stride <= 0 ||
      typeof level.fullDetail !== "boolean" ||
      (index > 0 && level.pointCount <= levels[index - 1].pointCount)) ||
    chunks.some((chunk) =>
      typeof chunk?.id !== "string" ||
      chunk.id.length === 0 ||
      !Number.isSafeInteger(chunk.pointCount) ||
      chunk.pointCount <= 0) ||
    lod.hierarchyId !== hierarchy.hierarchyId ||
    lod.levelId !== hierarchy.initialLevelId ||
    lod.levelIndex !== 0 ||
    lod.pointCount !== levels[0].pointCount ||
    lod.chunkCount !== chunks.length ||
    !SHA256.test(lod.selectionSha256 ?? "") ||
    range.identityRangeHandleId !== rootRange.handleId ||
    range.identityRangeSha256 !== rootRange.sha256 ||
    range.sourcePointCount !== artifact.model.points ||
    (
      lod.fullDetail
        ? indices !== null
        : indices?.length !== lod.pointCount
    ) ||
    resultWorkerRetention(expected.resultCleanup) !==
      (levels.length > 1)
  ) {
    indices?.fill(0);
    throw new Error("point source hierarchy is invalid");
  }
  return Object.freeze({ hierarchy, indices, rootRange });
}

function resultWorkerRetention(cleanup) {
  return cleanup?.workerRetainedForLod === true;
}

function validateResult(value, expected, {
  workerTerminatedAfterTransfer,
}) {
  const result = plainRecord(value, "point source Worker result");
  pathFree(result);
  const artifact = plainRecord(
    result.artifact,
    "point source Worker artifact",
  );
  const source = plainRecord(
    artifact.source,
    "point source Worker source",
  );
  const range = plainRecord(
    artifact.range,
    "point source Worker range",
  );
  const bytes = rangeBytes(range.bytes);
  const hierarchical = artifact.hierarchy !== undefined;
  const multipleScanE57 =
    expected.format === "e57" &&
    typeof source.pointFormat === "string" &&
    source.pointFormat.endsWith("-multiple-scan");
  const maximumPoints = multipleScanE57
    ? E57_MULTIPLE_SCAN_MAXIMUM_POINTS
    : 500_000;
  const maximumRangeBytes = multipleScanE57
    ? BIM_POINT_RANGE_MAXIMUM_BYTES
    : 8 * 1024 * 1024;
  const identityMap = pointIndices(range.pointIndices);
  const pointFormatValid =
    (
      typeof source.pointFormat === "string" &&
      source.pointFormat.length > 0
    ) ||
    (
      Number.isSafeInteger(source.pointFormat) &&
      source.pointFormat >= 0
    );
  if (
    artifact.schema !== CONTRACTS.get(expected.format) ||
    source.format !== expected.format ||
    source.byteLength !== expected.byteLength ||
    !FINGERPRINT.test(source.fingerprint ?? "") ||
    typeof source.revisionId !== "string" ||
    source.revisionId.length === 0 ||
    source.semanticAuthority !== false ||
    source.coordinateReferenceStatus !== "unqualified" ||
    !pointFormatValid ||
    source.sourceRole !== "derived-or-reference-points" ||
    range.mediaType !== BIM_POINT_RANGE_MEDIA_TYPE ||
    !SHA256.test(range.sha256 ?? "") ||
    bytes.byteLength !== range.byteLength ||
    bytes.byteLength <= 48 ||
    bytes.byteLength > maximumRangeBytes ||
    hierarchical !== expected.hierarchy ||
    artifact.model?.points <= 0 ||
    artifact.model.points > maximumPoints ||
    artifact.model.ranges !== 1 ||
    artifact.resources?.inputBytes !== expected.byteLength ||
    artifact.resources.pointRangeBytes !== (
      hierarchical
        ? artifact.rootRange?.byteLength
        : bytes.byteLength
    ) ||
    artifact.resources.pointRangePayloadBytes !==
      artifact.resources.pointRangeBytes - 48 ||
    artifact.cleanup?.cpuProjectionBuffersReleased !== true ||
    artifact.cleanup.decoderReleased !== true ||
    artifact.cleanup.wasmAllocationsReleased !== true ||
    result.cleanup?.pointRangeTransferred !== true ||
    (
      hierarchical
        ? result.cleanup.hierarchyContract !==
          BIM_POINT_HIERARCHY_CONTRACT
        : ![undefined, null].includes(
            result.cleanup.hierarchyContract,
          )
    ) ||
    (
      !hierarchical &&
      ![undefined, false].includes(
        result.cleanup.workerRetainedForLod,
      )
    ) ||
    result.cleanup.sourceBufferCleared !== true ||
    result.cleanup.workerRetainedUntilClientReceipt !== true ||
    typeof result.performance?.totalMs !== "number" ||
    !Number.isFinite(result.performance.totalMs) ||
    result.performance.totalMs < 0
  ) {
    bytes.fill(0);
    identityMap?.fill(0);
    throw new Error("point source Worker result is invalid");
  }
  const hierarchy = hierarchical
    ? validateHierarchy(artifact, {
        ...range,
        pointIndices: identityMap,
      }, {
        ...expected,
        maximumRangeBytes,
        resultCleanup: result.cleanup,
      })
    : null;
  return Object.freeze({
    artifact: Object.freeze({
      ...artifact,
      ...(hierarchy === null
        ? {}
        : {
            hierarchy: Object.freeze({ ...hierarchy.hierarchy }),
            rootRange: Object.freeze({ ...hierarchy.rootRange }),
          }),
      range: Object.freeze({
        ...range,
        bytes,
        pointIndices: identityMap,
      }),
    }),
    cleanup: Object.freeze({
      ...result.cleanup,
      workerTerminatedAfterTransfer,
    }),
    performance: Object.freeze({ ...result.performance }),
  });
}

function validateLodResult(value, hierarchy, chunkIds) {
  const result = plainRecord(value, "point LOD Worker result");
  pathFree(result);
  const range = plainRecord(result.range, "point LOD range");
  const receipt = plainRecord(result.receipt, "point LOD receipt");
  const bytes = rangeBytes(range.bytes);
  const indices = pointIndices(range.pointIndices);
  const level = hierarchy.levels.find((item) =>
    item.id === range.lod?.levelId);
  const selectedChunks = chunkIds === undefined
    ? hierarchy.chunks
    : chunkIds.map((id) =>
        hierarchy.chunks.find((chunk) => chunk.id === id));
  const expectedPoints = level === undefined ||
    selectedChunks.some((chunk) => chunk === undefined)
      ? null
      : selectedChunks.reduce(
          (total, chunk) =>
            total + Math.ceil(chunk.pointCount / level.stride),
          0,
        );
  const rootPassThrough = level?.fullDetail === true &&
    selectedChunks.length === hierarchy.chunks.length &&
    selectedChunks.every((chunk, index) =>
      chunk === hierarchy.chunks[index]);
  if (
    result.hierarchyId !== hierarchy.hierarchyId ||
    level === undefined ||
    receipt.schema !== BIM_POINT_LOD_RANGE_RECEIPT ||
    receipt.level?.hierarchyId !== hierarchy.hierarchyId ||
    receipt.level.levelId !== level.id ||
    receipt.level.pointCount !== expectedPoints ||
    receipt.rangeBytes !== bytes.byteLength ||
    receipt.rootRangeSha256 !== hierarchy.identity.rangeSha256 ||
    range.mediaType !== BIM_POINT_RANGE_MEDIA_TYPE ||
    range.byteLength !== bytes.byteLength ||
    range.sha256 === undefined ||
    !SHA256.test(range.sha256) ||
    range.identityRangeHandleId !== hierarchy.identity.rangeHandleId ||
    range.identityRangeSha256 !== hierarchy.identity.rangeSha256 ||
    range.sourcePointCount !== hierarchy.sourcePointCount ||
    range.lod?.chunkCount !== selectedChunks.length ||
    range.lod?.pointCount !== expectedPoints ||
    (
      rootPassThrough
        ? indices !== null || range.sha256 !== hierarchy.identity.rangeSha256
        : indices?.length !== expectedPoints
    ) ||
    receipt.identityMapBytes !== (indices?.byteLength ?? 0)
  ) {
    bytes.fill(0);
    indices?.fill(0);
    throw new Error("point LOD Worker result is invalid");
  }
  return Object.freeze({
    range: Object.freeze({
      ...range,
      bytes,
      pointIndices: indices,
    }),
    receipt: Object.freeze({ ...receipt }),
  });
}

function validateLodRelease(value, hierarchyId) {
  const cleanup = plainRecord(
    value?.cleanup,
    "point LOD Worker cleanup",
  );
  if (
    cleanup.disposed !== true ||
    cleanup.hierarchyId !== hierarchyId ||
    cleanup.indexBytes !== 0 ||
    cleanup.retainedBytes !== 0 ||
    cleanup.rootRangeBytes !== 0
  ) {
    throw new Error("point LOD Worker cleanup is invalid");
  }
  return Object.freeze({ ...cleanup });
}

export class PointSourceWorkerClient {
  #disposed = false;
  #generation = 0;
  #hierarchy = null;
  #hierarchyCleanup = null;
  #lodReads = 0;
  #nextRequest = 1;
  #options;
  #pending = new Map();
  #progressListeners = new Set();
  #state = "idle";
  #terminations = 0;
  #worker = null;

  constructor(options) {
    this.#options = validateOptions({
      workerFactory: (url) => new Worker(url, {
        name: "bim-explorer-point-source",
      }),
      ...options,
    });
  }

  get state() {
    return Object.freeze({
      disposed: this.#disposed,
      generation: this.#generation,
      hierarchyActive: this.#hierarchy !== null,
      hierarchyCleanup: this.#hierarchyCleanup,
      lodReads: this.#lodReads,
      pendingRequests: this.#pending.size,
      status: this.#state,
      terminations: this.#terminations,
      workerActive: this.#worker !== null,
    });
  }

  onProgress(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("point source progress listener is invalid");
    }
    this.#progressListeners.add(listener);
    return () => this.#progressListeners.delete(listener);
  }

  #assertOpen() {
    if (this.#disposed) {
      throw invalidState("point source client is disposed");
    }
  }

  #failPending(error) {
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.#pending.clear();
  }

  #terminateWorker() {
    if (this.#worker === null) {
      return false;
    }
    this.#worker.terminate();
    this.#worker = null;
    this.#hierarchy = null;
    this.#terminations += 1;
    return true;
  }

  #receive(message) {
    if (
      message?.schema !== POINT_SOURCE_WORKER_RESPONSE ||
      typeof message.requestId !== "string"
    ) {
      this.#failPending(operationError({
        code: "POINT_SOURCE_WORKER_PROTOCOL_FAILED",
      }));
      this.#terminateWorker();
      this.#state = "failed";
      return;
    }
    if (message.type === "progress") {
      for (const listener of this.#progressListeners) {
        listener(Object.freeze({
          ...message.value,
          generation: this.#generation,
        }));
      }
      return;
    }
    const pending = this.#pending.get(message.requestId);
    if (pending === undefined) {
      return;
    }
    this.#pending.delete(message.requestId);
    clearTimeout(pending.timer);
    if (message.type === "result") {
      pending.resolve(message.value);
    } else {
      pending.reject(operationError(message.value));
    }
  }

  #createWorker() {
    const worker = this.#options.workerFactory(
      this.#options.workerUrl,
    );
    if (
      typeof worker?.postMessage !== "function" ||
      typeof worker?.terminate !== "function" ||
      typeof worker?.addEventListener !== "function"
    ) {
      throw new TypeError("point source workerFactory is invalid");
    }
    worker.addEventListener("message", (event) =>
      this.#receive(event.data));
    worker.addEventListener("error", () => {
      this.#failPending(operationError({
        code: "POINT_SOURCE_WORKER_FAILED",
        retryable: true,
      }));
      this.#terminateWorker();
      this.#state = "failed";
    });
    return worker;
  }

  async #request(type, message, transfer = []) {
    const requestId =
      `point-source:${this.#generation}:${this.#nextRequest}`;
    this.#nextRequest += 1;
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(requestId);
        reject(operationError({
          code: type === "open"
            ? "POINT_SOURCE_OPEN_TIMEOUT"
            : "POINT_SOURCE_LOD_TIMEOUT",
          retryable: true,
        }));
      }, this.#options.limits.openTimeoutMs);
      this.#pending.set(requestId, {
        reject,
        resolve,
        timer,
      });
      this.#worker.postMessage({
        schema: POINT_SOURCE_WORKER_REQUEST,
        requestId,
        type,
        ...message,
      }, transfer);
    });
  }

  async open(bytesValue, {
    format,
    hierarchy = false,
  } = {}) {
    this.#assertOpen();
    if (!(bytesValue instanceof Uint8Array)) {
      throw new TypeError("point source bytes must be a Uint8Array");
    }
    if (!FORMATS.has(format)) {
      throw new TypeError("point source format is unsupported");
    }
    if (typeof hierarchy !== "boolean") {
      throw new TypeError("point source hierarchy option is invalid");
    }
    if (
      bytesValue.byteLength === 0 ||
      bytesValue.byteLength >
        this.#options.limits.maximumSourceBytes ||
      bytesValue.byteLength > SOURCE_LIMITS[format]
    ) {
      throw new RangeError("point source exceeds its byte limit");
    }
    if (this.#worker !== null) {
      this.terminate();
    }
    this.#generation += 1;
    this.#hierarchyCleanup = null;
    this.#lodReads = 0;
    this.#worker = this.#createWorker();
    this.#state = "opening";
    const bytes = Uint8Array.from(bytesValue);
    try {
      const value = await this.#request("open", {
        bytes: bytes.buffer,
        options: {
          format,
          hierarchy,
          lazPerfScriptUrl:
            this.#options.lazPerfScriptUrl,
          lazPerfWasmUrl:
            this.#options.lazPerfWasmUrl,
        },
      }, [bytes.buffer]);
      const retained =
        value?.cleanup?.workerRetainedForLod === true;
      if (!retained) {
        this.#terminateWorker();
      }
      const result = validateResult(value, {
        byteLength: bytesValue.byteLength,
        format,
        hierarchy,
      }, {
        workerTerminatedAfterTransfer: !retained,
      });
      this.#hierarchy = retained
        ? result.artifact.hierarchy
        : null;
      this.#state = "ready";
      return result;
    } catch (error) {
      this.#terminateWorker();
      this.#state = "failed";
      throw error;
    }
  }

  async readLod(levelId, { chunkIds } = {}) {
    this.#assertOpen();
    if (
      this.#worker === null ||
      this.#hierarchy === null ||
      this.#state !== "ready"
    ) {
      throw invalidState("point source hierarchy is not active");
    }
    if (
      typeof levelId !== "string" ||
      !this.#hierarchy.levels.some((level) => level.id === levelId)
    ) {
      throw new RangeError("point source LOD level is unavailable");
    }
    if (
      chunkIds !== undefined &&
      (
        !Array.isArray(chunkIds) ||
        chunkIds.length === 0 ||
        new Set(chunkIds).size !== chunkIds.length ||
        chunkIds.some((id) =>
          typeof id !== "string" ||
          !this.#hierarchy.chunks.some((chunk) => chunk.id === id))
      )
    ) {
      throw new TypeError("point source LOD chunkIds are invalid");
    }
    this.#state = "reading-lod";
    try {
      const value = await this.#request("read-lod", {
        options: {
          ...(chunkIds === undefined ? {} : { chunkIds }),
          levelId,
        },
      });
      const result = validateLodResult(
        value,
        this.#hierarchy,
        chunkIds,
      );
      this.#lodReads += 1;
      this.#state = "ready";
      return result;
    } catch (error) {
      this.#terminateWorker();
      this.#state = "failed";
      throw error;
    }
  }

  async releaseHierarchy() {
    this.#assertOpen();
    if (this.#hierarchy === null || this.#worker === null) {
      return null;
    }
    if (this.#state !== "ready") {
      throw invalidState("point source operation is in progress");
    }
    const hierarchyId = this.#hierarchy.hierarchyId;
    this.#state = "releasing-lod";
    try {
      const value = await this.#request("dispose-lod", {
        options: {},
      });
      const cleanup = validateLodRelease(value, hierarchyId);
      this.#hierarchyCleanup = cleanup;
      this.#terminateWorker();
      this.#state = "ready";
      return cleanup;
    } catch (error) {
      this.#terminateWorker();
      this.#state = "failed";
      throw error;
    }
  }

  terminate() {
    if (!this.#terminateWorker()) {
      return false;
    }
    this.#failPending(operationError({
      code: "POINT_SOURCE_WORKER_TERMINATED",
      retryable: true,
    }));
    this.#state = "cancelled";
    return true;
  }

  async dispose() {
    if (this.#disposed) {
      return false;
    }
    if (this.#worker !== null) {
      if (this.#hierarchy !== null && this.#state === "ready") {
        await this.releaseHierarchy();
      } else {
        this.terminate();
      }
    }
    this.#disposed = true;
    this.#state = "disposed";
    this.#progressListeners.clear();
    return true;
  }
}

export function createPointSourceWorkerClient(options) {
  return new PointSourceWorkerClient(options);
}

export const LasLazPointSourceWorkerClient =
  PointSourceWorkerClient;

export function createLasLazPointSourceWorkerClient(options) {
  return new PointSourceWorkerClient(options);
}
