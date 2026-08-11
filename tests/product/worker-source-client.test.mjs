import assert from "node:assert/strict";
import test from "node:test";

import {
  BIM_PRODUCT_SOURCE_WORKER_REQUEST,
  BIM_PRODUCT_SOURCE_WORKER_RESPONSE,
  createBimProductSourceWorkerClient,
} from "../../apps/bim-explorer-web/worker-source-client.mjs";

class FakeWorker {
  #listeners = new Map();
  #silent;
  terminated = false;
  openFormat = null;
  openResources = null;

  constructor({ silent = false } = {}) {
    this.#silent = silent;
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
    assert.equal(
      request.schema,
      BIM_PRODUCT_SOURCE_WORKER_REQUEST,
    );
    if (this.#silent) {
      return;
    }
    queueMicrotask(() => {
      if (request.type === "open") {
        this.openFormat = request.options.format;
        this.openResources = request.resources.map((resource) => ({
          uri: resource.uri,
          bytes: [...new Uint8Array(resource.bytes)],
        }));
        this.#emit("message", {
          schema: BIM_PRODUCT_SOURCE_WORKER_RESPONSE,
          requestId: request.requestId,
          type: "progress",
          value: {
            phase: "source-admitted",
          },
        });
        this.#emit("message", {
          schema: BIM_PRODUCT_SOURCE_WORKER_RESPONSE,
          requestId: request.requestId,
          type: "result",
          value: {
            descriptor: {
              sourceFingerprint: "sha256:fake",
            },
            diagnostics: [],
            performance: {
              totalMs: 1,
            },
            resources: {
              sourceBytes: request.bytes.byteLength,
            },
            snapshot: {
              revisionId: "revision:fake",
            },
          },
        });
      } else if (
        request.type === "operation" &&
        request.operation === "readRange"
      ) {
        this.#emit("message", {
          schema: BIM_PRODUCT_SOURCE_WORKER_RESPONSE,
          requestId: request.requestId,
          type: "result",
          value: Uint8Array.from([1, 2, 3]).buffer,
        });
      } else if (request.type === "operation") {
        this.#emit("message", {
          schema: BIM_PRODUCT_SOURCE_WORKER_RESPONSE,
          requestId: request.requestId,
          type: "result",
          value: {
            operation: request.operation,
          },
        });
      } else if (request.type === "release") {
        this.#emit("message", {
          schema: BIM_PRODUCT_SOURCE_WORKER_RESPONSE,
          requestId: request.requestId,
          type: "result",
          value: {
            sessionDisposed: true,
            sourceDisposed: true,
          },
        });
      } else if (request.type === "shutdown") {
        this.#emit("message", {
          schema: BIM_PRODUCT_SOURCE_WORKER_RESPONSE,
          requestId: request.requestId,
          type: "result",
          value: {
            workerClosed: true,
          },
        });
      }
    });
  }

  terminate() {
    this.terminated = true;
  }
}

function options(workerFactory) {
  return {
    wasmPath: "https://local.invalid/vendor/",
    webIfcModuleUrl:
      "https://local.invalid/vendor/web-ifc-api.js",
    workerFactory,
    workerUrl:
      "https://local.invalid/source-worker.mjs",
  };
}

test("product Worker client binds session operations and cleanup to one generation", async () => {
  const workers = [];
  const progress = [];
  const client = createBimProductSourceWorkerClient(
    options(() => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    }),
  );
  client.onProgress((value) => progress.push(value.phase));
  const opened = await client.open(
    Uint8Array.from([1, 2, 3, 4]),
  );

  assert.equal(workers[0].openFormat, "ifc");
  assert.equal(opened.snapshot.revisionId, "revision:fake");
  assert.deepEqual(progress, ["source-admitted"]);
  assert.deepEqual(
    [...await opened.session.readRange({}, 0, 3)],
    [1, 2, 3],
  );
  assert.deepEqual(
    await opened.session.queryTree({}),
    { operation: "queryTree" },
  );
  assert.deepEqual(
    await opened.session.getEntityDetails({ expressId: 40 }),
    { operation: "getEntityDetails" },
  );
  assert.deepEqual(
    await opened.session.getPropertySetValues({
      expressId: 40,
    }),
    { operation: "getPropertySetValues" },
  );
  assert.equal(await opened.session.dispose(), true);
  assert.equal(await opened.session.dispose(), false);
  assert.equal(await opened.workerLease.dispose(), true);
  assert.equal(workers[0].terminated, true);
  assert.equal(client.state.workerActive, false);
  assert.equal(await client.dispose(), true);
  assert.equal(await client.dispose(), false);
});

