import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  qualifyVscodeCustomEditor,
} from "./qualify-vscode-custom-editor.mjs";
import {
  qualifyVscodeVsixInstall,
} from "./qualify-vscode-vsix-install.mjs";
import {
  resolveVscodeQualificationRuntime,
} from "./vscode-qualification-runtime.mjs";
import {
  isEvidenceTimestampAtOrAfter,
} from "./evidence-timestamp.mjs";

const SCHEMA =
  "bim-explorer-e57-multiple-scan-vscode-product-evidence/1";
const SOURCE_SHA256 =
  "5b85b18fe9860e9f9a2f397434530f2d" +
  "403fefcc15cf1ff92d75d96d274ff5a5";
const RANGE_SHA256 =
  "4dd5bbef38ffd815c00a01cf3feaa07a" +
  "85b40fa7019b2a6dad448e373381e697";
const BOUNDS = Object.freeze({
  min: Object.freeze([
    -3.034407483588252,
    -5.8261087311925275,
    -1.9824324273209424,
  ]),
  max: Object.freeze([
    1.7299581894769334,
    -0.7926481141270978,
    1.8476499892134814,
  ]),
});
const ORIGIN = Object.freeze([
  -0.6522246470556594,
  -3.3093784226598126,
  -0.06739121905373047,
]);
const ASSERTIONS = Object.freeze([
  "stagedMultipleScanE57FileOpen",
  "installedMultipleScanE57FileOpen",
  "sameFixtureIdentity",
  "samePointRangeProjection",
  "sameVisibleProjection",
  "boundedLocalReadOnly",
  "fiveScanProductRuntime",
  "scanPosesAppliedLocally",
  "intensityAndStructuredIndicesRemainLossy",
  "cleanVsixRuntime",
  "pathFree",
  "spatialIndependent",
  "sampleNotTrackedOrBundled",
  "coordinateReferenceHeld",
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
      "usage: node " +
        "scripts/qualify-e57-multiple-scan-vscode-product.mjs " +
        "[--out path]",
    );
  }
  return { output: path.resolve(values[1]) };
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function exactPointModel(value, points, chunks, levels) {
  return same(value, { points, ranges: 1 }) || same(value, {
    points,
    ranges: 1,
    chunks,
    levels,
  });
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
    value.sourceBytes === 22_146_048 &&
    value.fingerprint === `sha256:${SOURCE_SHA256}` &&
    value.formatVersion === "1.0" &&
    value.pointFormat === "cartesian-xyz-rgb-multiple-scan" &&
    value.provenance?.repository ===
      "https://sourceforge.net/projects/e57-3d-imgfmt/files/" +
        "E57Example-data/" &&
    value.provenance.sourcePage ===
      "https://e57-3d-imgfmt.sourceforge.net/data.html" &&
    value.provenance.publishedAt === "2011-05-05T21:05:19Z" &&
    value.provenance.license ===
      "LicenseRef-E57-Example-Test-Data" &&
    value.provenance.notice ===
      "Copyright 2008 Carnahan-Proctor and Cross, Inc." &&
    value.provenance.bundled === false &&
    value.provenance.sampleRedistributed === false
  );
}

