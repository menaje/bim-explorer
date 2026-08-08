import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  qualifyE57ProfileMatrix,
  validateE57ProfileMatrixQualification,
} from "../../scripts/qualify-e57-profile-matrix.mjs";

const evidence = JSON.parse(await readFile(
  "compatibility/evidence/e57-profile-matrix-2026-08-08.json",
  "utf8",
));

test("E57 Float64 and ScaledInteger profiles have exact parity", async () => {
  const report = await qualifyE57ProfileMatrix();
  assert.equal(report.profiles[0].header.pointRecords, 30_571);
  assert.equal(report.profiles[1].header.pointRecords, 30_571);
  assert.equal(
    report.profiles[0].decode.positionFloat64LeSha256,
    report.profiles[1].decode.positionFloat64LeSha256,
  );
  assert.equal(report.validityFilter.directionPointRecords, 1);
  assert.equal(report.validityFilter.pointRecords, 30_570);
});

test("committed E57 profile evidence remains bounded", () => {
  assert.equal(
    validateE57ProfileMatrixQualification(evidence),
    evidence,
  );
  const overclaim = structuredClone(evidence);
  overclaim.decision.formatAdmission = true;
  assert.throws(
    () => validateE57ProfileMatrixQualification(overclaim),
    /evidence is invalid/u,
  );
});
