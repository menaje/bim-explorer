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
  BIM_POINT_RANGE_MEDIA_TYPE,
  BIM_POINT_RANGE_MAXIMUM_BYTES,
} from "../../packages/bim-renderer-3d/src/point-cloud.mjs";

export const POINT_SOURCE_WORKER_REQUEST =
  "bim-explorer-point-source-worker-request/0.1";
export const POINT_SOURCE_WORKER_RESPONSE =
  "bim-explorer-point-source-worker-response/0.1";

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

function validateResult(value, expected) {
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
    artifact.model?.points <= 0 ||
    artifact.model.points > maximumPoints ||
    artifact.model.ranges !== 1 ||
    artifact.resources?.inputBytes !== expected.byteLength ||
    artifact.resources.pointRangeBytes !== bytes.byteLength ||
    artifact.resources.pointRangePayloadBytes !==
      bytes.byteLength - 48 ||
    artifact.cleanup?.cpuProjectionBuffersReleased !== true ||
    artifact.cleanup.decoderReleased !== true ||
    artifact.cleanup.wasmAllocationsReleased !== true ||
    result.cleanup?.pointRangeTransferred !== true ||
    result.cleanup.sourceBufferCleared !== true ||
    result.cleanup.workerRetainedUntilClientReceipt !== true ||
    typeof result.performance?.totalMs !== "number" ||
    !Number.isFinite(result.performance.totalMs) ||
    result.performance.totalMs < 0
  ) {
    bytes.fill(0);
    throw new Error("point source Worker result is invalid");
  }
  return Object.freeze({
    artifact: Object.freeze({
      ...artifact,
      range: Object.freeze({ ...range, bytes }),
    }),
    cleanup: Object.freeze({
      ...result.cleanup,
      workerTerminatedAfterTransfer: true,
    }),
    performance: Object.freeze({ ...result.performance }),
  });
}

export class PointSourceWorkerClient {
  #disposed = false;
  #generation = 0;
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

  async open(bytesValue, { format } = {}) {
    this.#assertOpen();
    if (!(bytesValue instanceof Uint8Array)) {
      throw new TypeError("point source bytes must be a Uint8Array");
    }
    if (!FORMATS.has(format)) {
      throw new TypeError("point source format is unsupported");
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
    this.#worker = this.#createWorker();
    this.#state = "opening";
    const bytes = Uint8Array.from(bytesValue);
    const requestId =
      `point-source:${this.#generation}:${this.#nextRequest}`;
    this.#nextRequest += 1;
    try {
      const value = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this.#pending.delete(requestId);
          reject(operationError({
            code: "POINT_SOURCE_OPEN_TIMEOUT",
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
          type: "open",
          bytes: bytes.buffer,
          options: {
            format,
            lazPerfScriptUrl:
              this.#options.lazPerfScriptUrl,
            lazPerfWasmUrl:
              this.#options.lazPerfWasmUrl,
          },
        }, [bytes.buffer]);
      });
      this.#terminateWorker();
      const result = validateResult(value, {
        byteLength: bytesValue.byteLength,
        format,
      });
      this.#state = "ready";
      return result;
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
      this.terminate();
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
