import assert from "node:assert/strict";
import test from "node:test";

import {
  createFederatedBimSurfaceBrowserInput,
  createFederatedBimSurfaceBrowserProbeServer,
} from "../../scripts/serve-federated-bim-surface-browser-probe.mjs";

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return `http://127.0.0.1:${server.address().port}`;
}

async function close(server) {
  await new Promise((resolve, reject) => {
    server.close((error) =>
      error === undefined ? resolve() : reject(error));
  });
}

test("federated BIM Surface Browser probe is bundled and local-only", async () => {
  const input = await createFederatedBimSurfaceBrowserInput();
  assert.equal(
    input.schema,
    "bim-explorer-federated-bim-surface-browser-input/1",
  );
  assert.ok(input.referenceGlb instanceof Uint8Array);
  assert.ok(input.overlayGlb instanceof Uint8Array);
  assert.notDeepEqual(input.referenceGlb, input.overlayGlb);
  const server =
    await createFederatedBimSurfaceBrowserProbeServer({ input });
  const origin = await listen(server);
  try {
    const [page, bundle, probe] = await Promise.all([
      fetch(origin),
      fetch(`${origin}/app.mjs`),
      fetch(`${origin}/probe-input.json`),
    ]);
    assert.equal(page.status, 200);
    assert.match(
      page.headers.get("content-security-policy"),
      /default-src 'none'/u,
    );
    assert.match(await page.text(), /model-canvas/u);
    assert.equal(bundle.status, 200);
    const bundledSource = await bundle.text();
    assert.match(
      bundledSource,
      /__federatedBimSurfaceBrowserReport/u,
    );
    assert.doesNotMatch(
      bundledSource,
      /from\s+["']\.\.\//u,
    );
    const serialized = await probe.json();
    assert.equal(serialized.schema, input.schema);
    assert.equal(
      serialized.fixtures.source,
      "generated-test-only",
    );
    assert.equal(
      typeof serialized.referenceGlb.$bytes,
      "string",
    );
    assert.equal(
      typeof serialized.overlayGlb.$bytes,
      "string",
    );
    assert.equal(
      typeof serialized.ifcArtifact.ranges[0].bytes.$bytes,
      "string",
    );
    assert.equal(
      (await fetch(origin, { method: "POST" })).status,
      405,
    );
    assert.equal((await fetch(`${origin}/missing`)).status, 404);
  } finally {
    await close(server);
  }
});
