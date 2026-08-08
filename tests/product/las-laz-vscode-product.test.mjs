import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateLasLazVscodeProductQualification,
} from "../../scripts/qualify-las-laz-vscode-product.mjs";

const evidence = JSON.parse(await readFile(
  "compatibility/evidence/" +
    "las-laz-vscode-product-2026-08-08.json",
  "utf8",
));

test("staged VS Code and clean VSIX open bounded LAS/LAZ", () => {
  assert.equal(
    validateLasLazVscodeProductQualification(evidence),
    evidence,
  );
});

test("VS Code point projection parity is mandatory", () => {
  const divergent = structuredClone(evidence);
  divergent.surfaces.installed.pointRuntime.observations
    .laz.renderer.uploadedBytes += 1;
  assert.throws(
    () => validateLasLazVscodeProductQualification(divergent),
    /laz surface is invalid/u,
  );
});

test("clean VSIX must contain the complete point runtime", () => {
  const incomplete = structuredClone(evidence);
  incomplete.surfaces.installed.package
    .installedRuntimeFiles -= 1;
  assert.throws(
    () => validateLasLazVscodeProductQualification(incomplete),
    /identity is invalid/u,
  );
});

test("VS Code product open cannot admit the format", () => {
  const overclaim = structuredClone(evidence);
  overclaim.decision.formatAdmission = true;
  assert.throws(
    () => validateLasLazVscodeProductQualification(overclaim),
    /evidence is invalid/u,
  );
});
