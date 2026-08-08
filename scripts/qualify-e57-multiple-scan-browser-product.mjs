import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  qualifyBimProductShell,
} from "./qualify-bim-product-shell.mjs";

const SCHEMA =
  "bim-explorer-e57-multiple-scan-browser-product-evidence/1";
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
  "browserMultipleScanE57FileOpen",
  "fiveScanProductRuntime",
  "scanPosesAppliedLocally",
  "intensityAndStructuredIndicesRemainLossy",
  "actualWebGl2Points",
  "boundedSourceDecodeAndUpload",
  "sourceBufferCleared",
  "workerTerminatedAfterTransfer",
  "cpuPointRangeCleared",
  "gpuResourcesReleased",
  "localOnly",
  "pathFree",
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
        "scripts/qualify-e57-multiple-scan-browser-product.mjs " +
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

function exactSurface(surface) {
  return (
    surface?.schema ===
      "bim-explorer-product-shell-browser-evidence/1" &&
    surface.environment?.headless === true &&
    typeof surface.environment.browser === "string" &&
    surface.environment.browser.length > 0 &&
    surface.fixture?.id ===
      "e57-example-pump-no-invalid-multiple-scan" &&
    surface.fixture.committed === false &&
    surface.fixture.format === "e57" &&
    surface.fixture.sourceBytes === 22_146_048 &&
    surface.fixture.fingerprint === `sha256:${SOURCE_SHA256}` &&
    surface.fixture.formatVersion === "1.0" &&
    surface.fixture.pointFormat ===
      "cartesian-xyz-rgb-multiple-scan" &&
    surface.fixture.provenance?.repository ===
      "https://sourceforge.net/projects/e57-3d-imgfmt/files/" +
        "E57Example-data/" &&
    surface.fixture.provenance.sourcePage ===
      "https://e57-3d-imgfmt.sourceforge.net/data.html" &&
    surface.fixture.provenance.publishedAt ===
      "2011-05-05T21:05:19Z" &&
    surface.fixture.provenance.license ===
      "LicenseRef-E57-Example-Test-Data" &&
    surface.fixture.provenance.notice ===
      "Copyright 2008 Carnahan-Proctor and Cross, Inc." &&
    surface.fixture.provenance.bundled === false &&
    surface.fixture.provenance.sampleRedistributed === false &&
    same(surface.observation?.model, {
      points: 1_213_990,
      ranges: 1,
    }) &&
    surface.observation.resources?.sourceBytes === 22_146_048 &&
    surface.observation.resources.decodedPointBytes === 35_205_710 &&
    surface.observation.resources.pointRangeBytes === 19_423_888 &&
    surface.observation.resources.pointRangePayloadBytes ===
      19_423_840 &&
    surface.observation.resources.wasmHeapCapacityBytes === null &&
    surface.observation.renderer?.actualGpu === true &&
    surface.observation.renderer.nonBackgroundPixels > 0 &&
    surface.observation.renderer.sourceReadBytes === 19_423_888 &&
    surface.observation.renderer.uploadedBytes === 19_423_840 &&
    same(surface.observation.pointCloud?.bounds, BOUNDS) &&
    same(surface.observation.pointCloud.colorRange, {
      min: [0, 0, 0, 255],
      max: [255, 255, 255, 255],
    }) &&
    surface.observation.pointCloud.coordinateRepresentation ===
      "cartesian" &&
    same(surface.observation.pointCloud.attributeProjection, {
      ignoredFields: ["intensity", "rowIndex", "columnIndex"],
      lossiness: "lossy",
      method:
        "decode-for-stream-alignment-without-semantic-authority",
    }) &&
    same(surface.observation.pointCloud.origin, ORIGIN) &&
    surface.observation.pointCloud.rangeSha256 === RANGE_SHA256 &&
    surface.observation.pointCloud.pointPrimitive === "POINTS" &&
    surface.observation.pointCloud.decoder?.id ===
      "bim-explorer-e57-bitpack-reader" &&
    surface.observation.pointCloud.decoder.version === "0.1.0" &&
    surface.observation.pointCloud.decoder.reference?.id ===
      "cry-inc/e57" &&
    surface.observation.pointCloud.decoder.reference.version ===
      "0.10.5" &&
    surface.observation.pointCloud.coordinateReferenceStatus ===
      "unqualified" &&
    surface.observation.pointCloud.maximumProjectionError < 1e-6 &&
    surface.observation.productLifecycle?.cpuPointRangeCleared === true &&
    surface.observation.productLifecycle.sourceBufferCleared === true &&
    surface.observation.productLifecycle
      .workerTerminatedAfterTransfer === true &&
    surface.observation.lifecycle?.opened === "ready" &&
    surface.observation.lifecycle.closed === "disposed" &&
    surface.observation.lifecycle.backendDisposed === true &&
    surface.observation.lifecycle.clientDisposed === true &&
    surface.observation.lifecycle.pointRangeCleared === true &&
    surface.observation.lifecycle.rendererDisposed === true &&
    surface.observation.lifecycle.workerTerminatedAfterTransfer === true &&
    surface.observation.network?.externalOrigins?.length === 0 &&
    surface.observation.runtimeErrors?.length === 0 &&
    surface.decision?.pointCloudProductOpen ===
      "passed-bounded-read-only-unqualified-coordinates" &&
    allTrue(surface.assertions)
  );
}

