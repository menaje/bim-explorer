import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  createWebIfcSourceArtifact,
} from "../adapters/web-ifc/src/create-source-artifact.mjs";
import {
  syntheticMappedIfc,
} from "./generate-synthetic-ifc.mjs";
import {
  checkBimSurfaceBundle,
} from "./build-bim-surface.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PACKAGE_ROOT = path.join(
  ROOT,
  "packages",
  "bim-surface",
);
const PACKAGE_NAME = "@bim-explorer/bim-surface";
const PACKAGE_VERSION = "0.1.0";
const DEFAULT_OUTPUT = path.join(
  ROOT,
  "compatibility",
  "evidence",
  "bim-surface-package-2026-08-09.json",
);
const EXPECTED_FILES = Object.freeze([
  "LICENSE",
  "NOTICE",
  "README.md",
  "SOURCE_OFFER.md",
  "package.json",
  "runtime/index.mjs",
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed: ` +
        `${result.stderr || result.stdout}`,
    );
  }
  return result.stdout.trim();
}

function fixtureJson(artifact) {
  return JSON.stringify(artifact, (_key, value) => {
    if (ArrayBuffer.isView(value)) {
      return {
        __bimExplorerBytes: Buffer.from(
          value.buffer,
          value.byteOffset,
          value.byteLength,
        ).toString("base64"),
      };
    }
    return value;
  });
}

async function stagePackage(destination) {
  await mkdir(path.join(destination, "runtime"), {
    recursive: true,
  });
  const manifest = {
    name: PACKAGE_NAME,
    version: PACKAGE_VERSION,
    description: "Host-neutral read-only BIM exploration surface",
    license: "MPL-2.0",
    type: "module",
    exports: "./runtime/index.mjs",
    files: [
      "runtime/index.mjs",
      "README.md",
      "LICENSE",
      "NOTICE",
      "SOURCE_OFFER.md",
    ],
    sideEffects: false,
    engines: {
      node: ">=24",
    },
  };
  await writeFile(
    path.join(destination, "package.json"),
    stableJson(manifest),
    "utf8",
  );
  await copyFile(
    path.join(PACKAGE_ROOT, "runtime", "index.mjs"),
    path.join(destination, "runtime", "index.mjs"),
  );
  await copyFile(
    path.join(PACKAGE_ROOT, "README.md"),
    path.join(destination, "README.md"),
  );
  for (const relative of [
    "LICENSE",
    "NOTICE",
    "SOURCE_OFFER.md",
  ]) {
    await copyFile(
      path.join(ROOT, relative),
      path.join(destination, relative),
    );
  }
}

async function pack(stage, destination) {
  await mkdir(destination, { recursive: true });
  const output = run(
    "npm",
    [
      "pack",
      "--json",
      "--ignore-scripts",
      "--offline",
      "--pack-destination",
      destination,
    ],
    { cwd: stage },
  );
  const report = JSON.parse(output)[0];
  const tarball = path.join(destination, report.filename);
  const bytes = await readFile(tarball);
  const files = report.files
    .map((file) => file.path)
    .sort();
  if (JSON.stringify(files) !== JSON.stringify(EXPECTED_FILES)) {
    throw new Error(
      `BIM surface package inventory is invalid: ` +
        `${JSON.stringify(files)}`,
    );
  }
  return {
    byteLength: bytes.byteLength,
    files,
    filename: report.filename,
    integrity: report.integrity,
    sha256: sha256(bytes),
    tarball,
    unpackedSize: report.unpackedSize,
  };
}

const CONSUMER_SOURCE = String.raw`
import { readFile } from "node:fs/promises";
import * as surfacePackage from "@bim-explorer/bim-surface";

function revive(_key, value) {
  if (
    value !== null &&
    typeof value === "object" &&
    typeof value.__bimExplorerBytes === "string" &&
    Object.keys(value).length === 1
  ) {
    return Uint8Array.from(
      Buffer.from(value.__bimExplorerBytes, "base64"),
    );
  }
  return value;
}

const artifact = JSON.parse(
  await readFile(new URL("./artifact.json", import.meta.url), "utf8"),
  revive,
);
const source = surfacePackage.createBimModelSource(artifact);
const session = await source.open({
  protocolVersion: surfacePackage.BIM_SOURCE_PROTOCOL_VERSION,
});
const snapshot = await session.getSnapshot();
const backend = surfacePackage.createHeadless3dBackend();
const surface = surfacePackage.createBimSurface({
  kind: "browser",
  renderer: surfacePackage.createBounded3dRenderer({ backend }),
  storage: null,
});
const opened = await surface.open({ session, snapshot });
const search = await surface.explorer.search("wall");
const integration =
  await surfacePackage.createBimSpatialIntegration({ snapshot });
const integrationBeforeDispose = integration.state;
const integrationDisposed = await integration.dispose();
const disposal = await surface.dispose({
  reason: "clean-install-consumer-close",
});
const sourceState = source.state;
const sourceDisposed = await source.dispose();

process.stdout.write(JSON.stringify({
  exports: Object.keys(surfacePackage).sort(),
  packageVersion: surfacePackage.BIM_SURFACE_PACKAGE_VERSION,
  contract: surfacePackage.BIM_SURFACE_CONTRACT,
  receipt: opened.schema,
  source: {
    fingerprint: snapshot.source.fingerprint,
    revisionId: snapshot.revisionId,
    products: snapshot.geometry.products,
  },
  selection: {
    expressId: opened.semantic.initialSelection?.expressId ?? null,
    globalId: opened.semantic.initialSelection?.globalId ?? null,
  },
  search: {
    loaded: search.loaded,
    total: search.total,
  },
  renderer: {
    uploadedBytes: opened.mount.renderer.backend.uploadedBytes,
    sourceReadBytes: opened.mount.renderer.metrics.sourceReadBytes,
  },
  authority: opened.authority,
  spatial: {
    contract: integrationBeforeDispose.contract,
    availability: integrationBeforeDispose.availability,
    workspaceId: integrationBeforeDispose.workspaceId,
    disposed: integrationDisposed,
  },
  cleanup: {
    surfaceStatus: disposal.status,
    explorerDisposed: disposal.explorerDisposed,
    rendererDisposed: disposal.hostReceipt.rendererDisposed,
    sourceSessionDisposed: sourceState.sessionDisposed,
    sourceDisposed,
    backendBytes: backend.state.activeBytes,
    backendDisposed: backend.state.disposed,
  },
}));
`;

async function runConsumer(tarball, artifact, temporary) {
  const consumer = path.join(temporary, "consumer");
  await mkdir(consumer, { recursive: true });
  await writeFile(
    path.join(consumer, "package.json"),
    stableJson({
      name: "bim-surface-clean-install-consumer",
      version: "0.0.0",
      private: true,
      type: "module",
    }),
    "utf8",
  );
  await writeFile(
    path.join(consumer, "artifact.json"),
    fixtureJson(artifact),
    "utf8",
  );
  await writeFile(
    path.join(consumer, "consumer.mjs"),
    CONSUMER_SOURCE,
    "utf8",
  );
  run(
    "npm",
    [
      "install",
      "--offline",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      tarball,
    ],
    { cwd: consumer },
  );
  const installedManifest = JSON.parse(
    await readFile(
      path.join(
        consumer,
        "node_modules",
        "@bim-explorer",
        "bim-surface",
        "package.json",
      ),
      "utf8",
    ),
  );
  if (
    installedManifest.name !== PACKAGE_NAME ||
    installedManifest.version !== PACKAGE_VERSION ||
    Object.keys(installedManifest.dependencies ?? {}).length !== 0
  ) {
    throw new Error(
      "clean-installed BIM surface manifest is invalid",
    );
  }
  return JSON.parse(run(process.execPath, ["consumer.mjs"], {
    cwd: consumer,
  }));
}

function assertConsumer(report) {
  const authority = report.authority ?? {};
  const cleanup = report.cleanup ?? {};
  if (
    report.packageVersion !== PACKAGE_VERSION ||
    report.contract !== "bim-explorer-bim-surface/0.1" ||
    report.receipt !==
      "bim-explorer-bim-surface-receipt/0.1" ||
    !/^sha256:[0-9a-f]{64}$/u.test(
      report.source?.fingerprint ?? "",
    ) ||
    report.source.revisionId !==
      `source-snapshot:${report.source.fingerprint}` ||
    report.source.products !== 2 ||
    report.selection?.expressId !== 40 ||
    report.selection?.globalId !==
      "0AAAAAAAAAAAAAAAAAAA16" ||
    report.search?.loaded !== 2 ||
    report.search.total !== 2 ||
    !(report.renderer?.uploadedBytes > 0) ||
    !(report.renderer?.sourceReadBytes > 0) ||
    Object.values(authority).some((value) => value !== false) ||
    report.spatial?.availability !== "standalone" ||
    report.spatial.workspaceId !== null ||
    report.spatial.disposed !== true ||
    cleanup.surfaceStatus !== "disposed" ||
    cleanup.explorerDisposed !== true ||
    cleanup.rendererDisposed !== true ||
    cleanup.sourceSessionDisposed !== true ||
    cleanup.sourceDisposed !== true ||
    cleanup.backendBytes !== 0 ||
    cleanup.backendDisposed !== true
  ) {
    throw new Error(
      `clean-installed BIM surface conformance failed: ` +
        `${JSON.stringify(report)}`,
    );
  }
}

export async function qualifyBimSurfacePackage() {
  await checkBimSurfaceBundle();
  const temporary = await mkdtemp(
    path.join(tmpdir(), "bim-surface-package-"),
  );
  try {
    const [firstStage, secondStage] = [
      path.join(temporary, "stage-a"),
      path.join(temporary, "stage-b"),
    ];
    await Promise.all([
      stagePackage(firstStage),
      stagePackage(secondStage),
    ]);
    const [first, second] = await Promise.all([
      pack(firstStage, path.join(temporary, "pack-a")),
      pack(secondStage, path.join(temporary, "pack-b")),
    ]);
    if (
      first.sha256 !== second.sha256 ||
      first.byteLength !== second.byteLength
    ) {
      throw new Error(
        "BIM surface package is not byte-reproducible",
      );
    }
    const artifact = await createWebIfcSourceArtifact(
      new TextEncoder().encode(syntheticMappedIfc()),
      { profile: "ReferenceView_V1.2" },
    );
    const consumer = await runConsumer(
      first.tarball,
      artifact,
      temporary,
    );
    assertConsumer(consumer);
    const [appSource, vscodePackageSource, runtimeBytes] =
      await Promise.all([
        readFile(
          path.join(
            ROOT,
            "apps",
            "bim-explorer-web",
            "app.mjs",
          ),
          "utf8",
        ),
        readFile(
          path.join(
            ROOT,
            "scripts",
            "package-vscode-extension.mjs",
          ),
          "utf8",
        ),
        readFile(
          path.join(PACKAGE_ROOT, "runtime", "index.mjs"),
        ),
      ]);
    const runtimeImport =
      "packages/bim-surface/runtime/index.mjs";
    if (
      !appSource.includes(runtimeImport) ||
      !vscodePackageSource.includes(runtimeImport)
    ) {
      throw new Error(
        "Browser and VS Code products do not compose the BIM surface runtime",
      );
    }
    return Object.freeze({
      schema:
        "bim-explorer-bim-surface-package-qualification/1",
      status: "passed-release-candidate",
      asOf: "2026-08-09",
      package: {
        name: PACKAGE_NAME,
        version: PACKAGE_VERSION,
        filename: first.filename,
        byteLength: first.byteLength,
        unpackedSize: first.unpackedSize,
        sha256: first.sha256,
        integrity: first.integrity,
        runtimeSha256: sha256(runtimeBytes),
        files: first.files,
        runtimeDependencies: 0,
        repositoryManifestPrivate: true,
      },
      reproducibility: {
        independentPackRuns: 2,
        byteIdentical: true,
        firstSha256: first.sha256,
        secondSha256: second.sha256,
      },
      consumer: {
        install: "offline-local-tarball",
        cleanProject: true,
        lifecycle: consumer,
      },
      productComposition: {
        browserEntrypoint:
          "apps/bim-explorer-web/app.mjs",
        browserUsesSurfaceRuntime: true,
        vscodeSharedEntrypoint: true,
        vscodeStagesSurfaceRuntime: true,
      },
      claims: {
        publicRegistryPublication: false,
        immutablePublicReleaseAsset: false,
        actualSpatialConsumerConformance: false,
        productionSupport: false,
      },
    });
  } finally {
    await rm(temporary, {
      force: true,
      recursive: true,
    });
  }
}

function outputPath(values) {
  if (values.length === 0) {
    return DEFAULT_OUTPUT;
  }
  if (
    values.length !== 2 ||
    values[0] !== "--out" ||
    typeof values[1] !== "string" ||
    values[1].length === 0
  ) {
    throw new TypeError(
      "usage: node scripts/qualify-bim-surface-package.mjs " +
        "[--out compatibility/evidence/bim-surface-package-2026-08-09.json]",
    );
  }
  return path.resolve(ROOT, values[1]);
}

async function main() {
  const output = outputPath(process.argv.slice(2));
  const evidence = await qualifyBimSurfacePackage();
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, stableJson(evidence), "utf8");
  const metadata = await stat(output);
  process.stdout.write(
    `BIM surface package qualification passed: ` +
      `${metadata.size} evidence bytes\n`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
