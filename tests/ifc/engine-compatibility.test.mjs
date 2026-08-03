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
  const evidence = await Promise.all(
    manifest.evidence.map(async (relative) =>
      JSON.parse(await readFile(relative, "utf8"))),
  );
  const browserWorkerEvidence = JSON.parse(
    await readFile(
      manifest.prototypes.webIfcBrowserWorker.evidence,
      "utf8",
    ),
  );
  return {
    manifest,
    evidence,
    browserWorkerEvidence,
  };
}

test("IFC engine compatibility remains experimental and held", async () => {
  const { manifest, evidence, browserWorkerEvidence } = await fixtures();
  const result = validateIfcEngineCompatibility(
    manifest,
    evidence,
    browserWorkerEvidence,
  );
  assert.equal(result.status, "experimental");
  assert.equal(result.candidates, 2);
  assert.equal(result.fixtures, 2);
  assert.ok(result.heldGates > 0);
  assert.equal(manifest.gates.browserWorkerPrototype, true);
  assert.equal(manifest.gates.browserPackaging, false);
});

test("IFC engine compatibility rejects an unmeasured pin", async () => {
  const { manifest, evidence, browserWorkerEvidence } = await fixtures();
  manifest.candidates["web-ifc"].version = "99.0.0";
  assert.throws(
    () => validateIfcEngineCompatibility(
      manifest,
      evidence,
      browserWorkerEvidence,
    ),
    /pin changed without new evidence/u,
  );
});

test("IFC engine compatibility rejects production claims", async () => {
  const { manifest, evidence, browserWorkerEvidence } = await fixtures();
  manifest.decision.productionClaims = true;
  assert.throws(
    () => validateIfcEngineCompatibility(
      manifest,
      evidence,
      browserWorkerEvidence,
    ),
    /must fail closed/u,
  );
});

test("Browser Worker smoke cannot promote Browser packaging", async () => {
  const { manifest, evidence, browserWorkerEvidence } = await fixtures();
  browserWorkerEvidence.decision.browserPackaging = "passed";
  assert.throws(
    () => validateIfcEngineCompatibility(
      manifest,
      evidence,
      browserWorkerEvidence,
    ),
    /incomplete or overclaims/u,
  );
});
