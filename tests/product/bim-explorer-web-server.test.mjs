import assert from "node:assert/strict";
import test from "node:test";

import {
  createBimExplorerWebServer,
  parseBimExplorerWebArguments,
} from "../../scripts/serve-bim-explorer-web.mjs";

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

async function close(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

test("product server exposes only its same-origin allowlist", async () => {
  const server = createBimExplorerWebServer();
  const origin = await listen(server);
  try {
    const page = await fetch(origin);
    assert.equal(page.status, 200);
    assert.match(
      page.headers.get("content-security-policy"),
      /default-src 'none'/u,
    );
    assert.match(
      page.headers.get("content-security-policy"),
      /worker-src 'self'/u,
    );
    assert.equal(
      page.headers.get("cross-origin-opener-policy"),
      "same-origin",
    );
    assert.match(
      await page.text(),
      /name="bim-fixture-enabled" content="false"/u,
    );

    for (const pathname of [
      "/app.mjs",
      "/source-worker.mjs",
      "/worker-source-client.mjs",
      "/point-source-client.mjs",
      "/point-source-worker.bundle.js",
      "/reference-mesh-explorer.mjs",
      "/styles.css",
      "/vendor/web-ifc-api.js",
      "/vendor/web-ifc.wasm",
      "/vendor/laz-perf.js",
      "/vendor/laz-perf.wasm",
      "/adapters/web-ifc/src/create-source-artifact.mjs",
      "/packages/bim-model-source/src/index.mjs",
      "/packages/gltf-reference-source/src/index.mjs",
      "/packages/las-laz-point-source/src/header.mjs",
      "/packages/las-laz-point-source/src/index.mjs",
      "/packages/bim-renderer-3d/src/index.mjs",
      "/packages/bim-renderer-3d/src/point-cloud.mjs",
      "/packages/bim-renderer-3d/src/point-cloud-webgl2-backend.mjs",
      "/packages/bim-semantic-explorer/src/index.mjs",
    ]) {
      assert.equal(
        (await fetch(`${origin}${pathname}`)).status,
        200,
        pathname,
      );
    }
    const pointWorker = await fetch(
      `${origin}/point-source-worker.bundle.js`,
    );
    assert.match(
      pointWorker.headers.get("content-security-policy"),
      /script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'/u,
    );
    assert.match(
      page.headers.get("content-security-policy"),
      /script-src 'self' 'wasm-unsafe-eval';/u,
    );
    assert.doesNotMatch(
      page.headers.get("content-security-policy"),
      /script-src[^;]*'unsafe-eval'/u,
    );
    assert.equal(
      (await fetch(`${origin}/qualification-fixture.ifc`)).status,
      404,
    );
    assert.equal(
      (await fetch(`${origin}/package.json`)).status,
      404,
    );
    assert.equal(
      (await fetch(`${origin}/../package.json`)).status,
      404,
    );
    assert.equal(
      (await fetch(`${origin}/`, {
        method: "POST",
      })).status,
      405,
    );
  } finally {
    await close(server);
  }
});

test("synthetic product fixture requires explicit server opt-in", async () => {
  const server = createBimExplorerWebServer({
    fixture: "synthetic",
  });
  const origin = await listen(server);
  try {
    const page = await fetch(origin);
    assert.match(
      await page.text(),
      /name="bim-fixture-enabled" content="true"/u,
    );
    const fixture = await fetch(
      `${origin}/qualification-fixture.ifc`,
    );
    assert.equal(fixture.status, 200);
    assert.equal(
      fixture.headers.get("content-type"),
      "model/vnd.ifc",
    );
    assert.match(
      await fixture.text(),
      /ISO-10303-21;/u,
    );
  } finally {
    await close(server);
  }
});

test("product server arguments are bounded and deterministic", () => {
  assert.deepEqual(
    parseBimExplorerWebArguments([]),
    {
      fixture: "none",
      port: 4176,
    },
  );
  assert.deepEqual(
    parseBimExplorerWebArguments([
      "--fixture",
      "synthetic",
      "--port",
      "4180",
    ]),
    {
      fixture: "synthetic",
      port: 4180,
    },
  );
  assert.throws(
    () => parseBimExplorerWebArguments(["--port", "0"]),
    /between 1 and 65535/u,
  );
  assert.throws(
    () => parseBimExplorerWebArguments([
      "--fixture",
      "private",
    ]),
    /none or synthetic/u,
  );
});
