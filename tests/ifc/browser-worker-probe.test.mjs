import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import test from "node:test";

import {
  BROWSER_WORKER_PHASES,
  BROWSER_WORKER_PROGRESS_SCHEMA,
  BROWSER_WORKER_RESULT_SCHEMA,
  BrowserWorkerError,
  inspectIfcInBrowserWorker,
} from "../../apps/browser-worker-probe/worker-client.mjs";
import {
  BROWSER_PERFORMANCE_BUDGET,
  BROWSER_PERFORMANCE_FIXTURE,
  PUBLIC_BROWSER_PERFORMANCE_BUDGET,
  PUBLIC_BROWSER_PERFORMANCE_FIXTURE,
  assessBrowserPerformanceResult,
  assessPublicBrowserPerformanceResult,
} from "../../apps/browser-worker-probe/performance-budget.mjs";
import {
  BrowserIfcSourceSession,
  BrowserSourceSessionError,
} from "../../apps/browser-worker-probe/source-session.mjs";
import { createBrowserWorkerProbeServer } from
  "../../scripts/serve-browser-worker-probe.mjs";
import {
  syntheticNegativeIfcCorpus,
} from "../../scripts/generate-negative-ifc-corpus.mjs";
import {
  syntheticIfc,
  syntheticPerformanceIfc,
} from "../../scripts/generate-synthetic-ifc.mjs";

function report(requestId, byteLength, source) {
  return {
    schema: BROWSER_WORKER_RESULT_SCHEMA,
    requestId,
    status: "passed",
    engine: {
      id: "web-ifc",
      version: "0.0.77",
      backend: "browser-wasm-worker-prototype",
      license: "MPL-2.0",
    },
    source: {
      id: source.id,
      kind: source.kind,
      byteLength,
      sha256: "0".repeat(64),
      schema: "IFC4",
    },
    semantics: {
      projects: 1,
      walls: 1,
    },
    geometry: {
      products: 1,
      triangles: 12,
    },
    performance: {
      initializationMs: 1,
      inspectionMs: 1,
      openMs: 1,
      totalMs: 1,
    },
    resources: {
      inputBytes: byteLength,
      wasmHeapCapacityBytes: {
        afterInitialization: 16 * 1024 * 1024,
        afterInspection: 128 * 1024 * 1024,
        afterOpen: 128 * 1024 * 1024,
        peakObserved: 128 * 1024 * 1024,
      },
    },
    cleanup: {
      modelClosed: true,
      engineDisposed: true,
    },
    diagnostics: [],
  };
}

function progress(requestId, phase) {
  return {
    schema: BROWSER_WORKER_PROGRESS_SCHEMA,
    requestId,
    status: "progress",
    phase,
  };
}

function cancellationReport(requestId, byteLength, source, phase) {
  const modelOpened = BROWSER_WORKER_PHASES.indexOf(phase) >=
    BROWSER_WORKER_PHASES.indexOf("model-opened");
  return {
    schema: BROWSER_WORKER_RESULT_SCHEMA,
    requestId,
    status: "cancelled",
    phase,
    engine: {
      id: "web-ifc",
      version: "0.0.77",
      backend: "browser-wasm-worker-prototype",
      license: "MPL-2.0",
    },
    source: {
      id: source.id,
      kind: source.kind,
      byteLength,
      sha256: "0".repeat(64),
      schema: modelOpened ? "IFC4" : null,
    },
    cleanup: {
      modelClosed: modelOpened,
      engineDisposed: true,
    },
    diagnostics: [],
  };
}

function rejectionReport(
  requestId,
  byteLength,
  source,
  {
    cleanupComplete = true,
  } = {},
) {
  return {
    schema: BROWSER_WORKER_RESULT_SCHEMA,
    requestId,
    status: "failed",
    engine: {
      id: "web-ifc",
      version: "0.0.77",
      backend: "browser-wasm-worker-prototype",
      license: "MPL-2.0",
    },
    source: {
      id: source.id,
      kind: source.kind,
      byteLength,
      sha256: "0".repeat(64),
      schema: null,
    },
    failure: {
      code: "BROWSER_IFC_INPUT_REJECTED",
      phase: "source-envelope",
    },
    resources: {
      inputBytes: byteLength,
    },
    cleanup: {
      modelOpened: false,
      modelClosed: false,
      engineDisposed: cleanupComplete,
    },
    diagnostics: [
      {
        code: "BROWSER_IFC_INPUT_REJECTED",
      },
    ],
  };
}

