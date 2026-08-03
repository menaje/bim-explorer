import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SHA256 = /^[0-9a-f]{64}$/u;
const TRUE_GATES = [
  "rawSourceFingerprint",
  "deterministicCacheFingerprint",
  "treeEntityRenderPickIdentity",
  "boundedImmutableGeometryRange",
  "staleAndMalformedRejection",
  "adapterAndSessionCleanup",
  "publicRepresentativeSourceArtifact",
  "multiRangeGeometryDirectory",
  "nonRenderableProductDiagnostic",
];
const HELD_GATES = [
  "firstRenderedFrame",
  "deferredPropertyRanges",
  "viewerCoreConformance",
  "browserWorkerPackaging",
];
const FAIL_CLOSED_ASSERTIONS = [
  "sourceSizeLimitRejected",
  "geometryBudgetRejected",
  "rangeByteLimitRejected",
  "rangeCountLimitRejected",
  "relationIndexBudgetRejected",
  "treeNodeBudgetRejected",
  "metadataBudgetRejected",
  "budgetExhaustionRejected",
  "staleRevisionRejected",
  "mismatchedPickRejected",
  "malformedRangeDigestRejected",
  "malformedRangeStructureRejected",
  "duplicateGlobalIdRejected",
];
const PUBLIC_CONFORMANCE_ASSERTIONS = [
  "repeatedSnapshotIdentity",
  "boundedMultiRangeDirectory",
  "firstRangeReadWithoutDeferredRanges",
  "treePropertyRenderPickIdentity",
  "nonRenderableProductDiagnostic",
  "staleRevisionRejected",
  "isolatedCleanup",
  "pathFreeReport",
];

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

