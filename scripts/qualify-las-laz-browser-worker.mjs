import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  runBrowserQualification,
} from "./browser-qualification-runtime.mjs";
import {
  createLasLazWorkerProbeServer,
  prepareLasLazWorkerProbe,
} from "./serve-las-laz-worker-probe.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const ASSERTIONS = Object.freeze([
  "actualBrowserWorker",
  "pinnedCacheOnlyFixture",
  "exactDecoderArtifact",
  "boundedInputTransfer",
  "boundedDecodedOutput",
  "wasmHeapBudget",
  "cooperativeCheckpointCancellation",
  "forcedInCallTermination",
  "forcedCleanupNotOverclaimed",
  "boundedTimeoutTermination",
  "malformedPayloadRejected",
  "malformedExplicitCleanup",
  "freshWorkerRecovery",
  "deterministicSuccessfulCleanup",
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
      "usage: node scripts/qualify-las-laz-browser-worker.mjs " +
        "[--out path]",
    );
  }
  return path.resolve(values[1]);
}

function successfulRunIsBounded(run, fixture, expected, budget) {
  const report = run?.report;
  const receipt = run?.receipt;
  return (
    report?.status === "passed" &&
    report.source?.byteLength === fixture.byteLength &&
    report.source.sha256 === fixture.sha256 &&
    report.profile?.pointRecords === expected.pointRecords &&
    report.profile.pointRecordSha256 ===
      expected.pointRecordSha256 &&
    same(report.profile.decodedBounds, expected.decodedBounds) &&
    same(report.profile.colorRange, expected.colorRange) &&
    report.resources?.decodedPointBytes ===
      expected.decodedPointBytes &&
    report.resources.wasmHeapCapacityBytes?.peakObserved <=
      budget.maxWasmHeapCapacityBytes &&
    report.performance?.initializationMs <=
      budget.maxInitializationMs &&
    report.performance.decodeMs <= budget.maxDecodeMs &&
    report.performance.totalMs <= budget.maxTotalMs &&
    report.cleanup?.decoderReleased === true &&
    report.cleanup.wasmAllocationsReleased === true &&
    report.cleanup.sourceBufferCleared === true &&
    receipt?.outcome === "completed" &&
    receipt.sourceTransferred === true &&
    receipt.explicitCleanup === true &&
    receipt.workerTerminationRequested === true &&
    receipt.wallClockMs <= budget.maxWallClockMs
  );
}

function qualificationAssertions(
  browser,
  runtime,
  prepared,
  serverState,
) {
  const fixture = prepared.input.fixture;
  const expected = prepared.input.expected;
  const budget = prepared.input.budget;
  const first = browser.first;
  const recovery = browser.recovery;
  const cooperative = browser.cooperative?.receipt;
  const forced = browser.forced?.receipt;
  const timeout = browser.timeout;
  const malformed = browser.malformed;
  return Object.freeze({
    actualBrowserWorker:
      browser.status === "passed" &&
      first.report.decoder.backend ===
        "browser-wasm-worker-qualification",
    pinnedCacheOnlyFixture:
      fixture.artifactTracked === false &&
      fixture.releaseBundled === false &&
      fixture.sampleRedistributed === false &&
      fixture.testOnly === true &&
      prepared.acquisition.entries.laz.sha256 === fixture.sha256,
    exactDecoderArtifact:
      first.report.decoder.id === "laz-perf" &&
      first.report.decoder.version === "0.0.6" &&
      first.report.decoder.license === "Apache-2.0",
    boundedInputTransfer:
      first.receipt.sourceTransferred === true &&
      recovery.receipt.sourceTransferred === true &&
      first.report.resources.inputBytes === fixture.byteLength,
    boundedDecodedOutput:
      first.report.resources.decodedPointBytes ===
        expected.decodedPointBytes &&
      recovery.report.resources.decodedPointBytes ===
        expected.decodedPointBytes,
    wasmHeapBudget:
      first.report.resources.wasmHeapCapacityBytes
        .peakObserved <= budget.maxWasmHeapCapacityBytes &&
      recovery.report.resources.wasmHeapCapacityBytes
        .peakObserved <= budget.maxWasmHeapCapacityBytes,
    cooperativeCheckpointCancellation:
      cooperative?.outcome === "cancelled-cooperative" &&
      cooperative.cooperativeCancellation === true &&
      cooperative.lastPhase === "decoder-initialized" &&
      cooperative.explicitCleanup === true &&
      cooperative.cleanup?.wasmAllocationsReleased === true &&
      cooperative.cleanup?.sourceBufferCleared === true,
    forcedInCallTermination:
      forced?.outcome === "cancelled-forced" &&
      forced.cooperativeCancellation === false &&
      forced.lastPhase === "decode-call-starting" &&
      forced.workerTerminationRequested === true &&
      forced.cancellationWaitMs >=
        budget.inCallCancellationGraceMs,
    forcedCleanupNotOverclaimed:
      forced.explicitCleanup === false &&
      forced.cleanup === undefined,
    boundedTimeoutTermination:
      timeout?.outcome === "timed-out" &&
      timeout.timedOut === true &&
      timeout.lastPhase === "decoder-initialized" &&
      timeout.workerTerminationRequested === true &&
      timeout.explicitCleanup === false &&
      timeout.wallClockMs <= budget.stallTimeoutMs + 500,
    malformedPayloadRejected:
      malformed?.outcome === "input-rejected" &&
      malformed.rejection?.code ===
        "BROWSER_LAZ_INPUT_REJECTED" &&
      malformed.rejection.phase === "point-decode" &&
      malformed.rejection.source.byteLength ===
        fixture.byteLength - 128,
    malformedExplicitCleanup:
      malformed.explicitCleanup === true &&
      malformed.cleanup?.decoderReleased === true &&
      malformed.cleanup?.wasmAllocationsReleased === true &&
      malformed.cleanup?.sourceBufferCleared === true,
    freshWorkerRecovery:
      successfulRunIsBounded(
        recovery,
        fixture,
        expected,
        budget,
      ) &&
      first.report.requestId !== recovery.report.requestId,
    deterministicSuccessfulCleanup:
      successfulRunIsBounded(
        first,
        fixture,
        expected,
        budget,
      ) &&
      same(first.report.profile, recovery.report.profile) &&
      first.receipt.workerTerminationRequested === true &&
      recovery.receipt.workerTerminationRequested === true,
    localOnly: runtime.externalOrigins.length === 0,
    noRuntimeErrors: runtime.runtimeErrors.length === 0,
    serverBuffersCleared:
      serverState.buffersCleared === true &&
      serverState.fixtureRequests === 6 &&
      serverState.fixtureBytes ===
        fixture.byteLength * 5 + fixture.byteLength - 128,
    noProductAdmission:
      prepared.input.qualification.productRuntime === false,
    pathFreeEvidence: true,
  });
}

