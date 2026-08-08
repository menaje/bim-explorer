import assert from "node:assert/strict";
import test from "node:test";

import {
  POINT_SOURCE_WORKER_REQUEST,
  POINT_SOURCE_WORKER_RESPONSE,
  createLasLazPointSourceWorkerClient,
  createPointSourceWorkerClient,
} from "../../apps/bim-explorer-web/point-source-client.mjs";

class FakeWorker {
  #listeners = new Map();
  #mode;
  openFormat = null;
  terminated = false;

  constructor(mode = "success") {
    this.#mode = mode;
  }

  addEventListener(type, listener) {
    const listeners = this.#listeners.get(type) ?? [];
    listeners.push(listener);
    this.#listeners.set(type, listeners);
  }

  #emit(type, data) {
    for (const listener of this.#listeners.get(type) ?? []) {
      listener({ data });
    }
  }

  postMessage(request) {
    assert.equal(request.schema, POINT_SOURCE_WORKER_REQUEST);
    this.openFormat = request.options.format;
    if (this.#mode === "pending") {
      return;
    }
    queueMicrotask(() => {
      this.#emit("message", {
        schema: POINT_SOURCE_WORKER_RESPONSE,
        requestId: request.requestId,
        type: "progress",
        value: { phase: "source-admitted" },
      });
      if (this.#mode === "error") {
        this.#emit("message", {
          schema: POINT_SOURCE_WORKER_RESPONSE,
          requestId: request.requestId,
          type: "error",
          value: {
            code: "POINT_SOURCE_OPEN_FAILED",
            retryable: true,
          },
        });
        return;
      }
      const result = success(request);
      if (this.#mode === "path-leak") {
        result.artifact.source.sourcePath =
          "/private/customer.laz";
      }
      this.#emit("message", {
        schema: POINT_SOURCE_WORKER_RESPONSE,
        requestId: request.requestId,
        type: "result",
        value: result,
      });
    });
  }

  terminate() {
    this.terminated = true;
  }
}

function success(request) {
  const rangeBytes = new Uint8Array(64);
  return {
    artifact: {
      schema: request.options.format === "e57"
        ? "bim-explorer-e57-point-source/0.1"
        : "bim-explorer-las-laz-point-source/0.1",
      source: {
        byteLength: request.bytes.byteLength,
        coordinateReferenceStatus: "unqualified",
        fingerprint: `sha256:${"1".repeat(64)}`,
        format: request.options.format,
        revisionId: "source-snapshot:fake",
        semanticAuthority: false,
        sourceRole: "derived-or-reference-points",
      },
      model: {
        points: 1,
        ranges: 1,
      },
      range: {
        byteLength: rangeBytes.byteLength,
        bytes: rangeBytes,
        handleId: "range:fake",
        mediaType:
          "application/vnd.bim-explorer.point-range.v1",
        sha256: "2".repeat(64),
      },
      resources: {
        inputBytes: request.bytes.byteLength,
        pointRangeBytes: rangeBytes.byteLength,
      },
      cleanup: {
        cpuProjectionBuffersReleased: true,
        decoderReleased: true,
        wasmAllocationsReleased: true,
      },
    },
    cleanup: {
      pointRangeTransferred: true,
      sourceBufferCleared: true,
      workerRetainedUntilClientReceipt: true,
    },
    performance: {
      totalMs: 1,
    },
  };
}

function options(workerFactory) {
  return {
    lazPerfScriptUrl:
      "https://local.invalid/vendor/laz-perf.js",
    lazPerfWasmUrl:
      "https://local.invalid/vendor/laz-perf.wasm",
    workerFactory,
    workerUrl:
      "https://local.invalid/point-source-worker.bundle.js",
  };
}

test("point source client transfers one bounded range and terminates its Worker", async () => {
  const worker = new FakeWorker();
  const phases = [];
  const client = createLasLazPointSourceWorkerClient(
    options(() => worker),
  );
  client.onProgress((value) => phases.push(value.phase));
  const opened = await client.open(
    Uint8Array.from([1, 2, 3, 4]),
    { format: "laz" },
  );
  assert.equal(worker.openFormat, "laz");
  assert.equal(worker.terminated, true);
  assert.deepEqual(phases, ["source-admitted"]);
  assert.equal(opened.artifact.range.bytes.byteLength, 64);
  assert.equal(
    opened.cleanup.workerTerminatedAfterTransfer,
    true,
  );
  assert.equal(client.state.workerActive, false);
  assert.equal(client.state.terminations, 1);
  assert.equal(await client.dispose(), true);
  assert.equal(await client.dispose(), false);
});

test("generic point source client accepts the bounded E57 contract", async () => {
  const worker = new FakeWorker();
  const client = createPointSourceWorkerClient(
    options(() => worker),
  );
  const opened = await client.open(
    Uint8Array.from([1, 2, 3, 4]),
    { format: "e57" },
  );
  assert.equal(worker.openFormat, "e57");
  assert.equal(
    opened.artifact.schema,
    "bim-explorer-e57-point-source/0.1",
  );
  assert.equal(worker.terminated, true);
  await client.dispose();
});

test("point source client bounds input, timeout, rejection and path exposure", async () => {
  const oversized = createLasLazPointSourceWorkerClient({
    ...options(() => new FakeWorker()),
    limits: {
      maximumSourceBytes: 3,
      openTimeoutMs: 100,
    },
  });
  await assert.rejects(
    oversized.open(Uint8Array.from([1, 2, 3, 4]), {
      format: "las",
    }),
    /byte limit/u,
  );
  await oversized.dispose();

  const rejectedWorker = new FakeWorker("error");
  const rejected = createLasLazPointSourceWorkerClient(
    options(() => rejectedWorker),
  );
  await assert.rejects(
    rejected.open(Uint8Array.from([1]), { format: "las" }),
    /POINT_SOURCE_OPEN_FAILED/u,
  );
  assert.equal(rejectedWorker.terminated, true);
  await rejected.dispose();

  const leakingWorker = new FakeWorker("path-leak");
  const leaking = createLasLazPointSourceWorkerClient(
    options(() => leakingWorker),
  );
  await assert.rejects(
    leaking.open(Uint8Array.from([1]), { format: "laz" }),
    /exposes a path/u,
  );
  assert.equal(leakingWorker.terminated, true);
  await leaking.dispose();

  const pendingWorker = new FakeWorker("pending");
  const pending = createLasLazPointSourceWorkerClient({
    ...options(() => pendingWorker),
    limits: {
      maximumSourceBytes: 8,
      openTimeoutMs: 1,
    },
  });
  await assert.rejects(
    pending.open(Uint8Array.from([1]), { format: "las" }),
    /POINT_SOURCE_OPEN_TIMEOUT/u,
  );
  assert.equal(pendingWorker.terminated, true);
  await pending.dispose();
});

test("point source client forced cancellation rejects the active open", async () => {
  const worker = new FakeWorker("pending");
  const client = createLasLazPointSourceWorkerClient(
    options(() => worker),
  );
  const opening = client.open(
    Uint8Array.from([1, 2, 3]),
    { format: "laz" },
  );
  assert.equal(client.terminate(), true);
  await assert.rejects(opening, /POINT_SOURCE_WORKER_TERMINATED/u);
  assert.equal(worker.terminated, true);
  await client.dispose();
});
