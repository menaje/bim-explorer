import {
  BrowserWorkerError,
  inspectIfcInBrowserWorker,
  validateBrowserSourceDescriptor,
} from "./worker-client.mjs";

export const MAX_LOCAL_IFC_BYTES = 64 * 1024 * 1024;

const CANCEL_OUTCOMES = new Set([
  "cancelled",
  "disposed",
  "source-replaced",
]);

export class BrowserSourceSessionError extends Error {
  constructor(message, receipt) {
    super(message);
    this.name = "BrowserSourceSessionError";
    this.code = "BIM_EXPLORER_BROWSER_SOURCE_FAILED";
    this.receipt = Object.freeze(receipt);
  }
}

function validateBudget(value) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError("maxSourceBytes must be a positive safe integer");
  }
}

function validateBlob(source) {
  if (
    source === null ||
    typeof source !== "object" ||
    !Number.isSafeInteger(source.size) ||
    source.size <= 0 ||
    typeof source.arrayBuffer !== "function"
  ) {
    throw new TypeError("source must be a non-empty Blob capability");
  }
}

async function readSource(source, signal) {
  let onAbort;
  const cancelled = new Promise((resolve) => {
    onAbort = () => {
      resolve({
        outcome: "cancelled",
      });
    };
    signal.addEventListener("abort", onAbort, {
      once: true,
    });
    if (signal.aborted) {
      onAbort();
    }
  });
  const reading = Promise.resolve()
    .then(() => source.arrayBuffer())
    .then(
      (bytes) => ({
        bytes,
        outcome: "read",
      }),
      () => ({
        outcome: "failed",
      }),
    );
  try {
    return await Promise.race([
      reading,
      cancelled,
    ]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

function sessionReceipt(outcome, token, overrides = {}) {
  return {
    outcome,
    sourceId: token.sourceId,
    sourceKind: token.sourceKind,
    sourceBytes: token.sourceBytes,
    workerStarted: overrides.workerStarted ?? false,
    cancelled: overrides.cancelled ?? false,
    disposed: overrides.disposed ?? false,
    workerCancellation: overrides.workerCancellation ?? null,
    wallClockMs: performance.now() - token.started,
  };
}

function workerCancellationReceipt(error) {
  if (
    !(error instanceof BrowserWorkerError) ||
    error.receipt?.cancelled !== true
  ) {
    return null;
  }
  const receipt = {
    outcome: error.receipt.outcome,
    cooperativeCancellation:
      error.receipt.cooperativeCancellation,
    lastPhase: error.receipt.lastPhase,
    cleanup: error.receipt.cleanup,
    workerTerminationRequested:
      error.receipt.workerTerminationRequested,
  };
  if (
    typeof error.receipt.cancellationWaitMs === "number" &&
    Number.isFinite(error.receipt.cancellationWaitMs) &&
    error.receipt.cancellationWaitMs >= 0
  ) {
    receipt.cancellationWaitMs =
      error.receipt.cancellationWaitMs;
  }
  if (
    typeof error.receipt.wallClockMs === "number" &&
    Number.isFinite(error.receipt.wallClockMs) &&
    error.receipt.wallClockMs >= 0
  ) {
    receipt.wallClockMs = error.receipt.wallClockMs;
  }
  return receipt;
}

export class BrowserIfcSourceSession {
  #active = null;
  #disposed = false;
  #inspect;
  #maxSourceBytes;

  constructor({
    inspect = inspectIfcInBrowserWorker,
    maxSourceBytes = MAX_LOCAL_IFC_BYTES,
  } = {}) {
    validateBudget(maxSourceBytes);
    if (typeof inspect !== "function") {
      throw new TypeError("inspect must be a function");
    }
    this.#inspect = inspect;
    this.#maxSourceBytes = maxSourceBytes;
  }

  get active() {
    return this.#active !== null;
  }

  cancel(outcome = "cancelled") {
    if (!CANCEL_OUTCOMES.has(outcome)) {
      throw new TypeError("invalid Browser source cancellation outcome");
    }
    if (this.#active === null) {
      return false;
    }
    this.#active.cancelOutcome = outcome;
    this.#active.controller.abort();
    return true;
  }

  dispose() {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.cancel("disposed");
  }

  async inspect(
    source,
    {
      cancellationGraceMs,
      onProgress,
      sourceId = "local-ifc",
      sourceKind = "local-file",
      timeoutMs,
    } = {},
  ) {
    validateBrowserSourceDescriptor(sourceKind, sourceId);
    if (this.#disposed) {
      throw new BrowserSourceSessionError(
        "Browser source session is disposed",
        {
          outcome: "session-disposed",
          sourceId,
          sourceKind,
          sourceBytes: 0,
          workerStarted: false,
          cancelled: false,
          disposed: true,
          wallClockMs: 0,
        },
      );
    }
    validateBlob(source);
    const token = {
      cancelOutcome: null,
      controller: new AbortController(),
      sourceBytes: source.size,
      sourceId,
      sourceKind,
      started: performance.now(),
      workerStarted: false,
    };
    if (source.size > this.#maxSourceBytes) {
      throw new BrowserSourceSessionError(
        "Browser IFC source exceeds the local budget",
        {
          ...sessionReceipt("source-limit", token),
          maxSourceBytes: this.#maxSourceBytes,
        },
      );
    }

    this.cancel("source-replaced");
    this.#active = token;
    try {
      const read = await readSource(source, token.controller.signal);
      if (read.outcome === "cancelled") {
        throw new BrowserSourceSessionError(
          "Browser IFC source read cancelled",
          sessionReceipt(token.cancelOutcome ?? "cancelled", token, {
            cancelled: true,
            disposed: token.cancelOutcome === "disposed",
          }),
        );
      }
      if (read.outcome === "failed") {
        throw new BrowserSourceSessionError(
          "Browser IFC source could not be read",
          sessionReceipt("source-read-failed", token),
        );
      }
      const bytes = read.bytes;
      if (
        !(bytes instanceof ArrayBuffer) ||
        bytes.byteLength !== token.sourceBytes ||
        bytes.byteLength > this.#maxSourceBytes
      ) {
        throw new BrowserSourceSessionError(
          "Browser IFC source size changed while reading",
          {
            ...sessionReceipt("source-size-mismatch", token),
            maxSourceBytes: this.#maxSourceBytes,
          },
        );
      }

      token.workerStarted = true;
      let result;
      try {
        result = await this.#inspect(bytes, {
          signal: token.controller.signal,
          cancellationGraceMs,
          onProgress,
          sourceId,
          sourceKind,
          timeoutMs,
        });
      } catch (error) {
        if (token.controller.signal.aborted) {
          throw new BrowserSourceSessionError(
            "Browser IFC inspection cancelled",
            sessionReceipt(token.cancelOutcome ?? "cancelled", token, {
              workerStarted: true,
              cancelled: true,
              disposed: token.cancelOutcome === "disposed",
              workerCancellation:
                workerCancellationReceipt(error),
            }),
          );
        }
        if (error instanceof BrowserWorkerError) {
          throw error;
        }
        throw new BrowserSourceSessionError(
          "Browser IFC inspection failed",
          sessionReceipt("inspection-failed", token, {
            workerStarted: true,
          }),
        );
      }
      return {
        ...result,
        sourceSession: sessionReceipt("completed", token, {
          workerStarted: true,
        }),
      };
    } finally {
      if (this.#active === token) {
        this.#active = null;
      }
    }
  }
}
