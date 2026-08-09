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

const SCHEMA =
  "bim-explorer-derived-point-lod-product-evidence/1";
const HIERARCHY_CONTRACT =
  "bim-explorer-derived-point-hierarchy/0.1";
const LOD_RECEIPT =
  "bim-explorer-derived-point-lod-range-receipt/0.1";
const PICK_RECEIPT =
  "bim-explorer-bounded-point-renderer-pick-receipt/0.1";
const SOURCE_BYTES = 22_146_048;
const SOURCE_POINTS = 1_213_990;
const SOURCE_FINGERPRINT =
  "sha256:5b85b18fe9860e9f9a2f397434530f2d403fefcc15cf1ff92" +
  "d75d96d274ff5a5";
const ROOT_RANGE_SHA256 =
  "4dd5bbef38ffd815c00a01cf3feaa07a85b40fa7019b2a6dad448e373381e697";
const COARSE_RANGE_SHA256 =
  "4d58d66605cc3bb2c836a73c8429c0216a6b5c1cd17158fd9885f903e47c3088";
const HIERARCHY_DIGEST =
  "052dbc5c8ebf62b423e88cb8a5c5369f7eb45c1f13eabbd3a4b3c6a0219b222f";
const HIERARCHY_ID =
  "point-hierarchy:052dbc5c8ebf62b423e88cb8";
const SELECTION_SHA256 =
  "c45d3d3500cd2f76341d60c7bde28b0b79cc7674d372046a0d1851a0d3a30cf3";
const ROOT_RANGE_HANDLE =
  "range:e57:multiple-scan:4dd5bbef38ffd815c00a01cf";
const LEVELS = Object.freeze([
  Object.freeze({
    fullDetail: false,
    id: "lod:0",
    index: 0,
    pointCount: 31_971,
    rangeBytes: 511_584,
    stride: 38,
  }),
  Object.freeze({
    fullDetail: false,
    id: "lod:1",
    index: 1,
    pointCount: 242_821,
    rangeBytes: 3_885_184,
    stride: 5,
  }),
  Object.freeze({
    fullDetail: true,
    id: "lod:2",
    index: 2,
    pointCount: SOURCE_POINTS,
    rangeBytes: 19_423_888,
    stride: 1,
  }),
]);
const ASSERTIONS = Object.freeze([
  "cacheOnlyPublicFixture",
  "browserDerivedHierarchyLod",
  "stagedVscodeDerivedHierarchyLod",
  "cleanInstalledVsixDerivedHierarchyLod",
  "deterministicOctreeLeafChunks",
  "boundedCoarseInitialRange",
  "coarseToFullLifecycle",
  "stableRootRangePointIdentity",
  "renderedRangeIdentitySeparated",
  "identityMapReleasedPerTransition",
  "hierarchyResourcesReleased",
  "actualProductWebGl2",
  "localOnlyPathFree",
  "sampleNotTrackedRedistributedOrBundled",
  "coordinateReferenceHeld",
  "sourceNativeHierarchyHeld",
  "formatAdmissionHeld",
]);

function parseArguments(values) {
  if (values.length === 0) {
    return { output: null };
  }
  if (
    values.length !== 2 ||
    !["--out", "--output"].includes(values[0]) ||
    typeof values[1] !== "string" ||
    values[1].startsWith("-")
  ) {
    throw new TypeError(
      "usage: node scripts/qualify-point-cloud-lod-products.mjs " +
        "[--out path]",
    );
  }
  return { output: path.resolve(values[1]) };
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function allTrue(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0 &&
    Object.values(value).every((item) => item === true)
  );
}

function exactFixture(value) {
  return (
    value?.id === "e57-example-pump-no-invalid-multiple-scan" &&
    value.committed === false &&
    value.format === "e57" &&
    value.sourceBytes === SOURCE_BYTES &&
    value.fingerprint === SOURCE_FINGERPRINT &&
    value.formatVersion === "1.0" &&
    value.pointFormat === "cartesian-xyz-rgb-multiple-scan" &&
    value.provenance?.bundled === false &&
    value.provenance.sampleRedistributed === false
  );
}

function exactLod(value, level) {
  return (
    value?.fullDetail === level.fullDetail &&
    value.hierarchyId === HIERARCHY_ID &&
    value.levelId === level.id &&
    value.selectionSha256 === SELECTION_SHA256 &&
    value.chunkCount === 51 &&
    value.levelIndex === level.index &&
    value.pointCount === level.pointCount &&
    value.stride === level.stride
  );
}

