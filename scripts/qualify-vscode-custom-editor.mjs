import {
  mkdtemp,
  readFile,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  runTests,
} from "@vscode/test-electron";

import {
  prepareVscodeExtensionStage,
} from "./package-vscode-extension.mjs";
import {
  acquirePublicGltfFixture,
} from "./public-gltf-fixture.mjs";
import {
  resolveVscodeQualificationRuntime,
} from "./vscode-qualification-runtime.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

export async function qualifyVscodeCustomEditor({
  vscodeRuntime = null,
} = {}) {
  const runtime = vscodeRuntime ??
    await resolveVscodeQualificationRuntime();
  const referenceFixture = await acquirePublicGltfFixture();
  referenceFixture.bytes.fill(0);
  const temporary = await mkdtemp(
    path.join(
      process.platform === "darwin" ? "/tmp" : process.cwd(),
      "bex-vsc-",
    ),
  );
  const evidencePath = path.join(
    temporary,
    "evidence.json",
  );
  const stagedExtension = path.join(
    temporary,
    "extension",
  );
  try {
    await prepareVscodeExtensionStage(stagedExtension);
    await runTests({
      vscodeExecutablePath: runtime.executable,
      extensionDevelopmentPath: stagedExtension,
      extensionTestsPath: path.join(
        ROOT,
        "tests",
        "vscode",
        "suite",
        "index.cjs",
      ),
      launchArgs: [
        `--user-data-dir=${path.join(temporary, "user-data")}`,
        `--extensions-dir=${path.join(temporary, "extensions")}`,
        "--disable-extensions",
        "--disable-telemetry",
        "--enable-unsafe-swiftshader",
        "--use-angle=swiftshader",
      ],
      extensionTestsEnv: {
        BIM_EXPLORER_ROOT: ROOT,
        BIM_EXPLORER_PACKAGE_RUNTIME: "staged",
        BIM_EXPLORER_VSCODE_GLTF_SOURCE:
          referenceFixture.cachePath,
        BIM_EXPLORER_VSCODE_EVIDENCE: evidencePath,
      },
    });
    return Object.freeze(
      JSON.parse(await readFile(evidencePath, "utf8")),
    );
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
  const evidence = await qualifyVscodeCustomEditor();
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}
