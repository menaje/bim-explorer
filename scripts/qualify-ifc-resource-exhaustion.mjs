import {
  mkdtemp,
  mkdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  validateIfcEngineReport,
} from "../packages/ifc-engine-contract/src/index.mjs";
import {
  AdapterProcessError,
  runAdapterProcess,
} from "../packages/ifc-engine-contract/src/process-supervisor.mjs";
import {
  syntheticIfc,
} from "./generate-synthetic-ifc.mjs";
import {
  ensurePublicIfcFixture,
} from "./public-ifc-fixture.mjs";

const PROGRESS_SCHEMA =
  "bim-explorer-ifc-in-call-progress/0.1";
const EVIDENCE_SCHEMA =
  "bim-explorer-ifc-resource-exhaustion-evidence/0.1";
const MAX_RESIDENT_SET_BYTES = 256 * 1024 * 1024;
const RESOURCE_SAMPLE_INTERVAL_MS = 10;

function parseArguments(values) {
  const options = {
    engine: "web-ifc",
    output: null,
    python: null,
  };
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index];
    const value = values[index + 1];
    if (!value) {
      throw new TypeError(`missing value for ${name}`);
    }
    if (name === "--engine") {
      if (!["web-ifc", "ifcopenshell", "all"].includes(value)) {
        throw new TypeError(`unsupported IFC engine ${value}`);
      }
      options.engine = value;
    } else if (name === "--python") {
      options.python = path.resolve(value);
    } else if (name === "--output") {
      options.output = path.resolve(value);
    } else {
      throw new TypeError(`unknown argument ${name}`);
    }
  }
  if (
    ["ifcopenshell", "all"].includes(options.engine) &&
    options.python === null
  ) {
    throw new TypeError(
      "--python <venv-python> is required for IfcOpenShell qualification",
    );
  }
  return options;
}

function selectedEngines(options) {
  return options.engine === "all"
    ? ["web-ifc", "ifcopenshell"]
    : [options.engine];
}

function pressureCommand(engine, options, input, fixtureId) {
  if (engine === "web-ifc") {
    return {
      id: "web-ifc-rss-pressure",
      executable: process.execPath,
      arguments: [
        path.resolve("adapters/web-ifc/src/cancel-in-call.mjs"),
        "--input",
        input,
        "--fixture-id",
        fixtureId,
      ],
    };
  }
  return {
    id: "ifcopenshell-rss-pressure",
    executable: options.python,
    arguments: [
      path.resolve("adapters/ifcopenshell/cancel_in_call.py"),
      "--input",
      input,
      "--fixture-id",
      fixtureId,
    ],
  };
}

function recoveryCommand(engine, options, input) {
  if (engine === "web-ifc") {
    return {
      id: "web-ifc-post-rss-recovery",
      executable: process.execPath,
      arguments: [
        path.resolve("adapters/web-ifc/src/inspect.mjs"),
        "--input",
        input,
        "--fixture-id",
        "synthetic-small-ifc4",
      ],
    };
  }
  return {
    id: "ifcopenshell-post-rss-recovery",
    executable: options.python,
    arguments: [
      path.resolve("adapters/ifcopenshell/qualify.py"),
      "--input",
      input,
      "--fixture-id",
      "synthetic-small-ifc4",
    ],
  };
}

function expectedEngine(engine) {
  return engine === "web-ifc"
    ? {
      backend: "node-wasm-process",
      id: "web-ifc",
      version: "0.0.77",
    }
    : {
      backend: "python-native-process",
      id: "ifcopenshell",
      version: "0.8.4.post1",
    };
}

function validateProgress(value, engine, source) {
  const identity = expectedEngine(engine);
  if (
    value?.schema !== PROGRESS_SCHEMA ||
    value.phase !== "model-open-call-starting" ||
    value.engine?.id !== identity.id ||
    value.engine?.version !== identity.version ||
    value.engine?.backend !== identity.backend ||
    value.source?.id !== source.fixtureId ||
    value.source?.byteLength !== source.byteLength ||
    value.source?.sha256 !== source.sha256
  ) {
    throw new Error(`${engine} returned an invalid RSS checkpoint`);
  }
}

async function exceedRssBudget(engine, options, input, source) {
  let checkpoint = null;
  const started = performance.now();
  try {
    await runAdapterProcess({
      ...pressureCommand(
        engine,
        options,
        input,
        source.fixtureId,
      ),
      maxResidentSetBytes: MAX_RESIDENT_SET_BYTES,
      onProgress(value) {
        if (value?.schema !== PROGRESS_SCHEMA || checkpoint !== null) {
          return;
        }
        validateProgress(value, engine, source);
        checkpoint = {
          ...value,
          observedAfterStartMs: performance.now() - started,
        };
      },
      resourceSampleIntervalMs: RESOURCE_SAMPLE_INTERVAL_MS,
      timeoutMs: 30_000,
    });
  } catch (error) {
    if (
      !(error instanceof AdapterProcessError) ||
      error.receipt.outcome !== "rss-limit" ||
      error.receipt.residentSetLimitExceeded !== true ||
      error.receipt.maxResidentSetBytes !==
        MAX_RESIDENT_SET_BYTES ||
      error.receipt.peakResidentSetBytes <=
        MAX_RESIDENT_SET_BYTES ||
      error.receipt.resourceSampleIntervalMs !==
        RESOURCE_SAMPLE_INTERVAL_MS ||
      error.receipt.processExited !== true ||
      error.receipt.signal !== "SIGKILL" ||
      error.receipt.timedOut !== false ||
      checkpoint === null
    ) {
      throw error;
    }
    return {
      checkpoint,
      receipt: error.receipt,
    };
  }
  throw new Error(`${engine} did not exceed the process RSS budget`);
}

