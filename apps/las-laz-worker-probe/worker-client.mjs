export const LAZ_WORKER_REQUEST_SCHEMA =
  "bim-explorer-laz-worker-request/0.1";
export const LAZ_WORKER_RESULT_SCHEMA =
  "bim-explorer-laz-worker-result/0.1";
export const LAZ_WORKER_PROGRESS_SCHEMA =
  "bim-explorer-laz-worker-progress/0.1";
export const LAZ_WORKER_PHASES = Object.freeze([
  "source-admitted",
  "decoder-initialized",
  "decode-call-starting",
  "decode-complete",
]);

export const MAXIMUM_LAZ_SOURCE_BYTES = 8 * 1024 * 1024;
export const MAXIMUM_LAZ_DECODED_POINT_BYTES = 64 * 1024 * 1024;

const FAILURE_PHASES = new Set([
  "request-validation",
  "source-envelope",
  "decoder-initialization",
  "point-decode",
]);
const SHA256 = /^[0-9a-f]{64}$/u;
const SOURCE_ID = /^[a-z0-9][a-z0-9-]+$/u;

export class LazWorkerError extends Error {
  constructor(message, receipt) {
    super(message);
    this.name = "LazWorkerError";
    this.code = "BIM_EXPLORER_LAZ_WORKER_FAILED";
    this.receipt = Object.freeze(receipt);
  }
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
}

function nonNegativeNumber(value, label) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new TypeError(`${label} must be a non-negative number`);
  }
}

function pathFree(value, label = "LAZ Worker report") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      pathFree(item, `${label}[${index}]`);
    });
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (key.toLowerCase().includes("path")) {
        throw new Error(`${label}.${key} must not expose a path`);
      }
      pathFree(item, `${label}.${key}`);
    }
  }
}

function validateSource(source, expected) {
  if (
    source?.id !== expected.sourceId ||
    source.byteLength !== expected.byteLength ||
    !SHA256.test(source.sha256 ?? "") ||
    source.format !== "laz"
  ) {
    throw new Error("LAZ Worker source identity mismatch");
  }
}

function validateCleanup(cleanup) {
  if (
    cleanup?.decoderReleased !== true ||
    cleanup.wasmAllocationsReleased !== true ||
    cleanup.sourceBufferCleared !== true
  ) {
    throw new Error("LAZ Worker cleanup is incomplete");
  }
}

function validateResources(resources, expected) {
  const heap = resources?.wasmHeapCapacityBytes;
  if (
    resources?.inputBytes !== expected.byteLength ||
    !Number.isSafeInteger(resources.decodedPointBytes) ||
    resources.decodedPointBytes <= 0 ||
    resources.decodedPointBytes > MAXIMUM_LAZ_DECODED_POINT_BYTES ||
    !Number.isSafeInteger(heap?.afterInitialization) ||
    heap.afterInitialization <= 0 ||
    !Number.isSafeInteger(heap.afterDecode) ||
    heap.afterDecode < heap.afterInitialization ||
    heap.peakObserved !== Math.max(
      heap.afterInitialization,
      heap.afterDecode,
    )
  ) {
    throw new Error("LAZ Worker resource observation is invalid");
  }
}

export function validateLazWorkerReport(value, expected) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.schema !== LAZ_WORKER_RESULT_SCHEMA ||
    value.requestId !== expected.requestId ||
    value.status !== "passed"
  ) {
    throw new Error("LAZ Worker returned an unsupported report");
  }
  pathFree(value);
  if (
    value.decoder?.id !== "laz-perf" ||
    value.decoder.version !== "0.0.6" ||
    value.decoder.backend !== "browser-wasm-worker-qualification" ||
    value.decoder.license !== "Apache-2.0" ||
    value.header?.formatVersion !== "1.2" ||
    value.header.pointFormat !== 3 ||
    value.header.pointRecordLength !== 34 ||
    value.header.pointRecords !== 10_201 ||
    value.profile?.pointRecords !== 10_201 ||
    !SHA256.test(value.profile.pointRecordSha256 ?? "") ||
    !Array.isArray(value.profile.decodedBounds?.min) ||
    !Array.isArray(value.profile.decodedBounds?.max) ||
    !Array.isArray(value.profile.colorRange?.min) ||
    !Array.isArray(value.profile.colorRange?.max) ||
    !Array.isArray(value.diagnostics) ||
    value.diagnostics.length !== 0
  ) {
    throw new Error("LAZ Worker decoded profile is invalid");
  }
  validateSource(value.source, expected);
  validateResources(value.resources, expected);
  validateCleanup(value.cleanup);
  for (const [label, measurement] of Object.entries(
    value.performance ?? {},
  )) {
    nonNegativeNumber(measurement, `performance.${label}`);
  }
  return value;
}

