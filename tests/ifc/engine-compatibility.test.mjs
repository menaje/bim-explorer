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
  const browserLifecycleEvidence = JSON.parse(
    await readFile(
      manifest.prototypes.webIfcBrowserWorker.lifecycleEvidence,
      "utf8",
    ),
  );
  const browserCancellationEvidence = JSON.parse(
    await readFile(
      manifest.prototypes.webIfcBrowserWorker.cancellationEvidence,
      "utf8",
    ),
  );
  const browserPerformanceEvidence = JSON.parse(
    await readFile(
      manifest.prototypes.webIfcBrowserWorker.performanceEvidence,
      "utf8",
    ),
  );
  const publicNodePerformanceEvidence = JSON.parse(
    await readFile(
      manifest.publicPerformanceFixture.nodeEvidence,
      "utf8",
    ),
  );
  const publicBrowserPerformanceEvidence = JSON.parse(
    await readFile(
      manifest.publicPerformanceFixture.browserEvidence,
      "utf8",
    ),
  );
  const negativeNodeEvidence = JSON.parse(
    await readFile(
      manifest.negativeCorpus.nodeEvidence,
      "utf8",
    ),
  );
  const negativeBrowserEvidence = JSON.parse(
    await readFile(
      manifest.negativeCorpus.browserEvidence,
      "utf8",
    ),
  );
  const inCallNodeEvidence = JSON.parse(
    await readFile(
      manifest.inCallCancellation.nodeEvidence,
      "utf8",
    ),
  );
  const inCallBrowserEvidence = JSON.parse(
    await readFile(
      manifest.inCallCancellation.browserEvidence,
      "utf8",
    ),
  );
  const resourceExhaustionEvidence = JSON.parse(
    await readFile(
      manifest.resourceExhaustion.evidence,
      "utf8",
    ),
  );
  return {
    manifest,
    evidence,
    browserWorkerEvidence,
    browserLifecycleEvidence,
    browserCancellationEvidence,
    browserPerformanceEvidence,
    publicNodePerformanceEvidence,
    publicBrowserPerformanceEvidence,
    negativeNodeEvidence,
    negativeBrowserEvidence,
    inCallNodeEvidence,
    inCallBrowserEvidence,
    resourceExhaustionEvidence,
  };
}

function validateFixtures(value) {
  return validateIfcEngineCompatibility(
    value.manifest,
    value.evidence,
    value.browserWorkerEvidence,
    value.browserLifecycleEvidence,
    value.browserCancellationEvidence,
    value.browserPerformanceEvidence,
    value.publicNodePerformanceEvidence,
    value.publicBrowserPerformanceEvidence,
    value.negativeNodeEvidence,
    value.negativeBrowserEvidence,
    value.inCallNodeEvidence,
    value.inCallBrowserEvidence,
    value.resourceExhaustionEvidence,
  );
}

test("IFC engine compatibility remains experimental and held", async () => {
  const fixtureSet = await fixtures();
  const { manifest } = fixtureSet;
  const result = validateFixtures(fixtureSet);
  assert.equal(result.status, "experimental");
  assert.equal(result.candidates, 2);
  assert.equal(result.fixtures, 2);
  assert.ok(result.heldGates > 0);
  assert.equal(manifest.gates.browserWorkerPrototype, true);
  assert.equal(manifest.gates.browserLocalFileLifecycle, true);
  assert.equal(manifest.gates.browserCheckpointCancellation, true);
  assert.equal(manifest.gates.browserBoundedPerformance, true);
  assert.equal(manifest.gates.publicFixtureProvenance, true);
  assert.equal(manifest.gates.representativeNodeCpuRss, true);
  assert.equal(manifest.gates.browserRepresentativeParsing, true);
  assert.equal(manifest.gates.largeModelPerformance, false);
  assert.equal(manifest.gates.forcedIsolationCancellation, true);
  assert.equal(manifest.gates.cancellation, true);
  assert.equal(manifest.gates.corruptInputCleanup, true);
  assert.equal(manifest.gates.processRssLimitRecovery, true);
  assert.equal(manifest.gates.resourceExhaustion, false);
  assert.equal(manifest.gates.browserPackaging, false);
});

test("IFC engine compatibility rejects an unmeasured pin", async () => {
  const fixtureSet = await fixtures();
  const { manifest } = fixtureSet;
  manifest.candidates["web-ifc"].version = "99.0.0";
  assert.throws(
    () => validateFixtures(fixtureSet),
    /pin changed without new evidence/u,
  );
});

