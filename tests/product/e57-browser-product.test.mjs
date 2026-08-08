import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateE57BrowserProductQualification,
} from "../../scripts/qualify-e57-browser-product.mjs";

const evidence = JSON.parse(await readFile(
  "compatibility/evidence/" +
    "e57-browser-product-2026-08-08.json",
  "utf8",
));

test("committed E57 Browser product evidence pins open and cleanup", () => {
  const validated = validateE57BrowserProductQualification(
    evidence,
  );
  assert.equal(validated.surface.observation.model.points, 7_680);
  assert.equal(
    validated.surface.observation.renderer.uploadedBytes,
    122_880,
  );
  assert.equal(
    validated.surface.observation.lifecycle.rendererDisposed,
    true,
  );
});

test("E57 Browser product evidence cannot claim VS Code or admission", () => {
  const overclaim = structuredClone(evidence);
  overclaim.decision.vscodeProductOpen = "passed";
  overclaim.decision.formatAdmission = true;
  assert.throws(
    () => validateE57BrowserProductQualification(overclaim),
    /evidence is invalid/u,
  );
});
