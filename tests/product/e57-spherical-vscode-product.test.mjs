import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateE57SphericalVscodeProductQualification,
} from "../../scripts/qualify-e57-spherical-vscode-product.mjs";

const evidence = JSON.parse(await readFile(
  "compatibility/evidence/" +
    "e57-spherical-vscode-product-2026-08-08.json",
  "utf8",
));

test("staged VS Code and clean VSIX open spherical E57", () => {
  assert.equal(
    validateE57SphericalVscodeProductQualification(evidence),
    evidence,
  );
});

test("spherical E57 VS Code projection parity is mandatory", () => {
  const divergent = structuredClone(evidence);
  divergent.surfaces.installed.pointRuntime.observation
    .renderer.uploadedBytes += 1;
  assert.throws(
    () => validateE57SphericalVscodeProductQualification(divergent),
    /evidence is invalid/u,
  );
});

test("spherical E57 VS Code evidence cannot admit the format", () => {
  const overclaim = structuredClone(evidence);
  overclaim.decision.formatAdmission = true;
  assert.throws(
    () => validateE57SphericalVscodeProductQualification(overclaim),
    /evidence is invalid/u,
  );
});