function validateProgress(value, requestId, previousPhase) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.schema !== LAZ_WORKER_PROGRESS_SCHEMA ||
    value.requestId !== requestId ||
    value.status !== "progress" ||
    JSON.stringify(Object.keys(value).sort()) !==
      JSON.stringify([
        "phase",
        "requestId",
        "schema",
        "status",
      ])
  ) {
    throw new Error("LAZ Worker returned invalid progress");
  }
  const previousIndex = previousPhase === null
    ? -1
    : LAZ_WORKER_PHASES.indexOf(previousPhase);
  if (value.phase !== LAZ_WORKER_PHASES[previousIndex + 1]) {
    throw new Error("LAZ Worker progress is out of order");
  }
  return value.phase;
}

function validateCancellationReport(value, expected, lastPhase) {
  if (
    value?.schema !== LAZ_WORKER_RESULT_SCHEMA ||
    value.requestId !== expected.requestId ||
    value.status !== "cancelled" ||
    value.phase !== lastPhase ||
    !LAZ_WORKER_PHASES.includes(lastPhase) ||
    !Array.isArray(value.diagnostics) ||
    value.diagnostics.length !== 0
  ) {
    throw new Error("LAZ Worker returned invalid cancellation");
  }
  pathFree(value);
  validateSource(value.source, expected);
  validateCleanup(value.cleanup);
  return value;
}

function validateFailureReport(value, expected) {
  if (
    value?.schema !== LAZ_WORKER_RESULT_SCHEMA ||
    value.requestId !== expected.requestId ||
    value.status !== "failed" ||
    value.failure?.code !== "BROWSER_LAZ_INPUT_REJECTED" ||
    !FAILURE_PHASES.has(value.failure.phase) ||
    JSON.stringify(value.diagnostics) !==
      JSON.stringify([{ code: "BROWSER_LAZ_INPUT_REJECTED" }])
  ) {
    throw new Error("LAZ Worker returned invalid rejection");
  }
  pathFree(value);
  validateSource(value.source, expected);
  validateCleanup(value.cleanup);
  return value;
}

function defaultWorkerFactory() {
  return new Worker(new URL("./laz-worker.js", import.meta.url), {
    name: "bim-explorer-laz-qualification",
  });
}

function receipt(outcome, started, overrides = {}) {
  const value = {
    outcome,
    cancelled: overrides.cancelled ?? false,
    cooperativeCancellation:
      overrides.cooperativeCancellation ?? false,
    timedOut: overrides.timedOut ?? false,
    lastPhase: overrides.lastPhase ?? null,
    workerTerminationRequested:
      overrides.workerTerminationRequested ?? false,
    explicitCleanup: overrides.explicitCleanup ?? false,
    sourceTransferred: overrides.sourceTransferred ?? false,
    wallClockMs: performance.now() - started,
  };
  if (
    typeof overrides.cancellationWaitMs === "number" &&
    Number.isFinite(overrides.cancellationWaitMs) &&
    overrides.cancellationWaitMs >= 0
  ) {
    value.cancellationWaitMs = overrides.cancellationWaitMs;
  }
  if (overrides.cleanup !== undefined) {
    value.cleanup = overrides.cleanup;
  }
  if (overrides.rejection !== undefined) {
    value.rejection = overrides.rejection;
  }
  return value;
}

