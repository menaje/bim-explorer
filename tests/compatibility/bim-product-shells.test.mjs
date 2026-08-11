import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateBimProductShellCompatibility,
} from "../../scripts/check-bim-product-shell-compatibility.mjs";

async function fixtures() {
  const manifest = JSON.parse(await readFile(
    "compatibility/bim-product-shells.json",
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
    pointCloudLodProducts,
    vscode,
    installation,
    representativePhysicalGpu,
    representativePointCloudsPhysicalGpu,
    viewerCoreProductEntrypoints,
    gltfExternalResourceProducts,
  ] = await Promise.all([
    readFile(
      manifest.evidence.browserSynthetic,
      "utf8",
    ).then(JSON.parse),
    readFile(
      manifest.evidence.browserPublic,
      "utf8",
    ).then(JSON.parse),
    readFile(
      manifest.evidence.browserReference,
      "utf8",
    ).then(JSON.parse),
    readFile(
      manifest.evidence.browserProductScaleReference,
      "utf8",
    ).then(JSON.parse),
    readFile(
      manifest.evidence.vscodeProductScaleReference,
      "utf8",
    ).then(JSON.parse),
    readFile(
      manifest.evidence.vscodeCleanInstallProductScaleReference,
      "utf8",
    ).then(JSON.parse),
    readFile(
      manifest.evidence.browserLasLaz,
      "utf8",
    ).then(JSON.parse),
    readFile(
      manifest.evidence.vscodeLasLaz,
      "utf8",
    ).then(JSON.parse),
    readFile(
      manifest.evidence.browserE57,
      "utf8",
    ).then(JSON.parse),
    readFile(
      manifest.evidence.vscodeE57,
      "utf8",
    ).then(JSON.parse),
    readFile(
      manifest.evidence.browserE57Spherical,
      "utf8",
    ).then(JSON.parse),
    readFile(
      manifest.evidence.vscodeE57Spherical,
      "utf8",
    ).then(JSON.parse),
    readFile(
      manifest.evidence.browserE57MultipleScan,
      "utf8",
    ).then(JSON.parse),
    readFile(
      manifest.evidence.vscodeE57MultipleScan,
      "utf8",
    ).then(JSON.parse),
    readFile(
      manifest.evidence.browserPointPicking,
      "utf8",
    ).then(JSON.parse),
    readFile(
      manifest.evidence.vscodePointPicking,
      "utf8",
    ).then(JSON.parse),
    readFile(
      manifest.evidence.pointCloudLodProducts,
      "utf8",
    ).then(JSON.parse),
    readFile(
      manifest.evidence.vscodeSynthetic,
      "utf8",
    ).then(JSON.parse),
    readFile(
      manifest.evidence.vscodeCleanInstall,
      "utf8",
    ).then(JSON.parse),
    readFile(
      manifest.evidence.representativePhysicalGpu,
      "utf8",
    ).then(JSON.parse),
    readFile(
      manifest.evidence.representativePointCloudsPhysicalGpu,
      "utf8",
    ).then(JSON.parse),
    readFile(
      manifest.evidence.viewerCoreProductEntrypoints,
      "utf8",
    ).then(JSON.parse),
    readFile(
      manifest.evidence.gltfExternalResourceProducts,
      "utf8",
    ).then(JSON.parse),
  ]);
  return {
    browser,
    browserPublic,
    browserReference,
    browserProductScaleReference,
    vscodeProductScaleReference,
    vscodeCleanInstallProductScaleReference,
    installation,
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
    pointCloudLodProducts,
    representativePhysicalGpu,
    representativePointCloudsPhysicalGpu,
    viewerCoreProductEntrypoints,
    gltfExternalResourceProducts,
    manifest,
    vscode,
  };
}

function validate(values) {
  return validateBimProductShellCompatibility(
    values.manifest,
    values.browser,
    values.vscode,
    values.browserPublic,
    values.installation,
    values.browserReference,
    values.browserProductScaleReference,
    values.vscodeProductScaleReference,
    values.vscodeCleanInstallProductScaleReference,
    values.lasLazBrowserProduct,
    values.lasLazVscodeProduct,
    values.e57BrowserProduct,
    values.e57VscodeProduct,
    values.e57SphericalBrowserProduct,
    values.e57SphericalVscodeProduct,
    values.e57MultipleScanBrowserProduct,
    values.e57MultipleScanVscodeProduct,
    values.pointCloudBrowserPicking,
    values.pointCloudVscodePicking,
    values.pointCloudLodProducts,
    values.representativePhysicalGpu,
    values.representativePointCloudsPhysicalGpu,
    values.viewerCoreProductEntrypoints,
    values.gltfExternalResourceProducts,
  );
}

test("product shells pin the same source and render projection", async () => {
  const values = await fixtures();
  assert.deepEqual(
    validate(values),
    {
      fixture: "synthetic-semantic-ifc4",
      externalGltfBundleSurfaces: 3,
      heldGates: 1,
      hosts: ["browser", "vscode-webview"],
      passedGates: 51,
      physicalGpu:
        "passed-darwin-arm64-apple-metal-representative-products",
      pointCloudPhysicalGpu:
        "passed-darwin-arm64-apple-metal-representative-point-clouds",
      pointCloudPhysicalGpuSurfaces: 12,
      publicProducts: 3_569,
      status: "experimental",
    },
  );
});

test("product shells require exact local external glTF evidence", async () => {
  const values = await fixtures();
  values.gltfExternalResourceProducts.assertions.localOnly = false;
  assert.throws(
    () => validate(values),
    /glTF resource bundle product evidence is invalid/u,
  );
});

test("product shells require exact Viewer Core product evidence", async () => {
  const values = await fixtures();
  values.viewerCoreProductEntrypoints.productBundle.sha256 =
    "0".repeat(64);
  assert.throws(
    () => validate(values),
    /Viewer Core product entrypoint evidence is incomplete/u,
  );
});

test("product shells reject divergent host projections", async () => {
  const values = await fixtures();
  values.vscode.observation.renderer.uploadedBytes += 1;
  assert.throws(
    () => validate(values),
    /host projections diverge/u,
  );
});

test("product shells require a clean read-only VSIX install", async () => {
  const values = await fixtures();
  values.installation.assertions.cliAcceptedPackage = false;
  assert.throws(
    () => validate(values),
    /runtime evidence is incomplete/u,
  );
});

test("product shells require the installed VSIX runtime projection", async () => {
  const values = await fixtures();
  values.installation.observation.runtime.model.products += 1;
  assert.throws(
    () => validate(values),
    /host projections diverge/u,
  );
});

test("product shells reject a staged-only clean install claim", async () => {
  const values = await fixtures();
  values.installation.observation.runtime.environment.runtimeLayout =
    "staged";
  assert.throws(
    () => validate(values),
    /runtime evidence is incomplete/u,
  );
});

test("product shells require public Browser and installed projections", async () => {
  const values = await fixtures();
  values.installation.observation.publicRuntime.renderer
    .uploadedBytes += 1;
  assert.throws(
    () => validate(values),
    /host projections diverge/u,
  );
});

test("product shells keep public IFC2X3 profile admission held", async () => {
  const values = await fixtures();
  values.manifest.publicFixture.profileAdmission = true;
  assert.throws(
    () => validate(values),
    /public BIM product fixture policy is invalid/u,
  );
});

test("product shells pin public deferred detail diagnostics", async () => {
  const values = await fixtures();
  values.browserPublic.observation.resources.detailRanges = 5;
  assert.throws(
    () => validate(values),
    /host projections diverge|public BIM product scale/u,
  );
});

test("product shells preserve reference-native identity", async () => {
  const values = await fixtures();
  values.browserReference.observation.reference.globalId =
    "invented-global-id";
  assert.throws(
    () => validate(values),
    /reference product shell evidence is incomplete/u,
  );
});

test("product shells pin product-scale Browser cleanup", async () => {
  const values = await fixtures();
  values.browserProductScaleReference.observation.lifecycle
    .backendDisposed = false;
  assert.throws(
    () => validate(values),
    /product-scale Browser product evidence is incomplete/u,
  );
});

test("product shells pin product-scale VS Code rendering", async () => {
  const values = await fixtures();
  values.vscodeProductScaleReference
    .productScaleReferenceObservation.renderer
    .sourceReadBytes += 1;
  assert.throws(
    () => validate(values),
    /product-scale VS Code product evidence is incomplete/u,
  );
});

test("product shells require product-scale clean install", async () => {
  const values = await fixtures();
  values.vscodeCleanInstallProductScaleReference.assertions
    .installedProductScaleReferenceClosesCleanly = false;
  assert.throws(
    () => validate(values),
    /product-scale VS Code product evidence is incomplete/u,
  );
});

test("product shells reject a software representative renderer", async () => {
  const values = await fixtures();
  values.representativePhysicalGpu.browser.ifc.gpu
    .unmaskedRenderer = "ANGLE (Google, SwiftShader)";
  assert.throws(
    () => validate(values),
    /physical GPU (?:evidence|identity) is invalid/u,
  );
});

test("product shells keep cross-platform physical GPU held", async () => {
  const values = await fixtures();
  values.representativePhysicalGpu.held.crossPlatformPhysicalGpu =
    true;
  assert.throws(
    () => validate(values),
    /representative model physical GPU evidence is invalid/u,
  );
});

test("product shells reject a software point renderer", async () => {
  const values = await fixtures();
  values.representativePointCloudsPhysicalGpu.browser.las
    .environment.gpu.unmaskedRenderer =
      "ANGLE (Google, SwiftShader)";
  assert.throws(
    () => validate(values),
    /physical (?:Browser|GPU) (?:evidence|identity) is invalid/u,
  );
});

test("point-cloud physical GPU cannot admit a format", async () => {
  const values = await fixtures();
  values.representativePointCloudsPhysicalGpu.held.formatAdmission =
    true;
  assert.throws(
    () => validate(values),
    /point-cloud physical GPU evidence is invalid/u,
  );
});

test("representative physical GPU evidence requires Viewer Core", async () => {
  const values = await fixtures();
  values.representativePhysicalGpu.browser.ifc.product
    .viewerCore.opened.source.rangeBytesRead += 1;
  assert.throws(
    () => validate(values),
    /representative model physical GPU evidence is invalid/u,
  );
});
