import {
  BrowserWorkerError,
  inspectIfcInBrowserWorker,
} from "./worker-client.mjs";

const elements = {
  backend: document.querySelector("#backend"),
  cancel: document.querySelector("#cancel-probe"),
  cleanup: document.querySelector("#cleanup"),
  engine: document.querySelector("#engine"),
  geometry: document.querySelector("#geometry"),
  receipt: document.querySelector("#receipt"),
  run: document.querySelector("#run-probe"),
  schema: document.querySelector("#schema"),
  semantics: document.querySelector("#semantics"),
  status: document.querySelector("#status"),
};

let cancellation = null;

function setRunning(running) {
  elements.run.disabled = running;
  elements.cancel.disabled = !running;
}

function renderResult(result) {
  const { report, receipt } = result;
  elements.engine.textContent =
    `${report.engine.id} ${report.engine.version}`;
  elements.backend.textContent = report.engine.backend;
  elements.schema.textContent = report.fixture.schema;
  elements.semantics.textContent =
    `${report.semantics.projects} / ${report.semantics.walls}`;
  elements.geometry.textContent =
    `${report.geometry.products} / ${report.geometry.triangles}`;
  elements.cleanup.textContent =
    `model ${report.cleanup.modelClosed ? "closed" : "open"}, ` +
    `engine ${report.cleanup.engineDisposed ? "disposed" : "active"}`;
  elements.receipt.textContent = JSON.stringify(
    {
      fixture: report.fixture,
      performance: report.performance,
      cleanup: report.cleanup,
      worker: receipt,
    },
    null,
    2,
  );
  elements.status.dataset.state = "passed";
  elements.status.textContent = "Passed";
}

function renderFailure(error) {
  const receipt = error instanceof BrowserWorkerError
    ? error.receipt
    : {
        outcome: "surface-failed",
      };
  elements.status.dataset.state = "failed";
  elements.status.textContent = `Failed: ${receipt.outcome}`;
  elements.receipt.textContent = JSON.stringify(receipt, null, 2);
}

async function runProbe() {
  cancellation = new AbortController();
  setRunning(true);
  elements.status.dataset.state = "running";
  elements.status.textContent = "Running in Browser Worker…";
  try {
    const response = await fetch("/fixture/synthetic-small.ifc", {
      cache: "no-store",
      credentials: "omit",
    });
    if (!response.ok) {
      throw new Error("fixture unavailable");
    }
    const bytes = await response.arrayBuffer();
    const result = await inspectIfcInBrowserWorker(bytes, {
      signal: cancellation.signal,
    });
    if (
      result.report.fixture.id !== "synthetic-small-ifc4" ||
      result.report.semantics.projects !== 1 ||
      result.report.semantics.walls !== 1 ||
      result.report.geometry.products !== 1 ||
      result.report.geometry.triangles !== 12
    ) {
      throw new Error("fixture assertion failed");
    }
    renderResult(result);
  } catch (error) {
    renderFailure(error);
  } finally {
    cancellation = null;
    setRunning(false);
  }
}

elements.run.addEventListener("click", () => {
  void runProbe();
});
elements.cancel.addEventListener("click", () => {
  cancellation?.abort();
});
