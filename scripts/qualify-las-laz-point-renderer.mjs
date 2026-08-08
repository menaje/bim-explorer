import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  runBrowserQualification,
} from "./browser-qualification-runtime.mjs";
import {
  createLasLazPointRendererProbeServer,
  prepareLasLazPointRendererProbe,
} from "./serve-las-laz-point-renderer-probe.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const ASSERTIONS = Object.freeze([
  "actualBrowserWebGl2",
  "pinnedCacheOnlyFixture",
  "exactLasLazParityProvenance",
  "boundedPointRange",
  "float64OriginProjection",
  "boundedProjectionError",
  "boundedRgba8Projection",
  "singlePointPrimitiveDraw",
  "visiblePixelOutput",
  "boundedCpuStaging",
  "boundedGpuUpload",
  "exactResourceCleanup",
  "localOnly",
  "noRuntimeErrors",
  "serverBuffersCleared",
  "noProductAdmission",
  "pathFreeEvidence",
]);

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function outputArgument(values) {
  if (values.length === 0) {
    return null;
  }
  if (
    values.length !== 2 ||
    values[0] !== "--out" ||
    values[1].startsWith("-")
  ) {
    throw new TypeError(
      "usage: node scripts/qualify-las-laz-point-renderer.mjs " +
        "[--out path]",
    );
  }
  return path.resolve(values[1]);
}

function pathFree(value) {
  return !/(?:\/Users\/|\/Volumes\/|[A-Z]:\\)/u.test(
    JSON.stringify(value),
  );
}

function qualificationAssertions(
  browser,
  runtime,
  prepared,
  serverState,
) {
  const profile = prepared.input.profile;
  const limits = prepared.input.qualification.limits;
  return Object.freeze({
    actualBrowserWebGl2:
      browser.status === "passed" &&
      browser.renderer.actualGpu === true &&
      browser.renderer.backend === "webgl2-points" &&
      typeof browser.renderer.glVersion === "string" &&
      browser.renderer.glVersion.startsWith("WebGL 2.0"),
    pinnedCacheOnlyFixture:
      prepared.input.fixture.artifactTracked === false &&
      prepared.input.fixture.releaseBundled === false &&
      prepared.input.fixture.sampleRedistributed === false &&
      prepared.input.fixture.testOnly === true &&
      prepared.acquisition.entries.las.sha256 ===
        prepared.input.fixture.las.sha256 &&
      prepared.acquisition.entries.laz.sha256 ===
        prepared.input.fixture.laz.sha256,
    exactLasLazParityProvenance:
      prepared.input.provenance.exactLasLazPointRecordParity ===
        true &&
      profile.source.pointRecordSha256 ===
        prepared.input.provenance.pointRecordSha256 &&
      browser.provenance.pointRecordSha256 ===
        profile.source.pointRecordSha256,
    boundedPointRange:
      profile.range.byteLength === 163_264 &&
      profile.range.payloadBytes === 163_216 &&
      profile.range.pointStrideBytes === 16 &&
      profile.range.byteLength <= limits.maximumRangeBytes &&
      profile.source.pointRecords <= limits.maximumPoints,
    float64OriginProjection:
      profile.coordinateProjection.method ===
        "float64-origin-plus-relative-float32" &&
      same(
        browser.projection.renderedBounds,
        profile.coordinateProjection.projectedBounds,
      ),
    boundedProjectionError:
      profile.coordinateProjection.maximumAbsoluteError <= 1e-6,
    boundedRgba8Projection:
      profile.colorProjection.method ===
        "round-uint16-div-257-to-rgba8" &&
      same(
        browser.projection.renderedColorRange,
        profile.colorProjection.rgba8Range,
      ),
    singlePointPrimitiveDraw:
      browser.renderer.pointPrimitive === "POINTS" &&
      browser.renderer.points === profile.source.pointRecords &&
      browser.renderer.drawCalls === 1,
    visiblePixelOutput:
      browser.renderer.rendered === true &&
      browser.renderer.nonBackgroundPixels > 0 &&
      browser.renderer.glError === 0,
    boundedCpuStaging:
      browser.renderer.cpuStagingPeakBytes ===
        profile.range.byteLength &&
      browser.renderer.cpuStagingPeakBytes <=
        limits.maximumCpuStagingBytes,
    boundedGpuUpload:
      browser.renderer.uploadedBytes ===
        profile.range.payloadBytes &&
      browser.renderer.uploadedBytes <= limits.maximumGpuBytes,
    exactResourceCleanup:
      browser.cleanup.rendererStagingReleased === true &&
      browser.cleanup.fetchedInputCleared === true &&
      browser.cleanup.releasedBytes === profile.range.payloadBytes &&
      browser.cleanup.releasedPoints === profile.source.pointRecords &&
      browser.cleanup.backendResourcesDeleted === true &&
      browser.cleanup.rendererDisposed === true &&
      browser.cleanup.backendDisposed === true &&
      browser.cleanup.activeBackendBytes === 0 &&
      browser.cleanup.residentRanges === 0,
    localOnly: runtime.externalOrigins.length === 0,
    noRuntimeErrors: runtime.runtimeErrors.length === 0,
    serverBuffersCleared:
      serverState.buffersCleared === true &&
      serverState.rangeRequests === 1 &&
      serverState.rangeBytes === profile.range.byteLength,
    noProductAdmission:
      prepared.input.qualification.productRuntime === false &&
      browser.source.semanticAuthority === false &&
      browser.source.coordinateReferenceStatus === "unqualified",
    pathFreeEvidence: true,
  });
}

