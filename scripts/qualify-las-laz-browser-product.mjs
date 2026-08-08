import { writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  qualifyBimProductShell,
} from "./qualify-bim-product-shell.mjs";

const RANGE_SHA256 =
  "8383abce84d57b8f50ee1f39aa1d442a" +
  "7f258cd759ab9812aff1a0625ab10449";
const ASSERTIONS = Object.freeze([
  "browserLasFileOpen",
  "browserLazFileOpen",
  "lasLazPointRangeParity",
  "actualWebGl2Points",
  "boundedSourceDecodeAndUpload",
  "isolatedLazProductWorker",
  "decoderProductRuntime",
  "sourceBuffersCleared",
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
      "usage: node scripts/qualify-las-laz-browser-product.mjs " +
        "[--out path]",
    );
  }
  return path.resolve(values[1]);
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

function exactSurface(surface, format) {
  const expected = format === "las"
    ? {
        bytes: 347_061,
        fingerprint:
          "sha256:dbe194dd8529300f341a591e0b2e2ac5" +
          "7a96880db6dffa120dc1a41465026852",
        decoder: "las-point-record-reader",
      }
    : {
        bytes: 53_952,
        fingerprint:
          "sha256:64cc16cf7b38d3ec3d13e96b7af66bf" +
          "887be2a5d35d55e86c41fd38fa79c9034",
        decoder: "laz-perf",
      };
  return (
    surface?.schema ===
      "bim-explorer-product-shell-browser-evidence/1" &&
    surface.environment?.headless === true &&
    typeof surface.environment.browser === "string" &&
    surface.environment.browser.length > 0 &&
    surface.fixture?.format === format &&
    surface.fixture.committed === false &&
    surface.fixture.sourceBytes === expected.bytes &&
    surface.fixture.fingerprint === expected.fingerprint &&
    surface.fixture.formatVersion === "1.2" &&
    surface.fixture.pointFormat === 3 &&
    surface.fixture.provenance?.repository ===
      "https://github.com/visgl/loaders.gl" &&
    surface.fixture.provenance.commit ===
      "44e7a4e978a63fad0ee257fedb688826f5f279e5" &&
    surface.fixture.provenance.license === "MIT" &&
    surface.fixture.provenance.bundled === false &&
    surface.fixture.provenance.sampleRedistributed === false &&
    same(surface.observation?.model, {
      points: 10_201,
      ranges: 1,
    }) &&
    surface.observation.resources?.sourceBytes === expected.bytes &&
    surface.observation.resources.decodedPointBytes === 346_834 &&
    surface.observation.resources.pointRangeBytes === 163_264 &&
    surface.observation.resources.pointRangePayloadBytes ===
      163_216 &&
    surface.observation.renderer?.actualGpu === true &&
    surface.observation.renderer.nonBackgroundPixels > 0 &&
    surface.observation.renderer.sourceReadBytes === 163_264 &&
    surface.observation.renderer.uploadedBytes === 163_216 &&
    surface.observation.pointCloud?.rangeSha256 === RANGE_SHA256 &&
    surface.observation.pointCloud.pointPrimitive === "POINTS" &&
    surface.observation.pointCloud.decoder?.id === expected.decoder &&
    surface.observation.pointCloud.coordinateReferenceStatus ===
      "unqualified" &&
    surface.observation.pointCloud.maximumProjectionError < 1e-6 &&
    surface.observation.productLifecycle?.cpuPointRangeCleared ===
      true &&
    surface.observation.productLifecycle.sourceBufferCleared === true &&
    surface.observation.productLifecycle
      .workerTerminatedAfterTransfer === true &&
    surface.observation.lifecycle?.opened === "ready" &&
    surface.observation.lifecycle.closed === "disposed" &&
    surface.observation.lifecycle.backendDisposed === true &&
    surface.observation.lifecycle.clientDisposed === true &&
    surface.observation.lifecycle.pointRangeCleared === true &&
    surface.observation.lifecycle.rendererDisposed === true &&
    surface.observation.lifecycle.workerTerminatedAfterTransfer ===
      true &&
    surface.observation.network?.externalOrigins?.length === 0 &&
    surface.observation.runtimeErrors?.length === 0 &&
    surface.decision?.pointCloudProductOpen ===
      "passed-bounded-read-only-unqualified-coordinates" &&
    allTrue(surface.assertions)
  );
}

