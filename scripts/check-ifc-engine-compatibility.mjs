import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  CAPABILITY_NAMES,
  CAPABILITY_STATUSES,
  canonicalJson,
  FINGERPRINT_PROJECTION,
  REPORT_SCHEMA,
  validateIfcEngineReport,
} from "../packages/ifc-engine-contract/src/index.mjs";

const CANDIDATES = ["web-ifc", "ifcopenshell"];
const STATUS_SET = new Set(CAPABILITY_STATUSES);
const NEGATIVE_CASES = Object.freeze([
  {
    browserExpectedFailurePhase: "source-envelope",
    byteLength: 89,
    description:
      "Complete STEP sections with an invalid exchange-file preamble",
    id: "invalid-step-preamble",
    sha256:
      "de38cf3e586386343c3e77eaf1234193017d1f08e655869d876f21c86dd9a7ee",
  },
  {
    browserExpectedFailurePhase: "source-envelope",
    byteLength: 1781,
    description:
      "Repository-authored IFC4 truncated inside the DATA section",
    id: "truncated-data-section",
    sha256:
      "fe5b79f68b10ef0d3dd784663594f0add98fc8cc00fdb3a4de2d63b819e2bdc7",
  },
  {
    browserExpectedFailurePhase: "semantic-admission",
    byteLength: 2817,
    description:
      "Complete IFC4 envelope with the Project root replaced by a non-root entity",
    id: "missing-project-root",
    sha256:
      "d1833b12414b2d4396a24037034367b4597417d29acb3173bbac232841f8bcfa",
  },
]);

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

function sameJson(left, right) {
  const normalize = (value) => {
    if (Array.isArray(value)) {
      return value.map(normalize);
    }
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value)
          .sort(([leftKey], [rightKey]) =>
            leftKey.localeCompare(rightKey))
          .map(([key, item]) => [key, normalize(item)]),
      );
    }
    return value;
  };
  return JSON.stringify(normalize(left)) ===
    JSON.stringify(normalize(right));
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
    prototype.lifecycleEvidence.length === 0 ||
    typeof prototype.cancellationEvidence !== "string" ||
    prototype.cancellationEvidence.length === 0 ||
    typeof prototype.inCallCancellationEvidence !== "string" ||
    prototype.inCallCancellationEvidence.length === 0 ||
    typeof prototype.performanceEvidence !== "string" ||
    prototype.performanceEvidence.length === 0 ||
    typeof prototype.negativeEvidence !== "string" ||
    prototype.negativeEvidence.length === 0
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

function validateBrowserCheckpointCancellation(manifest, evidence) {
  const requiredConformance = [
    "orderedProgress",
    "modelOpenedCheckpoint",
    "cooperativeCancelRequest",
    "boundedCancellationGrace",
    "forcedTerminationFallback",
    "modelClosed",
    "engineDisposed",
    "postCancellationRecovery",
    "pathFreeReceipt",
  ];
  const prototype = plainRecord(
    manifest.prototypes?.webIfcBrowserWorker,
    "prototypes.webIfcBrowserWorker",
  );
  plainRecord(evidence, "Browser checkpoint cancellation evidence");
  if (
    evidence.schema !==
      "bim-explorer-browser-checkpoint-cancellation-evidence/0.1" ||
    evidence.status !== "experimental" ||
    evidence.contract?.requestSchema !==
      "bim-explorer-browser-worker-request/0.3" ||
    evidence.contract?.resultSchema !==
      "bim-explorer-browser-worker-result/0.3" ||
    evidence.contract?.progressSchema !==
      "bim-explorer-browser-worker-progress/0.1" ||
    evidence.contract?.cancellationGraceMs !== 500 ||
    evidence.engine?.id !== "web-ifc" ||
    evidence.engine?.version !== manifest.candidates["web-ifc"].version ||
    evidence.engine?.backend !== prototype.backend ||
    evidence.engine?.license !== manifest.candidates["web-ifc"].license
  ) {
    throw new Error("Browser checkpoint cancellation identity mismatch");
  }
  if (
    evidence.fixture?.id !== "synthetic-small-ifc4" ||
    evidence.fixture?.byteLength !== 2855 ||
    evidence.fixture?.sha256 !==
      "ad3ed676d52c2c49d2a18e8ca2c03b56f54cf1d4de41aada8db55dbdd473a6a2" ||
    evidence.fixture?.schema !== "IFC4" ||
    evidence.fixture?.repositoryGenerated !== true ||
    evidence.fixture?.artifactCommitted !== false ||
    evidence.fixture?.thirdPartyContent !== false
  ) {
    throw new Error("Browser checkpoint cancellation fixture mismatch");
  }
  const observation = plainRecord(
    evidence.cancellationObservation,
    "cancellationObservation",
  );
  if (
    observation.source?.id !== "synthetic-cancel-ifc4" ||
    observation.source?.kind !== "synthetic" ||
    observation.source?.byteLength !== 2855 ||
    JSON.stringify(observation.observedPhases) !==
      JSON.stringify([
        "engine-initialized",
        "model-opened",
      ]) ||
    observation.requestedAfterPhase !== "model-opened" ||
    observation.receipt?.outcome !== "cancelled-cooperative" ||
    observation.receipt?.cooperativeCancellation !== true ||
    observation.receipt?.lastPhase !== "model-opened" ||
    observation.receipt?.cleanup?.modelClosed !== true ||
    observation.receipt?.cleanup?.engineDisposed !== true ||
    observation.receipt?.workerTerminationRequested !== true ||
    observation.sourceSession?.outcome !== "cancelled" ||
    observation.sourceSession?.workerStarted !== true ||
    observation.sourceSession?.cancelled !== true ||
    observation.sourceSession?.disposed !== false ||
    typeof observation.sourceSession?.wallClockMs !== "number" ||
    observation.sourceSession.wallClockMs <= 0
  ) {
    throw new Error("Browser checkpoint cancellation observation is incomplete");
  }
  const recovery = plainRecord(
    evidence.recoveryObservation,
    "recoveryObservation",
  );
  if (
    recovery.source?.id !== "synthetic-small-ifc4" ||
    recovery.source?.kind !== "synthetic" ||
    recovery.source?.byteLength !== 2855 ||
    recovery.source?.sha256 !==
      "ad3ed676d52c2c49d2a18e8ca2c03b56f54cf1d4de41aada8db55dbdd473a6a2" ||
    recovery.source?.schema !== "IFC4" ||
    recovery.fixtureAssertionsPassed !== true ||
    recovery.worker?.outcome !== "completed" ||
    recovery.worker?.lastPhase !== "inspection-complete" ||
    recovery.worker?.cleanup?.modelClosed !== true ||
    recovery.worker?.cleanup?.engineDisposed !== true ||
    recovery.worker?.workerTerminationRequested !== true ||
    typeof recovery.worker?.wallClockMs !== "number" ||
    recovery.worker.wallClockMs <= 0 ||
    evidence.diagnostics?.consoleWarnings !== 0 ||
    evidence.diagnostics?.consoleErrors !== 0
  ) {
    throw new Error("Browser post-cancellation recovery is incomplete");
  }
  for (const gate of requiredConformance) {
    if (evidence.conformance?.[gate] !== true) {
      throw new Error(
        `Browser checkpoint cancellation ${gate} did not pass`,
      );
    }
  }
  if (
    Object.keys(evidence.conformance ?? {}).length !==
      requiredConformance.length ||
    evidence.decision?.browserCheckpointCancellation !== "passed" ||
    evidence.decision?.engineInCallCancellation !== "blocked" ||
    evidence.decision?.corruptInputCleanup !== "blocked" ||
    evidence.decision?.candidateCancellation !== "blocked" ||
    evidence.decision?.browserPackaging !== "blocked" ||
    evidence.decision?.productionClaims !== false
  ) {
    throw new Error(
      "Browser checkpoint cancellation overclaims engine support",
    );
  }
}

