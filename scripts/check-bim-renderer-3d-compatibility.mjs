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
  "pickingSelection",
  "contextLossAndGpuSourceSwitch",
  "sectionMeasurement",
  "largeCoordinatePrecision",
  "progressiveRangeCache",
  "affectedBoundsAtomicDelta",
  "cameraInteraction",
  "visibilityDrivenFirstFrame",
];
const HELD_GATES = [
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
const PICK_CONFORMANCE_ASSERTIONS = [
  "actualBrowser",
  "webgl2OffscreenPickPass",
  "topLeftCanvasCoordinates",
  "revisionBoundPickIdentity",
  "pickIdSelection",
  "selectionHighlightPixels",
  "transientPickTargetReleased",
  "gpuAllocationReusedAcrossSelection",
  "boundedRangeReadsUnchanged",
  "deterministicDispose",
  "pathFreeReport",
];
const LIFECYCLE_CONFORMANCE_ASSERTIONS = [
  "actualBrowser",
  "webglContextLossObserved",
  "webglContextRestoreObserved",
  "invalidatedMountFailsClosed",
  "sameRevisionRemount",
  "differentRevisionSourceSwitch",
  "priorGpuAllocationReleased",
  "boundedRangeReread",
  "cancellationFailsClosed",
  "allSessionsDisposed",
  "deterministicBackendDispose",
  "pathFreeReport",
];
const SECTION_CONFORMANCE_ASSERTIONS = [
  "actualBrowser",
  "depthBackedWorldPosition",
  "revisionBoundMeasurementPoints",
  "distanceMeasurement",
  "angleMeasurement",
  "areaMeasurement",
  "singleClippingPlane",
  "sixPlaneSectionBox",
  "pickRespectsClipping",
  "sectionRestore",
  "gpuAllocationReused",
  "transientPickTargetsReleased",
  "deterministicDispose",
  "pathFreeReport",
];
const PRECISION_CONFORMANCE_ASSERTIONS = [
  "actualBrowser",
  "largeIfcWorldCoordinates",
  "doublePrecisionComposition",
  "cameraRelativeGpuUpload",
  "boundedRelativeCoordinates",
  "rasterizedPixels",
  "revisionBoundWorldPick",
  "transientPickTargetReleased",
  "deterministicDispose",
  "pathFreeReport",
];
const PROGRESSIVE_CONFORMANCE_ASSERTIONS = [
  "actualBrowser",
  "boundedInitialRange",
  "incrementalGpuUpload",
  "boundedCpuStagingReleased",
  "revisionBoundRanges",
  "residentCacheHitAvoidsRead",
  "residentCacheHitAvoidsUpload",
  "aggregateGpuCacheBound",
  "rangeEvictionReleasesGpuBytes",
  "remainingRangesRedraw",
  "isolateHideShowAll",
  "deterministicDispose",
  "pathFreeReport",
];
const DELTA_CONFORMANCE_ASSERTIONS = [
  "actualBrowser",
  "activeRevisionValidated",
  "orderedSequenceValidated",
  "operationBoundsContained",
  "affectedBoundsProjectedToScissor",
  "partialFramebufferRedraw",
  "atomicCommitAfterGpuFrame",
  "staleReplayRejected",
  "unsupportedMutationRequiresRemount",
  "unsupportedMutationHasNoBackendCall",
  "gpuAllocationReused",
  "pathFreeReport",
];
const CAMERA_INPUT_CONFORMANCE_ASSERTIONS = [
  "actualBrowser",
  "domPointerEventPath",
  "domWheelEventPath",
  "immutableCameraUpdates",
  "serializedGpuFrames",
  "orbitApplied",
  "zoomApplied",
  "gpuAllocationReused",
  "controlsDetached",
  "deterministicDispose",
  "pathFreeReport",
];
const VISIBILITY_FIRST_FRAME_CONFORMANCE_ASSERTIONS = [
  "actualBrowser",
  "cameraTargetBoundedObject",
  "cameraDrivenRangeSelection",
  "sourcePlanRangeReordered",
  "boundedSingleRangeRead",
  "requestedCameraRendered",
  "rasterizedPixels",
  "revisionBoundRange",
  "boundedCpuStagingReleased",
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
  maximumGpuCacheBytes: 16_777_216,
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

function validateBrowserPickEvidence(manifest, evidence) {
  plainRecord(evidence, "Browser picking evidence");
  const fixture = manifest.fixture;
  if (
    evidence.schema !==
      "bim-explorer-public-browser-picking-selection-evidence/0.1" ||
    evidence.asOf !== manifest.asOf ||
    evidence.status !==
      "experimental-browser-picking-selection" ||
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
    throw new Error("Browser picking evidence identity is invalid");
  }
  const budget = evidence.budget;
  if (
    budget?.maximumPickMs !== 1_000 ||
    budget?.maximumSelectionFrameMs !== 1_000 ||
    budget?.maximumTotalMs !== 3_000 ||
    budget?.maximumSourceReadBytes !== 4_194_304 ||
    budget?.maximumUploadedBytes !== 8_388_608 ||
    budget?.maximumTemporaryTargetBytes !== 4_194_304 ||
    budget?.frameWidth !== 960 ||
    budget?.frameHeight !== 540 ||
    budget?.minimumHighlightPixels !== 1
  ) {
    throw new Error("Browser picking evidence budget is invalid");
  }
  const report = plainRecord(
    evidence.representativeReport,
    "Browser picking representativeReport",
  );
  const expected = manifest.expected.browserPickingSelection;
  if (
    report.schema !==
      "bim-explorer-browser-webgl2-picking-selection-report/1" ||
    report.status !== "passed" ||
    report.source?.fingerprint !== `sha256:${fixture.sha256}` ||
    report.source?.revisionId !==
      `source-snapshot:sha256:${fixture.sha256}` ||
    report.source?.rangeReads !==
      manifest.expected.metrics.sourceReads ||
    report.source?.rangeBytes !==
      manifest.expected.metrics.sourceReadBytes ||
    report.source.rangeBytes > budget.maximumSourceReadBytes
  ) {
    throw new Error("Browser picking source is invalid");
  }
  const renderer = plainRecord(
    report.renderer,
    "Browser picking renderer",
  );
  if (
    renderer.contract !== manifest.contract.renderer ||
    renderer.mountReceipt !== manifest.contract.receipt ||
    renderer.viewReceipt !== manifest.contract.viewReceipt ||
    renderer.pickReceipt !== manifest.contract.pickReceipt ||
    renderer.backend !== manifest.browserBackend.id ||
    renderer.gpuApi !== true ||
    renderer.physicalGpuClaimed !== false ||
    renderer.uploadedBytes !==
      manifest.expected.browserUploadedBytes ||
    renderer.uploadedBytes > budget.maximumUploadedBytes ||
    renderer.instances !== manifest.expected.metrics.instances ||
    renderer.picks !== 1 ||
    renderer.viewUpdates !== 4 ||
    renderer.frames !== 5
  ) {
    throw new Error("Browser picking renderer is invalid");
  }
  const pick = plainRecord(report.pick, "Browser pick receipt");
  if (
    pick.status !== "hit" ||
    pick.viewRevision !== 3 ||
    !equalJson(pick.coordinates, {
      x: expected.x,
      y: expected.y,
      origin: "canvas-top-left",
    }) ||
    pick.identity?.expressId !== expected.expressId ||
    pick.identity?.renderId !== expected.renderId ||
    pick.identity?.pickId !== expected.pickId ||
    typeof pick.identity?.globalId !== "string" ||
    pick.identity.globalId.length === 0 ||
    typeof pick.identity?.externalIdentityToken !== "string" ||
    !pick.identity.externalIdentityToken.endsWith(
      `:${pick.identity.globalId}`,
    ) ||
    pick.drawCalls !== manifest.expected.metrics.instances ||
    pick.temporaryTargetBytes !== expected.temporaryTargetBytes ||
    pick.temporaryTargetBytes >
      budget.maximumTemporaryTargetBytes ||
    pick.temporaryReleased !== true ||
    pick.glError !== 0
  ) {
    throw new Error("Browser pick receipt is invalid");
  }
  boundedMeasurement(
    pick.frameMs,
    budget.maximumPickMs,
    "Browser pick frameMs",
  );
  const selection = plainRecord(
    report.selection,
    "Browser selection receipt",
  );
  if (
    selection.viewRevision !== 4 ||
    selection.selectedPickId !== expected.pickId ||
    selection.selectedInstances !== expected.selectedInstances ||
    selection.highlightedInstances !==
      expected.highlightedInstances ||
    selection.drawCalls !== manifest.expected.metrics.instances ||
    !Number.isSafeInteger(selection.nonBackgroundPixels) ||
    selection.nonBackgroundPixels <= 0 ||
    selection.nonBackgroundPixels >
      budget.frameWidth * budget.frameHeight ||
    !Number.isSafeInteger(selection.highlightPixels) ||
    selection.highlightPixels <
      expected.minimumHighlightPixels ||
    selection.glError !== 0
  ) {
    throw new Error("Browser selection receipt is invalid");
  }
  boundedMeasurement(
    selection.frameMs,
    budget.maximumSelectionFrameMs,
    "Browser selection frameMs",
  );
  if (
    report.lifecycle?.activeBytesAfterSelection !==
      manifest.expected.browserUploadedBytes ||
    report.lifecycle?.releasedBytes !==
      manifest.expected.browserUploadedBytes ||
    report.lifecycle?.rendererDisposed !== true ||
    report.lifecycle?.sessionDisposed !== true ||
    report.lifecycle?.backendDisposed !== true ||
    report.lifecycle?.activeBytesAfterDispose !== 0 ||
    !/Chrome\/[0-9.]+/u.test(
      report.environment?.userAgent ?? "",
    ) ||
    !Array.isArray(report.diagnostics) ||
    report.diagnostics.length !== 0
  ) {
    throw new Error("Browser picking lifecycle is invalid");
  }
  boundedMeasurement(
    report.performance?.totalMs,
    budget.maximumTotalMs,
    "Browser picking totalMs",
  );
  for (const assertion of PICK_CONFORMANCE_ASSERTIONS) {
    if (evidence.conformance?.[assertion] !== true) {
      throw new Error(
        `Browser picking conformance ${assertion} did not pass`,
      );
    }
  }
  if (
    Object.keys(evidence.conformance ?? {}).length !==
      PICK_CONFORMANCE_ASSERTIONS.length + 1 ||
    evidence.conformance?.consoleWarningsOrErrors !== false ||
    evidence.decision?.pickingSelection !== "passed" ||
    evidence.decision?.pointerInputControls !== "blocked" ||
    evidence.decision?.sectionMeasurement !== "blocked" ||
    evidence.decision?.contextLossAndGpuSourceSwitch !== "blocked" ||
    evidence.decision?.browserVscodeConformance !== "blocked" ||
    evidence.decision?.viewerCoreConformance !==
      "blocked-unresolved-upstream" ||
    evidence.decision?.productionClaims !== false
  ) {
    throw new Error("Browser picking decision is invalid");
  }
  return report;
}

function validateBrowserLifecycleEvidence(manifest, evidence) {
  plainRecord(evidence, "Browser renderer lifecycle evidence");
  const fixture = manifest.fixture;
  const expected = manifest.expected.browserLifecycle;
  if (
    evidence.schema !==
      "bim-explorer-public-browser-renderer-lifecycle-evidence/0.1" ||
    evidence.asOf !== manifest.asOf ||
    evidence.status !==
      "experimental-browser-renderer-lifecycle" ||
    evidence.publicFixture?.id !== fixture.id ||
    evidence.publicFixture?.schema !== fixture.schema ||
    evidence.publicFixture?.profile !== fixture.profile ||
    evidence.publicFixture?.byteLength !== fixture.byteLength ||
    evidence.publicFixture?.sha256 !== fixture.sha256 ||
    evidence.publicFixture?.artifactCommitted !== false ||
    evidence.publicFixture?.profileAdmission !== false ||
    evidence.switchFixture?.id !== "synthetic-ifc4-mapped" ||
    evidence.switchFixture?.schema !== "IFC4" ||
    evidence.switchFixture?.profile !==
      "synthetic-source-switch" ||
    evidence.switchFixture?.byteLength !== 4_028 ||
    evidence.switchFixture?.sha256 !==
      expected.switchFingerprint.slice(7) ||
    evidence.switchFixture?.artifactCommitted !== true ||
    evidence.switchFixture?.profileAdmission !== false
  ) {
    throw new Error(
      "Browser renderer lifecycle identity is invalid",
    );
  }
  const budget = evidence.budget;
  if (
    budget?.maximumContextCycleMs !== 1_000 ||
    budget?.maximumRecoveryFrameMs !== 1_000 ||
    budget?.maximumSourceSwitchFrameMs !== 1_000 ||
    budget?.maximumTotalMs !== 3_000 ||
    budget?.maximumPublicRangeBytesPerMount !== 4_194_304 ||
    budget?.maximumPublicUploadedBytes !== 8_388_608 ||
    budget?.maximumSwitchRangeBytes !== 1_024 ||
    budget?.maximumSwitchUploadedBytes !== 2_048
  ) {
    throw new Error(
      "Browser renderer lifecycle budget is invalid",
    );
  }
  const report = plainRecord(
    evidence.representativeReport,
    "Browser renderer lifecycle report",
  );
  if (
    report.schema !==
      "bim-explorer-browser-webgl2-renderer-lifecycle-report/1" ||
    report.status !== "passed" ||
    report.publicSource?.fingerprint !==
      `sha256:${fixture.sha256}` ||
    report.publicSource?.revisionId !==
      `source-snapshot:sha256:${fixture.sha256}` ||
    report.publicSource?.rangeReadsAfterRecovery !==
      manifest.expected.metrics.sourceReads *
        expected.publicMounts ||
    report.publicSource?.rangeBytesAfterRecovery !==
      expected.publicRangeBytesPerMount *
        expected.publicMounts ||
    report.publicSource?.uploadedBytesPerMount !==
      expected.publicUploadedBytesPerMount
  ) {
    throw new Error(
      "Browser renderer lifecycle public source is invalid",
    );
  }
  const context = plainRecord(
    report.contextLoss,
    "Browser context-loss receipt",
  );
  if (
    context.contextLostObserved !== true ||
    context.contextRestoredObserved !== true ||
    context.priorGeneration !== 1 ||
    context.restoredGeneration !==
      expected.contextGenerations ||
    context.invalidatedBytes !==
      expected.publicUploadedBytesPerMount ||
    context.recoveryRequired !== true ||
    context.invalidatedRenderRejected !== true ||
    !Array.isArray(context.clearedErrors) ||
    context.glError !== 0
  ) {
    throw new Error("Browser context-loss receipt is invalid");
  }
  boundedMeasurement(
    context.elapsedMs,
    budget.maximumContextCycleMs,
    "Browser context cycle",
  );
  const recovery = plainRecord(
    report.recovery,
    "Browser context recovery receipt",
  );
  if (
    recovery.mount !== 2 ||
    recovery.unmount !== 1 ||
    recovery.sourceRevisionPreserved !== true ||
    recovery.sourceReadBytes !==
      expected.publicRangeBytesPerMount ||
    recovery.sourceReads !==
      manifest.expected.metrics.sourceReads ||
    recovery.uploadedBytes !==
      expected.publicUploadedBytesPerMount ||
    recovery.uploadedBytes > budget.maximumPublicUploadedBytes ||
    recovery.releasedInvalidatedBytes !==
      expected.publicUploadedBytesPerMount ||
    recovery.drawCalls !== manifest.expected.metrics.instances ||
    !Number.isSafeInteger(recovery.nonBackgroundPixels) ||
    recovery.nonBackgroundPixels <= 0 ||
    recovery.activeBytes !==
      expected.publicUploadedBytesPerMount ||
    recovery.contextInvalidated !== false ||
    recovery.glError !== 0
  ) {
    throw new Error(
      "Browser context recovery receipt is invalid",
    );
  }
  boundedMeasurement(
    recovery.firstFrameMs,
    budget.maximumRecoveryFrameMs,
    "Browser recovery frame",
  );
  const sourceSwitch = plainRecord(
    report.sourceSwitch,
    "Browser source-switch receipt",
  );
  if (
    sourceSwitch.fingerprint !== expected.switchFingerprint ||
    sourceSwitch.revisionId !==
      `source-snapshot:${expected.switchFingerprint}` ||
    sourceSwitch.mount !== expected.totalMounts ||
    sourceSwitch.unmount !== 2 ||
    sourceSwitch.sourceReadBytes !==
      expected.switchRangeBytes ||
    sourceSwitch.sourceReadBytes >
      budget.maximumSwitchRangeBytes ||
    sourceSwitch.sourceReads !== 8 ||
    sourceSwitch.geometryRecords !== 1 ||
    sourceSwitch.instances !== 2 ||
    sourceSwitch.drawCalls !== 2 ||
    sourceSwitch.uploadedBytes !== expected.switchUploadedBytes ||
    sourceSwitch.uploadedBytes >
      budget.maximumSwitchUploadedBytes ||
    sourceSwitch.releasedBeforeSwitchBytes !==
      expected.publicUploadedBytesPerMount *
        expected.publicMounts ||
    !Number.isSafeInteger(sourceSwitch.nonBackgroundPixels) ||
    sourceSwitch.nonBackgroundPixels <= 0 ||
    sourceSwitch.activeBytes !== expected.switchUploadedBytes ||
    sourceSwitch.glError !== 0
  ) {
    throw new Error("Browser source-switch receipt is invalid");
  }
  boundedMeasurement(
    sourceSwitch.firstFrameMs,
    budget.maximumSourceSwitchFrameMs,
    "Browser source-switch frame",
  );
  if (
    report.cancellation?.preAbortedMount !==
      "passed-local-contract-test" ||
    report.cancellation?.preAbortedPick !==
      "passed-local-contract-test" ||
    report.cancellation?.contextCycleAtomicAfterStart !== true ||
    report.cleanup?.mounts !== expected.totalMounts ||
    report.cleanup?.unmounts !== expected.totalUnmounts ||
    report.cleanup?.contextLosses !== 1 ||
    report.cleanup?.releasedBytes !==
      expected.totalReleasedBytes ||
    report.cleanup?.activeBytes !== 0 ||
    report.cleanup?.rendererDisposed !== true ||
    report.cleanup?.publicSessionDisposed !== true ||
    report.cleanup?.switchSessionDisposed !== true ||
    report.cleanup?.backendDisposed !== true ||
    !/Chrome\/[0-9.]+/u.test(
      report.environment?.userAgent ?? "",
    ) ||
    !Array.isArray(report.diagnostics) ||
    report.diagnostics.length !== 0
  ) {
    throw new Error(
      "Browser renderer lifecycle cleanup is invalid",
    );
  }
  boundedMeasurement(
    report.performance?.totalMs,
    budget.maximumTotalMs,
    "Browser renderer lifecycle totalMs",
  );
  for (const assertion of LIFECYCLE_CONFORMANCE_ASSERTIONS) {
    if (evidence.conformance?.[assertion] !== true) {
      throw new Error(
        `Browser lifecycle conformance ${assertion} did not pass`,
      );
    }
  }
  if (
    Object.keys(evidence.conformance ?? {}).length !==
      LIFECYCLE_CONFORMANCE_ASSERTIONS.length + 1 ||
    evidence.conformance?.consoleWarningsOrErrors !== false ||
    evidence.decision?.contextLossAndGpuSourceSwitch !==
      "passed" ||
    evidence.decision?.workerLifecycle !==
      "not-applicable-precomputed-source" ||
    evidence.decision?.physicalGpuQualification !==
      "not-claimed" ||
    evidence.decision?.sectionMeasurement !== "blocked" ||
    evidence.decision?.browserVscodeConformance !== "blocked" ||
    evidence.decision?.viewerCoreConformance !==
      "blocked-unresolved-upstream" ||
    evidence.decision?.productionClaims !== false
  ) {
    throw new Error("Browser renderer lifecycle decision is invalid");
  }
  return report;
}

function validateBrowserSectionEvidence(manifest, evidence) {
  plainRecord(evidence, "Browser section evidence");
  const fixture = manifest.fixture;
  const expected = manifest.expected.browserSectionMeasurement;
  if (
    evidence.schema !==
      "bim-explorer-public-browser-section-measurement-evidence/0.1" ||
    evidence.asOf !== manifest.asOf ||
    evidence.status !==
      "experimental-browser-section-measurement" ||
    evidence.fixture?.id !== fixture.id ||
    evidence.fixture?.schema !== fixture.schema ||
    evidence.fixture?.profile !== fixture.profile ||
    evidence.fixture?.byteLength !== fixture.byteLength ||
    evidence.fixture?.sha256 !== fixture.sha256 ||
    evidence.fixture?.artifactCommitted !== false ||
    evidence.fixture?.profileAdmission !== false
  ) {
    throw new Error("Browser section evidence identity is invalid");
  }
  const budget = evidence.budget;
  if (
    budget?.maximumPickMs !== 1_000 ||
    budget?.maximumSectionFrameMs !== 1_000 ||
    budget?.maximumTotalMs !== 3_000 ||
    budget?.maximumUploadedBytes !== 8_388_608 ||
    budget?.maximumTemporaryTargetBytes !== 4_194_304 ||
    budget?.frameWidth !== 960 ||
    budget?.frameHeight !== 540
  ) {
    throw new Error("Browser section evidence budget is invalid");
  }
  const report = plainRecord(
    evidence.representativeReport,
    "Browser section representativeReport",
  );
  if (
    report.schema !==
      "bim-explorer-browser-webgl2-section-measurement-report/1" ||
    report.status !== "passed" ||
    report.source?.fingerprint !== `sha256:${fixture.sha256}` ||
    report.source?.revisionId !==
      `source-snapshot:sha256:${fixture.sha256}` ||
    report.source?.coordinateSpace !== "source-world" ||
    report.source?.unit !== "source-coordinate-unit"
  ) {
    throw new Error("Browser section source is invalid");
  }
  const renderer = plainRecord(
    report.renderer,
    "Browser section renderer",
  );
  if (
    renderer.contract !== manifest.contract.renderer ||
    renderer.viewReceipt !== manifest.contract.viewReceipt ||
    renderer.pickReceipt !== manifest.contract.pickReceipt ||
    renderer.measurementReceipt !==
      manifest.contract.measurementReceipt ||
    renderer.measurementSchema !==
      manifest.contract.measurement ||
    renderer.backend !== manifest.browserBackend.id ||
    renderer.gpuApi !== true ||
    renderer.physicalGpuClaimed !== false ||
    renderer.uploadedBytes !==
      manifest.expected.browserUploadedBytes ||
    renderer.uploadedBytes > budget.maximumUploadedBytes ||
    renderer.depthEncodingBits !== expected.depthEncodingBits ||
    renderer.picks !== 5 ||
    renderer.measurements !== 3 ||
    renderer.viewUpdates !== 7 ||
    renderer.frames !== 8
  ) {
    throw new Error("Browser section renderer is invalid");
  }
  if (
    !Array.isArray(report.surfacePoints) ||
    report.surfacePoints.length !== expected.surfacePoints
  ) {
    throw new Error("Browser measurement points are invalid");
  }
  for (const point of report.surfacePoints) {
    if (
      !Number.isSafeInteger(point.coordinates?.x) ||
      !Number.isSafeInteger(point.coordinates?.y) ||
      point.coordinates?.origin !== "canvas-top-left" ||
      typeof point.pickId !== "string" ||
      !Array.isArray(point.worldPosition) ||
      point.worldPosition.length !== 3 ||
      !point.worldPosition.every(Number.isFinite) ||
      typeof point.depth !== "number" ||
      !Number.isFinite(point.depth) ||
      point.depth < 0 ||
      point.depth > 1 ||
      point.glError !== 0
    ) {
      throw new Error("Browser measurement point is invalid");
    }
    boundedMeasurement(
      point.frameMs,
      budget.maximumPickMs,
      "Browser measurement pick frame",
    );
  }
  if (
    report.measurements?.distance?.value !==
      expected.distance ||
    report.measurements?.distance?.pointCount !== 2 ||
    report.measurements?.angle?.degrees !==
      expected.angleDegrees ||
    report.measurements?.angle?.pointCount !== 3 ||
    report.measurements?.area?.value !== expected.area ||
    report.measurements?.area?.pointCount !== 3 ||
    !Array.isArray(report.measurements?.area?.normal) ||
    report.measurements.area.normal.length !== 3 ||
    !report.measurements.area.normal.every(Number.isFinite)
  ) {
    throw new Error("Browser measurements are invalid");
  }
  const section = plainRecord(
    report.section,
    "Browser section receipt",
  );
  if (
    section.baselinePixels !== expected.baselinePixels ||
    !equalJson(section.plane?.normal, [1, 0, 0]) ||
    section.plane?.constant !== -10.975 ||
    section.plane?.activePlanes !== 1 ||
    section.plane?.pixels !== expected.planePixels ||
    section.plane?.pixels >= section.baselinePixels ||
    section.plane?.centerPick !== "miss" ||
    section.plane?.glError !== 0 ||
    !Array.isArray(section.box?.min) ||
    !Array.isArray(section.box?.max) ||
    section.box.min.length !== 3 ||
    section.box.max.length !== 3 ||
    section.box.activePlanes !== 6 ||
    section.box.pixels !== expected.sectionBoxPixels ||
    section.box.pixels >= section.baselinePixels ||
    section.box.centerPick !== "hit-inside-box" ||
    section.box.glError !== 0 ||
    section.restored?.activePlanes !== 0 ||
    section.restored?.pixels !== expected.restoredPixels ||
    section.restored?.pixels !== section.baselinePixels ||
    section.restored?.glError !== 0
  ) {
    throw new Error("Browser section receipt is invalid");
  }
  for (const [value, label] of [
    [section.plane.frameMs, "plane frame"],
    [section.box.frameMs, "section-box frame"],
    [section.restored.frameMs, "restored frame"],
  ]) {
    boundedMeasurement(
      value,
      budget.maximumSectionFrameMs,
      `Browser ${label}`,
    );
  }
  if (
    report.cleanup?.persistentActiveBytesBeforeLifecycle !==
      manifest.expected.browserUploadedBytes ||
    report.cleanup?.transientPickTargetBytes !== 3_110_400 ||
    report.cleanup?.transientPickTargetBytes >
      budget.maximumTemporaryTargetBytes ||
    report.cleanup?.transientPickTargetsReleased !== true ||
    report.cleanup?.finalReleasedBytes !==
      manifest.expected.browserLifecycle.totalReleasedBytes ||
    report.cleanup?.finalActiveBytes !== 0 ||
    report.cleanup?.rendererDisposed !== true ||
    report.cleanup?.publicSessionDisposed !== true ||
    report.cleanup?.switchSessionDisposed !== true ||
    report.cleanup?.backendDisposed !== true ||
    !/Chrome\/[0-9.]+/u.test(
      report.environment?.userAgent ?? "",
    ) ||
    !Array.isArray(report.diagnostics) ||
    report.diagnostics.length !== 0
  ) {
    throw new Error("Browser section cleanup is invalid");
  }
  boundedMeasurement(
    report.performance?.totalMs,
    budget.maximumTotalMs,
    "Browser section totalMs",
  );
  for (const assertion of SECTION_CONFORMANCE_ASSERTIONS) {
    if (evidence.conformance?.[assertion] !== true) {
      throw new Error(
        `Browser section conformance ${assertion} did not pass`,
      );
    }
  }
  if (
    Object.keys(evidence.conformance ?? {}).length !==
      SECTION_CONFORMANCE_ASSERTIONS.length + 1 ||
    evidence.conformance?.consoleWarningsOrErrors !== false ||
    evidence.decision?.sectionMeasurement !== "passed" ||
    evidence.decision?.sourceUnitsResolved !==
      "blocked-source-coordinate-unit-only" ||
    evidence.decision?.physicalGpuQualification !==
      "not-claimed" ||
    evidence.decision?.browserVscodeConformance !== "blocked" ||
    evidence.decision?.viewerCoreConformance !==
      "blocked-unresolved-upstream" ||
    evidence.decision?.productionClaims !== false
  ) {
    throw new Error("Browser section decision is invalid");
  }
  return report;
}

function validateBrowserPrecisionEvidence(manifest, evidence) {
  const fixture = plainRecord(
    evidence.fixture,
    "Browser precision fixture",
  );
  const budget = plainRecord(
    evidence.budget,
    "Browser precision budget",
  );
  const report = plainRecord(
    evidence.representativeReport,
    "Browser precision representativeReport",
  );
  const expected = plainRecord(
    manifest.expected.browserLargeCoordinate,
    "manifest.expected.browserLargeCoordinate",
  );
  if (
    evidence.schema !==
      "bim-explorer-browser-large-coordinate-evidence/0.1" ||
    evidence.asOf !== manifest.asOf ||
    evidence.status !==
      "experimental-browser-large-coordinate" ||
    fixture.id !== "synthetic-ifc4-large-coordinate" ||
    fixture.schema !== "IFC4" ||
    fixture.profile !== "synthetic-large-coordinate-precision" ||
    fixture.byteLength !== 4_082 ||
    fixture.sha256 !== expected.sha256 ||
    fixture.artifactCommitted !== true ||
    fixture.profileAdmission !== false ||
    budget.maximumFirstFrameMs !== 1_000 ||
    budget.maximumPickMs !== 1_000 ||
    budget.maximumUploadedBytes !== 8_388_608 ||
    budget.maximumTemporaryTargetBytes !== 4_194_304 ||
    budget.maximumRelativeCoordinate !== 5 ||
    budget.minimumWorldCoordinate !== 999_999_999 ||
    budget.frameWidth !== 960 ||
    budget.frameHeight !== 540
  ) {
    throw new Error("Browser precision evidence identity is invalid");
  }
  const source = plainRecord(
    report.source,
    "Browser precision source",
  );
  const renderer = plainRecord(
    report.renderer,
    "Browser precision renderer",
  );
  const precision = plainRecord(
    renderer.precision,
    "Browser precision strategy",
  );
  if (
    report.schema !==
      "bim-explorer-browser-large-coordinate-report/1" ||
    report.status !== "passed" ||
    source.fingerprint !== `sha256:${expected.sha256}` ||
    source.revisionId !==
      `source-snapshot:sha256:${expected.sha256}` ||
    !equalJson(source.bounds, expected.bounds) ||
    renderer.contract !== manifest.contract.renderer ||
    renderer.receipt !== manifest.contract.receipt ||
    renderer.backend !== manifest.browserBackend.id ||
    renderer.gpuApi !== true ||
    renderer.physicalGpuClaimed !== false ||
    precision.strategy !== "camera-relative-model-origin" ||
    !equalJson(precision.worldOrigin, expected.worldOrigin) ||
    precision.maximumRelativeCoordinate !==
      expected.maximumRelativeCoordinate ||
    precision.maximumRelativeCoordinate >
      budget.maximumRelativeCoordinate ||
    renderer.uploadedBytes !== 1_120 ||
    renderer.uploadedBytes > budget.maximumUploadedBytes ||
    renderer.drawCalls !== 2 ||
    renderer.nonBackgroundPixels !==
      expected.nonBackgroundPixels ||
    renderer.nonBackgroundPixels <= 0 ||
    renderer.glError !== 0
  ) {
    throw new Error("Browser precision render receipt is invalid");
  }
  boundedMeasurement(
    renderer.firstFrameMs,
    budget.maximumFirstFrameMs,
    "Browser precision first frame",
  );
  const picking = plainRecord(
    report.picking,
    "Browser precision picking",
  );
  if (
    picking.status !== "hit" ||
    picking.expressId !== 40 ||
    picking.renderId !==
      "render:ifc:cc8b296e3ad26cd2:40" ||
    picking.pickId !==
      "pick:ifc:cc8b296e3ad26cd2:40" ||
    !equalJson(picking.coordinates, {
      x: 480,
      y: 180,
      origin: "canvas-top-left",
    }) ||
    !Array.isArray(picking.worldPosition) ||
    picking.worldPosition.length !== 3 ||
    picking.worldPosition.some(
      (value, axis) =>
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < budget.minimumWorldCoordinate ||
        value < source.bounds.min[axis] - 1e-3 ||
        value > source.bounds.max[axis] + 1e-3,
    ) ||
    typeof picking.depth !== "number" ||
    picking.depth <= 0 ||
    picking.depth >= 1 ||
    picking.temporaryTargetBytes !== 3_110_400 ||
    picking.temporaryTargetBytes >
      budget.maximumTemporaryTargetBytes ||
    picking.temporaryReleased !== true ||
    picking.glError !== 0
  ) {
    throw new Error("Browser precision pick receipt is invalid");
  }
  boundedMeasurement(
    picking.frameMs,
    budget.maximumPickMs,
    "Browser precision pick",
  );
  if (
    report.cleanup?.releasedBytes !== renderer.uploadedBytes ||
    report.cleanup?.activeBytes !== 0 ||
    report.cleanup?.rendererDisposed !== true ||
    report.cleanup?.sessionDisposed !== true ||
    report.cleanup?.backendDisposed !== true ||
    !/Chrome\/[0-9.]+/u.test(
      report.environment?.userAgent ?? "",
    ) ||
    !Array.isArray(report.diagnostics) ||
    report.diagnostics.length !== 0
  ) {
    throw new Error("Browser precision cleanup is invalid");
  }
  for (const assertion of PRECISION_CONFORMANCE_ASSERTIONS) {
    if (evidence.conformance?.[assertion] !== true) {
      throw new Error(
        `Browser precision conformance ${assertion} did not pass`,
      );
    }
  }
  if (
    Object.keys(evidence.conformance ?? {}).length !==
      PRECISION_CONFORMANCE_ASSERTIONS.length + 1 ||
    evidence.conformance?.consoleWarningsOrErrors !== false ||
    evidence.decision?.largeCoordinatePrecision !== "passed" ||
    evidence.decision?.physicalGpuQualification !==
      "not-claimed" ||
    evidence.decision?.browserVscodeConformance !== "blocked" ||
    evidence.decision?.viewerCoreConformance !==
      "blocked-unresolved-upstream" ||
    evidence.decision?.productionClaims !== false
  ) {
    throw new Error("Browser precision decision is invalid");
  }
  return report;
}

function validateBrowserProgressiveEvidence(manifest, evidence) {
  const fixture = plainRecord(
    evidence.fixture,
    "Browser progressive fixture",
  );
  const budget = plainRecord(
    evidence.budget,
    "Browser progressive budget",
  );
  const report = plainRecord(
    evidence.representativeReport,
    "Browser progressive representativeReport",
  );
  const expected = plainRecord(
    manifest.expected.browserProgressiveRange,
    "manifest.expected.browserProgressiveRange",
  );
  if (
    evidence.schema !==
      "bim-explorer-browser-progressive-range-evidence/0.1" ||
    evidence.asOf !== manifest.asOf ||
    evidence.status !==
      "experimental-browser-progressive-range" ||
    fixture.id !== manifest.fixture.id ||
    fixture.schema !== manifest.fixture.schema ||
    fixture.profile !== manifest.fixture.profile ||
    fixture.byteLength !== manifest.fixture.byteLength ||
    fixture.sha256 !== manifest.fixture.sha256 ||
    fixture.artifactCommitted !== false ||
    fixture.profileAdmission !== false ||
    budget.maximumGpuCacheBytes !== 16_777_216 ||
    budget.maximumCpuStagingBytes !== 16_777_216 ||
    budget.maximumRangeBytes !== 4_194_304 ||
    budget.maximumReadBytes !== 1_048_576 ||
    budget.maximumFrameMs !== 1_000
  ) {
    throw new Error(
      "Browser progressive evidence identity is invalid",
    );
  }
  if (
    report.schema !==
      "bim-explorer-browser-progressive-range-report/1" ||
    report.status !== "passed" ||
    report.source?.fingerprint !==
      `sha256:${manifest.fixture.sha256}` ||
    report.source?.revisionId !==
      `source-snapshot:sha256:${manifest.fixture.sha256}` ||
    report.renderer?.contract !== manifest.contract.renderer ||
    report.renderer?.rangeReceipt !==
      "bim-explorer-bim-renderer-3d-range-receipt/0.1" ||
    report.renderer?.backend !== manifest.browserBackend.id ||
    report.renderer?.gpuApi !== true ||
    report.renderer?.physicalGpuClaimed !== false
  ) {
    throw new Error(
      "Browser progressive renderer identity is invalid",
    );
  }
  const initial = report.initial;
  if (
    initial?.rangeId !== "range:ifc:geometry:0" ||
    initial?.sourceReadBytes !==
      manifest.expected.metrics.sourceReadBytes ||
    initial?.sourceReads !==
      manifest.expected.metrics.sourceReads ||
    initial?.uploadedBytes !==
      manifest.expected.browserUploadedBytes ||
    initial?.instances !== manifest.expected.metrics.instances ||
    initial?.drawCalls !== manifest.expected.metrics.drawCalls ||
    initial?.gpuBuffers !== 3
  ) {
    throw new Error(
      "Browser progressive initial range is invalid",
    );
  }
  const visibility = report.visibility;
  if (
    visibility?.isolate?.isolatedRenderIds !== 8 ||
    visibility?.isolate?.hiddenInstances !== 3_174 ||
    visibility?.isolate?.visibleInstances !== 8 ||
    visibility?.isolate?.drawCalls !== 8 ||
    visibility?.isolate?.nonBackgroundPixels <= 0 ||
    visibility?.isolate?.glError !== 0 ||
    visibility?.showAll?.isolatedRenderIds !== 0 ||
    visibility?.showAll?.hiddenInstances !== 0 ||
    visibility?.showAll?.visibleInstances !==
      manifest.expected.metrics.instances ||
    visibility?.showAll?.drawCalls !==
      manifest.expected.metrics.drawCalls ||
    visibility?.showAll?.nonBackgroundPixels !== 57_438 ||
    visibility?.showAll?.glError !== 0 ||
    visibility?.uploadedBytesBefore !==
      manifest.expected.browserUploadedBytes ||
    visibility?.uploadedBytesAfter !==
      visibility.uploadedBytesBefore ||
    visibility?.frames !== 3
  ) {
    throw new Error(
      "Browser progressive visibility is invalid",
    );
  }
  boundedMeasurement(
    visibility.isolate.frameMs,
    budget.maximumFrameMs,
    "Browser isolate frame",
  );
  boundedMeasurement(
    visibility.showAll.frameMs,
    budget.maximumFrameMs,
    "Browser show-all frame",
  );
  const first = report.firstLoad;
  if (
    first?.rangeId !== "range:ifc:geometry:1" ||
    first?.sourceReadBytes !== 4_194_152 ||
    first?.sourceReads !== 4 ||
    first?.geometryPayloadBytes !== 4_158_276 ||
    first?.instanceBytes !== 174_560 ||
    first?.instances !== 2_182 ||
    first?.addedBytes !== expected.firstAddedBytes ||
    first?.activeBytes !== expected.firstActiveBytes ||
    first?.residentRanges !== 2 ||
    first?.gpuBuffers !== 6 ||
    first?.drawCalls !== 5_364 ||
    first?.nonBackgroundPixels <= 0 ||
    first?.cpuRangeStagingReleased !== true ||
    first?.glError !== 0
  ) {
    throw new Error(
      "Browser progressive first load is invalid",
    );
  }
  boundedMeasurement(
    first.frameMs,
    budget.maximumFrameMs,
    "Browser progressive first frame",
  );
  const hit = report.cacheHit;
  if (
    hit?.rangeId !== first.rangeId ||
    hit?.cacheHit !== true ||
    hit?.sourceReadsBefore !== hit?.sourceReadsAfter ||
    hit?.sourceBytesBefore !== hit?.sourceBytesAfter ||
    hit?.activeBytes !== first.activeBytes ||
    hit?.backendCall !== false
  ) {
    throw new Error(
      "Browser progressive cache hit is invalid",
    );
  }
  const second = report.secondLoad;
  if (
    second?.rangeId !== "range:ifc:geometry:2" ||
    second?.sourceReadBytes !== 902_676 ||
    second?.sourceReads !== 1 ||
    second?.geometryPayloadBytes !== 893_760 ||
    second?.instanceBytes !== 48_640 ||
    second?.instances !== 608 ||
    second?.addedBytes !== expected.secondAddedBytes ||
    second?.activeBytes !== expected.allActiveBytes ||
    second?.activeBytes > budget.maximumGpuCacheBytes ||
    second?.residentRanges !== 3 ||
    second?.gpuBuffers !== 9 ||
    second?.drawCalls !== 5_972 ||
    second?.nonBackgroundPixels <= 0 ||
    second?.cpuRangeStagingReleased !== true ||
    second?.glError !== 0
  ) {
    throw new Error(
      "Browser progressive second load is invalid",
    );
  }
  boundedMeasurement(
    second.frameMs,
    budget.maximumFrameMs,
    "Browser progressive second frame",
  );
  const eviction = report.eviction;
  if (
    eviction?.rangeId !== first.rangeId ||
    eviction?.releasedBytes !== first.addedBytes ||
    eviction?.activeBytes !== expected.evictedActiveBytes ||
    !equalJson(eviction?.residentRangeIds, [
      "range:ifc:geometry:0",
      "range:ifc:geometry:2",
    ]) ||
    eviction?.gpuBuffers !== 6 ||
    eviction?.drawCalls !== 3_790 ||
    eviction?.nonBackgroundPixels <= 0 ||
    eviction?.glError !== 0
  ) {
    throw new Error(
      "Browser progressive eviction is invalid",
    );
  }
  boundedMeasurement(
    eviction.frameMs,
    budget.maximumFrameMs,
    "Browser progressive eviction frame",
  );
  if (
    report.cleanup?.unmountReleasedBytes !==
      eviction.activeBytes ||
    report.cleanup?.totalReleasedBytes !==
      expected.allActiveBytes ||
    report.cleanup?.activeBytes !== 0 ||
    report.cleanup?.residentRanges !== 0 ||
    report.cleanup?.rendererDisposed !== true ||
    report.cleanup?.sessionDisposed !== true ||
    report.cleanup?.backendDisposed !== true ||
    !/Chrome\/[0-9.]+/u.test(
      report.environment?.userAgent ?? "",
    ) ||
    !Array.isArray(report.diagnostics) ||
    report.diagnostics.length !== 0
  ) {
    throw new Error(
      "Browser progressive cleanup is invalid",
    );
  }
  for (const assertion of PROGRESSIVE_CONFORMANCE_ASSERTIONS) {
    if (evidence.conformance?.[assertion] !== true) {
      throw new Error(
        `Browser progressive conformance ${assertion} did not pass`,
      );
    }
  }
  if (
    Object.keys(evidence.conformance ?? {}).length !==
      PROGRESSIVE_CONFORMANCE_ASSERTIONS.length + 1 ||
    evidence.conformance?.consoleWarningsOrErrors !== false ||
    evidence.decision?.progressiveRangeCache !== "passed" ||
    evidence.decision?.isolateVisibility !== "passed" ||
    evidence.decision?.visibilityDrivenFirstFrame !== "blocked" ||
    evidence.decision?.physicalGpuQualification !==
      "not-claimed" ||
    evidence.decision?.browserVscodeConformance !== "blocked" ||
    evidence.decision?.viewerCoreConformance !==
      "blocked-unresolved-upstream" ||
    evidence.decision?.productionClaims !== false
  ) {
    throw new Error("Browser progressive decision is invalid");
  }
  return report;
}

function validateBrowserDeltaEvidence(manifest, evidence) {
  const fixture = plainRecord(
    evidence.fixture,
    "Browser delta fixture",
  );
  const budget = plainRecord(
    evidence.budget,
    "Browser delta budget",
  );
  const report = plainRecord(
    evidence.representativeReport,
    "Browser delta representativeReport",
  );
  if (
    evidence.schema !==
      "bim-explorer-browser-atomic-delta-evidence/0.1" ||
    evidence.asOf !== manifest.asOf ||
    evidence.status !== "experimental-browser-atomic-delta" ||
    fixture.id !== manifest.fixture.id ||
    fixture.schema !== manifest.fixture.schema ||
    fixture.profile !== manifest.fixture.profile ||
    fixture.byteLength !== manifest.fixture.byteLength ||
    fixture.sha256 !== manifest.fixture.sha256 ||
    fixture.artifactCommitted !== false ||
    fixture.profileAdmission !== false ||
    budget.maximumFrameMs !== 1_000 ||
    budget.maximumRedrawPixels !== 518_400 ||
    budget.maximumOperations !== 100_000
  ) {
    throw new Error("Browser delta evidence identity is invalid");
  }
  const revisionId =
    `source-snapshot:sha256:${manifest.fixture.sha256}`;
  if (
    report.schema !==
      "bim-explorer-browser-atomic-delta-report/1" ||
    report.status !== "passed" ||
    report.source?.fingerprint !==
      `sha256:${manifest.fixture.sha256}` ||
    report.source?.revisionId !== revisionId ||
    report.renderer?.contract !== manifest.contract.renderer ||
    report.renderer?.deltaReceipt !==
      "bim-explorer-bim-renderer-3d-delta-receipt/0.1" ||
    report.renderer?.backend !== manifest.browserBackend.id ||
    report.renderer?.gpuApi !== true ||
    report.renderer?.physicalGpuClaimed !== false
  ) {
    throw new Error("Browser delta renderer identity is invalid");
  }
  const delta = report.delta;
  const expectedBounds = {
    min: [4.9875, 5.11625, 2.0641220000000002],
    max: [10.975, 11.2325, 5.828244],
  };
  if (
    delta?.deltaId !== "delta:browser:presentation:1" ||
    delta?.sequence !== 1 ||
    delta?.operationCount !== 1 ||
    delta?.fromRevisionId !== revisionId ||
    delta?.toRevisionId !== revisionId ||
    !equalJson(delta?.affectedWorldBounds, expectedBounds) ||
    delta?.status !== "applied" ||
    delta?.atomic !== true ||
    delta?.applied !== true ||
    delta?.viewRevision !== 3
  ) {
    throw new Error("Browser delta receipt is invalid");
  }
  const redraw = report.redraw;
  if (
    redraw?.scope !== "affected-world-bounds" ||
    !equalJson(redraw?.rect, {
      x: 429,
      y: 230,
      width: 101,
      height: 88,
    }) ||
    redraw?.pixels !== redraw.rect.width * redraw.rect.height ||
    redraw?.pixels <= 0 ||
    redraw?.pixels >= budget.maximumRedrawPixels ||
    redraw?.visibleInstances !==
      manifest.expected.metrics.instances ||
    redraw?.drawCalls !== manifest.expected.metrics.drawCalls ||
    redraw?.nonBackgroundPixels !== 57_438 ||
    redraw?.glError !== 0
  ) {
    throw new Error("Browser delta redraw is invalid");
  }
  boundedMeasurement(
    redraw.frameMs,
    budget.maximumFrameMs,
    "Browser delta redraw frame",
  );
  if (
    report.resourceState?.uploadedBytesBefore !==
      manifest.expected.browserUploadedBytes ||
    report.resourceState?.uploadedBytesAfter !==
      report.resourceState.uploadedBytesBefore ||
    report.resourceState?.residentRanges !== 1 ||
    report.resourceState?.frames !== 4 ||
    report.unsupportedMutation?.deltaId !==
      "delta:browser:geometry:2" ||
    report.unsupportedMutation?.sequence !== 2 ||
    report.unsupportedMutation?.status !== "remount-required" ||
    report.unsupportedMutation?.atomic !== true ||
    report.unsupportedMutation?.applied !== false ||
    report.unsupportedMutation?.reason !==
      "unsupported-source-mutation" ||
    report.unsupportedMutation?.backendCall !== false ||
    report.unsupportedMutation?.activeRevisionUnchanged !== true ||
    report.staleDeltaRejected !== true ||
    !/Chrome\/[0-9.]+/u.test(
      report.environment?.userAgent ?? "",
    ) ||
    !Array.isArray(report.diagnostics) ||
    report.diagnostics.length !== 0
  ) {
    throw new Error("Browser delta atomicity is invalid");
  }
  for (const assertion of DELTA_CONFORMANCE_ASSERTIONS) {
    if (evidence.conformance?.[assertion] !== true) {
      throw new Error(
        `Browser delta conformance ${assertion} did not pass`,
      );
    }
  }
  if (
    Object.keys(evidence.conformance ?? {}).length !==
      DELTA_CONFORMANCE_ASSERTIONS.length + 1 ||
    evidence.conformance?.consoleWarningsOrErrors !== false ||
    evidence.decision?.affectedBoundsAtomicDelta !== "passed" ||
    evidence.decision?.geometryDeltaInPlace !==
      "blocked-remount-required" ||
    evidence.decision?.physicalGpuQualification !==
      "not-claimed" ||
    evidence.decision?.browserVscodeConformance !== "blocked" ||
    evidence.decision?.viewerCoreConformance !==
      "blocked-unresolved-upstream" ||
    evidence.decision?.productionClaims !== false
  ) {
    throw new Error("Browser delta decision is invalid");
  }
  return report;
}

function validateBrowserCameraInputEvidence(manifest, evidence) {
  const fixture = plainRecord(
    evidence.fixture,
    "Browser camera-input fixture",
  );
  const budget = plainRecord(
    evidence.budget,
    "Browser camera-input budget",
  );
  const report = plainRecord(
    evidence.representativeReport,
    "Browser camera-input representativeReport",
  );
  const revisionId =
    `source-snapshot:sha256:${manifest.fixture.sha256}`;
  if (
    evidence.schema !==
      "bim-explorer-browser-camera-input-evidence/0.1" ||
    evidence.asOf !== manifest.asOf ||
    evidence.status !== "experimental-browser-camera-input" ||
    fixture.id !== manifest.fixture.id ||
    fixture.schema !== manifest.fixture.schema ||
    fixture.profile !== manifest.fixture.profile ||
    fixture.byteLength !== manifest.fixture.byteLength ||
    fixture.sha256 !== manifest.fixture.sha256 ||
    fixture.artifactCommitted !== false ||
    fixture.profileAdmission !== false ||
    budget.maximumFrameMs !== 1_000 ||
    budget.maximumUploadedBytes !== 8_388_608 ||
    budget.frameWidth !== 960 ||
    budget.frameHeight !== 540 ||
    report.schema !==
      "bim-explorer-browser-camera-input-report/1" ||
    report.status !== "passed" ||
    report.source?.fingerprint !==
      `sha256:${manifest.fixture.sha256}` ||
    report.source?.revisionId !== revisionId ||
    report.renderer?.contract !== manifest.contract.renderer ||
    report.renderer?.camera !== manifest.contract.camera ||
    report.renderer?.viewReceipt !==
      manifest.contract.viewReceipt ||
    report.renderer?.backend !== manifest.browserBackend.id ||
    report.renderer?.gpuApi !== true ||
    report.renderer?.physicalGpuClaimed !== false ||
    report.renderer?.uploadedBytes !==
      manifest.expected.browserUploadedBytes ||
    report.renderer?.uploadedBytes > budget.maximumUploadedBytes
  ) {
    throw new Error(
      "Browser camera-input evidence identity is invalid",
    );
  }
  if (
    report.input?.domPointerEvents !== 3 ||
    report.input?.domWheelEvents !== 1 ||
    report.input?.serializedUpdates !== 2 ||
    report.input?.orbitUpdates !== 1 ||
    report.input?.panUpdates !== 0 ||
    report.input?.zoomUpdates !== 1 ||
    report.input?.controlsDisposed !== true ||
    report.orbitFrame?.viewRevision !== 1 ||
    report.orbitFrame?.yaw === report.initialCamera?.yaw ||
    report.orbitFrame?.pitch === report.initialCamera?.pitch ||
    report.orbitFrame?.distance !==
      report.initialCamera?.distance ||
    report.orbitFrame?.drawCalls !==
      manifest.expected.metrics.drawCalls ||
    report.orbitFrame?.nonBackgroundPixels <= 0 ||
    report.orbitFrame?.glError !== 0 ||
    report.zoomFrame?.viewRevision !== 2 ||
    report.zoomFrame?.yaw !== report.orbitFrame?.yaw ||
    report.zoomFrame?.pitch !== report.orbitFrame?.pitch ||
    report.zoomFrame?.distance >= report.orbitFrame?.distance ||
    report.zoomFrame?.drawCalls !==
      manifest.expected.metrics.drawCalls ||
    report.zoomFrame?.nonBackgroundPixels <= 0 ||
    report.zoomFrame?.glError !== 0
  ) {
    throw new Error("Browser camera-input frames are invalid");
  }
  boundedMeasurement(
    report.orbitFrame.frameMs,
    budget.maximumFrameMs,
    "Browser camera orbit frame",
  );
  boundedMeasurement(
    report.zoomFrame.frameMs,
    budget.maximumFrameMs,
    "Browser camera zoom frame",
  );
  if (
    report.resourceState?.uploadedBytesBefore !==
      manifest.expected.browserUploadedBytes ||
    report.resourceState?.uploadedBytesAfter !==
      report.resourceState.uploadedBytesBefore ||
    report.resourceState?.frames !== 3 ||
    report.cleanup?.releasedBytes !==
      manifest.expected.browserUploadedBytes ||
    report.cleanup?.activeBytes !== 0 ||
    report.cleanup?.rendererDisposed !== true ||
    report.cleanup?.sessionDisposed !== true ||
    report.cleanup?.backendDisposed !== true ||
    !/Chrome\/[0-9.]+/u.test(
      report.environment?.userAgent ?? "",
    ) ||
    !Array.isArray(report.diagnostics) ||
    report.diagnostics.length !== 0
  ) {
    throw new Error("Browser camera-input cleanup is invalid");
  }
  for (
    const assertion of CAMERA_INPUT_CONFORMANCE_ASSERTIONS
  ) {
    if (evidence.conformance?.[assertion] !== true) {
      throw new Error(
        `Browser camera-input ${assertion} did not pass`,
      );
    }
  }
  if (
    Object.keys(evidence.conformance ?? {}).length !==
      CAMERA_INPUT_CONFORMANCE_ASSERTIONS.length + 1 ||
    evidence.conformance?.consoleWarningsOrErrors !== false ||
    evidence.decision?.cameraInteraction !== "passed" ||
    evidence.decision?.touchGestureQualification !== "blocked" ||
    evidence.decision?.physicalGpuQualification !==
      "not-claimed" ||
    evidence.decision?.browserVscodeConformance !== "blocked" ||
    evidence.decision?.viewerCoreConformance !==
      "blocked-unresolved-upstream" ||
    evidence.decision?.productionClaims !== false
  ) {
    throw new Error("Browser camera-input decision is invalid");
  }
  return report;
}

function validateBrowserVisibilityFirstFrameEvidence(
  manifest,
  evidence,
) {
  const fixture = plainRecord(
    evidence.fixture,
    "Browser visibility-first-frame fixture",
  );
  const budget = plainRecord(
    evidence.budget,
    "Browser visibility-first-frame budget",
  );
  const report = plainRecord(
    evidence.representativeReport,
    "Browser visibility-first-frame representativeReport",
  );
  const expected = plainRecord(
    manifest.expected.browserVisibilityFirstFrame,
    "manifest expected Browser visibility-first-frame",
  );
  const revisionId =
    `source-snapshot:sha256:${manifest.fixture.sha256}`;
  if (
    evidence.schema !==
      "bim-explorer-browser-" +
        "visibility-first-frame-evidence/0.1" ||
    evidence.asOf !== manifest.asOf ||
    evidence.status !==
      "experimental-browser-visibility-first-frame" ||
    fixture.id !== manifest.fixture.id ||
    fixture.schema !== manifest.fixture.schema ||
    fixture.profile !== manifest.fixture.profile ||
    fixture.byteLength !== manifest.fixture.byteLength ||
    fixture.sha256 !== manifest.fixture.sha256 ||
    fixture.artifactCommitted !== false ||
    fixture.profileAdmission !== false ||
    budget.maximumRangeBytes !==
      RENDERER_LIMITS.maximumRangeBytes ||
    budget.maximumSourceReadBytes !==
      RENDERER_LIMITS.maximumSourceReadBytes ||
    budget.maximumCpuStagingBytes !==
      RENDERER_LIMITS.maximumCpuStagingBytes ||
    budget.maximumUploadedBytes !== 8_388_608 ||
    budget.maximumFrameMs !== 1_000 ||
    budget.frameWidth !== 960 ||
    budget.frameHeight !== 540 ||
    report.schema !==
      "bim-explorer-browser-" +
        "visibility-first-frame-report/1" ||
    report.status !== "passed" ||
    report.source?.fingerprint !==
      `sha256:${manifest.fixture.sha256}` ||
    report.source?.revisionId !== revisionId
  ) {
    throw new Error(
      "Browser visibility-first-frame identity is invalid",
    );
  }
  const targetBounds = plainRecord(
    report.target?.bounds,
    "Browser visibility-first-frame target bounds",
  );
  const targetCenter = targetBounds.min?.map(
    (value, axis) =>
      (value + targetBounds.max?.[axis]) / 2,
  );
  if (
    report.target?.expressId !== expected.targetExpressId ||
    report.target?.rangeId !== expected.selectedRangeId ||
    !Array.isArray(targetBounds.min) ||
    !Array.isArray(targetBounds.max) ||
    targetBounds.min.length !== 3 ||
    targetBounds.max.length !== 3 ||
    !targetBounds.min.every((value, axis) =>
      typeof value === "number" &&
      Number.isFinite(value) &&
      value <= targetBounds.max[axis]) ||
    report.selection?.strategy !== "camera-visibility" ||
    report.selection?.cameraDriven !== true ||
    !equalJson(report.selection?.sourcePlanRangeIds, [
      expected.sourcePlanRangeId,
    ]) ||
    !equalJson(report.selection?.selectedRangeIds, [
      expected.selectedRangeId,
    ]) ||
    !equalJson(report.selection?.deferredRangeIds, [
      expected.sourcePlanRangeId,
      "range:ifc:geometry:2",
    ]) ||
    !Array.isArray(report.selection?.ranking) ||
    report.selection.ranking.length !== 3 ||
    report.selection.ranking[0]?.rangeId !==
      expected.selectedRangeId ||
    report.selection.ranking.some((entry, index, ranking) =>
      typeof entry?.targetGap !== "number" ||
      !Number.isFinite(entry.targetGap) ||
      typeof entry?.targetDistance !== "number" ||
      !Number.isFinite(entry.targetDistance) ||
      (
        index > 0 &&
        entry.targetGap < ranking[index - 1].targetGap
      )) ||
    report.camera?.schema !== manifest.contract.camera ||
    report.camera?.projection !== "perspective" ||
    !equalJson(report.camera?.target, targetCenter)
  ) {
    throw new Error(
      "Browser visibility-first-frame selection is invalid",
    );
  }
  const firstFrame = plainRecord(
    report.firstFrame,
    "Browser visibility-first-frame firstFrame",
  );
  if (
    firstFrame.actualGpu !== true ||
    firstFrame.rendered !== true ||
    firstFrame.sourceReadBytes !== expected.sourceReadBytes ||
    firstFrame.sourceReadBytes > budget.maximumSourceReadBytes ||
    firstFrame.sourceReads !== 4 ||
    firstFrame.geometryPayloadBytes !== 4_158_276 ||
    firstFrame.instances !== 2_182 ||
    firstFrame.drawCalls !== 2_182 ||
    firstFrame.uploadedBytes !== expected.uploadedBytes ||
    firstFrame.uploadedBytes > budget.maximumUploadedBytes ||
    firstFrame.nonBackgroundPixels !==
      expected.nonBackgroundPixels ||
    firstFrame.nonBackgroundPixels <= 0 ||
    firstFrame.glError !== 0 ||
    firstFrame.cpuRangeStagingReleased !== true
  ) {
    throw new Error(
      "Browser visibility-first-frame rendering is invalid",
    );
  }
  boundedMeasurement(
    firstFrame.frameMs,
    budget.maximumFrameMs,
    "Browser visibility first frame",
  );
  if (
    report.resourceState?.activeBytes !==
      expected.uploadedBytes ||
    report.resourceState?.residentRanges !== 1 ||
    report.resourceState?.frames !== 1 ||
    report.resourceState?.sourceReads !==
      firstFrame.sourceReads ||
    report.resourceState?.sourceBytes !==
      firstFrame.sourceReadBytes ||
    report.cleanup?.releasedBytes !==
      expected.uploadedBytes ||
    report.cleanup?.activeBytes !== 0 ||
    report.cleanup?.residentRanges !== 0 ||
    report.cleanup?.rendererDisposed !== true ||
    report.cleanup?.sessionDisposed !== true ||
    report.cleanup?.backendDisposed !== true ||
    !/Chrome\/[0-9.]+/u.test(
      report.environment?.userAgent ?? "",
    ) ||
    !Array.isArray(report.diagnostics) ||
    report.diagnostics.length !== 0
  ) {
    throw new Error(
      "Browser visibility-first-frame cleanup is invalid",
    );
  }
  for (
    const assertion of
      VISIBILITY_FIRST_FRAME_CONFORMANCE_ASSERTIONS
  ) {
    if (evidence.conformance?.[assertion] !== true) {
      throw new Error(
        "Browser visibility-first-frame " +
          `${assertion} did not pass`,
      );
    }
  }
  if (
    Object.keys(evidence.conformance ?? {}).length !==
      VISIBILITY_FIRST_FRAME_CONFORMANCE_ASSERTIONS.length + 1 ||
    evidence.conformance?.consoleWarningsOrErrors !== false ||
    evidence.decision?.visibilityDrivenFirstFrame !== "passed" ||
    evidence.decision?.physicalGpuQualification !==
      "not-claimed" ||
    evidence.decision?.browserVscodeConformance !== "blocked" ||
    evidence.decision?.viewerCoreConformance !==
      "blocked-unresolved-upstream" ||
    evidence.decision?.productionClaims !== false
  ) {
    throw new Error(
      "Browser visibility-first-frame decision is invalid",
    );
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
  const browserPickEvidence = plainRecord(
    evidenceBundle.browserPickingSelection,
    "Browser picking BIM renderer evidence",
  );
  const browserLifecycleEvidence = plainRecord(
    evidenceBundle.browserLifecycle,
    "Browser lifecycle BIM renderer evidence",
  );
  const browserSectionEvidence = plainRecord(
    evidenceBundle.browserSectionMeasurement,
    "Browser section BIM renderer evidence",
  );
  const browserPrecisionEvidence = plainRecord(
    evidenceBundle.browserLargeCoordinate,
    "Browser large-coordinate BIM renderer evidence",
  );
  const browserProgressiveEvidence = plainRecord(
    evidenceBundle.browserProgressiveRange,
    "Browser progressive-range BIM renderer evidence",
  );
  const browserDeltaEvidence = plainRecord(
    evidenceBundle.browserAtomicDelta,
    "Browser atomic-delta BIM renderer evidence",
  );
  const browserCameraInputEvidence = plainRecord(
    evidenceBundle.browserCameraInput,
    "Browser camera-input BIM renderer evidence",
  );
  const browserVisibilityFirstFrameEvidence = plainRecord(
    evidenceBundle.browserVisibilityFirstFrame,
    "Browser visibility-first-frame BIM renderer evidence",
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
    manifest.contract?.pickReceipt !==
      "bim-explorer-bim-renderer-3d-pick-receipt/0.1" ||
    manifest.contract?.measurementReceipt !==
      "bim-explorer-bim-renderer-3d-" +
        "measurement-receipt/0.1" ||
    manifest.contract?.measurement !==
      "bim-explorer-measurement-3d/0.1" ||
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
    manifest.evidence?.browserPickingSelection !==
      "compatibility/evidence/" +
        "bim-renderer-3d-public-browser-" +
        "picking-selection-2026-08-04.json" ||
    manifest.evidence?.browserLifecycle !==
      "compatibility/evidence/" +
        "bim-renderer-3d-public-browser-" +
        "lifecycle-2026-08-04.json" ||
    manifest.evidence?.browserSectionMeasurement !==
      "compatibility/evidence/" +
        "bim-renderer-3d-public-browser-" +
        "section-measurement-2026-08-04.json" ||
    manifest.evidence?.browserLargeCoordinate !==
      "compatibility/evidence/" +
        "bim-renderer-3d-browser-" +
        "large-coordinate-2026-08-04.json" ||
    manifest.evidence?.browserProgressiveRange !==
      "compatibility/evidence/" +
        "bim-renderer-3d-public-browser-" +
        "progressive-range-2026-08-04.json" ||
    manifest.evidence?.browserAtomicDelta !==
      "compatibility/evidence/" +
        "bim-renderer-3d-public-browser-" +
        "atomic-delta-2026-08-04.json" ||
    manifest.evidence?.browserCameraInput !==
      "compatibility/evidence/" +
        "bim-renderer-3d-public-browser-" +
        "camera-input-2026-08-04.json" ||
    manifest.evidence?.browserVisibilityFirstFrame !==
      "compatibility/evidence/" +
        "bim-renderer-3d-public-browser-" +
        "visibility-first-frame-2026-08-04.json" ||
    Object.keys(manifest.evidence ?? {}).length !== 11 ||
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
  const browserPickReport = validateBrowserPickEvidence(
    manifest,
    browserPickEvidence,
  );
  const browserLifecycleReport =
    validateBrowserLifecycleEvidence(
      manifest,
      browserLifecycleEvidence,
    );
  const browserSectionReport = validateBrowserSectionEvidence(
    manifest,
    browserSectionEvidence,
  );
  const browserPrecisionReport =
    validateBrowserPrecisionEvidence(
      manifest,
      browserPrecisionEvidence,
    );
  const browserProgressiveReport =
    validateBrowserProgressiveEvidence(
      manifest,
      browserProgressiveEvidence,
    );
  const browserDeltaReport =
    validateBrowserDeltaEvidence(
      manifest,
      browserDeltaEvidence,
    );
  const browserCameraInputReport =
    validateBrowserCameraInputEvidence(
      manifest,
      browserCameraInputEvidence,
    );
  const browserVisibilityFirstFrameReport =
    validateBrowserVisibilityFirstFrameEvidence(
      manifest,
      browserVisibilityFirstFrameEvidence,
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
    browserPickHighlightPixels:
      browserPickReport.selection.highlightPixels,
    browserLifecycleMounts:
      browserLifecycleReport.cleanup.mounts,
    browserMeasuredDistance:
      browserSectionReport.measurements.distance.value,
    browserPrecisionWorldOrigin:
      browserPrecisionReport.renderer.precision.worldOrigin,
    browserProgressiveActiveBytes:
      browserProgressiveReport.secondLoad.activeBytes,
    browserDeltaRedrawPixels:
      browserDeltaReport.redraw.pixels,
    browserCameraInputFrames:
      browserCameraInputReport.resourceState.frames,
    browserVisibilityFirstFrameRange:
      browserVisibilityFirstFrameReport
        .selection.selectedRangeIds[0],
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
    browserPickingSelection: JSON.parse(await readFile(
      path.join(
        root,
        manifest.evidence.browserPickingSelection,
      ),
      "utf8",
    )),
    browserLifecycle: JSON.parse(await readFile(
      path.join(root, manifest.evidence.browserLifecycle),
      "utf8",
    )),
    browserSectionMeasurement: JSON.parse(await readFile(
      path.join(
        root,
        manifest.evidence.browserSectionMeasurement,
      ),
      "utf8",
    )),
    browserLargeCoordinate: JSON.parse(await readFile(
      path.join(
        root,
        manifest.evidence.browserLargeCoordinate,
      ),
      "utf8",
    )),
    browserProgressiveRange: JSON.parse(await readFile(
      path.join(
        root,
        manifest.evidence.browserProgressiveRange,
      ),
      "utf8",
    )),
    browserAtomicDelta: JSON.parse(await readFile(
      path.join(
        root,
        manifest.evidence.browserAtomicDelta,
      ),
      "utf8",
    )),
    browserCameraInput: JSON.parse(await readFile(
      path.join(
        root,
        manifest.evidence.browserCameraInput,
      ),
      "utf8",
    )),
    browserVisibilityFirstFrame: JSON.parse(await readFile(
      path.join(
        root,
        manifest.evidence.browserVisibilityFirstFrame,
      ),
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
      `${result.browserPickHighlightPixels} highlight pixels, ` +
      `${result.browserLifecycleMounts} lifecycle mounts, ` +
      `${result.browserMeasuredDistance.toFixed(3)} measured units, ` +
      `${result.passedGates} passed and ${result.heldGates} held gates`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  await main();
}
