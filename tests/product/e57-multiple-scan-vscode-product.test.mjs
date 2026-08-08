import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateE57MultipleScanVscodeProductQualification,
} from "../../scripts/qualify-e57-multiple-scan-vscode-product.mjs";

const evidence = JSON.parse(await readFile(
  "compatibility/evidence/" +
    "e57-multiple-scan-vscode-product-2026-08-08.json",
  "utf8",
));

test("staged VS Code and clean VSIX open multiple-scan E57", () => {
  assert.equal(
    validateE57MultipleScanVscodeProductQualification(evidence),
    evidence,
  );
});

test("multiple-scan VS Code projection parity is mandatory", () => {
  const divergent = structuredClone(evidence);
  divergent.surfaces.installed.pointRuntime.observation
    .renderer.uploadedBytes += 1;
  assert.throws(
    () => validateE57MultipleScanVscodeProductQualification(divergent),
    /evidence is invalid/u,
  );
});

test("multiple-scan VS Code evidence cannot admit E57", () => {
  const overclaim = structuredClone(evidence);
  overclaim.decision.formatAdmission = true;
  assert.throws(
    () => validateE57MultipleScanVscodeProductQualification(overclaim),
    /evidence is invalid/u,
  );
});
