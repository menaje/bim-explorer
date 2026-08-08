import { writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  qualifyBimProductShell,
} from "./qualify-bim-product-shell.mjs";

const SOURCE_SHA256 =
  "268b42e69bbbad85703933f24626b9773" +
  "6ec703b0a7c34550dcb6ed0830317e3";
const RANGE_SHA256 =
  "b0a0c2cd5cb5f3a051d208332824318e" +
  "7561e1098ef24a4dd718e460b3fd303f";
const ASSERTIONS = Object.freeze([
  "browserSphericalE57FileOpen",
  "sphericalProductRuntime",
  "invalidRecordsFiltered",
  "intensityProjectionRemainsLossy",
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

function outputArgument(values) {
  if (values.length === 0) {
    return null;
  }
  if (
    values.length !== 2 ||
    values[0] !== "--out" ||
    typeof values[1] !== "string" ||
    values[1].startsWith("-")
  ) {
    throw new TypeError(
      "usage: node scripts/qualify-e57-spherical-browser-product.mjs " +
        "[--out path]",
    );
  }
  return path.resolve(values[1]);
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

function exactSurface(surface) {
  return (
    surface?.schema ===
      "bim-explorer-product-shell-browser-evidence/1" &&
    surface.environment?.headless === true &&
    typeof surface.environment.browser === "string" &&
    surface.environment.browser.length > 0 &&
    surface.fixture?.id === "e57-example-pump-a-spherical" &&
    surface.fixture.committed === false &&
    surface.fixture.format === "e57" &&
    surface.fixture.sourceBytes === 5_168_128 &&
    surface.fixture.fingerprint === `sha256:${SOURCE_SHA256}` &&
    surface.fixture.formatVersion === "1.0" &&
    surface.fixture.pointFormat === "spherical-rae-rgb" &&
    surface.fixture.provenance?.repository ===
      "https://sourceforge.net/projects/e57-3d-imgfmt/files/" +
        "E57Example-data/" &&
    surface.fixture.provenance.sourcePage ===
      "https://e57-3d-imgfmt.sourceforge.net/data.html" &&
    surface.fixture.provenance.publishedAt ===
      "2011-05-04T23:26:44Z" &&
    surface.fixture.provenance.license ===
      "LicenseRef-E57-Example-Test-Data" &&
    surface.fixture.provenance.notice ===
      "Copyright 2008 Carnahan-Proctor and Cross, Inc." &&
    surface.fixture.provenance.bundled === false &&
    surface.fixture.provenance.sampleRedistributed === false &&
    exactPointModel(
      surface.observation?.model,
      155_201,
      8,
      2,
    ) &&
    surface.observation.resources?.sourceBytes === 5_168_128 &&
    surface.observation.resources.decodedPointBytes === 10_745_370 &&
    surface.observation.resources.pointRangeBytes === 2_483_264 &&
    surface.observation.resources.pointRangePayloadBytes ===
      2_483_216 &&
    surface.observation.resources.wasmHeapCapacityBytes === null &&
    surface.observation.renderer?.actualGpu === true &&
    surface.observation.renderer.nonBackgroundPixels > 0 &&
    surface.observation.renderer.sourceReadBytes === 2_483_264 &&
    surface.observation.renderer.uploadedBytes === 2_483_216 &&
    same(surface.observation.pointCloud?.colorRange, {
      min: [0, 2, 0, 255],
      max: [255, 255, 255, 255],
    }) &&
    surface.observation.pointCloud.coordinateRepresentation ===
      "spherical" &&
    same(surface.observation.pointCloud.attributeProjection, {
      ignoredFields: ["intensity"],
      lossiness: "lossy",
      method:
        "decode-for-stream-alignment-without-semantic-authority",
    }) &&
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

export function validateE57SphericalBrowserProductQualification(
  report,
) {
  if (
    report?.schema !==
      "bim-explorer-e57-spherical-browser-product-evidence/1" ||
    report.status !==
      "passed-experimental-spherical-browser-product-open" ||
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
    report.decision?.browserProductOpen !== "passed-experimental" ||
    report.decision.vscodeProductOpen !== "held" ||
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
      "E57 spherical Browser product qualification evidence is invalid",
    );
  }
  return report;
}

export async function qualifyE57SphericalBrowserProduct() {
  const surface = await qualifyBimProductShell({
    fixture: "e57-spherical-public",
  });
  const report = {
    schema:
      "bim-explorer-e57-spherical-browser-product-evidence/1",
    status:
      "passed-experimental-spherical-browser-product-open",
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
      browserProductOpen: "passed-experimental",
      vscodeProductOpen: "held",
      renderer: "passed-browser-webgl2",
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
      "the product profile covers one E57 1.0 single-scan spherical RAE/intensity/RGB default-BitPack sample",
      "intensity is decoded for stream alignment and intentionally omitted from the RGBA display range",
      "coordinates are displayed without CRS, scan-pose or surveyed datum authority",
      "individual point identity, picking and LOD streaming are not implemented",
      "VS Code staged and clean-installed VSIX product open remain a separate Gate",
      "SwiftShader exercises actual WebGL2 APIs but does not claim a physical GPU",
      "the public sample remains in an ignored digest cache and is not redistributed",
      "bounded Browser product open does not admit the E57 format family",
    ],
  };
  return validateE57SphericalBrowserProductQualification(report);
}

async function main() {
  const output = outputArgument(process.argv.slice(2));
  const report = await qualifyE57SphericalBrowserProduct();
  if (output !== null) {
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
