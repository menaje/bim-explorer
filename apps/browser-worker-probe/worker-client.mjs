export const BROWSER_WORKER_REQUEST_SCHEMA =
  "bim-explorer-browser-worker-request/0.3";
export const BROWSER_WORKER_RESULT_SCHEMA =
  "bim-explorer-browser-worker-result/0.3";
export const BROWSER_WORKER_PROGRESS_SCHEMA =
  "bim-explorer-browser-worker-progress/0.1";
export const BROWSER_WORKER_PHASES = Object.freeze([
  "engine-initialized",
  "model-opened",
  "inspection-complete",
]);

const SHA256 = /^[0-9a-f]{64}$/u;
const PROGRESS_KEYS = [
  "phase",
  "requestId",
  "schema",
  "status",
];
const SOURCE_ID = /^[a-z0-9][a-z0-9-]+$/u;
const SOURCE_KINDS = new Set([
  "local-file",
  "synthetic",
]);

export class BrowserWorkerError extends Error {
  constructor(message, receipt) {
    super(message);
    this.name = "BrowserWorkerError";
    this.code = "BIM_EXPLORER_BROWSER_WORKER_FAILED";
    this.receipt = Object.freeze(receipt);
  }
}

function validatePositiveBudget(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
}

function validateOptionalCallback(value, label) {
  if (value !== undefined && typeof value !== "function") {
    throw new TypeError(`${label} must be a function`);
  }
}

