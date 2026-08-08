import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  decodeE57MultipleScanSource,
} from "../../packages/e57-point-source/src/index.mjs";
import {
  acquirePublicE57MultipleScanFixture,
} from "../../scripts/public-e57-multiple-scan-fixture.mjs";
import {
  qualifyE57MultipleScanProfile,
  validateE57MultipleScanProfileEvidence,
} from "../../scripts/qualify-e57-multiple-scan-profile.mjs";

const evidence = JSON.parse(await readFile(
  "compatibility/evidence/" +
    "e57-multiple-scan-profile-2026-08-08.json",
  "utf8",
));

test("E57 scan poses match the independent five-scan reference", async () => {
  const report = await qualifyE57MultipleScanProfile();
  assert.equal(report.profile.scanCount, 5);
  assert.equal(report.profile.pointRecords, 1_213_990);
  assert.equal(report.profile.explicitPoseScans, 4);
  assert.equal(report.profile.implicitIdentityPoseScans, 1);
  assert.equal(
    report.profile.aggregateWorldPositionNanometerInt64LeSha256,
    "d44fa31718500cf88129bc1f0fbd4354" +
      "46d929d142878712b08fd2d95e9af63a",
  );
  assert.equal(
    report.profile.aggregateRgbSha256,
    "cebed53b1493e874b11c5fc5bb4f411" +
      "aa72851ba884d58e62a4d3023a0e8be11",
  );
  assert.deepEqual(report.profile.scans[1].pose, {
    explicit: false,
    rotation: [1, 0, 0, 0],
    translation: [0, 0, 0],
  });
});

test("committed E57 multiple-scan evidence remains pre-admission", () => {
  assert.equal(validateE57MultipleScanProfileEvidence(evidence), evidence);
  const overclaim = structuredClone(evidence);
  overclaim.capabilities.productFileOpen = true;
  assert.throws(
    () => validateE57MultipleScanProfileEvidence(overclaim),
    /evidence is invalid/u,
  );
  const poseTamper = structuredClone(evidence);
  poseTamper.profile.scans[0].pose.translation[0] += 1;
  assert.throws(
    () => validateE57MultipleScanProfileEvidence(poseTamper),
    /evidence is invalid/u,
  );
});

test("E57 multiple-scan decode fails closed on limits and CRC", async () => {
  const fixture = await acquirePublicE57MultipleScanFixture();
  try {
    assert.throws(
      () => decodeE57MultipleScanSource(fixture.bytes, {
        maximumSourceBytes: fixture.bytes.byteLength - 1,
      }),
      /exceeds its bounded profile/u,
    );
    assert.throws(
      () => decodeE57MultipleScanSource(fixture.bytes, {
        maximumPointsPerScan: 604_637,
      }),
      /point count exceeds/u,
    );
    assert.throws(
      () => decodeE57MultipleScanSource(fixture.bytes, {
        maximumScans: 4,
      }),
      /scan count exceeds/u,
    );
    const corrupted = Uint8Array.from(fixture.bytes);
    try {
      corrupted[100] ^= 1;
      assert.throws(
        () => decodeE57MultipleScanSource(corrupted),
        /CRC-32C is invalid/u,
      );
    } finally {
      corrupted.fill(0);
    }
  } finally {
    fixture.bytes.fill(0);
  }
});
