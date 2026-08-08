import {
  LAZ_WORKER_PHASES,
  LazWorkerError,
  decodeLazInBrowserWorker,
} from "./worker-client.mjs";

globalThis.__lasLazWorkerProbeReport = {
  status: "running",
};

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function fetchJson(route) {
  const response = await fetch(route, {
    cache: "no-store",
    credentials: "omit",
  });
  if (!response.ok) {
    throw new Error("qualification input unavailable");
  }
  return await response.json();
}

async function fetchBytes(route) {
  const response = await fetch(route, {
    cache: "no-store",
    credentials: "omit",
  });
  if (!response.ok) {
    throw new Error("qualification source unavailable");
  }
  return await response.arrayBuffer();
}

function assertSuccessfulDecode(result, input) {
  const expected = input.expected;
  const budget = input.budget;
  invariant(
    result.report.source.byteLength === input.fixture.byteLength &&
      result.report.source.sha256 === input.fixture.sha256,
    "source identity mismatch",
  );
  invariant(
    result.report.profile.pointRecords === expected.pointRecords &&
      result.report.profile.pointRecordSha256 ===
        expected.pointRecordSha256 &&
      same(
        result.report.profile.decodedBounds,
        expected.decodedBounds,
      ) &&
      same(
        result.report.profile.colorRange,
        expected.colorRange,
      ) &&
      same(
        result.report.profile.firstPosition,
        expected.firstPosition,
      ) &&
      same(
        result.report.profile.lastPosition,
        expected.lastPosition,
      ),
    "decoded point profile mismatch",
  );
  invariant(
    result.report.performance.initializationMs <=
      budget.maxInitializationMs &&
      result.report.performance.decodeMs <= budget.maxDecodeMs &&
      result.report.performance.totalMs <= budget.maxTotalMs &&
      result.receipt.wallClockMs <= budget.maxWallClockMs,
    "worker time budget exceeded",
  );
  invariant(
    result.report.resources.decodedPointBytes ===
      expected.decodedPointBytes &&
      result.report.resources.wasmHeapCapacityBytes
        .peakObserved <= budget.maxWasmHeapCapacityBytes,
    "worker memory budget exceeded",
  );
  invariant(
    result.report.cleanup.decoderReleased === true &&
      result.report.cleanup.wasmAllocationsReleased === true &&
      result.report.cleanup.sourceBufferCleared === true &&
      result.receipt.workerTerminationRequested === true &&
      result.receipt.explicitCleanup === true,
    "successful worker cleanup is incomplete",
  );
}

async function successfulDecode(input, sourceId) {
  const source = await fetchBytes("/fixture/public.laz");
  const result = await decodeLazInBrowserWorker(source, {
    sourceId,
    timeoutMs: input.budget.timeoutMs,
  });
  invariant(source.byteLength === 0, "source transfer did not detach");
  invariant(
    result.receipt.sourceTransferred === true,
    "source transfer receipt is incomplete",
  );
  assertSuccessfulDecode(result, input);
  return result;
}

async function cooperativeCancellation(input) {
  const cancellation = new AbortController();
  const observed = [];
  const source = await fetchBytes("/fixture/public.laz");
  try {
    await decodeLazInBrowserWorker(source, {
      cancellationGraceMs: input.budget.cancellationGraceMs,
      onProgress(progress) {
        observed.push(progress.phase);
        if (progress.phase === "decoder-initialized") {
          cancellation.abort();
        }
      },
      signal: cancellation.signal,
      sourceId: "cooperative-cancel",
      timeoutMs: input.budget.timeoutMs,
    });
  } catch (error) {
    invariant(error instanceof LazWorkerError, "missing cancellation receipt");
    const receipt = error.receipt;
    invariant(
      receipt.outcome === "cancelled-cooperative" &&
        receipt.cancelled === true &&
        receipt.cooperativeCancellation === true &&
        receipt.lastPhase === "decoder-initialized" &&
        receipt.explicitCleanup === true &&
        receipt.cleanup?.decoderReleased === true &&
        receipt.cleanup?.wasmAllocationsReleased === true &&
        receipt.cleanup?.sourceBufferCleared === true &&
        receipt.workerTerminationRequested === true &&
        source.byteLength === 0,
      "cooperative cancellation is incomplete",
    );
    invariant(
      same(observed, LAZ_WORKER_PHASES.slice(0, 2)),
      "cooperative cancellation checkpoints differ",
    );
    return { observed, receipt };
  }
  throw new Error("cooperative cancellation unexpectedly completed");
}

