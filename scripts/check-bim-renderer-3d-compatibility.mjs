import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const TRUE_GATES = [
  "sourceNeutralGeometryDecoder",
  "boundedInitialRangeRead",
  "primitiveRecordConformance",
  "renderPickRevisionIdentity",
  "headlessResourceAccounting",
  "deterministicDispose",
  "publicRepresentativeHeadlessMount",
  "publicRepresentativeBrowserWebGl2Mount",
  "actualGpuFirstFrame",
  "cameraFitViewState",
  "renderIdVisibilityState",
];
const HELD_GATES = [
  "visibilityDrivenFirstFrame",
  "cameraInteraction",
  "pickingSelection",
  "sectionMeasurement",
  "contextLossAndGpuSourceSwitch",
  "browserVscodeConformance",
  "viewerCoreConformance",
];
const CONFORMANCE_ASSERTIONS = [
  "repeatedMountIdentity",
  "boundedInitialRangeRead",
  "geometryPrimitiveConformance",
  "renderPickRevisionIdentity",
  "nonRenderableInstancesExcluded",
  "headlessResourceAccounting",
  "deterministicDispose",
  "pathFreeReport",
];
const BROWSER_CONFORMANCE_ASSERTIONS = [
  "actualBrowser",
  "webgl2Context",
  "boundedRangeReads",
  "geometryAndInstanceUpload",
  "rasterizedPixels",
  "renderPickRevisionIdentity",
  "deterministicDispose",
  "pathFreeReport",
];
const VIEW_CONFORMANCE_ASSERTIONS = [
  "perspectiveFit",
  "orthographicFit",
  "orbitPanZoomState",
  "revisionBoundRenderIdVisibility",
  "hideShowDrawAccounting",
  "gpuAllocationReusedAcrossViews",
  "boundedRangeReadsUnchanged",
  "deterministicDispose",
  "pathFreeReport",
];
const RENDERER_LIMITS = Object.freeze({
  maximumFirstFrameRanges: 1,
  maximumRangeBytes: 4_194_304,
  maximumSourceReadBytes: 4_194_304,
  maximumReadBytes: 1_048_576,
  maximumGeometryRecords: 100_000,
  maximumGeometryPayloadBytes: 8_388_608,
  maximumInstances: 100_000,
  maximumInstancedTriangles: 5_000_000,
  maximumDrawCalls: 100_000,
  maximumCpuStagingBytes: 16_777_216,
});

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

function equalJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function boundedMeasurement(value, maximum, label) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > maximum
  ) {
    throw new Error(`${label} exceeds its evidence budget`);
  }
}

function deterministicProjection(report) {
  return {
    fixture: report.fixture,
    adapter: report.adapter,
    snapshot: report.snapshot,
    renderer: report.renderer,
    cleanup: report.cleanup,
    diagnostics: report.diagnostics,
  };
}

function projectionDigest(report) {
  return createHash("sha256")
    .update(JSON.stringify(deterministicProjection(report)))
    .digest("hex");
}

function validateRun(run, index, evidence, projectionSha256) {
  const budget = evidence.budget;
  if (
    run?.attempt !== index + 1 ||
    run.deterministicProjectionSha256 !== projectionSha256
  ) {
    throw new Error("renderer repeated projection is invalid");
  }
  for (const [field, maximum] of [
    ["artifactMs", budget.maximumArtifactMs],
    ["sourceMs", budget.maximumSourceMs],
    ["mountMs", budget.maximumMountMs],
    ["totalMs", budget.maximumTotalMs],
  ]) {
    boundedMeasurement(
      run.performance?.[field],
      maximum,
      `renderer ${field}`,
    );
  }
  if (
    !Number.isSafeInteger(
      run.processMemoryBytes?.maximumResidentSetSize,
    ) ||
    run.processMemoryBytes.maximumResidentSetSize <= 0 ||
    run.processMemoryBytes.maximumResidentSetSize >
      budget.maximumProcessRssBytes ||
    !Number.isSafeInteger(
      run.processMemoryBytes?.residentSetSizeAfterMount,
    ) ||
    run.processMemoryBytes.residentSetSizeAfterMount <= 0 ||
    !Number.isSafeInteger(
      run.processMemoryBytes?.heapUsedAfterMount,
    ) ||
    run.processMemoryBytes.heapUsedAfterMount <= 0 ||
    run.process?.outcome !== "completed" ||
    run.process?.exitCode !== 0 ||
    run.process?.signal !== null ||
    run.process?.processExited !== true ||
    run.process?.timedOut !== false ||
    run.process?.cancelled !== false ||
    run.process?.outputLimitExceeded !== false ||
    run.process?.stderrBytes !== 0 ||
    run.process?.stderrCaptured !== false
  ) {
    throw new Error("renderer isolated run is invalid");
  }
  boundedMeasurement(
    run.process.wallClockMs,
    budget.timeoutMs,
    "renderer wallClockMs",
  );
}