test("IFC engine compatibility rejects production claims", async () => {
  const fixtureSet = await fixtures();
  const { manifest } = fixtureSet;
  manifest.decision.productionClaims = true;
  assert.throws(
    () => validateFixtures(fixtureSet),
    /must fail closed/u,
  );
});

test("Browser Worker smoke cannot promote Browser packaging", async () => {
  const fixtureSet = await fixtures();
  const { browserWorkerEvidence } = fixtureSet;
  browserWorkerEvidence.decision.browserPackaging = "passed";
  assert.throws(
    () => validateFixtures(fixtureSet),
    /incomplete or overclaims/u,
  );
});

test("Browser local-file lifecycle cannot promote engine cancellation", async () => {
  const fixtureSet = await fixtures();
  const { browserLifecycleEvidence } = fixtureSet;
  browserLifecycleEvidence.decision.engineCancellation = "passed";
  assert.throws(
    () => validateFixtures(fixtureSet),
    /incomplete or overclaims/u,
  );
});

test("Browser checkpoint cancellation cannot promote in-call cancellation", async () => {
  const fixtureSet = await fixtures();
  const { browserCancellationEvidence } = fixtureSet;
  browserCancellationEvidence.decision.engineInCallCancellation = "passed";
  assert.throws(
    () => validateFixtures(fixtureSet),
    /overclaims engine support/u,
  );
});

test("Browser bounded performance cannot promote large-model support", async () => {
  const fixtureSet = await fixtures();
  const { browserPerformanceEvidence } = fixtureSet;
  browserPerformanceEvidence.decision.largeModelPerformance = "passed";
  assert.throws(
    () => validateFixtures(fixtureSet),
    /overclaims production support/u,
  );
});

test("Browser bounded performance evidence fails above its budget", async () => {
  const fixtureSet = await fixtures();
  const { browserPerformanceEvidence } = fixtureSet;
  browserPerformanceEvidence.observation.resources
    .wasmHeapCapacityBytes.peakObserved =
      browserPerformanceEvidence.budget.maxWasmHeapCapacityBytes + 1;
  assert.throws(
    () => validateFixtures(fixtureSet),
    /WASM heap observation is invalid/u,
  );
});

test("public Browser parse evidence cannot promote rendered first-frame", async () => {
  const fixtureSet = await fixtures();
  fixtureSet.publicBrowserPerformanceEvidence
    .decision.renderFirstFrame = "passed";
  assert.throws(
    () => validateFixtures(fixtureSet),
    /public Browser evidence overclaims support/u,
  );
});

test("negative cleanup evidence rejects an incomplete engine dispose", async () => {
  const fixtureSet = await fixtures();
  fixtureSet.negativeBrowserEvidence.observations[0]
    .receipt.cleanup.engineDisposed = false;
  assert.throws(
    () => validateFixtures(fixtureSet),
    /rejection cleanup is incomplete/u,
  );
});

test("negative cleanup cannot promote in-call cancellation", async () => {
  const fixtureSet = await fixtures();
  fixtureSet.negativeNodeEvidence.decision.inCallCancellation =
    "passed";
  assert.throws(
    () => validateFixtures(fixtureSet),
    /overclaims support/u,
  );
});

test("forced isolation cannot promote cooperative engine cleanup", async () => {
  const fixtureSet = await fixtures();
  fixtureSet.inCallNodeEvidence
    .decision.cooperativeEngineCancellation = "passed";
  assert.throws(
    () => validateFixtures(fixtureSet),
    /overclaims support/u,
  );
});

test("forced Browser cancellation requires a bounded termination receipt", async () => {
  const fixtureSet = await fixtures();
  fixtureSet.inCallBrowserEvidence
    .cancellationObservation.worker.cancellationWaitMs = 1_000;
  assert.throws(
    () => validateFixtures(fixtureSet),
    /receipt is incomplete/u,
  );
});

test("process RSS evidence cannot promote engine memory safety", async () => {
  const fixtureSet = await fixtures();
  fixtureSet.resourceExhaustionEvidence
    .decision.engineMemorySafety = "passed";
  assert.throws(
    () => validateFixtures(fixtureSet),
    /overclaims/u,
  );
});

test("process RSS evidence requires observed limit enforcement", async () => {
  const fixtureSet = await fixtures();
  fixtureSet.resourceExhaustionEvidence.engines[0].runs[0]
    .receipt.residentSetLimitExceeded = false;
  assert.throws(
    () => validateFixtures(fixtureSet),
    /termination receipt is incomplete/u,
  );
});
