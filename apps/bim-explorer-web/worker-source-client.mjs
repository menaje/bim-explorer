export const BIM_PRODUCT_SOURCE_WORKER_REQUEST =
  "bim-explorer-product-source-worker-request/0.1";
export const BIM_PRODUCT_SOURCE_WORKER_RESPONSE =
  "bim-explorer-product-source-worker-response/0.1";

const DEFAULT_LIMITS = Object.freeze({
  maximumSourceBytes: 64 * 1024 * 1024,
  openTimeoutMs: 30_000,
  operationTimeoutMs: 10_000,
});

function invalidState(message) {
  return new DOMException(message, "InvalidStateError");
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

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive integer`);
  }
}

function validateOptions(options) {
  const value = plainRecord(
    options,
    "product source client options",
  );
  for (const field of [
    "wasmPath",
    "webIfcModuleUrl",
    "workerUrl",
  ]) {
    if (
      typeof value[field] !== "string" ||
      value[field].length === 0
    ) {
      throw new TypeError(
        `product source client ${field} is invalid`,
      );
    }
  }
  if (
    value.wasmUrl !== undefined &&
    value.wasmUrl !== null &&
    (
      typeof value.wasmUrl !== "string" ||
      value.wasmUrl.length === 0
    )
  ) {
    throw new TypeError(
      "product source client wasmUrl is invalid",
    );
  }
  const limits = {
    ...DEFAULT_LIMITS,
    ...(value.limits ?? {}),
  };
  for (const [label, limit] of Object.entries(limits)) {
    positiveInteger(limit, `product source ${label}`);
  }
  if (typeof value.workerFactory !== "function") {
    throw new TypeError(
      "product source client workerFactory is invalid",
    );
  }
  return {
    ...value,
    limits: Object.freeze(limits),
  };
}

function operationError(value) {
  const error = new Error(
    `BIM product source operation failed: ` +
      `${value?.code ?? "SOURCE_OPERATION_FAILED"}`,
  );
  error.code = value?.code ?? "SOURCE_OPERATION_FAILED";
  error.retryable = value?.retryable === true;
  return error;
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

class WorkerRangeSemanticSession {
  #client;
  #disposed = false;
  #generation;

  constructor(client, generation, descriptor) {
    this.#client = client;
    this.#generation = generation;
    this.descriptor = descriptor;
  }

  get state() {
    return Object.freeze({
      disposed: this.#disposed,
      generation: this.#generation,
    });
  }

  #call(operation, args) {
    if (this.#disposed) {
      throw invalidState("product source session is disposed");
    }
    return this.#client.operation(
      this.#generation,
      operation,
      args,
    );
  }

  readRange(handle, offset, length, options = {}) {
    aborted(options.signal);
    return this.#call("readRange", [
      handle,
      offset,
      length,
      {},
    ]).then((value) => new Uint8Array(value));
  }

  getEntity(request, options = {}) {
    aborted(options.signal);
    return this.#call("getEntity", [request, {}]);
  }

  queryTree(request, options = {}) {
    aborted(options.signal);
    return this.#call("queryTree", [request, {}]);
  }

  searchEntities(request, options = {}) {
    aborted(options.signal);
    return this.#call(
      "searchEntities",
      [request, {}],
    );
  }

  queryRelations(request, options = {}) {
    aborted(options.signal);
    return this.#call(
      "queryRelations",
      [request, {}],
    );
  }

  async dispose() {
    if (this.#disposed) {
      return false;
    }
    this.#disposed = true;
    await this.#client.release(this.#generation);
    return true;
  }
}

class WorkerLease {
  #client;
  #disposed = false;
  #generation;

  constructor(client, generation) {
    this.#client = client;
    this.#generation = generation;
  }

  get state() {
    return Object.freeze({
      disposed: this.#disposed,
      generation: this.#generation,
    });
  }

  async dispose() {
    if (this.#disposed) {
      return false;
    }
    this.#disposed = true;
    await this.#client.shutdown(this.#generation);
    return true;
  }

  terminate() {
    if (this.#disposed) {
      return false;
    }
    this.#disposed = true;
    return this.#client.terminate(this.#generation);
  }
}

export class BimProductSourceWorkerClient {
  #disposed = false;
  #generation = 0;
  #limits;
  #nextRequest = 1;
  #options;
  #pending = new Map();
  #progressListeners = new Set();
  #state = "idle";
  #worker = null;

  constructor(options) {
    this.#options = validateOptions({
      workerFactory: (url) => new Worker(url, {
        type: "module",
      }),
      ...options,
    });
    this.#limits = this.#options.limits;
  }

  get state() {
    return Object.freeze({
      disposed: this.#disposed,
      generation: this.#generation,
      pendingRequests: this.#pending.size,
      status: this.#state,
      workerActive: this.#worker !== null,
    });
  }

  onProgress(listener) {
    if (typeof listener !== "function") {
      throw new TypeError(
        "product source progress listener must be a function",
      );
    }
    this.#progressListeners.add(listener);
    return () => this.#progressListeners.delete(listener);
  }

  #assertOpen() {
    if (this.#disposed) {
      throw invalidState(
        "BIM product source client is disposed",
      );
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
      throw new TypeError(
        "product source workerFactory returned an invalid Worker",
      );
    }
    worker.addEventListener("message", (event) => {
      this.#receive(event.data);
    });
    worker.addEventListener("error", () => {
      this.#failPending(
        operationError({
          code: "SOURCE_WORKER_FAILED",
          retryable: true,
        }),
      );
      this.#state = "failed";
    });
    return worker;
  }

  #receive(message) {
    if (
      message?.schema !==
        BIM_PRODUCT_SOURCE_WORKER_RESPONSE ||
      typeof message.requestId !== "string"
    ) {
      this.#failPending(
        operationError({
          code: "SOURCE_WORKER_PROTOCOL_FAILED",
        }),
      );
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

  #failPending(error) {
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.#pending.clear();
  }

  #request(type, additions, {
    timeoutMs,
    transfer = [],
  }) {
    this.#assertOpen();
    if (this.#worker === null) {
      throw invalidState(
        "BIM product source Worker is unavailable",
      );
    }
    const requestId =
      `product-source:${this.#generation}:` +
      `${this.#nextRequest}`;
    this.#nextRequest += 1;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(requestId);
        reject(operationError({
          code: "SOURCE_OPERATION_TIMEOUT",
          retryable: type === "open",
        }));
      }, timeoutMs);
      this.#pending.set(requestId, {
        reject,
        resolve,
        timer,
      });
      this.#worker.postMessage({
        schema: BIM_PRODUCT_SOURCE_WORKER_REQUEST,
        requestId,
        type,
        ...additions,
      }, transfer);
    });
  }

  async open(bytesValue, {
    profile = "ReferenceView_V1.2",
  } = {}) {
    this.#assertOpen();
    if (!(bytesValue instanceof Uint8Array)) {
      throw new TypeError(
        "BIM product source bytes must be a Uint8Array",
      );
    }
    if (
      bytesValue.byteLength === 0 ||
      bytesValue.byteLength >
        this.#limits.maximumSourceBytes
    ) {
      throw new RangeError(
        "BIM product source exceeds its byte limit",
      );
    }
    if (this.#worker !== null) {
      this.terminate(this.#generation);
    }
    this.#generation += 1;
    this.#worker = this.#createWorker();
    this.#state = "opening";
    const bytes = Uint8Array.from(bytesValue);
    try {
      const result = await this.#request("open", {
        bytes: bytes.buffer,
        options: {
          profile,
          wasmPath: this.#options.wasmPath,
          wasmUrl: this.#options.wasmUrl ?? null,
          webIfcModuleUrl: this.#options.webIfcModuleUrl,
        },
      }, {
        timeoutMs: this.#limits.openTimeoutMs,
        transfer: [bytes.buffer],
      });
      this.#state = "ready";
      const generation = this.#generation;
      const session = new WorkerRangeSemanticSession(
        this,
        generation,
        result.descriptor,
      );
      const workerLease = new WorkerLease(
        this,
        generation,
      );
      return Object.freeze({
        report: Object.freeze({
          diagnostics: result.diagnostics,
          performance: result.performance,
          resources: result.resources,
        }),
        session,
        snapshot: result.snapshot,
        workerLease,
      });
    } catch (error) {
      this.terminate(this.#generation);
      this.#state = "failed";
      throw error;
    }
  }

  operation(generation, operation, args) {
    this.#assertOpen();
    if (
      generation !== this.#generation ||
      this.#state !== "ready"
    ) {
      throw invalidState(
        "BIM product source session is stale",
      );
    }
    return this.#request("operation", {
      args,
      operation,
    }, {
      timeoutMs: this.#limits.operationTimeoutMs,
    });
  }

  async release(generation) {
    if (
      generation !== this.#generation ||
      this.#worker === null
    ) {
      return false;
    }
    const result = await this.#request("release", {}, {
      timeoutMs: this.#limits.operationTimeoutMs,
    });
    this.#state = "released";
    return result;
  }

  async shutdown(generation) {
    if (
      generation !== this.#generation ||
      this.#worker === null
    ) {
      return false;
    }
    try {
      await this.#request("shutdown", {}, {
        timeoutMs: this.#limits.operationTimeoutMs,
      });
    } finally {
      this.#worker.terminate();
      this.#worker = null;
      this.#state = "idle";
    }
    return true;
  }

  terminate(generation = this.#generation) {
    if (
      generation !== this.#generation ||
      this.#worker === null
    ) {
      return false;
    }
    this.#worker.terminate();
    this.#worker = null;
    this.#failPending(
      operationError({
        code: "SOURCE_WORKER_TERMINATED",
        retryable: true,
      }),
    );
    this.#state = "cancelled";
    return true;
  }

  async dispose() {
    if (this.#disposed) {
      return false;
    }
    if (this.#worker !== null) {
      try {
        await this.shutdown(this.#generation);
      } catch {
        this.terminate(this.#generation);
      }
    }
    this.#disposed = true;
    this.#state = "disposed";
    this.#progressListeners.clear();
    return true;
  }
}

export function createBimProductSourceWorkerClient(options) {
  return new BimProductSourceWorkerClient(options);
}
