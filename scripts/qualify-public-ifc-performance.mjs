import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  runAdapterProcess,
} from "../packages/ifc-engine-contract/src/process-supervisor.mjs";
import {
  WEB_IFC_PERFORMANCE_REPORT,
} from "../adapters/web-ifc/src/measure-performance.mjs";
import {
  ensurePublicIfcFixture,
  loadPublicIfcFixtureManifest,
} from "./public-ifc-fixture.mjs";

function parseArguments(values) {
  if (values.length === 0) {
    return {
      output: null,
    };
  }
  if (
    values.length !== 2 ||
    values[0] !== "--output" ||
    !values[1]
  ) {
    throw new TypeError(
      "usage: node scripts/qualify-public-ifc-performance.mjs " +
        "[--output evidence.json]",
    );
  }
  return {
    output: path.resolve(values[1]),
  };
}

function assertExact(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(
      `${label} mismatch: expected ${expected}, received ${actual}`,
    );
  }
}

function assertMeasurement(value, maximum, label) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > maximum
  ) {
    throw new Error(`${label} exceeded its ${maximum} budget`);
  }
}

function assertReport(result, manifest) {
  const report = result.report;
  const budget = manifest.nodeBudget;
  if (
    report?.schema !== WEB_IFC_PERFORMANCE_REPORT ||
    report.status !== "passed" ||
    report.engine?.id !== "web-ifc" ||
    report.engine?.version !== "0.0.77" ||
    report.engine?.backend !== "node-wasm-isolated-performance" ||
    report.engine?.license !== "MPL-2.0" ||
    report.source?.id !== manifest.fixtureId ||
    report.source?.kind !== "third-party-public-performance"
  ) {
    throw new Error("public IFC performance report identity mismatch");
  }
  for (const [actual, expected, label] of [
    [
      report.source.byteLength,
      manifest.entry.byteLength,
      "source byte length",
    ],
    [report.source.sha256, manifest.entry.sha256, "source digest"],
    [report.source.schema, manifest.ifc.schema, "source schema"],
    [
      report.semantics?.projects,
      manifest.expected.projects,
      "project count",
    ],
    [
      report.semantics?.walls,
      manifest.expected.walls,
      "wall count",
    ],
    [
      report.semantics?.productsByType,
      manifest.expected.productsByType,
      "product type count",
    ],
    [
      report.geometry?.products,
      manifest.expected.geometryProducts,
      "geometry product count",
    ],
    [
      report.geometry?.geometries,
      manifest.expected.geometries,
      "geometry count",
    ],
    [
      report.geometry?.triangles,
      manifest.expected.triangles,
      "triangle count",
    ],
    [
      report.resources?.inputBytes,
      manifest.entry.byteLength,
      "resource input bytes",
    ],
  ]) {
    assertExact(actual, expected, label);
  }
  for (const [field, maximum] of Object.entries({
    initializationMs: budget.maxInitializationMs,
    openMs: budget.maxOpenMs,
    inspectionMs: budget.maxInspectionMs,
    totalMs: budget.maxTotalMs,
  })) {
    assertMeasurement(
      report.performance?.[field],
      maximum,
      `performance.${field}`,
    );
  }
  const heap = report.resources?.wasmHeapCapacityBytes;
  if (
    !Number.isSafeInteger(heap?.afterInitialization) ||
    !Number.isSafeInteger(heap?.afterOpen) ||
    !Number.isSafeInteger(heap?.afterInspection) ||
    !Number.isSafeInteger(heap?.peakObserved) ||
    heap.afterInitialization <= 0 ||
    heap.afterInitialization > heap.afterOpen ||
    heap.afterOpen > heap.afterInspection ||
    heap.peakObserved !== Math.max(
      heap.afterInitialization,
      heap.afterOpen,
      heap.afterInspection,
    ) ||
    heap.peakObserved > budget.maxWasmHeapCapacityBytes
  ) {
    throw new Error("WASM heap capacity observation is invalid");
  }
  const processMemory = report.resources?.processMemoryBytes;
  if (
    !Number.isSafeInteger(processMemory?.maximumResidentSetSize) ||
    !Number.isSafeInteger(
      processMemory?.residentSetSizeAfterInspection,
    ) ||
    !Number.isSafeInteger(processMemory?.heapUsedAfterInspection) ||
    processMemory.maximumResidentSetSize <= 0 ||
    processMemory.maximumResidentSetSize >
      budget.maxProcessRssBytes ||
    report.cleanup?.modelClosed !== true ||
    report.cleanup?.engineDisposed !== true ||
    !Array.isArray(report.diagnostics) ||
    report.diagnostics.length !== 0
  ) {
    throw new Error("process memory or cleanup observation is invalid");
  }
  assertMeasurement(
    result.receipt?.wallClockMs,
    budget.maxWallClockMs,
    "process.wallClockMs",
  );
  if (
    result.receipt?.outcome !== "completed" ||
    result.receipt?.processExited !== true ||
    result.receipt?.exitCode !== 0 ||
    result.receipt?.timedOut !== false ||
    result.receipt?.cancelled !== false ||
    result.receipt?.outputLimitExceeded !== false ||
    result.receipt?.stderrCaptured !== false
  ) {
    throw new Error("isolated performance process did not complete cleanly");
  }
}

