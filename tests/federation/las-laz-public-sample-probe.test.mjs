import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { probeLasHeader } from "../../scripts/las-header-probe.mjs";
import {
  probeLasLazPointRecords,
} from "../../scripts/las-laz-point-probe.mjs";
import {
  acquirePublicLasLazFixture,
  loadPublicLasLazFixtureManifest,
} from "../../scripts/public-las-laz-fixture.mjs";
import {
  qualifyLasLazPublicSample,
} from "../../scripts/qualify-las-laz-public-sample.mjs";

test("public LAS/LAZ fixtures are cache-only and digest-pinned", async (t) => {
  const cacheRoot = await mkdtemp(
    path.join(tmpdir(), "bim-explorer-las-laz-"),
  );
  t.after(() => rm(cacheRoot, { recursive: true, force: true }));
  const manifest = await loadPublicLasLazFixtureManifest();
  const downloaded = await acquirePublicLasLazFixture();
  const source = {
    las: downloaded.bytes.las.slice(),
    laz: downloaded.bytes.laz.slice(),
  };
  downloaded.bytes.las.fill(0);
  downloaded.bytes.laz.fill(0);
  const fetchImpl = async (url) => {
    const format = String(url).endsWith(".las") ? "las" : "laz";
    return {
      ok: true,
      headers: new Headers({
        "content-length": String(source[format].byteLength),
      }),
      arrayBuffer: async () => source[format].slice().buffer,
    };
  };
  const acquired = await acquirePublicLasLazFixture({
    cacheRoot,
    fetchImpl,
  });
  assert.equal(acquired.receipt.testOnly, true);
  assert.equal(acquired.receipt.sampleRedistributed, false);
  assert.equal(acquired.receipt.artifactTracked, false);
  assert.equal(acquired.receipt.releaseBundled, false);
  assert.equal(
    acquired.receipt.entries.las.sha256,
    manifest.entries.las.sha256,
  );
  assert.equal(
    acquired.receipt.entries.laz.sha256,
    manifest.entries.laz.sha256,
  );
  acquired.bytes.las.fill(0);
  acquired.bytes.laz.fill(0);
  source.las.fill(0);
  source.laz.fill(0);
});

test("LAS and LAZ headers expose one bounded paired profile", async () => {
  const fixture = await acquirePublicLasLazFixture();
  try {
    const las = probeLasHeader(fixture.bytes.las);
    const laz = probeLasHeader(fixture.bytes.laz);
    assert.equal(las.compressed, false);
    assert.equal(laz.compressed, true);
    assert.equal(las.pointRecords, 10_201);
    assert.equal(laz.pointRecords, 10_201);
    assert.equal(las.pointFormat, 3);
    assert.equal(laz.pointFormat, 3);
    assert.equal(
      laz.variableLengthRecords[0].userId,
      "laszip encoded",
    );
  } finally {
    fixture.bytes.las.fill(0);
    fixture.bytes.laz.fill(0);
  }
});

test("LAS header probe fails closed on a signature mutation", async () => {
  const fixture = await acquirePublicLasLazFixture();
  try {
    const corrupt = fixture.bytes.las.slice();
    corrupt[0] ^= 0xff;
    assert.throws(
      () => probeLasHeader(corrupt),
      /identity or bounded profile is invalid/u,
    );
    corrupt.fill(0);
  } finally {
    fixture.bytes.las.fill(0);
    fixture.bytes.laz.fill(0);
  }
});

test("LAZ decode exactly matches LAS point records", async () => {
  const fixture = await acquirePublicLasLazFixture();
  try {
    const probe = await probeLasLazPointRecords({
      lasBytes: fixture.bytes.las,
      lazBytes: fixture.bytes.laz,
    });
    assert.equal(probe.exactPointRecordParity, true);
    assert.equal(probe.profile.pointRecords, 10_201);
    assert.equal(
      probe.profile.pointRecordSha256,
      "31124633910e8b01c3cbd7d159c85b7" +
        "140b0ed20438fee70f9570ad2420c026e",
    );
    assert.deepEqual(probe.profile.colorRange, {
      min: [0, 17_408, 0],
      max: [65_280, 50_944, 16_128],
    });
    assert.equal(probe.cleanup.wasmAllocationsReleased, true);
  } finally {
    fixture.bytes.las.fill(0);
    fixture.bytes.laz.fill(0);
  }
});

test("LAS/LAZ public qualification matches committed evidence", async () => {
  const [current, committed] = await Promise.all([
    qualifyLasLazPublicSample(),
    readFile(
      "compatibility/evidence/" +
        "las-laz-public-sample-probe-2026-08-08.json",
      "utf8",
    ).then(JSON.parse),
  ]);
  assert.deepEqual(current, committed);
});
