export const BROWSER_PERFORMANCE_FIXTURE = Object.freeze({
  byteLength: 388_316,
  id: "synthetic-performance-1024-ifc4",
  products: 1_024,
  projects: 1,
  route: "/fixture/synthetic-performance.ifc",
  sha256:
    "45bafaeb7aac9a5a15f5996598977c662c2add4bf0123106b0ac20457daa78d3",
  triangles: 12_288,
  walls: 1_024,
});

export const BROWSER_PERFORMANCE_BUDGET = Object.freeze({
  maxInitializationMs: 3_000,
  maxInspectionMs: 5_000,
  maxOpenMs: 3_000,
  maxTotalMs: 8_000,
  maxWallClockMs: 10_000,
  maxWasmHeapCapacityBytes: 256 * 1024 * 1024,
  timeoutMs: 15_000,
});

function finiteNonNegative(value) {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0
  );
}

function safePositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

export function assessBrowserPerformanceResult(result) {
  const report = result?.report;
  const receipt = result?.receipt;
  const violations = [];
  const expected = BROWSER_PERFORMANCE_FIXTURE;
  const budget = BROWSER_PERFORMANCE_BUDGET;
  const checks = [
    [
      report?.source?.id === expected.id,
      "source-id",
    ],
    [
      report?.source?.byteLength === expected.byteLength,
      "source-bytes",
    ],
    [
      report?.source?.sha256 === expected.sha256,
      "source-digest",
    ],
    [
      report?.semantics?.projects === expected.projects,
      "project-count",
    ],
    [
      report?.semantics?.walls === expected.walls,
      "wall-count",
    ],
    [
      report?.geometry?.products === expected.products,
      "product-count",
    ],
    [
      report?.geometry?.triangles === expected.triangles,
      "triangle-count",
    ],
    [
      report?.cleanup?.modelClosed === true,
      "model-cleanup",
    ],
    [
      report?.cleanup?.engineDisposed === true,
      "engine-cleanup",
    ],
    [
      receipt?.outcome === "completed",
      "worker-outcome",
    ],
  ];
  for (const [passed, code] of checks) {
    if (!passed) {
      violations.push(code);
    }
  }

  const measurements = [
    [
      report?.performance?.initializationMs,
      budget.maxInitializationMs,
      "initialization-time",
    ],
    [
      report?.performance?.openMs,
      budget.maxOpenMs,
      "open-time",
    ],
    [
      report?.performance?.inspectionMs,
      budget.maxInspectionMs,
      "inspection-time",
    ],
    [
      report?.performance?.totalMs,
      budget.maxTotalMs,
      "total-time",
    ],
    [
      receipt?.wallClockMs,
      budget.maxWallClockMs,
      "wall-clock-time",
    ],
  ];
  for (const [value, maximum, code] of measurements) {
    if (!finiteNonNegative(value) || value > maximum) {
      violations.push(code);
    }
  }
  const heapCapacity =
    report?.resources?.wasmHeapCapacityBytes?.peakObserved;
  if (
    !safePositiveInteger(heapCapacity) ||
    heapCapacity > budget.maxWasmHeapCapacityBytes
  ) {
    violations.push("wasm-heap-capacity");
  }

  return Object.freeze({
    budget,
    fixture: expected,
    passed: violations.length === 0,
    status: violations.length === 0 ? "passed" : "failed",
    violations: Object.freeze(violations),
  });
}
