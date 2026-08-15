import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  validateRetainedOverlayBrowserQualification,
} from "./qualify-retained-overlay-browser.mjs";
import {
  validateRetainedOverlayViewerCoreQualification,
} from "./qualify-retained-overlay-viewer-core.mjs";
import {
  validateRetainedOverlayVscodeQualification,
} from "./qualify-retained-overlay-vscode.mjs";
import {
  validateFederatedBimSurfaceV03PackageQualification,
} from "./qualify-federated-bim-surface-v0.3-package.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const TRUE_GATES = Object.freeze([
  "versionedBinaryPacket",
  "exactDigestAndDeltaBinding",
  "boundedCpuAndGpuStaging",
  "atomicGeometryPickRevisionCommit",
  "upsertTombstoneStyleTransformIdentity",
  "rollbackCancellationAndAllocationFailure",
  "staleAndOutOfOrderFailClosed",
  "sourceRangeAndBaseGpuPreservation",
  "cameraClippingAndAnchorPreservation",
  "checkpointWithoutSourceReplay",
  "deterministicDispose",
  "actualBrowserWebGl2",
  "actualVscodeWebviewWebGl2",
  "viewerCoreSource013StagedAdapter",
  "immutablePublicV02RuntimeUnchanged",
  "artifactOnlyPackageConformance",
  "authorityFree",
]);
const HELD_GATES = Object.freeze([
  "publishedViewerCore013Artifact",
  "publicSurfaceArtifact",
  "crossPlatformPhysicalGpu",
  "productionSupport",
]);
const CONTRACT = Object.freeze({
  packet: "bim-explorer-retained-overlay-packet/0.1",
  mediaType: "application/vnd.bim-explorer.retained-overlay-delta.v1",
  deltaReceipt: "bim-explorer-retained-overlay-delta-receipt/0.1",
  checkpointReceipt:
    "bim-explorer-retained-overlay-checkpoint-receipt/0.1",
  surface: "bim-explorer-federated-retained-overlay/0.1",
  surfaceAdapter:
    "bim-explorer-federated-retained-overlay-adapter/0.1",
  viewerRenderProtocol: "menaje-viewer-render-protocol/0.1.0",
  viewerCoreSourceVersion: "0.1.3",
  viewerCoreSourceCommit:
    "6702ad1439e44fa9a9835f56181614299c1fe1ff",
  baseSurface: "bim-explorer-bim-surface/0.2",
});
const EVIDENCE = Object.freeze({
  actualBrowser:
    "compatibility/evidence/" +
    "bim-retained-overlay-browser-2026-08-15.json",
  actualVscode:
    "compatibility/evidence/" +
    "bim-retained-overlay-vscode-2026-08-15.json",
  viewerCoreSource:
    "compatibility/evidence/" +
    "bim-retained-overlay-viewer-core-2026-08-15.json",
  packageCandidate:
    "compatibility/evidence/" +
    "bim-retained-overlay-package-release-ready-2026-08-15.json",
});

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function exactGateState(gates) {
  return same(Object.keys(gates ?? {}), [
    ...TRUE_GATES,
    ...HELD_GATES,
  ]) &&
    TRUE_GATES.every((key) => gates[key] === true) &&
    HELD_GATES.every((key) => gates[key] === false);
}

export function validateBimRetainedOverlayCompatibility(
  manifest,
  browser,
  vscode,
  viewerCore,
  packageCandidate,
) {
  if (
    manifest?.schema !==
      "bim-explorer-retained-overlay-compatibility/1" ||
    manifest.status !== "experimental" ||
    manifest.asOf !== "2026-08-15" ||
    !same(manifest.contract, CONTRACT) ||
    !same(manifest.limits, {
      maximumPacketBytes: 8 * 1024 * 1024,
      maximumResidentObjects: 32_768,
      maximumStagingBytes: 16 * 1024 * 1024,
      maximumPacketEntries: 4096,
      maximumIdentifierLength: 512,
    }) ||
    !exactGateState(manifest.gates) ||
    !same(manifest.evidence, EVIDENCE) ||
    !Array.isArray(manifest.blockers) ||
    manifest.blockers.length !== 3 ||
    !Array.isArray(manifest.limitations) ||
    manifest.limitations.length !== 5
  ) {
    throw new Error("retained overlay compatibility manifest is invalid");
  }
  if (
    manifest.policy?.consumerOverlayOnly !== true ||
    manifest.policy.sourceNeutral !== true ||
    manifest.policy.readOnly !== true ||
    [
      "sourceMutation",
      "workspaceAuthority",
      "canonicalIdentityAuthority",
      "acceptanceAuthority",
      "publishAuthority",
      "claimPublishedViewerCore013Artifact",
      "claimPublicSurfaceArtifact",
      "claimPhysicalGpu",
      "claimProductionSupport",
    ].some((key) => manifest.policy[key] !== false) ||
    manifest.policy.claimViewerCoreSourceCompatibility !== true
  ) {
    throw new Error("retained overlay compatibility policy overclaims");
  }
  if (!validateRetainedOverlayBrowserQualification(browser)) {
    throw new Error("retained overlay Browser evidence is invalid");
  }
  if (!validateRetainedOverlayVscodeQualification(vscode)) {
    throw new Error("retained overlay VS Code evidence is invalid");
  }
  if (!validateRetainedOverlayViewerCoreQualification(viewerCore)) {
    throw new Error("retained overlay Viewer Core evidence is invalid");
  }
  try {
    validateFederatedBimSurfaceV03PackageQualification(packageCandidate);
  } catch (error) {
    throw new Error(
      "retained overlay package candidate evidence is invalid",
      { cause: error },
    );
  }
  return Object.freeze({
    status: manifest.status,
    passedGates: TRUE_GATES.length,
    heldGates: HELD_GATES.length,
    blockers: manifest.blockers.length,
  });
}

async function main() {
  const [manifest, browser, vscode, viewerCore, packageCandidate] =
    await Promise.all([
    readFile(path.join(ROOT, "compatibility/bim-retained-overlay.json"),
      "utf8").then(JSON.parse),
    readFile(path.join(ROOT, EVIDENCE.actualBrowser), "utf8")
      .then(JSON.parse),
    readFile(path.join(ROOT, EVIDENCE.actualVscode), "utf8")
      .then(JSON.parse),
    readFile(path.join(ROOT, EVIDENCE.viewerCoreSource), "utf8")
      .then(JSON.parse),
    readFile(path.join(ROOT, EVIDENCE.packageCandidate), "utf8")
      .then(JSON.parse),
  ]);
  const result = validateBimRetainedOverlayCompatibility(
    manifest,
    browser,
    vscode,
    viewerCore,
    packageCandidate,
  );
  process.stdout.write(
    `Retained overlay compatibility passed: ` +
      `${result.passedGates} passed, ${result.heldGates} held\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