function validateSyntheticEvidence(manifest, evidence) {
  const contract = manifest.contract;
  if (
    evidence.schema !==
      "bim-explorer-bim-model-source-evidence/0.1" ||
    evidence.asOf !== manifest.asOf ||
    evidence.status !== "passed-synthetic-only" ||
    evidence.fixture?.id !== manifest.fixture.id ||
    evidence.fixture?.byteLength !== manifest.fixture.byteLength ||
    evidence.fixture?.sha256 !== manifest.fixture.sha256 ||
    evidence.fixture?.artifactCommitted !== false ||
    evidence.fixture?.thirdPartyContent !== false ||
    evidence.adapter?.id !== manifest.adapter.id ||
    evidence.adapter?.version !== manifest.adapter.version ||
    evidence.adapter?.backend !== manifest.adapter.backend ||
    evidence.adapter?.license !== manifest.adapter.license
  ) {
    throw new Error("BIM model source evidence identity is invalid");
  }
  if (
    evidence.contract?.artifactSchema !== contract.artifactSchema ||
    evidence.contract?.sourceProtocol !== contract.sourceProtocol ||
    evidence.contract?.geometryMediaType !==
      contract.geometryMediaType ||
    evidence.contract?.viewerCoreConformance !== false ||
    evidence.sourceSnapshot?.sourceFingerprint !==
      `sha256:${manifest.fixture.sha256}` ||
    evidence.sourceSnapshot?.revisionId !==
      `source-snapshot:sha256:${manifest.fixture.sha256}` ||
    evidence.sourceSnapshot?.cacheFingerprint !==
      manifest.expected.synthetic.cacheFingerprint ||
    evidence.sourceSnapshot?.deterministicCacheFingerprint !== true ||
    evidence.sourceSnapshot?.treeNodes !== 7
  ) {
    throw new Error("BIM model source snapshot evidence is invalid");
  }
  const geometry = evidence.sourceSnapshot.geometry;
  if (
    geometry?.products !== 2 ||
    geometry?.renderableProducts !== 2 ||
    geometry?.nonRenderableProducts !== 0 ||
    geometry?.placements !== 2 ||
    geometry?.primitives !== 2 ||
    geometry?.uniqueGeometries !== 1 ||
    geometry?.emptyUniqueGeometries !== 0 ||
    geometry?.skippedEmptyGeometries !== 0 ||
    geometry?.vertices !== 34 ||
    geometry?.instancedVertices !== 68 ||
    geometry?.triangles !== 24 ||
    !equalJson(geometry?.bounds, {
      min: [0, 0.9, 0],
      max: [4, 5.1, 3],
    }) ||
    evidence.geometryRange?.byteLength !== 996 ||
    evidence.geometryRange?.sha256 !==
      manifest.expected.synthetic.geometryRangeSha256 ||
    evidence.geometryRange?.maximumRequestBytes !== 128 ||
    evidence.geometryRange?.sessionReadBudgetBytes !== 996 ||
    evidence.geometryRange?.rangeReads !== 8 ||
    evidence.geometryRange?.bytesRead !== 996 ||
    evidence.geometryRange?.digestValidated !== true ||
    evidence.geometryRange?.sharedSliceOffset !== 16
  ) {
    throw new Error("BIM model source geometry evidence is invalid");
  }
  const resources = evidence.sourceSnapshot.resources;
  if (
    resources?.limits?.maximumSourceBytes !== 67_108_864 ||
    resources?.limits?.maximumProducts !== 100_000 ||
    resources?.limits?.maximumGeometryBytes !== 268_435_456 ||
    resources?.limits?.maximumRangeBytes !== 4_194_304 ||
    resources?.limits?.maximumRanges !== 4_096 ||
    resources?.limits?.maximumRelationEntries !== 500_000 ||
    resources?.limits?.maximumTreeNodes !== 200_000 ||
    resources?.limits?.maximumMetadataBytes !== 67_108_864 ||
    resources?.observed?.sourceBytes !== 4_028 ||
    resources?.observed?.geometryBytes !== 996 ||
    resources?.observed?.ranges !== 1 ||
    resources?.observed?.largestRangeBytes !== 996 ||
    resources?.observed?.metadataBytes !== 2_886 ||
    resources?.observed?.products !== 2 ||
    resources?.observed?.relationEntries !== 12 ||
    resources?.observed?.treeNodes !== 7
  ) {
    throw new Error("BIM model source resource evidence is invalid");
  }
  if (
    evidence.identity?.expressId !== 40 ||
    evidence.identity?.globalId !== "0AAAAAAAAAAAAAAAAAAA16" ||
    evidence.identity?.lookupsConverged !== true ||
    evidence.identity?.treeEntityRenderPickIdentity !== true ||
    evidence.semantics?.container?.expressId !== 19 ||
    evidence.semantics?.type?.expressId !== 55 ||
    evidence.semantics?.propertySets?.length !== 2 ||
    evidence.semantics?.materials?.[0] !== "Concrete" ||
    evidence.semantics?.classifications?.[0]?.identification !==
      "BE-WALL"
  ) {
    throw new Error("BIM model source semantic identity is invalid");
  }
  const failClosed = plainRecord(
    evidence.failClosed,
    "evidence.failClosed",
  );
  for (const assertion of FAIL_CLOSED_ASSERTIONS) {
    if (failClosed[assertion] !== true) {
      throw new Error(
        `BIM model source fail-closed assertion ${assertion} did not pass`,
      );
    }
  }
  if (
    Object.keys(failClosed).length !==
      FAIL_CLOSED_ASSERTIONS.length + 1 ||
    failClosed.sourceSizeLimitConfiguredBytes !==
      64 * 1024 * 1024 ||
    evidence.cleanup?.adapterModelClosed !== true ||
    evidence.cleanup?.adapterEngineDisposed !== true ||
    evidence.cleanup?.sessionDisposed !== true ||
    evidence.cleanup?.sourceDisposed !== true ||
    evidence.decision?.internalSourceContract !==
      "passed-synthetic-only" ||
    evidence.decision?.publicRepresentativeSourceArtifact !== "held" ||
    evidence.decision?.multiRangeDeferredLoading !== "held" ||
    evidence.decision?.viewerCoreConformance !==
      "blocked-unresolved-upstream" ||
    evidence.decision?.productionClaims !== false
  ) {
    throw new Error("BIM model source fail-closed decision is invalid");
  }
  return geometry;
}

