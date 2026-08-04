import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  canonicalJson,
  validateIfcEngineReport,
} from "../packages/ifc-engine-contract/src/index.mjs";
import {
  runAdapterProcess,
} from "../packages/ifc-engine-contract/src/process-supervisor.mjs";
import { syntheticIfc } from "./generate-synthetic-ifc.mjs";

export const WEB_IFC_PLATFORM_PACKAGE_EVIDENCE_SCHEMA =
  "bim-explorer-web-ifc-platform-package-evidence/0.1";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const TEMPLATE = path.join(
  ROOT,
  "packaging",
  "web-ifc-platform-stage",
);
const PACKAGE_NAME = "@bim-explorer/web-ifc-platform-stage";
const PACKAGE_VERSION = "0.0.0-qualification";
const FIXTURE_ID = "synthetic-platform-package-ifc4";
const execFileAsync = promisify(execFile);

const STAGE_FILES = Object.freeze([
  {
    source: "packaging/web-ifc-platform-stage/package.json",
    target: "package.json",
  },
  {
    source: "packaging/web-ifc-platform-stage/README.md",
    target: "README.md",
  },
  {
    source:
      "packaging/web-ifc-platform-stage/THIRD_PARTY_NOTICES.md",
    target: "THIRD_PARTY_NOTICES.md",
  },
  {
    source: "adapters/web-ifc/src/inspect.mjs",
    target: "bin/inspect.mjs",
  },
  {
    source: "packages/ifc-engine-contract/package.json",
    target:
      "node_modules/@bim-explorer/ifc-engine-contract/package.json",
  },
  {
    source: "packages/ifc-engine-contract/src/index.mjs",
    target:
      "node_modules/@bim-explorer/ifc-engine-contract/src/index.mjs",
  },
  {
    source: "node_modules/web-ifc/package.json",
    target: "node_modules/web-ifc/package.json",
  },
  {
    source: "node_modules/web-ifc/web-ifc-api-node.js",
    target: "node_modules/web-ifc/web-ifc-api-node.js",
  },
  {
    source: "node_modules/web-ifc/web-ifc-node.wasm",
    target: "node_modules/web-ifc/web-ifc-node.wasm",
  },
  {
    source: "node_modules/web-ifc/LICENSE.md",
    target: "node_modules/web-ifc/LICENSE.md",
  },
]);

function parseArguments(values) {
  const options = {
    artifactDirectory: null,
    output: null,
  };
  if (values.length % 2 !== 0) {
    throw new TypeError(
      "--output and --artifact-directory require values",
    );
  }
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index];
    const value = values[index + 1];
    if (typeof value !== "string" || value.length === 0) {
      throw new TypeError(`missing value for ${name}`);
    }
    if (name === "--output") {
      options.output = path.resolve(value);
    } else if (name === "--artifact-directory") {
      options.artifactDirectory = path.resolve(value);
    } else {
      throw new TypeError(`unknown argument ${name}`);
    }
  }
  return options;
}

async function sha256File(file) {
  return createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
}

async function stageFiles(stageRoot) {
  for (const entry of STAGE_FILES) {
    const source = path.join(ROOT, entry.source);
    const target = path.join(stageRoot, entry.target);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(source, target);
  }
}

async function inventoryFiles(root, relative = "") {
  const directory = path.join(root, relative);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name))) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      files.push(...await inventoryFiles(root, child));
    } else if (entry.isFile()) {
      const absolute = path.join(root, child);
      const metadata = await stat(absolute);
      files.push({
        file: child.split(path.sep).join("/"),
        byteLength: metadata.size,
        sha256: await sha256File(absolute),
      });
    } else {
      throw new Error(`stage contains a non-file entry: ${child}`);
    }
  }
  return files;
}

function inventoryDigest(inventory) {
  return createHash("sha256")
    .update(canonicalJson(inventory))
    .digest("hex");
}

function npmExecutable() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

