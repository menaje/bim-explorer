import { createHash } from "node:crypto";
import path from "node:path";

import {
  WEB_IFC_SOURCE_ARTIFACT_REPORT,
} from "../adapters/web-ifc/src/measure-source-artifact.mjs";
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
  maximumTotalMs: 15_000,
  maximumProcessRssBytes: 805_306_368,
});
const EXPECTED_CACHE_FINGERPRINT =
  "sha256:b206cc72721dc7e4fd005790dc61d0c49075c5a92975e69ec0b4e1f42da86427";
const EXPECTED_RANGES = Object.freeze([
  Object.freeze({
    handleId: "range:ifc:geometry:0",
    byteLength: 4_193_868,
    maximumRequestBytes: 1_048_576,
    sha256:
      "b6882fab72a8ce041fad4b2ef2ce09ae5652c3c4141d9a36dc4dc011ae1d14a5",
  }),
  Object.freeze({
    handleId: "range:ifc:geometry:1",
    byteLength: 4_194_152,
    maximumRequestBytes: 1_048_576,
    sha256:
      "1ecd68a6a01fb40f549cb1e1039a21bc44fdae6d5707caebc0d4777d0a79bd7c",
  }),
  Object.freeze({
    handleId: "range:ifc:geometry:2",
    byteLength: 902_676,
    maximumRequestBytes: 902_676,
    sha256:
      "eb15061efde600623024c6fa9c5b4c457a412dd69f77cd381f270308008748f2",
  }),
]);

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
  if (
    report?.schema !== WEB_IFC_SOURCE_ARTIFACT_REPORT ||
    report.status !== "passed" ||
    report.engine?.id !== "web-ifc" ||
    report.engine?.version !== "0.0.77" ||
    report.engine?.backend !==
      "node-wasm-isolated-source-artifact" ||
    report.engine?.license !== "MPL-2.0" ||
    report.fixture?.id !== manifest.fixtureId ||
    report.fixture?.byteLength !== manifest.entry.byteLength ||
    report.fixture?.sha256 !== manifest.entry.sha256 ||
    report.fixture?.schema !== manifest.ifc.schema ||
    report.fixture?.profile !== "performance-only-ifc2x3"
  ) {
    throw new Error("public source artifact report identity mismatch");
  }
  const geometry = report.snapshot?.geometry;
  if (
    geometry?.products !== manifest.expected.geometryProducts ||
    geometry?.renderableProducts !== 3_504 ||
    geometry?.nonRenderableProducts !== 65 ||
    geometry?.placements !== manifest.expected.geometries ||
    geometry?.primitives !== 5_972 ||
    geometry?.uniqueGeometries !== 4_696 ||
    geometry?.emptyUniqueGeometries !== 133 ||
    geometry?.skippedEmptyGeometries !== 133 ||
    geometry?.vertices !== 297_126 ||
    geometry?.instancedVertices !== 441_206 ||
    geometry?.triangles !== manifest.expected.triangles ||
    JSON.stringify(geometry?.bounds) !== JSON.stringify({
      min: [-1, -1, -1.7],
      max: [22.95, 23.465, 13.356488],
    })
  ) {
    throw new Error("public source artifact geometry mismatch");
  }
  const resources = report.snapshot?.resources;
  if (
    report.snapshot?.sourceFingerprint !==
      `sha256:${manifest.entry.sha256}` ||
    report.snapshot?.revisionId !==
      `source-snapshot:sha256:${manifest.entry.sha256}` ||
    report.snapshot?.cacheFingerprint !==
      EXPECTED_CACHE_FINGERPRINT ||
    report.snapshot?.treeNodes !== 3_578 ||
    report.snapshot?.entities !== manifest.expected.geometryProducts ||
    resources?.limits?.maximumSourceBytes !== 67_108_864 ||
    resources?.limits?.maximumProducts !== 100_000 ||
    resources?.limits?.maximumGeometryBytes !== 268_435_456 ||
    resources?.limits?.maximumRangeBytes !== 4_194_304 ||
    resources?.limits?.maximumRanges !== 4_096 ||
    resources?.limits?.maximumRelationEntries !== 500_000 ||
    resources?.limits?.maximumTreeNodes !== 200_000 ||
    resources?.limits?.maximumMetadataBytes !== 67_108_864 ||
    resources?.observed?.sourceBytes !== manifest.entry.byteLength ||
    resources?.observed?.geometryBytes !== 9_290_696 ||
    resources?.observed?.ranges !== 3 ||
    resources?.observed?.largestRangeBytes !== 4_194_152 ||
    resources?.observed?.metadataBytes !== 10_007_872 ||
    resources?.observed?.products !==
      manifest.expected.geometryProducts ||
    resources?.observed?.relationEntries !== 30_761 ||
    resources?.observed?.treeNodes !== 3_578
  ) {
    throw new Error("public source artifact resource mismatch");
  }
  const ranges = report.snapshot?.ranges;
  if (
    JSON.stringify(ranges) !== JSON.stringify(EXPECTED_RANGES) ||
    JSON.stringify(report.snapshot?.loadPlan) !== JSON.stringify({
      firstRangeIds: ["range:ifc:geometry:0"],
      deferredRangeIds: [
        "range:ifc:geometry:1",
        "range:ifc:geometry:2",
      ],
    }) ||
    report.firstRangeRead?.handleId !== ranges[0].handleId ||
    report.firstRangeRead?.bytesRead !== ranges[0].byteLength ||
    report.firstRangeRead?.reads !== 4 ||
    report.firstRangeRead?.digestValidated !== true ||
    report.firstRangeRead?.deferredRangesUnread !== true ||
    report.firstRangeRead?.remainingReadBytes !== 5_096_828
  ) {
    throw new Error("public source artifact range plan mismatch");
  }
  if (
    report.identity?.treeEntityMatch !== true ||
    report.identity?.globalIdLookupMatch !== true ||
    report.identity?.pickLookupMatch !== true ||
    report.identity?.expressId !== 224 ||
    report.identity?.globalId !== "1nOs6Hg0v9fR$sLR1LjIyX" ||
    report.identity?.propertySetCount !== 4 ||
    report.identity?.hasType !== true ||
    report.identity?.hasContainer !== true ||
    report.nonRenderable?.count !== 65 ||
    report.nonRenderable?.samplePresent !== true ||
    report.nonRenderable?.renderId !== null ||
    report.nonRenderable?.pickId !== null ||
    report.nonRenderable?.diagnosticCodes?.length === 0 ||
    report.nonRenderable?.diagnosticCodes?.every(
      (code) => code === "empty-tessellation",
    ) !== true ||
    report.nonRenderable?.sourceIdentityLookup !== true ||
    report.failClosed?.staleRevisionRejected !== true
  ) {
    throw new Error("public source artifact identity mismatch");
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
    report.cleanup?.sessionDisposed !== true ||
    report.cleanup?.sourceDisposed !== true ||
    report.diagnostics?.length !== 0 ||
    result.receipt?.outcome !== "completed" ||
    result.receipt?.processExited !== true ||
    result.receipt?.exitCode !== 0 ||
    result.receipt?.signal !== null ||
    result.receipt?.timedOut !== false ||
    result.receipt?.cancelled !== false ||
    result.receipt?.stderrCaptured !== false ||
    result.receipt?.outputLimitExceeded !== false
  ) {
    throw new Error("public source artifact process did not clean up");
  }
  measurement(
    result.receipt.wallClockMs,
    BUDGET.timeoutMs,
    "wallClockMs",
  );
  if (/\/Volumes\/|\/Users\/|[A-Z]:\\/u.test(JSON.stringify(report))) {
    throw new Error("public source artifact report exposes a path");
  }
}

