import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  validateBimFederationProductScalePlatformMatrix,
} from "./bim-federation-product-scale-platform-evidence.mjs";

const CONTRACT = Object.freeze({
  federation: "bim-explorer-federation/0.1",
  source: "bim-explorer-federation-source/0.1",
  alignment: "bim-explorer-federation-alignment/0.1",
  selection: "bim-explorer-federation-selection/0.1",
  savedView: "bim-explorer-federation-saved-view/0.1",
  referenceFormats:
    "bim-explorer-reference-format-registry/0.1",
  bimSourceProtocol: "bim-explorer-bim-source/0.2",
});
const TRUE_GATES = Object.freeze([
  "multiIfcSourceSlots",
  "nativeSourceIdentityIsolation",
  "perSourceVisibility",
  "sameCrsFloat64Alignment",
  "explicitAlignmentProvenance",
  "partialSourceState",
  "staleSourceState",
  "incrementalSingleSourceRefresh",
  "crossSourceSelection",
  "crossSourceSavedView",
  "staleRevisionFailClosed",
  "referenceFormatCapabilityMatrix",
  "ifcAndGltfReferenceAdmission",
  "referenceNativeIdentityIsolation",
  "productScaleGltfReferencePrerequisite",
  "productScaleFederationPerformance",
  "crossPlatformProductScaleFederation",
  "gltfGlbCodec",
  "boundedLifecycle",
]);
const HELD_GATES = Object.freeze([
  "actualSpatialConsumerConformance",
  "actualMultiFormatUserDemand",
  "surveyedCoordinateDatumEvidence",
  "pointCloudCodec",
  "gis3dTilesEngine",
  "rvtDgnNativeBridge",
]);
const HELD_FORMATS = Object.freeze([
  "las",
  "laz",
  "e57",
  "3d-tiles",
  "rvt",
  "dgn",
]);
const PRODUCT_REVISIONS = Object.freeze({
  architecture:
    "source-snapshot:sha256:" +
    "0a8f3818ec726e0658eb6ac4646b271e365d22b9e0b06752d21a91862df40ef7",
  reference:
    "source-snapshot:sha256:" +
    "bd7133b4b322aae97c589b8839dae8155ad2546acb35ae32a127e722a959d007",
  mep:
    "source-snapshot:sha256:" +
    "b65dde88beb826f585338385581008bff43e6704c3f32a2ddf63e8f6553c0f9d",
});
const PRODUCT_METRICS = Object.freeze({
  sources: 3,
  entities: 53,
  firstFrameRanges: 3,
  sourceReadBytes: 16_898_404,
  sourceReads: 19,
  geometryPayloadBytes: 16_898_016,
  geometryRecords: 17,
  vertices: 417_096,
  indices: 1_721_928,
  uniqueTriangles: 573_976,
  instances: 53,
  instancedTriangles: 1_499_120,
  drawCalls: 53,
  instanceBytes: 4_240,
  cpuStagingBytes: 16_902_644,
  uploadedBytes: 16_902_256,
});
const PRODUCT_SOURCE_SLOTS = Object.freeze([
  {
    federationSourceId: "source-slot:architecture",
    format: "ifc",
    sourceRevisionId: PRODUCT_REVISIONS.architecture,
    entities: 2,
    instances: 2,
  },
  {
    federationSourceId: "source-slot:glb-reference",
    format: "glb",
    sourceRevisionId: PRODUCT_REVISIONS.reference,
    entities: 49,
    instances: 49,
  },
  {
    federationSourceId: "source-slot:mep",
    format: "ifc",
    sourceRevisionId: PRODUCT_REVISIONS.mep,
    entities: 2,
    instances: 2,
  },
]);
const PRODUCT_RENDERER_LIMITS = Object.freeze({
  maximumFirstFrameRanges: 3,
  maximumRangeBytes: 33_554_432,
  maximumSourceReadBytes: 33_554_432,
  maximumReadBytes: 1_048_576,
  maximumGeometryRecords: 100_000,
  maximumGeometryPayloadBytes: 25_165_824,
  maximumInstances: 100_000,
  maximumInstancedTriangles: 4_000_000,
  maximumDrawCalls: 100_000,
  maximumCpuStagingBytes: 33_554_432,
  maximumGpuCacheBytes: 33_554_432,
});
const PRODUCT_ASSERTION_KEYS = Object.freeze([
  "exactPinnedFixture",
  "simultaneousThreeSourceFrame",
  "exactCompositeGeometry",
  "nativeIdentityIsolation",
  "boundedAlignment",
  "aggregateMemoryBudget",
  "headlessPerformanceBudget",
  "actualBrowserWebGl2",
  "exactBrowserRangeReads",
  "localOnlyRuntime",
  "deterministicCleanup",
  "authorityBoundaries",
  "pathFreeEvidence",
]);
const PRODUCT_PLATFORM_EVIDENCE_PATH =
  "compatibility/evidence/" +
  "bim-federation-product-scale-platform-matrix-2026-08-08.json";
