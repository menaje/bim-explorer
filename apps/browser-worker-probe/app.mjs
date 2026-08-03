import { BrowserWorkerError } from "./worker-client.mjs";
import {
  BrowserIfcSourceSession,
  BrowserSourceSessionError,
  MAX_LOCAL_IFC_BYTES,
} from "./source-session.mjs";

const elements = {
  backend: document.querySelector("#backend"),
  cancel: document.querySelector("#cancel-probe"),
  cleanup: document.querySelector("#cleanup"),
  engine: document.querySelector("#engine"),
  geometry: document.querySelector("#geometry"),
  localFile: document.querySelector("#local-file"),
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

function renderResult(result) {
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
      performance: report.performance,
      cleanup: report.cleanup,
      worker: receipt,
      sourceSession: result.sourceSession,
    },
    null,
    2,
  );
  elements.status.dataset.state = "passed";
  elements.status.textContent = "Passed";
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

async function runSource(
  sourceFactory,
  {
    expected,
    sourceId,
    sourceKind,
    status,
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
      sourceId,
      sourceKind,
    });
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
    if (run === currentRun) {
      renderResult(result);
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

elements.run.addEventListener("click", () => {
  void runSource(async (signal) => {
    const response = await fetch("/fixture/synthetic-small.ifc", {
      cache: "no-store",
      credentials: "omit",
      signal,
    });
    if (!response.ok) {
      throw new Error("fixture unavailable");
    }
    return await response.blob();
  }, {
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
