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
  "bim-explorer-e57-vscode-product-evidence/1";
const RANGE_SHA256 =
  "dcc6868c55c79a51d315bfc4b287ca38" +
  "f8217e3d572554ef56b0da77359cd6aa";
const ASSERTIONS = Object.freeze([
  "stagedE57FileOpen",
  "installedE57FileOpen",
  "sameFixtureIdentity",
  "samePointRangeProjection",
  "sameVisibleProjection",
  "boundedLocalReadOnly",
  "defaultBitPackProductRuntime",
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
      "usage: node scripts/qualify-e57-vscode-product.mjs " +
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
    value?.id === "libe57format-coloured-cube-float-e57" &&
    value.committed === false &&
    value.format === "e57" &&
    value.sourceBytes === 118_784 &&
    value.fingerprint ===
      "sha256:6dbf7972b358bd7dd0864c7893a4aa7b" +
        "61a339fd6ee27c71b3031f763c977d33" &&
    value.formatVersion === "1.0" &&
    value.pointFormat === "cartesian-xyz-rgb" &&
    value.provenance?.repository ===
      "https://github.com/asmaloney/libE57Format-test-data" &&
    value.provenance.commit ===
      "1ca737e03d6277c384f1b05c4046e10caab331b5" &&
    value.provenance.license === "CC0-1.0" &&
    value.provenance.bundled === false &&
    value.provenance.sampleRedistributed === false
  );
}

function exactObservation(value) {
  return (
    value?.hostKind === "vscode-webview" &&
    exactPointModel(value.model, 7_680, 1, 1) &&
    value.resources?.sourceBytes === 118_784 &&
    value.resources.decodedPointBytes === 215_040 &&
    value.resources.pointRangeBytes === 122_928 &&
    value.resources.pointRangePayloadBytes === 122_880 &&
    value.resources.wasmHeapCapacityBytes === null &&
    value.renderer?.actualGpu === true &&
    value.renderer.nonBackgroundPixels > 0 &&
    value.renderer.sourceReadBytes === 122_928 &&
    value.renderer.uploadedBytes === 122_880 &&
    value.pointCloud?.rangeSha256 === RANGE_SHA256 &&
    value.pointCloud.pointPrimitive === "POINTS" &&
    value.pointCloud.decoder?.id ===
      "bim-explorer-e57-bitpack-reader" &&
    value.pointCloud.decoder.version === "0.1.0" &&
    value.pointCloud.decoder.reference?.id === "cry-inc/e57" &&
    value.pointCloud.decoder.reference.version === "0.10.5" &&
    value.pointCloud.coordinateReferenceStatus ===
      "unqualified" &&
    value.pointCloud.maximumProjectionError === 0 &&
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
    [13, 14].includes(value.installedRuntimeFiles) &&
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

export function validateE57VscodeProductQualification(report) {
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
      "passed-experimental-vscode-product-open" ||
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
    installed.association?.viewType !==
      "bimExplorer.ifcEditor" ||
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
      "E57 VS Code product qualification identity is invalid",
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
    report.fixturePolicy?.artifactTracked !== false ||
    report.fixturePolicy.sampleRedistributed !== false ||
    report.fixturePolicy.releaseBundled !== false ||
    report.fixturePolicy.testOnly !== true ||
    report.decision?.stagedVscodeProductOpen !==
      "passed-experimental" ||
    report.decision.cleanInstalledVsixProductOpen !==
      "passed-experimental" ||
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
      "E57 VS Code product qualification evidence is invalid",
    );
  }
  return report;
}

export async function qualifyE57VscodeProduct({
  output = null,
} = {}) {
  const vscodeRuntime = await resolveVscodeQualificationRuntime();
  const staged = await qualifyVscodeCustomEditor({
    includePointFixtures: true,
    vscodeRuntime,
  });
  const installed = await qualifyVscodeVsixInstall({
    includePointFixtures: true,
    includePublicFixture: false,
    vscodeRuntime,
  });
  const report = {
    schema: SCHEMA,
    status: "passed-experimental-vscode-product-open",
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
        fixture: staged.pointFixtures.e57,
        observation: staged.pointObservations.e57,
        assertions: staged.pointAssertions.e57,
      },
      installed: {
        environment: installed.environment,
        package: installed.package,
        association: installed.observation.association,
        pointRuntime: {
          fixture:
            installed.observation.pointRuntime.fixtures.e57,
          observation:
            installed.observation.pointRuntime.observations.e57,
          assertions:
            installed.observation.pointRuntime.assertions.e57,
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
          installedPackageOpensE57:
            installed.assertions.installedPackageOpensE57,
          installedE57PointProjection:
            installed.assertions.installedE57PointProjection,
          installedE57VisibleProjection:
            installed.assertions.installedE57VisibleProjection,
        },
        decision: installed.decision,
      },
    },
    runtime: {
      pointSourceContract:
        "bim-explorer-e57-point-source/0.1",
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
    fixturePolicy: {
      artifactTracked: false,
      sampleRedistributed: false,
      releaseBundled: false,
      testOnly: true,
    },
    decision: {
      stagedVscodeProductOpen: "passed-experimental",
      cleanInstalledVsixProductOpen: "passed-experimental",
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
      "the product profile covers one E57 1.0 single-scan Cartesian XYZ/RGB default-BitPack sample",
      "coordinates are displayed without CRS, scan-pose or surveyed datum authority",
      "individual point identity, picking and LOD streaming are not implemented",
      "SwiftShader exercises actual WebGL2 APIs but does not claim a physical GPU",
      "the public sample remains in an ignored digest cache and is not redistributed",
      "bounded VS Code product open does not admit the E57 format family"
    ],
  };
  validateE57VscodeProductQualification(report);
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
  const report = await qualifyE57VscodeProduct(options);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
