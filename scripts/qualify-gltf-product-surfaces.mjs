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
import {
  resolveVscodeQualificationRuntime,
} from "./vscode-qualification-runtime.mjs";

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
  const options = {
    output: null,
    write: false,
  };
  for (let index = 0; index < values.length; index += 1) {
    const name = values[index];
    if (name === "--write") {
      options.write = true;
      continue;
    }
    if (name === "--output") {
      const value = values[index + 1];
      if (typeof value !== "string" || value.length === 0) {
        throw new TypeError("--output requires a file path");
      }
      options.output = path.resolve(value);
      index += 1;
      continue;
    }
    throw new TypeError(`unknown argument ${name}`);
  }
  return options;
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
  output = null,
  write = false,
} = {}) {
  const vscodeRuntime =
    await resolveVscodeQualificationRuntime();
  const browser = await qualifyBimProductShell({
    fixture: "gltf-public",
  });
  const vscode = await qualifyVscodeCustomEditor({
    vscodeRuntime,
  });
  const vscodeInstall = await qualifyVscodeVsixInstall({
    includePublicFixture: write,
    vscodeRuntime,
  });
  if (write) {
    await Promise.all([
      writeEvidence(OUTPUTS.browser, browser),
      writeEvidence(OUTPUTS.vscode, vscode),
      writeEvidence(OUTPUTS.vscodeInstall, vscodeInstall),
    ]);
  }
  const result = Object.freeze({
    schema: "bim-explorer-gltf-product-surfaces-qualification/2",
    status: "passed",
    capturedAt: new Date().toISOString(),
    environment: {
      platform: `${process.platform}-${process.arch}`,
      node: process.version,
      browser: browser.environment.browser,
      browserHeadless: browser.environment.headless,
      vscode: vscode.environment.vscode,
      vscodeDownloadAttempts:
        vscodeRuntime.downloadAttempts,
      vscodeRuntimeSource: vscodeRuntime.source,
      vscodeRequestedVersion:
        vscodeRuntime.requestedVersion,
      physicalGpuClaimed: false,
      rendererQualification: "SwiftShader WebGL2",
    },
    fixture: browser.fixture,
    browser: {
      evidence: path.relative(ROOT, OUTPUTS.browser),
      hostKind: browser.observation.hostKind,
      model: browser.observation.model,
      resources: browser.observation.resources,
      renderer: browser.observation.renderer,
      reference: browser.observation.reference,
      lifecycle: browser.observation.lifecycle,
      externalOrigins:
        browser.observation.network.externalOrigins,
      runtimeErrors: browser.observation.runtimeErrors,
    },
    vscode: {
      evidence: path.relative(ROOT, OUTPUTS.vscode),
      fixture: vscode.referenceFixture,
      hostKind: vscode.referenceObservation.hostKind,
      model: vscode.referenceObservation.model,
      resources: vscode.referenceObservation.resources,
      renderer: vscode.referenceObservation.renderer,
      reference: vscode.referenceObservation.reference,
      lifecycle: vscode.referenceObservation.lifecycle,
      externalUpload:
        vscode.referenceObservation.externalUpload,
      telemetry: vscode.referenceObservation.telemetry,
    },
    vscodeInstall: {
      evidence: path.relative(ROOT, OUTPUTS.vscodeInstall),
      package: vscodeInstall.package,
      fixture:
        vscodeInstall.observation.referenceRuntime.fixture,
      hostKind:
        vscodeInstall.observation.referenceRuntime.hostKind,
      model:
        vscodeInstall.observation.referenceRuntime.model,
      resources:
        vscodeInstall.observation.referenceRuntime.resources,
      renderer:
        vscodeInstall.observation.referenceRuntime.renderer,
      reference:
        vscodeInstall.observation.referenceRuntime.reference,
      lifecycle:
        vscodeInstall.observation.referenceRuntime.lifecycle,
      externalUpload:
        vscodeInstall.observation.referenceRuntime
          .externalUpload,
      telemetry:
        vscodeInstall.observation.referenceRuntime.telemetry,
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
      sameFixtureIdentity:
        browser.fixture.fingerprint ===
          vscode.referenceFixture.fingerprint &&
        browser.fixture.fingerprint ===
          vscodeInstall.observation.referenceRuntime
            .fixture.fingerprint,
      localOnly:
        browser.observation.network.externalOrigins.length === 0 &&
        vscode.referenceObservation.externalUpload === false &&
        vscode.referenceObservation.telemetry === false &&
        vscodeInstall.observation.referenceRuntime
          .externalUpload === false &&
        vscodeInstall.observation.referenceRuntime
          .telemetry === false,
      physicalGpuNotClaimed: true,
    },
    decision: {
      platformProductOpen: "passed-experimental",
      actualPhysicalGpu: "not-claimed",
      productScaleReference: "held",
      productionClaims: false,
    },
  });
  if (output !== null) {
    await writeEvidence(output, result);
  }
  return result;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    fileURLToPath(import.meta.url)
) {
  const options = parseArguments(process.argv.slice(2));
  const result = await qualifyGltfProductSurfaces(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