function validatePublicRun(run, index, evidence, projectionSha256) {
  const budget = evidence.budget;
  if (
    run?.attempt !== index + 1 ||
    run.deterministicProjectionSha256 !== projectionSha256
  ) {
    throw new Error("public source repeated projection is invalid");
  }
  boundedMeasurement(
    run.performance?.artifactMs,
    budget.maximumArtifactMs,
    "public artifactMs",
  );
  boundedMeasurement(
    run.performance?.sourceMs,
    budget.maximumSourceMs,
    "public sourceMs",
  );
  boundedMeasurement(
    run.performance?.totalMs,
    budget.maximumTotalMs,
    "public totalMs",
  );
  if (
    !Number.isSafeInteger(
      run.processMemoryBytes?.maximumResidentSetSize,
    ) ||
    run.processMemoryBytes.maximumResidentSetSize <= 0 ||
    run.processMemoryBytes.maximumResidentSetSize >
      budget.maximumProcessRssBytes ||
    !Number.isSafeInteger(
      run.processMemoryBytes?.residentSetSizeAfterFirstRange,
    ) ||
    run.processMemoryBytes.residentSetSizeAfterFirstRange <= 0 ||
    !Number.isSafeInteger(
      run.processMemoryBytes?.heapUsedAfterFirstRange,
    ) ||
    run.processMemoryBytes.heapUsedAfterFirstRange <= 0 ||
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
    throw new Error("public source isolated run is invalid");
  }
  boundedMeasurement(
    run.process.wallClockMs,
    budget.timeoutMs,
    "public wallClockMs",
  );
}