test("product Worker client sends an explicit glTF source format", async () => {
  const worker = new FakeWorker();
  const client = createBimProductSourceWorkerClient(
    options(() => worker),
  );
  const opened = await client.open(
    Uint8Array.from([0x67, 0x6c, 0x54, 0x46]),
    { format: "glb" },
  );
  assert.equal(worker.openFormat, "glb");
  await opened.session.dispose();
  await opened.workerLease.dispose();
  await client.dispose();
  await assert.rejects(
    createBimProductSourceWorkerClient(
      options(() => new FakeWorker()),
    ).open(Uint8Array.from([1]), {
      format: "rvt",
    }),
    /format is unsupported/u,
  );
});

test("product Worker client transfers one bounded local glTF resource bundle", async () => {
  const worker = new FakeWorker();
  const client = createBimProductSourceWorkerClient(
    options(() => worker),
  );
  const callerBytes = Uint8Array.from([5, 6, 7, 8]);
  const opened = await client.open(
    Uint8Array.from([0x7b, 0x7d]),
    {
      format: "gltf",
      resources: [{
        uri: "geometry.bin",
        bytes: callerBytes,
      }],
    },
  );
  assert.deepEqual(worker.openResources, [{
    uri: "geometry.bin",
    bytes: [5, 6, 7, 8],
  }]);
  assert.deepEqual([...callerBytes], [5, 6, 7, 8]);
  await opened.session.dispose();
  await opened.workerLease.dispose();
  await client.dispose();

  for (const uri of [
    "../geometry.bin",
    "nested/geometry.bin",
    "https://example.com/geometry.bin",
  ]) {
    const rejected = createBimProductSourceWorkerClient(
      options(() => new FakeWorker()),
    );
    await assert.rejects(
      rejected.open(Uint8Array.from([1]), {
        format: "gltf",
        resources: [{ uri, bytes: Uint8Array.from([1]) }],
      }),
      /external resource is invalid/u,
    );
    await rejected.dispose();
  }
});

test("source switch invalidates the prior Worker session", async () => {
  const workers = [];
  const client = createBimProductSourceWorkerClient(
    options(() => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    }),
  );
  const first = await client.open(Uint8Array.from([1]));
  const second = await client.open(Uint8Array.from([2]));

  assert.equal(workers[0].terminated, true);
  assert.throws(
    () => first.session.queryTree({}),
    /stale/u,
  );
  assert.deepEqual(
    await second.session.queryRelations({}),
    { operation: "queryRelations" },
  );
  await second.session.dispose();
  await second.workerLease.dispose();
  await client.dispose();
});

test("product Worker client rejects oversized input before Worker creation", async () => {
  let workers = 0;
  const client = createBimProductSourceWorkerClient({
    ...options(() => {
      workers += 1;
      return new FakeWorker();
    }),
    limits: {
      maximumSourceBytes: 3,
      openTimeoutMs: 100,
      operationTimeoutMs: 100,
    },
  });

  await assert.rejects(
    client.open(Uint8Array.from([1, 2, 3, 4])),
    /byte limit/u,
  );
  assert.equal(workers, 0);
  await client.dispose();
});

test("forced cancellation terminates an unresponsive Worker", async () => {
  const worker = new FakeWorker({ silent: true });
  const client = createBimProductSourceWorkerClient(
    options(() => worker),
  );
  const opening = client.open(Uint8Array.from([1, 2, 3]));
  assert.equal(client.terminate(), true);
  await assert.rejects(
    opening,
    /SOURCE_WORKER_TERMINATED/u,
  );
  assert.equal(worker.terminated, true);
  assert.equal(client.state.status, "failed");
  await client.dispose();
});
