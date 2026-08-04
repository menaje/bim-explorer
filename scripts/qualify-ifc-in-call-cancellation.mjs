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
  "bim-explorer-ifc-in-call-cancellation-evidence/0.1";
const CANCELLATION_DELAY_MS = 25;

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

function cancellationCommand(engine, options, input, fixtureId) {
  if (engine === "web-ifc") {
    return {
      id: "web-ifc-in-call-cancellation",
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
    id: "ifcopenshell-in-call-cancellation",
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
      id: "web-ifc-post-cancellation-recovery",
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
    id: "ifcopenshell-post-cancellation-recovery",
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
    throw new Error(`${engine} returned an invalid call-start checkpoint`);
  }
}

async function cancelInCall(engine, options, input, source) {
  const cancellation = new AbortController();
  let abortTimer = null;
  let checkpoint = null;
  const started = performance.now();
  try {
    await runAdapterProcess({
      ...cancellationCommand(
        engine,
        options,
        input,
        source.fixtureId,
      ),
      cancellationGraceMs: 500,
      onProgress(value) {
        if (value?.schema !== PROGRESS_SCHEMA || checkpoint !== null) {
          return;
        }
        validateProgress(value, engine, source);
        checkpoint = {
          ...value,
          observedAfterStartMs: performance.now() - started,
        };
        abortTimer = setTimeout(() => {
          cancellation.abort();
        }, CANCELLATION_DELAY_MS);
      },
      signal: cancellation.signal,
      timeoutMs: 30_000,
    });
  } catch (error) {
    if (
      !(error instanceof AdapterProcessError) ||
      error.receipt.outcome !== "cancelled" ||
      error.receipt.cancelled !== true ||
      error.receipt.processExited !== true ||
      !["SIGTERM", "SIGKILL"].includes(error.receipt.signal) ||
      checkpoint === null
    ) {
      throw error;
    }
    return {
      checkpoint,
      cancellationDelayMs: CANCELLATION_DELAY_MS,
      receipt: error.receipt,
    };
  } finally {
    if (abortTimer !== null) {
      clearTimeout(abortTimer);
    }
  }
  throw new Error(`${engine} synchronous call completed before cancellation`);
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
    throw new Error(`${engine} post-cancellation recovery failed`);
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
    throw new Error("in-call cancellation evidence contains a path");
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
    path.join(os.tmpdir(), "bim-explorer-ifc-cancel-"),
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
          ...await cancelInCall(
            engine,
            options,
            publicFixture.input,
            source,
          ),
        });
      }
      const recovery = recoverySummary(
        await runAdapterProcess(
          recoveryCommand(engine, options, recoveryInput),
        ),
        engine,
      );
      engines.push({
        engine,
        status: "passed-forced-isolation-cancellation",
        runs,
        recovery,
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
      },
      policy: {
        callStartCheckpoint: "model-open-call-starting",
        cancellationDelayMs: CANCELLATION_DELAY_MS,
        cancellationGraceMs: 500,
        timeoutMs: 30_000,
      },
      engines,
      conformance: {
        publicFixtureIdentityVerified: true,
        callStartCheckpointObserved: true,
        cancellationRequestedAfterCheckpoint: true,
        boundedProcessTermination: true,
        processExitObserved: true,
        postCancellationRecovery: true,
        diagnosticRedaction: true,
      },
      decision: {
        forcedIsolationCancellation: "passed",
        cooperativeEngineCancellation: "blocked",
        explicitCleanupDuringCall: "blocked",
        resourceExhaustion: "blocked",
        productionPackaging: "blocked",
        productionClaims: false,
      },
      limits: [
        "Cancellation is mapped to process termination after a call-start checkpoint.",
        "No engine callback confirms the exact instruction at termination.",
        "Model close and engine dispose cannot run after forced process exit.",
        "Fresh-process recovery does not prove same-process reuse.",
        "No resource-exhaustion or memory-safety claim is made.",
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
