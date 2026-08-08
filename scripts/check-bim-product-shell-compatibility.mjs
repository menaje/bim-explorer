import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  validateLasLazBrowserProductQualification,
} from "./qualify-las-laz-browser-product.mjs";
import {
  validateLasLazVscodeProductQualification,
} from "./qualify-las-laz-vscode-product.mjs";
import {
  validateE57BrowserProductQualification,
} from "./qualify-e57-browser-product.mjs";
import {
  validateE57VscodeProductQualification,
} from "./qualify-e57-vscode-product.mjs";
import {
  validateE57SphericalBrowserProductQualification,
} from "./qualify-e57-spherical-browser-product.mjs";
import {
  validateE57SphericalVscodeProductQualification,
} from "./qualify-e57-spherical-vscode-product.mjs";
import {
  validateE57MultipleScanBrowserProductQualification,
} from "./qualify-e57-multiple-scan-browser-product.mjs";
import {
  validateE57MultipleScanVscodeProductQualification,
} from "./qualify-e57-multiple-scan-vscode-product.mjs";
import {
  validatePointCloudBrowserPickingQualification,
} from "./qualify-point-cloud-browser-picking.mjs";
import {
  validatePointCloudVscodePickingQualification,
} from "./qualify-point-cloud-vscode-picking.mjs";

const PASSED_GATES = [
  "browserLocalFileAdmission",
  "browserWorkerIsolation",
  "browserTimingAndByteDiagnostics",
  "browserSourceSwitchCancelDispose",
  "actualBrowserWebGl2",
  "vscodeReadonlyIfcAssociation",
  "vscodeWorkerLifecycle",
  "vscodePathFreeHostBridge",
  "vscodeProgressCancelRetryDiagnostics",
  "actualVscodeChromiumWebGl2",
  "sameSourceFingerprintAndProjection",
  "boundedMalformedInputIsolation",
  "symlinkAndUnintendedReadRejection",
  "editorCloseCleanup",
  "cleanVsixInstall",
  "packagedRuntimeIndependent",
  "noAccountUploadTelemetry",
  "spatialIndependent",
  "publicRepresentativeProductScale",
  "deferredSemanticDetailDiagnostics",
  "browserReadonlyGltfGlbAdmission",
  "vscodeReadonlyGltfGlbAssociation",
  "cleanVsixGltfGlbOpen",
  "crossPlatformGltfProductOpen",
  "browserProductScaleGltfOpen",
  "vscodeProductScaleGltfOpen",
  "cleanVsixProductScaleGltfOpen",
  "browserReadonlyLasLazOpen",
  "vscodeReadonlyLasLazOpen",
  "cleanVsixLasLazOpen",
  "browserReadonlyE57Open",
  "vscodeReadonlyE57Open",
  "cleanVsixE57Open",
  "browserReadonlyE57SphericalOpen",
  "vscodeReadonlyE57SphericalOpen",
  "cleanVsixE57SphericalOpen",
  "browserReadonlyE57MultipleScanOpen",
  "vscodeReadonlyE57MultipleScanOpen",
  "cleanVsixE57MultipleScanOpen",
  "browserPointIdentityPicking",
  "vscodePointIdentityPicking",
  "cleanVsixPointIdentityPicking",
];
const HELD_GATES = [
  "publicViewerCoreConformance",
  "physicalGpuQualification",
  "marketplaceRelease",
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

function everyTrue(value) {
  plainRecord(value, "product shell assertions");
  return (
    Object.keys(value).length > 0 &&
    Object.values(value).every((item) => item === true)
  );
}

function equalProjection(left, right) {
  for (const field of [
    "model",
    "resources",
    "renderer",
    "semantic",
  ]) {
    if (
      JSON.stringify(left.observation?.[field]) !==
      JSON.stringify(right.observation?.[field])
    ) {
      return false;
    }
  }
  return true;
}

function equalInstalledProjection(installedRuntime, vscode) {
  for (const field of ["model", "renderer"]) {
    if (
      JSON.stringify(installedRuntime?.[field]) !==
      JSON.stringify(vscode.observation?.[field])
    ) {
      return false;
    }
  }
  return true;
}

function equalPublicProjection(browserPublic, installedRuntime) {
  for (const field of [
    "model",
    "resources",
    "renderer",
    "semantic",
  ]) {
    if (
      JSON.stringify(browserPublic.observation?.[field]) !==
      JSON.stringify(installedRuntime?.[field])
    ) {
      return false;
    }
  }
  return true;
}

function equalReferenceProjection(left, right) {
  for (const field of [
    "model",
    "resources",
    "renderer",
    "reference",
  ]) {
    if (
      JSON.stringify(left?.[field]) !==
      JSON.stringify(right?.[field])
    ) {
      return false;
    }
  }
  return true;
}

function exactReferenceFixture(value, fixture) {
  return (
    value?.id === fixture?.id &&
    value?.committed === false &&
    value?.format === fixture?.format &&
    value?.sourceBytes === fixture?.byteLength &&
    value?.fingerprint === `sha256:${fixture?.sha256}` &&
    value?.gltfVersion === fixture?.gltfVersion &&
    value?.nativeId === fixture?.nativeId &&
    value?.provenance?.repository === fixture?.repository &&
    value?.provenance?.commit === fixture?.commit &&
    value?.provenance?.license === fixture?.license &&
    value?.provenance?.bundled === false
  );
}

function exactReferenceObservation(value, hostKind, nativeId) {
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
    value?.resources?.ranges === 1 &&
    value?.resources?.products === 0 &&
    value?.resources?.referenceEntities === 1 &&
    value?.renderer?.actualGpu === true &&
    value?.renderer?.nonBackgroundPixels > 0 &&
    value?.renderer?.sourceReadBytes === 756 &&
    value?.renderer?.uploadedBytes === 800 &&
    value?.reference?.globalId === null &&
    value?.reference?.selectedNativeId === nativeId &&
    value?.reference?.treeRows === 1 &&
    value?.reference?.maximumDomRows === 64 &&
    value?.lifecycle?.opened === "ready" &&
    value?.lifecycle?.closed === "disposed"
  );
}

