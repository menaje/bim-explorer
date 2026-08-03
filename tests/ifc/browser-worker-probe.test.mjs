import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import test from "node:test";

import {
  BROWSER_WORKER_RESULT_SCHEMA,
  BrowserWorkerError,
  inspectIfcInBrowserWorker,
} from "../../apps/browser-worker-probe/worker-client.mjs";
import {
  BrowserIfcSourceSession,
  BrowserSourceSessionError,
} from "../../apps/browser-worker-probe/source-session.mjs";
import { createBrowserWorkerProbeServer } from
  "../../scripts/serve-browser-worker-probe.mjs";
import { syntheticIfc } from "../../scripts/generate-synthetic-ifc.mjs";

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
      totalMs: 1,
    },
    cleanup: {
      modelClosed: true,
      engineDisposed: true,
    },
    diagnostics: [],
  };
}

class FakeWorker {
  constructor(action = "success") {
    this.action = action;
    this.listeners = new Map();
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
    if (this.action === "success") {
      queueMicrotask(() => {
        this.emit("message", {
          data: report(
            message.requestId,
            message.bytes.byteLength,
            message.source,
          ),
        });
      });
    } else if (this.action === "error") {
      queueMicrotask(() => {
        this.emit("error", {
          message: "/private/customer.ifc",
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

test("Browser Worker client aborts a pending request", async () => {
  const worker = new FakeWorker("pending");
  const cancellation = new AbortController();
  const running = inspectIfcInBrowserWorker(
    new Uint8Array([1]).buffer,
    {
      signal: cancellation.signal,
      workerFactory: () => worker,
    },
  );
  cancellation.abort();
  await assert.rejects(running, (error) => {
    assert.ok(error instanceof BrowserWorkerError);
    assert.equal(error.receipt.outcome, "cancelled");
    assert.equal(error.receipt.cancelled, true);
    assert.equal(worker.terminated, true);
    return true;
  });
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
              outcome: "cancelled",
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
  const server = createBrowserWorkerProbeServer();
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
  assert.match(pageHtml, /Open local IFC/u);

  const fixture = await fetch(`${origin}/fixture/synthetic-small.ifc`);
  const bytes = Buffer.from(await fixture.arrayBuffer());
  const expected = Buffer.from(syntheticIfc(), "utf8");
  assert.equal(fixture.headers.get("content-type"), "model/vnd.ifc");
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    createHash("sha256").update(expected).digest("hex"),
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
  assert.equal(wasmHead.headers.get("content-type"), "application/wasm");
  assert.equal((await fetch(`${origin}/not-allowed`)).status, 404);
});