function validateBrowserBoundedPerformance(manifest, evidence) {
  const requiredConformance = [
    "deterministicGeneratedFixture",
    "fixtureIdentityVerified",
    "orderedProgress",
    "budgetEnforced",
    "wasmHeapCapacityObserved",
    "workerCleanup",
    "postPerformanceRecovery",
    "pathFreeReceipt",
  ];
  const prototype = plainRecord(
    manifest.prototypes?.webIfcBrowserWorker,
    "prototypes.webIfcBrowserWorker",
  );
  const performanceFixture = plainRecord(
    manifest.performanceFixture,
    "performanceFixture",
  );
  plainRecord(evidence, "Browser bounded performance evidence");
  if (
    evidence.schema !==
      "bim-explorer-browser-bounded-performance-evidence/0.1" ||
    evidence.status !== "experimental" ||
    evidence.contract?.requestSchema !==
      "bim-explorer-browser-worker-request/0.4" ||
    evidence.contract?.resultSchema !==
      "bim-explorer-browser-worker-result/0.4" ||
    evidence.contract?.progressSchema !==
      "bim-explorer-browser-worker-progress/0.1" ||
    evidence.engine?.id !== "web-ifc" ||
    evidence.engine?.version !== manifest.candidates["web-ifc"].version ||
    evidence.engine?.backend !== prototype.backend ||
    evidence.engine?.license !== manifest.candidates["web-ifc"].license
  ) {
    throw new Error("Browser bounded performance identity mismatch");
  }
  if (
    performanceFixture.id !== "synthetic-performance-1024-ifc4" ||
    performanceFixture.status !== "experimental" ||
    performanceFixture.scope !== "bounded-browser-scale-step" ||
    performanceFixture.manifest !==
      "fixtures/ifc/synthetic-performance/manifest.json" ||
    performanceFixture.artifactCommitted !== false ||
    performanceFixture.thirdPartyContent !== false ||
    performanceFixture.redistributionReleaseApproved !== false ||
    evidence.fixture?.id !== performanceFixture.id ||
    evidence.fixture?.manifest !== performanceFixture.manifest ||
    evidence.fixture?.byteLength !== 388316 ||
    evidence.fixture?.sha256 !==
      "45bafaeb7aac9a5a15f5996598977c662c2add4bf0123106b0ac20457daa78d3" ||
    evidence.fixture?.schema !== "IFC4" ||
    evidence.fixture?.walls !== 1024 ||
    evidence.fixture?.repositoryGenerated !== true ||
    evidence.fixture?.artifactCommitted !== false ||
    evidence.fixture?.thirdPartyContent !== false ||
    evidence.fixture?.redistributionReleaseApproved !== false
  ) {
    throw new Error("Browser bounded performance fixture mismatch");
  }
  const expectedBudget = {
    timeoutMs: 15_000,
    maxInitializationMs: 3_000,
    maxOpenMs: 3_000,
    maxInspectionMs: 5_000,
    maxTotalMs: 8_000,
    maxWallClockMs: 10_000,
    maxWasmHeapCapacityBytes: 256 * 1024 * 1024,
  };
  if (
    JSON.stringify(evidence.budget) !==
      JSON.stringify(expectedBudget)
  ) {
    throw new Error("Browser bounded performance budget mismatch");
  }
  const observation = plainRecord(
    evidence.observation,
    "Browser bounded performance observation",
  );
  if (
    observation.source?.id !== performanceFixture.id ||
    observation.source?.kind !== "synthetic" ||
    observation.source?.byteLength !== 388316 ||
    observation.source?.sha256 !==
      "45bafaeb7aac9a5a15f5996598977c662c2add4bf0123106b0ac20457daa78d3" ||
    observation.source?.schema !== "IFC4" ||
    observation.semantics?.projects !== 1 ||
    observation.semantics?.walls !== 1024 ||
    observation.geometry?.products !== 1024 ||
    observation.geometry?.triangles !== 12288 ||
    observation.resources?.inputBytes !== 388316 ||
    observation.cleanup?.modelClosed !== true ||
    observation.cleanup?.engineDisposed !== true ||
    observation.worker?.outcome !== "completed" ||
    observation.worker?.lastPhase !== "inspection-complete" ||
    observation.worker?.workerTerminationRequested !== true ||
    observation.sourceSession?.outcome !== "completed" ||
    observation.sourceSession?.workerStarted !== true ||
    observation.sourceSession?.cancelled !== false ||
    observation.sourceSession?.disposed !== false
  ) {
    throw new Error("Browser bounded performance observation is incomplete");
  }
  for (const [field, maximum] of Object.entries({
    initializationMs: expectedBudget.maxInitializationMs,
    openMs: expectedBudget.maxOpenMs,
    inspectionMs: expectedBudget.maxInspectionMs,
    totalMs: expectedBudget.maxTotalMs,
  })) {
    const value = observation.performance?.[field];
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > maximum
    ) {
      throw new Error(`Browser bounded performance ${field} exceeded`);
    }
  }
  for (const [value, maximum, label] of [
    [
      observation.worker?.wallClockMs,
      expectedBudget.maxWallClockMs,
      "worker wall clock",
    ],
    [
      observation.sourceSession?.wallClockMs,
      expectedBudget.maxWallClockMs,
      "source-session wall clock",
    ],
  ]) {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value <= 0 ||
      value > maximum
    ) {
      throw new Error(`Browser bounded performance ${label} exceeded`);
    }
  }
  const heap = observation.resources?.wasmHeapCapacityBytes;
  if (
    !Number.isSafeInteger(heap?.afterInitialization) ||
    !Number.isSafeInteger(heap?.afterOpen) ||
    !Number.isSafeInteger(heap?.afterInspection) ||
    !Number.isSafeInteger(heap?.peakObserved) ||
    heap.afterInitialization <= 0 ||
    heap.afterInitialization > heap.afterOpen ||
    heap.afterOpen > heap.afterInspection ||
    heap.peakObserved !== Math.max(
      heap.afterInitialization,
      heap.afterOpen,
      heap.afterInspection,
    ) ||
    heap.peakObserved > expectedBudget.maxWasmHeapCapacityBytes
  ) {
    throw new Error(
      "Browser bounded performance WASM heap observation is invalid",
    );
  }
  if (
    evidence.recoveryObservation?.sourceId !== "synthetic-small-ifc4" ||
    evidence.recoveryObservation?.byteLength !== 2855 ||
    evidence.recoveryObservation?.sha256 !==
      "ad3ed676d52c2c49d2a18e8ca2c03b56f54cf1d4de41aada8db55dbdd473a6a2" ||
    evidence.recoveryObservation?.fixtureAssertionsPassed !== true ||
    evidence.recoveryObservation?.cleanup?.modelClosed !== true ||
    evidence.recoveryObservation?.cleanup?.engineDisposed !== true ||
    evidence.recoveryObservation?.workerTerminationRequested !== true ||
    evidence.diagnostics?.consoleWarnings !== 0 ||
    evidence.diagnostics?.consoleErrors !== 0
  ) {
    throw new Error("Browser post-performance recovery is incomplete");
  }
  for (const gate of requiredConformance) {
    if (evidence.conformance?.[gate] !== true) {
      throw new Error(
        `Browser bounded performance ${gate} did not pass`,
      );
    }
  }
  if (
    Object.keys(evidence.conformance ?? {}).length !==
      requiredConformance.length ||
    evidence.decision?.browserBoundedPerformance !== "passed" ||
    evidence.decision?.largeModelPerformance !== "blocked" ||
    evidence.decision?.peakProcessMemory !== "blocked" ||
    evidence.decision?.gpuMemory !== "blocked" ||
    evidence.decision?.browserPackaging !== "blocked" ||
    evidence.decision?.redistributionRelease !== "blocked" ||
    evidence.decision?.productionClaims !== false ||
    !Array.isArray(evidence.limits) ||
    evidence.limits.length < 5
  ) {
    throw new Error(
      "Browser bounded performance overclaims production support",
    );
  }
}

function boundedMeasurement(value, maximum, label) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > maximum
  ) {
    throw new Error(`${label} exceeded its budget`);
  }
}

