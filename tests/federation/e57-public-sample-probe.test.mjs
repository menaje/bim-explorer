import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  probeE57Envelope,
} from "../../scripts/e57-envelope-probe.mjs";
import {
  acquirePublicE57Fixture,
  loadPublicE57FixtureManifest,
} from "../../scripts/public-e57-fixture.mjs";
import {
  qualifyE57PublicSample,
} from "../../scripts/qualify-e57-public-sample.mjs";

test("public E57 fixture is cache-only and digest-pinned", async (t) => {
  const cacheRoot = await mkdtemp(
    path.join(tmpdir(), "bim-explorer-e57-"),
  );
  t.after(() => rm(cacheRoot, { recursive: true, force: true }));
  const manifest = await loadPublicE57FixtureManifest();
  const downloaded = await acquirePublicE57Fixture();
  const source = downloaded.bytes.slice();
  downloaded.bytes.fill(0);
  const fetchImpl = async () => ({
    ok: true,
    headers: new Headers({
      "content-length": String(source.byteLength),
    }),
    arrayBuffer: async () => source.slice().buffer,
  });
  const acquired = await acquirePublicE57Fixture({
    cacheRoot,
    fetchImpl,
  });
  assert.equal(acquired.receipt.testOnly, true);
  assert.equal(acquired.receipt.artifactTracked, false);
  assert.equal(acquired.receipt.releaseBundled, false);
  assert.equal(acquired.receipt.sha256, manifest.entry.sha256);
  acquired.bytes.fill(0);
  source.fill(0);
});

test("E57 probe validates all pages and the declared point profile", async () => {
  const fixture = await acquirePublicE57Fixture();
  try {
    const probe = probeE57Envelope(fixture.bytes);
    assert.equal(probe.validPageChecksums, 116);
    assert.equal(probe.profile.data3DScans, 1);
    assert.equal(probe.profile.pointRecords, 7_680);
    assert.deepEqual(probe.profile.coordinateBounds, {
      min: [-0.5, -0.5, -0.5],
      max: [0.5, 0.5, 0.5],
    });
    assert.equal(probe.pointPayloadDecoded, false);
    assert.equal(probe.rendererMounted, false);
  } finally {
    fixture.bytes.fill(0);
  }
});

test("E57 probe fails closed on a physical page mutation", async () => {
  const fixture = await acquirePublicE57Fixture();
  try {
    const corrupt = fixture.bytes.slice();
    corrupt[64] ^= 0xff;
    assert.throws(
      () => probeE57Envelope(corrupt),
      /CRC-32C is invalid/u,
    );
    corrupt.fill(0);
  } finally {
    fixture.bytes.fill(0);
  }
});

test("E57 public sample qualification matches committed evidence", async () => {
  const [current, committed] = await Promise.all([
    qualifyE57PublicSample(),
    readFile(
      "compatibility/evidence/" +
        "e57-public-sample-probe-2026-08-08.json",
      "utf8",
    ).then(JSON.parse),
  ]);
  assert.deepEqual(current, committed);
});
