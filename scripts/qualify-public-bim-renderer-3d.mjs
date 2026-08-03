import { createHash } from "node:crypto";
import path from "node:path";

import {
  WEB_IFC_HEADLESS_RENDERER_REPORT,
} from "../adapters/web-ifc/src/measure-headless-renderer.mjs";
import {
  runAdapterProcess,
} from "../packages/ifc-engine-contract/src/process-supervisor.mjs";
import {
  ensurePublicIfcFixture,
  loadPublicIfcFixtureManifest,
} from "./public-ifc-fixture.mjs";

const BUDGET = Object.freeze({
  timeoutMs: 30_000,
  maximumArtifactMs: 10_000,
  maximumSourceMs: 5_000,
  maximumMountMs: 2_000,
  maximumTotalMs: 15_000,
  maximumProcessRssBytes: 805_306_368,
});
const SOURCE_SHA256 =
  "5c73cdd02b3add09b30cf437eb3fe01bc4631e5a60dbaf30c0b8a7b817585bb4";
const CACHE_FINGERPRINT =
  "sha256:b206cc72721dc7e4fd005790dc61d0c49075c5a92975e69ec0b4e1f42da86427";
const EXPECTED_METRICS = Object.freeze({
  sourceReadBytes: 4_193_868,
  sourceReads: 4,
  geometryPayloadBytes: 4_144_692,
  geometryRecords: 2_458,
  vertices: 134_895,
  indices: 226_803,
  uniqueTriangles: 75_601,
  instances: 3_182,
  instancedTriangles: 127_993,
  drawCalls: 3_182,
  instanceBytes: 254_560,
  cpuStagingBytes: 4_448_428,
});

function measurement(value, maximum, label) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > maximum
  ) {
    throw new Error(`${label} exceeded ${maximum}`);
  }
}