function validatePublicNodePerformance(manifest, evidence) {
  const fixture = plainRecord(
    manifest.publicPerformanceFixture,
    "publicPerformanceFixture",
  );
  plainRecord(evidence, "public Node performance evidence");
  const expectedBudget = {
    timeoutMs: 30_000,
    maxInitializationMs: 3_000,
    maxOpenMs: 10_000,
    maxInspectionMs: 15_000,
    maxTotalMs: 25_000,
    maxWallClockMs: 30_000,
    maxWasmHeapCapacityBytes: 512 * 1024 * 1024,
    maxProcessRssBytes: 768 * 1024 * 1024,
  };
  if (
    fixture.id !== "public-schependomlaan-complete-ifc2x3" ||
    fixture.status !== "experimental" ||
    fixture.scope !==
      "representative-node-and-browser-parse-performance" ||
    fixture.manifest !==
      "fixtures/ifc/public-schependomlaan/manifest.json" ||
    fixture.rendererEvidence !==
      "compatibility/evidence/" +
        "bim-renderer-3d-public-browser-webgl2-2026-08-04.json" ||
    fixture.license !== "CC-BY-4.0" ||
    fixture.rightsVerified !== true ||
    fixture.artifactCommitted !== false ||
    fixture.thirdPartyContent !== true ||
    fixture.bundlingApproved !== false ||
    fixture.profileAdmission !== false ||
    evidence.schema !==
      "bim-explorer-public-ifc-performance-evidence/0.1" ||
    evidence.status !== "experimental" ||
    evidence.fixture?.id !== fixture.id ||
    evidence.fixture?.manifest !== fixture.manifest ||
    evidence.fixture?.schema !== "IFC2X3" ||
    evidence.fixture?.byteLength !== 46_766_968 ||
    evidence.fixture?.sha256 !==
      "5c73cdd02b3add09b30cf437eb3fe01bc4631e5a60dbaf30c0b8a7b817585bb4" ||
    evidence.fixture?.artifactCommitted !== false ||
    evidence.fixture?.thirdPartyContent !== true ||
    evidence.fixture?.profileAdmission !== false ||
    evidence.provenance?.repository !==
      "buildingsmart-community/Community-Sample-Test-Files" ||
    evidence.provenance?.commit !==
      "7ddf57a201f88a0c213d5322b02ed15e94a60a40" ||
    evidence.provenance?.license !== fixture.license ||
    evidence.provenance?.rightsVerified !== true ||
    evidence.provenance?.bundlingApproved !== false ||
    evidence.acquisition?.outcome !== "verified" ||
    evidence.acquisition?.source?.archiveBytes !== 8_873_221 ||
    evidence.acquisition?.source?.archiveSha256 !==
      "cc79df850d6bb38d1853b22a91ce602c1d743c1be02a8d742a1e4a2e4f4350fb" ||
    evidence.acquisition?.entry?.byteLength !== 46_766_968 ||
    evidence.acquisition?.entry?.sha256 !==
      "5c73cdd02b3add09b30cf437eb3fe01bc4631e5a60dbaf30c0b8a7b817585bb4" ||
    JSON.stringify(evidence.budget) !== JSON.stringify(expectedBudget) ||
    evidence.engine?.id !== "web-ifc" ||
    evidence.engine?.version !== manifest.candidates["web-ifc"].version ||
    evidence.engine?.backend !== "node-wasm-isolated-performance" ||
    evidence.engine?.license !== manifest.candidates["web-ifc"].license ||
    !Array.isArray(evidence.runs) ||
    evidence.runs.length !== 2
  ) {
    throw new Error("public Node performance identity mismatch");
  }
  for (const run of evidence.runs) {
    const report = plainRecord(run.report, "public Node report");
    if (
      report.schema !==
        "bim-explorer-web-ifc-performance-report/1" ||
      report.status !== "passed" ||
      report.source?.id !== fixture.id ||
      report.source?.kind !== "third-party-public-performance" ||
      report.source?.byteLength !== 46_766_968 ||
      report.source?.sha256 !==
        "5c73cdd02b3add09b30cf437eb3fe01bc4631e5a60dbaf30c0b8a7b817585bb4" ||
      report.source?.schema !== "IFC2X3" ||
      report.semantics?.projects !== 1 ||
      report.semantics?.walls !== 652 ||
      report.semantics?.productsByType !== 3_708 ||
      report.geometry?.products !== 3_569 ||
      report.geometry?.geometries !== 6_105 ||
      report.geometry?.triangles !== 261_424 ||
      report.resources?.inputBytes !== 46_766_968 ||
      report.cleanup?.modelClosed !== true ||
      report.cleanup?.engineDisposed !== true ||
      run.process?.outcome !== "completed" ||
      run.process?.processExited !== true ||
      run.process?.exitCode !== 0 ||
      run.process?.timedOut !== false ||
      run.process?.cancelled !== false ||
      run.process?.outputLimitExceeded !== false ||
      run.process?.stderrCaptured !== false
    ) {
      throw new Error("public Node performance run is incomplete");
    }
    for (const [field, maximum] of Object.entries({
      initializationMs: expectedBudget.maxInitializationMs,
      openMs: expectedBudget.maxOpenMs,
      inspectionMs: expectedBudget.maxInspectionMs,
      totalMs: expectedBudget.maxTotalMs,
    })) {
      boundedMeasurement(
        report.performance?.[field],
        maximum,
        `public Node ${field}`,
      );
    }
    boundedMeasurement(
      run.process.wallClockMs,
      expectedBudget.maxWallClockMs,
      "public Node process wall clock",
    );
    const heap = report.resources?.wasmHeapCapacityBytes;
    const memory = report.resources?.processMemoryBytes;
    if (
      !Number.isSafeInteger(heap?.peakObserved) ||
      heap.peakObserved <= 0 ||
      heap.peakObserved > expectedBudget.maxWasmHeapCapacityBytes ||
      !Number.isSafeInteger(memory?.maximumResidentSetSize) ||
      memory.maximumResidentSetSize <= 0 ||
      memory.maximumResidentSetSize >
        expectedBudget.maxProcessRssBytes
    ) {
      throw new Error("public Node resource budget is invalid");
    }
  }
  if (
    !Object.values(evidence.conformance ?? {})
      .every((value) => value === true) ||
    Object.keys(evidence.conformance ?? {}).length !== 10 ||
    evidence.decision?.publicFixtureProvenance !== "passed" ||
    evidence.decision?.representativeNodeCpuRss !== "passed" ||
    evidence.decision?.gpuMemory !== "blocked" ||
    evidence.decision?.renderFirstFrame !== "blocked" ||
    evidence.decision?.fixtureBundling !== "blocked" ||
    evidence.decision?.draftProfileAdmission !== "blocked" ||
    evidence.decision?.engineSelection !== "held" ||
    evidence.decision?.productionClaims !== false
  ) {
    throw new Error("public Node evidence overclaims support");
  }
}

function validatePublicBrowserPerformance(manifest, evidence) {
  const fixture = plainRecord(
    manifest.publicPerformanceFixture,
    "publicPerformanceFixture",
  );
  const prototype = plainRecord(
    manifest.prototypes?.webIfcBrowserWorker,
    "prototypes.webIfcBrowserWorker",
  );
  plainRecord(evidence, "public Browser performance evidence");
  const expectedBudget = {
    timeoutMs: 30_000,
    maxInitializationMs: 3_000,
    maxOpenMs: 10_000,
    maxInspectionMs: 15_000,
    maxTotalMs: 25_000,
    maxWallClockMs: 30_000,
    maxWasmHeapCapacityBytes: 512 * 1024 * 1024,
  };
  const observation = plainRecord(
    evidence.observation,
    "public Browser observation",
  );
  if (
    prototype.publicPerformanceEvidence !== fixture.browserEvidence ||
    evidence.schema !==
      "bim-explorer-browser-public-representative-performance-evidence/0.1" ||
    evidence.status !== "experimental" ||
    evidence.contract?.requestSchema !==
      "bim-explorer-browser-worker-request/0.4" ||
    evidence.contract?.resultSchema !==
      "bim-explorer-browser-worker-result/0.4" ||
    evidence.contract?.progressSchema !==
      "bim-explorer-browser-worker-progress/0.1" ||
    evidence.engine?.id !== "web-ifc" ||
    evidence.engine?.version !== manifest.candidates["web-ifc"].version ||
    evidence.engine?.backend !== prototype.backend ||
    evidence.engine?.license !== manifest.candidates["web-ifc"].license ||
    evidence.fixture?.id !== fixture.id ||
    evidence.fixture?.manifest !== fixture.manifest ||
    evidence.fixture?.schema !== "IFC2X3" ||
    evidence.fixture?.byteLength !== 46_766_968 ||
    evidence.fixture?.sha256 !==
      "5c73cdd02b3add09b30cf437eb3fe01bc4631e5a60dbaf30c0b8a7b817585bb4" ||
    evidence.fixture?.archiveByteLength !== 8_873_221 ||
    evidence.fixture?.archiveSha256 !==
      "cc79df850d6bb38d1853b22a91ce602c1d743c1be02a8d742a1e4a2e4f4350fb" ||
    evidence.fixture?.license !== fixture.license ||
    evidence.fixture?.rightsVerified !== true ||
    evidence.fixture?.artifactCommitted !== false ||
    evidence.fixture?.archivePersisted !== false ||
    evidence.fixture?.thirdPartyContent !== true ||
    evidence.fixture?.bundlingApproved !== false ||
    evidence.fixture?.profileAdmission !== false ||
    JSON.stringify(evidence.budget) !== JSON.stringify(expectedBudget) ||
    observation.source?.id !== fixture.id ||
    observation.source?.kind !== "public-fixture" ||
    observation.source?.byteLength !== 46_766_968 ||
    observation.source?.sha256 !==
      "5c73cdd02b3add09b30cf437eb3fe01bc4631e5a60dbaf30c0b8a7b817585bb4" ||
    observation.source?.schema !== "IFC2X3" ||
    observation.semantics?.projects !== 1 ||
    observation.semantics?.walls !== 652 ||
    observation.geometry?.products !== 3_569 ||
    observation.geometry?.triangles !== 261_424 ||
    observation.resources?.inputBytes !== 46_766_968 ||
    observation.cleanup?.modelClosed !== true ||
    observation.cleanup?.engineDisposed !== true ||
    observation.worker?.outcome !== "completed" ||
    observation.worker?.lastPhase !== "inspection-complete" ||
    observation.worker?.workerTerminationRequested !== true ||
    observation.sourceSession?.outcome !== "completed" ||
    observation.sourceSession?.workerStarted !== true ||
    observation.sourceSession?.cancelled !== false ||
    observation.performanceAssessment?.passed !== true ||
    observation.performanceAssessment?.violations?.length !== 0
  ) {
    throw new Error("public Browser performance identity mismatch");
  }
  for (const [field, maximum] of Object.entries({
    initializationMs: expectedBudget.maxInitializationMs,
    openMs: expectedBudget.maxOpenMs,
    inspectionMs: expectedBudget.maxInspectionMs,
    totalMs: expectedBudget.maxTotalMs,
  })) {
    boundedMeasurement(
      observation.performance?.[field],
      maximum,
      `public Browser ${field}`,
    );
  }
  boundedMeasurement(
    observation.worker.wallClockMs,
    expectedBudget.maxWallClockMs,
    "public Browser Worker wall clock",
  );
  boundedMeasurement(
    observation.sourceSession.wallClockMs,
    expectedBudget.maxWallClockMs,
    "public Browser session wall clock",
  );
  const heap = observation.resources?.wasmHeapCapacityBytes;
  if (
    !Number.isSafeInteger(heap?.peakObserved) ||
    heap.peakObserved <= 0 ||
    heap.peakObserved > expectedBudget.maxWasmHeapCapacityBytes ||
    evidence.recoveryObservation?.source?.id !==
      "synthetic-small-ifc4" ||
    evidence.recoveryObservation?.geometry?.triangles !== 12 ||
    evidence.recoveryObservation?.cleanup?.modelClosed !== true ||
    evidence.recoveryObservation?.cleanup?.engineDisposed !== true ||
    evidence.recoveryObservation?.worker?.outcome !== "completed" ||
    evidence.diagnostics?.consoleWarnings !== 0 ||
    evidence.diagnostics?.consoleErrors !== 0
  ) {
    throw new Error("public Browser resource or recovery evidence is invalid");
  }
  if (
    !Object.values(evidence.conformance ?? {})
      .every((value) => value === true) ||
    Object.keys(evidence.conformance ?? {}).length !== 11 ||
    evidence.decision?.publicFixtureProvenance !== "passed" ||
    evidence.decision?.browserRepresentativeParsing !== "passed" ||
    evidence.decision?.largeModelPerformance !== "blocked" ||
    evidence.decision?.browserPeakProcessMemory !== "blocked" ||
    evidence.decision?.gpuMemory !== "blocked" ||
    evidence.decision?.renderFirstFrame !== "blocked" ||
    evidence.decision?.browserPackaging !== "blocked" ||
    evidence.decision?.fixtureBundling !== "blocked" ||
    evidence.decision?.draftProfileAdmission !== "blocked" ||
    evidence.decision?.productionClaims !== false ||
    !Array.isArray(evidence.limits) ||
    evidence.limits.length < 5
  ) {
    throw new Error("public Browser evidence overclaims support");
  }
}

