import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  packageVscodeExtension,
} from "./package-vscode-extension.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

function codeCli() {
  if (
    typeof process.env.BIM_EXPLORER_VSCODE_CLI === "string" &&
    process.env.BIM_EXPLORER_VSCODE_CLI.length > 0
  ) {
    return process.env.BIM_EXPLORER_VSCODE_CLI;
  }
  if (process.platform === "darwin") {
    return "/Applications/Visual Studio Code.app/Contents/" +
      "Resources/app/bin/code";
  }
  throw new Error(
    "Set BIM_EXPLORER_VSCODE_CLI to qualify VSIX install",
  );
}

function runCode(argumentsValue) {
  const result = spawnSync(codeCli(), argumentsValue, {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `VS Code CLI failed: ${result.stderr || result.stdout}`,
    );
  }
  return result.stdout;
}

async function sha256(file) {
  return createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
}

export async function qualifyVscodeVsixInstall() {
  const temporary = await mkdtemp(
    path.join(
      process.platform === "darwin" ? "/tmp" : tmpdir(),
      "bex-vsix-",
    ),
  );
  const output = path.join(
    temporary,
    "bim-explorer-0.0.0.vsix",
  );
  const extensions = path.join(temporary, "extensions");
  const userData = path.join(temporary, "user-data");
  try {
    const packaged = await packageVscodeExtension(output);
    const common = [
      "--user-data-dir",
      userData,
      "--extensions-dir",
      extensions,
    ];
    const installOutput = runCode([
      ...common,
      "--install-extension",
      output,
      "--force",
    ]);
    const installedList = runCode([
      ...common,
      "--list-extensions",
      "--show-versions",
    ]).trim().split(/\r?\n/u).filter(Boolean);
    if (!installedList.includes("menaje.bim-explorer@0.0.0")) {
      throw new Error(
        "Clean VSIX install did not register menaje.bim-explorer",
      );
    }
    const entries = await readdir(extensions, {
      withFileTypes: true,
    });
    const installedEntry = entries.find((entry) =>
      entry.isDirectory() &&
      entry.name.startsWith("menaje.bim-explorer-0.0.0"));
    if (installedEntry === undefined) {
      throw new Error(
        "Clean VSIX install directory is unavailable",
      );
    }
    const installedRoot = path.join(
      extensions,
      installedEntry.name,
    );
    const required = [
      "extension.js",
      "src/provider.js",
      "apps/bim-explorer-web/app.mjs",
      "apps/bim-explorer-web/source-worker.bundle.mjs",
      "node_modules/web-ifc/web-ifc-api.js",
      "node_modules/web-ifc/web-ifc.wasm",
    ];
    for (const relative of required) {
      if (!(await stat(path.join(installedRoot, relative))).isFile()) {
        throw new Error(
          `Installed VSIX is missing ${relative}`,
        );
      }
    }
    const manifest = JSON.parse(
      await readFile(
        path.join(installedRoot, "package.json"),
        "utf8",
      ),
    );
    const [installedWorkerSha256, sourceWorkerSha256] =
      await Promise.all([
        sha256(path.join(
          installedRoot,
          "apps",
          "bim-explorer-web",
          "source-worker.bundle.mjs",
        )),
        sha256(path.join(
          ROOT,
          "apps",
          "bim-explorer-web",
          "source-worker.bundle.mjs",
        )),
      ]);
    const assertions = {
      cliAcceptedPackage:
        /successfully installed/iu.test(installOutput),
      extensionRegistered:
        installedList.includes(
          "menaje.bim-explorer@0.0.0",
        ),
      requiredRuntimeComplete: true,
      workerBundleExact:
        installedWorkerSha256 === sourceWorkerSha256,
      noSpatialDependency:
        !Object.keys(manifest.dependencies ?? {}).some((name) =>
          /spatial/iu.test(name)),
      readOnlyIfcAssociation:
        manifest.contributes.customEditors[0]
          .selector[0].filenamePattern === "*.ifc",
    };
    if (!Object.values(assertions).every(Boolean)) {
      throw new Error(
        `VSIX install qualification failed: ` +
          `${JSON.stringify(assertions)}`,
      );
    }
    return Object.freeze({
      schema: "bim-explorer-vscode-vsix-install-evidence/1",
      capturedAt: new Date().toISOString(),
      environment: {
        platform: `${process.platform}-${process.arch}`,
        cleanUserData: true,
        cleanExtensionsDirectory: true,
      },
      package: {
        id: "menaje.bim-explorer",
        version: manifest.version,
        byteLength: packaged.byteLength,
        installedRuntimeFiles: required.length,
        workerBundleSha256: installedWorkerSha256,
      },
      observation: {
        installedExtensions: installedList,
        association:
          manifest.contributes.customEditors[0],
        dependencies: manifest.dependencies,
      },
      assertions,
      decision: {
        cleanInstall: "passed",
        marketplaceRelease: "held",
      },
    });
  } finally {
    await rm(temporary, {
      force: true,
      recursive: true,
    });
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    fileURLToPath(import.meta.url)
) {
  const evidence = await qualifyVscodeVsixInstall();
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}
