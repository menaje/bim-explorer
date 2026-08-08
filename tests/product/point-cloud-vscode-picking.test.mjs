import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validatePointCloudVscodePickingQualification,
} from "../../scripts/qualify-point-cloud-vscode-picking.mjs";

const evidence = JSON.parse(await readFile(
  "compatibility/evidence/" +
    "point-cloud-vscode-picking-2026-08-09.json",
  "utf8",
));

test("staged VS Code and clean VSIX preserve point picks", () => {
  assert.equal(
    validatePointCloudVscodePickingQualification(evidence),
    evidence,
  );
  for (const key of ["e57", "las", "laz", "e57MultipleScan"]) {
    const staged = evidence.surfaces.staged.observations[key]
      .pointSelection;
    const installed = evidence.surfaces.installed.observations[key]
      .pointSelection;
    assert.deepEqual(staged, installed);
    assert.equal(staged.backend.temporaryReleased, true);
  }
});

test("VS Code point picks retain source separation and large indices", () => {
  const observations = evidence.surfaces.staged.observations;
  assert.equal(
    observations.las.pointSelection.identity.pointIndex,
    observations.laz.pointSelection.identity.pointIndex,
  );
  assert.notEqual(
    observations.las.pointSelection.identity.rangeHandleId,
    observations.laz.pointSelection.identity.rangeHandleId,
  );
  assert.ok(
    observations.e57MultipleScan.pointSelection.identity.pointIndex >
      0x1_ff_ff,
  );
});

test("VS Code point picking keeps authority and admission held", () => {
  for (const [field, value] of [
    ["coordinateReference", "passed"],
    ["levelOfDetail", "passed"],
    ["formatAdmission", true],
  ]) {
    const overclaim = structuredClone(evidence);
    overclaim.decision[field] = value;
    assert.throws(
      () => validatePointCloudVscodePickingQualification(overclaim),
      /evidence is invalid/u,
    );
  }
});
