import { BrowserWorkerError } from "./worker-client.mjs";
import {
  BROWSER_PERFORMANCE_BUDGET,
  BROWSER_PERFORMANCE_FIXTURE,
  PUBLIC_BROWSER_PERFORMANCE_BUDGET,
  PUBLIC_BROWSER_PERFORMANCE_FIXTURE,
  assessBrowserPerformanceResult,
  assessPublicBrowserPerformanceResult,
} from "./performance-budget.mjs";
import {
  BrowserIfcSourceSession,
  BrowserSourceSessionError,
  MAX_LOCAL_IFC_BYTES,
} from "./source-session.mjs";

const elements = {
  backend: document.querySelector("#backend"),
  cancel: document.querySelector("#cancel-probe"),
  cancelProbe: document.querySelector("#run-cancel-probe"),
  cleanup: document.querySelector("#cleanup"),
  engine: document.querySelector("#engine"),
  geometry: document.querySelector("#geometry"),
  localFile: document.querySelector("#local-file"),
  negativeProbe: document.querySelector("#run-negative-probe"),
  performanceProbe: document.querySelector("#run-performance-probe"),
  publicPerformanceProbe: document.querySelector(
    "#run-public-performance-probe",
  ),
  receipt: document.querySelector("#receipt"),
  run: document.querySelector("#run-probe"),
  schema: document.querySelector("#schema"),
  semantics: document.querySelector("#semantics"),
  source: document.querySelector("#source"),
  status: document.querySelector("#status"),
};

let sourceSession = new BrowserIfcSourceSession();
let currentSourceCancellation = null;
let currentRun = 0;

function setRunning(running) {
  elements.cancel.disabled = !running;
  document.querySelector("main").ariaBusy = String(running);
}

function renderResult(
  result,
  {
    assessment,
    successStatus = "Passed",
  } = {},
) {
  const { report, receipt } = result;
  elements.source.textContent =
    `${report.source.kind} · ${report.source.byteLength} bytes`;
  elements.engine.textContent =
    `${report.engine.id} ${report.engine.version}`;
  elements.backend.textContent = report.engine.backend;
  elements.schema.textContent = report.source.schema;
  elements.semantics.textContent =
    `${report.semantics.projects} / ${report.semantics.walls}`;
  elements.geometry.textContent =
    `${report.geometry.products} / ${report.geometry.triangles}`;
  elements.cleanup.textContent =
    `model ${report.cleanup.modelClosed ? "closed" : "open"}, ` +
    `engine ${report.cleanup.engineDisposed ? "disposed" : "active"}`;
  elements.receipt.textContent = JSON.stringify(
    {
      source: report.source,
      semantics: report.semantics,
      geometry: report.geometry,
      performance: report.performance,
      resources: report.resources,
      cleanup: report.cleanup,
      worker: receipt,
      sourceSession: result.sourceSession,
      performanceAssessment: assessment,
    },
    null,
    2,
  );
  elements.status.dataset.state = "passed";
  elements.status.textContent = successStatus;
}

function renderFailure(error) {
  const receipt =
    error instanceof BrowserWorkerError ||
    error instanceof BrowserSourceSessionError
    ? error.receipt
    : {
        outcome: "surface-failed",
      };
  elements.status.dataset.state = "failed";
  elements.status.textContent = `Failed: ${receipt.outcome}`;
  elements.receipt.textContent = JSON.stringify(receipt, null, 2);
}

function renderExpectedCancellation(error) {
  const receipt = error instanceof BrowserSourceSessionError
    ? error.receipt
    : null;
  const worker = receipt?.workerCancellation;
  if (
    receipt?.outcome !== "cancelled" ||
    receipt.workerStarted !== true ||
    worker?.outcome !== "cancelled-cooperative" ||
    worker.cooperativeCancellation !== true ||
    worker.lastPhase !== "model-opened" ||
    worker.cleanup?.modelClosed !== true ||
    worker.cleanup?.engineDisposed !== true ||
    worker.workerTerminationRequested !== true
  ) {
    return false;
  }
  elements.source.textContent =
    `${receipt.sourceKind} · ${receipt.sourceBytes} bytes`;
  elements.engine.textContent = "web-ifc 0.0.77";
  elements.backend.textContent = "browser-wasm-worker-prototype";
  elements.schema.textContent = "IFC4";
  elements.semantics.textContent = "cancelled before inspection";
  elements.geometry.textContent = "cancelled before inspection";
  elements.cleanup.textContent = "model closed, engine disposed";
  elements.receipt.textContent = JSON.stringify(receipt, null, 2);
  elements.status.dataset.state = "passed";
  elements.status.textContent =
    "Passed: cooperative cancellation after model open";
  return true;
}

