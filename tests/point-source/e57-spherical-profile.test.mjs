import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  qualifyE57SphericalProfile,
  validateE57SphericalProfileQualification,
} from "../../scripts/qualify-e57-spherical-profile.mjs";

const evidence = JSON.parse(await readFile(
  "compatibility/evidence/e57-spherical-profile-2026-08-08.json",
  "utf8",
));

test("E57 spherical coordinates match the independent reference", async () => {
  const report = await qualifyE57SphericalProfile();
  assert.equal(report.header.sourcePointRecords, 370_530);
  assert.equal(report.header.pointRecords, 155_201);
  assert.equal(report.header.invalidPointRecords, 215_329);
  assert.equal(report.pointSource.pointFormat, "spherical-rae-rgb");
  assert.equal(
    report.decode.positionNanometerInt64LeSha256,
    "25d3abf28dbf71fce25f55d524fcb81a" +
      "cdbc75b8a5d5ef5c47a268a3a82b6af6",
  );
  assert.equal(
    report.pointSource.pointRangeSha256,
    "b0a0c2cd5cb5f3a051d208332824318e" +
      "7561e1098ef24a4dd718e460b3fd303f",
  );
  assert.deepEqual(report.pointSource.ignoredFields, ["intensity"]);
});

test("committed E57 spherical evidence remains pre-admission", () => {
  assert.equal(
    validateE57SphericalProfileQualification(evidence),
    evidence,
  );
  const overclaim = structuredClone(evidence);
  overclaim.decision.formatAdmission = true;
  assert.throws(
    () => validateE57SphericalProfileQualification(overclaim),
    /evidence is invalid/u,
  );
});
