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
  checkBimSurfaceBundle,
} from "./build-bim-surface.mjs";
import {
  checkVscodeWorkerBundle,
} from "./build-vscode-worker.mjs";
import {
  unzipSync,
  zipSync,
} from "fflate";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const EXTENSION = path.join(
  ROOT,
  "apps",
  "bim-explorer-vscode",
);
const COPY_FILES = Object.freeze([
  ["apps/bim-explorer-web/README.md"],
  ["apps/bim-explorer-web/app.mjs"],
  ["apps/bim-explorer-web/index.html"],
  ["apps/bim-explorer-web/laz-perf-worker-csp.js"],
  ["apps/bim-explorer-web/point-source-client.mjs"],
  ["apps/bim-explorer-web/point-source-worker.bundle.js"],
  ["apps/bim-explorer-web/point-source-worker.mjs"],
  ["apps/bim-explorer-web/reference-mesh-explorer.mjs"],
  ["apps/bim-explorer-web/source-worker.mjs"],
  ["apps/bim-explorer-web/source-worker.bundle.mjs"],
  ["apps/bim-explorer-web/styles.css"],
  ["apps/bim-explorer-web/worker-source-client.mjs"],
  ["adapters/web-ifc/src/create-source-artifact.mjs"],
  ["packages/bim-model-source/src/artifact-schema.mjs"],
  ["packages/bim-model-source/src/index.mjs"],
  ["packages/bim-model-source/src/semantic-index.mjs"],
  ["packages/bim-model-source/src/sha256.mjs"],
  ["packages/gltf-reference-source/src/geometry.mjs"],
  ["packages/gltf-reference-source/src/index.mjs"],
  ["packages/gltf-reference-source/src/math.mjs"],
  ["packages/gltf-reference-source/src/profile.mjs"],
  ["packages/e57-point-source/src/format.mjs"],
  ["packages/e57-point-source/src/index.mjs"],
  ["packages/las-laz-point-source/src/header.mjs"],
  ["packages/las-laz-point-source/src/index.mjs"],
  ["packages/bim-surface/runtime/index.mjs"],
  ["packages/bim-renderer-3d/src/camera-controls.mjs"],
  ["packages/bim-renderer-3d/src/camera.mjs"],
  ["packages/bim-renderer-3d/src/host-adapter.mjs"],
  ["packages/bim-renderer-3d/src/index.mjs"],
  ["packages/bim-renderer-3d/src/measurement.mjs"],
  ["packages/bim-renderer-3d/src/point-cloud-lod.mjs"],
  ["packages/bim-renderer-3d/src/point-cloud.mjs"],
  ["packages/bim-renderer-3d/src/point-cloud-webgl2-backend.mjs"],
  ["packages/bim-renderer-3d/src/webgl2-backend.mjs"],
  ["packages/bim-semantic-explorer/src/index.mjs"],
  ["node_modules/laz-perf/lib/worker/laz-perf.wasm"],
  ["node_modules/laz-perf/package.json"],
  ["node_modules/web-ifc/LICENSE.md"],
  ["node_modules/web-ifc/package.json"],
  ["node_modules/web-ifc/web-ifc-api.js"],
  ["node_modules/web-ifc/web-ifc.wasm"],
  ["LICENSES/e57-rs-MIT.txt"],
  ["specs/LICENSE"],
]);
const EXTENSION_FILES = Object.freeze([
  "README.md",
  "extension.js",
  "package.json",
  "src/provider.js",
  "src/webview-html.js",
]);
const RELEASE_FILES = Object.freeze([
  "CHANGELOG.md",
  "LICENSE",
  "NOTICE",
  "SECURITY.md",
  "SOURCE_OFFER.md",
  "THIRD_PARTY_NOTICES.md",
  "TRADEMARKS.md",
]);
const EXTENSION_VERSION = JSON.parse(
  await readFile(path.join(EXTENSION, "package.json"), "utf8"),
).version;