function validateBrowserEvidence(manifest, evidence) {
  plainRecord(evidence, "Browser WebGL2 renderer evidence");
  const fixture = manifest.fixture;
  if (
    evidence.schema !==
      "bim-explorer-public-browser-webgl2-evidence/0.1" ||
    evidence.asOf !== manifest.asOf ||
    evidence.status !== "experimental-browser-gpu-api" ||
    evidence.fixture?.id !== fixture.id ||
    evidence.fixture?.schema !== fixture.schema ||
    evidence.fixture?.profile !== fixture.profile ||
    evidence.fixture?.byteLength !== fixture.byteLength ||
    evidence.fixture?.sha256 !== fixture.sha256 ||
    evidence.fixture?.artifactCommitted !== false ||
    evidence.fixture?.profileAdmission !== false ||
    evidence.provenance?.repository !==
      "buildingsmart-community/Community-Sample-Test-Files" ||
    evidence.provenance?.commit !==
      "7ddf57a201f88a0c213d5322b02ed15e94a60a40" ||
    evidence.provenance?.license !== "CC-BY-4.0" ||
    evidence.provenance?.rightsVerified !== true ||
    evidence.provenance?.bundlingApproved !== false ||
    evidence.acquisition?.outcome !== "verified" ||
    evidence.acquisition?.entry?.byteLength !== fixture.byteLength ||
    evidence.acquisition?.entry?.sha256 !== fixture.sha256 ||
    evidence.acquisition?.policy?.artifactCommitted !== false ||
    evidence.acquisition?.policy?.bundlingApproved !== false
  ) {
    throw new Error("Browser WebGL2 evidence identity is invalid");
  }
  const budget = evidence.budget;
  if (
    budget?.maximumMountMs !== 2_000 ||
    budget?.maximumFirstFrameMs !== 1_000 ||
    budget?.maximumTotalMs !== 3_000 ||
    budget?.maximumSourceReadBytes !== 4_194_304 ||
    budget?.maximumRangeRequests !== 4 ||
    budget?.maximumUploadedBytes !== 8_388_608 ||
    budget?.frameWidth !== 960 ||
    budget?.frameHeight !== 540 ||
    budget?.minimumNonBackgroundPixels !== 1
  ) {
    throw new Error("Browser WebGL2 evidence budget is invalid");
  }
  const report = plainRecord(
    evidence.representativeReport,
    "Browser WebGL2 representativeReport",
  );
  const renderer = plainRecord(
    report.renderer,
    "Browser WebGL2 renderer",
  );
  const receipt = plainRecord(
    renderer.receipt,
    "Browser WebGL2 receipt",
  );
  const backend = plainRecord(
    receipt.backend,
    "Browser WebGL2 backend receipt",
  );
  if (
    report.schema !== "bim-explorer-browser-webgl2-report/1" ||
    report.status !== "passed" ||
    report.fixture?.id !== fixture.id ||
    report.fixture?.schema !== fixture.schema ||
    report.fixture?.profile !== fixture.profile ||
    report.fixture?.byteLength !== fixture.byteLength ||
    report.fixture?.sha256 !== fixture.sha256 ||
    report.fixture?.artifactCommitted !== false ||
    report.fixture?.profileAdmission !== false ||
    report.source?.fingerprint !== `sha256:${fixture.sha256}` ||
    report.source?.revisionId !==
      `source-snapshot:sha256:${fixture.sha256}` ||
    report.source?.projectedEntities !== 1_809 ||
    !equalJson(report.source?.bounds, {
      min: [-1, -1, -1.7],
      max: [22.95, 23.465, 13.356488],
    }) ||
    !equalJson(
      report.source?.firstFrameRangeIds,
      ["range:ifc:geometry:0"],
    ) ||
    !equalJson(report.source?.deferredRangeIds, [
      "range:ifc:geometry:1",
      "range:ifc:geometry:2",
    ])
  ) {
    throw new Error("Browser WebGL2 report identity is invalid");
  }
  if (
    renderer.backend !== manifest.browserBackend.id ||
    renderer.gpuApi !== true ||
    renderer.physicalGpuClaimed !== false ||
    !equalJson(renderer.limits, RENDERER_LIMITS) ||
    receipt.schema !== manifest.contract.receipt ||
    receipt.status !== "mounted" ||
    receipt.source?.fingerprint !== `sha256:${fixture.sha256}` ||
    receipt.source?.revisionId !==
      `source-snapshot:sha256:${fixture.sha256}` ||
    !equalJson(receipt.rangeIds, ["range:ifc:geometry:0"]) ||
    !equalJson(receipt.deferredRangeIds, [
      "range:ifc:geometry:1",
      "range:ifc:geometry:2",
    ]) ||
    !equalJson(receipt.metrics, manifest.expected.metrics) ||
    receipt.identity?.renderPickBoundToRevision !== true ||
    receipt.identity?.nonRenderableInstances !== 0 ||
    receipt.cpuRangeStagingReleased !== true
  ) {
    throw new Error("Browser WebGL2 renderer receipt is invalid");
  }
  if (
    backend.backendId !== manifest.browserBackend.id ||
    backend.actualGpu !== true ||
    backend.rendered !== true ||
    backend.context !== "webgl2" ||
    !/^WebGL 2\.0/u.test(backend.contextVersion ?? "") ||
    backend.geometryBytes !==
      manifest.expected.metrics.geometryPayloadBytes ||
    backend.instanceBytes !==
      manifest.expected.metrics.instanceBytes ||
    backend.uploadedBytes !==
      manifest.expected.browserUploadedBytes ||
    backend.uploadedBytes > budget.maximumUploadedBytes ||
    backend.drawCalls !== manifest.expected.metrics.drawCalls ||
    backend.gpuBuffers !== 3 ||
    backend.frameWidth !== manifest.expected.browserFrame.width ||
    backend.frameHeight !== manifest.expected.browserFrame.height ||
    !Number.isSafeInteger(backend.nonBackgroundPixels) ||
    backend.nonBackgroundPixels <
      manifest.expected.browserFrame.minimumNonBackgroundPixels ||
    backend.nonBackgroundPixels >
      backend.frameWidth * backend.frameHeight ||
    backend.glError !== 0
  ) {
    throw new Error("Browser WebGL2 first frame is invalid");
  }
  for (const [value, maximum, label] of [
    [backend.uploadMs, budget.maximumFirstFrameMs, "uploadMs"],
    [
      backend.firstFrameMs,
      budget.maximumFirstFrameMs,
      "firstFrameMs",
    ],
    [backend.mountMs, budget.maximumMountMs, "backend mountMs"],
    [
      report.performance?.mountMs,
      budget.maximumMountMs,
      "renderer mountMs",
    ],
    [
      report.performance?.totalMs,
      budget.maximumTotalMs,
      "renderer totalMs",
    ],
  ]) {
    boundedMeasurement(value, maximum, label);
  }
  if (
    renderer.sourceStateAfterMount?.disposed !== false ||
    renderer.sourceStateAfterMount?.rangeReads !==
      manifest.expected.metrics.sourceReads ||
    renderer.sourceStateAfterMount?.rangeBytes !==
      manifest.expected.metrics.sourceReadBytes ||
    renderer.serverRangeState?.rangeRequests !==
      budget.maximumRangeRequests ||
    renderer.serverRangeState?.rangeBytes !==
      manifest.expected.metrics.sourceReadBytes ||
    !equalJson(renderer.serverRangeState?.ranges, {
      "range:ifc:geometry:0": {
        bytes: manifest.expected.metrics.sourceReadBytes,
        requests: manifest.expected.metrics.sourceReads,
      },
    }) ||
    renderer.rendererStateAfterMount?.mounted !== true ||
    renderer.rendererStateAfterMount?.activeBackendBytes !==
      manifest.expected.browserUploadedBytes ||
    renderer.backendStateAfterMount?.contextInitialized !== true ||
    renderer.backendStateAfterMount?.contextLost !== false ||
    renderer.backendStateAfterMount?.activeBytes !==
      manifest.expected.browserUploadedBytes ||
    renderer.releaseReceipt?.released !== true ||
    renderer.releaseReceipt?.releasedBytes !==
      manifest.expected.browserUploadedBytes
  ) {
    throw new Error("Browser WebGL2 lifecycle is invalid");
  }
  if (
    report.cleanup?.rendererDisposed !== true ||
    report.cleanup?.sessionDisposed !== true ||
    report.cleanup?.releasedBytes !==
      manifest.expected.browserUploadedBytes ||
    report.cleanup?.backendState?.disposed !== true ||
    report.cleanup?.backendState?.unmounts !== 1 ||
    report.cleanup?.backendState?.activeHandleId !== null ||
    report.cleanup?.backendState?.activeBytes !== 0 ||
    !/Chrome\/[0-9.]+/u.test(
      report.environment?.userAgent ?? "",
    ) ||
    !Array.isArray(report.diagnostics) ||
    report.diagnostics.length !== 0
  ) {
    throw new Error("Browser WebGL2 cleanup is invalid");
  }
  for (const assertion of BROWSER_CONFORMANCE_ASSERTIONS) {
    if (evidence.conformance?.[assertion] !== true) {
      throw new Error(
        `Browser WebGL2 conformance ${assertion} did not pass`,
      );
    }
  }
  if (
    Object.keys(evidence.conformance ?? {}).length !==
      BROWSER_CONFORMANCE_ASSERTIONS.length + 1 ||
    evidence.conformance?.consoleWarningsOrErrors !== false ||
    evidence.decision?.actualBrowserGpuApiFirstFrame !== "passed" ||
    evidence.decision?.physicalGpuQualification !== "not-claimed" ||
    evidence.decision?.visibilityDrivenFirstFrame !== "blocked" ||
    evidence.decision?.cameraInteractionPicking !== "blocked" ||
    evidence.decision?.sectionMeasurement !== "blocked" ||
    evidence.decision?.contextLossAndGpuSourceSwitch !== "blocked" ||
    evidence.decision?.browserVscodeConformance !== "blocked" ||
    evidence.decision?.viewerCoreConformance !==
      "blocked-unresolved-upstream" ||
    evidence.decision?.productionClaims !== false
  ) {
    throw new Error("Browser WebGL2 decision is invalid");
  }
  return report;
}