async function fixtureSource(route, signal) {
  const response = await fetch(route, {
    cache: "no-store",
    credentials: "omit",
    signal,
  });
  if (!response.ok) {
    throw new Error("fixture unavailable");
  }
  return await response.blob();
}

function syntheticSource(signal) {
  return fixtureSource("/fixture/synthetic-small.ifc", signal);
}

function performanceSource(signal) {
  return fixtureSource(BROWSER_PERFORMANCE_FIXTURE.route, signal);
}

function publicPerformanceSource(signal) {
  return fixtureSource(
    PUBLIC_BROWSER_PERFORMANCE_FIXTURE.route,
    signal,
  );
}

async function negativeCorpusManifest(signal) {
  const response = await fetch("/fixture/negative-corpus.json", {
    cache: "no-store",
    credentials: "omit",
    signal,
  });
  if (!response.ok) {
    throw new Error("negative corpus manifest unavailable");
  }
  const manifest = await response.json();
  if (
    manifest?.schema !==
      "bim-explorer-ifc-negative-corpus-manifest/1" ||
    manifest.fixtureId !== "synthetic-negative-ifc-corpus" ||
    !Array.isArray(manifest.cases) ||
    manifest.cases.length !== 3 ||
    !manifest.cases.every((fixture) =>
      fixture !== null &&
      typeof fixture === "object" &&
      /^[a-z0-9][a-z0-9-]+$/u.test(fixture.id) &&
      Number.isSafeInteger(fixture.byteLength) &&
      fixture.byteLength > 0 &&
      /^[0-9a-f]{64}$/u.test(fixture.sha256) &&
      fixture.expected === "rejected" &&
      [
        "semantic-admission",
        "source-envelope",
      ].includes(fixture.browserExpectedFailurePhase))
  ) {
    throw new Error("negative corpus manifest is invalid");
  }
  return manifest;
}

function negativeSource(id, signal) {
  return fixtureSource(`/fixture/negative/${id}.ifc`, signal);
}

function assertExpectedNegativeResult(error, fixture) {
  if (!(error instanceof BrowserWorkerError)) {
    throw new Error("negative IFC did not return a Worker receipt");
  }
  const receipt = error.receipt;
  const source = receipt.rejection?.source;
  const expectedLastPhase =
    fixture.browserExpectedFailurePhase === "source-envelope"
      ? "engine-initialized"
      : "model-opened";
  const expectedModelOpened = expectedLastPhase === "model-opened";
  if (
    receipt.outcome !== "inspection-rejected" ||
    receipt.lastPhase !== expectedLastPhase ||
    receipt.cleanup?.modelOpened !== expectedModelOpened ||
    receipt.cleanup?.modelClosed !== expectedModelOpened ||
    receipt.cleanup?.engineDisposed !== true ||
    receipt.workerTerminationRequested !== true ||
    receipt.rejection?.diagnosticCode !==
      "BROWSER_IFC_INPUT_REJECTED" ||
    receipt.rejection?.phase !==
      fixture.browserExpectedFailurePhase ||
    source?.id !== `negative-${fixture.id}` ||
    source?.kind !== "synthetic" ||
    source?.byteLength !== fixture.byteLength ||
    source?.sha256 !== fixture.sha256
  ) {
    throw new Error("negative IFC cleanup receipt is incomplete");
  }
  return {
    id: fixture.id,
    source,
    receipt: {
      outcome: receipt.outcome,
      lastPhase: receipt.lastPhase,
      cleanup: receipt.cleanup,
      rejection: {
        diagnosticCode: receipt.rejection.diagnosticCode,
        phase: receipt.rejection.phase,
      },
      workerTerminationRequested:
        receipt.workerTerminationRequested,
      wallClockMs: receipt.wallClockMs,
    },
  };
}