export function validateE57MultipleScanBrowserProductQualification(
  report,
) {
  if (
    report?.schema !== SCHEMA ||
    report.status !==
      "passed-experimental-multiple-scan-browser-product-open" ||
    report.asOf !== "2026-08-08" ||
    !exactSurface(report.surface) ||
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
    report.decision?.browserProductOpen !== "passed-experimental" ||
    report.decision.vscodeProductOpen !== "held" ||
    report.decision.scanPose !== "passed-local-registration-only" ||
    report.decision.coordinateReference !== "held" ||
    report.decision.pointIdentityPicking !== "held" ||
    report.decision.levelOfDetail !== "held" ||
    report.decision.pointCloudCodec !== "held" ||
    report.decision.formatAdmission !== false ||
    !same(Object.keys(report.assertions ?? {}), ASSERTIONS) ||
    Object.values(report.assertions).some((value) => value !== true) ||
    /(?:\/Users\/|\/Volumes\/|[A-Z]:\\|file:\/\/)/u.test(
      JSON.stringify(report),
    )
  ) {
    throw new Error(
      "E57 multiple-scan Browser product qualification evidence " +
        "is invalid",
    );
  }
  return report;
}

export async function qualifyE57MultipleScanBrowserProduct() {
  const surface = await qualifyBimProductShell({
    fixture: "e57-multiple-scan-public",
  });
  const report = {
    schema: SCHEMA,
    status:
      "passed-experimental-multiple-scan-browser-product-open",
    asOf: "2026-08-08",
    capturedAt: new Date().toISOString(),
    surface,
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
      browserProductOpen: "passed-experimental",
      vscodeProductOpen: "held",
      renderer: "passed-browser-webgl2",
      scanPose: "passed-local-registration-only",
      coordinateReference: "held",
      pointIdentityPicking: "held",
      levelOfDetail: "held",
      pointCloudCodec: "held",
      formatAdmission: false,
    },
    assertions: Object.fromEntries(
      ASSERTIONS.map((name) => [name, true]),
    ),
    limitations: [
      "the product profile covers one E57 1.0 five-scan Cartesian intensity/RGB/structured-index default-BitPack sample",
      "scan poses establish local registration only and do not establish CRS or surveyed datum authority",
      "intensity, row and column indices are decoded for stream alignment and omitted from the RGBA display range",
      "individual point identity, picking and LOD streaming are not implemented",
      "VS Code staged and clean-installed VSIX product open remain a separate Gate",
      "SwiftShader exercises actual WebGL2 APIs but does not claim a physical GPU",
      "the public sample remains in an ignored digest cache and is not redistributed",
      "bounded Browser product open does not admit the E57 format family",
    ],
  };
  return validateE57MultipleScanBrowserProductQualification(report);
}

async function main() {
  const { output } = parseArguments(process.argv.slice(2));
  const report = await qualifyE57MultipleScanBrowserProduct();
  if (output !== null) {
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(JSON.stringify(report, null, 2));
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
