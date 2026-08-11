import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
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
const DEFAULT_OUTPUT = path.join(
  ROOT,
  "compatibility",
  "evidence",
  "bim-product-shell-viewer-core-product-entrypoints-" +
    "2026-08-11.json",
);

function everyTrue(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0 &&
    Object.values(value).every((item) => item === true)
  );
}

function viewerCoreLifecycleQualified(value, expectedBytes) {
  const opened = value?.opened;
  const disposed = value?.disposed;
  return (
    opened?.adopted === true &&
    opened?.api === "menaje-viewer-core/0.1" &&
    opened?.version === "0.1.2" &&
    opened?.protocolId ===
      "menaje-viewer-render-protocol/0.1.0" &&
    opened?.descriptorProtocolVersion === "0.1.0" &&
    opened?.source?.rangeReads > 0 &&
    opened?.source?.rangeBytesRead === expectedBytes &&
    opened?.host?.eventCount >= 1 &&
    opened?.host?.lastEventType === "selection.changed" &&
    disposed?.disposed === true &&
    disposed?.host?.disposed === true &&
    disposed?.source?.disposed === true &&
    disposed?.source?.sessionDisposed === true &&
    disposed?.presentation?.borrowedSessionDisposed === true &&
    disposed?.presentation?.borrowedWorkerDisposed === true &&
    disposed?.presentation?.disposalStatus === "disposed"
  );
}

function browserViewerCoreQualified(value) {
  return (
    everyTrue(value?.assertions) &&
    value?.assertions?.publicViewerCoreProductEntrypoint === true &&
    value?.decision?.publicViewerCoreConformance ===
      "passed-product-entrypoint" &&
    viewerCoreLifecycleQualified(
      value?.observation?.viewerCore,
      value?.observation?.renderer?.sourceReadBytes,
    )
  );
}

function stagedViewerCoreQualified(observation) {
  return viewerCoreLifecycleQualified(
    observation?.viewerCore,
    observation?.renderer?.sourceReadBytes,
  );
}

async function fileSha256(file) {
  return createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
}