class FakeWorker {
  constructor(action = "success") {
    this.action = action;
    this.listeners = new Map();
    this.phaseIndex = -1;
    this.request = null;
    this.terminated = false;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type, event) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  postMessage(message) {
    if (message.type === "inspect") {
      this.request = message;
      if (
        this.action === "success" ||
        this.action === "invalid-resource" ||
        this.action === "cooperative-cancel" ||
        this.action === "forced-in-call-cancel" ||
        this.action === "rejected" ||
        this.action === "invalid-rejection"
      ) {
        this.phaseIndex = 0;
        queueMicrotask(() => {
          this.emit("message", {
            data: progress(
              message.requestId,
              BROWSER_WORKER_PHASES[this.phaseIndex],
            ),
          });
        });
      } else if (this.action === "invalid-progress") {
        queueMicrotask(() => {
          this.emit("message", {
            data: progress(message.requestId, "model-opened"),
          });
        });
      } else if (this.action === "error") {
        queueMicrotask(() => {
          this.emit("error", {
            message: "/private/customer.ifc",
          });
        });
      }
      return;
    }
    if (
      message.type === "continue" &&
      (
        this.action === "rejected" ||
        this.action === "invalid-rejection"
      )
    ) {
      queueMicrotask(() => {
        this.emit("message", {
          data: rejectionReport(
            message.requestId,
            this.request.bytes.byteLength,
            this.request.source,
            {
              cleanupComplete:
                this.action !== "invalid-rejection",
            },
          ),
        });
      });
      return;
    }
    if (
      message.type === "continue" &&
      (
        this.action === "success" ||
        this.action === "invalid-resource"
      )
    ) {
      if (this.phaseIndex < BROWSER_WORKER_PHASES.length - 1) {
        this.phaseIndex += 1;
        queueMicrotask(() => {
          this.emit("message", {
            data: progress(
              message.requestId,
              BROWSER_WORKER_PHASES[this.phaseIndex],
            ),
          });
        });
        return;
      }
      queueMicrotask(() => {
        const completed = report(
          message.requestId,
          this.request.bytes.byteLength,
          this.request.source,
        );
        if (this.action === "invalid-resource") {
          completed.resources.inputBytes += 1;
        }
        this.emit("message", {
          data: completed,
        });
      });
      return;
    }
    if (
      message.type === "continue" &&
      this.action === "cooperative-cancel" &&
      this.phaseIndex <
        BROWSER_WORKER_PHASES.indexOf("model-opened")
    ) {
      this.phaseIndex += 1;
      queueMicrotask(() => {
        this.emit("message", {
          data: progress(
            message.requestId,
            BROWSER_WORKER_PHASES[this.phaseIndex],
          ),
        });
      });
      return;
    }
    if (
      message.type === "continue" &&
      this.action === "forced-in-call-cancel" &&
      this.phaseIndex <
        BROWSER_WORKER_PHASES.indexOf(
          "model-open-call-starting",
        )
    ) {
      this.phaseIndex += 1;
      queueMicrotask(() => {
        this.emit("message", {
          data: progress(
            message.requestId,
            BROWSER_WORKER_PHASES[this.phaseIndex],
          ),
        });
      });
      return;
    }
    if (
      message.type === "cancel" &&
      this.action === "cooperative-cancel"
    ) {
      queueMicrotask(() => {
        this.emit("message", {
          data: cancellationReport(
            message.requestId,
            this.request.bytes.byteLength,
            this.request.source,
            BROWSER_WORKER_PHASES[this.phaseIndex],
          ),
        });
      });
    }
  }

  terminate() {
    this.terminated = true;
  }
}

test("Browser Worker client validates cleanup and terminates the Worker", async () => {
  const worker = new FakeWorker();
  const result = await inspectIfcInBrowserWorker(
    new Uint8Array([1, 2, 3]).buffer,
    {
      workerFactory: () => worker,
    },
  );
  assert.equal(result.report.geometry.triangles, 12);
  assert.equal(result.report.source.kind, "local-file");
  assert.equal(result.report.cleanup.engineDisposed, true);
  assert.equal(result.receipt.outcome, "completed");
  assert.equal(result.receipt.lastPhase, "inspection-complete");
  assert.deepEqual(result.receipt.cleanup, {
    modelClosed: true,
    engineDisposed: true,
  });
  assert.equal(result.receipt.workerTerminationRequested, true);
  assert.equal(worker.terminated, true);
});