function exactPick(value, {
  pointIndex,
  renderedPointIndex,
  renderedRangeSha256,
}) {
  const identity = value?.identity;
  const backend = value?.backend;
  return (
    value?.schema === PICK_RECEIPT &&
    value.status === "hit" &&
    value.coordinates?.origin === "canvas-top-left" &&
    Number.isSafeInteger(value.coordinates.x) &&
    Number.isSafeInteger(value.coordinates.y) &&
    identity?.authority === "derived-point-range-order" &&
    identity.nativeId === `point:${pointIndex}` &&
    identity.pointIndex === pointIndex &&
    identity.renderedPointIndex === renderedPointIndex &&
    identity.rangeHandleId === ROOT_RANGE_HANDLE &&
    identity.rangeSha256 === ROOT_RANGE_SHA256 &&
    typeof identity.renderedRangeHandleId === "string" &&
    identity.renderedRangeHandleId.length > 0 &&
    identity.renderedRangeSha256 === renderedRangeSha256 &&
    Array.isArray(value.worldPosition) &&
    value.worldPosition.length === 3 &&
    value.worldPosition.every(Number.isFinite) &&
    backend?.actualGpu === true &&
    backend.backendId === "webgl2-points" &&
    backend.pointIndex === renderedPointIndex &&
    backend.drawCalls === 1 &&
    backend.temporaryTargetBytes === 2_160_000 &&
    backend.temporaryReleased === true &&
    backend.glError === 0
  );
}

function exactHierarchy(value) {
  return (
    value?.contract === HIERARCHY_CONTRACT &&
    value.digest === HIERARCHY_DIGEST &&
    value.hierarchyId === HIERARCHY_ID &&
    value.initialLevelId === "lod:0" &&
    (
      value.chunkCount === 51 ||
      (
        Array.isArray(value.chunks) &&
        value.chunks.length === 51 &&
        new Set(value.chunks.map((chunk) => chunk?.id)).size === 51
      )
    ) &&
    value.depth === 2 &&
    value.sourcePointCount === SOURCE_POINTS &&
    same(value.levels, LEVELS)
  );
}

function exactTransition(value, expected) {
  return (
    value?.fromLevelId === expected.from &&
    value.hierarchyId === HIERARCHY_ID &&
    value.toLevelId === expected.to &&
    value.identityMapBytes === expected.identityMapBytes &&
    value.points === expected.points &&
    value.rangeBytes === expected.rangeBytes &&
    value.releasedBytes === expected.releasedBytes &&
    value.releasedIdentityMapBytes ===
      expected.releasedIdentityMapBytes &&
    value.uploadedBytes === expected.uploadedBytes
  );
}

function exactObservation(value, hostKind) {
  const hierarchy = value?.pointCloud?.hierarchy;
  const initial = value?.initialPointLod;
  const cleanup = value?.productLifecycle?.hierarchyCleanup;
  return (
    value?.hostKind === hostKind &&
    same(value.model, {
      points: SOURCE_POINTS,
      ranges: 1,
      chunks: 51,
      levels: 3,
    }) &&
    value.resources?.hierarchyIndexBytes === 4_855_960 &&
    value.resources.hierarchyRetainedBytes === 24_279_848 &&
    value.resources.initialPointRangeBytes === 511_584 &&
    value.resources.pointRangeBytes === 19_423_888 &&
    value.resources.pointRangePayloadBytes === 19_423_840 &&
    value.renderer?.actualGpu === true &&
    value.renderer.nonBackgroundPixels > 0 &&
    value.renderer.sourceReadBytes === 19_423_888 &&
    value.renderer.uploadedBytes === 19_423_840 &&
    value.pointCloud?.rangeSha256 === ROOT_RANGE_SHA256 &&
    value.pointCloud.renderedRangeSha256 === ROOT_RANGE_SHA256 &&
    value.pointCloud.coordinateReferenceStatus === "unqualified" &&
    exactHierarchy(hierarchy) &&
    exactLod(value.pointCloud.lod, LEVELS[2]) &&
    initial?.lifecycle?.workerTerminatedAfterTransfer === false &&
    [undefined, null].includes(
      initial.lifecycle.hierarchyCleanup,
    ) &&
    exactLod(initial.lod, LEVELS[0]) &&
    initial.renderer?.actualGpu === true &&
    initial.renderer.nonBackgroundPixels > 0 &&
    initial.renderer.sourceReadBytes === 511_584 &&
    initial.renderer.uploadedBytes === 511_536 &&
    initial.renderedRangeSha256 === COARSE_RANGE_SHA256 &&
    exactPick(initial.pointSelection, {
      pointIndex: 918_699,
      renderedPointIndex: 20_935,
      renderedRangeSha256: COARSE_RANGE_SHA256,
    }) &&
    exactPick(value.pointSelection, {
      pointIndex: 536_823,
      renderedPointIndex: 536_823,
      renderedRangeSha256: ROOT_RANGE_SHA256,
    }) &&
    Array.isArray(value.lodTransitions) &&
    value.lodTransitions.length === 2 &&
    exactTransition(value.lodTransitions[0], {
      from: "lod:0",
      to: "lod:1",
      identityMapBytes: 971_284,
      points: 242_821,
      rangeBytes: 3_885_184,
      releasedBytes: 511_536,
      releasedIdentityMapBytes: 127_884,
      uploadedBytes: 3_885_136,
    }) &&
    exactTransition(value.lodTransitions[1], {
      from: "lod:1",
      to: "lod:2",
      identityMapBytes: 0,
      points: SOURCE_POINTS,
      rangeBytes: 19_423_888,
      releasedBytes: 3_885_136,
      releasedIdentityMapBytes: 971_284,
      uploadedBytes: 19_423_840,
    }) &&
    value.productLifecycle?.cpuPointRangeCleared === true &&
    value.productLifecycle.sourceBufferCleared === true &&
    value.productLifecycle.workerTerminatedAfterTransfer === true &&
    cleanup?.disposed === true &&
    cleanup.hierarchyId === HIERARCHY_ID &&
    cleanup.indexBytes === 0 &&
    cleanup.retainedBytes === 0 &&
    cleanup.rootRangeBytes === 0 &&
    value.lifecycle?.opened === "ready" &&
    value.lifecycle.closed === "disposed" &&
    (
      hostKind === "browser"
        ? value.network?.externalOrigins?.length === 0 &&
          value.runtimeErrors?.length === 0
        : value.externalUpload === false && value.telemetry === false
    )
  );
}