const PRODUCT_PLATFORM_RUN_ID = 31_244_548_121;
const PRODUCT_PLATFORM_COMMIT =
  "b843486cce7998aae23cd6885c6938bb13827308";
const PRODUCT_PLATFORM_PROJECTION_SHA256 =
  "477b0d5f8db3639f3eeab6de3321992bf799afe63bd5c9f516d963e984cd7bf3";

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

function sourceRevision(value) {
  return /^source-snapshot:sha256:[0-9a-f]{64}$/u.test(
    value ?? "",
  );
}

export function validateBimFederationEvidence(evidence) {
  plainRecord(evidence, "BIM federation evidence");
  if (
    evidence.schema !==
      "bim-explorer-federation-qualification/1" ||
    evidence.status !== "passed-foundation" ||
    evidence.asOf !== "2026-08-04" ||
    !equalJson(evidence.contract, CONTRACT)
  ) {
    throw new Error(
      "BIM federation evidence identity is invalid",
    );
  }
  if (
    evidence.federation?.federationId !==
      "federation:synthetic-campus" ||
    !equalJson(evidence.federation.sourceSlots, [
      "source-slot:architecture",
      "source-slot:glb-reference",
      "source-slot:mep",
    ]) ||
    !equalJson(evidence.federation.disciplines, [
      "architecture",
      "reference",
      "mep",
    ]) ||
    evidence.federation.initialSources !== 3 ||
    evidence.federation.sourceIdentityMerged !== false ||
    evidence.federation.duplicateGlobalId !==
      "0AAAAAAAAAAAAAAAAAAA16" ||
    evidence.federation.duplicateGlobalIdOccurrences !== 2 ||
    evidence.federation.distinctSelectionKeys !== 3 ||
    !equalJson(evidence.federation.sourceVisibility, [
      {
        federationSourceId: "source-slot:architecture",
        visible: true,
      },
      {
        federationSourceId: "source-slot:glb-reference",
        visible: true,
      },
      {
        federationSourceId: "source-slot:mep",
        visible: false,
      },
    ])
  ) {
    throw new Error(
      "BIM federation source identity evidence is invalid",
    );
  }
  if (
    evidence.referenceMesh?.federationSourceId !==
      "source-slot:glb-reference" ||
    evidence.referenceMesh.format !== "glb" ||
    evidence.referenceMesh.sourceRole !==
      "derived-or-reference-mesh" ||
    evidence.referenceMesh.semanticAuthority !==
      "not-bim-authority" ||
    evidence.referenceMesh.nativeAuthority !==
      "external-reference-mesh" ||
    evidence.referenceMesh.nativeId !==
      "node:0/mesh:0/primitive:0" ||
    evidence.referenceMesh.globalId !== null ||
    evidence.referenceMesh.selected !== true ||
    evidence.referenceMesh.alignment !== "unaligned" ||
    evidence.referenceMesh.write !== "blocked-read-only" ||
    evidence.referenceMesh.roundTrip !==
      "blocked-not-source-authority"
  ) {
    throw new Error(
      "BIM federation reference mesh evidence is invalid",
    );
  }
  if (
    evidence.coordinates?.federationCoordinateSystem !==
      "EPSG:32652" ||
    !equalJson(evidence.coordinates.federationOrigin, [
      500000,
      4100000,
      100,
    ]) ||
    evidence.coordinates.sourceMethod !==
      "projected-same-crs" ||
    evidence.coordinates.numericPrecision !== "float64" ||
    evidence.coordinates.datumTransformation !==
      "not-performed" ||
    evidence.coordinates.explicitAlignmentProvenance !==
      "explicit-user-input" ||
    !equalJson(evidence.coordinates.architectureOrigin, [
      0,
      0,
      0,
    ]) ||
    evidence.coordinates.mappedSources !== 2
  ) {
    throw new Error(
      "BIM federation coordinate evidence is invalid",
    );
  }
  if (
    evidence.refresh?.partialStateObserved !== true ||
    evidence.refresh.staleStateObserved !== true ||
    evidence.refresh.refreshedSource !== "source-slot:mep" ||
    !sourceRevision(evidence.refresh.previousRevisionId) ||
    !sourceRevision(evidence.refresh.currentRevisionId) ||
    evidence.refresh.previousRevisionId ===
      evidence.refresh.currentRevisionId ||
    evidence.refresh.unchangedFederationSources !== 2 ||
    !sourceRevision(
      evidence.refresh.architectureRevisionPreserved,
    ) ||
    evidence.refresh.priorIdentityPolicy !==
      "all-prior-source-selections-are-stale"
  ) {
    throw new Error(
      "BIM federation refresh evidence is invalid",
    );
  }
  if (
    evidence.savedView?.schema !== CONTRACT.savedView ||
    evidence.savedView.selectedSources !== 3 ||
    evidence.savedView.sourceStates !== 3 ||
    evidence.savedView.crossSource !== true
  ) {
    throw new Error(
      "BIM federation saved view evidence is invalid",
    );
  }
  if (
    evidence.referenceFormats?.registered !== 9 ||
    !equalJson(
      evidence.referenceFormats.admitted,
      ["ifc", "gltf", "glb"],
    ) ||
    !equalJson(
      evidence.referenceFormats.held,
      HELD_FORMATS,
    ) ||
    evidence.referenceFormats.nonIfcSemanticAuthority !==
      false ||
    evidence.referenceFormats.allWritesBlocked !== true ||
    evidence.referenceFormats.allRoundTripsBlocked !== true
  ) {
    throw new Error(
      "BIM federation reference format evidence is invalid",
    );
  }
  if (
    Object.values(plainRecord(
      evidence.failClosed,
      "BIM federation fail-closed evidence",
    )).some((value) => value !== true) ||
    evidence.lifecycle?.releasedFederationSources !== 3 ||
    evidence.lifecycle.federationDisposed !== true ||
    evidence.lifecycle.sourceSessionsDisposed !== 4 ||
    evidence.lifecycle.sourcesDisposed !== 4
  ) {
    throw new Error(
      "BIM federation fail-closed or lifecycle evidence is invalid",
    );
  }
  if (
    evidence.decision?.multiIfcFoundation !==
      "passed-synthetic" ||
    evidence.decision.sameCrsAlignment !==
      "passed-ifc-map-conversion" ||
    evidence.decision.actualSpatialConsumer !==
      "held-consumer-owned" ||
    evidence.decision.actualMultiFormatUserDemand !==
      "held-external-evidence" ||
    evidence.decision.pointCloudCodec !==
      "held-codec-crs-scale-evidence" ||
    evidence.decision.gltfGlbCodec !==
      "passed-bounded-reference-mesh" ||
    evidence.decision.gis3dTiles !==
      "held-engine-network-precision-evidence" ||
    evidence.decision.rvtDgnNativeBridge !==
      "held-sdk-rights-reopen-qualification" ||
    evidence.decision.surveyedDatumTransformation !==
      "held-survey-evidence" ||
    evidence.decision.productScalePerformance !==
      "held-multi-source-fixture" ||
    evidence.decision.productionClaims !== false
  ) {
    throw new Error(
      "BIM federation decision evidence is invalid",
    );
  }
  if (/(?:\/Users\/|\/Volumes\/|[A-Z]:\\)/u.test(
    JSON.stringify(evidence),
  )) {
    throw new Error(
      "BIM federation evidence contains a local path",
    );
  }
}