function validateNegativeCorpus(
  manifest,
  nodeEvidence,
  browserEvidence,
) {
  const negative = plainRecord(
    manifest.negativeCorpus,
    "negativeCorpus",
  );
  const prototype = plainRecord(
    manifest.prototypes?.webIfcBrowserWorker,
    "prototypes.webIfcBrowserWorker",
  );
  if (
    negative.id !== "synthetic-negative-ifc-corpus" ||
    negative.status !== "experimental" ||
    negative.scope !==
      "adapter-process-and-browser-worker-rejection-cleanup" ||
    negative.manifest !==
      "fixtures/ifc/negative-corpus/manifest.json" ||
    prototype.negativeEvidence !== negative.browserEvidence ||
    negative.artifactCommitted !== false ||
    negative.thirdPartyContent !== false ||
    negative.resourceExhaustionQualified !== false ||
    negative.inCallCancellationQualified !== false
  ) {
    throw new Error("negative IFC corpus manifest is invalid");
  }

  plainRecord(nodeEvidence, "negative IFC Node evidence");
  if (
    nodeEvidence.schema !==
      "bim-explorer-ifc-negative-corpus-evidence/0.1" ||
    nodeEvidence.status !== "experimental" ||
    nodeEvidence.fixture?.id !== negative.id ||
    nodeEvidence.fixture?.kind !==
      "repository-authored-generated-negative-corpus" ||
    nodeEvidence.fixture?.artifactCommitted !== false ||
    nodeEvidence.fixture?.thirdPartyContent !== false ||
    !sameJson(
      nodeEvidence.fixture?.cases,
      NEGATIVE_CASES.map((fixture) => ({
        ...fixture,
        expected: "rejected",
      })),
    ) ||
    !Array.isArray(nodeEvidence.engines) ||
    nodeEvidence.engines.length !== CANDIDATES.length
  ) {
    throw new Error("negative IFC Node evidence identity mismatch");
  }
  for (const engineId of CANDIDATES) {
    const engine = nodeEvidence.engines
      .find((candidate) => candidate.engine === engineId);
    if (
      engine?.status !== "passed-negative-corpus" ||
      !Array.isArray(engine.cases) ||
      engine.cases.length !== NEGATIVE_CASES.length
    ) {
      throw new Error(`${engineId} negative corpus evidence is missing`);
    }
    for (const fixture of NEGATIVE_CASES) {
      const observation = engine.cases
        .find((candidate) => candidate.id === fixture.id);
      if (
        observation?.deterministicRejection !== true ||
        !Array.isArray(observation.runs) ||
        observation.runs.length !== 2 ||
        !sameJson(
          observation.runs[0]?.report,
          observation.runs[1]?.report,
        )
      ) {
        throw new Error(
          `${engineId} ${fixture.id} rejection is not deterministic`,
        );
      }
      for (const run of observation.runs) {
        const report = run.report;
        if (
          report?.schema !==
            "bim-explorer-ifc-negative-result/0.1" ||
          report.status !== "rejected" ||
          report.engine?.id !== engineId ||
          report.engine?.version !==
            manifest.candidates[engineId].version ||
          report.fixture?.id !== fixture.id ||
          report.fixture?.byteLength !== fixture.byteLength ||
          report.fixture?.sha256 !== fixture.sha256 ||
          report.failure?.code !== "IFC_INPUT_REJECTED" ||
          typeof report.failure?.phase !== "string" ||
          report.cleanup?.engineInitialized !== true ||
          run.process?.outcome !== "completed" ||
          run.process?.processExited !== true ||
          run.process?.exitCode !== 0 ||
          run.process?.timedOut !== false
        ) {
          throw new Error(
            `${engineId} ${fixture.id} rejection receipt is incomplete`,
          );
        }
        if (
          engineId === "web-ifc"
            ? (
              report.cleanup.strategy !== "explicit-api" ||
              report.cleanup.modelOpened !== true ||
              report.cleanup.modelClosed !== true ||
              report.cleanup.engineDisposed !== true ||
              report.cleanup.processExitRequired !== false
            )
            : (
              report.cleanup.strategy !== "process-isolation" ||
              report.cleanup.processExitRequired !== true ||
              (
                report.cleanup.modelOpened &&
                report.cleanup.modelReferenceReleased !== true
              )
            )
        ) {
          throw new Error(
            `${engineId} ${fixture.id} cleanup boundary is invalid`,
          );
        }
      }
      const recovery = observation.recovery;
      if (
        recovery?.source?.id !== "synthetic-small-ifc4" ||
        recovery.source.byteLength !== 2855 ||
        recovery.source.sha256 !==
          "ad3ed676d52c2c49d2a18e8ca2c03b56f54cf1d4de41aada8db55dbdd473a6a2" ||
        recovery.source.schema !== "IFC4" ||
        recovery.semantics?.projects !== 1 ||
        recovery.semantics?.walls !== 1 ||
        recovery.geometry?.products !== 1 ||
        recovery.geometry?.triangles !== 12 ||
        recovery.process?.outcome !== "completed" ||
        recovery.process?.processExited !== true ||
        recovery.process?.exitCode !== 0 ||
        (
          engineId === "web-ifc" &&
          (
            recovery.cleanup?.modelClosed !== true ||
            recovery.cleanup?.engineDisposed !== true
          )
        )
      ) {
        throw new Error(`${engineId} post-negative recovery is invalid`);
      }
    }
  }
  if (
    !Object.values(nodeEvidence.conformance ?? {})
      .every((value) => value === true) ||
    Object.keys(nodeEvidence.conformance ?? {}).length !== 7 ||
    nodeEvidence.decision?.corruptInputCleanup !==
      "passed-adapter-boundary" ||
    nodeEvidence.decision?.browserWorkerCorruptInputCleanup !==
      "separate-evidence-required" ||
    nodeEvidence.decision?.inCallCancellation !== "blocked" ||
    nodeEvidence.decision?.resourceExhaustion !== "blocked" ||
    nodeEvidence.decision?.productionPackaging !== "blocked" ||
    nodeEvidence.decision?.productionClaims !== false
  ) {
    throw new Error("negative IFC Node evidence overclaims support");
  }

  plainRecord(browserEvidence, "negative IFC Browser evidence");
  if (
    browserEvidence.schema !==
      "bim-explorer-browser-negative-corpus-evidence/0.1" ||
    browserEvidence.status !== "experimental" ||
    browserEvidence.contract?.requestSchema !==
      "bim-explorer-browser-worker-request/0.4" ||
    browserEvidence.contract?.resultSchema !==
      "bim-explorer-browser-worker-result/0.4" ||
    browserEvidence.contract?.progressSchema !==
      "bim-explorer-browser-worker-progress/0.1" ||
    browserEvidence.engine?.id !== "web-ifc" ||
    browserEvidence.engine?.version !==
      manifest.candidates["web-ifc"].version ||
    browserEvidence.engine?.backend !== prototype.backend ||
    browserEvidence.engine?.license !==
      manifest.candidates["web-ifc"].license ||
    browserEvidence.fixture?.id !== negative.id ||
    browserEvidence.fixture?.manifest !== negative.manifest ||
    browserEvidence.fixture?.artifactCommitted !== false ||
    browserEvidence.fixture?.thirdPartyContent !== false ||
    !sameJson(
      browserEvidence.fixture?.cases,
      NEGATIVE_CASES.map((fixture) => ({
        id: fixture.id,
        byteLength: fixture.byteLength,
        sha256: fixture.sha256,
        expectedFailurePhase:
          fixture.browserExpectedFailurePhase,
      })),
    ) ||
    !Array.isArray(browserEvidence.observations) ||
    browserEvidence.observations.length !== NEGATIVE_CASES.length
  ) {
    throw new Error("negative IFC Browser evidence identity mismatch");
  }
  for (const fixture of NEGATIVE_CASES) {
    const observation = browserEvidence.observations
      .find((candidate) => candidate.id === fixture.id);
    const modelOpened =
      fixture.browserExpectedFailurePhase === "semantic-admission";
    const expectedPhases = modelOpened
      ? ["engine-initialized", "model-opened"]
      : ["engine-initialized"];
    if (
      observation?.source?.id !== `negative-${fixture.id}` ||
      observation.source.kind !== "synthetic" ||
      observation.source.byteLength !== fixture.byteLength ||
      observation.source.sha256 !== fixture.sha256 ||
      !sameJson(observation.observedPhases, expectedPhases) ||
      observation.receipt?.outcome !== "inspection-rejected" ||
      observation.receipt?.lastPhase !== expectedPhases.at(-1) ||
      observation.receipt?.cleanup?.modelOpened !== modelOpened ||
      observation.receipt?.cleanup?.modelClosed !== modelOpened ||
      observation.receipt?.cleanup?.engineDisposed !== true ||
      observation.receipt?.rejection?.diagnosticCode !==
        "BROWSER_IFC_INPUT_REJECTED" ||
      observation.receipt?.rejection?.phase !==
        fixture.browserExpectedFailurePhase ||
      observation.receipt?.workerTerminationRequested !== true ||
      typeof observation.receipt?.wallClockMs !== "number" ||
      observation.receipt.wallClockMs <= 0
    ) {
      throw new Error(
        `Browser ${fixture.id} rejection cleanup is incomplete`,
      );
    }
  }
  const recovery = browserEvidence.recoveryObservation;
  if (
    recovery?.source?.id !== "synthetic-negative-recovery-ifc4" ||
    recovery.source.kind !== "synthetic" ||
    recovery.source.byteLength !== 2855 ||
    recovery.source.sha256 !==
      "ad3ed676d52c2c49d2a18e8ca2c03b56f54cf1d4de41aada8db55dbdd473a6a2" ||
    recovery.source.schema !== "IFC4" ||
    recovery.semantics?.projects !== 1 ||
    recovery.semantics?.walls !== 1 ||
    recovery.geometry?.products !== 1 ||
    recovery.geometry?.triangles !== 12 ||
    recovery.resources?.inputBytes !== 2855 ||
    recovery.cleanup?.modelClosed !== true ||
    recovery.cleanup?.engineDisposed !== true ||
    recovery.worker?.outcome !== "completed" ||
    recovery.worker?.lastPhase !== "inspection-complete" ||
    recovery.worker?.cleanup?.modelClosed !== true ||
    recovery.worker?.cleanup?.engineDisposed !== true ||
    recovery.worker?.workerTerminationRequested !== true ||
    recovery.sourceSession?.outcome !== "completed" ||
    recovery.sourceSession?.workerStarted !== true ||
    recovery.sourceSession?.cancelled !== false ||
    recovery.sourceSession?.disposed !== false
  ) {
    throw new Error("Browser post-negative recovery is incomplete");
  }
  for (const [label, value] of Object.entries({
    initializationMs: recovery.performance?.initializationMs,
    inspectionMs: recovery.performance?.inspectionMs,
    openMs: recovery.performance?.openMs,
    totalMs: recovery.performance?.totalMs,
    workerWallClockMs: recovery.worker?.wallClockMs,
    sessionWallClockMs: recovery.sourceSession?.wallClockMs,
  })) {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value <= 0
    ) {
      throw new Error(`Browser negative recovery ${label} is invalid`);
    }
  }
  if (
    !Object.values(browserEvidence.conformance ?? {})
      .every((value) => value === true) ||
    Object.keys(browserEvidence.conformance ?? {}).length !== 8 ||
    browserEvidence.diagnostics?.consoleWarnings !== 0 ||
    browserEvidence.diagnostics?.consoleErrors !== 0 ||
    browserEvidence.decision?.browserCorruptInputCleanup !== "passed" ||
    browserEvidence.decision?.adapterCorruptInputCleanup !==
      "paired-node-evidence" ||
    browserEvidence.decision?.inCallCancellation !== "blocked" ||
    browserEvidence.decision?.resourceExhaustion !== "blocked" ||
    browserEvidence.decision?.browserPackaging !== "blocked" ||
    browserEvidence.decision?.productionClaims !== false ||
    /(?:\/Users\/|\/Volumes\/|[A-Z]:\\)/u.test(
      JSON.stringify({
        browserEvidence,
        nodeEvidence,
      }),
    )
  ) {
    throw new Error("negative IFC evidence is incomplete or overclaims");
  }
  return {
    "web-ifc": "mapped",
    ifcopenshell: "mapped",
  };
}