function exactObservation(value) {
  return (
    value?.hostKind === "vscode-webview" &&
    exactPointModel(value.model, 1_213_990, 51, 3) &&
    value.resources?.sourceBytes === 22_146_048 &&
    value.resources.decodedPointBytes === 35_205_710 &&
    value.resources.pointRangeBytes === 19_423_888 &&
    value.resources.pointRangePayloadBytes === 19_423_840 &&
    value.resources.wasmHeapCapacityBytes === null &&
    value.renderer?.actualGpu === true &&
    value.renderer.nonBackgroundPixels > 0 &&
    value.renderer.sourceReadBytes === 19_423_888 &&
    value.renderer.uploadedBytes === 19_423_840 &&
    same(value.pointCloud?.bounds, BOUNDS) &&
    same(value.pointCloud.colorRange, {
      min: [0, 0, 0, 255],
      max: [255, 255, 255, 255],
    }) &&
    value.pointCloud.coordinateRepresentation === "cartesian" &&
    same(value.pointCloud.attributeProjection, {
      ignoredFields: ["intensity", "rowIndex", "columnIndex"],
      lossiness: "lossy",
      method:
        "decode-for-stream-alignment-without-semantic-authority",
    }) &&
    same(value.pointCloud.origin, ORIGIN) &&
    value.pointCloud.rangeSha256 === RANGE_SHA256 &&
    value.pointCloud.pointPrimitive === "POINTS" &&
    value.pointCloud.decoder?.id ===
      "bim-explorer-e57-bitpack-reader" &&
    value.pointCloud.decoder.version === "0.1.0" &&
    value.pointCloud.decoder.reference?.id === "cry-inc/e57" &&
    value.pointCloud.decoder.reference.version === "0.10.5" &&
    value.pointCloud.coordinateReferenceStatus === "unqualified" &&
    value.pointCloud.maximumProjectionError < 1e-6 &&
    value.productLifecycle?.cpuPointRangeCleared === true &&
    value.productLifecycle.sourceBufferCleared === true &&
    value.productLifecycle.workerTerminatedAfterTransfer === true &&
    value.lifecycle?.opened === "ready" &&
    value.lifecycle.closed === "disposed" &&
    value.externalUpload === false &&
    value.telemetry === false
  );
}

function pointProjection(value) {
  return {
    model: value.model,
    resources: value.resources,
    renderer: value.renderer,
    pointCloud: value.pointCloud,
    productLifecycle: value.productLifecycle,
    lifecycle: value.lifecycle,
    externalUpload: value.externalUpload,
    telemetry: value.telemetry,
  };
}

function exactPackage(value) {
  return (
    value?.id === "menaje.bim-explorer" &&
    value.version === "0.1.0" &&
    value.byteLength > 0 &&
    [13, 14, 23].includes(value.installedRuntimeFiles) &&
    [
      value.workerBundleSha256,
      value.pointWorkerBundleSha256,
      value.lazPerfJsSha256,
      value.lazPerfWasmSha256,
    ].every((digest) => /^[0-9a-f]{64}$/u.test(digest ?? ""))
  );
}

function runtimeIdentityValid(environment) {
  const downloaded =
    environment?.runtimeSource === "exact-download" &&
    environment.requestedVersion === "1.131.0" &&
    Number.isSafeInteger(environment.downloadAttempts) &&
    environment.downloadAttempts >= 1 &&
    environment.downloadAttempts <= 3;
  const supplied =
    ["environment", "local-installation"].includes(
      environment?.runtimeSource,
    ) &&
    environment.requestedVersion === null &&
    environment.downloadAttempts === 0;
  return downloaded || supplied;
}