function exactProductScaleReferenceSurface(value, hostKind) {
  return (
    value?.hostKind === hostKind &&
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
    value?.lifecycle?.closed === "disposed"
  );
}

function exactProductScaleReferenceObservation(value) {
  return (
    exactProductScaleReferenceSurface(value, "browser") &&
    value?.interaction?.searchResults === 1 &&
    Number.isSafeInteger(
      value?.interaction?.selectedExpressId,
    ) &&
    value.interaction.selectedExpressId > 0 &&
    /^node:\d+\/mesh:\d+\/primitive:\d+$/u.test(
      value?.interaction?.selectedNativeId ?? "",
    ) &&
    value?.interaction?.selectionOrigin === "3d"
  );
}

export function validateBimProductShellCompatibility(
  manifest,
  browser,
  vscode,
  browserPublic,
  installation,
  browserReference,
  browserProductScaleReference,
  vscodeProductScaleReference,
  vscodeCleanInstallProductScaleReference,
  lasLazBrowserProduct,
  lasLazVscodeProduct,
  e57BrowserProduct,
  e57VscodeProduct,
  e57SphericalBrowserProduct,
  e57SphericalVscodeProduct,
  e57MultipleScanBrowserProduct,
  e57MultipleScanVscodeProduct,
  pointCloudBrowserPicking,
  pointCloudVscodePicking,
) {
  plainRecord(manifest, "product shell manifest");
  plainRecord(browser, "Browser product shell evidence");
  plainRecord(vscode, "VS Code product shell evidence");
  plainRecord(
    browserPublic,
    "public Browser product shell evidence",
  );
  plainRecord(installation, "VSIX install evidence");
  plainRecord(
    browserReference,
    "reference Browser product shell evidence",
  );
  plainRecord(
    browserProductScaleReference,
    "product-scale reference Browser product shell evidence",
  );
  plainRecord(
    vscodeProductScaleReference,
    "product-scale reference VS Code product shell evidence",
  );
  plainRecord(
    vscodeCleanInstallProductScaleReference,
    "product-scale reference clean VSIX evidence",
  );
  validateLasLazBrowserProductQualification(
    lasLazBrowserProduct,
  );
  validateLasLazVscodeProductQualification(
    lasLazVscodeProduct,
  );
  validateE57BrowserProductQualification(
    e57BrowserProduct,
  );
  validateE57VscodeProductQualification(
    e57VscodeProduct,
  );
  validateE57SphericalBrowserProductQualification(
    e57SphericalBrowserProduct,
  );
  validateE57SphericalVscodeProductQualification(
    e57SphericalVscodeProduct,
  );
  validateE57MultipleScanBrowserProductQualification(
    e57MultipleScanBrowserProduct,
  );
  validateE57MultipleScanVscodeProductQualification(
    e57MultipleScanVscodeProduct,
  );
  validatePointCloudBrowserPickingQualification(
    pointCloudBrowserPicking,
  );
  validatePointCloudVscodePickingQualification(
    pointCloudVscodePicking,
  );
  if (
    manifest.schema !==
      "bim-explorer-product-shell-compatibility/1" ||
    manifest.asOf !== "2026-08-09" ||
    manifest.status !== "experimental" ||
    browser.schema !==
      "bim-explorer-product-shell-browser-evidence/1" ||
    browserPublic.schema !==
      "bim-explorer-product-shell-browser-evidence/1" ||
    browserReference.schema !==
      "bim-explorer-product-shell-browser-evidence/1" ||
    browserProductScaleReference.schema !==
      "bim-explorer-product-shell-browser-evidence/1" ||
    vscodeProductScaleReference.schema !==
      "bim-explorer-vscode-custom-editor-evidence/1" ||
    vscodeCleanInstallProductScaleReference.schema !==
      "bim-explorer-vscode-vsix-install-evidence/1" ||
    vscode.schema !==
      "bim-explorer-vscode-custom-editor-evidence/1" ||
    installation.schema !==
      "bim-explorer-vscode-vsix-install-evidence/1"
  ) {
    throw new Error(
      "BIM product shell evidence identity is invalid",
    );
  }
  const contracts = manifest.contracts;
  if (
    contracts?.hostMessage !==
      "bim-explorer-product-host-message/0.1" ||
    contracts?.shellReport !==
      "bim-explorer-product-shell-report/0.1" ||
    contracts?.sourceWorkerRequest !==
      "bim-explorer-product-source-worker-request/0.1" ||
    contracts?.sourceWorkerResponse !==
      "bim-explorer-product-source-worker-response/0.1" ||
    contracts?.sourceProtocol !==
      "bim-explorer-bim-source/0.2" ||
    contracts?.rendererHost !==
      "bim-explorer-bim-renderer-3d-host/0.1" ||
    contracts?.semanticExplorer !==
      "bim-explorer-bim-semantic-explorer/0.1" ||
    contracts?.referenceExplorer !==
      "bim-explorer-reference-mesh-explorer/0.1" ||
    contracts?.e57PointSource !==
      "bim-explorer-e57-point-source/0.1" ||
    contracts?.pointSource !==
      "bim-explorer-las-laz-point-source/0.1" ||
    contracts?.pointSourceWorkerRequest !==
      "bim-explorer-point-source-worker-request/0.1" ||
    contracts?.pointSourceWorkerResponse !==
      "bim-explorer-point-source-worker-response/0.1" ||
    contracts?.pointPickReceipt !==
      "bim-explorer-bounded-point-renderer-pick-receipt/0.1"
  ) {
    throw new Error(
      "BIM product shell contracts are invalid",
    );
  }
  const productScaleReferenceFixture =
    manifest.productScaleReferenceFixture;
  const installedProductScaleReference =
    vscodeCleanInstallProductScaleReference.observation
      ?.productScaleReferenceRuntime;
  if (
    [
      browserProductScaleReference.fixture,
      vscodeProductScaleReference
        .productScaleReferenceFixture,
      installedProductScaleReference?.fixture,
    ].some((value) =>
      !exactReferenceFixture(
        value,
        productScaleReferenceFixture,
      )) ||
    productScaleReferenceFixture?.artifactCommitted !== false ||
    productScaleReferenceFixture?.thirdPartyContent !== true ||
    productScaleReferenceFixture?.bundled !== false ||
    productScaleReferenceFixture?.classification !==
      "product-scale-reference" ||
    productScaleReferenceFixture?.byteLength !== 42_977_928 ||
    productScaleReferenceFixture?.sha256 !==
      "bd7133b4b322aae97c589b8839dae8155ad2546acb35ae32a127e722a959d007" ||
    productScaleReferenceFixture?.nativeId !==
      "node:0/mesh:0/primitive:0"
  ) {
    throw new Error(
      "product-scale reference fixture policy is invalid",
    );
  }
  const fixture = manifest.fixture;
  const expectedFingerprint = `sha256:${fixture?.sha256}`;
  const installedRuntime = installation.observation?.runtime;
  for (const evidenceFixture of [
    browser.fixture,
    vscode.fixture,
    installedRuntime?.fixture,
  ]) {
    if (
      evidenceFixture?.id !== fixture.id ||
      evidenceFixture?.sourceBytes !== fixture.byteLength ||
      evidenceFixture?.fingerprint !== expectedFingerprint ||
      evidenceFixture?.ifcSchema !== fixture.schema ||
      evidenceFixture?.committed !== false
    ) {
      throw new Error(
        "BIM product shell fixture identity is invalid",
      );
    }
  }
  if (
    fixture.profile !== "ReferenceView_V1.2" ||
    fixture.artifactCommitted !== false ||
    fixture.thirdPartyContent !== false
  ) {
    throw new Error(
      "BIM product shell fixture policy is invalid",
    );
  }
  const publicFixture = manifest.publicFixture;
  const publicFingerprint =
    `sha256:${publicFixture?.sha256}`;
  const installedPublic =
    installation.observation?.publicRuntime;
  for (const evidenceFixture of [
    browserPublic.fixture,
    installedPublic?.fixture,
  ]) {
    if (
      evidenceFixture?.id !== publicFixture?.id ||
      evidenceFixture?.sourceBytes !==
        publicFixture?.byteLength ||
      evidenceFixture?.fingerprint !== publicFingerprint ||
      evidenceFixture?.ifcSchema !== publicFixture?.schema ||
      evidenceFixture?.committed !== false ||
      evidenceFixture?.provenance?.repository !==
        publicFixture?.repository ||
      evidenceFixture?.provenance?.commit !==
        publicFixture?.commit ||
      evidenceFixture?.provenance?.license !==
        publicFixture?.license ||
      evidenceFixture?.provenance?.bundled !== false
    ) {
      throw new Error(
        "public BIM product fixture identity is invalid",
      );
    }
  }
  if (
    publicFixture?.artifactCommitted !== false ||
    publicFixture?.thirdPartyContent !== true ||
    publicFixture?.bundled !== false ||
    publicFixture?.id !==
      "public-schependomlaan-complete-ifc2x3" ||
    publicFixture?.byteLength !== 46_766_968 ||
    publicFixture?.sha256 !==
      "5c73cdd02b3add09b30cf437eb3fe01bc4631e5a60dbaf30c0b8a7b817585bb4" ||
    publicFixture?.schema !== "IFC2X3" ||
    publicFixture?.repository !==
      "buildingsmart-community/Community-Sample-Test-Files" ||
    publicFixture?.commit !==
      "7ddf57a201f88a0c213d5322b02ed15e94a60a40" ||
    publicFixture?.license !== "CC-BY-4.0" ||
    publicFixture?.profileAdmission !== false ||
    typeof browserPublic.fixture?.provenance?.cacheHit !==
      "boolean"
  ) {
    throw new Error(
      "public BIM product fixture policy is invalid",
    );
  }
  const referenceFixture = manifest.referenceFixture;
  const installedReference =
    installation.observation?.referenceRuntime;
  for (const evidenceFixture of [
    browserReference.fixture,
    vscode.referenceFixture,
    installedReference?.fixture,
  ]) {
    if (!exactReferenceFixture(
      evidenceFixture,
      referenceFixture,
    )) {
      throw new Error(
        "reference product fixture identity is invalid",
      );
    }
  }
  if (
    referenceFixture?.artifactCommitted !== false ||
    referenceFixture?.thirdPartyContent !== true ||
    referenceFixture?.bundled !== false ||
    referenceFixture?.format !== "glb" ||
    referenceFixture?.gltfVersion !== "2.0" ||
    referenceFixture?.nativeId !==
      "node:1/mesh:0/primitive:0"
  ) {
    throw new Error(
      "reference product fixture policy is invalid",
    );
  }
  const gates = plainRecord(
    manifest.gates,
    "product shell gates",
  );
  for (const gate of PASSED_GATES) {
    if (gates[gate] !== true) {
      throw new Error(
        `BIM product shell gate ${gate} must pass`,
      );
    }
  }
  for (const gate of HELD_GATES) {
    if (gates[gate] !== false) {
      throw new Error(
        `BIM product shell gate ${gate} must remain held`,
      );
    }
  }
  if (
    Object.keys(gates).length !==
      PASSED_GATES.length + HELD_GATES.length ||
    !Array.isArray(manifest.blockers) ||
    manifest.blockers.length !== HELD_GATES.length
  ) {
    throw new Error(
      "BIM product shell gate inventory is invalid",
    );
  }
  const limits = manifest.limits;
  if (
    limits?.maximumSourceBytes !== 64 * 1024 * 1024 ||
    limits?.openTimeoutMs !== 30_000 ||
    limits?.operationTimeoutMs !== 10_000 ||
    limits?.maximumRangeRequestBytes !== 1024 * 1024 ||
    limits?.maximumDetailRequestBytes !== 1024 * 1024 ||
    limits?.maximumDomRows !== 64 ||
    limits?.maximumLoadedTreeItems !== 2_000 ||
    limits?.maximumRelations !== 100 ||
    limits?.maximumSearchResults !== 500 ||
    JSON.stringify(limits?.productScaleGltfRenderer) !==
      JSON.stringify({
        maximumRangeBytes: 33_554_432,
        maximumSourceReadBytes: 33_554_432,
        maximumGeometryPayloadBytes: 25_165_824,
        maximumInstancedTriangles: 4_000_000,
        maximumCpuStagingBytes: 33_554_432,
        maximumGpuCacheBytes: 33_554_432,
      }) ||
    JSON.stringify(limits?.lasLazPointSource) !==
      JSON.stringify({
        maximumSourceBytes: 8_388_608,
        maximumPoints: 500_000,
        maximumDecodedPointBytes: 25_165_824,
        maximumPointRangeBytes: 8_388_608,
        maximumGpuBytes: 8_388_608,
      }) ||
    JSON.stringify(limits?.e57PointSource) !==
      JSON.stringify({
        maximumSourceBytes: 8_388_608,
        maximumPoints: 500_000,
        maximumDecodedPointBytes: 16_777_216,
        maximumPointRangeBytes: 8_388_608,
        maximumGpuBytes: 8_388_608,
      }) ||
    JSON.stringify(limits?.e57MultipleScanPointSource) !==
      JSON.stringify({
        maximumSourceBytes: 33_554_432,
        maximumPoints: 2_000_000,
        maximumPointsPerScan: 750_000,
        maximumScans: 8,
        maximumDecodedPointBytes: 67_108_864,
        maximumPointRangeBytes: 33_554_432,
        maximumGpuBytes: 33_554_432,
      })
  ) {
    throw new Error("BIM product shell limits are invalid");
  }
  if (
    !everyTrue(browser.assertions) ||
    !everyTrue(browserPublic.assertions) ||
    !everyTrue(browserReference.assertions) ||
    !everyTrue(browserProductScaleReference.assertions) ||
    !everyTrue(vscode.assertions) ||
    !everyTrue(vscode.referenceAssertions) ||
    !everyTrue(installation.assertions) ||
    browser.observation?.hostKind !== "browser" ||
    browserPublic.observation?.hostKind !== "browser" ||
    browserReference.observation?.hostKind !== "browser" ||
    browserProductScaleReference.observation?.hostKind !==
      "browser" ||
    vscode.observation?.hostKind !== "vscode-webview" ||
    vscode.environment?.runtimeLayout !== "staged" ||
    installedRuntime?.environment?.runtimeLayout !==
      "installed-vsix" ||
    installedRuntime?.hostKind !== "vscode-webview" ||
    installedPublic?.hostKind !== "vscode-webview" ||
    browser.observation?.renderer?.actualGpu !== true ||
    vscode.observation?.renderer?.actualGpu !== true ||
    installedRuntime?.renderer?.actualGpu !== true ||
    browserPublic.observation?.renderer?.actualGpu !== true ||
    browserReference.observation?.renderer?.actualGpu !== true ||
    browserProductScaleReference.observation?.renderer
      ?.actualGpu !== true ||
    installedPublic?.renderer?.actualGpu !== true ||
    installedReference?.renderer?.actualGpu !== true ||
    !(browser.observation.renderer.nonBackgroundPixels > 0) ||
    !(vscode.observation.renderer.nonBackgroundPixels > 0) ||
    !(installedRuntime.renderer.nonBackgroundPixels > 0) ||
    !(
      browserPublic.observation.renderer
        .nonBackgroundPixels > 0
    ) ||
    !(
      browserReference.observation.renderer
        .nonBackgroundPixels > 0
    ) ||
    !(installedPublic.renderer.nonBackgroundPixels > 0) ||
    !(installedReference.renderer.nonBackgroundPixels > 0) ||
    browser.observation?.lifecycle?.closed !== "disposed" ||
    vscode.observation?.lifecycle?.closed !== "disposed" ||
    installedRuntime?.lifecycle?.opened !== "ready" ||
    installedRuntime?.lifecycle?.closed !== "disposed" ||
    browserPublic.observation?.lifecycle?.opened !== "ready" ||
    browserPublic.observation?.lifecycle?.closed !==
      "disposed" ||
    browserReference.observation?.lifecycle?.opened !== "ready" ||
    browserReference.observation?.lifecycle?.closed !==
      "disposed" ||
    browserProductScaleReference.observation?.lifecycle
      ?.opened !== "ready" ||
    browserProductScaleReference.observation?.lifecycle
      ?.closed !== "disposed" ||
    installedPublic?.lifecycle?.opened !== "ready" ||
    installedPublic?.lifecycle?.closed !== "disposed" ||
    installedReference?.lifecycle?.opened !== "ready" ||
    installedReference?.lifecycle?.closed !== "disposed"
  ) {
    throw new Error(
      "BIM product shell runtime evidence is incomplete",
    );
  }
  if (
    !equalProjection(browser, vscode) ||
    !equalInstalledProjection(installedRuntime, vscode) ||
    !equalPublicProjection(browserPublic, installedPublic) ||
    browser.fixture.fingerprint !== vscode.fixture.fingerprint ||
    browser.observation?.interaction?.selectionOrigin !== "3d" ||
    browser.observation.interaction.selectedExpressId !==
      vscode.observation?.semantic?.selectedExpressId
  ) {
    throw new Error(
      "BIM product shell host projections diverge",
    );
  }
  if (
    !exactProductScaleReferenceObservation(
      browserProductScaleReference.observation,
    ) ||
    browserProductScaleReference.environment?.headless !== true ||
    browserProductScaleReference.qualification
      ?.classification !== "product-scale-reference" ||
    JSON.stringify(
      browserProductScaleReference.qualification
        ?.rendererLimits,
    ) !== JSON.stringify(
      limits.productScaleGltfRenderer,
    ) ||
    browserProductScaleReference.observation?.network
      ?.externalOrigins?.length !== 0 ||
    browserProductScaleReference.observation?.runtimeErrors
      ?.length !== 0 ||
    browserProductScaleReference.observation?.lifecycle
      ?.backendDisposed !== true ||
    browserProductScaleReference.observation?.lifecycle
      ?.clientDisposed !== true ||
    browserProductScaleReference.decision
      ?.referenceProductOpen !== "passed-bounded-read-only" ||
    browserProductScaleReference.decision
      ?.actualPhysicalGpu !== "not-claimed"
  ) {
    throw new Error(
      "product-scale Browser product evidence is incomplete",
    );
  }
  const stagedProductScaleReference =
    vscodeProductScaleReference
      .productScaleReferenceObservation;
  if (
    vscodeProductScaleReference.environment?.runtimeLayout !==
      "staged" ||
    !everyTrue(vscodeProductScaleReference.assertions) ||
    !everyTrue(
      vscodeProductScaleReference
        .productScaleReferenceAssertions,
    ) ||
    !exactProductScaleReferenceSurface(
      stagedProductScaleReference,
      "vscode-webview",
    ) ||
    stagedProductScaleReference?.externalUpload !== false ||
    stagedProductScaleReference?.telemetry !== false ||
    vscodeProductScaleReference.productScaleReferenceFixture
      ?.classification !== "product-scale-reference" ||
    JSON.stringify(
      vscodeProductScaleReference
        .productScaleReferenceFixture?.rendererLimits,
    ) !== JSON.stringify(limits.productScaleGltfRenderer) ||
    vscodeCleanInstallProductScaleReference.environment
      ?.cleanUserData !== true ||
    vscodeCleanInstallProductScaleReference.environment
      ?.cleanExtensionsDirectory !== true ||
    !everyTrue(
      vscodeCleanInstallProductScaleReference.assertions,
    ) ||
    vscodeCleanInstallProductScaleReference.package?.id !==
      "menaje.bim-explorer" ||
    vscodeCleanInstallProductScaleReference.package?.version !==
      "0.1.0" ||
    vscodeCleanInstallProductScaleReference.package?.byteLength <= 0 ||
    vscodeCleanInstallProductScaleReference.package
      ?.installedRuntimeFiles !== 7 ||
    !/^[0-9a-f]{64}$/u.test(
      vscodeCleanInstallProductScaleReference.package
        ?.workerBundleSha256 ?? "",
    ) ||
    !exactProductScaleReferenceSurface(
      installedProductScaleReference,
      "vscode-webview",
    ) ||
    installedProductScaleReference?.externalUpload !== false ||
    installedProductScaleReference?.telemetry !== false ||
    installedProductScaleReference?.fixture?.classification !==
      "product-scale-reference" ||
    JSON.stringify(
      installedProductScaleReference?.fixture?.rendererLimits,
    ) !== JSON.stringify(limits.productScaleGltfRenderer) ||
    !equalReferenceProjection(
      stagedProductScaleReference,
      installedProductScaleReference,
    ) ||
    vscodeCleanInstallProductScaleReference.decision
      ?.cleanInstall !== "passed" ||
    vscodeCleanInstallProductScaleReference.decision
      ?.publicFixtureOpen !== "not-run" ||
    vscodeCleanInstallProductScaleReference.decision
      ?.productScaleReferenceFixtureOpen !==
        "passed-bounded-read-only" ||
    vscodeCleanInstallProductScaleReference.decision
      ?.marketplaceRelease !== "held"
  ) {
    throw new Error(
      "product-scale VS Code product evidence is incomplete",
    );
  }
  if (
    !exactReferenceObservation(
      browserReference.observation,
      "browser",
      referenceFixture.nativeId,
    ) ||
    !exactReferenceObservation(
      vscode.referenceObservation,
      "vscode-webview",
      referenceFixture.nativeId,
    ) ||
    !exactReferenceObservation(
      installedReference,
      "vscode-webview",
      referenceFixture.nativeId,
    ) ||
    browserReference.environment?.headless !== true ||
    browserReference.observation?.interaction
      ?.selectedNativeId !== referenceFixture.nativeId ||
    browserReference.observation?.interaction
      ?.selectionOrigin !== "3d" ||
    browserReference.observation?.network
      ?.externalOrigins?.length !== 0 ||
    browserReference.observation?.runtimeErrors?.length !== 0 ||
    browserReference.observation?.lifecycle
      ?.backendDisposed !== true ||
    browserReference.observation?.lifecycle
      ?.clientDisposed !== true ||
    vscode.referenceObservation?.externalUpload !== false ||
    vscode.referenceObservation?.telemetry !== false ||
    installedReference?.externalUpload !== false ||
    installedReference?.telemetry !== false ||
    browserReference.decision?.referenceProductOpen !==
      "passed-bounded-read-only" ||
    browserReference.decision?.actualPhysicalGpu !==
      "not-claimed" ||
    installation.decision?.referenceFixtureOpen !==
      "passed-bounded-read-only"
  ) {
    throw new Error(
      "reference product shell evidence is incomplete",
    );
  }
  if (
    JSON.stringify(browserPublic.observation?.model) !==
      JSON.stringify({
        products: 3_569,
        treeNodes: 3_578,
        triangles: 261_424,
        ranges: 3,
      }) ||
    browserPublic.observation?.resources?.sourceBytes !==
      46_766_968 ||
    browserPublic.observation?.resources?.geometryBytes !==
      9_290_696 ||
    browserPublic.observation?.resources?.metadataBytes !==
      9_266_930 ||
    browserPublic.observation?.resources?.detailBytes !==
      5_490_130 ||
    browserPublic.observation?.resources?.detailRanges !== 6 ||
    browserPublic.observation?.resources
      ?.largestDetailRangeBytes !== 1_047_997 ||
    browserPublic.observation?.renderer?.sourceReadBytes !==
      4_193_868 ||
    browserPublic.observation?.renderer?.uploadedBytes !==
      4_399_252 ||
    browserPublic.observation?.semantic?.maximumDomRows !== 64 ||
    browserPublic.observation?.interaction?.searchResults !== 25 ||
    browserPublic.observation?.interaction?.selectionOrigin !==
      "3d" ||
    browserPublic.observation?.network?.externalOrigins?.length !==
      0 ||
    browserPublic.observation?.runtimeErrors?.length !== 0 ||
    installedPublic?.externalUpload !== false ||
    installedPublic?.telemetry !== false ||
    browserPublic.decision?.browserProductShell !== "passed" ||
    browserPublic.decision?.actualPhysicalGpu !==
      "not-claimed" ||
    browserPublic.decision?.publicViewerCoreConformance !==
      "held"
  ) {
    throw new Error(
      "public BIM product scale evidence is incomplete",
    );
  }
  if (
    browser.observation?.network?.externalOrigins?.length !== 0 ||
    browser.observation.runtimeErrors?.length !== 0 ||
    vscode.observation?.externalUpload !== false ||
    vscode.observation?.telemetry !== false ||
    installation.package?.id !== "menaje.bim-explorer" ||
    installation.package?.version !== "0.1.0" ||
    installation.package?.byteLength <= 0 ||
    installation.package?.installedRuntimeFiles !== 7 ||
    !/^[0-9a-f]{64}$/u.test(
      installation.package?.workerBundleSha256 ?? "",
    ) ||
    installation.environment?.cleanUserData !== true ||
    installation.environment?.cleanExtensionsDirectory !== true ||
    installation.observation?.installedExtensions?.[0] !==
      "menaje.bim-explorer@0.1.0" ||
    installation.observation?.association?.viewType !==
      "bimExplorer.ifcEditor" ||
    JSON.stringify(
      installation.observation?.association?.selector,
    ) !== JSON.stringify([
      { filenamePattern: "*.ifc" },
      { filenamePattern: "*.gltf" },
      { filenamePattern: "*.glb" },
    ]) ||
    installation.observation?.association?.priority !== "default" ||
    installation.observation?.dependencies?.["web-ifc"] !==
      "0.0.77" ||
    installation.decision?.cleanInstall !== "passed" ||
    installation.decision?.publicFixtureOpen !== "passed" ||
    installation.decision?.marketplaceRelease !== "held"
  ) {
    throw new Error(
      "BIM product shell local package evidence is invalid",
    );
  }
  if (
    manifest.evidence?.browserSynthetic !==
      "compatibility/evidence/" +
        "bim-product-shell-browser-synthetic-2026-08-04.json" ||
    manifest.evidence?.browserPublic !==
      "compatibility/evidence/" +
        "bim-product-shell-browser-public-2026-08-04.json" ||
    manifest.evidence?.browserReference !==
      "compatibility/evidence/" +
        "gltf-reference-source-khronos-box-browser-product-2026-08-04.json" ||
    manifest.evidence?.browserProductScaleReference !==
      "compatibility/evidence/" +
        "gltf-reference-source-a-beautiful-game-browser-product-2026-08-08.json" ||
    manifest.evidence?.vscodeProductScaleReference !==
      "compatibility/evidence/" +
        "gltf-reference-source-a-beautiful-game-vscode-product-2026-08-08.json" ||
    manifest.evidence?.vscodeCleanInstallProductScaleReference !==
      "compatibility/evidence/" +
        "gltf-reference-source-a-beautiful-game-vscode-vsix-product-2026-08-08.json" ||
    manifest.evidence?.vscodeSynthetic !==
      "compatibility/evidence/" +
        "bim-product-shell-vscode-synthetic-2026-08-04.json" ||
    manifest.evidence?.vscodeCleanInstall !==
      "compatibility/evidence/" +
        "bim-product-shell-vscode-vsix-install-2026-08-04.json" ||
    manifest.evidence?.gltfProductPlatformMatrix !==
      "compatibility/evidence/" +
        "gltf-product-platform-matrix-2026-08-08.json" ||
    manifest.evidence?.browserLasLaz !==
      "compatibility/evidence/" +
        "las-laz-browser-product-2026-08-08.json" ||
    manifest.evidence?.vscodeLasLaz !==
      "compatibility/evidence/" +
        "las-laz-vscode-product-2026-08-08.json" ||
    manifest.evidence?.browserE57 !==
      "compatibility/evidence/" +
        "e57-browser-product-2026-08-08.json" ||
    manifest.evidence?.vscodeE57 !==
      "compatibility/evidence/" +
        "e57-vscode-product-2026-08-08.json" ||
    manifest.evidence?.browserE57Spherical !==
      "compatibility/evidence/" +
        "e57-spherical-browser-product-2026-08-08.json" ||
    manifest.evidence?.vscodeE57Spherical !==
      "compatibility/evidence/" +
        "e57-spherical-vscode-product-2026-08-08.json" ||
    manifest.evidence?.browserE57MultipleScan !==
      "compatibility/evidence/" +
        "e57-multiple-scan-browser-product-2026-08-08.json" ||
    manifest.evidence?.vscodeE57MultipleScan !==
      "compatibility/evidence/" +
        "e57-multiple-scan-vscode-product-2026-08-08.json" ||
    manifest.evidence?.browserPointPicking !==
      "compatibility/evidence/" +
        "point-cloud-browser-picking-2026-08-09.json" ||
    manifest.evidence?.vscodePointPicking !==
      "compatibility/evidence/" +
        "point-cloud-vscode-picking-2026-08-09.json" ||
    manifest.policy?.readOnly !== true ||
    manifest.policy?.localOnly !== true ||
    manifest.policy?.spatialAuthority !== false ||
    manifest.policy?.claimDeferredSemanticDetails !== true ||
    manifest.policy?.claimQualifiedReferenceOpen !== true ||
    manifest.policy?.claimCrossPlatformGltfProductOpen !== true ||
    manifest.policy?.claimProductScaleBrowserOpen !== true ||
    manifest.policy?.claimProductScaleVscodeOpen !== true ||
    manifest.policy?.claimProductScaleCleanVsixOpen !== true ||
    manifest.policy?.claimBrowserLasLazOpen !== true ||
    manifest.policy?.claimVscodeLasLazOpen !== true ||
    manifest.policy?.claimCleanVsixLasLazOpen !== true ||
    manifest.policy?.claimLasLazFormatAdmission !== false ||
    manifest.policy?.claimBrowserE57Open !== true ||
    manifest.policy?.claimVscodeE57Open !== true ||
    manifest.policy?.claimCleanVsixE57Open !== true ||
    manifest.policy?.claimBrowserE57SphericalOpen !== true ||
    manifest.policy?.claimVscodeE57SphericalOpen !== true ||
    manifest.policy?.claimCleanVsixE57SphericalOpen !== true ||
    manifest.policy?.claimBrowserE57MultipleScanOpen !== true ||
    manifest.policy?.claimVscodeE57MultipleScanOpen !== true ||
    manifest.policy?.claimCleanVsixE57MultipleScanOpen !== true ||
    manifest.policy?.claimBrowserPointPicking !== true ||
    manifest.policy?.claimVscodePointPicking !== true ||
    manifest.policy?.claimCleanVsixPointPicking !== true ||
    manifest.policy?.pointIdentityAuthority !==
      "derived-point-range-order" ||
    manifest.policy?.pointIdentityScope !==
      "source-revision-and-range-digest" ||
    manifest.policy?.claimE57FormatAdmission !== false ||
    manifest.policy?.claimPublicViewerCore !== false ||
    manifest.policy?.claimPublicScale !== true ||
    manifest.policy?.claimPhysicalGpu !== false ||
    manifest.policy?.claimMarketplaceRelease !== false
  ) {
    throw new Error(
      "BIM product shell policy overclaims compatibility",
    );
  }
  if (
    /\/Volumes\/|\/Users\/|[A-Z]:\\|file:\/\//u.test(
      JSON.stringify({
        browser,
        browserPublic,
        browserReference,
        browserProductScaleReference,
        vscodeProductScaleReference,
        vscodeCleanInstallProductScaleReference,
        lasLazBrowserProduct,
        lasLazVscodeProduct,
        e57BrowserProduct,
        e57VscodeProduct,
        e57SphericalBrowserProduct,
        e57SphericalVscodeProduct,
        e57MultipleScanBrowserProduct,
        e57MultipleScanVscodeProduct,
        pointCloudBrowserPicking,
        pointCloudVscodePicking,
        installation,
        manifest,
        vscode,
      }),
    )
  ) {
    throw new Error(
      "BIM product shell evidence exposes a local path",
    );
  }
  return Object.freeze({
    fixture: fixture.id,
    heldGates: HELD_GATES.length,
    hosts: Object.freeze([
      browser.observation.hostKind,
      vscode.observation.hostKind,
    ]),
    passedGates: PASSED_GATES.length,
    publicProducts:
      browserPublic.observation.model.products,
    status: manifest.status,
  });
}