async function runNegativeCorpusProbe() {
  const run = ++currentRun;
  currentSourceCancellation?.abort();
  sourceSession.cancel("source-replaced");
  const sourceCancellation = new AbortController();
  currentSourceCancellation = sourceCancellation;
  setRunning(true);
  elements.status.dataset.state = "running";
  elements.status.textContent = "Running malformed IFC corpus…";
  try {
    const manifest = await negativeCorpusManifest(
      sourceCancellation.signal,
    );
    const observations = [];
    for (const fixture of manifest.cases) {
      if (run !== currentRun) {
        return;
      }
      elements.status.textContent =
        `Expecting rejection: ${fixture.id}`;
      try {
        await sourceSession.inspect(
          await negativeSource(
            fixture.id,
            sourceCancellation.signal,
          ),
          {
            sourceId: `negative-${fixture.id}`,
            sourceKind: "synthetic",
          },
        );
        throw new Error("negative IFC was unexpectedly accepted");
      } catch (error) {
        observations.push(
          assertExpectedNegativeResult(error, fixture),
        );
      }
    }

    elements.status.textContent =
      "Running valid IFC after negative corpus…";
    const recovery = await sourceSession.inspect(
      await syntheticSource(sourceCancellation.signal),
      {
        sourceId: "synthetic-negative-recovery-ifc4",
        sourceKind: "synthetic",
      },
    );
    if (
      recovery.report.semantics.projects !== 1 ||
      recovery.report.semantics.walls !== 1 ||
      recovery.report.geometry.products !== 1 ||
      recovery.report.geometry.triangles !== 12 ||
      recovery.report.cleanup.modelClosed !== true ||
      recovery.report.cleanup.engineDisposed !== true
    ) {
      throw new Error("post-negative recovery assertion failed");
    }
    if (run === currentRun) {
      renderResult(recovery, {
        successStatus:
          "Passed: negative corpus cleanup and recovery",
      });
      elements.source.textContent =
        `${observations.length} rejected · valid recovery`;
      elements.receipt.textContent = JSON.stringify(
        {
          negativeCorpus: {
            id: manifest.fixtureId,
            cases: observations,
          },
          recovery: {
            report: recovery.report,
            worker: recovery.receipt,
            sourceSession: recovery.sourceSession,
          },
        },
        null,
        2,
      );
    }
  } catch (error) {
    if (run === currentRun) {
      renderFailure(
        sourceCancellation.signal.aborted
          ? new BrowserSourceSessionError(
              "Browser IFC source cancelled",
              {
                outcome: "cancelled",
              },
            )
          : error,
      );
    }
  } finally {
    if (run === currentRun) {
      currentSourceCancellation = null;
      setRunning(false);
    }
  }
}

async function runSource(
  sourceFactory,
  {
    assessResult,
    cancelAfterPhase,
    expected,
    expectCancellation = false,
    sourceId,
    sourceKind,
    status,
    successStatus,
    timeoutMs,
  },
) {
  const run = ++currentRun;
  currentSourceCancellation?.abort();
  sourceSession.cancel("source-replaced");
  const sourceCancellation = new AbortController();
  currentSourceCancellation = sourceCancellation;
  setRunning(true);
  elements.status.dataset.state = "running";
  elements.status.textContent = status;
  try {
    const source = await sourceFactory(sourceCancellation.signal);
    if (run !== currentRun) {
      return;
    }
    const result = await sourceSession.inspect(source, {
      onProgress(progress) {
        if (run !== currentRun) {
          return;
        }
        elements.status.textContent =
          `Worker phase: ${progress.phase}`;
        if (progress.phase === cancelAfterPhase) {
          sourceSession.cancel();
        }
      },
      sourceId,
      sourceKind,
      timeoutMs,
    });
    if (expectCancellation) {
      throw new Error("expected Browser Worker cancellation");
    }
    if (
      expected &&
      (
        result.report.semantics.projects !== expected.projects ||
        result.report.semantics.walls !== expected.walls ||
        result.report.geometry.products !== expected.products ||
        result.report.geometry.triangles !== expected.triangles
      )
    ) {
      throw new Error("fixture assertion failed");
    }
    const assessment = assessResult?.(result);
    if (assessment && !assessment.passed) {
      throw new BrowserSourceSessionError(
        "Browser IFC performance budget exceeded",
        {
          budget: assessment.budget,
          fixture: assessment.fixture,
          outcome: "performance-budget-exceeded",
          violations: assessment.violations,
        },
      );
    }
    if (run === currentRun) {
      renderResult(result, {
        assessment,
        successStatus,
      });
    }
  } catch (error) {
    if (run === currentRun) {
      if (
        !expectCancellation ||
        !renderExpectedCancellation(error)
      ) {
        renderFailure(
          sourceCancellation.signal.aborted
            ? new BrowserSourceSessionError(
                "Browser IFC source cancelled",
                {
                  outcome: "cancelled",
                },
              )
            : error,
        );
      }
    }
  } finally {
    if (run === currentRun) {
      currentSourceCancellation = null;
      setRunning(false);
    }
  }
}