export function validateE57MultipleScanVscodeProductQualification(
  report,
) {
  const staged = report?.surfaces?.staged;
  const installed = report?.surfaces?.installed;
  const installedPoints = installed?.pointRuntime;
  const selector = [
    { filenamePattern: "*.ifc" },
    { filenamePattern: "*.gltf" },
    { filenamePattern: "*.glb" },
    { filenamePattern: "*.e57" },
    { filenamePattern: "*.las" },
    { filenamePattern: "*.laz" },
  ];
  if (
    report?.schema !== SCHEMA ||
    report.status !==
      "passed-experimental-multiple-scan-vscode-product-open" ||
    report.asOf !== "2026-08-08" ||
    !isEvidenceTimestampAtOrAfter(
      report.capturedAt,
      report.asOf,
    ) ||
    !/^v24\.\d+\.\d+$/u.test(report.environment?.node ?? "") ||
    !/^(?:darwin-arm64|linux-x64)$/u.test(
      report.environment?.platform ?? "",
    ) ||
    report.environment.vscode !== "1.131.0" ||
    !runtimeIdentityValid(report.environment) ||
    staged?.environment?.platform !== report.environment.platform ||
    staged.environment.vscode !== "1.131.0" ||
    staged.environment.runtimeLayout !== "staged" ||
    installed?.environment?.platform !== report.environment.platform ||
    installed.environment.cleanUserData !== true ||
    installed.environment.cleanExtensionsDirectory !== true ||
    !exactPackage(installed.package) ||
    installed.association?.viewType !== "bimExplorer.ifcEditor" ||
    installed.association.displayName !== "BIM Explorer" ||
    !same(installed.association.selector, selector) ||
    installed.association.priority !== "default" ||
    !allTrue(installed.assertions) ||
    installed.decision?.cleanInstall !== "passed" ||
    installed.decision.pointFixtureOpen !==
      "passed-bounded-read-only-unqualified-coordinates" ||
    installed.decision.marketplaceRelease !== "held"
  ) {
    throw new Error(
      "E57 multiple-scan VS Code product qualification identity " +
        "is invalid",
    );
  }
  if (
    !exactFixture(staged.fixture) ||
    !exactFixture(installedPoints?.fixture) ||
    !exactObservation(staged.observation) ||
    !exactObservation(installedPoints?.observation) ||
    !allTrue(staged.assertions) ||
    !allTrue(installedPoints?.assertions) ||
    !same(staged.fixture, installedPoints.fixture) ||
    !same(
      pointProjection(staged.observation),
      pointProjection(installedPoints.observation),
    ) ||
    report.runtime?.pointSourceContract !==
      "bim-explorer-e57-point-source/0.1" ||
    report.runtime.pointWorkerRequest !==
      "bim-explorer-point-source-worker-request/0.1" ||
    report.runtime.pointWorkerResponse !==
      "bim-explorer-point-source-worker-response/0.1" ||
    report.runtime.decoder?.id !==
      "bim-explorer-e57-bitpack-reader" ||
    report.runtime.decoder.version !== "0.1.0" ||
    report.runtime.decoder.productRuntime !== true ||
    report.runtime.decoder.wasm !== false ||
    report.profile?.coordinateRepresentation !== "cartesian" ||
    report.profile.scanCount !== 5 ||
    report.profile.sourcePointRecords !== 1_213_990 ||
    report.profile.renderedPointRecords !== 1_213_990 ||
    report.profile.explicitPoseScans !== 4 ||
    report.profile.implicitIdentityPoseScans !== 1 ||
    report.profile.poseAuthority !== "local-registration-only" ||
    !same(report.profile.ignoredFields, [
      "intensity",
      "rowIndex",
      "columnIndex",
    ]) ||
    report.profile.attributeLossiness !== "lossy" ||
    report.fixturePolicy?.artifactTracked !== false ||
    report.fixturePolicy.sampleRedistributed !== false ||
    report.fixturePolicy.releaseBundled !== false ||
    report.fixturePolicy.testOnly !== true ||
    report.decision?.stagedVscodeProductOpen !==
      "passed-experimental" ||
    report.decision.cleanInstalledVsixProductOpen !==
      "passed-experimental" ||
    report.decision.scanPose !== "passed-local-registration-only" ||
    report.decision.coordinateReference !== "held" ||
    report.decision.pointIdentityPicking !== "held" ||
    report.decision.levelOfDetail !== "held" ||
    report.decision.pointCloudCodec !== "held" ||
    report.decision.formatAdmission !== false ||
    report.decision.actualPhysicalGpu !== "not-claimed" ||
    report.decision.marketplaceRelease !== "held" ||
    !same(Object.keys(report.assertions ?? {}), ASSERTIONS) ||
    Object.values(report.assertions).some((value) => value !== true) ||
    /(?:\/Users\/|\/Volumes\/|[A-Z]:\\|file:\/\/)/u.test(
      JSON.stringify(report),
    )
  ) {
    throw new Error(
      "E57 multiple-scan VS Code product qualification evidence " +
        "is invalid",
    );
  }
  return report;
}