function deterministicProjection(report) {
  return {
    fixture: report.fixture,
    snapshot: report.snapshot,
    firstRangeRead: report.firstRangeRead,
    identity: report.identity,
    nonRenderable: report.nonRenderable,
    failClosed: report.failClosed,
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
    id: "web-ifc-public-source-artifact",
    executable: process.execPath,
    arguments: [
      path.resolve(
        "adapters/web-ifc/src/measure-source-artifact.mjs",
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
  const runs = [];
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const result = await runAdapterProcess(command);
    assertReport(result, manifest);
    runs.push({
      attempt,
      report: result.report,
      process: result.receipt,
    });
  }
  const projectionSha256 = runs.map(({ report }) =>
    projectionDigest(report));
  if (new Set(projectionSha256).size !== 1) {
    throw new Error("public source artifact is not deterministic");
  }
  return {
    schema:
      "bim-explorer-public-bim-model-source-evidence/0.1",
    asOf: "2026-08-04",
    status: "experimental",
    fixture: {
      id: manifest.fixtureId,
      schema: manifest.ifc.schema,
      byteLength: manifest.entry.byteLength,
      sha256: manifest.entry.sha256,
      artifactCommitted: false,
      thirdPartyContent: true,
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
    environment: {
      platform: process.platform,
      architecture: process.arch,
      node: process.version,
    },
    budget: BUDGET,
    representativeReport: runs[0].report,
    runs: runs.map(({ attempt, report, process }, index) => ({
      attempt,
      deterministicProjectionSha256: projectionSha256[index],
      performance: report.performance,
      processMemoryBytes: report.processMemoryBytes,
      process,
    })),
    conformance: {
      repeatedSnapshotIdentity: true,
      boundedMultiRangeDirectory: true,
      firstRangeReadWithoutDeferredRanges: true,
      treePropertyRenderPickIdentity: true,
      nonRenderableProductDiagnostic: true,
      staleRevisionRejected: true,
      isolatedCleanup: true,
      pathFreeReport: true,
    },
    decision: {
      publicRepresentativeSourceArtifact:
        "passed-performance-only",
      multiRangeGeometryDirectory: "passed",
      firstRenderedFrame: "blocked",
      deferredPropertyRanges: "blocked",
      viewerCoreConformance: "blocked-unresolved-upstream",
      draftProfileAdmission: "blocked",
      productionClaims: false,
    },
  };
}

process.stdout.write(`${JSON.stringify(await qualify(), null, 2)}\n`);