function assertReport(result, manifest) {
  const report = result.report;
  const receipt = report?.renderer?.receipt;
  if (
    report?.schema !== WEB_IFC_HEADLESS_RENDERER_REPORT ||
    report.status !== "passed" ||
    report.fixture?.id !== manifest.fixtureId ||
    report.fixture?.byteLength !== manifest.entry.byteLength ||
    report.fixture?.sha256 !== SOURCE_SHA256 ||
    report.fixture?.schema !== manifest.ifc.schema ||
    report.fixture?.profile !== "performance-only-ifc2x3" ||
    report.adapter?.id !== "web-ifc" ||
    report.adapter?.version !== "0.0.77" ||
    report.adapter?.backend !==
      "node-wasm-isolated-headless-renderer" ||
    report.adapter?.license !== "MPL-2.0" ||
    report.snapshot?.sourceFingerprint !==
      `sha256:${SOURCE_SHA256}` ||
    report.snapshot?.revisionId !==
      `source-snapshot:sha256:${SOURCE_SHA256}` ||
    report.snapshot?.cacheFingerprint !== CACHE_FINGERPRINT
  ) {
    throw new Error("public headless renderer identity mismatch");
  }
  if (
    report.snapshot?.geometry?.products !== 3_569 ||
    report.snapshot?.geometry?.renderableProducts !== 3_504 ||
    report.snapshot?.geometry?.nonRenderableProducts !== 65 ||
    report.snapshot?.geometry?.triangles !== 261_424 ||
    JSON.stringify(report.snapshot?.loadPlan) !== JSON.stringify({
      firstRangeIds: ["range:ifc:geometry:0"],
      deferredRangeIds: [
        "range:ifc:geometry:1",
        "range:ifc:geometry:2",
      ],
    }) ||
    JSON.stringify(report.snapshot?.ranges) !== JSON.stringify([
      {
        handleId: "range:ifc:geometry:0",
        byteLength: 4_193_868,
        sha256:
          "b6882fab72a8ce041fad4b2ef2ce09ae5652c3c4141d9a36dc4dc011ae1d14a5",
      },
      {
        handleId: "range:ifc:geometry:1",
        byteLength: 4_194_152,
        sha256:
          "1ecd68a6a01fb40f549cb1e1039a21bc44fdae6d5707caebc0d4777d0a79bd7c",
      },
      {
        handleId: "range:ifc:geometry:2",
        byteLength: 902_676,
        sha256:
          "eb15061efde600623024c6fa9c5b4c457a412dd69f77cd381f270308008748f2",
      },
    ])
  ) {
    throw new Error("public headless renderer source plan mismatch");
  }
  if (
    report.renderer?.contract !==
      "bim-explorer-bim-renderer-3d-receipt/0.1" ||
    report.renderer?.backend !== "headless" ||
    report.renderer?.actualGpu !== false ||
    receipt?.status !== "mounted" ||
    JSON.stringify(receipt?.metrics) !==
      JSON.stringify(EXPECTED_METRICS) ||
    JSON.stringify(receipt?.rangeIds) !==
      JSON.stringify(["range:ifc:geometry:0"]) ||
    JSON.stringify(receipt?.deferredRangeIds) !== JSON.stringify([
      "range:ifc:geometry:1",
      "range:ifc:geometry:2",
    ]) ||
    receipt?.identity?.renderPickBoundToRevision !== true ||
    receipt?.identity?.nonRenderableInstances !== 0 ||
    receipt?.backend?.backendId !== "headless" ||
    receipt?.backend?.rendered !== false ||
    receipt?.backend?.uploadedBytes !== 4_399_252 ||
    receipt?.cpuRangeStagingReleased !== true
  ) {
    throw new Error("public headless renderer receipt mismatch");
  }
  const sourceState = report.renderer?.sourceStateAfterMount;
  if (
    sourceState?.opened !== true ||
    sourceState?.sessionDisposed !== false ||
    sourceState?.disposed !== false ||
    sourceState?.rangeReads !== 4 ||
    sourceState?.rangeBytesRead !== 4_193_868 ||
    sourceState?.remainingReadBytes !== 5_096_828 ||
    sourceState?.entityReads !== 0 ||
    sourceState?.pickResolutions !== 0 ||
    report.renderer?.rendererStateAfterMount
      ?.activeBackendBytes !== 4_399_252 ||
    report.renderer?.backendStateAfterMount
      ?.activeBytes !== 4_399_252 ||
    report.renderer?.unmountReceipt?.released !== true ||
    report.renderer?.unmountReceipt?.releasedBytes !== 4_399_252
  ) {
    throw new Error("public headless renderer lifecycle mismatch");
  }
  measurement(
    report.performance?.artifactMs,
    BUDGET.maximumArtifactMs,
    "artifactMs",
  );
  measurement(
    report.performance?.sourceMs,
    BUDGET.maximumSourceMs,
    "sourceMs",
  );
  measurement(
    report.performance?.mountMs,
    BUDGET.maximumMountMs,
    "mountMs",
  );
  measurement(
    report.performance?.totalMs,
    BUDGET.maximumTotalMs,
    "totalMs",
  );
  if (
    !Number.isSafeInteger(
      report.processMemoryBytes?.maximumResidentSetSize,
    ) ||
    report.processMemoryBytes.maximumResidentSetSize <= 0 ||
    report.processMemoryBytes.maximumResidentSetSize >
      BUDGET.maximumProcessRssBytes ||
    report.cleanup?.adapterModelClosed !== true ||
    report.cleanup?.adapterEngineDisposed !== true ||
    report.cleanup?.rendererDisposed !== true ||
    report.cleanup?.sessionDisposed !== true ||
    report.cleanup?.sourceDisposed !== true ||
    report.cleanup?.backendDisposed !== true ||
    report.cleanup?.backendActiveBytes !== 0 ||
    report.diagnostics?.length !== 0 ||
    result.receipt?.outcome !== "completed" ||
    result.receipt?.processExited !== true ||
    result.receipt?.exitCode !== 0 ||
    result.receipt?.signal !== null ||
    result.receipt?.timedOut !== false ||
    result.receipt?.cancelled !== false ||
    result.receipt?.outputLimitExceeded !== false ||
    result.receipt?.stderrCaptured !== false
  ) {
    throw new Error("public headless renderer did not clean up");
  }
  measurement(
    result.receipt.wallClockMs,
    BUDGET.timeoutMs,
    "wallClockMs",
  );
  if (/\/Volumes\/|\/Users\/|[A-Z]:\\/u.test(JSON.stringify(report))) {
    throw new Error("public headless renderer report exposes a path");
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

async function qualify() {
  const manifest = await loadPublicIfcFixtureManifest();
  const fixture = await ensurePublicIfcFixture({ manifest });
  const command = {
    id: "web-ifc-public-headless-renderer",
    executable: process.execPath,
    arguments: [
      path.resolve(
        "adapters/web-ifc/src/measure-headless-renderer.mjs",
      ),
      "--input",
      fixture.input,
      "--fixture-id",
      manifest.fixtureId,
      "--profile",
      "performance-only-ifc2x3",
    ],
    maxOutputBytes: 64 * 1024,
    timeoutMs: BUDGET.timeoutMs,
  };
  const results = [];
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const result = await runAdapterProcess(command);
    assertReport(result, manifest);
    results.push({
      attempt,
      report: result.report,
      process: result.receipt,
    });
  }
  const projectionSha256 = results.map(({ report }) =>
    projectionDigest(report));
  if (new Set(projectionSha256).size !== 1) {
    throw new Error("public headless renderer is not deterministic");
  }
  return {
    schema:
      "bim-explorer-public-bim-renderer-3d-evidence/0.1",
    asOf: "2026-08-04",
    status: "experimental-headless-only",
    fixture: {
      id: manifest.fixtureId,
      schema: manifest.ifc.schema,
      profile: "performance-only-ifc2x3",
      byteLength: manifest.entry.byteLength,
      sha256: manifest.entry.sha256,
      artifactCommitted: false,
      actualGpu: false,
      profileAdmission: false,
    },
    provenance: {
      repository: manifest.provenance.repository,
      commit: manifest.provenance.commit,
      license: manifest.provenance.license,
      attribution: manifest.provenance.attribution,
      rightsVerified: manifest.redistribution.rightsVerified,
      bundlingApproved: manifest.redistribution.bundlingApproved,
    },
    acquisition: fixture.receipt,
    budget: BUDGET,
    representativeReport: results[0].report,
    runs: results.map(({ attempt, report, process }, index) => ({
      attempt,
      deterministicProjectionSha256: projectionSha256[index],
      performance: report.performance,
      processMemoryBytes: report.processMemoryBytes,
      process,
    })),
    conformance: {
      repeatedMountIdentity: true,
      boundedInitialRangeRead: true,
      geometryPrimitiveConformance: true,
      renderPickRevisionIdentity: true,
      nonRenderableInstancesExcluded: true,
      headlessResourceAccounting: true,
      deterministicDispose: true,
      pathFreeReport: true,
    },
    decision: {
      publicRepresentativeHeadlessMount: "passed",
      visibilityDrivenFirstFrame: "blocked",
      actualGpuFirstFrame: "blocked",
      cameraInteractionPicking: "blocked",
      sectionMeasurement: "blocked",
      browserVscodeConformance: "blocked",
      viewerCoreConformance: "blocked-unresolved-upstream",
      productionClaims: false,
    },
  };
}

process.stdout.write(`${JSON.stringify(await qualify(), null, 2)}\n`);
