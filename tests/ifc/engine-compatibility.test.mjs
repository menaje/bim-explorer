import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateIfcEngineCompatibility,
} from "../../scripts/check-ifc-engine-compatibility.mjs";

async function fixtures() {
  const manifest = JSON.parse(
    await readFile("compatibility/ifc-engines.json", "utf8"),
  );
  const evidence = JSON.parse(
    await readFile(manifest.evidence, "utf8"),
  );
  return {
    manifest,
    evidence,
  };
}

test("IFC engine compatibility remains experimental and held", async () => {
  const { manifest, evidence } = await fixtures();
  const result = validateIfcEngineCompatibility(manifest, evidence);
  assert.equal(result.status, "experimental");
  assert.equal(result.candidates, 2);
  assert.ok(result.heldGates > 0);
});

test("IFC engine compatibility rejects an unmeasured pin", async () => {
  const { manifest, evidence } = await fixtures();
  manifest.candidates["web-ifc"].version = "99.0.0";
  assert.throws(
    () => validateIfcEngineCompatibility(manifest, evidence),
    /pin changed without new evidence/u,
  );
});

test("IFC engine compatibility rejects production claims", async () => {
  const { manifest, evidence } = await fixtures();
  manifest.decision.productionClaims = true;
  assert.throws(
    () => validateIfcEngineCompatibility(manifest, evidence),
    /must fail closed/u,
  );
});