export function validateLasLazPointRendererQualification(report) {
  const renderer = report?.renderer;
  if (
    report?.schema !==
      "bim-explorer-las-laz-point-renderer-qualification/1" ||
    report.status !== "passed-pre-admission-point-renderer" ||
    report.asOf !== "2026-08-08" ||
    report.fixture?.fixtureId !== "loaders-gl-ripple-las-laz" ||
    report.fixture.las?.byteLength !== 347_061 ||
    report.fixture.las.sha256 !==
      "dbe194dd8529300f341a591e0b2e2ac5" +
        "7a96880db6dffa120dc1a41465026852" ||
    report.fixture.laz?.byteLength !== 53_952 ||
    report.fixture.laz.sha256 !==
      "64cc16cf7b38d3ec3d13e96b7af66bf" +
        "887be2a5d35d55e86c41fd38fa79c9034" ||
    report.fixture.artifactTracked !== false ||
    report.fixture.releaseBundled !== false ||
    report.fixture.sampleRedistributed !== false ||
    report.fixture.testOnly !== true ||
    report.provenance?.pointRecordSha256 !==
      "31124633910e8b01c3cbd7d159c85b7" +
        "140b0ed20438fee70f9570ad2420c026e" ||
    report.provenance.exactLasLazPointRecordParity !== true ||
    report.pointRange?.mediaType !==
      "application/vnd.bim-explorer.point-range.v1" ||
    report.pointRange.byteLength !== 163_264 ||
    report.pointRange.payloadBytes !== 163_216 ||
    report.pointRange.pointStrideBytes !== 16 ||
    report.pointRange.points !== 10_201 ||
    report.pointRange.sha256 !==
      "8383abce84d57b8f50ee1f39aa1d442a" +
        "7f258cd759ab9812aff1a0625ab10449" ||
    !same(report.pointRange.origin, [
      0,
      0,
      0.2167949972270401,
    ]) ||
    !same(report.pointRange.rawBounds, {
      min: [-5, -5, -0.6664100289344788],
      max: [5, 5, 1.100000023388559],
    }) ||
    !same(report.pointRange.projectedBounds, {
      min: [-5, -5, -0.6664099993588058],
      max: [5, 5, 1.0999999938128862],
    }) ||
    report.pointRange.maximumAbsoluteProjectionError !==
      2.9791268563172935e-8 ||
    !same(report.pointRange.rgba8ColorRange, {
      min: [0, 68, 0, 255],
      max: [254, 198, 63, 255],
    }) ||
    typeof report.environment?.browser !== "string" ||
    report.environment.browser.length === 0 ||
    report.environment.headless !== true ||
    report.environment.api !== "actual WebGL2" ||
    report.environment.physicalGpuClaimed !== false ||
    report.budget?.maximumCpuStagingBytes !== 8 * 1024 * 1024 ||
    report.budget.maximumGpuBytes !== 8 * 1024 * 1024 ||
    report.budget.maximumPointPayloadBytes !== 8 * 1024 * 1024 ||
    report.budget.maximumPoints !== 500_000 ||
    report.budget.maximumRangeBytes !== 8 * 1024 * 1024 ||
    report.budget.maximumPointSize !== 16 ||
    renderer?.contract !==
      "bim-explorer-bounded-point-renderer/0.1" ||
    renderer.backend !== "webgl2-points" ||
    renderer.actualGpu !== true ||
    renderer.rendered !== true ||
    renderer.pointPrimitive !== "POINTS" ||
    renderer.points !== 10_201 ||
    renderer.pointSize !== 3 ||
    renderer.drawCalls !== 1 ||
    renderer.uploadedBytes !== 163_216 ||
    renderer.cpuStagingPeakBytes !== 163_264 ||
    renderer.nonBackgroundPixels <= 0 ||
    renderer.readbackBytes !== 1_228_800 ||
    typeof renderer.glVersion !== "string" ||
    !renderer.glVersion.startsWith("WebGL 2.0") ||
    typeof renderer.frameMs !== "number" ||
    !Number.isFinite(renderer.frameMs) ||
    renderer.frameMs < 0 ||
    typeof renderer.uploadMs !== "number" ||
    !Number.isFinite(renderer.uploadMs) ||
    renderer.uploadMs < 0 ||
    renderer.glError !== 0 ||
    report.cleanup?.rendererStagingReleased !== true ||
    report.cleanup.fetchedInputCleared !== true ||
    report.cleanup.releasedBytes !== 163_216 ||
    report.cleanup.releasedPoints !== 10_201 ||
    report.cleanup.backendResourcesDeleted !== true ||
    report.cleanup.rendererDisposed !== true ||
    report.cleanup.backendDisposed !== true ||
    report.cleanup.activeBackendBytes !== 0 ||
    report.cleanup.residentRanges !== 0 ||
    report.cleanup.serverBuffersCleared !== true ||
    report.network?.externalOrigins?.length !== 0 ||
    report.network.runtimeErrors?.length !== 0 ||
    !Number.isSafeInteger(report.network.requestCount) ||
    report.network.requestCount <= 0 ||
    report.network.rangeRequests !== 1 ||
    report.network.rangeBytes !== 163_264 ||
    report.decision?.pointRangeContract !== "passed" ||
    report.decision.pointRenderer !== "passed" ||
    report.decision.coordinateReference !== "held" ||
    report.decision.pointPicking !== "held" ||
    report.decision.browserProductOpen !== "held" ||
    report.decision.vscodeProductOpen !== "held" ||
    report.decision.formatAdmission !== false ||
    report.decision.pointCloudCodec !== "held" ||
    report.decision.productSupport !== false ||
    !same(Object.keys(report.assertions ?? {}), ASSERTIONS) ||
    Object.values(report.assertions).some((value) => value !== true) ||
    !pathFree(report)
  ) {
    throw new Error(
      "LAS/LAZ point renderer qualification evidence is invalid",
    );
  }
  return report;
}