function pathFree(value) {
  return !/(?:\/Users\/|\/Volumes\/|[A-Z]:\\)/u.test(
    JSON.stringify(value),
  );
}

export function validateLasLazBrowserWorkerQualification(report) {
  const first = report?.success?.first;
  const recovery = report?.success?.recovery;
  if (
    report?.schema !==
      "bim-explorer-las-laz-browser-worker-qualification/1" ||
    report.status !== "passed-pre-admission-worker-lifecycle" ||
    report.asOf !== "2026-08-08" ||
    report.fixture?.fixtureId !== "loaders-gl-ripple-las-laz" ||
    report.fixture.byteLength !== 53_952 ||
    report.fixture.sha256 !==
      "64cc16cf7b38d3ec3d13e96b7af66bf" +
        "887be2a5d35d55e86c41fd38fa79c9034" ||
    report.fixture.artifactTracked !== false ||
    report.fixture.releaseBundled !== false ||
    report.fixture.sampleRedistributed !== false ||
    report.fixture.testOnly !== true ||
    report.decoder?.id !== "laz-perf" ||
    report.decoder.version !== "0.0.6" ||
    report.decoder.license !== "Apache-2.0" ||
    report.decoder.role !== "qualification-only-dev-dependency" ||
    typeof report.environment?.browser !== "string" ||
    report.environment.browser.length === 0 ||
    report.environment.headless !== true ||
    report.environment.worker !== "classic Web Worker" ||
    report.environment.csp !==
      "loopback-only unsafe-eval for pinned Emscripten glue" ||
    report.environment.physicalGpuClaimed !== false ||
    report.budget?.maxWasmHeapCapacityBytes !==
      64 * 1024 * 1024 ||
    report.qualification?.inCallDecodePasses !== 256 ||
    report.qualification.malformedMutation !==
      "truncate-128-trailing-bytes" ||
    first?.report?.profile?.pointRecordSha256 !==
      "31124633910e8b01c3cbd7d159c85b7" +
        "140b0ed20438fee70f9570ad2420c026e" ||
    first.report.resources?.decodedPointBytes !== 346_834 ||
    first.report.cleanup?.wasmAllocationsReleased !== true ||
    first.receipt?.workerTerminationRequested !== true ||
    recovery?.report?.profile?.pointRecordSha256 !==
      first.report.profile.pointRecordSha256 ||
    recovery.report.requestId === first.report.requestId ||
    recovery.receipt?.workerTerminationRequested !== true ||
    report.lifecycle?.cooperative?.outcome !==
      "cancelled-cooperative" ||
    report.lifecycle.cooperative.explicitCleanup !== true ||
    report.lifecycle.forcedInCall?.outcome !==
      "cancelled-forced" ||
    report.lifecycle.forcedInCall.explicitCleanup !== false ||
    report.lifecycle.timeout?.outcome !== "timed-out" ||
    report.lifecycle.timeout.explicitCleanup !== false ||
    report.lifecycle.malformed?.outcome !== "input-rejected" ||
    report.lifecycle.malformed.rejection?.phase !== "point-decode" ||
    report.lifecycle.malformed.explicitCleanup !== true ||
    report.network?.externalOrigins?.length !== 0 ||
    report.network.runtimeErrors?.length !== 0 ||
    report.network.fixtureRequests !== 6 ||
    report.cleanup?.serverBuffersCleared !== true ||
    report.decision?.workerLifecycle !== "passed" ||
    report.decision.malformedInputIsolation !== "passed" ||
    report.decision.memoryBudget !== "passed" ||
    report.decision.coordinateReference !== "held" ||
    report.decision.pointRenderer !== "held" ||
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
      "LAS/LAZ Browser Worker qualification evidence is invalid",
    );
  }
  return report;
}

