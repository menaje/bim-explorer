import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";

import {
  canonicalJson,
  validateIfcEngineReport,
} from "../packages/ifc-engine-contract/src/index.mjs";
import {
  runAdapterProcess,
} from "../packages/ifc-engine-contract/src/process-supervisor.mjs";
import {
  syntheticNegativeIfcCorpus,
} from "./generate-negative-ifc-corpus.mjs";
import {
  syntheticIfc,
} from "./generate-synthetic-ifc.mjs";

const NEGATIVE_RESULT_SCHEMA =
  "bim-explorer-ifc-negative-result/0.1";
const EVIDENCE_SCHEMA =
  "bim-explorer-ifc-negative-corpus-evidence/0.1";
const MANIFEST =
  "fixtures/ifc/negative-corpus/manifest.json";
const RECOVERY_MANIFEST =
  "fixtures/ifc/synthetic-small/manifest.json";

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

function negativeCommand(engine, options, input, fixtureId) {
  if (engine === "web-ifc") {
    return {
      id: "web-ifc-negative",
      executable: process.execPath,
      arguments: [
        path.resolve("adapters/web-ifc/src/inspect-negative.mjs"),
        "--input",
        input,
        "--fixture-id",
        fixtureId,
      ],
    };
  }
  return {
    id: "ifcopenshell-negative",
    executable: options.python,
    arguments: [
      path.resolve("adapters/ifcopenshell/inspect_negative.py"),
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
      id: "web-ifc-recovery",
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
    id: "ifcopenshell-recovery",
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

function assertEqual(actual, expected, label) {
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new Error(`${label} mismatch`);
  }
}

function validateManifest(manifest, corpus) {
  if (
    manifest.schema !==
      "bim-explorer-ifc-negative-corpus-manifest/1" ||
    manifest.fixtureId !== "synthetic-negative-ifc-corpus" ||
    manifest.tracking?.artifactCommitted !== false ||
    manifest.redistribution?.thirdPartyContent !== false ||
    !Array.isArray(manifest.cases) ||
    manifest.cases.length !== corpus.length
  ) {
    throw new Error("negative IFC corpus manifest is invalid");
  }
  assertEqual(
    manifest.cases,
    corpus.map((value) => ({
      id: value.id,
      description: value.description,
      browserExpectedFailurePhase:
        value.browserExpectedFailurePhase,
      byteLength: value.byteLength,
      sha256: value.sha256,
      expected: "rejected",
    })),
    "negative IFC corpus manifest cases",
  );
}

function validateNegativeReport(report, engine, fixture) {
  const expectedIdentity = engine === "web-ifc"
    ? {
      backend: "node-wasm-process",
      id: "web-ifc",
      license: "MPL-2.0",
      version: "0.0.77",
    }
    : {
      backend: "python-native-process",
      id: "ifcopenshell",
      license: "LGPL-3.0-or-later",
      version: "0.8.4.post1",
    };
  if (
    report?.schema !== NEGATIVE_RESULT_SCHEMA ||
    report.status !== "rejected"
  ) {
    throw new Error(`${engine} did not return a negative result`);
  }
  assertEqual(report.engine, expectedIdentity, `${engine} identity`);
  assertEqual(
    report.fixture,
    {
      byteLength: fixture.byteLength,
      id: fixture.id,
      sha256: fixture.sha256,
    },
    `${engine} negative fixture identity`,
  );
  if (
    report.failure?.code !== "IFC_INPUT_REJECTED" ||
    typeof report.failure?.phase !== "string" ||
    report.failure.phase.length === 0 ||
    canonicalJson(report.diagnostics) !==
      canonicalJson([{ code: "IFC_INPUT_REJECTED" }]) ||
    report.cleanup?.engineInitialized !== true
  ) {
    throw new Error(`${engine} rejection diagnostic is incomplete`);
  }
  if (engine === "web-ifc") {
    if (
      report.cleanup.strategy !== "explicit-api" ||
      report.cleanup.engineDisposed !== true ||
      report.cleanup.processExitRequired !== false ||
      (
        report.cleanup.modelOpened &&
        report.cleanup.modelClosed !== true
      )
    ) {
      throw new Error("web-ifc negative cleanup is incomplete");
    }
  } else if (
    report.cleanup.strategy !== "process-isolation" ||
    report.cleanup.processExitRequired !== true ||
    (
      report.cleanup.modelOpened &&
      report.cleanup.modelReferenceReleased !== true
    )
  ) {
    throw new Error("IfcOpenShell negative cleanup is incomplete");
  }
}

function validateRecovery(result, engine, fixture) {
  const report = result.report;
  validateIfcEngineReport(report);
  if (
    report.fixture.id !== fixture.fixtureId ||
    report.fixture.sha256 !== fixture.expected.sha256 ||
    report.fixture.byteLength !== fixture.expected.byteLength ||
    report.fixture.schema !== "IFC4" ||
    report.semantics.entityCounts.IfcProject !== 1 ||
    report.semantics.entityCounts.IfcWall !== 1 ||
    report.geometry.products !== 1 ||
    report.geometry.triangles !== 12 ||
    result.receipt.outcome !== "completed" ||
    result.receipt.processExited !== true
  ) {
    throw new Error(`${engine} post-negative recovery failed`);
  }
  if (
    engine === "web-ifc" &&
    (
      report.cleanup.modelClosed !== true ||
      report.cleanup.engineDisposed !== true
    )
  ) {
    throw new Error("web-ifc recovery cleanup is incomplete");
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
  const visit = (candidate) => {
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    if (candidate !== null && typeof candidate === "object") {
      for (const [key, item] of Object.entries(candidate)) {
        if (key.toLowerCase().includes("path")) {
          throw new Error("negative evidence contains a path field");
        }
        visit(item);
      }
      return;
    }
    if (
      typeof candidate === "string" &&
      /(?:\/Users\/|\/Volumes\/|[A-Z]:\\)/u.test(candidate)
    ) {
      throw new Error("negative evidence contains an absolute path");
    }
  };
  visit(value);
}

async function qualify(options) {
  const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
  const recoveryManifest = JSON.parse(
    await readFile(RECOVERY_MANIFEST, "utf8"),
  );
  const corpus = syntheticNegativeIfcCorpus();
  validateManifest(manifest, corpus);
  const recoveryBytes = Buffer.from(syntheticIfc(), "utf8");
  const recoverySha256 = createHash("sha256")
    .update(recoveryBytes)
    .digest("hex");
  const temporary = await mkdtemp(
    path.join(os.tmpdir(), "bim-explorer-ifc-negative-"),
  );
  const recoveryInput = path.join(temporary, "recovery.ifc");
  try {
    await writeFile(recoveryInput, recoveryBytes, {
      flag: "wx",
    });
    const inputs = new Map();
    for (const fixture of corpus) {
      const input = path.join(temporary, `${fixture.id}.ifc`);
      await writeFile(input, fixture.bytes, {
        flag: "wx",
      });
      inputs.set(fixture.id, input);
    }

    const engines = [];
    for (const engine of selectedEngines(options)) {
      const cases = [];
      for (const fixture of corpus) {
        const runs = [];
        for (let attempt = 1; attempt <= 2; attempt += 1) {
          const result = await runAdapterProcess(
            negativeCommand(
              engine,
              options,
              inputs.get(fixture.id),
              fixture.id,
            ),
          );
          validateNegativeReport(result.report, engine, fixture);
          runs.push({
            attempt,
            report: result.report,
            process: result.receipt,
          });
        }
        if (
          canonicalJson(runs[0].report) !==
          canonicalJson(runs[1].report)
        ) {
          throw new Error(
            `${engine} ${fixture.id} rejection is not deterministic`,
          );
        }
        const recovery = validateRecovery(
          await runAdapterProcess(
            recoveryCommand(
              engine,
              options,
              recoveryInput,
            ),
          ),
          engine,
          {
            expected: {
              byteLength: recoveryBytes.byteLength,
              sha256: recoverySha256,
            },
            fixtureId: recoveryManifest.fixtureId,
          },
        );
        cases.push({
          id: fixture.id,
          deterministicRejection: true,
          runs,
          recovery,
        });
      }
      engines.push({
        engine,
        status: "passed-negative-corpus",
        cases,
      });
    }

    const evidence = {
      schema: EVIDENCE_SCHEMA,
      asOf: "2026-08-04",
      status: "experimental",
      fixture: {
        id: manifest.fixtureId,
        kind: manifest.kind,
        artifactCommitted: manifest.tracking.artifactCommitted,
        thirdPartyContent:
          manifest.redistribution.thirdPartyContent,
        cases: manifest.cases,
      },
      environment: {
        architecture: process.arch,
        node: process.version,
        platform: process.platform,
      },
      engines,
      conformance: {
        manifestIntegrity: true,
        boundedGeneratedInputs: true,
        repeatedDeterministicRejection: true,
        explicitOrProcessIsolatedCleanup: true,
        processExitObserved: true,
        postFailureRecovery: true,
        diagnosticRedaction: true,
      },
      decision: {
        corruptInputCleanup: "passed-adapter-boundary",
        browserWorkerCorruptInputCleanup: "separate-evidence-required",
        inCallCancellation: "blocked",
        resourceExhaustion: "blocked",
        productionPackaging: "blocked",
        productionClaims: false,
      },
      limits: [
        "Three small repository-authored syntax and truncation cases were exercised.",
        "IfcOpenShell cleanup is bounded by process exit, not an explicit close API.",
        "No resource-exhaustion or memory-safety proof was performed.",
        "Synchronous engine calls were not preempted.",
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