async function main() {
  const root = process.cwd();
  const manifest = JSON.parse(await readFile(
    path.join(
      root,
      "compatibility",
      "bim-product-shells.json",
    ),
    "utf8",
  ));
  const [
    browser,
    browserPublic,
    browserReference,
    browserProductScaleReference,
    vscodeProductScaleReference,
    vscodeCleanInstallProductScaleReference,
    lasLazBrowserProduct,
    lasLazVscodeProduct,
    e57BrowserProduct,
    e57VscodeProduct,
    e57SphericalBrowserProduct,
    e57SphericalVscodeProduct,
    e57MultipleScanBrowserProduct,
    e57MultipleScanVscodeProduct,
    pointCloudBrowserPicking,
    pointCloudVscodePicking,
    vscode,
    installation,
  ] = await Promise.all([
    readFile(
      path.join(root, manifest.evidence.browserSynthetic),
      "utf8",
    ).then(JSON.parse),
    readFile(
      path.join(root, manifest.evidence.browserPublic),
      "utf8",
    ).then(JSON.parse),
    readFile(
      path.join(root, manifest.evidence.browserReference),
      "utf8",
    ).then(JSON.parse),
    readFile(
      path.join(
        root,
        manifest.evidence.browserProductScaleReference,
      ),
      "utf8",
    ).then(JSON.parse),
    readFile(
      path.join(
        root,
        manifest.evidence.vscodeProductScaleReference,
      ),
      "utf8",
    ).then(JSON.parse),
    readFile(
      path.join(
        root,
        manifest.evidence
          .vscodeCleanInstallProductScaleReference,
      ),
      "utf8",
    ).then(JSON.parse),
    readFile(
      path.join(root, manifest.evidence.browserLasLaz),
      "utf8",
    ).then(JSON.parse),
    readFile(
      path.join(root, manifest.evidence.vscodeLasLaz),
      "utf8",
    ).then(JSON.parse),
    readFile(
      path.join(root, manifest.evidence.browserE57),
      "utf8",
    ).then(JSON.parse),
    readFile(
      path.join(root, manifest.evidence.vscodeE57),
      "utf8",
    ).then(JSON.parse),
    readFile(
      path.join(root, manifest.evidence.browserE57Spherical),
      "utf8",
    ).then(JSON.parse),
    readFile(
      path.join(root, manifest.evidence.vscodeE57Spherical),
      "utf8",
    ).then(JSON.parse),
    readFile(
      path.join(root, manifest.evidence.browserE57MultipleScan),
      "utf8",
    ).then(JSON.parse),
    readFile(
      path.join(root, manifest.evidence.vscodeE57MultipleScan),
      "utf8",
    ).then(JSON.parse),
    readFile(
      path.join(root, manifest.evidence.browserPointPicking),
      "utf8",
    ).then(JSON.parse),
    readFile(
      path.join(root, manifest.evidence.vscodePointPicking),
      "utf8",
    ).then(JSON.parse),
    readFile(
      path.join(root, manifest.evidence.vscodeSynthetic),
      "utf8",
    ).then(JSON.parse),
    readFile(
      path.join(root, manifest.evidence.vscodeCleanInstall),
      "utf8",
    ).then(JSON.parse),
  ]);
  const result = validateBimProductShellCompatibility(
    manifest,
    browser,
    vscode,
    browserPublic,
    installation,
    browserReference,
    browserProductScaleReference,
    vscodeProductScaleReference,
    vscodeCleanInstallProductScaleReference,
    lasLazBrowserProduct,
    lasLazVscodeProduct,
    e57BrowserProduct,
    e57VscodeProduct,
    e57SphericalBrowserProduct,
    e57SphericalVscodeProduct,
    e57MultipleScanBrowserProduct,
    e57MultipleScanVscodeProduct,
    pointCloudBrowserPicking,
    pointCloudVscodePicking,
  );
  console.log(
    `BIM product shell compatibility check passed: ` +
      `${result.hosts.join(" + ")}, ` +
      `${result.passedGates} passed and ` +
      `${result.heldGates} held gates`,
  );
}

if (
  process.argv[1] &&
  import.meta.url ===
    pathToFileURL(path.resolve(process.argv[1])).href
) {
  await main();
}
