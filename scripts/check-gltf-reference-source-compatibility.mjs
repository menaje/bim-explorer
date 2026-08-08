import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(await readFile(
  path.join(
    ROOT,
    "compatibility",
    "gltf-reference-source.json",
  ),
  "utf8",
));
const evidence = JSON.parse(await readFile(
  path.join(ROOT, manifest.evidence.publicKhronosBox),
  "utf8",
));
const browserEvidence = JSON.parse(await readFile(
  path.join(ROOT, manifest.evidence.browserWebGl2),
  "utf8",
));
const browserProductEvidence = JSON.parse(await readFile(
  path.join(ROOT, manifest.evidence.browserProduct),
  "utf8",
));
const vscodeProductEvidence = JSON.parse(await readFile(
  path.join(ROOT, manifest.evidence.vscodeProduct),
  "utf8",
));
const vscodeInstallEvidence = JSON.parse(await readFile(
  path.join(ROOT, manifest.evidence.vscodeCleanInstall),
  "utf8",
));
const federationEvidence = JSON.parse(await readFile(
  path.join(ROOT, manifest.evidence.federation),
  "utf8",
));
const fixture = JSON.parse(await readFile(
  path.join(ROOT, manifest.evidence.fixtureManifest),
  "utf8",
));

const trueGates = [
  "gltf2Container",
  "glb2Container",
  "embeddedBufferOnly",
  "boundedParser",
  "boundedRangeSession",
  "nodeHierarchyTransforms",
  "indexedTriangleGeometry",
  "sourceNativeIdentity",
  "noInventedIfcGlobalId",
  "referenceOnlyAuthority",
  "genericHeadlessRenderer",
  "officialKhronosValidator",
  "publicKhronosFixture",
  "dependencyLicenseAndIntegrity",
  "deterministicCleanup",
  "browserWebGl2",
  "federationReferenceAdmission",
  "browserProductOpen",
  "vscodeProductOpen",
  "crossPlatformProductOpen",
];
const heldGates = [
  "externalResourceBundle",
  "requiredExtensions",
  "write",
  "roundTrip",
  "bimSemanticAuthority",
];
const assertions = [
  "officialValidatorZeroIssues",
  "exactValidatorArtifact",
  "publicFixtureDigestVerified",
  "boundedRangeReads",
  "geometryPrimitiveConformance",
  "sourceNativeIdentity",
  "noInventedIfcGlobalId",
  "referenceOnlyAuthority",
  "headlessRendererMount",
  "deterministicCleanup",
  "artifactNotTrackedOrBundled",
  "pathFreeEvidence",
];

function everyTrue(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0 &&
    Object.values(value).every((item) => item === true)
  );
}

function exactReferenceFixture(value) {
  return (
    value?.id === fixture.fixtureId &&
    value?.committed === false &&
    value?.format === "glb" &&
    value?.sourceBytes === fixture.entry.byteLength &&
    value?.fingerprint === `sha256:${fixture.entry.sha256}` &&
    value?.gltfVersion === fixture.expected.gltfVersion &&
    value?.nativeId ===
      "node:1/mesh:0/primitive:0" &&
    value?.provenance?.repository ===
      fixture.provenance.repository &&
    value?.provenance?.commit === fixture.provenance.commit &&
    value?.provenance?.license === fixture.license.spdx &&
    value?.provenance?.bundled === false
  );
}

function exactReferenceObservation(value, hostKind) {
  return (
    value?.hostKind === hostKind &&
    JSON.stringify(value?.model) === JSON.stringify({
      entities: 1,
      geometryRecords: 1,
      instances: 1,
      triangles: 12,
      ranges: 1,
    }) &&
    value?.resources?.sourceBytes === 1_664 &&
    value?.resources?.geometryBytes === 756 &&
    value?.resources?.metadataBytes === 1_093 &&
    value?.resources?.detailBytes === 0 &&
    value?.resources?.detailRanges === 0 &&
    value?.resources?.largestDetailRangeBytes === 0 &&
    value?.resources?.ranges === 1 &&
    value?.resources?.products === 0 &&
    value?.resources?.referenceEntities === 1 &&
    value?.renderer?.actualGpu === true &&
    value?.renderer?.nonBackgroundPixels > 0 &&
    value?.renderer?.sourceReadBytes === 756 &&
    value?.renderer?.uploadedBytes === 800 &&
    value?.reference?.globalId === null &&
    value?.reference?.selectedNativeId ===
      "node:1/mesh:0/primitive:0" &&
    value?.reference?.treeRows === 1 &&
    value?.reference?.maximumDomRows === 64 &&
    value?.lifecycle?.opened === "ready" &&
    value?.lifecycle?.closed === "disposed"
  );
}

