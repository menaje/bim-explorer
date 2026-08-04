import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  qualifyBimProductShell,
} from "./qualify-bim-product-shell.mjs";
import {
  qualifyVscodeCustomEditor,
} from "./qualify-vscode-custom-editor.mjs";
import {
  qualifyVscodeVsixInstall,
} from "./qualify-vscode-vsix-install.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const EVIDENCE_ROOT = path.join(ROOT, "compatibility", "evidence");
const OUTPUTS = Object.freeze({
  browser: path.join(
    EVIDENCE_ROOT,
    "gltf-reference-source-khronos-box-browser-product-2026-08-04.json",
  ),
  vscode: path.join(
    EVIDENCE_ROOT,
    "bim-product-shell-vscode-synthetic-2026-08-04.json",
  ),
  vscodeInstall: path.join(
    EVIDENCE_ROOT,
    "bim-product-shell-vscode-vsix-install-2026-08-04.json",
  ),
});

function parseArguments(values) {
  if (values.length === 0) {
    return false;
  }
  if (values.length === 1 && values[0] === "--write") {
    return true;
  }
  throw new TypeError(
    "usage: node scripts/qualify-gltf-product-surfaces.mjs [--write]",
  );
}

async function writeEvidence(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(
    file,
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

export async function qualifyGltfProductSurfaces({
  write = false,
} = {}) {
  const browser = await qualifyBimProductShell({
    fixture: "gltf-public",
  });
  const vscode = await qualifyVscodeCustomEditor();
  const vscodeInstall = await qualifyVscodeVsixInstall();
  if (write) {
    await Promise.all([
      writeEvidence(OUTPUTS.browser, browser),
      writeEvidence(OUTPUTS.vscode, vscode),
      writeEvidence(OUTPUTS.vscodeInstall, vscodeInstall),
    ]);
  }
  return Object.freeze({
    schema: "bim-explorer-gltf-product-surfaces-qualification/1",
    status: "passed",
    browser: {
      evidence: path.relative(ROOT, OUTPUTS.browser),
      format: browser.fixture.format,
      pixels:
        browser.observation.renderer.nonBackgroundPixels,
      nativeId:
        browser.observation.reference.selectedNativeId,
    },
    vscode: {
      evidence: path.relative(ROOT, OUTPUTS.vscode),
      format: vscode.referenceFixture.format,
      pixels:
        vscode.referenceObservation.renderer
          .nonBackgroundPixels,
      nativeId:
        vscode.referenceObservation.reference
          .selectedNativeId,
    },
    vscodeInstall: {
      evidence: path.relative(ROOT, OUTPUTS.vscodeInstall),
      packageVersion: vscodeInstall.package.version,
      packageBytes: vscodeInstall.package.byteLength,
      format:
        vscodeInstall.observation.referenceRuntime
          .fixture.format,
      pixels:
        vscodeInstall.observation.referenceRuntime
          .renderer.nonBackgroundPixels,
    },
    assertions: {
      browser:
        Object.values(browser.assertions).every(Boolean),
      vscode:
        Object.values(
          vscode.referenceAssertions,
        ).every(Boolean),
      cleanInstall:
        Object.values(
          vscodeInstall.assertions,
        ).every(Boolean),
      written: write,
    },
  });
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    fileURLToPath(import.meta.url)
) {
  const result = await qualifyGltfProductSurfaces({
    write: parseArguments(process.argv.slice(2)),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
