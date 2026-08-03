import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  canonicalJson,
  validateIfcEngineReport,
} from "../packages/ifc-engine-contract/src/index.mjs";
import {
  syntheticIfc,
  syntheticMappedIfc,
} from "./generate-synthetic-ifc.mjs";

const CHILD_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const SAFE_ENVIRONMENT_NAMES = [
  "PATH",
  "TMPDIR",
  "TEMP",
  "TMP",
  "LANG",
  "LC_ALL",
  "SYSTEMROOT",
];

function parseArguments(values) {
  const options = {
    engine: "web-ifc",
    fixture: "small",
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
    } else if (name === "--fixture") {
      if (!["small", "mapped"].includes(value)) {
        throw new TypeError(`unsupported IFC fixture ${value}`);
      }
      options.fixture = value;
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

function engineCommands(options, input, fixtureId) {
  const commands = [];
  if (["web-ifc", "all"].includes(options.engine)) {
    commands.push({
      id: "web-ifc",
      executable: process.execPath,
      arguments: [
        path.resolve("adapters/web-ifc/src/inspect.mjs"),
        "--input",
        input,
        "--fixture-id",
        fixtureId,
      ],
    });
  }
  if (["ifcopenshell", "all"].includes(options.engine)) {
    commands.push({
      id: "ifcopenshell",
      executable: options.python,
      arguments: [
        path.resolve("adapters/ifcopenshell/qualify.py"),
        "--input",
        input,
        "--fixture-id",
        fixtureId,
      ],
    });
  }
  return commands;
}

async function execute(command) {
  return await new Promise((resolve, reject) => {
    const started = performance.now();
    const environment = Object.fromEntries(
      SAFE_ENVIRONMENT_NAMES
        .filter((name) => typeof process.env[name] === "string")
        .map((name) => [name, process.env[name]]),
    );
    const child = spawn(command.executable, command.arguments, {
      cwd: process.cwd(),
      env: {
        ...environment,
        NO_COLOR: "1",
        PYTHONDONTWRITEBYTECODE: "1",
        PYTHONUTF8: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, CHILD_TIMEOUT_MS);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (Buffer.byteLength(stdout) > MAX_OUTPUT_BYTES) {
        child.kill("SIGKILL");
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (Buffer.byteLength(stderr) > MAX_OUTPUT_BYTES) {
        child.kill("SIGKILL");
      }
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (exitCode, signal) => {
      clearTimeout(timeout);
      if (timedOut) {
        reject(
          new Error(`${command.id} qualification exceeded ${CHILD_TIMEOUT_MS}ms`),
        );
        return;
      }
      if (exitCode !== 0) {
        reject(
          new Error(
            `${command.id} qualification failed with exit ${exitCode}, ` +
              `signal ${signal ?? "none"}: ${stderr.trim()}`,
          ),
        );
        return;
      }
      const lines = stdout.trim().split("\n").filter(Boolean);
      let report;
      try {
        report = JSON.parse(lines.at(-1));
      } catch (error) {
        reject(
          new Error(
            `${command.id} did not return a JSON report: ${error.message}`,
          ),
        );
        return;
      }
      resolve({
        report,
        receipt: {
          exitCode,
          signal,
          timedOut,
          processExited: true,
          wallClockMs: performance.now() - started,
        },
      });
    });
  });
}

function assertEqual(actual, expected, label) {
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new Error(
      `${label} mismatch: expected ${canonicalJson(expected)}, ` +
        `received ${canonicalJson(actual)}`,
    );
  }
}

function assertFixture(report, manifest) {
  validateIfcEngineReport(report);
  assertEqual(report.fixture.schema, manifest.ifc.schema, "IFC schema");
  assertEqual(
    report.semantics.entityCounts,
    manifest.expected.entities,
    "semantic entity counts",
  );
  assertEqual(
    report.semantics.spatialHierarchy,
    manifest.expected.spatialPath,
    "spatial hierarchy",
  );
  assertEqual(
    report.semantics.globalIds,
    manifest.expected.globalIds,
    "GlobalId diagnostics",
  );
  assertEqual(
    report.semantics.expressIds,
    manifest.expected.expressIds,
    "Express ID diagnostics",
  );
  assertEqual(report.semantics.wall.name, manifest.expected.wall.name, "wall");
  assertEqual(report.semantics.wall.tag, manifest.expected.wall.tag, "wall tag");
  assertEqual(
    report.semantics.wall.type,
    manifest.expected.wall.type,
    "wall type",
  );
  assertEqual(
    report.semantics.wall.materials,
    manifest.expected.wall.materials,
    "wall material",
  );
  assertEqual(
    report.semantics.wall.propertySets,
    manifest.expected.wall.propertySets,
    "wall property sets",
  );
  assertEqual(
    report.semantics.wall.quantities,
    manifest.expected.wall.quantities,
    "wall quantities",
  );
  assertEqual(
    report.semantics.wall.classifications,
    manifest.expected.wall.classifications,
    "wall classifications",
  );
  assertEqual(
    {
      products: report.geometry.products,
      geometries: report.geometry.geometries,
      triangles: report.geometry.triangles,
      coordinateSystem: report.geometry.coordinateSystem,
      bounds: report.geometry.bounds,
      instances: report.geometry.instances,
    },
    manifest.expected.geometry,
    "geometry and placement",
  );
  assertEqual(
    report.representationSharing,
    manifest.expected.representationSharing,
    "mapped representation sharing",
  );
}

function compareEngines(engineEvidence) {
  if (engineEvidence.length < 2) {
    return {
      performed: false,
      reason: "one engine selected",
    };
  }
  const reference = engineEvidence[0].runs[0].report;
  for (const candidate of engineEvidence.slice(1)) {
    const report = candidate.runs[0].report;
    assertEqual(
      report.fixture.sha256,
      reference.fixture.sha256,
      "cross-engine source digest",
    );
    assertEqual(
      report.semantics,
      reference.semantics,
      "cross-engine semantic snapshot",
    );
    assertEqual(
      report.relations,
      reference.relations,
      "cross-engine relation counts",
    );
    assertEqual(
      report.representationSharing,
      reference.representationSharing,
      "cross-engine representation sharing",
    );
    assertEqual(
      {
        products: report.geometry.products,
        geometries: report.geometry.geometries,
        triangles: report.geometry.triangles,
        coordinateSystem: report.geometry.coordinateSystem,
        bounds: report.geometry.bounds,
        instances: report.geometry.instances,
      },
      {
        products: reference.geometry.products,
        geometries: reference.geometry.geometries,
        triangles: reference.geometry.triangles,
        coordinateSystem: reference.geometry.coordinateSystem,
        bounds: reference.geometry.bounds,
        instances: reference.geometry.instances,
      },
      "cross-engine geometry assertion",
    );
  }
  return {
    performed: true,
    passed: true,
    excludedFromEquality: [
      "engine metadata",
      "capability matrix",
      "vertex expansion count",
      "performance",
      "cleanup receipt",
      "engine-specific fingerprint",
    ],
  };
}

async function qualify(options) {
  const temporary = await mkdtemp(
    path.join(os.tmpdir(), "bim-explorer-ifc-qualification-"),
  );
  const fixture = options.fixture === "mapped"
    ? {
      content: syntheticMappedIfc(),
      filename: "synthetic-mapped.ifc",
      manifest: "fixtures/ifc/synthetic-mapped/manifest.json",
    }
    : {
      content: syntheticIfc(),
      filename: "synthetic-small.ifc",
      manifest: "fixtures/ifc/synthetic-small/manifest.json",
    };
  const input = path.join(temporary, fixture.filename);
  try {
    await writeFile(input, fixture.content, {
      encoding: "utf8",
      flag: "wx",
    });
    const manifest = JSON.parse(
      await readFile(fixture.manifest, "utf8"),
    );
    const engineEvidence = [];
    for (
      const command of engineCommands(options, input, manifest.fixtureId)
    ) {
      const runs = [];
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const result = await execute(command);
        assertFixture(result.report, manifest);
        runs.push({
          attempt,
          report: result.report,
          process: result.receipt,
        });
      }
      assertEqual(
        runs[0].report.fingerprint.value,
        runs[1].report.fingerprint.value,
        `${command.id} repeated fingerprint`,
      );
      engineEvidence.push({
        engine: command.id,
        status: `passed-${manifest.fixtureId}`,
        deterministicFingerprint: true,
        runs,
      });
    }

    return {
      schema: "bim-explorer-ifc-engine-qualification-evidence/2",
      asOf: "2026-08-03",
      status: "experimental",
      fixture: {
        id: manifest.fixtureId,
        kind: manifest.kind,
        artifactCommitted: manifest.tracking.artifactCommitted,
        thirdPartyContent: manifest.redistribution.thirdPartyContent,
        qualificationUse: manifest.qualificationUse,
        heldScenarios: manifest.notQualified,
      },
      environment: {
        platform: process.platform,
        architecture: process.arch,
        node: process.version,
      },
      engines: engineEvidence,
      crossEngineComparison: compareEngines(engineEvidence),
      decision: {
        goNoGo: "held",
        readRender: "experimental-only",
        writeRoundTrip: "blocked",
        reason:
          `${manifest.notQualified.join(", ")}, cancellation, ` +
          "Browser/VS Code packaging and redistribution gates remain open",
      },
    };
  } finally {
    await rm(temporary, {
      recursive: true,
      force: true,
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
  console.log(path.relative(process.cwd(), options.output));
}

await main();