if (
  manifest.schema !==
    "bim-explorer-gltf-reference-source-compatibility/1" ||
  manifest.status !== "experimental" ||
  manifest.asOf !== "2026-08-08" ||
  manifest.contract !==
    "bim-explorer-gltf-reference-source/0.1" ||
  trueGates.some((name) => manifest.gates[name] !== true) ||
  heldGates.some((name) => manifest.gates[name] !== false) ||
  manifest.policy.readOnly !== true ||
  manifest.policy.networkAtRuntime !== false ||
  manifest.policy.allowExternalUri !== false ||
  manifest.policy.inventIfcGlobalId !== false ||
  manifest.policy.allowBimSemanticAuthority !== false ||
  manifest.policy.nativeWrite !== false ||
  manifest.policy.roundTrip !== false ||
  manifest.policy.claimProductSupport !== true ||
  manifest.policy.claimCrossPlatformProductOpen !== true ||
  manifest.policy.claimProduction !== false ||
  !Array.isArray(manifest.blockers) ||
  manifest.blockers.length !== 2 ||
  manifest.evidence.browserProduct !==
    "compatibility/evidence/" +
      "gltf-reference-source-khronos-box-browser-product-2026-08-04.json" ||
  manifest.evidence.vscodeProduct !==
    "compatibility/evidence/" +
      "bim-product-shell-vscode-synthetic-2026-08-04.json" ||
  manifest.evidence.vscodeCleanInstall !==
    "compatibility/evidence/" +
      "bim-product-shell-vscode-vsix-install-2026-08-04.json" ||
  manifest.evidence.productPlatformMatrix !==
    "compatibility/evidence/" +
      "gltf-product-platform-matrix-2026-08-08.json" ||
  evidence.schema !==
    "bim-explorer-gltf-reference-source-qualification/1" ||
  evidence.contract !== manifest.contract ||
  evidence.fixture.sha256 !== fixture.entry.sha256 ||
  evidence.fixture.commit !== fixture.provenance.commit ||
  evidence.fixture.license !== fixture.license.spdx ||
  evidence.fixture.artifactTracked !== false ||
  evidence.fixture.releaseBundled !== false ||
  evidence.validator.package !== "gltf-validator" ||
  evidence.validator.version !== "2.0.0-dev.3.10" ||
  evidence.validator.license !== "Apache-2.0" ||
  evidence.validator.issues.errors !== 0 ||
  evidence.validator.issues.warnings !== 0 ||
  evidence.validator.issues.infos !== 0 ||
  evidence.validator.issues.hints !== 0 ||
  evidence.validator.issues.truncated !== false ||
  evidence.source.format !== "glb" ||
  evidence.source.sourceRole !==
    "derived-or-reference-mesh" ||
  evidence.source.semanticAuthority !== false ||
  evidence.source.writeAuthority !== false ||
  evidence.source.roundTripAuthority !== false ||
  evidence.geometry.records !== 1 ||
  evidence.geometry.instances !== 1 ||
  evidence.geometry.vertices !== 24 ||
  evidence.geometry.triangles !== 12 ||
  evidence.identity.globalId !== null ||
  evidence.identity.entityResolved !== true ||
  evidence.identity.pickResolved !== true ||
  evidence.renderer.backend !== "headless" ||
  evidence.renderer.rendered !== false ||
  evidence.renderer.instances !== 1 ||
  evidence.renderer.instancedTriangles !== 12 ||
  evidence.cleanup.rendererDisposed !== true ||
  evidence.cleanup.sessionDisposed !== true ||
  evidence.cleanup.sourceDisposed !== true ||
  evidence.cleanup.activeBackendBytes !== 0 ||
  evidence.cleanup.residentRanges !== 0 ||
  assertions.some((name) =>
    evidence.assertions[name] !== true) ||
  browserEvidence.schema !==
    "bim-explorer-gltf-browser-webgl2-qualification/1" ||
  browserEvidence.contract !== manifest.contract ||
  browserEvidence.fixture.sha256 !== fixture.entry.sha256 ||
  browserEvidence.fixture.license !== fixture.license.spdx ||
  browserEvidence.fixture.artifactTracked !== false ||
  browserEvidence.fixture.releaseBundled !== false ||
  browserEvidence.environment.headless !== true ||
  browserEvidence.environment.physicalGpuClaimed !== false ||
  browserEvidence.source.format !== "glb" ||
  browserEvidence.source.semanticAuthority !== false ||
  browserEvidence.identity.globalId !== null ||
  browserEvidence.identity.pickedGlobalId !== null ||
  browserEvidence.identity.nativeId !==
    browserEvidence.identity.pickedNativeId ||
  browserEvidence.renderer.backend !== "webgl2" ||
  browserEvidence.renderer.actualGpu !== true ||
  browserEvidence.renderer.rendered !== true ||
  browserEvidence.renderer.glError !== 0 ||
  browserEvidence.renderer.nonBackgroundPixels <= 0 ||
  browserEvidence.renderer.uploadedBytes !== 800 ||
  browserEvidence.renderer.drawCalls !== 1 ||
  browserEvidence.renderer.instances !== 1 ||
  browserEvidence.renderer.triangles !== 12 ||
  browserEvidence.renderer.sourceReadBytes !== 756 ||
  browserEvidence.renderer.sourceReads !== 3 ||
  browserEvidence.renderer.selectedInstances !== 1 ||
  browserEvidence.renderer.highlightPixels <= 0 ||
  browserEvidence.picking.status !== "hit" ||
  browserEvidence.picking.actualGpu !== true ||
  browserEvidence.picking.temporaryReleased !== true ||
  browserEvidence.range.clientReads !== 3 ||
  browserEvidence.range.clientBytes !== 756 ||
  browserEvidence.range.serverRequests !== 3 ||
  browserEvidence.range.serverBytes !== 756 ||
  browserEvidence.cleanup.releasedBytes !== 800 ||
  browserEvidence.cleanup.rendererDisposed !== true ||
  browserEvidence.cleanup.sessionDisposed !== true ||
  browserEvidence.cleanup.backendDisposed !== true ||
  browserEvidence.cleanup.activeBackendBytes !== 0 ||
  browserEvidence.cleanup.residentRanges !== 0 ||
  browserEvidence.network.externalOrigins.length !== 0 ||
  browserEvidence.network.runtimeErrors.length !== 0 ||
  Object.values(browserEvidence.assertions)
    .some((value) => value !== true) ||
  browserProductEvidence.schema !==
    "bim-explorer-product-shell-browser-evidence/1" ||
  browserProductEvidence.environment?.headless !== true ||
  !exactReferenceFixture(browserProductEvidence.fixture) ||
  !exactReferenceObservation(
    browserProductEvidence.observation,
    "browser",
  ) ||
  browserProductEvidence.observation?.interaction
    ?.selectedNativeId !==
      "node:1/mesh:0/primitive:0" ||
  browserProductEvidence.observation?.interaction
    ?.selectionOrigin !== "3d" ||
  browserProductEvidence.observation?.network
    ?.externalOrigins?.length !== 0 ||
  browserProductEvidence.observation?.runtimeErrors
    ?.length !== 0 ||
  browserProductEvidence.observation?.lifecycle
    ?.backendDisposed !== true ||
  browserProductEvidence.observation?.lifecycle
    ?.clientDisposed !== true ||
  !everyTrue(browserProductEvidence.assertions) ||
  browserProductEvidence.decision?.referenceProductOpen !==
    "passed-bounded-read-only" ||
  browserProductEvidence.decision?.actualPhysicalGpu !==
    "not-claimed" ||
  vscodeProductEvidence.schema !==
    "bim-explorer-vscode-custom-editor-evidence/1" ||
  vscodeProductEvidence.environment?.runtimeLayout !==
    "staged" ||
  !exactReferenceFixture(
    vscodeProductEvidence.referenceFixture,
  ) ||
  !exactReferenceObservation(
    vscodeProductEvidence.referenceObservation,
    "vscode-webview",
  ) ||
  vscodeProductEvidence.referenceObservation
    ?.externalUpload !== false ||
  vscodeProductEvidence.referenceObservation?.telemetry !==
    false ||
  !everyTrue(vscodeProductEvidence.referenceAssertions) ||
  vscodeInstallEvidence.schema !==
    "bim-explorer-vscode-vsix-install-evidence/1" ||
  vscodeInstallEvidence.package?.id !==
    "menaje.bim-explorer" ||
  vscodeInstallEvidence.package?.version !== "0.1.0" ||
  vscodeInstallEvidence.package?.byteLength <= 0 ||
  vscodeInstallEvidence.package?.installedRuntimeFiles !== 7 ||
  !/^[0-9a-f]{64}$/u.test(
    vscodeInstallEvidence.package?.workerBundleSha256 ?? "",
  ) ||
  vscodeInstallEvidence.environment?.cleanUserData !== true ||
  vscodeInstallEvidence.environment
    ?.cleanExtensionsDirectory !== true ||
  vscodeInstallEvidence.observation?.installedExtensions?.[0] !==
    "menaje.bim-explorer@0.1.0" ||
  vscodeInstallEvidence.observation?.association?.viewType !==
    "bimExplorer.ifcEditor" ||
  JSON.stringify(
    vscodeInstallEvidence.observation?.association?.selector,
  ) !== JSON.stringify([
    { filenamePattern: "*.ifc" },
    { filenamePattern: "*.gltf" },
    { filenamePattern: "*.glb" },
  ]) ||
  !exactReferenceFixture(
    vscodeInstallEvidence.observation?.referenceRuntime?.fixture,
  ) ||
  !exactReferenceObservation(
    vscodeInstallEvidence.observation?.referenceRuntime,
    "vscode-webview",
  ) ||
  vscodeInstallEvidence.observation?.referenceRuntime
    ?.externalUpload !== false ||
  vscodeInstallEvidence.observation?.referenceRuntime
    ?.telemetry !== false ||
  !everyTrue(vscodeInstallEvidence.assertions) ||
  vscodeInstallEvidence.decision?.referenceFixtureOpen !==
    "passed-bounded-read-only" ||
  federationEvidence.referenceMesh?.format !== "glb" ||
  federationEvidence.referenceMesh?.sourceRole !==
    "derived-or-reference-mesh" ||
  federationEvidence.referenceMesh?.semanticAuthority !==
    "not-bim-authority" ||
  federationEvidence.referenceMesh?.globalId !== null ||
  federationEvidence.referenceMesh?.selected !== true ||
  federationEvidence.referenceMesh?.write !==
    "blocked-read-only" ||
  federationEvidence.referenceMesh?.roundTrip !==
    "blocked-not-source-authority"
) {
  throw new Error(
    "glTF reference source compatibility check failed",
  );
}
const serialized = JSON.stringify({
  evidence,
  browserEvidence,
  browserProductEvidence,
  federationEvidence,
  vscodeInstallEvidence,
  vscodeProductEvidence,
});
if (
  serialized.includes("/Users/") ||
  serialized.includes("/Volumes/") ||
  serialized.includes("\\\\")
) {
  throw new Error(
    "glTF reference source evidence contains a local path",
  );
}
console.log(
  "glTF reference source compatibility check passed: " +
  `${trueGates.length} passed and ${heldGates.length} held gates`,
);