async function createArchive(stageRoot, archiveRoot) {
  const result = await execFileAsync(
    npmExecutable(),
    [
      "pack",
      "--json",
      "--ignore-scripts",
      "--pack-destination",
      archiveRoot,
    ],
    {
      cwd: stageRoot,
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      timeout: 30_000,
    },
  );
  let pack;
  try {
    pack = JSON.parse(result.stdout);
  } catch {
    throw new Error("npm pack did not return JSON metadata");
  }
  if (
    !Array.isArray(pack) ||
    pack.length !== 1 ||
    typeof pack[0].filename !== "string"
  ) {
    throw new Error("npm pack returned an unexpected artifact list");
  }
  return path.join(archiveRoot, pack[0].filename);
}

async function installArchive(archive, installRoot) {
  const hostPackage = {
    name: "bim-explorer-platform-package-host",
    version: "0.0.0",
    private: true,
    type: "module",
  };
  await writeFile(
    path.join(installRoot, "package.json"),
    `${JSON.stringify(hostPackage, null, 2)}\n`,
    "utf8",
  );
  await execFileAsync(
    npmExecutable(),
    [
      "install",
      "--ignore-scripts",
      "--offline",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
      archive,
    ],
    {
      cwd: installRoot,
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      timeout: 30_000,
    },
  );
}

function assertCleanInstallReport(report) {
  validateIfcEngineReport(report);
  if (
    report.engine.id !== "web-ifc" ||
    report.engine.version !== "0.0.77" ||
    report.engine.license !== "MPL-2.0" ||
    report.fixture.id !== FIXTURE_ID ||
    report.fixture.schema !== "IFC4" ||
    report.semantics.entityCounts.IfcProject !== 1 ||
    report.semantics.entityCounts.IfcWall !== 1 ||
    report.geometry.products !== 1 ||
    report.geometry.triangles !== 12 ||
    report.cleanup.modelClosed !== true ||
    report.cleanup.engineDisposed !== true
  ) {
    throw new Error("clean-installed web-ifc report is incomplete");
  }
}

function cleanObservation(report, processReceipt) {
  return {
    engine: report.engine,
    fixture: report.fixture,
    semanticCounts: {
      projects: report.semantics.entityCounts.IfcProject,
      walls: report.semantics.entityCounts.IfcWall,
    },
    geometry: {
      products: report.geometry.products,
      triangles: report.geometry.triangles,
    },
    cleanup: report.cleanup,
    fingerprint: report.fingerprint.value,
    process: {
      outcome: processReceipt.outcome,
      exitCode: processReceipt.exitCode,
      signal: processReceipt.signal,
      processExited: processReceipt.processExited,
      timedOut: processReceipt.timedOut,
      outputLimitExceeded: processReceipt.outputLimitExceeded,
      stderrCaptured: processReceipt.stderrCaptured,
    },
  };
}

