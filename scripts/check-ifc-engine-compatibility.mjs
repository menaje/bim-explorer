import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  CAPABILITY_NAMES,
  CAPABILITY_STATUSES,
  FINGERPRINT_PROJECTION,
  REPORT_SCHEMA,
  validateIfcEngineReport,
} from "../packages/ifc-engine-contract/src/index.mjs";

const CANDIDATES = ["web-ifc", "ifcopenshell"];
const STATUS_SET = new Set(CAPABILITY_STATUSES);

function plainRecord(value, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function aggregateCapability(values, label) {
  const evidenced = [...new Set(
    values.filter((value) => value !== "blocked"),
  )];
  if (evidenced.length === 0) {
    return "blocked";
  }
  if (evidenced.length > 1) {
    throw new Error(`${label} has conflicting evidenced statuses`);
  }
  return evidenced[0];
}

function validateBrowserWorkerPrototype(manifest, evidence) {
  const requiredPrototypeGates = [
    "moduleWorkerLoaded",
    "browserWasmInitialized",
    "fixtureAssertionsPassed",
    "engineCleanupReported",
    "workerTerminationRequested",
  ];
  const prototype = plainRecord(
    manifest.prototypes?.webIfcBrowserWorker,
    "prototypes.webIfcBrowserWorker",
  );
  if (
    prototype.status !== "experimental" ||
    prototype.backend !== "browser-wasm-worker-prototype" ||
    prototype.origin !== "loopback-only" ||
    prototype.productionPackaging !== false ||
    typeof prototype.evidence !== "string" ||
    prototype.evidence.length === 0 ||
    typeof prototype.lifecycleEvidence !== "string" ||
    prototype.lifecycleEvidence.length === 0
  ) {
    throw new Error("Browser Worker prototype must remain experimental");
  }
  plainRecord(evidence, "Browser Worker evidence");
  if (
    evidence.schema !== "bim-explorer-browser-worker-evidence/0.1" ||
    evidence.status !== "experimental" ||
    evidence.engine?.id !== "web-ifc" ||
    evidence.engine?.version !== manifest.candidates["web-ifc"].version ||
    evidence.engine?.backend !== prototype.backend ||
    evidence.fixture?.id !== "synthetic-small-ifc4" ||
    evidence.fixture?.schema !== "IFC4" ||
    evidence.fixture?.byteLength !== 2855 ||
    evidence.fixture?.sha256 !==
      "ad3ed676d52c2c49d2a18e8ca2c03b56f54cf1d4de41aada8db55dbdd473a6a2" ||
    evidence.fixture?.artifactCommitted !== false ||
    evidence.fixture?.thirdPartyContent !== false
  ) {
    throw new Error("Browser Worker evidence identity mismatch");
  }
  for (const gate of requiredPrototypeGates) {
    if (evidence.gates?.[gate] !== true) {
      throw new Error(`Browser Worker evidence gate ${gate} did not pass`);
    }
  }
  if (
    Object.keys(evidence.gates ?? {}).length !==
      requiredPrototypeGates.length ||
    evidence.observations?.semantics?.projects !== 1 ||
    evidence.observations?.semantics?.walls !== 1 ||
    evidence.observations?.geometry?.products !== 1 ||
    evidence.observations?.geometry?.triangles !== 12 ||
    evidence.cleanup?.modelClosed !== true ||
    evidence.cleanup?.engineDisposed !== true ||
    evidence.cleanup?.workerTerminationRequested !== true ||
    evidence.diagnostics?.consoleWarnings !== 0 ||
    evidence.diagnostics?.consoleErrors !== 0 ||
    evidence.decision?.prototype !== "passed" ||
    evidence.decision?.browserPackaging !== "blocked" ||
    evidence.decision?.engineSelection !== "held" ||
    evidence.decision?.productionClaims !== false
  ) {
    throw new Error("Browser Worker smoke is incomplete or overclaims support");
  }
}

function validateBrowserFileLifecycle(manifest, evidence) {
  const requiredConformance = [
    "sourceLimitBeforeRead",
    "sourceSizeVerifiedBeforeWorker",
    "activeReplacementCancels",
    "staleOutputSuppressed",
    "explicitCancel",
    "terminalDispose",
    "pagehideDisposalWired",
  ];
  const prototype = plainRecord(
    manifest.prototypes?.webIfcBrowserWorker,
    "prototypes.webIfcBrowserWorker",
  );
  plainRecord(evidence, "Browser local-file lifecycle evidence");
  if (
    evidence.schema !==
      "bim-explorer-browser-file-lifecycle-evidence/0.1" ||
    evidence.status !== "experimental" ||
    evidence.contract?.requestSchema !==
      "bim-explorer-browser-worker-request/0.2" ||
    evidence.contract?.resultSchema !==
      "bim-explorer-browser-worker-result/0.2" ||
    evidence.contract?.maxSourceBytes !== 64 * 1024 * 1024 ||
    evidence.contract?.fileNameTransmitted !== false ||
    evidence.engine?.id !== "web-ifc" ||
    evidence.engine?.version !== manifest.candidates["web-ifc"].version ||
    evidence.engine?.backend !== prototype.backend ||
    evidence.engine?.license !== manifest.candidates["web-ifc"].license
  ) {
    throw new Error("Browser local-file lifecycle identity mismatch");
  }
  if (
    evidence.provenance?.fixtureId !== "synthetic-mapped-ifc4" ||
    evidence.provenance?.repositoryGenerated !== true ||
    evidence.provenance?.artifactCommitted !== false ||
    evidence.provenance?.thirdPartyContent !== false ||
    evidence.provenance?.localChooserInvoked !== true
  ) {
    throw new Error("Browser local-file lifecycle provenance mismatch");
  }
  const observation = plainRecord(
    evidence.localFileObservation,
    "localFileObservation",
  );
  if (
    observation.source?.id !== "local-ifc" ||
    observation.source?.kind !== "local-file" ||
    observation.source?.byteLength !== 4028 ||
    observation.source?.sha256 !==
      "400071d0a99f14ef37c46560bde1651965a378e0586b5f470be3fda81e585243" ||
    observation.source?.schema !== "IFC4" ||
    observation.semantics?.projects !== 1 ||
    observation.semantics?.walls !== 2 ||
    observation.geometry?.products !== 2 ||
    observation.geometry?.triangles !== 24 ||
    observation.cleanup?.modelClosed !== true ||
    observation.cleanup?.engineDisposed !== true ||
    observation.worker?.outcome !== "completed" ||
    observation.worker?.workerTerminationRequested !== true ||
    observation.worker?.timedOut !== false ||
    observation.worker?.cancelled !== false ||
    observation.diagnostics?.consoleWarnings !== 0 ||
    observation.diagnostics?.consoleErrors !== 0 ||
    observation.diagnostics?.fileNameObservedInReceipt !== false
  ) {
    throw new Error("Browser local-file observation is incomplete");
  }
  const sourceSwitch = plainRecord(
    evidence.sourceSwitchObservation,
    "sourceSwitchObservation",
  );
  if (
    sourceSwitch.from !== "local-ifc" ||
    sourceSwitch.to !== "synthetic-small-ifc4" ||
    sourceSwitch.toByteLength !== 2855 ||
    sourceSwitch.toSha256 !==
      "ad3ed676d52c2c49d2a18e8ca2c03b56f54cf1d4de41aada8db55dbdd473a6a2" ||
    sourceSwitch.toSemantics?.projects !== 1 ||
    sourceSwitch.toSemantics?.walls !== 1 ||
    sourceSwitch.toGeometry?.products !== 1 ||
    sourceSwitch.toGeometry?.triangles !== 12 ||
    sourceSwitch.staleOutputObserved !== false
  ) {
    throw new Error("Browser source-switch observation is incomplete");
  }
  for (const gate of requiredConformance) {
    if (evidence.conformance?.[gate] !== true) {
      throw new Error(`Browser lifecycle conformance ${gate} did not pass`);
    }
  }
  if (
    Object.keys(evidence.conformance ?? {}).length !==
      requiredConformance.length ||
    evidence.decision?.localFileLifecyclePrototype !== "passed" ||
    evidence.decision?.engineCancellation !== "blocked" ||
    evidence.decision?.browserPackaging !== "blocked" ||
    evidence.decision?.productionClaims !== false
  ) {
    throw new Error(
      "Browser local-file lifecycle is incomplete or overclaims support",
    );
  }
}

export function validateIfcEngineCompatibility(
  manifest,
  evidenceList,
  browserWorkerEvidence,
  browserLifecycleEvidence,
) {
  plainRecord(manifest, "IFC engine compatibility manifest");
  if (manifest.schema !== "bim-explorer-ifc-engine-compatibility/2") {
    throw new Error("unsupported IFC engine compatibility schema");
  }
  if (manifest.status !== "experimental") {
    throw new Error("IFC engine compatibility must remain experimental");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(manifest.asOf)) {
    throw new Error("IFC engine compatibility asOf must be an ISO date");
  }
  const contract = plainRecord(manifest.contract, "contract");
  if (
    contract.reportSchema !== REPORT_SCHEMA ||
    contract.fingerprintProjection !== FINGERPRINT_PROJECTION ||
    contract.version !== "0.1.0"
  ) {
    throw new Error("compatibility manifest does not use the current contract");
  }
  const profile = plainRecord(manifest.profile, "profile");
  if (
    profile.status !== "draft" ||
    profile.readRender !== "experimental" ||
    profile.writeRoundTrip !== "blocked"
  ) {
    throw new Error("draft IFC profile must separate read/render from write");
  }

  const candidates = plainRecord(manifest.candidates, "candidates");
  for (const id of CANDIDATES) {
    const candidate = plainRecord(candidates[id], `candidates.${id}`);
    if (
      candidate.status !== "experimental" ||
      typeof candidate.version !== "string" ||
      candidate.version.length === 0 ||
      typeof candidate.license !== "string" ||
      candidate.license.length === 0
    ) {
      throw new Error(`${id} requires an experimental exact version/license`);
    }
  }
  if (candidates["web-ifc"].version !== "0.0.77") {
    throw new Error("web-ifc qualification pin changed without new evidence");
  }
  if (candidates.ifcopenshell.version !== "0.8.4.post1") {
    throw new Error(
      "IfcOpenShell qualification pin changed without new evidence",
    );
  }

  const matrix = plainRecord(manifest.operationMatrix, "operation matrix");
  for (const capability of CAPABILITY_NAMES) {
    const operation = plainRecord(
      matrix[capability],
      `operationMatrix.${capability}`,
    );
    for (const id of CANDIDATES) {
      if (!STATUS_SET.has(operation[id])) {
        throw new Error(
          `operationMatrix.${capability}.${id} has an invalid status`,
        );
      }
    }
  }

  const gates = plainRecord(manifest.gates, "gates");
  for (const [gate, passed] of Object.entries(gates)) {
    if (typeof passed !== "boolean") {
      throw new TypeError(`gates.${gate} must be boolean`);
    }
  }
  const decision = plainRecord(manifest.decision, "decision");
  if (
    decision.selection !== "held" ||
    decision.goNoGo !== "held" ||
    decision.productionClaims !== false
  ) {
    throw new Error("experimental engine decision must fail closed");
  }
  if (
    !Array.isArray(manifest.blockers) ||
    manifest.blockers.length === 0
  ) {
    throw new Error("experimental compatibility requires blockers");
  }
  if (
    gates.browserWorkerPrototype !== true ||
    gates.browserLocalFileLifecycle !== true ||
    gates.browserPackaging !== false
  ) {
    throw new Error("Browser Worker prototype Gate must match its evidence");
  }
  validateBrowserWorkerPrototype(manifest, browserWorkerEvidence);
  validateBrowserFileLifecycle(manifest, browserLifecycleEvidence);

  if (
    !Array.isArray(manifest.fixtures) ||
    !Array.isArray(manifest.evidence) ||
    !Array.isArray(evidenceList) ||
    manifest.fixtures.length !== evidenceList.length ||
    manifest.evidence.length !== evidenceList.length
  ) {
    throw new Error("compatibility requires one evidence file per fixture");
  }
  const expectedFixtureIds = manifest.fixtures
    .map((fixture) => plainRecord(fixture, "fixture").id)
    .sort();
  const observedFixtureIds = evidenceList
    .map((evidence) => evidence.fixture?.id)
    .sort();
  if (
    new Set(expectedFixtureIds).size !== expectedFixtureIds.length ||
    JSON.stringify(expectedFixtureIds) !==
      JSON.stringify(observedFixtureIds)
  ) {
    throw new Error("fixture manifest and evidence IDs differ");
  }

  for (const evidence of evidenceList) {
    plainRecord(evidence, "IFC engine evidence");
    if (
      evidence.schema !==
        "bim-explorer-ifc-engine-qualification-evidence/2" ||
      evidence.status !== "experimental" ||
      evidence.decision?.goNoGo !== "held" ||
      evidence.decision?.writeRoundTrip !== "blocked"
    ) {
      throw new Error("IFC engine evidence must remain experimental and held");
    }
    if (
      evidence.crossEngineComparison?.performed !== true ||
      evidence.crossEngineComparison?.passed !== true
    ) {
      throw new Error("cross-engine synthetic comparison did not pass");
    }
  }

  for (const id of CANDIDATES) {
    const reports = [];
    for (const evidence of evidenceList) {
      const engine = evidence.engines.find((item) => item.engine === id);
      if (
        !engine ||
        engine.status !== `passed-${evidence.fixture.id}` ||
        engine.deterministicFingerprint !== true ||
        engine.runs.length !== 2
      ) {
        throw new Error(
          `${id} requires two deterministic runs for ${evidence.fixture.id}`,
        );
      }
      const fingerprints = engine.runs.map((run) => {
        const report = run.report;
        validateIfcEngineReport(report);
        if (
          report.fixture.id !== evidence.fixture.id ||
          report.engine.version !== candidates[id].version ||
          report.engine.license !== candidates[id].license ||
          run.process?.processExited !== true ||
          run.process?.timedOut !== false ||
          run.process?.exitCode !== 0
        ) {
          throw new Error(
            `${id} evidence metadata or process receipt mismatch`,
          );
        }
        return report.fingerprint.value;
      });
      if (new Set(fingerprints).size !== 1) {
        throw new Error(
          `${id} deterministic fingerprints differ for ${evidence.fixture.id}`,
        );
      }
      reports.push(engine.runs[0].report);
    }
    for (const capability of CAPABILITY_NAMES) {
      const aggregate = aggregateCapability(
        reports.map((report) => report.capabilities[capability]),
        `${id}.${capability}`,
      );
      if (aggregate !== matrix[capability][id]) {
        throw new Error(
          `${id} aggregate capability ${capability} differs from the matrix`,
        );
      }
    }
  }

  return Object.freeze({
    status: manifest.status,
    candidates: CANDIDATES.length,
    fixtures: evidenceList.length,
    passedGates: Object.values(gates).filter(Boolean).length,
    heldGates: Object.values(gates).filter((value) => !value).length,
  });
}

async function main() {
  const root = process.cwd();
  const manifest = JSON.parse(
    await readFile(
      path.join(root, "compatibility", "ifc-engines.json"),
      "utf8",
    ),
  );
  const evidence = await Promise.all(
    manifest.evidence.map(async (relative) =>
      JSON.parse(await readFile(path.join(root, relative), "utf8"))),
  );
  const browserWorkerEvidence = JSON.parse(
    await readFile(
      path.join(
        root,
        manifest.prototypes.webIfcBrowserWorker.evidence,
      ),
      "utf8",
    ),
  );
  const browserLifecycleEvidence = JSON.parse(
    await readFile(
      path.join(
        root,
        manifest.prototypes.webIfcBrowserWorker.lifecycleEvidence,
      ),
      "utf8",
    ),
  );
  const report = validateIfcEngineCompatibility(
    manifest,
    evidence,
    browserWorkerEvidence,
    browserLifecycleEvidence,
  );
  console.log(
    `IFC engine compatibility check passed: ${report.status}, ` +
      `${report.candidates} candidates, ${report.fixtures} fixtures, ` +
      `${report.passedGates} passed and ${report.heldGates} held gates`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  await main();
}