test("Browser Worker client redacts runtime error detail", async () => {
  const worker = new FakeWorker("error");
  await assert.rejects(
    inspectIfcInBrowserWorker(new Uint8Array([1]).buffer, {
      workerFactory: () => worker,
    }),
    (error) => {
      assert.ok(error instanceof BrowserWorkerError);
      assert.equal(error.receipt.outcome, "runtime-failed");
      assert.doesNotMatch(
        JSON.stringify({
          message: error.message,
          receipt: error.receipt,
        }),
        /customer|\.ifc|\/private\//u,
      );
      assert.equal(worker.terminated, true);
      return true;
    },
  );
});

test("Browser Worker client force-terminates an unresponsive cancellation", async () => {
  const worker = new FakeWorker("pending");
  const cancellation = new AbortController();
  const running = inspectIfcInBrowserWorker(
    new Uint8Array([1]).buffer,
    {
      signal: cancellation.signal,
      cancellationGraceMs: 1,
      workerFactory: () => worker,
    },
  );
  cancellation.abort();
  await assert.rejects(running, (error) => {
    assert.ok(error instanceof BrowserWorkerError);
    assert.equal(error.receipt.outcome, "cancelled-forced");
    assert.equal(error.receipt.cancelled, true);
    assert.equal(error.receipt.cooperativeCancellation, false);
    assert.ok(
      Number.isFinite(error.receipt.cancellationWaitMs) &&
        error.receipt.cancellationWaitMs >= 0 &&
        error.receipt.cancellationWaitMs <= 250,
    );
    assert.equal(worker.terminated, true);
    return true;
  });
});

test("Browser Worker cooperatively cancels after model open and cleans up", async () => {
  const worker = new FakeWorker("cooperative-cancel");
  const cancellation = new AbortController();
  const observed = [];
  const running = inspectIfcInBrowserWorker(
    new Uint8Array([1, 2, 3]).buffer,
    {
      signal: cancellation.signal,
      onProgress(value) {
        observed.push(value.phase);
        if (value.phase === "model-opened") {
          cancellation.abort();
        }
      },
      workerFactory: () => worker,
    },
  );
  await assert.rejects(running, (error) => {
    assert.ok(error instanceof BrowserWorkerError);
    assert.equal(error.receipt.outcome, "cancelled-cooperative");
    assert.equal(error.receipt.cancelled, true);
    assert.equal(error.receipt.cooperativeCancellation, true);
    assert.equal(error.receipt.lastPhase, "model-opened");
    assert.deepEqual(error.receipt.cleanup, {
      modelClosed: true,
      engineDisposed: true,
    });
    assert.equal(error.receipt.workerTerminationRequested, true);
    assert.equal(worker.terminated, true);
    return true;
  });
  assert.deepEqual(observed, [
    "engine-initialized",
    "model-open-call-starting",
    "model-opened",
  ]);
});

test("Browser Worker force-terminates after the model-open call checkpoint", async () => {
  const worker = new FakeWorker("forced-in-call-cancel");
  const cancellation = new AbortController();
  const observed = [];
  const running = inspectIfcInBrowserWorker(
    new Uint8Array([1, 2, 3]).buffer,
    {
      cancellationGraceMs: 1,
      onProgress(value) {
        observed.push(value.phase);
        if (value.phase === "model-open-call-starting") {
          setTimeout(() => {
            cancellation.abort();
          }, 0);
        }
      },
      signal: cancellation.signal,
      workerFactory: () => worker,
    },
  );
  await assert.rejects(running, (error) => {
    assert.ok(error instanceof BrowserWorkerError);
    assert.equal(error.receipt.outcome, "cancelled-forced");
    assert.equal(error.receipt.cancelled, true);
    assert.equal(error.receipt.cooperativeCancellation, false);
    assert.ok(
      Number.isFinite(error.receipt.cancellationWaitMs) &&
        error.receipt.cancellationWaitMs >= 0 &&
        error.receipt.cancellationWaitMs <= 250,
    );
    assert.equal(
      error.receipt.lastPhase,
      "model-open-call-starting",
    );
    assert.deepEqual(error.receipt.cleanup, {
      modelClosed: false,
      engineDisposed: false,
    });
    assert.equal(error.receipt.workerTerminationRequested, true);
    assert.equal(worker.terminated, true);
    return true;
  });
  assert.deepEqual(observed, [
    "engine-initialized",
    "model-open-call-starting",
  ]);
});

