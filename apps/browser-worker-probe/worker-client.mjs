export const BROWSER_WORKER_REQUEST_SCHEMA =
  "bim-explorer-browser-worker-request/0.1";
export const BROWSER_WORKER_RESULT_SCHEMA =
  "bim-explorer-browser-worker-result/0.1";

const SHA256 = /^[0-9a-f]{64}$/u;

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

export function validateBrowserWorkerReport(value, expectedByteLength) {
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
    value.fixture?.byteLength !== expectedByteLength ||
    !SHA256.test(value.fixture?.sha256 ?? "") ||
    typeof value.fixture?.schema !== "string" ||
    value.fixture.schema.length === 0
  ) {
    throw new Error("Browser Worker fixture identity mismatch");
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
    wallClockMs: performance.now() - started,
  };
}

export async function inspectIfcInBrowserWorker(
  sourceBytes,
  {
    signal,
    timeoutMs = 15_000,
    workerFactory = defaultWorkerFactory,
  } = {},
) {
  if (!(sourceBytes instanceof ArrayBuffer) || sourceBytes.byteLength === 0) {
    throw new TypeError("sourceBytes must be a non-empty ArrayBuffer");
  }
  validatePositiveBudget(timeoutMs, "timeoutMs");
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
  const expectedByteLength = sourceBytes.byteLength;
  return await new Promise((resolve, reject) => {
    let settled = false;
    let timeout;

    const terminate = () => {
      worker.terminate();
      return true;
    };
    const cleanup = () => {
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
            workerTerminationRequested,
          }),
        ),
      );
    };
    const onAbort = () => {
      fail("cancelled", {
        cancelled: true,
      });
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
      if (event.data.status !== "passed") {
        fail("inspection-failed");
        return;
      }
      let report;
      try {
        report = validateBrowserWorkerReport(
          event.data,
          expectedByteLength,
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
          bytes: sourceBytes,
        },
        [sourceBytes],
      );
    } catch {
      fail("request-failed");
    }
  });
}