function validateInCallCancellation(
  manifest,
  nodeEvidence,
  browserEvidence,
) {
  const qualification = plainRecord(
    manifest.inCallCancellation,
    "inCallCancellation",
  );
  const prototype = plainRecord(
    manifest.prototypes?.webIfcBrowserWorker,
    "prototypes.webIfcBrowserWorker",
  );
  if (
    qualification.status !== "experimental" ||
    qualification.scope !==
      "forced-process-and-browser-worker-isolation" ||
    qualification.fixture !==
      "fixtures/ifc/public-schependomlaan/manifest.json" ||
    prototype.inCallCancellationEvidence !==
      qualification.browserEvidence ||
    qualification.forcedIsolationQualified !== true ||
    qualification.cooperativeEngineCancellationQualified !== false ||
    qualification.explicitCleanupDuringCallQualified !== false ||
    qualification.resourceExhaustionQualified !== false
  ) {
    throw new Error("in-call cancellation manifest is invalid");
  }

  const publicSource = {
    byteLength: 46_766_968,
    id: "public-schependomlaan-complete-ifc2x3",
    sha256:
      "5c73cdd02b3add09b30cf437eb3fe01bc4631e5a60dbaf30c0b8a7b817585bb4",
  };
  const recoverySource = {
    byteLength: 2_855,
    id: "synthetic-small-ifc4",
    schema: "IFC4",
    sha256:
      "ad3ed676d52c2c49d2a18e8ca2c03b56f54cf1d4de41aada8db55dbdd473a6a2",
  };
  const identities = {
    "web-ifc": {
      backend: "node-wasm-process",
      cleanup: {
        engineDisposed: true,
        modelClosed: true,
      },
    },
    ifcopenshell: {
      backend: "python-native-process",
      cleanup: {
        engineDisposed: false,
        modelClosed: false,
      },
    },
  };

  plainRecord(nodeEvidence, "in-call cancellation Node evidence");
  if (
    nodeEvidence.schema !==
      "bim-explorer-ifc-in-call-cancellation-evidence/0.1" ||
    nodeEvidence.status !== "experimental" ||
    nodeEvidence.fixture?.id !== publicSource.id ||
    nodeEvidence.fixture?.byteLength !== publicSource.byteLength ||
    nodeEvidence.fixture?.sha256 !== publicSource.sha256 ||
    nodeEvidence.fixture?.schema !== "IFC2X3" ||
    nodeEvidence.fixture?.artifactCommitted !== false ||
    nodeEvidence.fixture?.bundlingApproved !== false ||
    nodeEvidence.fixture?.customerContent !== false ||
    nodeEvidence.policy?.callStartCheckpoint !==
      "model-open-call-starting" ||
    nodeEvidence.policy?.cancellationDelayMs !== 25 ||
    nodeEvidence.policy?.cancellationGraceMs !== 500 ||
    nodeEvidence.policy?.timeoutMs !== 30_000 ||
    !Array.isArray(nodeEvidence.engines) ||
    nodeEvidence.engines.length !== CANDIDATES.length
  ) {
    throw new Error("in-call cancellation Node evidence identity mismatch");
  }
  for (const engineId of CANDIDATES) {
    const engine = nodeEvidence.engines
      .find((candidate) => candidate.engine === engineId);
    if (
      engine?.status !==
        "passed-forced-isolation-cancellation" ||
      !Array.isArray(engine.runs) ||
      engine.runs.length !== 2
    ) {
      throw new Error(`${engineId} in-call cancellation is missing`);
    }
    for (let index = 0; index < engine.runs.length; index += 1) {
      const run = engine.runs[index];
      if (
        run.attempt !== index + 1 ||
        run.checkpoint?.schema !==
          "bim-explorer-ifc-in-call-progress/0.1" ||
        run.checkpoint?.phase !== "model-open-call-starting" ||
        run.checkpoint?.engine?.id !== engineId ||
        run.checkpoint?.engine?.version !==
          manifest.candidates[engineId].version ||
        run.checkpoint?.engine?.backend !==
          identities[engineId].backend ||
        run.checkpoint?.source?.id !== publicSource.id ||
        run.checkpoint?.source?.byteLength !==
          publicSource.byteLength ||
        run.checkpoint?.source?.sha256 !== publicSource.sha256 ||
        typeof run.checkpoint?.observedAfterStartMs !== "number" ||
        !Number.isFinite(run.checkpoint.observedAfterStartMs) ||
        run.checkpoint.observedAfterStartMs <= 0 ||
        run.cancellationDelayMs !== 25 ||
        run.receipt?.outcome !== "cancelled" ||
        run.receipt?.processExited !== true ||
        run.receipt?.cancelled !== true ||
        run.receipt?.timedOut !== false ||
        run.receipt?.outputLimitExceeded !== false ||
        !["SIGTERM", "SIGKILL"].includes(run.receipt?.signal) ||
        typeof run.receipt?.wallClockMs !== "number" ||
        !Number.isFinite(run.receipt.wallClockMs) ||
        run.receipt.wallClockMs <=
          run.checkpoint.observedAfterStartMs
      ) {
        throw new Error(
          `${engineId} in-call cancellation receipt is incomplete`,
        );
      }
    }
    const recovery = engine.recovery;
    if (
      !sameJson(recovery?.source, {
        ...recoverySource,
        view: "ReferenceView_V1.2",
      }) ||
      recovery.semantics?.projects !== 1 ||
      recovery.semantics?.walls !== 1 ||
      recovery.geometry?.products !== 1 ||
      recovery.geometry?.triangles !== 12 ||
      !sameJson(recovery.cleanup, identities[engineId].cleanup) ||
      recovery.process?.outcome !== "completed" ||
      recovery.process?.processExited !== true ||
      recovery.process?.exitCode !== 0 ||
      recovery.process?.timedOut !== false ||
      recovery.process?.cancelled !== false
    ) {
      throw new Error(
        `${engineId} post-cancellation recovery is incomplete`,
      );
    }
  }
  if (
    !Object.values(nodeEvidence.conformance ?? {})
      .every((value) => value === true) ||
    Object.keys(nodeEvidence.conformance ?? {}).length !== 7 ||
    nodeEvidence.decision?.forcedIsolationCancellation !== "passed" ||
    nodeEvidence.decision?.cooperativeEngineCancellation !== "blocked" ||
    nodeEvidence.decision?.explicitCleanupDuringCall !== "blocked" ||
    nodeEvidence.decision?.resourceExhaustion !== "blocked" ||
    nodeEvidence.decision?.productionPackaging !== "blocked" ||
    nodeEvidence.decision?.productionClaims !== false
  ) {
    throw new Error("in-call cancellation Node evidence overclaims support");
  }

  plainRecord(browserEvidence, "in-call cancellation Browser evidence");
  if (
    browserEvidence.schema !==
      "bim-explorer-browser-in-call-cancellation-evidence/0.1" ||
    browserEvidence.status !== "experimental" ||
    browserEvidence.contract?.requestSchema !==
      "bim-explorer-browser-worker-request/0.4" ||
    browserEvidence.contract?.resultSchema !==
      "bim-explorer-browser-worker-result/0.4" ||
    browserEvidence.contract?.progressSchema !==
      "bim-explorer-browser-worker-progress/0.2" ||
    browserEvidence.contract?.callStartCheckpoint !==
      "model-open-call-starting" ||
    browserEvidence.contract?.cancellationDelayMs !== 25 ||
    browserEvidence.contract?.cancellationGraceMs !== 50 ||
    browserEvidence.contract?.timeoutMs !== 30_000 ||
    browserEvidence.engine?.id !== "web-ifc" ||
    browserEvidence.engine?.version !==
      manifest.candidates["web-ifc"].version ||
    browserEvidence.engine?.backend !== prototype.backend ||
    browserEvidence.engine?.license !==
      manifest.candidates["web-ifc"].license ||
    browserEvidence.fixture?.id !== publicSource.id ||
    browserEvidence.fixture?.manifest !== qualification.fixture ||
    browserEvidence.fixture?.byteLength !== publicSource.byteLength ||
    browserEvidence.fixture?.sha256 !== publicSource.sha256 ||
    browserEvidence.fixture?.schema !== "IFC2X3" ||
    browserEvidence.fixture?.rightsVerified !== true ||
    browserEvidence.fixture?.artifactCommitted !== false ||
    browserEvidence.fixture?.bundlingApproved !== false ||
    browserEvidence.fixture?.profileAdmission !== false
  ) {
    throw new Error(
      "in-call cancellation Browser evidence identity mismatch",
    );
  }
  const observation = plainRecord(
    browserEvidence.cancellationObservation,
    "cancellationObservation",
  );
  const worker = observation.worker;
  if (
    observation.source?.id !== publicSource.id ||
    observation.source?.kind !== "public-fixture" ||
    observation.source?.byteLength !== publicSource.byteLength ||
    observation.source?.sha256 !== publicSource.sha256 ||
    observation.source?.schema !== "IFC2X3" ||
    !sameJson(observation.observedPhases, [
      "engine-initialized",
      "model-open-call-starting",
    ]) ||
    observation.requestedAfterPhase !==
      "model-open-call-starting" ||
    observation.sourceSession?.outcome !== "cancelled" ||
    observation.sourceSession?.workerStarted !== true ||
    observation.sourceSession?.cancelled !== true ||
    observation.sourceSession?.disposed !== false ||
    worker?.outcome !== "cancelled-forced" ||
    worker.cooperativeCancellation !== false ||
    worker.lastPhase !== "model-open-call-starting" ||
    worker.cleanup?.modelClosed !== false ||
    worker.cleanup?.engineDisposed !== false ||
    worker.workerTerminationRequested !== true ||
    typeof worker.cancellationWaitMs !== "number" ||
    !Number.isFinite(worker.cancellationWaitMs) ||
    worker.cancellationWaitMs <
      browserEvidence.contract.cancellationGraceMs ||
    worker.cancellationWaitMs >
      browserEvidence.contract.cancellationGraceMs + 200
  ) {
    throw new Error(
      "forced Browser in-call cancellation receipt is incomplete",
    );
  }
  for (const [label, value] of Object.entries({
    sessionWallClockMs: observation.sourceSession?.wallClockMs,
    workerWallClockMs: worker?.wallClockMs,
  })) {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value <= 0
    ) {
      throw new Error(`Browser in-call ${label} is invalid`);
    }
  }
  const browserRecovery = browserEvidence.recoveryObservation;
  if (
    browserRecovery?.source?.id !==
      "synthetic-in-call-recovery-ifc4" ||
    browserRecovery.source.kind !== "synthetic" ||
    browserRecovery.source.byteLength !== recoverySource.byteLength ||
    browserRecovery.source.sha256 !== recoverySource.sha256 ||
    browserRecovery.source.schema !== recoverySource.schema ||
    browserRecovery.semantics?.projects !== 1 ||
    browserRecovery.semantics?.walls !== 1 ||
    browserRecovery.geometry?.products !== 1 ||
    browserRecovery.geometry?.triangles !== 12 ||
    browserRecovery.resources?.inputBytes !== recoverySource.byteLength ||
    browserRecovery.cleanup?.modelClosed !== true ||
    browserRecovery.cleanup?.engineDisposed !== true ||
    browserRecovery.worker?.outcome !== "completed" ||
    browserRecovery.worker?.lastPhase !== "inspection-complete" ||
    browserRecovery.worker?.cleanup?.modelClosed !== true ||
    browserRecovery.worker?.cleanup?.engineDisposed !== true ||
    browserRecovery.worker?.workerTerminationRequested !== true ||
    browserRecovery.sourceSession?.outcome !== "completed" ||
    browserRecovery.sourceSession?.workerStarted !== true ||
    browserRecovery.sourceSession?.cancelled !== false ||
    browserRecovery.sourceSession?.disposed !== false
  ) {
    throw new Error("Browser post-cancellation recovery is incomplete");
  }
  if (
    !Object.values(browserEvidence.conformance ?? {})
      .every((value) => value === true) ||
    Object.keys(browserEvidence.conformance ?? {}).length !== 9 ||
    browserEvidence.diagnostics?.consoleWarnings !== 0 ||
    browserEvidence.diagnostics?.consoleErrors !== 0 ||
    browserEvidence.decision?.forcedIsolationCancellation !== "passed" ||
    browserEvidence.decision?.cooperativeEngineCancellation !==
      "blocked" ||
    browserEvidence.decision?.explicitCleanupDuringCall !== "blocked" ||
    browserEvidence.decision?.resourceExhaustion !== "blocked" ||
    browserEvidence.decision?.browserPackaging !== "blocked" ||
    browserEvidence.decision?.productionClaims !== false ||
    /(?:\/Users\/|\/Volumes\/|[A-Z]:\\)/u.test(
      JSON.stringify({
        browserEvidence,
        nodeEvidence,
      }),
    )
  ) {
    throw new Error(
      "in-call cancellation evidence is incomplete or overclaims",
    );
  }
  return {
    "web-ifc": "mapped",
    ifcopenshell: "mapped",
  };
}