test("Browser Worker cancellation before model open still disposes the engine", async () => {
  const worker = new FakeWorker("cooperative-cancel");
  const cancellation = new AbortController();
  const running = inspectIfcInBrowserWorker(
    new Uint8Array([1]).buffer,
    {
      signal: cancellation.signal,
      onProgress(value) {
        if (value.phase === "engine-initialized") {
          cancellation.abort();
        }
      },
      workerFactory: () => worker,
    },
  );
  await assert.rejects(running, (error) => {
    assert.ok(error instanceof BrowserWorkerError);
    assert.equal(error.receipt.outcome, "cancelled-cooperative");
    assert.equal(error.receipt.lastPhase, "engine-initialized");
    assert.deepEqual(error.receipt.cleanup, {
      modelClosed: false,
      engineDisposed: true,
    });
    return true;
  });
});

test("Browser Worker rejects out-of-order progress", async () => {
  const worker = new FakeWorker("invalid-progress");
  await assert.rejects(
    inspectIfcInBrowserWorker(new Uint8Array([1]).buffer, {
      workerFactory: () => worker,
    }),
    (error) => {
      assert.ok(error instanceof BrowserWorkerError);
      assert.equal(error.receipt.outcome, "invalid-progress");
      assert.equal(worker.terminated, true);
      return true;
    },
  );
});

test("Browser Worker rejects an invalid resource receipt", async () => {
  const worker = new FakeWorker("invalid-resource");
  await assert.rejects(
    inspectIfcInBrowserWorker(new Uint8Array([1]).buffer, {
      workerFactory: () => worker,
    }),
    (error) => {
      assert.ok(error instanceof BrowserWorkerError);
      assert.equal(error.receipt.outcome, "invalid-report");
      assert.equal(worker.terminated, true);
      return true;
    },
  );
});

test("Browser Worker accepts a bounded negative cleanup receipt", async () => {
  const worker = new FakeWorker("rejected");
  await assert.rejects(
    inspectIfcInBrowserWorker(new Uint8Array([1, 2, 3]).buffer, {
      sourceId: "negative-truncated-data",
      sourceKind: "synthetic",
      workerFactory: () => worker,
    }),
    (error) => {
      assert.ok(error instanceof BrowserWorkerError);
      assert.equal(error.receipt.outcome, "inspection-rejected");
      assert.equal(error.receipt.lastPhase, "engine-initialized");
      assert.deepEqual(error.receipt.cleanup, {
        modelOpened: false,
        modelClosed: false,
        engineDisposed: true,
      });
      assert.equal(
        error.receipt.rejection.diagnosticCode,
        "BROWSER_IFC_INPUT_REJECTED",
      );
      assert.equal(
        error.receipt.rejection.phase,
        "source-envelope",
      );
      assert.equal(
        error.receipt.rejection.source.id,
        "negative-truncated-data",
      );
      assert.equal(error.receipt.workerTerminationRequested, true);
      assert.equal(worker.terminated, true);
      return true;
    },
  );
});

test("Browser Worker rejects an incomplete negative cleanup receipt", async () => {
  const worker = new FakeWorker("invalid-rejection");
  await assert.rejects(
    inspectIfcInBrowserWorker(new Uint8Array([1]).buffer, {
      workerFactory: () => worker,
    }),
    (error) => {
      assert.ok(error instanceof BrowserWorkerError);
      assert.equal(error.receipt.outcome, "invalid-rejection");
      assert.equal(worker.terminated, true);
      return true;
    },
  );
});

