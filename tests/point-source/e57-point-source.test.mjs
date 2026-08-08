import assert from "node:assert/strict";
import test from "node:test";

import {
  createE57PointSourceArtifact,
  decodeE57PointSource,
} from "../../packages/e57-point-source/src/index.mjs";
import {
  acquirePublicE57Fixture,
} from "../../scripts/public-e57-fixture.mjs";

test("bounded E57 product source decodes the public colored cube", async () => {
  const fixture = await acquirePublicE57Fixture();
  let artifact = null;
  try {
    artifact = await createE57PointSourceArtifact(fixture.bytes);
    assert.equal(
      artifact.schema,
      "bim-explorer-e57-point-source/0.1",
    );
    assert.equal(artifact.source.format, "e57");
    assert.equal(artifact.source.formatVersion, "1.0");
    assert.equal(
      artifact.source.pointFormat,
      "cartesian-xyz-rgb",
    );
    assert.equal(
      artifact.source.coordinateReferenceStatus,
      "unqualified",
    );
    assert.equal(artifact.source.semanticAuthority, false);
    assert.equal(artifact.model.points, 7_680);
    assert.equal(artifact.model.ranges, 1);
    assert.equal(artifact.range.byteLength, 122_928);
    assert.equal(
      artifact.range.sha256,
      "dcc6868c55c79a51d315bfc4b287ca38" +
        "f8217e3d572554ef56b0da77359cd6aa",
    );
    assert.equal(artifact.resources.pointRangePayloadBytes, 122_880);
    assert.equal(artifact.resources.wasmHeapCapacityBytes, null);
    assert.deepEqual(
      artifact.profile.coordinateProjection.rawBounds,
      {
        min: [-0.5, -0.5, -0.5],
        max: [0.5, 0.5, 0.5],
      },
    );
    assert.deepEqual(
      artifact.profile.colorProjection.rawRange,
      {
        min: [0, 0, 0],
        max: [255, 255, 255],
      },
    );
    assert.equal(artifact.profile.header.validPageChecksums, 116);
    assert.equal(artifact.profile.header.sourcePointRecords, 7_680);
    assert.equal(artifact.profile.header.pointRecords, 7_680);
    assert.equal(artifact.profile.header.directionPointRecords, 0);
    assert.equal(artifact.profile.header.invalidPointRecords, 0);
    assert.equal(artifact.profile.packets.dataPackets, 3);
    assert.equal(artifact.profile.packets.indexPackets, 1);
    assert.equal(
      artifact.profile.decoder.id,
      "bim-explorer-e57-bitpack-reader",
    );
    assert.ok(
      artifact.profile.coordinateProjection.maximumAbsoluteError <
        1e-7,
    );
  } finally {
    artifact?.range.bytes.fill(0);
    fixture.bytes.fill(0);
  }
});

test("E57 product source fails closed on CRC and point limits", async () => {
  const fixture = await acquirePublicE57Fixture();
  try {
    const corrupted = Uint8Array.from(fixture.bytes);
    corrupted[100] ^= 1;
    assert.throws(
      () => decodeE57PointSource(corrupted),
      /CRC-32C is invalid/u,
    );
    corrupted.fill(0);
    assert.throws(
      () => decodeE57PointSource(fixture.bytes, {
        maximumPoints: 7_679,
      }),
      /point count exceeds/u,
    );
    await assert.rejects(
      createE57PointSourceArtifact(
        fixture.bytes.subarray(0, 1_024),
      ),
      /header identity is invalid/u,
    );
  } finally {
    fixture.bytes.fill(0);
  }
});