export async function qualifyWebIfcPlatformPackage(options = {}) {
  const artifactDirectory =
    options.artifactDirectory === undefined
      ? null
      : options.artifactDirectory;
  if (
    artifactDirectory !== null &&
    (
      typeof artifactDirectory !== "string" ||
      artifactDirectory.length === 0
    )
  ) {
    throw new TypeError("artifactDirectory must be a path or null");
  }

  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "bim-explorer-platform-package-"),
  );
  try {
    const stageRoot = path.join(temporaryRoot, "stage");
    const archiveRoot = path.join(temporaryRoot, "archive");
    const installRoot = path.join(temporaryRoot, "install");
    const executionRoot = path.join(temporaryRoot, "execution");
    const sourceRoot = path.join(temporaryRoot, "source");
    await Promise.all([
      mkdir(stageRoot, { recursive: true }),
      mkdir(archiveRoot, { recursive: true }),
      mkdir(installRoot, { recursive: true }),
      mkdir(executionRoot, { recursive: true }),
      mkdir(sourceRoot, { recursive: true }),
    ]);

    await stageFiles(stageRoot);
    const inventory = await inventoryFiles(stageRoot);
    const stageDigest = inventoryDigest(inventory);
    const archive = await createArchive(stageRoot, archiveRoot);
    const archiveMetadata = await stat(archive);
    const archiveDigest = await sha256File(archive);

    await installArchive(archive, installRoot);
    const installedPackage = path.join(
      installRoot,
      "node_modules",
      "@bim-explorer",
      "web-ifc-platform-stage",
    );
    const installedInventory = await inventoryFiles(installedPackage);
    const installedDigest = inventoryDigest(installedInventory);
    if (
      installedDigest !== stageDigest ||
      canonicalJson(installedInventory) !== canonicalJson(inventory)
    ) {
      throw new Error("clean-installed stage differs from packed files");
    }

    const input = path.join(sourceRoot, "source.ifc");
    await writeFile(input, syntheticIfc(), "utf8");
    const adapter = path.join(installedPackage, "bin", "inspect.mjs");
    const processResult = await runAdapterProcess({
      id: "web-ifc-platform-stage",
      executable: process.execPath,
      arguments: [
        adapter,
        "--input",
        input,
        "--fixture-id",
        FIXTURE_ID,
      ],
      cwd: executionRoot,
      timeoutMs: 30_000,
      maxOutputBytes: 2 * 1024 * 1024,
    });
    const report = processResult.report;
    assertCleanInstallReport(report);

    const archiveName = path.basename(archive);
    if (artifactDirectory !== null) {
      await mkdir(artifactDirectory, { recursive: true });
      await copyFile(
        archive,
        path.join(artifactDirectory, archiveName),
      );
    }

    return Object.freeze({
      schema: WEB_IFC_PLATFORM_PACKAGE_EVIDENCE_SCHEMA,
      status: "experimental",
      platform: {
        os: process.platform,
        architecture: process.arch,
        node: process.version,
      },
      package: {
        name: PACKAGE_NAME,
        version: PACKAGE_VERSION,
        private: true,
        license: "UNLICENSED",
        dependency: {
          name: "web-ifc",
          version: "0.0.77",
          license: "MPL-2.0",
        },
      },
      stage: {
        fileCount: inventory.length,
        totalBytes: inventory.reduce(
          (total, entry) => total + entry.byteLength,
          0,
        ),
        sha256: stageDigest,
        files: inventory,
      },
      artifact: {
        file: archiveName,
        byteLength: archiveMetadata.size,
        sha256: archiveDigest,
      },
      observation: cleanObservation(report, processResult.receipt),
      conformance: {
        exactDependency: true,
        bundledLicenseText: inventory.some(
          (entry) =>
            entry.file === "node_modules/web-ifc/LICENSE.md",
        ),
        cleanOfflineInstall: true,
        executionOutsidePackageDirectory: true,
        pathFreeReport: true,
        modelClosed: true,
        engineDisposed: true,
        artifactMatchesStageInventory: true,
      },
      decision: {
        platformStage: "passed-experimental",
        productionPackage: "blocked",
        publicLicense: "blocked",
        artifactSigning: "blocked",
        sbom: "blocked",
        redistributionReview: "blocked",
        productionClaims: false,
      },
      limits: [
        "The tgz is a private qualification artifact, not a release.",
        "Only the Node/WASM inspect adapter is included.",
        "Browser and VS Code production bundles are not qualified.",
        "IfcOpenShell wheels are not included.",
        "Legal review, SBOM and artifact signing remain blocked.",
      ],
    });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const evidence = await qualifyWebIfcPlatformPackage({
    artifactDirectory: options.artifactDirectory,
  });
  const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
  if (options.output === null) {
    process.stdout.write(serialized);
  } else {
    await mkdir(path.dirname(options.output), { recursive: true });
    await writeFile(options.output, serialized, "utf8");
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
