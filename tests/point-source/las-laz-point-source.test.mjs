import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import {
  createLasLazPointSourceArtifact,
  parseLasLazHeader,
} from "../../packages/las-laz-point-source/src/index.mjs";
import {
  acquirePublicLasLazFixture,
} from "../../scripts/public-las-laz-fixture.mjs";

const require = createRequire(import.meta.url);
const { create: createLazPerf } = require("laz-perf");

test("bounded LAS and LAZ product sources derive the same point range", async () => {
  const fixture = await acquirePublicLasLazFixture();
  let las = null;
  let laz = null;
  try {
    las = await createLasLazPointSourceArtifact(
      fixture.bytes.las,
      { format: "las" },
    );
    laz = await createLasLazPointSourceArtifact(
      fixture.bytes.laz,
      {
        format: "laz",
        moduleFactory: createLazPerf,
      },
    );
    assert.equal(las.schema, "bim-explorer-las-laz-point-source/0.1");
    assert.equal(las.source.format, "las");
    assert.equal(laz.source.format, "laz");
    assert.equal(las.source.coordinateReferenceStatus, "unqualified");
    assert.equal(laz.source.semanticAuthority, false);
    assert.equal(las.model.points, 10_201);
    assert.deepEqual(las.model, laz.model);
    assert.equal(las.range.byteLength, 163_264);
    assert.equal(
      las.range.sha256,
      "8383abce84d57b8f50ee1f39aa1d442a" +
        "7f258cd759ab9812aff1a0625ab10449",
    );
    assert.equal(laz.range.sha256, las.range.sha256);
    assert.deepEqual(
      [...laz.range.bytes],
      [...las.range.bytes],
    );
    assert.equal(laz.cleanup.decoderReleased, true);
    assert.equal(laz.cleanup.wasmAllocationsReleased, true);
    assert.ok(
      laz.resources.wasmHeapCapacityBytes.peakObserved <=
        64 * 1024 * 1024,
    );
    assert.ok(
      las.profile.coordinateProjection.maximumAbsoluteError <
        1e-6,
    );
  } finally {
    las?.range.bytes.fill(0);
    laz?.range.bytes.fill(0);
    fixture.bytes.las.fill(0);
    fixture.bytes.laz.fill(0);
  }
});

test("LAS/LAZ product header fails closed on format and bounds", async () => {
  const fixture = await acquirePublicLasLazFixture();
  try {
    assert.throws(
      () => parseLasLazHeader(fixture.bytes.las, {
        format: "laz",
      }),
      /profile is invalid/u,
    );
    assert.throws(
      () => parseLasLazHeader(fixture.bytes.laz, {
        format: "las",
      }),
      /profile is invalid/u,
    );
    assert.throws(
      () => parseLasLazHeader(
        fixture.bytes.las.subarray(0, 226),
        { format: "las" },
      ),
      /byte bound/u,
    );
    assert.throws(
      () => parseLasLazHeader(fixture.bytes.las, {
        format: "las",
        maximumPoints: 10_000,
      }),
      /profile is invalid/u,
    );
  } finally {
    fixture.bytes.las.fill(0);
    fixture.bytes.laz.fill(0);
  }
});