export async function qualifyLasLazPointRenderer() {
  const prepared = await prepareLasLazPointRendererProbe();
  const server = createLasLazPointRendererProbeServer(prepared);
  const runtime = await runBrowserQualification({
    server,
    reportExpression: `(() => {
      const report = globalThis.__lasLazPointRendererProbeReport;
      if (!report || report.status === "running") {
        return null;
      }
      return report;
    })()`,
    timeoutMs: 30_000,
    userDataPrefix: "bim-explorer-point-renderer-",
  });
  const browser = runtime.report;
  if (browser?.status !== "passed") {
    throw new Error(
      "LAS/LAZ point renderer Browser probe failed: " +
        JSON.stringify(browser?.error ?? { code: "UNKNOWN" }),
    );
  }
  const assertions = qualificationAssertions(
    browser,
    runtime,
    prepared,
    server.probeState,
  );
  if (Object.values(assertions).some((value) => value !== true)) {
    throw new Error(
      "LAS/LAZ point renderer assertions failed: " +
        JSON.stringify(assertions),
    );
  }
  const profile = prepared.input.profile;
  const report = {
    schema: "bim-explorer-las-laz-point-renderer-qualification/1",
    status: "passed-pre-admission-point-renderer",
    asOf: "2026-08-08",
    fixture: {
      fixtureId: prepared.input.fixture.id,
      las: prepared.input.fixture.las,
      laz: prepared.input.fixture.laz,
      artifactTracked: false,
      releaseBundled: false,
      sampleRedistributed: false,
      testOnly: true,
    },
    acquisition: prepared.acquisition,
    provenance: prepared.input.provenance,
    pointRange: {
      mediaType: profile.mediaType,
      byteLength: profile.range.byteLength,
      payloadBytes: profile.range.payloadBytes,
      pointStrideBytes: profile.range.pointStrideBytes,
      points: profile.source.pointRecords,
      sha256: profile.range.sha256,
      coordinateProjection:
        profile.coordinateProjection.method,
      origin: profile.coordinateProjection.origin,
      rawBounds: profile.coordinateProjection.rawBounds,
      projectedBounds:
        profile.coordinateProjection.projectedBounds,
      maximumAbsoluteProjectionError:
        profile.coordinateProjection.maximumAbsoluteError,
      crsAuthority: false,
      colorProjection: profile.colorProjection.method,
      rgba8ColorRange: profile.colorProjection.rgba8Range,
    },
    environment: {
      browser: runtime.browserVersion,
      platform: runtime.platform,
      headless: true,
      api: "actual WebGL2",
      physicalGpuClaimed: false,
    },
    budget: prepared.input.qualification.limits,
    renderer: browser.renderer,
    cleanup: {
      ...browser.cleanup,
      serverBuffersCleared: server.probeState.buffersCleared,
    },
    network: {
      externalOrigins: runtime.externalOrigins,
      runtimeErrors: runtime.runtimeErrors,
      requestCount: runtime.requestedUrls.length,
      rangeRequests: server.probeState.rangeRequests,
      rangeBytes: server.probeState.rangeBytes,
    },
    assertions,
    decision: {
      pointRangeContract: "passed",
      pointRenderer: "passed",
      coordinateReference: "held",
      pointPicking: "held",
      browserProductOpen: "held",
      vscodeProductOpen: "held",
      formatAdmission: false,
      pointCloudCodec: "held",
      productSupport: false,
    },
    limitations: [
      "the probe covers one cache-only LAS 1.2 point-format 3 sample pair",
      "the Browser receives a source-neutral derived range, not a LAS or LAZ file",
      "LAZ parity relies on the separately qualified exact point-record digest",
      "the range preserves a Float64 origin but the sample has no qualified CRS or datum",
      "the point primitive has no point identity, picking, semantics or level-of-detail streaming",
      "SwiftShader WebGL2 is an API qualification and does not claim a physical GPU",
      "the sample, LAS derivation input and laz-perf are not bundled into a product or release",
      "Browser and VS Code product file-open and format admission remain held"
    ],
  };
  return validateLasLazPointRendererQualification(report);
}

async function main() {
  const output = outputArgument(process.argv.slice(2));
  const report = await qualifyLasLazPointRenderer();
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (output === null) {
    process.stdout.write(serialized);
  } else {
    await writeFile(output, serialized);
    console.log(`Wrote ${path.relative(ROOT, output)}`);
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