test("Browser performance budget accepts the bounded fixture only", () => {
  const performanceReport = report(
    "performance-request",
    BROWSER_PERFORMANCE_FIXTURE.byteLength,
    {
      id: BROWSER_PERFORMANCE_FIXTURE.id,
      kind: "synthetic",
    },
  );
  Object.assign(performanceReport.source, {
    sha256: BROWSER_PERFORMANCE_FIXTURE.sha256,
  });
  Object.assign(performanceReport.semantics, {
    projects: BROWSER_PERFORMANCE_FIXTURE.projects,
    walls: BROWSER_PERFORMANCE_FIXTURE.walls,
  });
  Object.assign(performanceReport.geometry, {
    products: BROWSER_PERFORMANCE_FIXTURE.products,
    triangles: BROWSER_PERFORMANCE_FIXTURE.triangles,
  });
  const result = {
    report: performanceReport,
    receipt: {
      outcome: "completed",
      wallClockMs: 100,
    },
  };
  assert.equal(assessBrowserPerformanceResult(result).passed, true);

  performanceReport.resources.wasmHeapCapacityBytes.peakObserved =
    BROWSER_PERFORMANCE_BUDGET.maxWasmHeapCapacityBytes + 1;
  const assessment = assessBrowserPerformanceResult(result);
  assert.equal(assessment.passed, false);
  assert.deepEqual(assessment.violations, [
    "wasm-heap-capacity",
  ]);
});

test("Browser performance budget accepts the public representative fixture", () => {
  const performanceReport = report(
    "public-performance-request",
    PUBLIC_BROWSER_PERFORMANCE_FIXTURE.byteLength,
    {
      id: PUBLIC_BROWSER_PERFORMANCE_FIXTURE.id,
      kind: "public-fixture",
    },
  );
  Object.assign(performanceReport.source, {
    sha256: PUBLIC_BROWSER_PERFORMANCE_FIXTURE.sha256,
  });
  Object.assign(performanceReport.semantics, {
    projects: PUBLIC_BROWSER_PERFORMANCE_FIXTURE.projects,
    walls: PUBLIC_BROWSER_PERFORMANCE_FIXTURE.walls,
  });
  Object.assign(performanceReport.geometry, {
    products: PUBLIC_BROWSER_PERFORMANCE_FIXTURE.products,
    triangles: PUBLIC_BROWSER_PERFORMANCE_FIXTURE.triangles,
  });
  const result = {
    report: performanceReport,
    receipt: {
      outcome: "completed",
      wallClockMs: 100,
    },
  };
  assert.equal(
    assessPublicBrowserPerformanceResult(result).passed,
    true,
  );
  performanceReport.performance.openMs =
    PUBLIC_BROWSER_PERFORMANCE_BUDGET.maxOpenMs + 1;
  assert.deepEqual(
    assessPublicBrowserPerformanceResult(result).violations,
    ["open-time"],
  );
});

test("Browser source session replaces an active source without stale output", async () => {
  let callCount = 0;
  let firstStartedResolve;
  const firstStarted = new Promise((resolve) => {
    firstStartedResolve = resolve;
  });
  const inspect = async (_bytes, options) => {
    callCount += 1;
    if (callCount === 1) {
      firstStartedResolve();
      return await new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => {
          reject(
            new BrowserWorkerError("cancelled", {
              cancelled: true,
              cleanup: {
                modelClosed: true,
                engineDisposed: true,
              },
              cooperativeCancellation: true,
              lastPhase: "model-opened",
              outcome: "cancelled",
              workerTerminationRequested: true,
            }),
          );
        }, {
          once: true,
        });
      });
    }
    return {
      report: {
        source: {
          id: options.sourceId,
          kind: options.sourceKind,
        },
      },
      receipt: {
        outcome: "completed",
      },
    };
  };
  const session = new BrowserIfcSourceSession({
    inspect,
  });
  const first = session.inspect(new Blob(["first"]), {
    sourceId: "first-source",
  });
  await firstStarted;
  const second = session.inspect(new Blob(["second"]), {
    sourceId: "second-source",
  });
  await assert.rejects(first, (error) => {
    assert.ok(error instanceof BrowserSourceSessionError);
    assert.equal(error.receipt.outcome, "source-replaced");
    assert.equal(error.receipt.cancelled, true);
    assert.equal(error.receipt.workerStarted, true);
    assert.deepEqual(error.receipt.workerCancellation, {
      outcome: "cancelled",
      cooperativeCancellation: true,
      lastPhase: "model-opened",
      cleanup: {
        modelClosed: true,
        engineDisposed: true,
      },
      workerTerminationRequested: true,
    });
    return true;
  });
  const result = await second;
  assert.equal(result.report.source.id, "second-source");
  assert.equal(result.sourceSession.outcome, "completed");
  assert.equal(session.active, false);
});