function validateBrowserViewEvidence(manifest, evidence) {
  plainRecord(evidence, "Browser view-state evidence");
  const fixture = manifest.fixture;
  if (
    evidence.schema !==
      "bim-explorer-public-browser-view-state-evidence/0.1" ||
    evidence.asOf !== manifest.asOf ||
    evidence.status !== "experimental-browser-view-state" ||
    evidence.fixture?.id !== fixture.id ||
    evidence.fixture?.schema !== fixture.schema ||
    evidence.fixture?.profile !== fixture.profile ||
    evidence.fixture?.byteLength !== fixture.byteLength ||
    evidence.fixture?.sha256 !== fixture.sha256 ||
    evidence.fixture?.artifactCommitted !== false ||
    evidence.fixture?.profileAdmission !== false ||
    evidence.provenance?.repository !==
      "buildingsmart-community/Community-Sample-Test-Files" ||
    evidence.provenance?.commit !==
      "7ddf57a201f88a0c213d5322b02ed15e94a60a40" ||
    evidence.provenance?.license !== "CC-BY-4.0" ||
    evidence.provenance?.rightsVerified !== true ||
    evidence.provenance?.bundlingApproved !== false
  ) {
    throw new Error("Browser view-state evidence identity is invalid");
  }
  const budget = evidence.budget;
  if (
    budget?.maximumMountMs !== 2_000 ||
    budget?.maximumViewSequenceMs !== 2_000 ||
    budget?.maximumTotalMs !== 3_000 ||
    budget?.maximumFrameMs !== 1_000 ||
    budget?.maximumSourceReadBytes !== 4_194_304 ||
    budget?.maximumRangeRequests !== 4 ||
    budget?.maximumUploadedBytes !== 8_388_608 ||
    budget?.frameWidth !== 960 ||
    budget?.frameHeight !== 540 ||
    budget?.minimumNonBackgroundPixels !== 1
  ) {
    throw new Error("Browser view-state evidence budget is invalid");
  }
  const report = plainRecord(
    evidence.representativeReport,
    "Browser view-state representativeReport",
  );
  if (
    report.schema !==
      "bim-explorer-browser-webgl2-view-state-report/1" ||
    report.status !== "passed" ||
    report.source?.fingerprint !== `sha256:${fixture.sha256}` ||
    report.source?.revisionId !==
      `source-snapshot:sha256:${fixture.sha256}` ||
    !equalJson(report.source?.bounds, {
      min: [-1, -1, -1.7],
      max: [22.95, 23.465, 13.356488],
    }) ||
    report.source?.rangeReads !==
      manifest.expected.metrics.sourceReads ||
    report.source?.rangeBytes !==
      manifest.expected.metrics.sourceReadBytes ||
    !equalJson(
      report.source?.firstFrameRangeIds,
      ["range:ifc:geometry:0"],
    ) ||
    !equalJson(report.source?.deferredRangeIds, [
      "range:ifc:geometry:1",
      "range:ifc:geometry:2",
    ])
  ) {
    throw new Error("Browser view-state source is invalid");
  }
  const renderer = plainRecord(
    report.renderer,
    "Browser view-state renderer",
  );
  const expectedView = manifest.expected.browserViewState;
  if (
    renderer.contract !== manifest.contract.renderer ||
    renderer.mountReceipt !== manifest.contract.receipt ||
    renderer.viewReceipt !== manifest.contract.viewReceipt ||
    renderer.cameraSchema !== manifest.contract.camera ||
    renderer.backend !== manifest.browserBackend.id ||
    renderer.gpuApi !== true ||
    renderer.physicalGpuClaimed !== false ||
    renderer.uploadedBytes !==
      manifest.expected.browserUploadedBytes ||
    renderer.uploadedBytes > budget.maximumUploadedBytes ||
    renderer.geometryBytes !==
      manifest.expected.metrics.geometryPayloadBytes ||
    renderer.instanceBytes !==
      manifest.expected.metrics.instanceBytes ||
    renderer.instances !== manifest.expected.metrics.instances ||
    renderer.viewUpdates !== expectedView.viewUpdates ||
    renderer.frames !== expectedView.frames
  ) {
    throw new Error("Browser view-state renderer is invalid");
  }
  const sequence = report.viewSequence;
  if (
    !Array.isArray(sequence) ||
    sequence.length !== expectedView.frames ||
    !equalJson(
      sequence.map((view) => view.step),
      [
        "fit-perspective",
        "orbit-pan-zoom",
        "hide-render-ids",
        "fit-orthographic-show-all",
      ],
    ) ||
    !equalJson(
      sequence.map((view) => view.viewRevision),
      [0, 1, 2, 3],
    ) ||
    !equalJson(
      sequence.map((view) => view.camera?.projection),
      [
        "perspective",
        "perspective",
        "perspective",
        "orthographic",
      ],
    )
  ) {
    throw new Error("Browser view-state sequence is invalid");
  }
  for (const view of sequence) {
    if (
      view.glError !== 0 ||
      !Number.isSafeInteger(view.nonBackgroundPixels) ||
      view.nonBackgroundPixels <
        budget.minimumNonBackgroundPixels ||
      view.nonBackgroundPixels >
        budget.frameWidth * budget.frameHeight ||
      view.drawCalls !== view.visibleInstances ||
      view.hiddenInstances + view.visibleInstances !==
        manifest.expected.metrics.instances
    ) {
      throw new Error("Browser view-state frame is invalid");
    }
    boundedMeasurement(
      view.frameMs,
      budget.maximumFrameMs,
      `Browser ${view.step} frameMs`,
    );
  }
  const initial = sequence[0];
  const moved = sequence[1];
  const hidden = sequence[2];
  const restored = sequence[3];
  if (
    !equalJson(initial.camera.target, [
      10.975,
      11.2325,
      5.828244000000001,
    ]) ||
    equalJson(moved.camera.target, initial.camera.target) ||
    moved.camera.yaw === initial.camera.yaw ||
    moved.camera.pitch === initial.camera.pitch ||
    moved.camera.distance >= initial.camera.distance ||
    hidden.hiddenRenderIds !== expectedView.hiddenRenderIds ||
    hidden.hiddenInstances !== expectedView.hiddenInstances ||
    hidden.visibleInstances !==
      expectedView.visibleInstancesAfterHide ||
    hidden.firstHiddenRenderId !==
      "render:ifc:5c73cdd02b3add09:224" ||
    hidden.lastHiddenRenderId !==
      "render:ifc:5c73cdd02b3add09:11287" ||
    restored.hiddenRenderIds !== 0 ||
    restored.hiddenInstances !== 0 ||
    restored.visibleInstances !== manifest.expected.metrics.instances ||
    !equalJson(restored.camera.target, initial.camera.target)
  ) {
    throw new Error("Browser camera or visibility state is invalid");
  }
  for (const [value, maximum, label] of [
    [
      report.performance?.mountMs,
      budget.maximumMountMs,
      "view-state mountMs",
    ],
    [
      report.performance?.viewSequenceMs,
      budget.maximumViewSequenceMs,
      "view-state sequenceMs",
    ],
    [
      report.performance?.totalMs,
      budget.maximumTotalMs,
      "view-state totalMs",
    ],
  ]) {
    boundedMeasurement(value, maximum, label);
  }
  if (
    report.cleanup?.rendererDisposed !== true ||
    report.cleanup?.sessionDisposed !== true ||
    report.cleanup?.releasedBytes !==
      manifest.expected.browserUploadedBytes ||
    report.cleanup?.backendDisposed !== true ||
    report.cleanup?.activeBytes !== 0 ||
    !/Chrome\/[0-9.]+/u.test(
      report.environment?.userAgent ?? "",
    ) ||
    !Array.isArray(report.diagnostics) ||
    report.diagnostics.length !== 0
  ) {
    throw new Error("Browser view-state cleanup is invalid");
  }
  for (const assertion of VIEW_CONFORMANCE_ASSERTIONS) {
    if (evidence.conformance?.[assertion] !== true) {
      throw new Error(
        `Browser view-state conformance ${assertion} did not pass`,
      );
    }
  }
  if (
    Object.keys(evidence.conformance ?? {}).length !==
      VIEW_CONFORMANCE_ASSERTIONS.length + 1 ||
    evidence.conformance?.consoleWarningsOrErrors !== false ||
    evidence.decision?.cameraFitViewState !== "passed" ||
    evidence.decision?.renderIdVisibilityState !== "passed" ||
    evidence.decision?.pointerInputControls !== "blocked" ||
    evidence.decision?.visibilityDrivenFirstFrame !== "blocked" ||
    evidence.decision?.pickingSelection !== "blocked" ||
    evidence.decision?.contextLossAndGpuSourceSwitch !== "blocked" ||
    evidence.decision?.browserVscodeConformance !== "blocked" ||
    evidence.decision?.viewerCoreConformance !==
      "blocked-unresolved-upstream" ||
    evidence.decision?.productionClaims !== false
  ) {
    throw new Error("Browser view-state decision is invalid");
  }
  return report;
}