export async function qualifyLasLazBrowserWorker() {
  const prepared = await prepareLasLazWorkerProbe();
  const server = createLasLazWorkerProbeServer(prepared);
  const runtime = await runBrowserQualification({
    server,
    reportExpression: `(() => {
      const report = globalThis.__lasLazWorkerProbeReport;
      if (!report || report.status === "running") {
        return null;
      }
      return report;
    })()`,
    timeoutMs: 30_000,
    userDataPrefix: "bim-explorer-laz-worker-",
  });
  const browser = runtime.report;
  if (browser?.status !== "passed") {
    throw new Error(
      "LAS/LAZ Browser Worker probe failed: " +
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
      "LAS/LAZ Browser Worker assertions failed: " +
        JSON.stringify(assertions),
    );
  }
  const report = {
    schema: "bim-explorer-las-laz-browser-worker-qualification/1",
    status: "passed-pre-admission-worker-lifecycle",
    asOf: "2026-08-08",
    fixture: {
      fixtureId: prepared.input.fixture.id,
      byteLength: prepared.input.fixture.byteLength,
      sha256: prepared.input.fixture.sha256,
      artifactTracked: false,
      releaseBundled: false,
      sampleRedistributed: false,
      testOnly: true,
    },
    acquisition: prepared.acquisition,
    decoder: {
      id: browser.first.report.decoder.id,
      version: browser.first.report.decoder.version,
      license: browser.first.report.decoder.license,
      backend: browser.first.report.decoder.backend,
      role: "qualification-only-dev-dependency",
      productBundled: false,
    },
    environment: {
      browser: runtime.browserVersion,
      platform: runtime.platform,
      headless: true,
      worker: "classic Web Worker",
      wasm: "actual Browser WebAssembly API",
      csp: "loopback-only unsafe-eval for pinned Emscripten glue",
      physicalGpuClaimed: false,
    },
    budget: browser.budget,
    qualification: browser.qualification,
    success: {
      first: browser.first,
      recovery: browser.recovery,
    },
    lifecycle: {
      cooperative: browser.cooperative.receipt,
      forcedInCall: browser.forced.receipt,
      timeout: browser.timeout,
      malformed: browser.malformed,
    },
    network: {
      externalOrigins: runtime.externalOrigins,
      runtimeErrors: runtime.runtimeErrors,
      requestCount: runtime.requestedUrls.length,
      fixtureRequests: server.probeState.fixtureRequests,
      fixtureBytes: server.probeState.fixtureBytes,
    },
    cleanup: {
      successfulAllocationsReleased: true,
      cooperativeAllocationsReleased: true,
      malformedAllocationsReleased: true,
      forcedTerminationDoesNotClaimExplicitCleanup: true,
      timeoutTerminationDoesNotClaimExplicitCleanup: true,
      serverBuffersCleared: server.probeState.buffersCleared,
    },
    assertions,
    decision: {
      workerLifecycle: "passed",
      malformedInputIsolation: "passed",
      memoryBudget: "passed",
      coordinateReference: "held",
      pointRenderer: "held",
      browserProductOpen: "held",
      vscodeProductOpen: "held",
      formatAdmission: false,
      pointCloudCodec: "held",
      productSupport: false,
    },
    limitations: [
      "the probe covers one cache-only LAS 1.2 point-format 3 LAZ sample",
      "cooperative cancellation is available only at protocol checkpoints",
      "synchronous laz-perf work requires Worker termination for in-call cancellation",
      "forced termination cannot run or attest explicit decoder cleanup",
      "the memory Gate observes WASM heap capacity and bounded buffers, not complete browser process RSS",
      "the malformed case truncates 128 trailing compressed bytes and is not an exhaustive corpus",
      "pinned Emscripten glue requires unsafe-eval only on this loopback qualification CSP",
      "the sample has no qualified CRS or surveyed datum authority",
      "no point renderer or Browser/VS Code product file-open is included",
      "laz-perf and the sample are not bundled into a product or release"
    ],
  };
  return validateLasLazBrowserWorkerQualification(report);
}

async function main() {
  const output = outputArgument(process.argv.slice(2));
  const report = await qualifyLasLazBrowserWorker();
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