export function validateBimFederationProductScaleEvidence(evidence) {
  plainRecord(evidence, "product-scale BIM federation evidence");
  if (
    evidence.schema !==
      "bim-explorer-federation-product-scale-qualification/1" ||
    evidence.status !== "passed-experimental" ||
    evidence.asOf !== "2026-08-08" ||
    evidence.contract?.federation !== CONTRACT.federation ||
    evidence.contract?.rendererProjection !==
      "bim-explorer-federated-renderer-projection/0.1" ||
    evidence.contract?.bimSourceProtocol !==
      CONTRACT.bimSourceProtocol
  ) {
    throw new Error(
      "product-scale BIM federation evidence identity is invalid",
    );
  }
  if (
    evidence.fixture?.fixtureId !==
      "khronos-gltf-sample-assets-a-beautiful-game-glb" ||
    evidence.fixture.byteLength !== 42_977_928 ||
    evidence.fixture.sha256 !==
      "bd7133b4b322aae97c589b8839dae8155ad2546acb35ae32a127e722a959d007" ||
    evidence.fixture.license !== "CC-BY-4.0" ||
    evidence.fixture.artifactTracked !== false ||
    evidence.fixture.releaseBundled !== false ||
    evidence.fixture.downloadOnDemand !== true
  ) {
    throw new Error(
      "product-scale BIM federation fixture is invalid",
    );
  }
  const expectedSources = [
    {
      federationSourceId: "source-slot:architecture",
      format: "ifc",
      sourceRevisionId: PRODUCT_REVISIONS.architecture,
      alignmentMethod: "projected-same-crs",
      alignmentProvenance: "ifc-map-conversion",
      datumTransformation: "not-performed",
    },
    {
      federationSourceId: "source-slot:glb-reference",
      format: "glb",
      sourceRevisionId: PRODUCT_REVISIONS.reference,
      alignmentMethod: "explicit",
      alignmentProvenance: "explicit-user-input",
      datumTransformation: "not-performed",
    },
    {
      federationSourceId: "source-slot:mep",
      format: "ifc",
      sourceRevisionId: PRODUCT_REVISIONS.mep,
      alignmentMethod: "explicit",
      alignmentProvenance: "explicit-user-input",
      datumTransformation: "not-performed",
    },
  ];
  if (
    evidence.federation?.federationId !==
      "federation:product-scale-composite" ||
    !equalJson(evidence.federation.sources, expectedSources) ||
    !equalJson(
      evidence.federation.sourceSlots,
      PRODUCT_SOURCE_SLOTS,
    ) ||
    evidence.federation.sourceIdentityMerged !== false ||
    evidence.federation.entities !== PRODUCT_METRICS.entities ||
    evidence.federation.instances !== PRODUCT_METRICS.instances ||
    evidence.federation.firstFrameRanges !==
      PRODUCT_METRICS.firstFrameRanges ||
    evidence.federation.distinctCompositeNativeIds !==
      PRODUCT_METRICS.entities ||
    evidence.federation
      .largestDuplicateGlobalIdOccurrences !== 2 ||
    !equalJson(evidence.expected, PRODUCT_METRICS)
  ) {
    throw new Error(
      "product-scale BIM federation source evidence is invalid",
    );
  }
  const headless = evidence.headless;
  if (
    headless?.renderer?.backend !== "headless" ||
    headless.renderer.rendered !== false ||
    !equalJson(
      headless.renderer.limits,
      PRODUCT_RENDERER_LIMITS,
    ) ||
    Object.entries(PRODUCT_METRICS)
      .filter(([field]) => ![
        "sources",
        "entities",
        "firstFrameRanges",
        "uploadedBytes",
      ].includes(field))
      .some(([field, value]) =>
        headless.renderer[field] !== value) ||
    headless.renderer.uploadedBytes !==
      PRODUCT_METRICS.uploadedBytes ||
    headless.range?.firstFrame?.rangeReads !==
      PRODUCT_METRICS.sourceReads ||
    headless.range.firstFrame.rangeBytes !==
      PRODUCT_METRICS.sourceReadBytes ||
    headless.range.firstFrame.sourceCount !== 3 ||
    headless.range.firstFrame.ownsSourceSessions !== false ||
    headless.range.afterBrowserPreparation?.rangeReads !== 38 ||
    headless.range.afterBrowserPreparation.rangeBytes !==
      PRODUCT_METRICS.sourceReadBytes * 2 ||
    headless.cleanup?.releasedBytes !==
      PRODUCT_METRICS.uploadedBytes ||
    headless.cleanup.rendererDisposed !== true ||
    headless.cleanup.backendDisposed !== true ||
    headless.cleanup.activeBackendBytes !== 0 ||
    headless.cleanup.residentRanges !== 0
  ) {
    throw new Error(
      "product-scale BIM federation geometry evidence is invalid",
    );
  }
  const memory = plainRecord(
    headless.memory,
    "product-scale BIM federation memory evidence",
  );
  const performance = plainRecord(
    headless.performance,
    "product-scale BIM federation performance evidence",
  );
  if (
    memory.budgetBytes !== 1_073_741_824 ||
    !Number.isSafeInteger(memory.maximumResidentSetSizeBytes) ||
    memory.maximumResidentSetSizeBytes <= 0 ||
    memory.maximumResidentSetSizeBytes > memory.budgetBytes ||
    !Number.isSafeInteger(memory.residentSetSizeBeforeMount) ||
    !Number.isSafeInteger(memory.residentSetSizeAfterMount) ||
    !Number.isSafeInteger(memory.residentSetDeltaBytes) ||
    memory.residentSetDeltaBytes < 0 ||
    performance.limits?.maximumSourceMs !== 5_000 ||
    performance.limits.maximumProjectionMs !== 1_000 ||
    performance.limits.maximumMountMs !== 5_000 ||
    !Number.isFinite(performance.sourceMs) ||
    performance.sourceMs < 0 ||
    performance.sourceMs > performance.limits.maximumSourceMs ||
    !Number.isFinite(performance.projectionMs) ||
    performance.projectionMs < 0 ||
    performance.projectionMs >
      performance.limits.maximumProjectionMs ||
    !Number.isFinite(performance.mountMs) ||
    performance.mountMs < 0 ||
    performance.mountMs > performance.limits.maximumMountMs
  ) {
    throw new Error(
      "product-scale BIM federation budget evidence is invalid",
    );
  }
  const browser = evidence.browser;
  if (
    browser?.environment?.headless !== true ||
    browser.environment.webgl2 !==
      "actual Browser API via SwiftShader" ||
    browser.environment.physicalGpuClaimed !== false ||
    !equalJson(
      browser.federation?.sourceSlots,
      PRODUCT_SOURCE_SLOTS,
    ) ||
    browser.federation.sourceIdentityMerged !== false ||
    browser.federation.distinctCompositeNativeIds !== 53 ||
    browser.federation
      .largestDuplicateGlobalIdOccurrences !== 2 ||
    browser.renderer?.backend !== "webgl2" ||
    browser.renderer.actualGpu !== true ||
    browser.renderer.rendered !== true ||
    browser.renderer.glError !== 0 ||
    browser.renderer.nonBackgroundPixels <= 0 ||
    browser.renderer.selectedInstances !== 1 ||
    browser.renderer.highlightedInstances !== 1 ||
    browser.renderer.highlightPixels <= 0 ||
    browser.renderer.sourceReadBytes !==
      PRODUCT_METRICS.sourceReadBytes ||
    browser.renderer.sourceReads !== PRODUCT_METRICS.sourceReads ||
    browser.renderer.geometryPayloadBytes !==
      PRODUCT_METRICS.geometryPayloadBytes ||
    browser.renderer.geometryRecords !==
      PRODUCT_METRICS.geometryRecords ||
    browser.renderer.uniqueTriangles !==
      PRODUCT_METRICS.uniqueTriangles ||
    browser.renderer.instances !== PRODUCT_METRICS.instances ||
    browser.renderer.instancedTriangles !==
      PRODUCT_METRICS.instancedTriangles ||
    browser.renderer.drawCalls !== PRODUCT_METRICS.drawCalls ||
    browser.renderer.cpuStagingBytes !==
      PRODUCT_METRICS.cpuStagingBytes ||
    browser.renderer.uploadedBytes !==
      PRODUCT_METRICS.uploadedBytes ||
    browser.range?.clientReads !== PRODUCT_METRICS.sourceReads ||
    browser.range.clientBytes !== PRODUCT_METRICS.sourceReadBytes ||
    browser.range.serverRequests !== PRODUCT_METRICS.sourceReads ||
    browser.range.serverBytes !== PRODUCT_METRICS.sourceReadBytes ||
    browser.cleanup?.releasedBytes !== PRODUCT_METRICS.uploadedBytes ||
    browser.cleanup.rendererDisposed !== true ||
    browser.cleanup.sessionDisposed !== true ||
    browser.cleanup.backendDisposed !== true ||
    browser.cleanup.activeBackendBytes !== 0 ||
    browser.cleanup.residentRanges !== 0 ||
    !equalJson(browser.network?.externalOrigins, []) ||
    !equalJson(browser.network?.runtimeErrors, [])
  ) {
    throw new Error(
      "product-scale BIM federation Browser evidence is invalid",
    );
  }
  if (
    evidence.sourceCleanup?.projectionDisposed !== true ||
    evidence.sourceCleanup.projectionOwnsSourceSessions !== false ||
    evidence.sourceCleanup.underlyingSessionsRemainUsable !== true ||
    evidence.sourceCleanup.federationReleasedSources !== 3 ||
    evidence.sourceCleanup.federationDisposed !== true ||
    evidence.sourceCleanup.sessionsDisposed !== 3 ||
    evidence.sourceCleanup.sourcesDisposed !== 3 ||
    !equalJson(evidence.sourceCleanup.sourceStates, [
      {
        format: "ifc",
        rangeReads: 2,
        rangeBytesRead: 1_992,
        remainingReadBytes: 0,
      },
      {
        format: "ifc",
        rangeReads: 2,
        rangeBytesRead: 1_992,
        remainingReadBytes: 0,
      },
      {
        format: "glb",
        rangeReads: 34,
        rangeBytesRead: 33_792_824,
        remainingReadBytes: 0,
      },
    ]) ||
    !equalJson(
      Object.keys(plainRecord(
        evidence.assertions,
        "product-scale BIM federation assertions",
      )),
      PRODUCT_ASSERTION_KEYS,
    ) ||
    Object.values(evidence.assertions)
      .some((value) => value !== true) ||
    evidence.decision?.productScaleFederationPerformance !==
      "passed-experimental" ||
    evidence.decision.simultaneousMultiSourceFrame !==
      "passed-two-generated-ifc-and-product-scale-glb" ||
    evidence.decision.browserWebGl2 !== "passed-swiftshader" ||
    evidence.decision.physicalGpu !== "not-claimed" ||
    evidence.decision.surveyedDatumTransformation !==
      "not-claimed" ||
    evidence.decision.actualSpatialConsumer !==
      "not-qualified-by-this-evidence" ||
    evidence.decision.actualMultiFormatUserDemand !==
      "not-qualified-by-this-evidence" ||
    evidence.decision.write !== false ||
    evidence.decision.roundTrip !== false ||
    evidence.decision.productionClaims !== false ||
    !Array.isArray(evidence.limitations) ||
    evidence.limitations.length < 6 ||
    /(?:\/Users\/|\/Volumes\/|[A-Z]:\\)/u.test(
      JSON.stringify(evidence),
    )
  ) {
    throw new Error(
      "product-scale BIM federation cleanup or decision evidence is invalid",
    );
  }
}