async function qualify() {
  const manifest = await loadPublicIfcFixtureManifest();
  const fixture = await ensurePublicIfcFixture({
    manifest,
  });
  const command = {
    id: "web-ifc-public-performance",
    executable: process.execPath,
    arguments: [
      path.resolve(
        "adapters/web-ifc/src/measure-performance.mjs",
      ),
      "--input",
      fixture.input,
      "--fixture-id",
      manifest.fixtureId,
    ],
    maxOutputBytes: 64 * 1024,
    timeoutMs: manifest.nodeBudget.timeoutMs,
  };
  const runs = [];
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const result = await runAdapterProcess(command);
    assertReport(result, manifest);
    runs.push({
      attempt,
      report: result.report,
      process: result.receipt,
    });
  }
  const expectedIdentity = JSON.stringify({
    source: runs[0].report.source,
    semantics: runs[0].report.semantics,
    geometry: runs[0].report.geometry,
  });
  if (
    JSON.stringify({
      source: runs[1].report.source,
      semantics: runs[1].report.semantics,
      geometry: runs[1].report.geometry,
    }) !== expectedIdentity
  ) {
    throw new Error("public IFC repeated identity differs");
  }

  return {
    schema: "bim-explorer-public-ifc-performance-evidence/0.1",
    status: "experimental",
    observedAt: new Date().toISOString(),
    fixture: {
      id: manifest.fixtureId,
      manifest:
        "fixtures/ifc/public-schependomlaan/manifest.json",
      kind: manifest.kind,
      schema: manifest.ifc.schema,
      byteLength: manifest.entry.byteLength,
      sha256: manifest.entry.sha256,
      artifactCommitted: false,
      thirdPartyContent: true,
      profileAdmission: false,
    },
    provenance: {
      repository: manifest.provenance.repository,
      commit: manifest.provenance.commit,
      sourcePage: manifest.provenance.sourcePage,
      licensePage: manifest.provenance.licensePage,
      license: manifest.provenance.license,
      attribution: manifest.provenance.attribution,
      rightsVerified: manifest.redistribution.rightsVerified,
      bundlingApproved: manifest.redistribution.bundlingApproved,
    },
    acquisition: fixture.receipt,
    engine: {
      id: "web-ifc",
      version: "0.0.77",
      backend: "node-wasm-isolated-performance",
      license: "MPL-2.0",
    },
    environment: {
      platform: process.platform,
      architecture: process.arch,
      node: process.version,
    },
    budget: manifest.nodeBudget,
    runs,
    conformance: {
      pinnedSource: true,
      archiveIdentityVerified: true,
      extractedIdentityVerified: true,
      boundedAcquisition: true,
      repeatedModelIdentity: true,
      cpuBudgetEnforced: true,
      peakProcessRssObserved: true,
      wasmHeapCapacityObserved: true,
      isolatedCleanup: true,
      pathFreeReport: true,
    },
    decision: {
      publicFixtureProvenance: "passed",
      representativeNodeCpuRss: "passed",
      browserRepresentativeParsing: "blocked",
      gpuMemory: "blocked",
      renderFirstFrame: "blocked",
      fixtureBundling: "blocked",
      draftProfileAdmission: "blocked",
      engineSelection: "held",
      productionClaims: false,
    },
    limits: [
      "This IFC2X3 source is performance-only and does not expand the draft IFC4 profile.",
      "Peak RSS is the isolated Node process maximum, not Browser or GPU memory.",
      "The upstream archive is downloaded on demand and is not committed or bundled.",
      "Browser Worker parsing and rendered first-frame remain separate gates.",
    ],
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const evidence = await qualify();
  const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
  if (options.output === null) {
    process.stdout.write(serialized);
    return;
  }
  await mkdir(path.dirname(options.output), {
    recursive: true,
  });
  await writeFile(options.output, serialized, {
    encoding: "utf8",
    flag: "wx",
  });
  console.log(path.relative(process.cwd(), options.output));
}

await main();