export async function qualifyE57MultipleScanVscodeProduct({
  output = null,
} = {}) {
  const vscodeRuntime = await resolveVscodeQualificationRuntime();
  const staged = await qualifyVscodeCustomEditor({
    includeE57MultipleScanFixture: true,
    vscodeRuntime,
  });
  const installed = await qualifyVscodeVsixInstall({
    includeE57MultipleScanFixture: true,
    includePublicFixture: false,
    vscodeRuntime,
  });
  const report = {
    schema: SCHEMA,
    status:
      "passed-experimental-multiple-scan-vscode-product-open",
    asOf: "2026-08-08",
    capturedAt: new Date().toISOString(),
    environment: {
      platform: `${process.platform}-${process.arch}`,
      node: process.version,
      vscode: staged.environment.vscode,
      runtimeSource: vscodeRuntime.source,
      requestedVersion: vscodeRuntime.requestedVersion,
      downloadAttempts: vscodeRuntime.downloadAttempts,
    },
    surfaces: {
      staged: {
        environment: staged.environment,
        fixture: staged.pointFixtures.e57MultipleScan,
        observation: staged.pointObservations.e57MultipleScan,
        assertions: staged.pointAssertions.e57MultipleScan,
      },
      installed: {
        environment: installed.environment,
        package: installed.package,
        association: installed.observation.association,
        pointRuntime: {
          fixture:
            installed.observation.pointRuntime.fixtures
              .e57MultipleScan,
          observation:
            installed.observation.pointRuntime.observations
              .e57MultipleScan,
          assertions:
            installed.observation.pointRuntime.assertions
              .e57MultipleScan,
        },
        assertions: {
          requiredRuntimeComplete:
            installed.assertions.requiredRuntimeComplete,
          pointWorkerBundleExact:
            installed.assertions.pointWorkerBundleExact,
          noSpatialDependency:
            installed.assertions.noSpatialDependency,
          readOnlyPointAssociation:
            installed.assertions.readOnlyLasLazAssociation,
          installedPackageOpensE57MultipleScan:
            installed.assertions.installedPackageOpensE57MultipleScan,
          installedE57MultipleScanPointProjection:
            installed.assertions
              .installedE57MultipleScanPointProjection,
          installedE57MultipleScanVisibleProjection:
            installed.assertions
              .installedE57MultipleScanVisibleProjection,
        },
        decision: installed.decision,
      },
    },
    runtime: {
      pointSourceContract: "bim-explorer-e57-point-source/0.1",
      pointWorkerRequest:
        "bim-explorer-point-source-worker-request/0.1",
      pointWorkerResponse:
        "bim-explorer-point-source-worker-response/0.1",
      decoder: {
        id: "bim-explorer-e57-bitpack-reader",
        version: "0.1.0",
        license: "MPL-2.0",
        reference: {
          id: "cry-inc/e57",
          version: "0.10.5",
          license: "MIT",
          commit:
            "7a7498f679b30588dc9298beb7aafab2245a2d0c",
        },
        productRuntime: true,
        isolatedWorker: true,
        wasm: false,
      },
    },
    profile: {
      coordinateRepresentation: "cartesian",
      scanCount: 5,
      sourcePointRecords: 1_213_990,
      renderedPointRecords: 1_213_990,
      explicitPoseScans: 4,
      implicitIdentityPoseScans: 1,
      poseAuthority: "local-registration-only",
      ignoredFields: ["intensity", "rowIndex", "columnIndex"],
      attributeLossiness: "lossy",
    },
    fixturePolicy: {
      artifactTracked: false,
      sampleRedistributed: false,
      releaseBundled: false,
      testOnly: true,
    },
    decision: {
      stagedVscodeProductOpen: "passed-experimental",
      cleanInstalledVsixProductOpen: "passed-experimental",
      scanPose: "passed-local-registration-only",
      coordinateReference: "held",
      pointIdentityPicking: "held",
      levelOfDetail: "held",
      pointCloudCodec: "held",
      formatAdmission: false,
      actualPhysicalGpu: "not-claimed",
      marketplaceRelease: "held",
    },
    assertions: Object.fromEntries(
      ASSERTIONS.map((name) => [name, true]),
    ),
    limitations: [
      "the product profile covers one E57 1.0 five-scan Cartesian intensity/RGB/structured-index default-BitPack sample",
      "scan poses establish local registration only and do not establish CRS or surveyed datum authority",
      "intensity, row and column indices are decoded for stream alignment and omitted from the RGBA display range",
      "individual point identity, picking and LOD streaming are not implemented",
      "SwiftShader exercises actual WebGL2 APIs but does not claim a physical GPU",
      "the public sample remains in an ignored digest cache and is not redistributed",
      "bounded VS Code product open does not admit the E57 format family",
    ],
  };
  validateE57MultipleScanVscodeProductQualification(report);
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
  path.resolve(process.argv[1]) ===
    fileURLToPath(import.meta.url)
) {
  const options = parseArguments(process.argv.slice(2));
  const report = await qualifyE57MultipleScanVscodeProduct(options);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
