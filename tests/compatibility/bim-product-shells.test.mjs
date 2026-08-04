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
  const [browser, vscode, installation] = await Promise.all([
    readFile(
      manifest.evidence.browserSynthetic,
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
      values.installation,
    ),
    {
      fixture: "synthetic-semantic-ifc4",
      heldGates: 4,
      hosts: ["browser", "vscode-webview"],
      passedGates: 18,
      status: "experimental",
    },
  );
});

test("product shells cannot promote unresolved Viewer Core", async () => {
  const values = await fixtures();
  values.manifest.gates.publicViewerCoreConformance = true;
  assert.throws(
    () => validateBimProductShellCompatibility(
      values.manifest,
      values.browser,
      values.vscode,
      values.installation,
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
      values.installation,
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
      values.installation,
    ),
    /runtime evidence is incomplete/u,
  );
});
