import assert from "node:assert/strict";
import test from "node:test";

import {
  createSemanticExplorerProbeServer,
  prepareSemanticExplorerProbe,
} from "../../scripts/serve-semantic-explorer-probe.mjs";

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

test("semantic explorer probe serves bounded same-origin source ranges", async () => {
  const prepared = await prepareSemanticExplorerProbe();
  const server = createSemanticExplorerProbeServer(prepared);
  const origin = await listen(server);
  try {
    const page = await fetch(`${origin}/`);
    assert.equal(page.status, 200);
    assert.match(
      page.headers.get("content-security-policy"),
      /default-src 'none'/u,
    );
    const input = await (
      await fetch(`${origin}/probe-input.json`)
    ).json();
    assert.equal(
      input.schema,
      "bim-explorer-semantic-explorer-probe-input/1",
    );
    assert.deepEqual(
      input.snapshot.tree.nodes.map((node) => [
        node.expressId,
        node.parentExpressId,
      ]),
      [
        [13, null],
        [15, 13],
        [17, 15],
        [19, 17],
        [21, 19],
        [40, 21],
        [44, 21],
      ],
    );

    const handle =
      input.snapshot.layers[0].rangeHandles[0];
    const route =
      `${origin}/range/${encodeURIComponent(handle.handleId)}`;
    assert.equal((await fetch(route)).status, 416);
    const selected = await fetch(route, {
      headers: {
        Range: "bytes=0-127",
      },
    });
    assert.equal(selected.status, 206);
    assert.equal(
      selected.headers.get("content-range"),
      `bytes 0-127/${handle.byteLength}`,
    );
    assert.equal(
      (await selected.arrayBuffer()).byteLength,
      128,
    );
    const rangeState = await (
      await fetch(`${origin}/range-state.json`)
    ).json();
    assert.equal(rangeState.rangeRequests, 1);
    assert.equal(rangeState.rangeBytes, 128);

    for (const routeName of [
      "/bim-semantic-explorer.mjs",
      "/semantic-index.mjs",
      "/bim-renderer-3d.mjs",
      "/point-cloud-lod.mjs",
    ]) {
      assert.equal(
        (await fetch(`${origin}${routeName}`)).status,
        200,
      );
    }
    assert.equal(
      (await fetch(`${origin}/unknown`)).status,
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