export function validateBimRenderer3dCompatibility(
  manifest,
  evidenceBundle,
) {
  plainRecord(manifest, "BIM renderer compatibility manifest");
  plainRecord(evidenceBundle, "BIM renderer evidence bundle");
  const evidence = plainRecord(
    evidenceBundle.headless,
    "headless BIM renderer evidence",
  );
  const browserEvidence = plainRecord(
    evidenceBundle.browserWebGl2,
    "Browser WebGL2 BIM renderer evidence",
  );
  const browserViewEvidence = plainRecord(
    evidenceBundle.browserViewState,
    "Browser view-state BIM renderer evidence",
  );
  if (
    manifest.schema !==
      "bim-explorer-bim-renderer-3d-compatibility/1" ||
    manifest.asOf !== "2026-08-04" ||
    manifest.status !== "experimental" ||
    manifest.contract?.renderer !==
      "bim-explorer-bim-renderer-3d/0.1" ||
    manifest.contract?.receipt !==
      "bim-explorer-bim-renderer-3d-receipt/0.1" ||
    manifest.contract?.viewReceipt !==
      "bim-explorer-bim-renderer-3d-view-receipt/0.1" ||
    manifest.contract?.camera !==
      "bim-explorer-camera-3d/0.1" ||
    manifest.contract?.geometryMediaType !==
      "application/vnd.bim-explorer.geometry-range.v1" ||
    manifest.backend?.id !== "headless" ||
    manifest.backend?.actualGpu !== false ||
    manifest.browserBackend?.id !== "webgl2" ||
    manifest.browserBackend?.actualBrowser !== true ||
    manifest.browserBackend?.gpuApi !== true ||
    manifest.browserBackend?.physicalGpuClaimed !== false
  ) {
    throw new Error("BIM renderer manifest identity is invalid");
  }
  const gates = plainRecord(manifest.gates, "manifest.gates");
  for (const gate of TRUE_GATES) {
    if (gates[gate] !== true) {
      throw new Error(`BIM renderer gate ${gate} must pass`);
    }
  }
  for (const gate of HELD_GATES) {
    if (gates[gate] !== false) {
      throw new Error(`BIM renderer gate ${gate} must remain held`);
    }
  }
  if (
    Object.keys(gates).length !== TRUE_GATES.length + HELD_GATES.length ||
    manifest.evidence?.headless !==
      "compatibility/evidence/" +
        "bim-renderer-3d-public-headless-2026-08-04.json" ||
    manifest.evidence?.browserWebGl2 !==
      "compatibility/evidence/" +
        "bim-renderer-3d-public-browser-webgl2-2026-08-04.json" ||
    manifest.evidence?.browserViewState !==
      "compatibility/evidence/" +
        "bim-renderer-3d-public-browser-view-state-2026-08-04.json" ||
    Object.keys(manifest.evidence ?? {}).length !== 3 ||
    !Array.isArray(manifest.blockers) ||
    manifest.blockers.length !== HELD_GATES.length ||
    !manifest.blockers.every((value) =>
      typeof value === "string" && value.length > 0) ||
    manifest.policy?.sourceNeutral !== true ||
    manifest.policy?.readOnly !== true ||
    manifest.policy?.spatialAuthority !== false ||
    manifest.policy?.claimRenderedFirstFrame !== true ||
    manifest.policy?.claimPhysicalGpuQualification !== false ||
    manifest.policy?.claimViewerCoreCompatibility !== false ||
    manifest.policy?.claimProductionRenderer !== false
  ) {
    throw new Error("BIM renderer policy overclaims compatibility");
  }
  const fixture = manifest.fixture;
  if (
    evidence.schema !==
      "bim-explorer-public-bim-renderer-3d-evidence/0.1" ||
    evidence.asOf !== manifest.asOf ||
    evidence.status !== "experimental-headless-only" ||
    evidence.fixture?.id !== fixture.id ||
    evidence.fixture?.schema !== fixture.schema ||
    evidence.fixture?.profile !== fixture.profile ||
    evidence.fixture?.byteLength !== fixture.byteLength ||
    evidence.fixture?.sha256 !== fixture.sha256 ||
    evidence.fixture?.artifactCommitted !== false ||
    evidence.fixture?.actualGpu !== false ||
    evidence.fixture?.profileAdmission !== false ||
    evidence.provenance?.repository !==
      "buildingsmart-community/Community-Sample-Test-Files" ||
    evidence.provenance?.commit !==
      "7ddf57a201f88a0c213d5322b02ed15e94a60a40" ||
    evidence.provenance?.license !== "CC-BY-4.0" ||
    evidence.provenance?.rightsVerified !== true ||
    evidence.provenance?.bundlingApproved !== false ||
    evidence.acquisition?.outcome !== "verified" ||
    evidence.acquisition?.entry?.byteLength !== fixture.byteLength ||
    evidence.acquisition?.entry?.sha256 !== fixture.sha256 ||
    evidence.acquisition?.policy?.artifactCommitted !== false ||
    evidence.acquisition?.policy?.bundlingApproved !== false
  ) {
    throw new Error("BIM renderer evidence identity is invalid");
  }
  const budget = evidence.budget;
  if (
    budget?.timeoutMs !== 30_000 ||
    budget?.maximumArtifactMs !== 10_000 ||
    budget?.maximumSourceMs !== 5_000 ||
    budget?.maximumMountMs !== 2_000 ||
    budget?.maximumTotalMs !== 15_000 ||
    budget?.maximumProcessRssBytes !== 805_306_368
  ) {
    throw new Error("BIM renderer evidence budget is invalid");
  }
  const report = plainRecord(
    evidence.representativeReport,
    "renderer representativeReport",
  );
  if (
    report.schema !==
      "bim-explorer-web-ifc-headless-renderer-report/1" ||
    report.status !== "passed" ||
    report.fixture?.id !== fixture.id ||
    report.fixture?.byteLength !== fixture.byteLength ||
    report.fixture?.sha256 !== fixture.sha256 ||
    report.fixture?.schema !== fixture.schema ||
    report.fixture?.profile !== fixture.profile ||
    report.adapter?.id !== "web-ifc" ||
    report.adapter?.version !== "0.0.77" ||
    report.adapter?.backend !==
      "node-wasm-isolated-headless-renderer" ||
    report.adapter?.license !== "MPL-2.0"
  ) {
    throw new Error("BIM renderer report identity is invalid");
  }
  const snapshot = report.snapshot;
  if (
    snapshot?.sourceFingerprint !== `sha256:${fixture.sha256}` ||
    snapshot?.revisionId !==
      `source-snapshot:sha256:${fixture.sha256}` ||
    snapshot?.cacheFingerprint !==
      manifest.expected.cacheFingerprint ||
    snapshot?.geometry?.products !== 3_569 ||
    snapshot?.geometry?.renderableProducts !== 3_504 ||
    snapshot?.geometry?.nonRenderableProducts !== 65 ||
    snapshot?.geometry?.triangles !== 261_424 ||
    !equalJson(snapshot?.loadPlan, {
      firstRangeIds: ["range:ifc:geometry:0"],
      deferredRangeIds: [
        "range:ifc:geometry:1",
        "range:ifc:geometry:2",
      ],
    }) ||
    !Array.isArray(snapshot?.ranges) ||
    snapshot.ranges.length !== 3 ||
    snapshot.ranges[0]?.byteLength !== 4_193_868 ||
    snapshot.ranges[0]?.sha256 !==
      manifest.expected.firstRangeSha256 ||
    snapshot.ranges[1]?.byteLength !== 4_194_152 ||
    snapshot.ranges[2]?.byteLength !== 902_676
  ) {
    throw new Error("BIM renderer source snapshot is invalid");
  }
  const renderer = report.renderer;
  const receipt = renderer?.receipt;
  if (
    renderer?.contract !== manifest.contract.receipt ||
    renderer?.backend !== manifest.backend.id ||
    renderer?.actualGpu !== false ||
    !equalJson(renderer?.limits, RENDERER_LIMITS) ||
    receipt?.schema !== manifest.contract.receipt ||
    receipt?.status !== "mounted" ||
    receipt?.source?.fingerprint !== `sha256:${fixture.sha256}` ||
    receipt?.source?.revisionId !==
      `source-snapshot:sha256:${fixture.sha256}` ||
    !equalJson(receipt?.rangeIds, ["range:ifc:geometry:0"]) ||
    !equalJson(receipt?.deferredRangeIds, [
      "range:ifc:geometry:1",
      "range:ifc:geometry:2",
    ]) ||
    !equalJson(receipt?.metrics, manifest.expected.metrics) ||
    receipt?.identity?.renderPickBoundToRevision !== true ||
    receipt?.identity?.nonRenderableInstances !== 0 ||
    receipt?.backend?.backendId !== "headless" ||
    receipt?.backend?.rendered !== false ||
    receipt?.backend?.geometryBytes !==
      manifest.expected.metrics.geometryPayloadBytes ||
    receipt?.backend?.instanceBytes !==
      manifest.expected.metrics.instanceBytes ||
    receipt?.backend?.uploadedBytes !==
      manifest.expected.headlessUploadedBytes ||
    receipt?.backend?.drawCalls !==
      manifest.expected.metrics.drawCalls ||
    receipt?.cpuRangeStagingReleased !== true
  ) {
    throw new Error("BIM renderer mount receipt is invalid");
  }
  const sourceState = renderer.sourceStateAfterMount;
  if (
    sourceState?.opened !== true ||
    sourceState?.sessionDisposed !== false ||
    sourceState?.disposed !== false ||
    sourceState?.rangeReads !== 4 ||
    sourceState?.rangeBytesRead !==
      manifest.expected.metrics.sourceReadBytes ||
    sourceState?.remainingReadBytes !==
      manifest.expected.deferredBytes ||
    sourceState?.entityReads !== 0 ||
    sourceState?.pickResolutions !== 0 ||
    renderer.rendererStateAfterMount?.mounted !== true ||
    renderer.rendererStateAfterMount?.mounts !== 1 ||
    renderer.rendererStateAfterMount?.unmounts !== 0 ||
    renderer.rendererStateAfterMount?.activeBackendBytes !==
      manifest.expected.headlessUploadedBytes ||
    renderer.backendStateAfterMount?.activeBytes !==
      manifest.expected.headlessUploadedBytes ||
    renderer.unmountReceipt?.released !== true ||
    renderer.unmountReceipt?.releasedBytes !==
      manifest.expected.headlessUploadedBytes
  ) {
    throw new Error("BIM renderer lifecycle receipt is invalid");
  }
  if (
    report.cleanup?.adapterModelClosed !== true ||
    report.cleanup?.adapterEngineDisposed !== true ||
    report.cleanup?.rendererDisposed !== true ||
    report.cleanup?.sessionDisposed !== true ||
    report.cleanup?.sourceDisposed !== true ||
    report.cleanup?.backendDisposed !== true ||
    report.cleanup?.backendActiveBytes !== 0 ||
    !Array.isArray(report.diagnostics) ||
    report.diagnostics.length !== 0
  ) {
    throw new Error("BIM renderer cleanup receipt is invalid");
  }
  for (const assertion of CONFORMANCE_ASSERTIONS) {
    if (evidence.conformance?.[assertion] !== true) {
      throw new Error(
        `BIM renderer conformance ${assertion} did not pass`,
      );
    }
  }
  if (
    Object.keys(evidence.conformance ?? {}).length !==
      CONFORMANCE_ASSERTIONS.length ||
    evidence.decision?.publicRepresentativeHeadlessMount !==
      "passed" ||
    evidence.decision?.visibilityDrivenFirstFrame !== "blocked" ||
    evidence.decision?.actualGpuFirstFrame !== "blocked" ||
    evidence.decision?.cameraInteractionPicking !== "blocked" ||
    evidence.decision?.sectionMeasurement !== "blocked" ||
    evidence.decision?.browserVscodeConformance !== "blocked" ||
    evidence.decision?.viewerCoreConformance !==
      "blocked-unresolved-upstream" ||
    evidence.decision?.productionClaims !== false
  ) {
    throw new Error("BIM renderer decision is invalid");
  }
  for (const [field, maximum] of [
    ["artifactMs", budget.maximumArtifactMs],
    ["sourceMs", budget.maximumSourceMs],
    ["mountMs", budget.maximumMountMs],
    ["totalMs", budget.maximumTotalMs],
  ]) {
    boundedMeasurement(
      report.performance?.[field],
      maximum,
      `representative renderer ${field}`,
    );
  }
  const projectionSha256 = projectionDigest(report);
  if (
    !Array.isArray(evidence.runs) ||
    evidence.runs.length !== 2 ||
    !equalJson(evidence.runs[0].performance, report.performance) ||
    !equalJson(
      evidence.runs[0].processMemoryBytes,
      report.processMemoryBytes,
    )
  ) {
    throw new Error("BIM renderer repeated runs are invalid");
  }
  evidence.runs.forEach((run, index) =>
    validateRun(run, index, evidence, projectionSha256));
  const browserReport = validateBrowserEvidence(
    manifest,
    browserEvidence,
  );
  const browserViewReport = validateBrowserViewEvidence(
    manifest,
    browserViewEvidence,
  );
  const serialized = JSON.stringify({
    manifest,
    evidenceBundle,
  });
  if (/\/Volumes\/|\/Users\/|[A-Z]:\\/u.test(serialized)) {
    throw new Error("BIM renderer compatibility data exposes a path");
  }
  return Object.freeze({
    status: manifest.status,
    sourceFingerprint: snapshot.sourceFingerprint,
    instances: receipt.metrics.instances,
    instancedTriangles: receipt.metrics.instancedTriangles,
    uploadedBytes: receipt.backend.uploadedBytes,
    browserPixels:
      browserReport.renderer.receipt.backend.nonBackgroundPixels,
    browserViewFrames:
      browserViewReport.renderer.frames,
    passedGates: TRUE_GATES.length,
    heldGates: HELD_GATES.length,
  });
}

async function main() {
  const root = process.cwd();
  const manifest = JSON.parse(await readFile(
    path.join(root, "compatibility", "bim-renderer-3d.json"),
    "utf8",
  ));
  const evidence = {
    headless: JSON.parse(await readFile(
      path.join(root, manifest.evidence.headless),
      "utf8",
    )),
    browserWebGl2: JSON.parse(await readFile(
      path.join(root, manifest.evidence.browserWebGl2),
      "utf8",
    )),
    browserViewState: JSON.parse(await readFile(
      path.join(root, manifest.evidence.browserViewState),
      "utf8",
    )),
  };
  const result = validateBimRenderer3dCompatibility(
    manifest,
    evidence,
  );
  console.log(
    "BIM renderer 3D compatibility check passed: " +
      `${result.status}, ${result.instances} headless instances, ` +
      `${result.instancedTriangles} instanced triangles, ` +
      `${result.browserPixels} Browser pixels, ` +
      `${result.browserViewFrames} view frames, ` +
      `${result.passedGates} passed and ${result.heldGates} held gates`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  await main();
}