async function copyRelative(sourceRoot, destinationRoot, relative) {
  const destination = path.join(destinationRoot, relative);
  await mkdir(path.dirname(destination), {
    recursive: true,
  });
  await copyFile(path.join(sourceRoot, relative), destination);
}

export async function prepareVscodeExtensionStage(destination) {
  if (typeof destination !== "string" || destination.length === 0) {
    throw new TypeError(
      "VS Code extension stage destination is invalid",
    );
  }
  await checkVscodeWorkerBundle();
  await checkBimSurfaceBundle();
  await mkdir(destination, {
    recursive: true,
  });
  for (const relative of EXTENSION_FILES) {
    await copyRelative(EXTENSION, destination, relative);
  }
  for (const [relative] of COPY_FILES) {
    await copyRelative(ROOT, destination, relative);
  }
  for (const relative of RELEASE_FILES) {
    await copyRelative(ROOT, destination, relative);
  }
  const manifestPath = path.join(destination, "package.json");
  const manifest = JSON.parse(
    await readFile(manifestPath, "utf8"),
  );
  manifest.private = false;
  await writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  return Object.freeze({
    destination,
    files: Object.freeze([
      ...EXTENSION_FILES,
      ...COPY_FILES.map(([relative]) => relative),
      ...RELEASE_FILES,
    ].sort()),
  });
}

function parseArguments(values) {
  if (values.length === 0) {
    return path.join(
      ROOT,
      "dist",
      `bim-explorer-${EXTENSION_VERSION}.vsix`,
    );
  }
  if (
    values.length !== 2 ||
    values[0] !== "--out" ||
    typeof values[1] !== "string" ||
    values[1].length === 0
  ) {
    throw new TypeError(
      "usage: node scripts/package-vscode-extension.mjs " +
        `[--out dist/bim-explorer-${EXTENSION_VERSION}.vsix]`,
    );
  }
  return path.resolve(ROOT, values[1]);
}

async function normalizeVsix(output) {
  const unpacked = unzipSync(await readFile(output));
  const entries = {};
  for (const name of Object.keys(unpacked).sort()) {
    entries[name] = [
      unpacked[name],
      {
        mtime: new Date(1980, 0, 1, 0, 0, 0, 0),
      },
    ];
  }
  await writeFile(output, zipSync(entries, {
    level: 9,
  }));
}

export async function packageVscodeExtension(output) {
  if (typeof output !== "string" || output.length === 0) {
    throw new TypeError(
      "VS Code extension package output is invalid",
    );
  }
  const stage = await mkdtemp(
    path.join(tmpdir(), "bim-explorer-vscode-"),
  );
  try {
    await prepareVscodeExtensionStage(stage);
    await mkdir(path.dirname(output), {
      recursive: true,
    });
    const executable = path.join(
      ROOT,
      "node_modules",
      ".bin",
      process.platform === "win32" ? "vsce.cmd" : "vsce",
    );
    const result = spawnSync(
      executable,
      [
        "package",
        "--out",
        output,
        "--no-yarn",
        "--dependencies",
      ],
      {
        cwd: stage,
        encoding: "utf8",
      },
    );
    if (result.status !== 0) {
      throw new Error(
        `VS Code extension packaging failed: ` +
          `${result.stderr || result.stdout}`,
      );
    }
    await normalizeVsix(output);
    const metadata = await stat(output);
    if (!metadata.isFile() || metadata.size <= 0) {
      throw new Error(
        "VS Code extension packaging produced no VSIX",
      );
    }
    process.stdout.write(result.stdout);
    process.stdout.write(
      `VSIX: ${output} (${metadata.size} bytes)\n`,
    );
    return Object.freeze({
      byteLength: metadata.size,
      output,
    });
  } finally {
    await rm(stage, {
      force: true,
      recursive: true,
    });
  }
}

async function main() {
  await packageVscodeExtension(
    parseArguments(process.argv.slice(2)),
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