function validateOptions(options) {
  positiveInteger(options.timeoutMs, "timeoutMs");
  positiveInteger(
    options.cancellationGraceMs,
    "cancellationGraceMs",
  );
  positiveInteger(
    options.qualificationDecodePasses,
    "qualificationDecodePasses",
  );
  if (options.qualificationDecodePasses > 256) {
    throw new RangeError(
      "qualificationDecodePasses exceeds its bound",
    );
  }
  if (
    options.qualificationStallAtPhase !== null &&
    !LAZ_WORKER_PHASES.includes(
      options.qualificationStallAtPhase,
    )
  ) {
    throw new TypeError("qualificationStallAtPhase is invalid");
  }
  if (!SOURCE_ID.test(options.sourceId)) {
    throw new TypeError("sourceId is invalid");
  }
  if (
    options.onProgress !== undefined &&
    typeof options.onProgress !== "function"
  ) {
    throw new TypeError("onProgress must be a function");
  }
  if (typeof options.workerFactory !== "function") {
    throw new TypeError("workerFactory must be a function");
  }
}

export async function decodeLazInBrowserWorker(
  sourceBytes,
  {
    cancellationGraceMs = 50,
    onProgress,
    qualificationDecodePasses = 1,
    qualificationStallAtPhase = null,
    signal,
    sourceId = "public-laz",
    timeoutMs = 10_000,
    workerFactory = defaultWorkerFactory,
  } = {},
) {
  if (
    !(sourceBytes instanceof ArrayBuffer) ||
    sourceBytes.byteLength === 0 ||
    sourceBytes.byteLength > MAXIMUM_LAZ_SOURCE_BYTES
  ) {
    throw new RangeError(
      "sourceBytes must be a bounded non-empty ArrayBuffer",
    );
  }
  const options = {
    cancellationGraceMs,
    onProgress,
    qualificationDecodePasses,
    qualificationStallAtPhase,
    sourceId,
    timeoutMs,
    workerFactory,
  };
  validateOptions(options);
  const started = performance.now();
  if (signal?.aborted) {
    throw new LazWorkerError(
      "Browser LAZ Worker cancelled",
      receipt("cancelled-before-start", started, {
        cancelled: true,
      }),
    );
  }

  let worker;
  try {
    worker = workerFactory();
  } catch {
    throw new LazWorkerError(
      "Browser LAZ Worker could not start",
      receipt("worker-start-failed", started),
    );
  }
  if (
    typeof worker?.postMessage !== "function" ||
    typeof worker.terminate !== "function" ||
    typeof worker.addEventListener !== "function" ||
    typeof worker.removeEventListener !== "function"
  ) {
    worker?.terminate?.();
    throw new LazWorkerError(
      "Browser LAZ Worker could not start",
      receipt("worker-start-failed", started, {
        workerTerminationRequested: true,
      }),
    );
  }

  const byteLength = sourceBytes.byteLength;
  const requestId = crypto.randomUUID();
  const expected = { byteLength, requestId, sourceId };
  return await new Promise((resolve, reject) => {
    let cancellationStarted = null;
    let cancellationTimer = null;
    let cancelling = false;
    let lastPhase = null;
    let settled = false;
    let sourceTransferred = false;
    let timeout;

    const terminate = () => {
      try {
        worker.terminate();
      } catch {
        // The receipt records the request, not an unobservable completion.
      }
    };

    const cleanup = () => {
      clearTimeout(timeout);
      clearTimeout(cancellationTimer);
      signal?.removeEventListener?.("abort", cancel);
      worker.removeEventListener("message", message);
      worker.removeEventListener("error", runtimeError);
    };

    const fail = (messageText, value) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      terminate();
      reject(new LazWorkerError(messageText, value));
    };

    const succeed = (report) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      terminate();
      resolve(Object.freeze({
        report,
        receipt: Object.freeze(receipt("completed", started, {
          cleanup: report.cleanup,
          explicitCleanup: true,
          lastPhase,
          sourceTransferred,
          workerTerminationRequested: true,
        })),
      }));
    };

    function cancel() {
      if (settled || cancelling) {
        return;
      }
      cancelling = true;
      cancellationStarted = performance.now();
      try {
        worker.postMessage({
          schema: LAZ_WORKER_REQUEST_SCHEMA,
          requestId,
          type: "cancel",
        });
      } catch {
        // Force termination below remains the cancellation boundary.
      }
      cancellationTimer = setTimeout(() => {
        fail(
          "Browser LAZ Worker cancellation required termination",
          receipt("cancelled-forced", started, {
            cancellationWaitMs:
              performance.now() - cancellationStarted,
            cancelled: true,
            cooperativeCancellation: false,
            explicitCleanup: false,
            lastPhase,
            sourceTransferred,
            workerTerminationRequested: true,
          }),
        );
      }, cancellationGraceMs);
    }

    function message(event) {
      if (settled) {
        return;
      }
      const value = event.data;
      try {
        if (value?.status === "progress") {
          lastPhase = validateProgress(
            value,
            requestId,
            lastPhase,
          );
          onProgress?.(Object.freeze({ ...value }));
          if (!cancelling) {
            worker.postMessage({
              schema: LAZ_WORKER_REQUEST_SCHEMA,
              requestId,
              type: "continue",
              phase: lastPhase,
            });
          }
          return;
        }
        if (value?.status === "passed") {
          if (cancelling) {
            throw new Error(
              "LAZ Worker completed after cancellation",
            );
          }
          succeed(validateLazWorkerReport(value, expected));
          return;
        }
        if (value?.status === "cancelled") {
          const report = validateCancellationReport(
            value,
            expected,
            lastPhase,
          );
          const wait = cancellationStarted === null
            ? 0
            : performance.now() - cancellationStarted;
          fail(
            "Browser LAZ Worker cancelled",
            receipt("cancelled-cooperative", started, {
              cancellationWaitMs: wait,
              cancelled: true,
              cleanup: report.cleanup,
              cooperativeCancellation: true,
              explicitCleanup: true,
              lastPhase,
              sourceTransferred,
              workerTerminationRequested: true,
            }),
          );
          return;
        }
        if (value?.status === "failed") {
          const report = validateFailureReport(value, expected);
          fail(
            "Browser LAZ Worker rejected the source",
            receipt("input-rejected", started, {
              cleanup: report.cleanup,
              explicitCleanup: true,
              lastPhase,
              rejection: {
                code: report.failure.code,
                phase: report.failure.phase,
                source: report.source,
              },
              sourceTransferred,
              workerTerminationRequested: true,
            }),
          );
          return;
        }
        throw new Error("unsupported LAZ Worker message");
      } catch {
        fail(
          "Browser LAZ Worker protocol failed",
          receipt("protocol-failed", started, {
            lastPhase,
            sourceTransferred,
            workerTerminationRequested: true,
          }),
        );
      }
    }

    function runtimeError() {
      fail(
        "Browser LAZ Worker runtime failed",
        receipt("runtime-failed", started, {
          lastPhase,
          sourceTransferred,
          workerTerminationRequested: true,
        }),
      );
    }

    worker.addEventListener("message", message);
    worker.addEventListener("error", runtimeError);
    signal?.addEventListener?.("abort", cancel, { once: true });
    timeout = setTimeout(() => {
      fail(
        "Browser LAZ Worker timed out",
        receipt("timed-out", started, {
          lastPhase,
          sourceTransferred,
          timedOut: true,
          workerTerminationRequested: true,
        }),
      );
    }, timeoutMs);

    try {
      worker.postMessage({
        schema: LAZ_WORKER_REQUEST_SCHEMA,
        requestId,
        type: "decode",
        source: {
          id: sourceId,
          format: "laz",
        },
        bytes: sourceBytes,
        qualification: {
          decodePasses: qualificationDecodePasses,
          stallAtPhase: qualificationStallAtPhase,
        },
      }, [sourceBytes]);
      sourceTransferred = true;
    } catch {
      fail(
        "Browser LAZ Worker request failed",
        receipt("request-failed", started, {
          sourceTransferred,
          workerTerminationRequested: true,
        }),
      );
    }
  });
}