export function validateLasLazBrowserProductQualification(report) {
  const las = report?.surfaces?.las;
  const laz = report?.surfaces?.laz;
  const lazHeap = laz?.observation?.resources
    ?.wasmHeapCapacityBytes;
  if (
    report?.schema !==
      "bim-explorer-las-laz-browser-product-evidence/1" ||
    report.status !==
      "passed-experimental-browser-product-open" ||
    report.asOf !== "2026-08-08" ||
    !exactSurface(las, "las") ||
    !exactSurface(laz, "laz") ||
    las.environment.browser !== laz.environment.browser ||
    las.environment.platform !== laz.environment.platform ||
    las.observation.resources.wasmHeapCapacityBytes !== null ||
    !Number.isSafeInteger(lazHeap?.afterInitialization) ||
    !Number.isSafeInteger(lazHeap?.afterDecode) ||
    lazHeap.peakObserved !== Math.max(
      lazHeap.afterInitialization,
      lazHeap.afterDecode,
    ) ||
    lazHeap.peakObserved > 64 * 1024 * 1024 ||
    !same(las.observation.model, laz.observation.model) ||
    !same(
      las.observation.pointCloud.bounds,
      laz.observation.pointCloud.bounds,
    ) ||
    !same(
      las.observation.pointCloud.colorRange,
      laz.observation.pointCloud.colorRange,
    ) ||
    !same(
      las.observation.pointCloud.origin,
      laz.observation.pointCloud.origin,
    ) ||
    las.observation.renderer.nonBackgroundPixels !==
      laz.observation.renderer.nonBackgroundPixels ||
    report.parity?.pointRangeSha256 !== RANGE_SHA256 ||
    report.parity.points !== 10_201 ||
    report.parity.pointRangeBytes !== 163_264 ||
    report.parity.pointRangePayloadBytes !== 163_216 ||
    report.parity.nonBackgroundPixels !==
      las.observation.renderer.nonBackgroundPixels ||
    report.runtime?.pointSourceContract !==
      "bim-explorer-las-laz-point-source/0.1" ||
    report.runtime.pointWorkerRequest !==
      "bim-explorer-point-source-worker-request/0.1" ||
    report.runtime.pointWorkerResponse !==
      "bim-explorer-point-source-worker-response/0.1" ||
    report.runtime.lazDecoder?.id !== "laz-perf" ||
    report.runtime.lazDecoder.version !== "0.0.6" ||
    report.runtime.lazDecoder.license !== "Apache-2.0" ||
    report.runtime.lazDecoder.productRuntime !== true ||
    report.fixturePolicy?.artifactTracked !== false ||
    report.fixturePolicy.sampleRedistributed !== false ||
    report.fixturePolicy.releaseBundled !== false ||
    report.decision?.browserProductOpen !== "passed-experimental" ||
    report.decision.vscodeProductOpen !== "held" ||
    report.decision.coordinateReference !== "held" ||
    report.decision.pointIdentityPicking !== "held" ||
    report.decision.levelOfDetail !== "held" ||
    report.decision.pointCloudCodec !== "held" ||
    report.decision.formatAdmission !== false ||
    !same(Object.keys(report.assertions ?? {}), ASSERTIONS) ||
    Object.values(report.assertions).some((value) => value !== true) ||
    /(?:\/Users\/|\/Volumes\/|[A-Z]:\\)/u.test(
      JSON.stringify(report),
    )
  ) {
    throw new Error(
      "LAS/LAZ Browser product qualification evidence is invalid",
    );
  }
  return report;
}

export async function qualifyLasLazBrowserProduct() {
  const las = await qualifyBimProductShell({
    fixture: "las-public",
  });
  const laz = await qualifyBimProductShell({
    fixture: "laz-public",
  });
  const report = {
    schema: "bim-explorer-las-laz-browser-product-evidence/1",
    status: "passed-experimental-browser-product-open",
    asOf: "2026-08-08",
    capturedAt: new Date().toISOString(),
    surfaces: { las, laz },
    parity: {
      points: las.observation.model.points,
      pointRangeBytes:
        las.observation.resources.pointRangeBytes,
      pointRangePayloadBytes:
        las.observation.resources.pointRangePayloadBytes,
      pointRangeSha256:
        las.observation.pointCloud.rangeSha256,
      nonBackgroundPixels:
        las.observation.renderer.nonBackgroundPixels,
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
        productRuntime: true,
        isolatedClassicWorker: true,
      },
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
      "the product profile covers one paired LAS 1.2 point-format 3 sample",
      "coordinates are displayed without CRS or surveyed datum authority",
      "individual point identity, picking and LOD streaming are not implemented",
      "VS Code staged and clean-installed VSIX product open remain separate held Gates",
      "SwiftShader exercises actual WebGL2 APIs but does not claim a physical GPU",
      "the public sample remains in an ignored digest cache and is not redistributed",
      "bounded Browser product open does not admit the LAS/LAZ format family"
    ],
  };
  return validateLasLazBrowserProductQualification(report);
}

async function main() {
  const output = outputArgument(process.argv.slice(2));
  const report = await qualifyLasLazBrowserProduct();
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
