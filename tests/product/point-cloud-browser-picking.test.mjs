import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validatePointCloudBrowserPickingQualification,
} from "../../scripts/qualify-point-cloud-browser-picking.mjs";

const evidence = JSON.parse(await readFile(
  "compatibility/evidence/" +
    "point-cloud-browser-picking-2026-08-09.json",
  "utf8",
));

test("Browser point picking binds identity to source revision and range", () => {
  assert.equal(
    validatePointCloudBrowserPickingQualification(evidence),
    evidence,
  );
  const las = evidence.surfaces.las.observation.pointSelection;
  const laz = evidence.surfaces.laz.observation.pointSelection;
  assert.equal(las.identity.pointIndex, laz.identity.pointIndex);
  assert.notEqual(las.source.fingerprint, laz.source.fingerprint);
  assert.notEqual(
    las.identity.rangeHandleId,
    laz.identity.rangeHandleId,
  );
});

test("Browser point picking proves an index above the mesh pick ceiling", () => {
  const pick = evidence.surfaces.e57MultipleScan
    .observation.pointSelection;
  assert.ok(pick.identity.pointIndex > 0x1_ff_ff);
  assert.equal(pick.backend.temporaryReleased, true);
  assert.equal(pick.backend.temporaryTargetBytes, 2_160_000);
});

test("Browser point picking cannot claim CRS, LOD, or format admission", () => {
  for (const [field, value] of [
    ["coordinateReference", "passed"],
    ["levelOfDetail", "passed"],
    ["formatAdmission", true],
  ]) {
    const overclaim = structuredClone(evidence);
    overclaim.decision[field] = value;
    assert.throws(
      () => validatePointCloudBrowserPickingQualification(overclaim),
      /evidence is invalid/u,
    );
  }
});
