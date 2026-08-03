import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import test from "node:test";

import {
  BROWSER_WORKER_RESULT_SCHEMA,
  BrowserWorkerError,
  inspectIfcInBrowserWorker,
} from "../../apps/browser-worker-probe/worker-client.mjs";
import { createBrowserWorkerProbeServer } from
  "../../scripts/serve-browser-worker-probe.mjs";
import { syntheticIfc } from "../../scripts/generate-synthetic-ifc.mjs";

function report(requestId, byteLength) {
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
    fixture: {
      id: "synthetic-small-ifc4",
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
          data: report(message.requestId, message.bytes.byteLength),
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
  assert.match(await page.text(), /Run synthetic IFC probe/u);

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
  assert.equal(wasmHead.headers.get("content-type"), "application/wasm");
  assert.equal((await fetch(`${origin}/not-allowed`)).status, 404);
});
