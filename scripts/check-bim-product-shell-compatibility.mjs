import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

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
];
const HELD_GATES = [
  "publicViewerCoreConformance",
  "publicRepresentativeProductScale",
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

export function validateBimProductShellCompatibility(
  manifest,
  browser,
  vscode,
  installation,
) {
  plainRecord(manifest, "product shell manifest");
  plainRecord(browser, "Browser product shell evidence");
  plainRecord(vscode, "VS Code product shell evidence");
  plainRecord(installation, "VSIX install evidence");
  if (
    manifest.schema !==
      "bim-explorer-product-shell-compatibility/1" ||
    manifest.asOf !== "2026-08-04" ||
    manifest.status !== "experimental" ||
    browser.schema !==
      "bim-explorer-product-shell-browser-evidence/1" ||
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
      "bim-explorer-bim-source/0.1" ||
    contracts?.rendererHost !==
      "bim-explorer-bim-renderer-3d-host/0.1" ||
    contracts?.semanticExplorer !==
      "bim-explorer-bim-semantic-explorer/0.1"
  ) {
    throw new Error(
      "BIM product shell contracts are invalid",
    );
  }
  const fixture = manifest.fixture;
  const expectedFingerprint = `sha256:${fixture?.sha256}`;
  for (const evidence of [browser, vscode]) {
    if (
      evidence.fixture?.id !== fixture.id ||
      evidence.fixture?.sourceBytes !== fixture.byteLength ||
      evidence.fixture?.fingerprint !== expectedFingerprint ||
      evidence.fixture?.ifcSchema !== fixture.schema ||
      evidence.fixture?.committed !== false
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
    limits?.maximumDomRows !== 64 ||
    limits?.maximumLoadedTreeItems !== 2_000 ||
    limits?.maximumRelations !== 100 ||
    limits?.maximumSearchResults !== 500
  ) {
    throw new Error("BIM product shell limits are invalid");
  }
  if (
    !everyTrue(browser.assertions) ||
    !everyTrue(vscode.assertions) ||
    !everyTrue(installation.assertions) ||
    browser.observation?.hostKind !== "browser" ||
    vscode.observation?.hostKind !== "vscode-webview" ||
    browser.observation?.renderer?.actualGpu !== true ||
    vscode.observation?.renderer?.actualGpu !== true ||
    browser.observation.renderer.nonBackgroundPixels <= 0 ||
    vscode.observation.renderer.nonBackgroundPixels <= 0 ||
    browser.observation?.lifecycle?.closed !== "disposed" ||
    vscode.observation?.lifecycle?.closed !== "disposed"
  ) {
    throw new Error(
      "BIM product shell runtime evidence is incomplete",
    );
  }
  if (
    !equalProjection(browser, vscode) ||
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
    browser.observation?.network?.externalOrigins?.length !== 0 ||
    browser.observation.runtimeErrors?.length !== 0 ||
    vscode.observation?.externalUpload !== false ||
    vscode.observation?.telemetry !== false ||
    installation.package?.id !== "menaje.bim-explorer" ||
    installation.package?.version !== "0.0.0" ||
    installation.package?.byteLength <= 0 ||
    installation.observation?.installedExtensions?.[0] !==
      "menaje.bim-explorer@0.0.0" ||
    installation.observation?.association?.selector?.[0]
      ?.filenamePattern !== "*.ifc"
  ) {
    throw new Error(
      "BIM product shell local package evidence is invalid",
    );
  }
  if (
    manifest.evidence?.browserSynthetic !==
      "compatibility/evidence/" +
        "bim-product-shell-browser-synthetic-2026-08-04.json" ||
    manifest.evidence?.vscodeSynthetic !==
      "compatibility/evidence/" +
        "bim-product-shell-vscode-synthetic-2026-08-04.json" ||
    manifest.evidence?.vscodeCleanInstall !==
      "compatibility/evidence/" +
        "bim-product-shell-vscode-vsix-install-2026-08-04.json" ||
    manifest.policy?.readOnly !== true ||
    manifest.policy?.localOnly !== true ||
    manifest.policy?.spatialAuthority !== false ||
    manifest.policy?.claimPublicViewerCore !== false ||
    manifest.policy?.claimPublicScale !== false ||
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
  const [browser, vscode, installation] = await Promise.all([
    readFile(
      path.join(root, manifest.evidence.browserSynthetic),
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
    installation,
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
