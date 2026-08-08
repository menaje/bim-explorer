import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import test from "node:test";

import {
  LAZ_WORKER_PHASES,
  LAZ_WORKER_PROGRESS_SCHEMA,
  LAZ_WORKER_RESULT_SCHEMA,
  LazWorkerError,
  decodeLazInBrowserWorker,
} from "../../apps/las-laz-worker-probe/worker-client.mjs";
import {
  validateLasLazBrowserWorkerQualification,
} from "../../scripts/qualify-las-laz-browser-worker.mjs";
import {
  createLasLazWorkerProbeServer,
} from "../../scripts/serve-las-laz-worker-probe.mjs";

function progress(requestId, phase) {
  return {
    schema: LAZ_WORKER_PROGRESS_SCHEMA,
    requestId,
    status: "progress",
    phase,
  };
}

function cleanup() {
  return {
    decoderReleased: true,
    wasmAllocationsReleased: true,
    sourceBufferCleared: true,
    moduleRetainedUntilWorkerTermination: true,
  };
}

function source(request) {
  return {
    id: request.source.id,
    format: "laz",
    byteLength: request.bytes.byteLength,
    sha256: "0".repeat(64),
  };
}

function successReport(request) {
  return {
    schema: LAZ_WORKER_RESULT_SCHEMA,
    requestId: request.requestId,
    status: "passed",
    decoder: {
      id: "laz-perf",
      version: "0.0.6",
      backend: "browser-wasm-worker-qualification",
      license: "Apache-2.0",
    },
    source: source(request),
    header: {
      formatVersion: "1.2",
      pointFormat: 3,
      pointRecordLength: 34,
      pointRecords: 10_201,
    },
    profile: {
      pointRecords: 10_201,
      pointRecordSha256: "1".repeat(64),
      decodedBounds: {
        min: [0, 0, 0],
        max: [1, 1, 1],
      },
      colorRange: {
        min: [0, 0, 0],
        max: [1, 1, 1],
      },
    },
    performance: {
      initializationMs: 1,
      decodeMs: 1,
      totalMs: 2,
    },
    resources: {
      inputBytes: request.bytes.byteLength,
      decodedPointBytes: 346_834,
      wasmHeapCapacityBytes: {
        afterInitialization: 262_144,
        afterDecode: 4_063_232,
        peakObserved: 4_063_232,
      },
    },
    cleanup: cleanup(),
    diagnostics: [],
  };
}

function cancellationReport(request, phase) {
  return {
    schema: LAZ_WORKER_RESULT_SCHEMA,
    requestId: request.requestId,
    status: "cancelled",
    phase,
    decoder: {
      id: "laz-perf",
      version: "0.0.6",
      backend: "browser-wasm-worker-qualification",
      license: "Apache-2.0",
    },
    source: source(request),
    cleanup: cleanup(),
    diagnostics: [],
  };
}

function failureReport(request) {
  return {
    schema: LAZ_WORKER_RESULT_SCHEMA,
    requestId: request.requestId,
    status: "failed",
    decoder: {
      id: "laz-perf",
      version: "0.0.6",
      backend: "browser-wasm-worker-qualification",
      license: "Apache-2.0",
    },
    source: source(request),
    failure: {
      code: "BROWSER_LAZ_INPUT_REJECTED",
      phase: "point-decode",
    },
    cleanup: cleanup(),
    diagnostics: [
      { code: "BROWSER_LAZ_INPUT_REJECTED" },
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

  emit(type, data) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(type === "message" ? { data } : {});
    }
  }

  postMessage(message) {
    if (message.type === "decode") {
      this.request = message;
      if (this.action === "pending") {
        return;
      }
      this.phaseIndex = 0;
      queueMicrotask(() => {
        this.emit(
          "message",
          progress(
            message.requestId,
            LAZ_WORKER_PHASES[this.phaseIndex],
          ),
        );
      });
      return;
    }
    if (message.type === "cancel") {
      if (this.action === "cooperative") {
        queueMicrotask(() => {
          this.emit(
            "message",
            cancellationReport(
              this.request,
              LAZ_WORKER_PHASES[this.phaseIndex],
            ),
          );
        });
      }
      return;
    }
    if (message.type !== "continue") {
      return;
    }
    if (
      this.action === "forced" &&
      this.phaseIndex === 2
    ) {
      return;
    }
    if (
      this.action === "failure" &&
      this.phaseIndex === 2
    ) {
      queueMicrotask(() => {
        this.emit("message", failureReport(this.request));
      });
      return;
    }
    if (this.phaseIndex < LAZ_WORKER_PHASES.length - 1) {
      this.phaseIndex += 1;
      queueMicrotask(() => {
        this.emit(
          "message",
          progress(
            this.request.requestId,
            LAZ_WORKER_PHASES[this.phaseIndex],
          ),
        );
      });
      return;
    }
    queueMicrotask(() => {
      const report = successReport(this.request);
      if (this.action === "path-leak") {
        report.sourcePath = "/private/customer.laz";
      }
      this.emit("message", report);
    });
  }

  terminate() {
    this.terminated = true;
  }
}