function validatePublicEvidence(manifest, evidence) {
  const fixture = manifest.publicFixture;
  if (
    evidence.schema !==
      "bim-explorer-public-bim-model-source-evidence/0.1" ||
    evidence.asOf !== manifest.asOf ||
    evidence.status !== "experimental" ||
    evidence.fixture?.id !== fixture.id ||
    evidence.fixture?.schema !== fixture.schema ||
    evidence.fixture?.byteLength !== fixture.byteLength ||
    evidence.fixture?.sha256 !== fixture.sha256 ||
    evidence.fixture?.artifactCommitted !== false ||
    evidence.fixture?.thirdPartyContent !== true ||
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
    evidence.acquisition?.policy?.customerContent !== false ||
    evidence.acquisition?.policy?.bundlingApproved !== false
  ) {
    throw new Error("public BIM model source evidence identity is invalid");
  }
  const budget = evidence.budget;
  if (
    budget?.timeoutMs !== 30_000 ||
    budget?.maximumArtifactMs !== 10_000 ||
    budget?.maximumSourceMs !== 5_000 ||
    budget?.maximumTotalMs !== 15_000 ||
    budget?.maximumProcessRssBytes !== 805_306_368
  ) {
    throw new Error("public BIM model source budget is invalid");
  }
  const report = plainRecord(
    evidence.representativeReport,
    "public evidence representativeReport",
  );
  if (
    report.schema !==
      "bim-explorer-web-ifc-source-artifact-report/1" ||
    report.status !== "passed" ||
    report.engine?.id !== manifest.adapter.id ||
    report.engine?.version !== manifest.adapter.version ||
    report.engine?.backend !==
      "node-wasm-isolated-source-artifact" ||
    report.engine?.license !== manifest.adapter.license ||
    report.fixture?.id !== fixture.id ||
    report.fixture?.byteLength !== fixture.byteLength ||
    report.fixture?.sha256 !== fixture.sha256 ||
    report.fixture?.schema !== fixture.schema ||
    report.fixture?.profile !== fixture.profile
  ) {
    throw new Error("public BIM model source report identity is invalid");
  }
  const snapshot = report.snapshot;
  const expected = manifest.expected.publicRepresentative;
  if (
    snapshot?.sourceFingerprint !== `sha256:${fixture.sha256}` ||
    snapshot?.revisionId !==
      `source-snapshot:sha256:${fixture.sha256}` ||
    snapshot?.cacheFingerprint !== expected.cacheFingerprint ||
    snapshot?.treeNodes !== 3_578 ||
    snapshot?.entities !== expected.products
  ) {
    throw new Error("public BIM model source snapshot is invalid");
  }
  const geometry = snapshot.geometry;
  if (
    geometry?.products !== expected.products ||
    geometry?.renderableProducts !== expected.renderableProducts ||
    geometry?.nonRenderableProducts !==
      expected.nonRenderableProducts ||
    geometry?.placements !== 6_105 ||
    geometry?.primitives !== 5_972 ||
    geometry?.uniqueGeometries !== 4_696 ||
    geometry?.emptyUniqueGeometries !== 133 ||
    geometry?.skippedEmptyGeometries !== 133 ||
    geometry?.vertices !== 297_126 ||
    geometry?.instancedVertices !== 441_206 ||
    geometry?.triangles !== expected.triangles ||
    !equalJson(geometry?.bounds, {
      min: [-1, -1, -1.7],
      max: [22.95, 23.465, 13.356488],
    })
  ) {
    throw new Error("public BIM model source geometry is invalid");
  }
  const resources = snapshot.resources;
  if (
    !equalJson(resources?.limits, {
      maximumSourceBytes: 67_108_864,
      maximumProducts: 100_000,
      maximumGeometryBytes: 268_435_456,
      maximumRangeBytes: 4_194_304,
      maximumRanges: 4_096,
      maximumRelationEntries: 500_000,
      maximumTreeNodes: 200_000,
      maximumMetadataBytes: 67_108_864,
    }) ||
    !equalJson(resources?.observed, {
      sourceBytes: 46_766_968,
      geometryBytes: 9_290_696,
      ranges: 3,
      largestRangeBytes: 4_194_152,
      metadataBytes: 10_007_872,
      products: 3_569,
      relationEntries: 30_761,
      treeNodes: 3_578,
    })
  ) {
    throw new Error("public BIM model source resources are invalid");
  }
  if (
    !Array.isArray(snapshot.ranges) ||
    snapshot.ranges.length !== expected.ranges.length
  ) {
    throw new Error("public BIM model source ranges are invalid");
  }
  for (let index = 0; index < expected.ranges.length; index += 1) {
    const actual = snapshot.ranges[index];
    const pinned = expected.ranges[index];
    if (
      actual?.handleId !== pinned.handleId ||
      actual?.byteLength !== pinned.byteLength ||
      actual?.sha256 !== pinned.sha256 ||
      actual?.maximumRequestBytes !==
        Math.min(1_048_576, pinned.byteLength)
    ) {
      throw new Error(
        `public BIM model source range ${index} is invalid`,
      );
    }
  }
  if (
    !equalJson(snapshot.loadPlan, {
      firstRangeIds: ["range:ifc:geometry:0"],
      deferredRangeIds: [
        "range:ifc:geometry:1",
        "range:ifc:geometry:2",
      ],
    }) ||
    report.firstRangeRead?.handleId !==
      expected.ranges[0].handleId ||
    report.firstRangeRead?.reads !== 4 ||
    report.firstRangeRead?.bytesRead !==
      expected.ranges[0].byteLength ||
    report.firstRangeRead?.sha256 !==
      expected.ranges[0].sha256 ||
    report.firstRangeRead?.digestValidated !== true ||
    report.firstRangeRead?.deferredRangesUnread !== true ||
    report.firstRangeRead?.remainingReadBytes !== 5_096_828
  ) {
    throw new Error("public BIM model source load plan is invalid");
  }
  if (
    report.identity?.expressId !== 224 ||
    report.identity?.globalId !== "1nOs6Hg0v9fR$sLR1LjIyX" ||
    report.identity?.renderId !==
      "render:ifc:5c73cdd02b3add09:224" ||
    report.identity?.pickId !== "pick:ifc:5c73cdd02b3add09:224" ||
    report.identity?.propertySetCount !== 4 ||
    report.identity?.hasType !== true ||
    report.identity?.hasContainer !== true ||
    report.identity?.treeEntityMatch !== true ||
    report.identity?.globalIdLookupMatch !== true ||
    report.identity?.pickLookupMatch !== true ||
    report.nonRenderable?.count !== 65 ||
    report.nonRenderable?.samplePresent !== true ||
    report.nonRenderable?.sampleExpressId !== 49_207 ||
    report.nonRenderable?.sampleGlobalId !==
      "1A9aTEU4z9SwaqEUwI8Lx4" ||
    report.nonRenderable?.renderId !== null ||
    report.nonRenderable?.pickId !== null ||
    !Array.isArray(report.nonRenderable?.diagnosticCodes) ||
    report.nonRenderable.diagnosticCodes.length === 0 ||
    !report.nonRenderable.diagnosticCodes.every(
      (code) => code === "empty-tessellation",
    ) ||
    report.nonRenderable?.sourceIdentityLookup !== true ||
    report.failClosed?.staleRevisionRejected !== true ||
    report.cleanup?.adapterModelClosed !== true ||
    report.cleanup?.adapterEngineDisposed !== true ||
    report.cleanup?.sessionDisposed !== true ||
    report.cleanup?.sourceDisposed !== true ||
    !Array.isArray(report.diagnostics) ||
    report.diagnostics.length !== 0
  ) {
    throw new Error("public BIM model source identity is invalid");
  }
  for (const assertion of PUBLIC_CONFORMANCE_ASSERTIONS) {
    if (evidence.conformance?.[assertion] !== true) {
      throw new Error(
        `public source conformance ${assertion} did not pass`,
      );
    }
  }
  if (
    Object.keys(evidence.conformance ?? {}).length !==
      PUBLIC_CONFORMANCE_ASSERTIONS.length ||
    evidence.decision?.publicRepresentativeSourceArtifact !==
      "passed-performance-only" ||
    evidence.decision?.multiRangeGeometryDirectory !== "passed" ||
    evidence.decision?.firstRenderedFrame !== "blocked" ||
    evidence.decision?.deferredPropertyRanges !== "blocked" ||
    evidence.decision?.viewerCoreConformance !==
      "blocked-unresolved-upstream" ||
    evidence.decision?.draftProfileAdmission !== "blocked" ||
    evidence.decision?.productionClaims !== false
  ) {
    throw new Error("public BIM model source decision is invalid");
  }
  boundedMeasurement(
    report.performance?.artifactMs,
    budget.maximumArtifactMs,
    "representative artifactMs",
  );
  boundedMeasurement(
    report.performance?.sourceMs,
    budget.maximumSourceMs,
    "representative sourceMs",
  );
  boundedMeasurement(
    report.performance?.totalMs,
    budget.maximumTotalMs,
    "representative totalMs",
  );
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
    throw new Error("public source repeated runs are invalid");
  }
  evidence.runs.forEach((run, index) =>
    validatePublicRun(run, index, evidence, projectionSha256));
  return geometry;
}

