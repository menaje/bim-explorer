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
    vscode,
    installation,
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
      manifest.evidence.vscodeSynthetic,
      "utf8",
    ).then(JSON.parse),
    readFile(
      manifest.evidence.vscodeCleanInstall,
      "utf8",
    ).then(JSON.parse),
  ]);
  return {
    browser,
    browserPublic,
    browserReference,
    browserProductScaleReference,
    installation,
    manifest,
    vscode,
  };
}

test("product shells pin the same source and render projection", async () => {
  const values = await fixtures();
  assert.deepEqual(
    validateBimProductShellCompatibility(
      values.manifest,
      values.browser,
      values.vscode,
      values.browserPublic,
      values.installation,
      values.browserReference,
      values.browserProductScaleReference,
    ),
    {
      fixture: "synthetic-semantic-ifc4",
      heldGates: 4,
      hosts: ["browser", "vscode-webview"],
      passedGates: 25,
      publicProducts: 3_569,
      status: "experimental",
    },
  );
});

test("product shells cannot claim unintegrated Viewer Core", async () => {
  const values = await fixtures();
  values.manifest.gates.publicViewerCoreConformance = true;
  assert.throws(
    () => validateBimProductShellCompatibility(
      values.manifest,
      values.browser,
      values.vscode,
      values.browserPublic,
      values.installation,
      values.browserReference,
      values.browserProductScaleReference,
    ),
    /publicViewerCoreConformance must remain held/u,
  );
});

test("product shells reject divergent host projections", async () => {
  const values = await fixtures();
  values.vscode.observation.renderer.uploadedBytes += 1;
  assert.throws(
    () => validateBimProductShellCompatibility(
      values.manifest,
      values.browser,
      values.vscode,
      values.browserPublic,
      values.installation,
      values.browserReference,
      values.browserProductScaleReference,
    ),
    /host projections diverge/u,
  );
});

test("product shells require a clean read-only VSIX install", async () => {
  const values = await fixtures();
  values.installation.assertions.cliAcceptedPackage = false;
  assert.throws(
    () => validateBimProductShellCompatibility(
      values.manifest,
      values.browser,
      values.vscode,
      values.browserPublic,
      values.installation,
      values.browserReference,
      values.browserProductScaleReference,
    ),
    /runtime evidence is incomplete/u,
  );
});

test("product shells require the installed VSIX runtime projection", async () => {
  const values = await fixtures();
  values.installation.observation.runtime.model.products += 1;
  assert.throws(
    () => validateBimProductShellCompatibility(
      values.manifest,
      values.browser,
      values.vscode,
      values.browserPublic,
      values.installation,
      values.browserReference,
      values.browserProductScaleReference,
    ),
    /host projections diverge/u,
  );
});

test("product shells reject a staged-only clean install claim", async () => {
  const values = await fixtures();
  values.installation.observation.runtime.environment.runtimeLayout =
    "staged";
  assert.throws(
    () => validateBimProductShellCompatibility(
      values.manifest,
      values.browser,
      values.vscode,
      values.browserPublic,
      values.installation,
      values.browserReference,
      values.browserProductScaleReference,
    ),
    /runtime evidence is incomplete/u,
  );
});

test("product shells require public Browser and installed projections", async () => {
  const values = await fixtures();
  values.installation.observation.publicRuntime.renderer
    .uploadedBytes += 1;
  assert.throws(
    () => validateBimProductShellCompatibility(
      values.manifest,
      values.browser,
      values.vscode,
      values.browserPublic,
      values.installation,
      values.browserReference,
      values.browserProductScaleReference,
    ),
    /host projections diverge/u,
  );
});

test("product shells keep public IFC2X3 profile admission held", async () => {
  const values = await fixtures();
  values.manifest.publicFixture.profileAdmission = true;
  assert.throws(
    () => validateBimProductShellCompatibility(
      values.manifest,
      values.browser,
      values.vscode,
      values.browserPublic,
      values.installation,
      values.browserReference,
      values.browserProductScaleReference,
    ),
    /public BIM product fixture policy is invalid/u,
  );
});

test("product shells pin public deferred detail diagnostics", async () => {
  const values = await fixtures();
  values.browserPublic.observation.resources.detailRanges = 5;
  assert.throws(
    () => validateBimProductShellCompatibility(
      values.manifest,
      values.browser,
      values.vscode,
      values.browserPublic,
      values.installation,
      values.browserReference,
      values.browserProductScaleReference,
    ),
    /host projections diverge|public BIM product scale/u,
  );
});

test("product shells preserve reference-native identity", async () => {
  const values = await fixtures();
  values.browserReference.observation.reference.globalId =
    "invented-global-id";
  assert.throws(
    () => validateBimProductShellCompatibility(
      values.manifest,
      values.browser,
      values.vscode,
      values.browserPublic,
      values.installation,
      values.browserReference,
      values.browserProductScaleReference,
    ),
    /reference product shell evidence is incomplete/u,
  );
});

test("product shells pin product-scale Browser cleanup", async () => {
  const values = await fixtures();
  values.browserProductScaleReference.observation.lifecycle
    .backendDisposed = false;
  assert.throws(
    () => validateBimProductShellCompatibility(
      values.manifest,
      values.browser,
      values.vscode,
      values.browserPublic,
      values.installation,
      values.browserReference,
      values.browserProductScaleReference,
    ),
    /product-scale Browser product evidence is incomplete/u,
  );
});
