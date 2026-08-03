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
];
const HELD_GATES = [
  "publicRepresentativeSourceArtifact",
  "multiRangeDeferredLoading",
  "viewerCoreConformance",
  "browserWorkerPackaging",
];
const FAIL_CLOSED_ASSERTIONS = [
  "sourceSizeLimitRejected",
  "geometryBudgetRejected",
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

export function validateBimModelSourceCompatibility(
  manifest,
  evidence,
) {
  plainRecord(manifest, "BIM model source manifest");
  plainRecord(evidence, "BIM model source evidence");
  if (
    manifest.schema !==
      "bim-explorer-bim-model-source-compatibility/1" ||
    manifest.asOf !== "2026-08-03" ||
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
    manifest.evidence !==
      "compatibility/evidence/" +
        "bim-model-source-synthetic-mapped-2026-08-03.json" ||
    !/^sha256:[0-9a-f]{64}$/u.test(
      manifest.expected?.cacheFingerprint ?? "",
    ) ||
    !SHA256.test(manifest.expected?.geometryRangeSha256 ?? "") ||
    manifest.policy?.readOnly !== true ||
    manifest.policy?.spatialAuthority !== false ||
    manifest.policy?.claimViewerCoreCompatibility !== false ||
    manifest.policy?.claimProductionIfcSupport !== false
  ) {
    throw new Error("BIM model source policy overclaims compatibility");
  }
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
      manifest.expected.cacheFingerprint ||
    evidence.sourceSnapshot?.deterministicCacheFingerprint !== true ||
    evidence.sourceSnapshot?.treeNodes !== 7
  ) {
    throw new Error("BIM model source snapshot evidence is invalid");
  }
  const geometry = evidence.sourceSnapshot.geometry;
  if (
    geometry?.products !== 2 ||
    geometry?.primitives !== 2 ||
    geometry?.uniqueGeometries !== 1 ||
    geometry?.vertices !== 34 ||
    geometry?.instancedVertices !== 68 ||
    geometry?.triangles !== 24 ||
    evidence.geometryRange?.byteLength !== 996 ||
    evidence.geometryRange?.sha256 !==
      manifest.expected.geometryRangeSha256 ||
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
    resources?.limits?.maximumRelationEntries !== 500_000 ||
    resources?.limits?.maximumTreeNodes !== 200_000 ||
    resources?.limits?.maximumMetadataBytes !== 67_108_864 ||
    resources?.observed?.sourceBytes !== 4_028 ||
    resources?.observed?.geometryBytes !== 996 ||
    resources?.observed?.metadataBytes !== 2_816 ||
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
  const serialized = JSON.stringify({ manifest, evidence });
  if (/\/Volumes\/|\/Users\/|[A-Z]:\\/u.test(serialized)) {
    throw new Error("BIM model source compatibility data exposes a path");
  }
  return Object.freeze({
    status: manifest.status,
    sourceFingerprint: evidence.sourceSnapshot.sourceFingerprint,
    cacheFingerprint: evidence.sourceSnapshot.cacheFingerprint,
    products: geometry.products,
    triangles: geometry.triangles,
    heldGates: HELD_GATES.length,
  });
}

async function main() {
  const root = process.cwd();
  const manifest = JSON.parse(await readFile(
    path.join(root, "compatibility", "bim-model-source.json"),
    "utf8",
  ));
  const evidence = JSON.parse(await readFile(
    path.join(root, manifest.evidence),
    "utf8",
  ));
  const result = validateBimModelSourceCompatibility(
    manifest,
    evidence,
  );
  console.log(
    "BIM model source compatibility check passed: " +
      `${result.status}, ${result.products} products, ` +
      `${result.triangles} triangles, ${result.heldGates} held gates`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  await main();
}