export function validateBimModelSourceCompatibility(
  manifest,
  syntheticEvidence,
  publicEvidence,
) {
  plainRecord(manifest, "BIM model source manifest");
  plainRecord(syntheticEvidence, "synthetic BIM source evidence");
  plainRecord(publicEvidence, "public BIM source evidence");
  if (
    manifest.schema !==
      "bim-explorer-bim-model-source-compatibility/1" ||
    manifest.asOf !== "2026-08-04" ||
    manifest.status !== "experimental"
  ) {
    throw new Error("BIM model source manifest identity is invalid");
  }
  const contract = plainRecord(manifest.contract, "manifest.contract");
  if (
    contract.artifactSchema !==
      "bim-explorer-bim-source-artifact/0.1" ||
    contract.sourceProtocol !== "bim-explorer-bim-source/0.1" ||
    contract.geometryMediaType !==
      "application/vnd.bim-explorer.geometry-range.v1"
  ) {
    throw new Error("BIM model source contract identity is invalid");
  }
  const gates = plainRecord(manifest.gates, "manifest.gates");
  for (const gate of TRUE_GATES) {
    if (gates[gate] !== true) {
      throw new Error(`BIM model source gate ${gate} must pass`);
    }
  }
  for (const gate of HELD_GATES) {
    if (gates[gate] !== false) {
      throw new Error(`BIM model source gate ${gate} must remain held`);
    }
  }
  if (
    Object.keys(gates).length !== TRUE_GATES.length + HELD_GATES.length ||
    !Array.isArray(manifest.blockers) ||
    manifest.blockers.length !== HELD_GATES.length ||
    !manifest.blockers.every((blocker) =>
      typeof blocker === "string" && blocker.length > 0) ||
    manifest.evidence?.syntheticMapped !==
      "compatibility/evidence/" +
        "bim-model-source-synthetic-mapped-2026-08-04.json" ||
    manifest.evidence?.publicRepresentative !==
      "compatibility/evidence/" +
        "bim-model-source-public-representative-2026-08-04.json" ||
    !/^sha256:[0-9a-f]{64}$/u.test(
      manifest.expected?.synthetic?.cacheFingerprint ?? "",
    ) ||
    !SHA256.test(
      manifest.expected?.synthetic?.geometryRangeSha256 ?? "",
    ) ||
    !/^sha256:[0-9a-f]{64}$/u.test(
      manifest.expected?.publicRepresentative
        ?.cacheFingerprint ?? "",
    ) ||
    manifest.publicFixture?.profileAdmission !== false ||
    manifest.policy?.readOnly !== true ||
    manifest.policy?.spatialAuthority !== false ||
    manifest.policy?.claimViewerCoreCompatibility !== false ||
    manifest.policy?.claimProductionIfcSupport !== false
  ) {
    throw new Error("BIM model source policy overclaims compatibility");
  }
  const syntheticGeometry = validateSyntheticEvidence(
    manifest,
    syntheticEvidence,
  );
  const publicGeometry = validatePublicEvidence(
    manifest,
    publicEvidence,
  );
  const serialized = JSON.stringify({
    manifest,
    syntheticEvidence,
    publicEvidence,
  });
  if (/\/Volumes\/|\/Users\/|[A-Z]:\\/u.test(serialized)) {
    throw new Error("BIM model source compatibility data exposes a path");
  }
  return Object.freeze({
    status: manifest.status,
    sourceFingerprint:
      publicEvidence.representativeReport.snapshot.sourceFingerprint,
    cacheFingerprint:
      publicEvidence.representativeReport.snapshot.cacheFingerprint,
    products: publicGeometry.products,
    triangles: publicGeometry.triangles,
    syntheticProducts: syntheticGeometry.products,
    passedGates: TRUE_GATES.length,
    heldGates: HELD_GATES.length,
  });
}

async function main() {
  const root = process.cwd();
  const manifest = JSON.parse(await readFile(
    path.join(root, "compatibility", "bim-model-source.json"),
    "utf8",
  ));
  const syntheticEvidence = JSON.parse(await readFile(
    path.join(root, manifest.evidence.syntheticMapped),
    "utf8",
  ));
  const publicEvidence = JSON.parse(await readFile(
    path.join(root, manifest.evidence.publicRepresentative),
    "utf8",
  ));
  const result = validateBimModelSourceCompatibility(
    manifest,
    syntheticEvidence,
    publicEvidence,
  );
  console.log(
    "BIM model source compatibility check passed: " +
      `${result.status}, ${result.products} public products, ` +
      `${result.triangles} triangles, ${result.passedGates} passed and ` +
      `${result.heldGates} held gates`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  await main();
}