export async function qualifyViewerCoreProductEntrypoints() {
  const viewerCompatibility = JSON.parse(await readFile(
    path.join(ROOT, "compatibility", "viewer-core.json"),
    "utf8",
  ));
  const viewerPackage = JSON.parse(await readFile(
    path.join(
      ROOT,
      "node_modules",
      "@menaje",
      "viewer-core",
      "package.json",
    ),
    "utf8",
  ));
  const protocolPackage = JSON.parse(await readFile(
    path.join(
      ROOT,
      "node_modules",
      "@menaje",
      "viewer-render-protocol",
      "package.json",
    ),
    "utf8",
  ));
  const bundlePath = path.join(
    ROOT,
    "packages",
    "viewer-core-consumer",
    "runtime",
    "product.mjs",
  );
  const bundleStat = await stat(bundlePath);

  const browserIfc = await qualifyBimProductShell({
    fixture: "public",
  });
  const browserGlb = await qualifyBimProductShell({
    fixture: "gltf-product-scale",
  });
  const vscodeStaged = await qualifyVscodeCustomEditor({
    includeProductScaleFixture: true,
    includePublicFixture: true,
  });
  const vscodeInstalled = await qualifyVscodeVsixInstall({
    includeProductScaleFixture: true,
    includePublicFixture: true,
  });

  const assertions = Object.freeze({
    exactPublicPackages:
      viewerPackage.name === "@menaje/viewer-core" &&
      viewerPackage.version === "0.1.2" &&
      viewerPackage.license === "MPL-2.0" &&
      protocolPackage.name ===
        "@menaje/viewer-render-protocol" &&
      protocolPackage.version === "0.1.2" &&
      protocolPackage.license === "MPL-2.0" &&
      viewerCompatibility.upstream?.distribution?.tag ===
        "viewer-core-v0.1.2",
    browserPublicIfcEntrypoint:
      browserViewerCoreQualified(browserIfc),
    browserProductScaleGlbEntrypoint:
      browserViewerCoreQualified(browserGlb),
    stagedVscodeSyntheticIfcEntrypoint:
      stagedViewerCoreQualified(vscodeStaged.observation),
    stagedVscodePublicIfcEntrypoint:
      stagedViewerCoreQualified(
        vscodeStaged.publicObservation,
      ),
    stagedVscodeReferenceGlbEntrypoint:
      stagedViewerCoreQualified(
        vscodeStaged.referenceObservation,
      ),
    stagedVscodeProductScaleGlbEntrypoint:
      stagedViewerCoreQualified(
        vscodeStaged.productScaleReferenceObservation,
      ),
    cleanVsixSyntheticIfcEntrypoint:
      stagedViewerCoreQualified(
        vscodeInstalled.observation?.runtime,
      ),
    cleanVsixPublicIfcEntrypoint:
      stagedViewerCoreQualified(
        vscodeInstalled.observation?.publicRuntime,
      ),
    cleanVsixReferenceGlbEntrypoint:
      stagedViewerCoreQualified(
        vscodeInstalled.observation?.referenceRuntime,
      ),
    cleanVsixProductScaleGlbEntrypoint:
      stagedViewerCoreQualified(
        vscodeInstalled.observation
          ?.productScaleReferenceRuntime,
      ),
    cleanVsixPackageAndDisclosures:
      everyTrue(vscodeInstalled.assertions) &&
      vscodeInstalled.assertions
        ?.viewerCoreProductBundleExact === true &&
      vscodeInstalled.assertions
        ?.viewerCoreDisclosuresExact === true &&
      vscodeInstalled.package?.installedRuntimeFiles === 31 &&
      vscodeInstalled.decision?.publicViewerCoreConformance ===
        "passed-product-entrypoint",
    marketplaceStillHeld:
      vscodeInstalled.decision?.marketplaceRelease === "held",
  });
  assert.equal(
    Object.values(assertions).every(Boolean),
    true,
    `Viewer Core product entrypoint qualification failed: ` +
      `${JSON.stringify(assertions)}`,
  );

  return Object.freeze({
    schema:
      "bim-explorer-viewer-core-product-entrypoints-evidence/1",
    capturedAt: new Date().toISOString(),
    environment: {
      platform: `${process.platform}-${process.arch}`,
      browser: browserIfc.environment.browser,
      vscode: vscodeStaged.environment.vscode,
      rendererMode: "swiftshader",
      externalUpload: false,
      telemetry: false,
    },
    publicDependencies: {
      repository: viewerCompatibility.upstream.repository,
      tag: viewerCompatibility.upstream.distribution.tag,
      viewerCore: {
        package: viewerPackage.name,
        version: viewerPackage.version,
        license: viewerPackage.license,
        specifier:
          viewerCompatibility.pin.viewerCore.specifier,
        artifactSha256:
          viewerCompatibility.pin.viewerCore.sha256,
      },
      renderProtocol: {
        package: protocolPackage.name,
        version: protocolPackage.version,
        license: protocolPackage.license,
        protocol:
          viewerCompatibility.upstream.renderProtocol.protocol,
        specifier:
          viewerCompatibility.pin.renderProtocol.specifier,
        artifactSha256:
          viewerCompatibility.pin.renderProtocol.sha256,
      },
    },
    productBundle: {
      contract: "bim-explorer-product-viewer-core/0.1",
      byteLength: bundleStat.size,
      sha256: await fileSha256(bundlePath),
      generated: true,
      bundledInLocalVsix: true,
      correspondingSourceAvailable: true,
    },
    browser: {
      publicIfc: browserIfc,
      productScaleGlb: browserGlb,
    },
    vscode: {
      staged: vscodeStaged,
      cleanInstalledVsix: vscodeInstalled,
    },
    assertions,
    decision: {
      publicViewerCoreConformance: true,
      productEntrypoints:
        "passed-browser-vscode-ifc-glb",
      marketplaceRelease: false,
      productionSupport: false,
      vscodeExtensionPublished: false,
    },
  });
}

function parseArguments(values) {
  if (values.length === 0) {
    return DEFAULT_OUTPUT;
  }
  if (
    values.length === 2 &&
    values[0] === "--output" &&
    typeof values[1] === "string" &&
    !values[1].startsWith("-")
  ) {
    return path.resolve(values[1]);
  }
  throw new TypeError(
    "usage: node scripts/qualify-viewer-core-product-entrypoints.mjs " +
      "[--output path]",
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const output = parseArguments(process.argv.slice(2));
  const evidence = await qualifyViewerCoreProductEntrypoints();
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(
    output,
    `${JSON.stringify(evidence, null, 2)}\n`,
    "utf8",
  );
  process.stdout.write(`${JSON.stringify({
    output,
    assertions: evidence.assertions,
    decision: evidence.decision,
  }, null, 2)}\n`);
}
