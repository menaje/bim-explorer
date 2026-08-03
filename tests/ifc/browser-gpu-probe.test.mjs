import assert from "node:assert/strict";
import test from "node:test";

import {
  createWebIfcSourceArtifact,
} from "../../adapters/web-ifc/src/create-source-artifact.mjs";
import {
  BIM_SOURCE_PROTOCOL_VERSION,
  createBimModelSource,
} from "../../packages/bim-model-source/src/index.mjs";
import {
  syntheticMappedIfc,
} from "../../scripts/generate-synthetic-ifc.mjs";
import {
  createBrowserGpuProbeServer,
} from "../../scripts/serve-browser-gpu-probe.mjs";

async function fixture() {
  const artifact = await createWebIfcSourceArtifact(
    new TextEncoder().encode(syntheticMappedIfc()),
  );
  const source = createBimModelSource(artifact, {
    maximumRequestBytes: 128,
  });
  const session = await source.open({
    protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
  });
  const snapshot = await session.getSnapshot();
  await session.dispose();
  await source.dispose();
  return {
    input: {
      schema: "bim-explorer-browser-gpu-probe-input/1",
      fixture: {
        id: "synthetic-mapped",
        byteLength: 1,
      },
      snapshot,
    },
    ranges: new Map(
      artifact.ranges.map((range) => [
        range.rangeId,
        Buffer.from(range.bytes),
      ]),
    ),
  };
}

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

test("Browser GPU server exposes only bounded same-origin ranges", async () => {
  const prepared = await fixture();
  const server = createBrowserGpuProbeServer(prepared);
  const origin = await listen(server);
  try {
    const page = await fetch(`${origin}/`);
    assert.equal(page.status, 200);
    assert.match(
      page.headers.get("content-security-policy"),
      /default-src 'none'/u,
    );

    const inputResponse = await fetch(
      `${origin}/probe-input.json`,
    );
    const input = await inputResponse.json();
    assert.equal(
      input.schema,
      "bim-explorer-browser-gpu-probe-input/1",
    );

    const handle =
      prepared.input.snapshot.layers[0].rangeHandles[0];
    const route =
      `${origin}/range/${encodeURIComponent(handle.handleId)}`;
    const unbounded = await fetch(route);
    assert.equal(unbounded.status, 416);
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
    assert.equal((await selected.arrayBuffer()).byteLength, 128);

    const state = await (
      await fetch(`${origin}/range-state.json`)
    ).json();
    assert.deepEqual(state, {
      rangeBytes: 128,
      rangeRequests: 1,
      ranges: {
        [handle.handleId]: {
          bytes: 128,
          requests: 1,
        },
      },
    });

    const unknown = await fetch(`${origin}/range/not-a-range`);
    assert.equal(unknown.status, 404);
    const post = await fetch(`${origin}/`, {
      method: "POST",
    });
    assert.equal(post.status, 405);
  } finally {
    await close(server);
  }
});