test("Browser source session cancels a pending Blob read on replacement", async () => {
  let releaseRead;
  const inspect = async (_bytes, options) => ({
    report: {
      source: {
        id: options.sourceId,
        kind: options.sourceKind,
      },
    },
    receipt: {
      outcome: "completed",
    },
  });
  const session = new BrowserIfcSourceSession({
    inspect,
  });
  const first = session.inspect({
    size: 1,
    async arrayBuffer() {
      return await new Promise((resolve) => {
        releaseRead = resolve;
      });
    },
  }, {
    sourceId: "first-source",
  });
  await Promise.resolve();
  const second = session.inspect(new Blob(["b"]), {
    sourceId: "second-source",
  });
  await assert.rejects(first, (error) => {
    assert.ok(error instanceof BrowserSourceSessionError);
    assert.equal(error.receipt.outcome, "source-replaced");
    assert.equal(error.receipt.workerStarted, false);
    assert.equal(error.receipt.cancelled, true);
    return true;
  });
  releaseRead(new Uint8Array([1]).buffer);
  assert.equal((await second).report.source.id, "second-source");
});

test("Browser source admission is bounded and omits file names", async () => {
  let inspectOptions;
  const session = new BrowserIfcSourceSession({
    inspect: async (_bytes, options) => {
      inspectOptions = options;
      return {
        report: {
          source: {
            id: options.sourceId,
            kind: options.sourceKind,
          },
        },
        receipt: {
          outcome: "completed",
        },
      };
    },
    maxSourceBytes: 4,
  });
  const privateNameSource = {
    name: "private-customer.ifc",
    size: 3,
    async arrayBuffer() {
      return new Uint8Array([1, 2, 3]).buffer;
    },
  };
  const result = await session.inspect(privateNameSource);
  assert.deepEqual(
    {
      sourceId: inspectOptions.sourceId,
      sourceKind: inspectOptions.sourceKind,
    },
    {
      sourceId: "local-ifc",
      sourceKind: "local-file",
    },
  );
  assert.doesNotMatch(
    JSON.stringify(result),
    /private-customer|\.ifc/u,
  );

  await assert.rejects(
    session.inspect({
      name: "oversized.ifc",
      size: 5,
      async arrayBuffer() {
        throw new Error("must not read");
      },
    }),
    (error) => {
      assert.ok(error instanceof BrowserSourceSessionError);
      assert.equal(error.receipt.outcome, "source-limit");
      assert.equal(error.receipt.maxSourceBytes, 4);
      assert.doesNotMatch(JSON.stringify(error.receipt), /\.ifc/u);
      return true;
    },
  );

  let read = false;
  await assert.rejects(
    session.inspect({
      size: 1,
      async arrayBuffer() {
        read = true;
        return new Uint8Array([1]).buffer;
      },
    }, {
      sourceId: "private/customer.ifc",
    }),
    /invalid Browser Worker source descriptor/u,
  );
  assert.equal(read, false);
  assert.throws(
    () => session.cancel("private/customer.ifc"),
    /invalid Browser source cancellation outcome/u,
  );

  let workerStarts = 0;
  const mismatched = new BrowserIfcSourceSession({
    inspect: async () => {
      workerStarts += 1;
    },
    maxSourceBytes: 4,
  });
  await assert.rejects(
    mismatched.inspect({
      size: 1,
      async arrayBuffer() {
        return new Uint8Array([1, 2, 3, 4, 5]).buffer;
      },
    }),
    (error) => {
      assert.ok(error instanceof BrowserSourceSessionError);
      assert.equal(error.receipt.outcome, "source-size-mismatch");
      assert.equal(error.receipt.workerStarted, false);
      return true;
    },
  );
  assert.equal(workerStarts, 0);
});