export function validateBimFederationProductScalePlatformCompatibility(
  matrix,
) {
  const result =
    validateBimFederationProductScalePlatformMatrix(matrix, {
      commit: PRODUCT_PLATFORM_COMMIT,
      runId: PRODUCT_PLATFORM_RUN_ID,
      validateObservation:
        validateBimFederationProductScaleEvidence,
    });
  if (
    result.projectionSha256 !==
      PRODUCT_PLATFORM_PROJECTION_SHA256
  ) {
    throw new Error(
      "product-scale federation platform projection differs",
    );
  }
  const expectedEnvironments = {
    "darwin-arm64": {
      browser: "Google Chrome 150.0.7871.187",
      maximumResidentSetSizeBytes: 560_037_888,
      sourceMs: 564.1052919999997,
      projectionMs: 11.439875000000029,
      mountMs: 52.198875000000044,
    },
    "linux-x64": {
      browser: "Google Chrome 150.0.7871.128",
      maximumResidentSetSizeBytes: 397_070_336,
      sourceMs: 492.673251,
      projectionMs: 5.437735999999973,
      mountMs: 49.99380599999995,
    },
  };
  for (const observation of matrix.platforms) {
    const platform = observation.browser.environment.platform;
    const expected = expectedEnvironments[platform];
    if (
      expected === undefined ||
      observation.browser.environment.browser !==
        expected.browser ||
      observation.headless.memory.maximumResidentSetSizeBytes !==
        expected.maximumResidentSetSizeBytes ||
      observation.headless.performance.sourceMs !==
        expected.sourceMs ||
      observation.headless.performance.projectionMs !==
        expected.projectionMs ||
      observation.headless.performance.mountMs !==
        expected.mountMs ||
      observation.browser.renderer.nonBackgroundPixels !== 20_564 ||
      observation.browser.renderer.highlightPixels !== 1_604 ||
      observation.browser.network.requestCount !== 31
    ) {
      throw new Error(
        "product-scale federation platform runner observation differs",
      );
    }
  }
  return result;
}

