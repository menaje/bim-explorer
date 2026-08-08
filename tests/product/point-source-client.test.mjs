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

class FakeLodWorker {
  #listeners = new Map();
  requests = [];
  terminated = false;

  addEventListener(type, listener) {
    const listeners = this.#listeners.get(type) ?? [];
    listeners.push(listener);
    this.#listeners.set(type, listeners);
  }

  #emit(data) {
    for (const listener of this.#listeners.get("message") ?? []) {
      listener({ data });
    }
  }

  postMessage(request) {
    assert.equal(request.schema, POINT_SOURCE_WORKER_REQUEST);
    this.requests.push(request.type);
    queueMicrotask(() => {
      if (request.type === "open") {
        const bytes = new Uint8Array(80);
        const pointMap = Uint32Array.from([0, 2]);
        this.#emit({
          schema: POINT_SOURCE_WORKER_RESPONSE,
          requestId: request.requestId,
          type: "result",
          value: {
            artifact: {
              schema: "bim-explorer-e57-point-source/0.1",
              source: {
                byteLength: request.bytes.byteLength,
                coordinateReferenceStatus: "unqualified",
                fingerprint: `sha256:${"1".repeat(64)}`,
                format: "e57",
                pointFormat: "cartesian-xyz-multiple-scan",
                revisionId: "source-snapshot:fake-lod",
                semanticAuthority: false,
                sourceRole: "derived-or-reference-points",
              },
              model: { points: 4, ranges: 1 },
              hierarchy: fakeHierarchy(),
              rootRange: {
                byteLength: 112,
                handleId: "range:fake:root",
                mediaType:
                  "application/vnd.bim-explorer.point-range.v1",
                sha256: "3".repeat(64),
              },
              range: {
                byteLength: 80,
                bytes,
                handleId: "range:fake:lod:0",
                identityRangeHandleId: "range:fake:root",
                identityRangeSha256: "3".repeat(64),
                lod: fakeLod(0, 2, 2, false),
                mediaType:
                  "application/vnd.bim-explorer.point-range.v1",
                pointIndices: pointMap,
                sha256: "4".repeat(64),
                sourcePointCount: 4,
              },
              resources: {
                inputBytes: request.bytes.byteLength,
                pointRangeBytes: 112,
                pointRangePayloadBytes: 64,
              },
              cleanup: {
                cpuProjectionBuffersReleased: true,
                decoderReleased: true,
                wasmAllocationsReleased: true,
              },
            },
            cleanup: {
              hierarchyContract:
                "bim-explorer-derived-point-hierarchy/0.1",
              pointRangeTransferred: true,
              sourceBufferCleared: true,
              workerRetainedForLod: true,
              workerRetainedUntilClientReceipt: true,
            },
            performance: { totalMs: 1 },
          },
        });
      } else if (request.type === "read-lod") {
        const bytes = new Uint8Array(112);
        this.#emit({
          schema: POINT_SOURCE_WORKER_RESPONSE,
          requestId: request.requestId,
          type: "result",
          value: {
            hierarchyId: "point-hierarchy:fake",
            range: {
              byteLength: 112,
              bytes,
              handleId: "range:fake:root",
              identityRangeHandleId: "range:fake:root",
              identityRangeSha256: "3".repeat(64),
              lod: fakeLod(1, 4, 1, true),
              mediaType:
                "application/vnd.bim-explorer.point-range.v1",
              pointIndices: null,
              sha256: "3".repeat(64),
              sourcePointCount: 4,
            },
            receipt: {
              schema:
                "bim-explorer-derived-point-lod-range-receipt/0.1",
              identityMapBytes: 0,
              level: fakeLod(1, 4, 1, true),
              rangeBytes: 112,
              rootRangeSha256: "3".repeat(64),
            },
          },
        });
      } else if (request.type === "dispose-lod") {
        this.#emit({
          schema: POINT_SOURCE_WORKER_RESPONSE,
          requestId: request.requestId,
          type: "result",
          value: {
            cleanup: {
              disposed: true,
              hierarchyId: "point-hierarchy:fake",
              indexBytes: 0,
              retainedBytes: 0,
              rootRangeBytes: 0,
            },
          },
        });
      }
    });
  }

  terminate() {
    this.terminated = true;
  }
}

function fakeLod(levelIndex, pointCount, stride, fullDetail) {
  return {
    chunkCount: 1,
    fullDetail,
    hierarchyId: "point-hierarchy:fake",
    levelId: `lod:${levelIndex}`,
    levelIndex,
    pointCount,
    selectionSha256: "5".repeat(64),
    stride,
  };
}

function fakeHierarchy() {
  return {
    contract: "bim-explorer-derived-point-hierarchy/0.1",
    chunks: [{ id: "r", pointCount: 4 }],
    depth: 0,
    digest: "6".repeat(64),
    hierarchyId: "point-hierarchy:fake",
    identity: {
      authority: "derived-point-range-order",
      rangeHandleId: "range:fake:root",
      rangeSha256: "3".repeat(64),
      scope: "source-revision-and-root-range-digest",
    },
    initialLevelId: "lod:0",
    levels: [
      {
        fullDetail: false,
        id: "lod:0",
        index: 0,
        pointCount: 2,
        rangeBytes: 80,
        stride: 2,
      },
      {
        fullDetail: true,
        id: "lod:1",
        index: 1,
        pointCount: 4,
        rangeBytes: 112,
        stride: 1,
      },
    ],
    source: {
      fingerprint: `sha256:${"1".repeat(64)}`,
      revisionId: "source-snapshot:fake-lod",
      semanticAuthority: false,
    },
    sourcePointCount: 4,
  };
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
        pointFormat: request.options.format === "e57"
          ? "cartesian-xyz-rgb"
          : 3,
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
        pointRangePayloadBytes: rangeBytes.byteLength - 48,
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

test("point source client reads LOD levels and releases retained hierarchy", async () => {
  const worker = new FakeLodWorker();
  const client = createPointSourceWorkerClient(
    options(() => worker),
  );
  const opened = await client.open(
    Uint8Array.from([1, 2, 3, 4]),
    { format: "e57", hierarchy: true },
  );
  assert.equal(opened.artifact.hierarchy.levels.length, 2);
  assert.equal(opened.artifact.range.lod.levelId, "lod:0");
  assert.deepEqual(
    [...opened.artifact.range.pointIndices],
    [0, 2],
  );
  assert.equal(opened.cleanup.workerTerminatedAfterTransfer, false);
  assert.equal(client.state.hierarchyActive, true);
  assert.equal(client.state.workerActive, true);

  const detail = await client.readLod("lod:1");
  assert.equal(detail.range.lod.fullDetail, true);
  assert.equal(detail.range.pointIndices, null);
  assert.equal(client.state.lodReads, 1);

  const cleanup = await client.releaseHierarchy();
  assert.equal(cleanup.retainedBytes, 0);
  assert.equal(worker.terminated, true);
  assert.equal(client.state.hierarchyActive, false);
  assert.equal(client.state.workerActive, false);
  assert.deepEqual(worker.requests, ["open", "read-lod", "dispose-lod"]);
  opened.artifact.range.bytes.fill(0);
  opened.artifact.range.pointIndices.fill(0);
  detail.range.bytes.fill(0);
  assert.equal(await client.dispose(), true);
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