function validateResourceExhaustion(manifest, evidence) {
  const qualification = plainRecord(
    manifest.resourceExhaustion,
    "resourceExhaustion",
  );
  if (
    qualification.status !== "experimental" ||
    qualification.scope !==
      "process-rss-limit-and-fresh-process-recovery" ||
    qualification.fixture !==
      "fixtures/ifc/public-schependomlaan/manifest.json" ||
    qualification.maxResidentSetBytes !== 256 * 1024 * 1024 ||
    qualification.resourceSampleIntervalMs !== 10 ||
    qualification.processRssLimitQualified !== true ||
    qualification.browserHeapExhaustionQualified !== false ||
    qualification.engineMemorySafetyQualified !== false ||
    qualification.explicitCleanupAfterKillQualified !== false
  ) {
    throw new Error("resource-exhaustion manifest is invalid");
  }
  plainRecord(evidence, "resource-exhaustion evidence");
  const publicSource = {
    byteLength: 46_766_968,
    id: "public-schependomlaan-complete-ifc2x3",
    sha256:
      "5c73cdd02b3add09b30cf437eb3fe01bc4631e5a60dbaf30c0b8a7b817585bb4",
  };
  const recoveryCleanup = {
    "web-ifc": {
      engineDisposed: true,
      modelClosed: true,
    },
    ifcopenshell: {
      engineDisposed: false,
      modelClosed: false,
    },
  };
  const backends = {
    "web-ifc": "node-wasm-process",
    ifcopenshell: "python-native-process",
  };
  if (
    evidence.schema !==
      "bim-explorer-ifc-resource-exhaustion-evidence/0.1" ||
    evidence.status !== "experimental" ||
    evidence.fixture?.id !== publicSource.id ||
    evidence.fixture?.byteLength !== publicSource.byteLength ||
    evidence.fixture?.sha256 !== publicSource.sha256 ||
    evidence.fixture?.schema !== "IFC2X3" ||
    evidence.fixture?.artifactCommitted !== false ||
    evidence.fixture?.bundlingApproved !== false ||
    evidence.fixture?.customerContent !== false ||
    evidence.environment?.sampler !== "ps-rss-kibibytes" ||
    evidence.policy?.callStartCheckpoint !==
      "model-open-call-starting" ||
    evidence.policy?.maxResidentSetBytes !==
      qualification.maxResidentSetBytes ||
    evidence.policy?.resourceSampleIntervalMs !==
      qualification.resourceSampleIntervalMs ||
    evidence.policy?.timeoutMs !== 30_000 ||
    !Array.isArray(evidence.engines) ||
    evidence.engines.length !== CANDIDATES.length
  ) {
    throw new Error("resource-exhaustion evidence identity mismatch");
  }
  for (const engineId of CANDIDATES) {
    const engine = evidence.engines
      .find((candidate) => candidate.engine === engineId);
    if (
      engine?.status !== "passed-process-rss-limit" ||
      !Array.isArray(engine.runs) ||
      engine.runs.length !== 2
    ) {
      throw new Error(`${engineId} RSS-limit evidence is missing`);
    }
    for (let index = 0; index < engine.runs.length; index += 1) {
      const run = engine.runs[index];
      if (
        run.attempt !== index + 1 ||
        run.checkpoint?.schema !==
          "bim-explorer-ifc-in-call-progress/0.1" ||
        run.checkpoint?.phase !== "model-open-call-starting" ||
        run.checkpoint?.engine?.id !== engineId ||
        run.checkpoint?.engine?.version !==
          manifest.candidates[engineId].version ||
        run.checkpoint?.engine?.backend !== backends[engineId] ||
        run.checkpoint?.source?.id !== publicSource.id ||
        run.checkpoint?.source?.byteLength !==
          publicSource.byteLength ||
        run.checkpoint?.source?.sha256 !== publicSource.sha256 ||
        typeof run.checkpoint?.observedAfterStartMs !== "number" ||
        !Number.isFinite(run.checkpoint.observedAfterStartMs) ||
        run.checkpoint.observedAfterStartMs <= 0 ||
        run.receipt?.outcome !== "rss-limit" ||
        run.receipt?.processExited !== true ||
        run.receipt?.signal !== "SIGKILL" ||
        run.receipt?.timedOut !== false ||
        run.receipt?.cancelled !== false ||
        run.receipt?.outputLimitExceeded !== false ||
        run.receipt?.residentSetLimitExceeded !== true ||
        run.receipt?.maxResidentSetBytes !==
          qualification.maxResidentSetBytes ||
        run.receipt?.peakResidentSetBytes <=
          qualification.maxResidentSetBytes ||
        run.receipt?.resourceSampleIntervalMs !==
          qualification.resourceSampleIntervalMs ||
        typeof run.receipt?.wallClockMs !== "number" ||
        !Number.isFinite(run.receipt.wallClockMs) ||
        run.receipt.wallClockMs <=
          run.checkpoint.observedAfterStartMs
      ) {
        throw new Error(
          `${engineId} RSS-limit termination receipt is incomplete`,
        );
      }
    }
    const recovery = engine.recovery;
    if (
      recovery?.source?.id !== "synthetic-small-ifc4" ||
      recovery.source.byteLength !== 2_855 ||
      recovery.source.sha256 !==
        "ad3ed676d52c2c49d2a18e8ca2c03b56f54cf1d4de41aada8db55dbdd473a6a2" ||
      recovery.source.schema !== "IFC4" ||
      recovery.source.view !== "ReferenceView_V1.2" ||
      recovery.semantics?.projects !== 1 ||
      recovery.semantics?.walls !== 1 ||
      recovery.geometry?.products !== 1 ||
      recovery.geometry?.triangles !== 12 ||
      !sameJson(recovery.cleanup, recoveryCleanup[engineId]) ||
      recovery.process?.outcome !== "completed" ||
      recovery.process?.processExited !== true ||
      recovery.process?.exitCode !== 0 ||
      recovery.process?.timedOut !== false ||
      recovery.process?.cancelled !== false
    ) {
      throw new Error(`${engineId} post-RSS recovery is incomplete`);
    }
  }
  if (
    !Object.values(evidence.conformance ?? {})
      .every((value) => value === true) ||
    Object.keys(evidence.conformance ?? {}).length !== 7 ||
    evidence.decision?.boundedProcessRssTermination !== "passed" ||
    evidence.decision?.resourceExhaustion !==
      "partial-process-rss-only" ||
    evidence.decision?.browserHeapExhaustion !== "blocked" ||
    evidence.decision?.engineMemorySafety !== "blocked" ||
    evidence.decision?.explicitCleanupAfterKill !== "blocked" ||
    evidence.decision?.productionPackaging !== "blocked" ||
    evidence.decision?.productionClaims !== false ||
    !Array.isArray(evidence.limits) ||
    evidence.limits.length < 5 ||
    /(?:\/Users\/|\/Volumes\/|[A-Z]:\\)/u.test(
      JSON.stringify(evidence),
    )
  ) {
    throw new Error(
      "resource-exhaustion evidence is incomplete or overclaims",
    );
  }
}