export function validateBimFederationCompatibility(
  manifest,
  evidence,
  productScaleEvidence,
  productScalePlatformEvidence,
) {
  plainRecord(manifest, "BIM federation manifest");
  validateBimFederationEvidence(evidence);
  validateBimFederationProductScaleEvidence(
    productScaleEvidence,
  );
  const platformResult =
    validateBimFederationProductScalePlatformCompatibility(
      productScalePlatformEvidence,
    );
  if (
    manifest.schema !==
      "bim-explorer-federation-compatibility/1" ||
    manifest.status !== "experimental" ||
    manifest.asOf !== "2026-08-08" ||
    !equalJson(manifest.contract, CONTRACT)
  ) {
    throw new Error(
      "BIM federation compatibility identity is invalid",
    );
  }
  const gates = plainRecord(
    manifest.gates,
    "BIM federation gates",
  );
  for (const gate of TRUE_GATES) {
    if (gates[gate] !== true) {
      throw new Error(
        `BIM federation gate ${gate} must pass`,
      );
    }
  }
  for (const gate of HELD_GATES) {
    if (gates[gate] !== false) {
      throw new Error(
        `BIM federation gate ${gate} must remain held`,
      );
    }
  }
  if (
    Object.keys(gates).length !==
      TRUE_GATES.length + HELD_GATES.length ||
    !Array.isArray(manifest.blockers) ||
    manifest.blockers.length !== HELD_GATES.length ||
    !Array.isArray(manifest.limitations) ||
    manifest.limitations.length < 5 ||
    manifest.evidence?.syntheticFederation !==
      "compatibility/evidence/" +
        "bim-federation-synthetic-2026-08-04.json" ||
    manifest.evidence?.sourceMetadata !==
      "compatibility/evidence/" +
        "bim-model-source-metadata-2026-08-04.json" ||
    manifest.evidence?.gltfReferenceSource !==
      "compatibility/evidence/" +
        "gltf-reference-source-khronos-box-2026-08-04.json" ||
    manifest.evidence?.gltfBrowserWebGl2 !==
      "compatibility/evidence/" +
        "gltf-reference-source-khronos-box-browser-webgl2-2026-08-04.json" ||
    manifest.evidence?.gltfProductScaleReference !==
      "compatibility/evidence/" +
        "gltf-reference-source-a-beautiful-game-product-scale-2026-08-08.json" ||
    manifest.evidence?.productScaleFederation !==
      "compatibility/evidence/" +
        "bim-federation-product-scale-2026-08-08.json" ||
    manifest.evidence?.productScaleFederationPlatformMatrix !==
      PRODUCT_PLATFORM_EVIDENCE_PATH
  ) {
    throw new Error(
      "BIM federation Gate inventory is invalid",
    );
  }
  const policy = plainRecord(
    manifest.policy,
    "BIM federation policy",
  );
  if (
    policy.readOnly !== true ||
    policy.mergeNativeIdentity !== false ||
    policy.allowImplicitDatumTransformation !== false ||
    policy.allowNonIfcSemanticAuthority !== false ||
    policy.claimQualifiedGltfCodec !== true ||
    policy.claimProductScaleGltfReference !== true ||
    policy.claimProductScaleFederationPerformance !== true ||
    policy.claimCrossPlatformProductScaleFederation !== true ||
    policy.claimUnqualifiedReferenceCodec !== false ||
    policy.claimActualSpatialConsumer !== false ||
    policy.claimUserDemand !== false ||
    policy.claimProductionFederation !== false ||
    policy.nativeWrite !== false ||
    policy.roundTrip !== false
  ) {
    throw new Error(
      "BIM federation policy overclaims capability",
    );
  }
  return Object.freeze({
    status: manifest.status,
    passedGates: TRUE_GATES.length,
    heldGates: HELD_GATES.length,
    registeredFormats:
      evidence.referenceFormats.registered,
    qualifiedPlatforms: platformResult.passedPlatforms,
  });
}

async function main() {
  const [
    manifest,
    evidence,
    productScaleEvidence,
    productScalePlatformEvidence,
  ] = await Promise.all([
    readFile(
      "compatibility/bim-federation.json",
      "utf8",
    ).then(JSON.parse),
    readFile(
      "compatibility/evidence/" +
        "bim-federation-synthetic-2026-08-04.json",
      "utf8",
    ).then(JSON.parse),
    readFile(
      "compatibility/evidence/" +
        "bim-federation-product-scale-2026-08-08.json",
      "utf8",
    ).then(JSON.parse),
    readFile(PRODUCT_PLATFORM_EVIDENCE_PATH, "utf8")
      .then(JSON.parse),
  ]);
  const result = validateBimFederationCompatibility(
    manifest,
    evidence,
    productScaleEvidence,
    productScalePlatformEvidence,
  );
  process.stdout.write(
    `BIM federation compatibility check passed: ` +
      `${result.status}, ${result.passedGates} passed, ` +
      `${result.heldGates} held and ` +
      `${result.registeredFormats} registered formats across ` +
      `${result.qualifiedPlatforms} platforms\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url ===
    pathToFileURL(path.resolve(process.argv[1])).href
) {
  await main();
}