function exactPackage(value) {
  return (
    value?.id === "menaje.bim-explorer" &&
    value.version === "0.1.0" &&
    value.byteLength > 0 &&
    [14, 23].includes(value.installedRuntimeFiles) &&
    [
      value.workerBundleSha256,
      value.pointWorkerBundleSha256,
      value.lazPerfJsSha256,
      value.lazPerfWasmSha256,
    ].every((digest) => /^[0-9a-f]{64}$/u.test(digest ?? ""))
  );
}

export function validatePointCloudLodProductQualification(report) {
  const browser = report?.surfaces?.browser;
  const staged = report?.surfaces?.staged;
  const installed = report?.surfaces?.installed;
  const surfaceChecks = {
    browserAssertions: allTrue(browser?.assertions),
    browserFixture: exactFixture(browser?.fixture),
    browserObservation: exactObservation(
      browser?.observation,
      "browser",
    ),
    installedAssertions: allTrue(installed?.assertions),
    installedFixture: exactFixture(installed?.fixture),
    installedObservation: exactObservation(
      installed?.observation,
      "vscode-webview",
    ),
    installedPackage: exactPackage(installed?.package),
    stagedAssertions: allTrue(staged?.assertions),
    stagedFixture: exactFixture(staged?.fixture),
    stagedObservation: exactObservation(
      staged?.observation,
      "vscode-webview",
    ),
  };
  if (
    report?.schema !== SCHEMA ||
    report.status !== "passed-derived-point-hierarchy-lod-products" ||
    report.asOf !== "2026-08-09" ||
    browser?.schema !==
      "bim-explorer-product-shell-browser-evidence/1" ||
    browser.environment?.headless !== true ||
    !surfaceChecks.browserFixture ||
    !surfaceChecks.browserObservation ||
    !surfaceChecks.browserAssertions ||
    staged?.environment?.runtimeLayout !== "staged" ||
    !surfaceChecks.stagedFixture ||
    !surfaceChecks.stagedObservation ||
    !surfaceChecks.stagedAssertions ||
    installed?.environment?.cleanUserData !== true ||
    installed.environment.cleanExtensionsDirectory !== true ||
    !surfaceChecks.installedPackage ||
    !surfaceChecks.installedFixture ||
    !surfaceChecks.installedObservation ||
    !surfaceChecks.installedAssertions ||
    report.runtime?.hierarchyContract !== HIERARCHY_CONTRACT ||
    report.runtime.lodRangeReceipt !== LOD_RECEIPT ||
    report.runtime.pointPickReceipt !== PICK_RECEIPT ||
    report.runtime.pointWorkerRequest !==
      "bim-explorer-point-source-worker-request/0.2" ||
    report.runtime.pointWorkerResponse !==
      "bim-explorer-point-source-worker-response/0.2" ||
    !same(report.runtime.levelPointBudgets, [32_768, 262_144]) ||
    report.runtime.identityAuthority !== "derived-point-range-order" ||
    report.runtime.identityScope !==
      "source-revision-and-root-range-digest" ||
    report.decision?.derivedPointHierarchy !== "passed" ||
    report.decision.derivedPointChunking !== "passed" ||
    report.decision.derivedPointLevelOfDetail !== "passed" ||
    report.decision.stableRootRangeIdentity !== "passed" ||
    report.decision.sourceNativeHierarchy !== "held" ||
    report.decision.sourceNativePointSemantics !== "held" ||
    report.decision.coordinateReference !== "held" ||
    report.decision.pointCloudCodec !== "held" ||
    report.decision.formatAdmission !== false ||
    !same(Object.keys(report.assertions ?? {}), ASSERTIONS) ||
    Object.values(report.assertions).some((value) => value !== true) ||
    /(?:\/Users\/|\/Volumes\/|[A-Z]:\\|file:\/\/)/u.test(
      JSON.stringify(report),
    )
  ) {
    throw new Error(
      "point-cloud LOD product qualification evidence is invalid: " +
        JSON.stringify(surfaceChecks),
    );
  }
  return report;
}

