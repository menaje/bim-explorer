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
  "bim-explorer-las-laz-vscode-product-evidence/1";
const RANGE_SHA256 =
  "8383abce84d57b8f50ee1f39aa1d442a" +
  "7f258cd759ab9812aff1a0625ab10449";
const ASSERTIONS = Object.freeze([
  "stagedLasFileOpen",
  "stagedLazFileOpen",
  "installedLasFileOpen",
  "installedLazFileOpen",
  "sameFixtureIdentity",
  "samePointRangeProjection",
  "sameVisibleProjection",
  "boundedLocalReadOnly",
  "strictCspDecoderRuntime",
  "cleanVsixRuntime",
  "pathFree",
  "spatialIndependent",
  "sampleNotTrackedOrBundled",
  "coordinateReferenceHeld",
  "formatAdmissionHeld",
]);
const FIXTURES = Object.freeze({
  las: Object.freeze({
    bytes: 347_061,
    decoder: "las-point-record-reader",
    fingerprint:
      "sha256:dbe194dd8529300f341a591e0b2e2ac5" +
      "7a96880db6dffa120dc1a41465026852",
    id: "loaders-gl-ripple-las-laz-las",
  }),
  laz: Object.freeze({
    bytes: 53_952,
    decoder: "laz-perf",
    fingerprint:
      "sha256:64cc16cf7b38d3ec3d13e96b7af66bf" +
      "887be2a5d35d55e86c41fd38fa79c9034",
    id: "loaders-gl-ripple-las-laz-laz",
  }),
});

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
      "usage: node scripts/qualify-las-laz-vscode-product.mjs " +
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

function exactFixture(value, format) {
  const expected = FIXTURES[format];
  return (
    value?.id === expected.id &&
    value.committed === false &&
    value.format === format &&
    value.sourceBytes === expected.bytes &&
    value.fingerprint === expected.fingerprint &&
    value.formatVersion === "1.2" &&
    value.pointFormat === 3 &&
    value.provenance?.repository ===
      "https://github.com/visgl/loaders.gl" &&
    value.provenance.commit ===
      "44e7a4e978a63fad0ee257fedb688826f5f279e5" &&
    value.provenance.license === "MIT" &&
    value.provenance.bundled === false &&
    value.provenance.sampleRedistributed === false
  );
}

function exactObservation(value, format) {
  const expected = FIXTURES[format];
  const heap = value?.resources?.wasmHeapCapacityBytes;
  const heapValid = format === "las"
    ? heap === null
    : (
        heap?.afterInitialization === 262_144 &&
        heap.afterDecode === 4_063_232 &&
        heap.peakObserved === 4_063_232
      );
  return (
    value?.hostKind === "vscode-webview" &&
    exactPointModel(value.model, 10_201, 1, 1) &&
    value.resources?.sourceBytes === expected.bytes &&
    value.resources.decodedPointBytes === 346_834 &&
    value.resources.pointRangeBytes === 163_264 &&
    value.resources.pointRangePayloadBytes === 163_216 &&
    heapValid &&
    value.renderer?.actualGpu === true &&
    value.renderer.nonBackgroundPixels > 0 &&
    value.renderer.sourceReadBytes === 163_264 &&
    value.renderer.uploadedBytes === 163_216 &&
    value.pointCloud?.rangeSha256 === RANGE_SHA256 &&
    value.pointCloud.pointPrimitive === "POINTS" &&
    value.pointCloud.decoder?.id === expected.decoder &&
    value.pointCloud.coordinateReferenceStatus ===
      "unqualified" &&
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

export function validateLasLazVscodeProductQualification(report) {
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
    staged?.environment?.platform !==
      report.environment.platform ||
    staged.environment.vscode !== "1.131.0" ||
    staged.environment.runtimeLayout !== "staged" ||
    installed?.environment?.platform !==
      report.environment.platform ||
    installed.environment.cleanUserData !== true ||
    installed.environment.cleanExtensionsDirectory !== true ||
    !exactPackage(installed.package) ||
    installed.association?.viewType !==
      "bimExplorer.ifcEditor" ||
    installed.association.displayName !== "BIM Explorer" ||
    !same(installed.association.selector, selector) ||
    installed.association.priority !== "default" ||
    installed.dependencies?.["laz-perf"] !== "0.0.6" ||
    installed.dependencies?.["web-ifc"] !== "0.0.77" ||
    !allTrue(installed.assertions) ||
    installed.decision?.cleanInstall !== "passed" ||
    installed.decision.pointFixtureOpen !==
      "passed-bounded-read-only-unqualified-coordinates" ||
    installed.decision.marketplaceRelease !== "held"
  ) {
    throw new Error(
      "LAS/LAZ VS Code product qualification identity is invalid",
    );
  }
  for (const format of ["las", "laz"]) {
    if (
      !exactFixture(staged.fixtures?.[format], format) ||
      !exactFixture(installedPoints?.fixtures?.[format], format) ||
      !exactObservation(staged.observations?.[format], format) ||
      !exactObservation(
        installedPoints?.observations?.[format],
        format,
      ) ||
      !allTrue(staged.assertions?.[format]) ||
      !allTrue(installedPoints?.assertions?.[format]) ||
      !same(
        staged.fixtures[format],
        installedPoints.fixtures[format],
      ) ||
      !same(
        pointProjection(staged.observations[format]),
        pointProjection(installedPoints.observations[format]),
      )
    ) {
      throw new Error(
        `LAS/LAZ VS Code ${format} surface is invalid`,
      );
    }
  }
  const stagedLas = staged.observations.las;
  const stagedLaz = staged.observations.laz;
  if (
    !same(stagedLas.model, stagedLaz.model) ||
    !same(stagedLas.pointCloud.bounds, stagedLaz.pointCloud.bounds) ||
    !same(
      stagedLas.pointCloud.colorRange,
      stagedLaz.pointCloud.colorRange,
    ) ||
    !same(stagedLas.pointCloud.origin, stagedLaz.pointCloud.origin) ||
    stagedLas.pointCloud.rangeSha256 !== RANGE_SHA256 ||
    stagedLaz.pointCloud.rangeSha256 !== RANGE_SHA256 ||
    stagedLas.renderer.nonBackgroundPixels !==
      stagedLaz.renderer.nonBackgroundPixels ||
    report.parity?.points !== 10_201 ||
    report.parity.pointRangeBytes !== 163_264 ||
    report.parity.pointRangePayloadBytes !== 163_216 ||
    report.parity.pointRangeSha256 !== RANGE_SHA256 ||
    report.parity.nonBackgroundPixels !==
      stagedLas.renderer.nonBackgroundPixels ||
    report.runtime?.pointSourceContract !==
      "bim-explorer-las-laz-point-source/0.1" ||
    report.runtime.pointWorkerRequest !==
      "bim-explorer-point-source-worker-request/0.1" ||
    report.runtime.pointWorkerResponse !==
      "bim-explorer-point-source-worker-response/0.1" ||
    report.runtime.lazDecoder?.id !== "laz-perf" ||
    report.runtime.lazDecoder.version !== "0.0.6" ||
    report.runtime.lazDecoder.license !== "Apache-2.0" ||
    report.runtime.lazDecoder.strictCspAdaptation !== true ||
    report.runtime.lazDecoder.webviewUnsafeEval !== false ||
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
      "LAS/LAZ VS Code product qualification evidence is invalid",
    );
  }
  return report;
}