function recoverySummary(result, engine) {
  validateIfcEngineReport(result.report);
  const report = result.report;
  if (
    report.engine.id !== engine ||
    report.fixture.id !== "synthetic-small-ifc4" ||
    report.fixture.byteLength !== 2855 ||
    report.fixture.sha256 !==
      "ad3ed676d52c2c49d2a18e8ca2c03b56f54cf1d4de41aada8db55dbdd473a6a2" ||
    report.fixture.schema !== "IFC4" ||
    report.semantics.entityCounts.IfcProject !== 1 ||
    report.semantics.entityCounts.IfcWall !== 1 ||
    report.geometry.products !== 1 ||
    report.geometry.triangles !== 12 ||
    result.receipt.outcome !== "completed" ||
    result.receipt.processExited !== true
  ) {
    throw new Error(`${engine} post-RSS recovery failed`);
  }
  return {
    source: report.fixture,
    semantics: {
      projects: report.semantics.entityCounts.IfcProject,
      walls: report.semantics.entityCounts.IfcWall,
    },
    geometry: {
      products: report.geometry.products,
      triangles: report.geometry.triangles,
    },
    cleanup: report.cleanup,
    process: result.receipt,
  };
}

function assertPathFree(value) {
  if (
    /(?:\/Users\/|\/Volumes\/|[A-Z]:\\)/u.test(
      JSON.stringify(value),
    )
  ) {
    throw new Error("resource-exhaustion evidence contains a path");
  }
}

async function qualify(options) {
  const publicFixture = await ensurePublicIfcFixture();
  const source = {
    fixtureId: publicFixture.receipt.fixtureId,
    byteLength: publicFixture.receipt.entry.byteLength,
    sha256: publicFixture.receipt.entry.sha256,
    schema: publicFixture.receipt.entry.schema,
  };
  const temporary = await mkdtemp(
    path.join(os.tmpdir(), "bim-explorer-ifc-rss-"),
  );
  const recoveryInput = path.join(temporary, "recovery.ifc");
  try {
    await writeFile(recoveryInput, syntheticIfc(), {
      encoding: "utf8",
      flag: "wx",
    });
    const engines = [];
    for (const engine of selectedEngines(options)) {
      const runs = [];
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        runs.push({
          attempt,
          ...await exceedRssBudget(
            engine,
            options,
            publicFixture.input,
            source,
          ),
        });
      }
      engines.push({
        engine,
        status: "passed-process-rss-limit",
        runs,
        recovery: recoverySummary(
          await runAdapterProcess(
            recoveryCommand(engine, options, recoveryInput),
          ),
          engine,
        ),
      });
    }
    const evidence = {
      schema: EVIDENCE_SCHEMA,
      asOf: "2026-08-04",
      status: "experimental",
      fixture: {
        id: source.fixtureId,
        byteLength: source.byteLength,
        sha256: source.sha256,
        schema: source.schema,
        cacheHit: publicFixture.receipt.cacheHit,
        artifactCommitted:
          publicFixture.receipt.policy.artifactCommitted,
        bundlingApproved:
          publicFixture.receipt.policy.bundlingApproved,
        customerContent:
          publicFixture.receipt.policy.customerContent,
      },
      environment: {
        architecture: process.arch,
        node: process.version,
        platform: process.platform,
        sampler: "ps-rss-kibibytes",
      },
      policy: {
        callStartCheckpoint: "model-open-call-starting",
        maxResidentSetBytes: MAX_RESIDENT_SET_BYTES,
        resourceSampleIntervalMs: RESOURCE_SAMPLE_INTERVAL_MS,
        timeoutMs: 30_000,
      },
      engines,
      conformance: {
        publicFixtureIdentityVerified: true,
        callStartCheckpointObserved: true,
        processRssBudgetEnforced: true,
        forcedProcessTermination: true,
        processExitObserved: true,
        postTerminationRecovery: true,
        diagnosticRedaction: true,
      },
      decision: {
        boundedProcessRssTermination: "passed",
        resourceExhaustion: "partial-process-rss-only",
        browserHeapExhaustion: "blocked",
        engineMemorySafety: "blocked",
        explicitCleanupAfterKill: "blocked",
        productionPackaging: "blocked",
        productionClaims: false,
      },
      limits: [
        "RSS is sampled by the parent process and may overshoot between samples.",
        "The observation does not identify the engine allocation that crossed the limit.",
        "SIGKILL cannot return model-close or engine-dispose receipts.",
        "Fresh-process recovery does not prove same-process reuse.",
        "Browser heap exhaustion, native allocator safety and adversarial parser memory safety remain unqualified.",
      ],
    };
    assertPathFree(evidence);
    return evidence;
  } finally {
    await rm(temporary, {
      force: true,
      recursive: true,
    });
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const evidence = await qualify(options);
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
  process.stdout.write(`${path.relative(process.cwd(), options.output)}\n`);
}

await main();