export async function qualifyPointCloudLodProducts({
  output = null,
} = {}) {
  const vscodeRuntime = await resolveVscodeQualificationRuntime();
  const browser = await qualifyBimProductShell({
    fixture: "e57-multiple-scan-public",
  });
  const stagedRuntime = await qualifyVscodeCustomEditor({
    includeE57MultipleScanFixture: true,
    vscodeRuntime,
  });
  const installedRuntime = await qualifyVscodeVsixInstall({
    includeE57MultipleScanFixture: true,
    includePublicFixture: false,
    vscodeRuntime,
  });
  const report = {
    schema: SCHEMA,
    status: "passed-derived-point-hierarchy-lod-products",
    asOf: "2026-08-09",
    capturedAt: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      vscode: stagedRuntime.environment.vscode,
      runtimeSource: vscodeRuntime.source,
      requestedVersion: vscodeRuntime.requestedVersion,
      downloadAttempts: vscodeRuntime.downloadAttempts,
    },
    surfaces: {
      browser,
      staged: {
        environment: stagedRuntime.environment,
        fixture: stagedRuntime.pointFixtures.e57MultipleScan,
        observation:
          stagedRuntime.pointObservations.e57MultipleScan,
        assertions:
          stagedRuntime.pointAssertions.e57MultipleScan,
      },
      installed: {
        environment: installedRuntime.environment,
        package: installedRuntime.package,
        fixture:
          installedRuntime.observation.pointRuntime.fixtures
            .e57MultipleScan,
        observation:
          installedRuntime.observation.pointRuntime.observations
            .e57MultipleScan,
        assertions:
          installedRuntime.observation.pointRuntime.assertions
            .e57MultipleScan,
      },
    },
    runtime: {
      hierarchyContract: HIERARCHY_CONTRACT,
      lodRangeReceipt: LOD_RECEIPT,
      pointPickReceipt: PICK_RECEIPT,
      pointWorkerRequest:
        "bim-explorer-point-source-worker-request/0.2",
      pointWorkerResponse:
        "bim-explorer-point-source-worker-response/0.2",
      chunking: "derived-octree-leaf-pages",
      levelPointBudgets: [32_768, 262_144],
      identityAuthority: "derived-point-range-order",
      identityScope: "source-revision-and-root-range-digest",
      actualPhysicalGpu: "not-claimed",
    },
    fixturePolicy: {
      artifactTracked: false,
      releaseBundled: false,
      sampleRedistributed: false,
      testOnly: true,
    },
    decision: {
      derivedPointHierarchy: "passed",
      derivedPointChunking: "passed",
      derivedPointLevelOfDetail: "passed",
      stableRootRangeIdentity: "passed",
      sourceNativeHierarchy: "held",
      sourceNativePointSemantics: "held",
      coordinateReference: "held",
      pointCloudCodec: "held",
      formatAdmission: false,
      marketplaceRelease: "held",
    },
    assertions: Object.fromEntries(
      ASSERTIONS.map((name) => [name, true]),
    ),
    limitations: [
      "the hierarchy is derived locally from one exact projected point range and is not a source-native E57, LAS or LAZ hierarchy",
      "point:n remains a derived root-range-order identity and does not claim source-declared point semantics",
      "scan poses provide local registration only and do not establish CRS or surveyed datum authority",
      "the cache-only public E57 sample is not tracked, redistributed or bundled in Git, VSIX or release artifacts",
      "SwiftShader exercises actual Browser and VS Code WebGL2 APIs but does not claim a physical GPU",
      "derived hierarchy and LOD qualification does not admit E57, LAS, LAZ or federation pointCloudCodec support",
    ],
  };
  validatePointCloudLodProductQualification(report);
  if (output !== null) {
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(
      output,
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8",
    );
  }
  return report;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const options = parseArguments(process.argv.slice(2));
  const report = await qualifyPointCloudLodProducts(options);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
