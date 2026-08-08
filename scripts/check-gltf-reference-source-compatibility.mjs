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
const productScaleEvidence = JSON.parse(await readFile(
  path.join(ROOT, manifest.evidence.productScaleReference),
  "utf8",
));
const productScaleBrowserProductEvidence = JSON.parse(
  await readFile(
    path.join(
      ROOT,
      manifest.evidence.productScaleBrowserProduct,
    ),
    "utf8",
  ),
);
const productScaleVscodeProductEvidence = JSON.parse(
  await readFile(
    path.join(
      ROOT,
      manifest.evidence.productScaleVscodeProduct,
    ),
    "utf8",
  ),
);
const productScaleCleanVsixProductEvidence = JSON.parse(
  await readFile(
    path.join(
      ROOT,
      manifest.evidence.productScaleCleanVsixProduct,
    ),
    "utf8",
  ),
);
const fixture = JSON.parse(await readFile(
  path.join(ROOT, manifest.evidence.fixtureManifest),
  "utf8",
));
const productScaleFixture = JSON.parse(await readFile(
  path.join(
    ROOT,
    manifest.evidence.productScaleFixtureManifest,
  ),
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
  "productScaleReferenceGeometry",
  "productScaleBrowserProductOpen",
  "productScaleVscodeProductOpen",
  "productScaleCleanVsixProductOpen",
];
const heldGates = [
  "physicalGpu",
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

function exactProductScaleFixture(value) {
  return (
    value?.id === productScaleFixture.fixtureId &&
    value?.committed === false &&
    value?.format === "glb" &&
    value?.sourceBytes === productScaleFixture.entry.byteLength &&
    value?.fingerprint ===
      `sha256:${productScaleFixture.entry.sha256}` &&
    value?.gltfVersion ===
      productScaleFixture.expected.gltfVersion &&
    value?.nativeId === "node:0/mesh:0/primitive:0" &&
    value?.classification === "product-scale-reference" &&
    JSON.stringify(value?.rendererLimits) === JSON.stringify(
      productScaleFixture.browserQualification.rendererLimits,
    ) &&
    value?.provenance?.repository ===
      productScaleFixture.provenance.repository &&
    value?.provenance?.commit ===
      productScaleFixture.provenance.commit &&
    value?.provenance?.license ===
      productScaleFixture.license.spdx &&
    value?.provenance?.bundled === false
  );
}

function exactProductScaleVscodeSurface(value) {
  return (
    value?.hostKind === "vscode-webview" &&
    JSON.stringify(value?.model) === JSON.stringify({
      entities: 49,
      geometryRecords: 15,
      instances: 49,
      triangles: 573_952,
      ranges: 1,
    }) &&
    value?.resources?.sourceBytes === 42_977_928 &&
    value?.resources?.geometryBytes === 16_896_412 &&
    value?.resources?.metadataBytes === 8_988 &&
    value?.resources?.detailBytes === 0 &&
    value?.resources?.detailRanges === 0 &&
    value?.resources?.ranges === 1 &&
    value?.resources?.products === 0 &&
    value?.resources?.referenceEntities === 49 &&
    value?.renderer?.actualGpu === true &&
    value?.renderer?.nonBackgroundPixels > 0 &&
    value?.renderer?.sourceReadBytes === 16_896_412 &&
    value?.renderer?.uploadedBytes === 16_900_016 &&
    value?.reference?.globalId === null &&
    value?.reference?.selectedNativeId ===
      "node:0/mesh:0/primitive:0" &&
    value?.reference?.treeRows === 49 &&
    value?.reference?.maximumDomRows === 64 &&
    value?.lifecycle?.opened === "ready" &&
    value?.lifecycle?.closed === "disposed" &&
    value?.externalUpload === false &&
    value?.telemetry === false
  );
}

function equalProductScaleProjection(left, right) {
  return JSON.stringify({
    model: left?.model,
    resources: left?.resources,
    renderer: left?.renderer,
    reference: left?.reference,
  }) === JSON.stringify({
    model: right?.model,
    resources: right?.resources,
    renderer: right?.renderer,
    reference: right?.reference,
  });
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
  manifest.policy.claimProductScaleReferenceGeometry !== true ||
  manifest.policy.claimProductScaleBrowserProductOpen !== true ||
  manifest.policy.claimProductScaleVscodeProductOpen !== true ||
  manifest.policy.claimProductScaleCleanVsixProductOpen !== true ||
  manifest.policy.claimPhysicalGpu !== false ||
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
  manifest.evidence.productScaleReference !==
    "compatibility/evidence/" +
      "gltf-reference-source-a-beautiful-game-product-scale-2026-08-08.json" ||
  manifest.evidence.productScaleBrowserProduct !==
    "compatibility/evidence/" +
      "gltf-reference-source-a-beautiful-game-browser-product-2026-08-08.json" ||
  manifest.evidence.productScaleVscodeProduct !==
    "compatibility/evidence/" +
      "gltf-reference-source-a-beautiful-game-vscode-product-2026-08-08.json" ||
  manifest.evidence.productScaleCleanVsixProduct !==
    "compatibility/evidence/" +
      "gltf-reference-source-a-beautiful-game-vscode-vsix-product-2026-08-08.json" ||
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
    "blocked-not-source-authority" ||
  productScaleEvidence.schema !==
    "bim-explorer-gltf-product-scale-reference-qualification/1" ||
  productScaleEvidence.status !== "passed-experimental" ||
  productScaleEvidence.asOf !== "2026-08-08" ||
  productScaleEvidence.contract !== manifest.contract ||
  productScaleEvidence.fixture?.fixtureId !==
    productScaleFixture.fixtureId ||
  productScaleEvidence.fixture?.byteLength !==
    productScaleFixture.entry.byteLength ||
  productScaleEvidence.fixture?.sha256 !==
    productScaleFixture.entry.sha256 ||
  productScaleEvidence.fixture?.license !==
    productScaleFixture.license.spdx ||
  productScaleEvidence.fixture?.artifactTracked !== false ||
  productScaleEvidence.fixture?.releaseBundled !== false ||
  productScaleEvidence.fixture?.downloadOnDemand !== true ||
  productScaleEvidence.headless?.geometry?.records !== 15 ||
  productScaleEvidence.headless?.geometry?.instances !== 49 ||
  productScaleEvidence.headless?.geometry?.vertices !== 417028 ||
  productScaleEvidence.headless?.geometry?.triangles !== 573952 ||
  productScaleEvidence.headless?.geometry?.rangeBytes !== 16896412 ||
  productScaleEvidence.headless?.renderer?.instances !== 49 ||
  productScaleEvidence.headless?.renderer?.uniqueTriangles !== 573952 ||
  productScaleEvidence.headless?.renderer?.instancedTriangles !== 1499072 ||
  productScaleEvidence.headless?.renderer?.uploadedBytes !== 16900016 ||
  productScaleEvidence.headless?.cleanup?.activeBackendBytes !== 0 ||
  productScaleEvidence.headless?.cleanup?.residentRanges !== 0 ||
  productScaleEvidence.browser?.renderer?.actualGpu !== true ||
  productScaleEvidence.browser?.renderer?.nonBackgroundPixels <= 0 ||
  productScaleEvidence.browser?.renderer?.uploadedBytes !== 16900016 ||
  productScaleEvidence.browser?.network?.externalOrigins?.length !== 0 ||
  productScaleEvidence.browser?.cleanup?.activeBackendBytes !== 0 ||
  !everyTrue(productScaleEvidence.assertions) ||
  productScaleEvidence.decision?.productScaleReferenceGeometry !==
    "passed-experimental" ||
  productScaleEvidence.decision?.browserProductFileOpen !==
    "not-qualified-by-this-evidence" ||
  productScaleEvidence.decision?.vscodeProductFileOpen !==
    "not-qualified-by-this-evidence" ||
  productScaleEvidence.decision?.physicalGpu !== "not-claimed" ||
  productScaleEvidence.decision?.productionClaims !== false ||
  productScaleBrowserProductEvidence.schema !==
    "bim-explorer-product-shell-browser-evidence/1" ||
  productScaleBrowserProductEvidence.environment?.headless !== true ||
  productScaleBrowserProductEvidence.fixture?.id !==
    productScaleFixture.fixtureId ||
  productScaleBrowserProductEvidence.fixture?.committed !== false ||
  productScaleBrowserProductEvidence.fixture?.format !== "glb" ||
  productScaleBrowserProductEvidence.fixture?.sourceBytes !==
    productScaleFixture.entry.byteLength ||
  productScaleBrowserProductEvidence.fixture?.fingerprint !==
    `sha256:${productScaleFixture.entry.sha256}` ||
  productScaleBrowserProductEvidence.fixture?.gltfVersion !==
    productScaleFixture.expected.gltfVersion ||
  productScaleBrowserProductEvidence.fixture?.nativeId !==
    "node:0/mesh:0/primitive:0" ||
  productScaleBrowserProductEvidence.fixture?.provenance
    ?.repository !== productScaleFixture.provenance.repository ||
  productScaleBrowserProductEvidence.fixture?.provenance
    ?.commit !== productScaleFixture.provenance.commit ||
  productScaleBrowserProductEvidence.fixture?.provenance
    ?.license !== productScaleFixture.license.spdx ||
  productScaleBrowserProductEvidence.fixture?.provenance
    ?.bundled !== false ||
  productScaleBrowserProductEvidence.qualification
    ?.classification !== "product-scale-reference" ||
  JSON.stringify(
    productScaleBrowserProductEvidence.qualification
      ?.rendererLimits,
  ) !== JSON.stringify(
    productScaleFixture.browserQualification.rendererLimits,
  ) ||
  JSON.stringify(
    productScaleBrowserProductEvidence.observation?.model,
  ) !== JSON.stringify({
    entities: 49,
    geometryRecords: 15,
    instances: 49,
    triangles: 573_952,
    ranges: 1,
  }) ||
  productScaleBrowserProductEvidence.observation?.resources
    ?.sourceBytes !== 42_977_928 ||
  productScaleBrowserProductEvidence.observation?.resources
    ?.geometryBytes !== 16_896_412 ||
  productScaleBrowserProductEvidence.observation?.resources
    ?.referenceEntities !== 49 ||
  productScaleBrowserProductEvidence.observation?.renderer
    ?.actualGpu !== true ||
  productScaleBrowserProductEvidence.observation?.renderer
    ?.nonBackgroundPixels <= 0 ||
  productScaleBrowserProductEvidence.observation?.renderer
    ?.sourceReadBytes !== 16_896_412 ||
  productScaleBrowserProductEvidence.observation?.renderer
    ?.uploadedBytes !== 16_900_016 ||
  productScaleBrowserProductEvidence.observation?.reference
    ?.globalId !== null ||
  productScaleBrowserProductEvidence.observation?.reference
    ?.selectedNativeId !== "node:0/mesh:0/primitive:0" ||
  productScaleBrowserProductEvidence.observation?.interaction
    ?.selectionOrigin !== "3d" ||
  !/^node:\d+\/mesh:\d+\/primitive:\d+$/u.test(
    productScaleBrowserProductEvidence.observation?.interaction
      ?.selectedNativeId ?? "",
  ) ||
  productScaleBrowserProductEvidence.observation?.network
    ?.externalOrigins?.length !== 0 ||
  productScaleBrowserProductEvidence.observation?.runtimeErrors
    ?.length !== 0 ||
  productScaleBrowserProductEvidence.observation?.lifecycle
    ?.opened !== "ready" ||
  productScaleBrowserProductEvidence.observation?.lifecycle
    ?.closed !== "disposed" ||
  productScaleBrowserProductEvidence.observation?.lifecycle
    ?.backendDisposed !== true ||
  productScaleBrowserProductEvidence.observation?.lifecycle
    ?.clientDisposed !== true ||
  !everyTrue(productScaleBrowserProductEvidence.assertions) ||
  productScaleBrowserProductEvidence.decision
    ?.referenceProductOpen !== "passed-bounded-read-only" ||
  productScaleBrowserProductEvidence.decision
    ?.actualPhysicalGpu !== "not-claimed" ||
  productScaleVscodeProductEvidence.schema !==
    "bim-explorer-vscode-custom-editor-evidence/1" ||
  productScaleVscodeProductEvidence.environment
    ?.runtimeLayout !== "staged" ||
  typeof productScaleVscodeProductEvidence.environment
    ?.vscode !== "string" ||
  !exactProductScaleFixture(
    productScaleVscodeProductEvidence
      .productScaleReferenceFixture,
  ) ||
  !exactProductScaleVscodeSurface(
    productScaleVscodeProductEvidence
      .productScaleReferenceObservation,
  ) ||
  !everyTrue(productScaleVscodeProductEvidence.assertions) ||
  !everyTrue(
    productScaleVscodeProductEvidence
      .productScaleReferenceAssertions,
  ) ||
  productScaleVscodeProductEvidence.decision
    ?.vscodeCustomEditor !== "passed" ||
  productScaleVscodeProductEvidence.decision
    ?.actualPhysicalGpu !== "not-claimed" ||
  productScaleCleanVsixProductEvidence.schema !==
    "bim-explorer-vscode-vsix-install-evidence/1" ||
  productScaleCleanVsixProductEvidence.environment
    ?.cleanUserData !== true ||
  productScaleCleanVsixProductEvidence.environment
    ?.cleanExtensionsDirectory !== true ||
  productScaleCleanVsixProductEvidence.package?.id !==
    "menaje.bim-explorer" ||
  productScaleCleanVsixProductEvidence.package?.version !==
    "0.1.0" ||
  productScaleCleanVsixProductEvidence.package?.byteLength <= 0 ||
  productScaleCleanVsixProductEvidence.package
    ?.installedRuntimeFiles !== 7 ||
  !/^[0-9a-f]{64}$/u.test(
    productScaleCleanVsixProductEvidence.package
      ?.workerBundleSha256 ?? "",
  ) ||
  productScaleCleanVsixProductEvidence.observation
    ?.installedExtensions?.length !== 1 ||
  productScaleCleanVsixProductEvidence.observation
    ?.installedExtensions?.[0] !== "menaje.bim-explorer@0.1.0" ||
  productScaleCleanVsixProductEvidence.observation
    ?.association?.viewType !== "bimExplorer.ifcEditor" ||
  JSON.stringify(
    productScaleCleanVsixProductEvidence.observation
      ?.association?.selector,
  ) !== JSON.stringify([
    { filenamePattern: "*.ifc" },
    { filenamePattern: "*.gltf" },
    { filenamePattern: "*.glb" },
  ]) ||
  !exactProductScaleFixture(
    productScaleCleanVsixProductEvidence.observation
      ?.productScaleReferenceRuntime?.fixture,
  ) ||
  !exactProductScaleVscodeSurface(
    productScaleCleanVsixProductEvidence.observation
      ?.productScaleReferenceRuntime,
  ) ||
  !equalProductScaleProjection(
    productScaleVscodeProductEvidence
      .productScaleReferenceObservation,
    productScaleCleanVsixProductEvidence.observation
      ?.productScaleReferenceRuntime,
  ) ||
  !everyTrue(productScaleCleanVsixProductEvidence.assertions) ||
  productScaleCleanVsixProductEvidence.decision
    ?.cleanInstall !== "passed" ||
  productScaleCleanVsixProductEvidence.decision
    ?.publicFixtureOpen !== "not-run" ||
  productScaleCleanVsixProductEvidence.decision
    ?.referenceFixtureOpen !== "passed-bounded-read-only" ||
  productScaleCleanVsixProductEvidence.decision
    ?.productScaleReferenceFixtureOpen !==
      "passed-bounded-read-only" ||
  productScaleCleanVsixProductEvidence.decision
    ?.marketplaceRelease !== "held"
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
  productScaleEvidence,
  productScaleBrowserProductEvidence,
  productScaleCleanVsixProductEvidence,
  productScaleVscodeProductEvidence,
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