function validatePlatformPackaging(manifest, evidence) {
  const qualification = plainRecord(
    manifest.platformPackaging,
    "platformPackaging",
  );
  if (
    qualification.status !== "experimental" ||
    qualification.scope !==
      "private-web-ifc-node-wasm-clean-install-stage" ||
    qualification.evidence !==
      "compatibility/evidence/web-ifc-platform-package-matrix-2026-08-04.json" ||
    qualification.webIfcMacosStageQualified !== true ||
    qualification.webIfcLinuxStageQualified !== true ||
    qualification.stageArtifactIntegrityQualified !== true ||
    qualification.productionPackageQualified !== false ||
    qualification.ifcOpenShellLinuxQualified !== false ||
    qualification.publicLicenseQualified !== false ||
    qualification.artifactSigningQualified !== false ||
    qualification.sbomQualified !== false ||
    qualification.redistributionReviewQualified !== false
  ) {
    throw new Error("platform-package manifest is invalid");
  }
  plainRecord(evidence, "platform-package evidence");
  if (
    evidence.schema !==
      "bim-explorer-web-ifc-platform-package-matrix/0.1" ||
    evidence.status !== "experimental" ||
    evidence.source?.repository !== "menaje/bim-explorer" ||
    evidence.source?.workflow !== "CI" ||
    evidence.source?.runId !== 30_875_603_346 ||
    evidence.source?.runUrl !==
      "https://github.com/menaje/bim-explorer/actions/runs/30875603346" ||
    evidence.source?.commit !==
      "2775d7ac1c72542417e00424386d3ab9faab8205" ||
    !sameJson(evidence.package, {
      name: "@bim-explorer/web-ifc-platform-stage",
      version: "0.0.0-qualification",
      private: true,
      license: "UNLICENSED",
      dependency: {
        name: "web-ifc",
        version: manifest.candidates["web-ifc"].version,
        license: manifest.candidates["web-ifc"].license,
      },
    }) ||
    !Array.isArray(evidence.platforms) ||
    evidence.platforms.length !== 2
  ) {
    throw new Error("platform-package evidence identity mismatch");
  }

  const expectedStage = {
    fileCount: 10,
    totalBytes: 7_273_290,
    sha256:
      "84710fde2959eb285042522d1d0fd662661cfde9f352e48f835aab0691e45067",
  };
  const expectedArtifact = {
    file:
      "bim-explorer-web-ifc-platform-stage-0.0.0-qualification.tgz",
    byteLength: 989_965,
    sha256:
      "b759bbba3daa21c5b241016a9584ce148f2420f1c12df87a7949816819ef1e47",
  };
  const expectedObservation = {
    engine: {
      id: "web-ifc",
      version: manifest.candidates["web-ifc"].version,
      backend: "node-wasm-process",
      license: manifest.candidates["web-ifc"].license,
    },
    fixture: {
      id: "synthetic-platform-package-ifc4",
      schema: "IFC4",
      view: "ReferenceView_V1.2",
      byteLength: 2_855,
      sha256:
        "ad3ed676d52c2c49d2a18e8ca2c03b56f54cf1d4de41aada8db55dbdd473a6a2",
    },
    semanticCounts: {
      projects: 1,
      walls: 1,
    },
    geometry: {
      products: 1,
      triangles: 12,
    },
    cleanup: {
      modelClosed: true,
      engineDisposed: true,
    },
  };
  const expectedPlatforms = {
    "darwin-arm64": {
      node: "v24.18.0",
      reportFingerprint:
        "8af5f9cc0fcc8ed088c2523f8f0e17b9a281ed7eccff56f4736440f20f1a4aac",
    },
    "linux-x64": {
      node: "v24.18.0",
      reportFingerprint:
        "470db5fc815aae415795f12514d9728d754c53b0e8f463b67b843d87854557ea",
    },
  };
  const portableObservations = [];
  for (const platform of evidence.platforms) {
    const key = `${platform.os}-${platform.architecture}`;
    const expectedPlatform = expectedPlatforms[key];
    const observation = platform.observation;
    const portableObservation = {
      engine: observation?.engine,
      fixture: observation?.fixture,
      semanticCounts: observation?.semanticCounts,
      geometry: observation?.geometry,
      cleanup: observation?.cleanup,
    };
    if (
      expectedPlatform === undefined ||
      platform.node !== expectedPlatform.node ||
      !sameJson(platform.stage, expectedStage) ||
      !sameJson(platform.artifact, expectedArtifact) ||
      !sameJson(portableObservation, expectedObservation) ||
      observation?.reportFingerprint !==
        expectedPlatform.reportFingerprint ||
      observation?.process?.outcome !== "completed" ||
      observation.process.exitCode !== 0 ||
      observation.process.signal !== null ||
      observation.process.processExited !== true ||
      observation.process.timedOut !== false ||
      observation.process.outputLimitExceeded !== false ||
      observation.process.stderrCaptured !== false ||
      !Object.values(platform.conformance ?? {})
        .every((value) => value === true) ||
      Object.keys(platform.conformance ?? {}).length !== 8
    ) {
      throw new Error(`${key} platform-package evidence is incomplete`);
    }
    portableObservations.push(portableObservation);
  }
  if (
    new Set(
      evidence.platforms.map(
        (platform) => `${platform.os}-${platform.architecture}`,
      ),
    ).size !== 2 ||
    !sameJson(portableObservations[0], portableObservations[1])
  ) {
    throw new Error("platform-package portable observations differ");
  }
  const portableDigest = createHash("sha256")
    .update(canonicalJson(portableObservations[0]))
    .digest("hex");
  if (
    !sameJson(evidence.crossPlatform?.requiredPlatforms, [
      "darwin-arm64",
      "linux-x64",
    ]) ||
    evidence.crossPlatform.stageInventoryIdentical !== true ||
    evidence.crossPlatform.archiveByteIdentical !== true ||
    !sameJson(
      evidence.crossPlatform.portableObservationProjection,
      [
        "engine",
        "fixture",
        "semanticCounts",
        "geometry",
        "cleanup",
      ],
    ) ||
    portableDigest !==
      "b2b30f71b94768de52b301e5b39ee3b966d77fbd9deed5ddd6f95802f58e980f" ||
    evidence.crossPlatform.portableObservationSha256 !==
      portableDigest ||
    evidence.crossPlatform.reportFingerprintDifference !==
      "platform-packaging-capability-only"
  ) {
    throw new Error("platform-package cross-platform identity differs");
  }
  if (
    evidence.decision?.webIfcMacosStage !== "passed-experimental" ||
    evidence.decision?.webIfcLinuxStage !== "passed-experimental" ||
    evidence.decision?.stageArtifactIntegrity !== "passed" ||
    evidence.decision?.productionPackage !== "blocked" ||
    evidence.decision?.browserPackage !== "blocked" ||
    evidence.decision?.vscodePackage !== "blocked" ||
    evidence.decision?.ifcOpenShellLinuxPackage !== "blocked" ||
    evidence.decision?.publicLicense !== "blocked" ||
    evidence.decision?.artifactSigning !== "blocked" ||
    evidence.decision?.sbom !== "blocked" ||
    evidence.decision?.redistributionReview !== "blocked" ||
    evidence.decision?.productionClaims !== false ||
    !Array.isArray(evidence.limits) ||
    evidence.limits.length < 5 ||
    /(?:\/Users\/|\/Volumes\/|[A-Z]:\\)/u.test(
      JSON.stringify(evidence),
    )
  ) {
    throw new Error(
      "platform-package evidence is incomplete or overclaims",
    );
  }
  return Object.freeze({
    packagingMacos: "native",
    packagingLinux: "native",
  });
}