test("LAZ Worker client validates bounded decode and cleanup", async () => {
  const worker = new FakeWorker();
  const result = await decodeLazInBrowserWorker(
    new Uint8Array([1, 2, 3]).buffer,
    { workerFactory: () => worker },
  );
  assert.equal(result.report.profile.pointRecords, 10_201);
  assert.equal(result.receipt.outcome, "completed");
  assert.equal(result.receipt.lastPhase, "decode-complete");
  assert.equal(result.receipt.explicitCleanup, true);
  assert.equal(result.receipt.workerTerminationRequested, true);
  assert.equal(worker.terminated, true);
});

test("LAZ Worker client distinguishes checkpoint and in-call cancellation", async () => {
  const cooperativeWorker = new FakeWorker("cooperative");
  const cooperativeCancellation = new AbortController();
  await assert.rejects(
    decodeLazInBrowserWorker(new Uint8Array([1]).buffer, {
      onProgress(value) {
        if (value.phase === "decoder-initialized") {
          cooperativeCancellation.abort();
        }
      },
      signal: cooperativeCancellation.signal,
      workerFactory: () => cooperativeWorker,
    }),
    (error) => {
      assert.ok(error instanceof LazWorkerError);
      assert.equal(error.receipt.outcome, "cancelled-cooperative");
      assert.equal(error.receipt.explicitCleanup, true);
      assert.equal(error.receipt.lastPhase, "decoder-initialized");
      return true;
    },
  );

  const forcedWorker = new FakeWorker("forced");
  const forcedCancellation = new AbortController();
  await assert.rejects(
    decodeLazInBrowserWorker(new Uint8Array([1]).buffer, {
      cancellationGraceMs: 1,
      onProgress(value) {
        if (value.phase === "decode-call-starting") {
          setTimeout(() => forcedCancellation.abort(), 0);
        }
      },
      signal: forcedCancellation.signal,
      workerFactory: () => forcedWorker,
    }),
    (error) => {
      assert.ok(error instanceof LazWorkerError);
      assert.equal(error.receipt.outcome, "cancelled-forced");
      assert.equal(error.receipt.explicitCleanup, false);
      assert.equal(error.receipt.lastPhase, "decode-call-starting");
      assert.equal(forcedWorker.terminated, true);
      return true;
    },
  );
});

test("LAZ Worker client bounds timeout, rejection and path exposure", async () => {
  const pending = new FakeWorker("pending");
  await assert.rejects(
    decodeLazInBrowserWorker(new Uint8Array([1]).buffer, {
      timeoutMs: 1,
      workerFactory: () => pending,
    }),
    (error) => {
      assert.equal(error.receipt.outcome, "timed-out");
      assert.equal(error.receipt.explicitCleanup, false);
      return true;
    },
  );

  const rejected = new FakeWorker("failure");
  await assert.rejects(
    decodeLazInBrowserWorker(new Uint8Array([1]).buffer, {
      workerFactory: () => rejected,
    }),
    (error) => {
      assert.equal(error.receipt.outcome, "input-rejected");
      assert.equal(error.receipt.rejection.phase, "point-decode");
      assert.equal(error.receipt.explicitCleanup, true);
      return true;
    },
  );

  const leaking = new FakeWorker("path-leak");
  await assert.rejects(
    decodeLazInBrowserWorker(new Uint8Array([1]).buffer, {
      workerFactory: () => leaking,
    }),
    (error) => {
      assert.equal(error.receipt.outcome, "protocol-failed");
      assert.doesNotMatch(JSON.stringify(error), /customer|private/u);
      return true;
    },
  );
  await assert.rejects(
    decodeLazInBrowserWorker(
      new ArrayBuffer(8 * 1024 * 1024 + 1),
    ),
    /bounded/u,
  );
});

test("LAS/LAZ Worker loopback server clears fixture buffers", async (t) => {
  const prepared = {
    input: {
      schema: "bim-explorer-laz-worker-probe-input/0.1",
      fixture: { byteLength: 256 },
    },
    lazBytes: Buffer.alloc(256, 1),
    truncatedBytes: Buffer.alloc(128, 2),
  };
  const server = createLasLazWorkerProbeServer(prepared);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    if (server.listening) {
      server.close();
    }
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${origin}/fixture/public.laz`);
  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-security-policy"),
    /worker-src 'self'/u,
  );
  assert.equal((await response.arrayBuffer()).byteLength, 256);
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  assert.equal(server.probeState.buffersCleared, true);
  assert.equal(prepared.lazBytes.every((value) => value === 0), true);
  assert.equal(
    prepared.truncatedBytes.every((value) => value === 0),
    true,
  );
});

test("committed LAS/LAZ Browser Worker evidence stays pre-admission", async () => {
  const report = JSON.parse(await readFile(
    "compatibility/evidence/" +
      "las-laz-browser-worker-2026-08-08.json",
    "utf8",
  ));
  assert.equal(
    validateLasLazBrowserWorkerQualification(report),
    report,
  );
  const overclaim = structuredClone(report);
  overclaim.decision.pointRenderer = "passed";
  assert.throws(
    () => validateLasLazBrowserWorkerQualification(overclaim),
    /evidence is invalid/u,
  );
});
