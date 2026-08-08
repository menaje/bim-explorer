import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateE57VscodeProductQualification,
} from "../../scripts/qualify-e57-vscode-product.mjs";

const evidence = JSON.parse(await readFile(
  "compatibility/evidence/" +
    "e57-vscode-product-2026-08-08.json",
  "utf8",
));

test("staged VS Code and clean VSIX open bounded E57", () => {
  assert.equal(
    validateE57VscodeProductQualification(evidence),
    evidence,
  );
});

test("VS Code E57 point projection parity is mandatory", () => {
  const divergent = structuredClone(evidence);
  divergent.surfaces.installed.pointRuntime.observation
    .renderer.uploadedBytes += 1;
  assert.throws(
    () => validateE57VscodeProductQualification(divergent),
    /evidence is invalid/u,
  );
});

test("clean VSIX must contain the complete E57 runtime", () => {
  const incomplete = structuredClone(evidence);
  incomplete.surfaces.installed.package
    .installedRuntimeFiles -= 1;
  assert.throws(
    () => validateE57VscodeProductQualification(incomplete),
    /identity is invalid/u,
  );
});

test("VS Code E57 product open cannot admit the format", () => {
  const overclaim = structuredClone(evidence);
  overclaim.decision.formatAdmission = true;
  assert.throws(
    () => validateE57VscodeProductQualification(overclaim),
    /evidence is invalid/u,
  );
});