function pathFree(value, label = "Browser Worker report") {
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

function nonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`);
  }
}

export function validateBrowserSourceDescriptor(sourceKind, sourceId) {
  if (!SOURCE_KINDS.has(sourceKind) || !SOURCE_ID.test(sourceId)) {
    throw new TypeError("invalid Browser Worker source descriptor");
  }
}

export function validateBrowserWorkerReport(
  value,
  {
    byteLength,
    sourceId,
    sourceKind,
  },
) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.schema !== BROWSER_WORKER_RESULT_SCHEMA ||
    value.status !== "passed"
  ) {
    throw new Error("Browser Worker returned an unsupported report");
  }
  pathFree(value);
  if (
    value.engine?.id !== "web-ifc" ||
    value.engine?.version !== "0.0.77" ||
    value.engine?.backend !== "browser-wasm-worker-prototype" ||
    value.engine?.license !== "MPL-2.0"
  ) {
    throw new Error("Browser Worker engine identity mismatch");
  }
  if (
    value.source?.id !== sourceId ||
    value.source?.kind !== sourceKind ||
    value.source?.byteLength !== byteLength ||
    !SHA256.test(value.source?.sha256 ?? "") ||
    typeof value.source?.schema !== "string" ||
    value.source.schema.length === 0
  ) {
    throw new Error("Browser Worker source identity mismatch");
  }
  for (const [label, count] of Object.entries({
    projects: value.semantics?.projects,
    walls: value.semantics?.walls,
    products: value.geometry?.products,
    triangles: value.geometry?.triangles,
  })) {
    nonNegativeInteger(count, label);
  }
  if (
    value.cleanup?.modelClosed !== true ||
    value.cleanup?.engineDisposed !== true
  ) {
    throw new Error("Browser Worker engine cleanup is incomplete");
  }
  return value;
}

function validateBrowserWorkerProgress(value, requestId, previousPhase) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.schema !== BROWSER_WORKER_PROGRESS_SCHEMA ||
    value.requestId !== requestId ||
    value.status !== "progress" ||
    JSON.stringify(Object.keys(value).sort()) !==
      JSON.stringify(PROGRESS_KEYS)
  ) {
    throw new Error("Browser Worker returned invalid progress");
  }
  const previousIndex = previousPhase === null
    ? -1
    : BROWSER_WORKER_PHASES.indexOf(previousPhase);
  if (value.phase !== BROWSER_WORKER_PHASES[previousIndex + 1]) {
    throw new Error("Browser Worker progress is out of order");
  }
  return value.phase;
}

function validateBrowserWorkerCancellationReport(
  value,
  {
    byteLength,
    sourceId,
    sourceKind,
  },
  lastPhase,
) {
  const phaseIndex = BROWSER_WORKER_PHASES.indexOf(lastPhase);
  const modelOpened = phaseIndex >=
    BROWSER_WORKER_PHASES.indexOf("model-opened");
  if (
    phaseIndex < 0 ||
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.schema !== BROWSER_WORKER_RESULT_SCHEMA ||
    value.status !== "cancelled" ||
    value.phase !== lastPhase
  ) {
    throw new Error("Browser Worker returned invalid cancellation");
  }
  pathFree(value);
  if (
    value.engine?.id !== "web-ifc" ||
    value.engine?.version !== "0.0.77" ||
    value.engine?.backend !== "browser-wasm-worker-prototype" ||
    value.engine?.license !== "MPL-2.0" ||
    value.source?.id !== sourceId ||
    value.source?.kind !== sourceKind ||
    value.source?.byteLength !== byteLength ||
    !SHA256.test(value.source?.sha256 ?? "") ||
    (
      modelOpened
        ? (
            typeof value.source?.schema !== "string" ||
            value.source.schema.length === 0
          )
        : value.source?.schema !== null
    ) ||
    value.cleanup?.modelClosed !== modelOpened ||
    value.cleanup?.engineDisposed !== true ||
    !Array.isArray(value.diagnostics) ||
    value.diagnostics.length !== 0
  ) {
    throw new Error("Browser Worker cancellation cleanup is incomplete");
  }
  return value;
}

function defaultWorkerFactory() {
  return new Worker(new URL("./ifc-worker.mjs", import.meta.url), {
    name: "bim-explorer-ifc-probe",
    type: "module",
  });
}

function receipt(outcome, started, overrides = {}) {
  return {
    outcome,
    workerTerminationRequested:
      overrides.workerTerminationRequested ?? false,
    timedOut: overrides.timedOut ?? false,
    cancelled: overrides.cancelled ?? false,
    cooperativeCancellation:
      overrides.cooperativeCancellation ?? false,
    lastPhase: overrides.lastPhase ?? null,
    cleanup: {
      modelClosed: overrides.cleanup?.modelClosed ?? false,
      engineDisposed: overrides.cleanup?.engineDisposed ?? false,
    },
    wallClockMs: performance.now() - started,
  };
}

export async function inspectIfcInBrowserWorker(
  sourceBytes,
  {
    cancellationGraceMs = 500,
    onProgress,
    signal,
    sourceId = "local-ifc",
    sourceKind = "local-file",
    timeoutMs = 15_000,
    workerFactory = defaultWorkerFactory,
  } = {},
) {
  if (!(sourceBytes instanceof ArrayBuffer) || sourceBytes.byteLength === 0) {
    throw new TypeError("sourceBytes must be a non-empty ArrayBuffer");
  }
  validatePositiveBudget(timeoutMs, "timeoutMs");
  validatePositiveBudget(cancellationGraceMs, "cancellationGraceMs");
  validateOptionalCallback(onProgress, "onProgress");
  validateBrowserSourceDescriptor(sourceKind, sourceId);
  const started = performance.now();
  if (signal?.aborted) {
    throw new BrowserWorkerError(
      "Browser IFC Worker cancelled",
      receipt("cancelled-before-start", started, {
        cancelled: true,
      }),
    );
  }

  let worker;
  try {
    worker = workerFactory();
  } catch {
    throw new BrowserWorkerError(
      "Browser IFC Worker could not start",
      receipt("worker-start-failed", started),
    );
  }

  const requestId = crypto.randomUUID();
  const expectedSource = {
    byteLength: sourceBytes.byteLength,
    sourceId,
    sourceKind,
  };
  return await new Promise((resolve, reject) => {
    let cancellationTimeout;
    let cancelling = false;
    let lastPhase = null;
    let requestPosted = false;
    let settled = false;
    let timeout;

    const terminate = () => {
      try {
        worker.terminate();
        return true;
      } catch {
        return false;
      }
    };
    const cleanup = () => {
      clearTimeout(cancellationTimeout);
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      worker.removeEventListener("messageerror", onMessageError);
    };
    const fail = (outcome, options = {}) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      const workerTerminationRequested = terminate();
      reject(
        new BrowserWorkerError(
          `Browser IFC Worker ${outcome}`,
          receipt(outcome, started, {
            ...options,
            lastPhase,
            workerTerminationRequested,
          }),
        ),
      );
    };
    const onAbort = () => {
      if (settled || cancelling) {
        return;
      }
      if (!requestPosted) {
        fail("cancelled-before-request", {
          cancelled: true,
        });
        return;
      }
      cancelling = true;
      try {
        worker.postMessage({
          schema: BROWSER_WORKER_REQUEST_SCHEMA,
          requestId,
          type: "cancel",
        });
      } catch {
        fail("cancel-request-failed", {
          cancelled: true,
        });
        return;
      }
      cancellationTimeout = setTimeout(() => {
        fail("cancelled-forced", {
          cancelled: true,
        });
      }, cancellationGraceMs);
    };
    const onError = () => {
      fail("runtime-failed");
    };
    const onMessageError = () => {
      fail("message-failed");
    };
    const onMessage = (event) => {
      if (event.data?.requestId !== requestId) {
        return;
      }
      if (event.data.status === "progress") {
        try {
          lastPhase = validateBrowserWorkerProgress(
            event.data,
            requestId,
            lastPhase,
          );
          onProgress?.(Object.freeze({
            phase: lastPhase,
          }));
        } catch {
          fail("invalid-progress");
          return;
        }
        if (settled || cancelling) {
          return;
        }
        try {
          worker.postMessage({
            schema: BROWSER_WORKER_REQUEST_SCHEMA,
            requestId,
            type: "continue",
            phase: lastPhase,
          });
        } catch {
          fail("continue-failed");
        }
        return;
      }
      if (event.data.status === "cancelled") {
        if (!cancelling) {
          fail("unexpected-cancellation");
          return;
        }
        let report;
        try {
          report = validateBrowserWorkerCancellationReport(
            event.data,
            expectedSource,
            lastPhase,
          );
        } catch {
          fail("invalid-cancellation", {
            cancelled: true,
          });
          return;
        }
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        const workerTerminationRequested = terminate();
        reject(
          new BrowserWorkerError(
            "Browser IFC Worker cancelled cooperatively",
            receipt("cancelled-cooperative", started, {
              cancelled: true,
              cleanup: report.cleanup,
              cooperativeCancellation: true,
              lastPhase,
              workerTerminationRequested,
            }),
          ),
        );
        return;
      }
      if (event.data.status !== "passed") {
        fail("inspection-failed");
        return;
      }
      if (
        cancelling ||
        lastPhase !== BROWSER_WORKER_PHASES.at(-1)
      ) {
        fail(
          cancelling
            ? "cancelled-without-receipt"
            : "incomplete-progress",
          {
            cancelled: cancelling,
          },
        );
        return;
      }
      let report;
      try {
        report = validateBrowserWorkerReport(
          event.data,
          expectedSource,
        );
      } catch {
        fail("invalid-report");
        return;
      }
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      const workerTerminationRequested = terminate();
      resolve({
        report,
        receipt: receipt("completed", started, {
          cleanup: report.cleanup,
          lastPhase,
          workerTerminationRequested,
        }),
      });
    };

    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    worker.addEventListener("messageerror", onMessageError);
    signal?.addEventListener("abort", onAbort, {
      once: true,
    });
    if (signal?.aborted) {
      onAbort();
      return;
    }
    timeout = setTimeout(() => {
      fail("timeout", {
        timedOut: true,
      });
    }, timeoutMs);
    try {
      worker.postMessage(
        {
          schema: BROWSER_WORKER_REQUEST_SCHEMA,
          requestId,
          type: "inspect",
          source: {
            id: sourceId,
            kind: sourceKind,
          },
          bytes: sourceBytes,
        },
        [sourceBytes],
      );
      requestPosted = true;
    } catch {
      fail("request-failed");
    }
  });
}