async function forcedInCallCancellation(input) {
  const cancellation = new AbortController();
  const observed = [];
  const source = await fetchBytes("/fixture/public.laz");
  try {
    await decodeLazInBrowserWorker(source, {
      cancellationGraceMs:
        input.budget.inCallCancellationGraceMs,
      onProgress(progress) {
        observed.push(progress.phase);
        if (progress.phase === "decode-call-starting") {
          setTimeout(() => cancellation.abort(), 0);
        }
      },
      qualificationDecodePasses:
        input.qualification.inCallDecodePasses,
      signal: cancellation.signal,
      sourceId: "forced-in-call-cancel",
      timeoutMs: input.budget.timeoutMs,
    });
  } catch (error) {
    invariant(error instanceof LazWorkerError, "missing forced receipt");
    const receipt = error.receipt;
    invariant(
      receipt.outcome === "cancelled-forced" &&
        receipt.cancelled === true &&
        receipt.cooperativeCancellation === false &&
        receipt.lastPhase === "decode-call-starting" &&
        receipt.explicitCleanup === false &&
        receipt.workerTerminationRequested === true &&
        receipt.cancellationWaitMs >=
          input.budget.inCallCancellationGraceMs &&
        receipt.cancellationWaitMs <=
          input.budget.inCallCancellationGraceMs + 250 &&
        source.byteLength === 0,
      "forced in-call cancellation is incomplete",
    );
    invariant(
      same(observed, LAZ_WORKER_PHASES.slice(0, 3)),
      "forced cancellation checkpoints differ",
    );
    return { observed, receipt };
  }
  throw new Error("forced in-call cancellation unexpectedly completed");
}

async function timeoutTermination(input) {
  const source = await fetchBytes("/fixture/public.laz");
  try {
    await decodeLazInBrowserWorker(source, {
      qualificationStallAtPhase: "decoder-initialized",
      sourceId: "bounded-timeout",
      timeoutMs: input.budget.stallTimeoutMs,
    });
  } catch (error) {
    invariant(error instanceof LazWorkerError, "missing timeout receipt");
    const receipt = error.receipt;
    invariant(
      receipt.outcome === "timed-out" &&
        receipt.timedOut === true &&
        receipt.lastPhase === "decoder-initialized" &&
        receipt.explicitCleanup === false &&
        receipt.workerTerminationRequested === true &&
        receipt.wallClockMs >= input.budget.stallTimeoutMs &&
        receipt.wallClockMs <= input.budget.stallTimeoutMs + 500 &&
        source.byteLength === 0,
      "timeout termination receipt is incomplete",
    );
    return receipt;
  }
  throw new Error("stalled Worker unexpectedly completed");
}

async function malformedIsolation(input) {
  const source = await fetchBytes("/fixture/truncated.laz");
  try {
    await decodeLazInBrowserWorker(source, {
      sourceId: "truncated-payload",
      timeoutMs: input.budget.timeoutMs,
    });
  } catch (error) {
    invariant(error instanceof LazWorkerError, "missing rejection receipt");
    const receipt = error.receipt;
    invariant(
      receipt.outcome === "input-rejected" &&
        receipt.rejection?.code === "BROWSER_LAZ_INPUT_REJECTED" &&
        receipt.rejection?.phase === "point-decode" &&
        receipt.explicitCleanup === true &&
        receipt.cleanup?.decoderReleased === true &&
        receipt.cleanup?.wasmAllocationsReleased === true &&
        receipt.cleanup?.sourceBufferCleared === true &&
        receipt.workerTerminationRequested === true &&
        source.byteLength === 0,
      "malformed payload isolation is incomplete",
    );
    return receipt;
  }
  throw new Error("truncated LAZ payload unexpectedly decoded");
}

async function run() {
  let stage = "input";
  try {
    const input = await fetchJson("/probe-input.json");
    stage = "first-success";
    const first = await successfulDecode(input, "first-success");
    stage = "cooperative-cancellation";
    const cooperative = await cooperativeCancellation(input);
    stage = "forced-in-call-cancellation";
    const forced = await forcedInCallCancellation(input);
    stage = "timeout-termination";
    const timeout = await timeoutTermination(input);
    stage = "malformed-isolation";
    const malformed = await malformedIsolation(input);
    stage = "fresh-worker-recovery";
    const recovery = await successfulDecode(input, "fresh-recovery");
    globalThis.__lasLazWorkerProbeReport = {
      schema: "bim-explorer-laz-browser-worker-probe/0.1",
      status: "passed",
      fixture: input.fixture,
      budget: input.budget,
      qualification: input.qualification,
      first,
      cooperative,
      forced,
      timeout,
      malformed,
      recovery,
    };
  } catch (error) {
    globalThis.__lasLazWorkerProbeReport = {
      schema: "bim-explorer-laz-browser-worker-probe/0.1",
      status: "failed",
      error: {
        code: "LAZ_BROWSER_WORKER_QUALIFICATION_FAILED",
        stage,
        message: String(error?.message ?? "unknown failure"),
        receipt: error instanceof LazWorkerError
          ? error.receipt
          : null,
      },
    };
  }
}

await run();
