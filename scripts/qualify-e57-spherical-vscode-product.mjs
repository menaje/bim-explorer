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
  "bim-explorer-e57-spherical-vscode-product-evidence/1";
const SOURCE_SHA256 =
  "268b42e69bbbad85703933f24626b9773" +
  "6ec703b0a7c34550dcb6ed0830317e3";
const RANGE_SHA256 =
  "b0a0c2cd5cb5f3a051d208332824318e" +
  "7561e1098ef24a4dd718e460b3fd303f";
const ASSERTIONS = Object.freeze([
  "stagedSphericalE57FileOpen",
  "installedSphericalE57FileOpen",
  "sameFixtureIdentity",
  "samePointRangeProjection",
  "sameVisibleProjection",
  "boundedLocalReadOnly",
  "sphericalProductRuntime",
  "invalidRecordsFiltered",
  "intensityProjectionRemainsLossy",
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
      "usage: node scripts/qualify-e57-spherical-vscode-product.mjs " +
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
    value?.id === "e57-example-pump-a-spherical" &&
    value.committed === false &&
    value.format === "e57" &&
    value.sourceBytes === 5_168_128 &&
    value.fingerprint === `sha256:${SOURCE_SHA256}` &&
    value.formatVersion === "1.0" &&
    value.pointFormat === "spherical-rae-rgb" &&
    value.provenance?.repository ===
      "https://sourceforge.net/projects/e57-3d-imgfmt/files/" +
        "E57Example-data/" &&
    value.provenance.sourcePage ===
      "https://e57-3d-imgfmt.sourceforge.net/data.html" &&
    value.provenance.publishedAt === "2011-05-04T23:26:44Z" &&
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
    exactPointModel(value.model, 155_201, 8, 2) &&
    value.resources?.sourceBytes === 5_168_128 &&
    value.resources.decodedPointBytes === 10_745_370 &&
    value.resources.pointRangeBytes === 2_483_264 &&
    value.resources.pointRangePayloadBytes === 2_483_216 &&
    value.resources.wasmHeapCapacityBytes === null &&
    value.renderer?.actualGpu === true &&
    value.renderer.nonBackgroundPixels > 0 &&
    value.renderer.sourceReadBytes === 2_483_264 &&
    value.renderer.uploadedBytes === 2_483_216 &&
    same(value.pointCloud?.colorRange, {
      min: [0, 2, 0, 255],
      max: [255, 255, 255, 255],
    }) &&
    value.pointCloud.coordinateRepresentation === "spherical" &&
    same(value.pointCloud.attributeProjection, {
      ignoredFields: ["intensity"],
      lossiness: "lossy",
      method:
        "decode-for-stream-alignment-without-semantic-authority",
    }) &&
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
    [13, 14, 23, 24].includes(value.installedRuntimeFiles) &&
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

export function validateE57SphericalVscodeProductQualification(
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
      "passed-experimental-spherical-vscode-product-open" ||
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
      "E57 spherical VS Code product qualification identity is invalid",
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
    report.profile?.coordinateRepresentation !== "spherical" ||
    report.profile.sourcePointRecords !== 370_530 ||
    report.profile.renderedPointRecords !== 155_201 ||
    report.profile.invalidPointRecords !== 215_329 ||
    !same(report.profile.ignoredFields, ["intensity"]) ||
    report.profile.attributeLossiness !== "lossy" ||
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
      "E57 spherical VS Code product qualification evidence is invalid",
    );
  }
  return report;
}

export async function qualifyE57SphericalVscodeProduct({
  output = null,
} = {}) {
  const vscodeRuntime = await resolveVscodeQualificationRuntime();
  const staged = await qualifyVscodeCustomEditor({
    includeE57SphericalFixture: true,
    vscodeRuntime,
  });
  const installed = await qualifyVscodeVsixInstall({
    includeE57SphericalFixture: true,
    includePublicFixture: false,
    vscodeRuntime,
  });
  const report = {
    schema: SCHEMA,
    status:
      "passed-experimental-spherical-vscode-product-open",
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
        fixture: staged.pointFixtures.e57Spherical,
        observation: staged.pointObservations.e57Spherical,
        assertions: staged.pointAssertions.e57Spherical,
      },
      installed: {
        environment: installed.environment,
        package: installed.package,
        association: installed.observation.association,
        pointRuntime: {
          fixture:
            installed.observation.pointRuntime.fixtures.e57Spherical,
          observation:
            installed.observation.pointRuntime.observations
              .e57Spherical,
          assertions:
            installed.observation.pointRuntime.assertions
              .e57Spherical,
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
          installedPackageOpensE57Spherical:
            installed.assertions.installedPackageOpensE57Spherical,
          installedE57SphericalPointProjection:
            installed.assertions
              .installedE57SphericalPointProjection,
          installedE57SphericalVisibleProjection:
            installed.assertions
              .installedE57SphericalVisibleProjection,
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
      coordinateRepresentation: "spherical",
      sourcePointRecords: 370_530,
      renderedPointRecords: 155_201,
      invalidPointRecords: 215_329,
      ignoredFields: ["intensity"],
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
      "the product profile covers one E57 1.0 single-scan spherical RAE/intensity/RGB default-BitPack sample",
      "intensity is decoded for stream alignment and intentionally omitted from the RGBA display range",
      "coordinates are displayed without CRS, scan-pose or surveyed datum authority",
      "individual point identity, picking and LOD streaming are not implemented",
      "SwiftShader exercises actual WebGL2 APIs but does not claim a physical GPU",
      "the public sample remains in an ignored digest cache and is not redistributed",
      "bounded VS Code product open does not admit the E57 format family",
    ],
  };
  validateE57SphericalVscodeProductQualification(report);
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
  const report = await qualifyE57SphericalVscodeProduct(options);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
