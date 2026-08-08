import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  decodeBimPointRange,
} from "../../packages/bim-renderer-3d/src/index.mjs";
import {
  createLasPointRange,
} from "../../scripts/las-point-range.mjs";
import {
  validateLasLazPointRendererQualification,
} from "../../scripts/qualify-las-laz-point-renderer.mjs";
import {
  acquirePublicLasLazFixture,
} from "../../scripts/public-las-laz-fixture.mjs";
import {
  createLasLazPointRendererProbeServer,
} from "../../scripts/serve-las-laz-point-renderer-probe.mjs";

test("cache-only LAS parity records derive one bounded point range", async () => {
  const fixture = await acquirePublicLasLazFixture();
  let derived;
  try {
    derived = createLasPointRange(fixture.bytes.las);
    const decoded = decodeBimPointRange(derived.bytes);
    assert.equal(decoded.pointCount, 10_201);
    assert.equal(decoded.payloadBytes, 163_216);
    assert.equal(derived.bytes.byteLength, 163_264);
    assert.equal(
      derived.profile.source.pointRecordSha256,
      fixture.manifest.expected.pointRecordSha256,
    );
    assert.equal(
      derived.profile.range.sha256,
      "8383abce84d57b8f50ee1f39aa1d442a" +
        "7f258cd759ab9812aff1a0625ab10449",
    );
    assert.ok(
      derived.profile.coordinateProjection.maximumAbsoluteError <
        1e-6,
    );
    assert.deepEqual(decoded.colorRange, {
      min: [0, 68, 0, 255],
      max: [254, 198, 63, 255],
    });
  } finally {
    derived?.bytes.fill(0);
    fixture.bytes.las.fill(0);
    fixture.bytes.laz.fill(0);
  }
});

test("point renderer loopback server is local-only and clears its range", async (t) => {
  const prepared = {
    input: {
      schema:
        "bim-explorer-las-laz-point-renderer-probe-input/1",
      range: {
        byteLength: 64,
        mediaType:
          "application/vnd.bim-explorer.point-range.v1",
      },
    },
    rangeBytes: Buffer.alloc(64, 7),
  };
  const server = createLasLazPointRendererProbeServer(prepared);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    if (server.listening) {
      server.close();
    }
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${origin}/point-range.bin`);
  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("content-type"),
    "application/vnd.bim-explorer.point-range.v1",
  );
  assert.match(
    response.headers.get("content-security-policy"),
    /worker-src 'none'/u,
  );
  assert.equal((await response.arrayBuffer()).byteLength, 64);
  const state = await fetch(`${origin}/range-state.json`)
    .then((value) => value.json());
  assert.deepEqual(state, {
    rangeRequests: 1,
    rangeBytes: 64,
  });
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  assert.equal(server.probeState.buffersCleared, true);
  assert.equal(
    prepared.rangeBytes.every((value) => value === 0),
    true,
  );
});

test("committed point renderer evidence cannot admit LAS or LAZ", async () => {
  const report = JSON.parse(await readFile(
    "compatibility/evidence/" +
      "las-laz-point-renderer-2026-08-08.json",
    "utf8",
  ));
  assert.equal(
    validateLasLazPointRendererQualification(report),
    report,
  );
  const overclaim = structuredClone(report);
  overclaim.decision.formatAdmission = true;
  assert.throws(
    () => validateLasLazPointRendererQualification(overclaim),
    /evidence is invalid/u,
  );
});