elements.run.addEventListener("click", () => {
  void runSource(syntheticSource, {
    expected: {
      products: 1,
      projects: 1,
      triangles: 12,
      walls: 1,
    },
    sourceId: "synthetic-small-ifc4",
    sourceKind: "synthetic",
    status: "Running synthetic IFC in Browser Worker…",
  });
});
elements.cancelProbe.addEventListener("click", () => {
  void runSource(syntheticSource, {
    cancelAfterPhase: "model-opened",
    expectCancellation: true,
    sourceId: "synthetic-cancel-ifc4",
    sourceKind: "synthetic",
    status: "Opening IFC before cooperative cancellation…",
  });
});
elements.negativeProbe.addEventListener("click", () => {
  void runNegativeCorpusProbe();
});
elements.performanceProbe.addEventListener("click", () => {
  void runSource(performanceSource, {
    assessResult: assessBrowserPerformanceResult,
    expected: {
      products: BROWSER_PERFORMANCE_FIXTURE.products,
      projects: BROWSER_PERFORMANCE_FIXTURE.projects,
      triangles: BROWSER_PERFORMANCE_FIXTURE.triangles,
      walls: BROWSER_PERFORMANCE_FIXTURE.walls,
    },
    sourceId: BROWSER_PERFORMANCE_FIXTURE.id,
    sourceKind: "synthetic",
    status: "Running bounded 1,024-wall performance fixture…",
    successStatus: "Passed: bounded performance fixture",
    timeoutMs: BROWSER_PERFORMANCE_BUDGET.timeoutMs,
  });
});
elements.publicPerformanceProbe.addEventListener("click", () => {
  void runSource(publicPerformanceSource, {
    assessResult: assessPublicBrowserPerformanceResult,
    expected: {
      products: PUBLIC_BROWSER_PERFORMANCE_FIXTURE.products,
      projects: PUBLIC_BROWSER_PERFORMANCE_FIXTURE.projects,
      triangles: PUBLIC_BROWSER_PERFORMANCE_FIXTURE.triangles,
      walls: PUBLIC_BROWSER_PERFORMANCE_FIXTURE.walls,
    },
    sourceId: PUBLIC_BROWSER_PERFORMANCE_FIXTURE.id,
    sourceKind: "public-fixture",
    status: "Running public representative IFC performance fixture…",
    successStatus: "Passed: public representative performance fixture",
    timeoutMs: PUBLIC_BROWSER_PERFORMANCE_BUDGET.timeoutMs,
  });
});
elements.localFile.addEventListener("change", () => {
  const source = elements.localFile.files?.[0];
  if (!source) {
    return;
  }
  elements.localFile.value = "";
  void runSource(async () => source, {
    sourceId: "local-ifc",
    sourceKind: "local-file",
    status: "Running local IFC in Browser Worker…",
  });
});
elements.cancel.addEventListener("click", () => {
  currentSourceCancellation?.abort();
  sourceSession.cancel();
});
globalThis.addEventListener("pagehide", () => {
  currentRun += 1;
  currentSourceCancellation?.abort();
  currentSourceCancellation = null;
  sourceSession.dispose();
});
globalThis.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    sourceSession = new BrowserIfcSourceSession();
    setRunning(false);
  }
});

elements.localFile.dataset.maxBytes = String(MAX_LOCAL_IFC_BYTES);