test("Browser source session disposal is terminal", async () => {
  const session = new BrowserIfcSourceSession({
    inspect: async () => {
      throw new Error("must not inspect");
    },
  });
  session.dispose();
  await assert.rejects(
    session.inspect(new Blob(["source"])),
    (error) => {
      assert.ok(error instanceof BrowserSourceSessionError);
      assert.equal(error.receipt.outcome, "session-disposed");
      assert.equal(error.receipt.disposed, true);
      return true;
    },
  );
});

test("loopback probe server exposes only bounded same-origin resources", async (t) => {
  const publicFixtureBytes = Buffer.from(
    "ISO-10303-21;\nEND-ISO-10303-21;\n",
    "utf8",
  );
  const server = createBrowserWorkerProbeServer({
    publicFixtureProvider: async () => publicFixtureBytes,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    server.close();
    await once(server, "close");
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;

  const page = await fetch(`${origin}/`);
  assert.equal(page.status, 200);
  assert.match(
    page.headers.get("content-security-policy") ?? "",
    /worker-src 'self'/u,
  );
  const pageHtml = await page.text();
  assert.match(pageHtml, /Run synthetic IFC probe/u);
  assert.match(pageHtml, /Run cancellation probe/u);
  assert.match(pageHtml, /Run in-call isolation probe/u);
  assert.match(pageHtml, /Run negative corpus probe/u);
  assert.match(pageHtml, /Run performance probe/u);
  assert.match(pageHtml, /Run public representative probe/u);
  assert.match(pageHtml, /Open local IFC/u);

  const fixture = await fetch(`${origin}/fixture/synthetic-small.ifc`);
  const bytes = Buffer.from(await fixture.arrayBuffer());
  const expected = Buffer.from(syntheticIfc(), "utf8");
  assert.equal(fixture.headers.get("content-type"), "model/vnd.ifc");
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    createHash("sha256").update(expected).digest("hex"),
  );
  const performanceFixture = await fetch(
    `${origin}/fixture/synthetic-performance.ifc`,
  );
  const performanceBytes = Buffer.from(
    await performanceFixture.arrayBuffer(),
  );
  assert.equal(
    performanceBytes.byteLength,
    BROWSER_PERFORMANCE_FIXTURE.byteLength,
  );
  assert.equal(
    createHash("sha256").update(performanceBytes).digest("hex"),
    BROWSER_PERFORMANCE_FIXTURE.sha256,
  );
  assert.equal(
    performanceBytes.toString("utf8"),
    syntheticPerformanceIfc(),
  );
  const negativeManifestResponse = await fetch(
    `${origin}/fixture/negative-corpus.json`,
  );
  const negativeManifest = await negativeManifestResponse.json();
  const negativeCorpus = syntheticNegativeIfcCorpus();
  assert.equal(
    negativeManifest.fixtureId,
    "synthetic-negative-ifc-corpus",
  );
  assert.equal(negativeManifest.cases.length, negativeCorpus.length);
  for (const negative of negativeCorpus) {
    const response = await fetch(
      `${origin}/fixture/negative/${negative.id}.ifc`,
    );
    const negativeBytes = Buffer.from(await response.arrayBuffer());
    assert.equal(response.headers.get("content-type"), "model/vnd.ifc");
    assert.equal(negativeBytes.byteLength, negative.byteLength);
    assert.equal(
      createHash("sha256").update(negativeBytes).digest("hex"),
      negative.sha256,
    );
  }
  const publicFixture = await fetch(
    `${origin}/fixture/public-representative.ifc`,
  );
  assert.deepEqual(
    Buffer.from(await publicFixture.arrayBuffer()),
    publicFixtureBytes,
  );

  const moduleHead = await fetch(`${origin}/vendor/web-ifc-api.js`, {
    method: "HEAD",
  });
  const wasmHead = await fetch(`${origin}/vendor/web-ifc.wasm`, {
    method: "HEAD",
  });
  assert.equal(moduleHead.status, 200);
  assert.equal(
    (await fetch(`${origin}/source-session.mjs`, {
      method: "HEAD",
    })).status,
    200,
  );
  assert.equal(
    (await fetch(`${origin}/performance-budget.mjs`, {
      method: "HEAD",
    })).status,
    200,
  );
  assert.equal(wasmHead.headers.get("content-type"), "application/wasm");
  assert.equal((await fetch(`${origin}/not-allowed`)).status, 404);
});
