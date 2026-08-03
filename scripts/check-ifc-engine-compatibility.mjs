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
    prototype.lifecycleEvidence.length === 0 ||
    typeof prototype.cancellationEvidence !== "string" ||
    prototype.cancellationEvidence.length === 0 ||
    typeof prototype.performanceEvidence !== "string" ||
    prototype.performanceEvidence.length === 0
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

export function validateIfcEngineCompatibility(
  manifest,
  evidenceList,
  browserWorkerEvidence,
  browserLifecycleEvidence,
  browserCancellationEvidence,
  browserPerformanceEvidence,
  publicNodePerformanceEvidence,
  publicBrowserPerformanceEvidence,
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
    gates.largeModelPerformance !== false ||
    gates.cancellation !== false ||
    gates.corruptInputCleanup !== false ||
    gates.browserPackaging !== false
  ) {
    throw new Error("Browser Worker prototype Gate must match its evidence");
  }
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
  const report = validateIfcEngineCompatibility(
    manifest,
    evidence,
    browserWorkerEvidence,
    browserLifecycleEvidence,
    browserCancellationEvidence,
    browserPerformanceEvidence,
    publicNodePerformanceEvidence,
    publicBrowserPerformanceEvidence,
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