export async function qualifyLasLazVscodeProduct({
  output = null,
} = {}) {
  const vscodeRuntime =
    await resolveVscodeQualificationRuntime();
  const staged = await qualifyVscodeCustomEditor({
    includePointFixtures: true,
    vscodeRuntime,
  });
  const installed = await qualifyVscodeVsixInstall({
    includePointFixtures: true,
    includePublicFixture: false,
    vscodeRuntime,
  });
  const stagedLas = staged.pointObservations.las;
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
        fixtures: staged.pointFixtures,
        observations: staged.pointObservations,
        assertions: staged.pointAssertions,
      },
      installed: {
        environment: installed.environment,
        package: installed.package,
        association: installed.observation.association,
        dependencies: installed.observation.dependencies,
        pointRuntime: installed.observation.pointRuntime,
        assertions: {
          requiredRuntimeComplete:
            installed.assertions.requiredRuntimeComplete,
          pointWorkerBundleExact:
            installed.assertions.pointWorkerBundleExact,
          lazPerfRuntimeExact:
            installed.assertions.lazPerfRuntimeExact,
          noSpatialDependency:
            installed.assertions.noSpatialDependency,
          readOnlyLasLazAssociation:
            installed.assertions.readOnlyLasLazAssociation,
          installedPackageOpensLas:
            installed.assertions.installedPackageOpensLas,
          installedPackageOpensLaz:
            installed.assertions.installedPackageOpensLaz,
          installedPointRangeParity:
            installed.assertions.installedPointRangeParity,
          installedPointVisualParity:
            installed.assertions.installedPointVisualParity,
        },
        decision: installed.decision,
      },
    },
    parity: {
      points: stagedLas.model.points,
      pointRangeBytes: stagedLas.resources.pointRangeBytes,
      pointRangePayloadBytes:
        stagedLas.resources.pointRangePayloadBytes,
      pointRangeSha256: stagedLas.pointCloud.rangeSha256,
      nonBackgroundPixels:
        stagedLas.renderer.nonBackgroundPixels,
    },
    runtime: {
      pointSourceContract:
        "bim-explorer-las-laz-point-source/0.1",
      pointWorkerRequest:
        "bim-explorer-point-source-worker-request/0.1",
      pointWorkerResponse:
        "bim-explorer-point-source-worker-response/0.1",
      lazDecoder: {
        id: "laz-perf",
        version: "0.0.6",
        license: "Apache-2.0",
        strictCspAdaptation: true,
        webviewUnsafeEval: false,
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
      "the product profile covers one paired LAS 1.2 point-format 3 sample",
      "coordinates are displayed without CRS or surveyed datum authority",
      "individual point identity, picking and LOD streaming are not implemented",
      "the CSP adaptation changes generated Emscripten glue but not laz-perf WASM",
      "SwiftShader exercises actual WebGL2 APIs but does not claim a physical GPU",
      "the public sample remains in an ignored digest cache and is not redistributed",
      "bounded VS Code product open does not admit the LAS/LAZ format family",
    ],
  };
  validateLasLazVscodeProductQualification(report);
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
  const report = await qualifyLasLazVscodeProduct(options);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
