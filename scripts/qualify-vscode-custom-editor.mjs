import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
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
  PUBLIC_GLTF_PRODUCT_SCALE_MANIFEST,
} from "./public-gltf-fixture.mjs";
import {
  acquirePublicLasLazFixture,
} from "./public-las-laz-fixture.mjs";
import {
  resolveVscodeQualificationRuntime,
} from "./vscode-qualification-runtime.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

function parseArguments(values) {
  const options = {
    includeProductScaleFixture: false,
    includePointFixtures: false,
    output: null,
  };
  for (let index = 0; index < values.length; index += 1) {
    const name = values[index];
    if (name === "--product-scale") {
      options.includeProductScaleFixture = true;
      continue;
    }
    if (name === "--point-cloud") {
      options.includePointFixtures = true;
      continue;
    }
    if (name === "--output") {
      const value = values[index + 1];
      if (
        typeof value !== "string" ||
        value.startsWith("-")
      ) {
        throw new TypeError("--output requires a file path");
      }
      options.output = path.resolve(value);
      index += 1;
      continue;
    }
    throw new TypeError(
      "usage: node scripts/qualify-vscode-custom-editor.mjs " +
        "[--product-scale] [--point-cloud] [--output path]",
    );
  }
  return options;
}

export async function qualifyVscodeCustomEditor({
  includePointFixtures = false,
  includeProductScaleFixture = false,
  vscodeRuntime = null,
} = {}) {
  const runtime = vscodeRuntime ??
    await resolveVscodeQualificationRuntime();
  const referenceFixture = await acquirePublicGltfFixture();
  referenceFixture.bytes.fill(0);
  const productScaleReferenceFixture =
    includeProductScaleFixture
      ? await acquirePublicGltfFixture({
          manifestPath: PUBLIC_GLTF_PRODUCT_SCALE_MANIFEST,
        })
      : null;
  productScaleReferenceFixture?.bytes.fill(0);
  const pointFixtures = includePointFixtures
    ? await acquirePublicLasLazFixture()
    : null;
  pointFixtures?.bytes.las.fill(0);
  pointFixtures?.bytes.laz.fill(0);
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
        ...(pointFixtures === null
          ? {}
          : {
              BIM_EXPLORER_VSCODE_LAS_SOURCE:
                pointFixtures.cachePaths.las,
              BIM_EXPLORER_VSCODE_LAZ_SOURCE:
                pointFixtures.cachePaths.laz,
            }),
        ...(productScaleReferenceFixture === null
          ? {}
          : {
              BIM_EXPLORER_VSCODE_GLTF_PRODUCT_SCALE_SOURCE:
                productScaleReferenceFixture.cachePath,
            }),
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
  const options = parseArguments(process.argv.slice(2));
  const evidence = await qualifyVscodeCustomEditor(options);
  if (options.output !== null) {
    await mkdir(path.dirname(options.output), {
      recursive: true,
    });
    await writeFile(
      options.output,
      `${JSON.stringify(evidence, null, 2)}\n`,
      "utf8",
    );
  }
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}