export function validateIfcEngineCompatibility(
  manifest,
  evidenceList,
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
  platformPackagingEvidence,
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
    gates.browserCheckpointCancellation !== true ||
    gates.browserBoundedPerformance !== true ||
    gates.publicFixtureProvenance !== true ||
    gates.representativeNodeCpuRss !== true ||
    gates.browserRepresentativeParsing !== true ||
    gates.browserRepresentativeWebGl2FirstFrame !== true ||
    gates.largeModelPerformance !== false ||
    gates.forcedIsolationCancellation !== true ||
    gates.cancellation !== true ||
    gates.corruptInputCleanup !== true ||
    gates.processRssLimitRecovery !== true ||
    gates.resourceExhaustion !== false ||
    gates.browserPackaging !== false ||
    gates.linuxPackaging !== false ||
    gates.crossPlatformWebIfcStage !== true ||
    gates.stageArtifactIntegrity !== true ||
    gates.artifactIntegrity !== false ||
    gates.redistributionReview !== false
  ) {
    throw new Error("IFC engine qualification gates must match evidence");
  }
  const negativeCapability = validateNegativeCorpus(
    manifest,
    negativeNodeEvidence,
    negativeBrowserEvidence,
  );
  const cancellationCapability = validateInCallCancellation(
    manifest,
    inCallNodeEvidence,
    inCallBrowserEvidence,
  );
  validateResourceExhaustion(
    manifest,
    resourceExhaustionEvidence,
  );
  const platformPackagingCapabilities = validatePlatformPackaging(
    manifest,
    platformPackagingEvidence,
  );
  validateBrowserWorkerPrototype(manifest, browserWorkerEvidence);
  validateBrowserFileLifecycle(manifest, browserLifecycleEvidence);
  validateBrowserCheckpointCancellation(
    manifest,
    browserCancellationEvidence,
  );
  validateBrowserBoundedPerformance(
    manifest,
    browserPerformanceEvidence,
  );
  validatePublicNodePerformance(
    manifest,
    publicNodePerformanceEvidence,
  );
  validatePublicBrowserPerformance(
    manifest,
    publicBrowserPerformanceEvidence,
  );

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
      if (capability === "corruptInputCleanup") {
        if (
          matrix[capability][id] !== negativeCapability[id]
        ) {
          throw new Error(
            `${id} negative cleanup differs from the matrix`,
          );
        }
        continue;
      }
      if (capability === "cancellation") {
        if (
          matrix[capability][id] !==
            cancellationCapability[id]
        ) {
          throw new Error(
            `${id} forced isolation cancellation differs from the matrix`,
          );
        }
        continue;
      }
      if (
        id === "web-ifc" &&
        (
          capability === "packagingMacos" ||
          capability === "packagingLinux"
        )
      ) {
        if (
          matrix[capability][id] !==
            platformPackagingCapabilities[capability]
        ) {
          throw new Error(
            `web-ifc ${capability} differs from platform evidence`,
          );
        }
        continue;
      }
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
  const browserCancellationEvidence = JSON.parse(
    await readFile(
      path.join(
        root,
        manifest.prototypes.webIfcBrowserWorker.cancellationEvidence,
      ),
      "utf8",
    ),
  );
  const browserPerformanceEvidence = JSON.parse(
    await readFile(
      path.join(
        root,
        manifest.prototypes.webIfcBrowserWorker.performanceEvidence,
      ),
      "utf8",
    ),
  );
  const publicNodePerformanceEvidence = JSON.parse(
    await readFile(
      path.join(
        root,
        manifest.publicPerformanceFixture.nodeEvidence,
      ),
      "utf8",
    ),
  );
  const publicBrowserPerformanceEvidence = JSON.parse(
    await readFile(
      path.join(
        root,
        manifest.publicPerformanceFixture.browserEvidence,
      ),
      "utf8",
    ),
  );
  const negativeNodeEvidence = JSON.parse(
    await readFile(
      path.join(root, manifest.negativeCorpus.nodeEvidence),
      "utf8",
    ),
  );
  const negativeBrowserEvidence = JSON.parse(
    await readFile(
      path.join(root, manifest.negativeCorpus.browserEvidence),
      "utf8",
    ),
  );
  const inCallNodeEvidence = JSON.parse(
    await readFile(
      path.join(root, manifest.inCallCancellation.nodeEvidence),
      "utf8",
    ),
  );
  const inCallBrowserEvidence = JSON.parse(
    await readFile(
      path.join(
        root,
        manifest.inCallCancellation.browserEvidence,
      ),
      "utf8",
    ),
  );
  const resourceExhaustionEvidence = JSON.parse(
    await readFile(
      path.join(root, manifest.resourceExhaustion.evidence),
      "utf8",
    ),
  );
  const platformPackagingEvidence = JSON.parse(
    await readFile(
      path.join(root, manifest.platformPackaging.evidence),
      "utf8",
    ),
  );
  const report = validateIfcEngineCompatibility(
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
    platformPackagingEvidence,
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
