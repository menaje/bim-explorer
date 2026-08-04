import assert from "node:assert/strict";
import test from "node:test";

import {
  createGltfBrowserProbeServer,
  prepareGltfBrowserProbe,
} from "../../scripts/serve-gltf-browser-probe.mjs";
import {
  syntheticGlbBytes,
} from "../../scripts/generate-synthetic-gltf.mjs";

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

test("glTF Browser probe exposes only projected bounded ranges", async () => {
  const bytes = syntheticGlbBytes();
  const prepared = await prepareGltfBrowserProbe({
    bytes,
    fixture: {
      id: "synthetic-glb-browser-probe",
      byteLength: bytes.byteLength,
      sha256: "synthetic-only",
      license: "MPL-2.0",
      artifactTracked: false,
      releaseBundled: false,
    },
  });
  bytes.fill(0);
  const server = createGltfBrowserProbeServer(prepared);
  const origin = await listen(server);
  try {
    const inputResponse = await fetch(
      `${origin}/probe-input.json`,
    );
    assert.equal(inputResponse.status, 200);
    assert.match(
      inputResponse.headers.get("content-security-policy"),
      /connect-src 'self'/u,
    );
    const input = await inputResponse.json();
    assert.equal(input.snapshot.source.format, "glb");
    assert.equal(
      input.snapshot.source.semanticAuthority,
      false,
    );
    assert.equal(input.snapshot.entities[0].globalId, null);
    assert.equal(
      input.snapshot.entities[0].nativeId,
      "node:0/mesh:0/primitive:0",
    );
    const handle =
      input.snapshot.layers[0].rangeHandles[0];
    const range = await fetch(
      `${origin}/range/${encodeURIComponent(handle.handleId)}`,
      {
        headers: { Range: "bytes=0-63" },
      },
    );
    assert.equal(range.status, 206);
    assert.equal((await range.arrayBuffer()).byteLength, 64);
    const invalid = await fetch(
      `${origin}/range/${encodeURIComponent(handle.handleId)}`,
    );
    assert.equal(invalid.status, 416);
    assert.equal(
      (await fetch(`${origin}/Box.glb`)).status,
      404,
    );
    const state = await (
      await fetch(`${origin}/range-state.json`)
    ).json();
    assert.deepEqual(state, {
      rangeRequests: 1,
      rangeBytes: 64,
    });
  } finally {
    await close(server);
  }
});
