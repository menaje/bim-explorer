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
import { build } from "esbuild";

import {
  prepareVscodeExtensionStage,
} from "./package-vscode-extension.mjs";
import {
  ensurePublicIfcFixture,
  loadPublicIfcFixtureManifest,
} from "./public-ifc-fixture.mjs";
import {
  acquirePublicGltfFixture,
  PUBLIC_GLTF_EMBEDDED_TEXTURE_MANIFEST,
  PUBLIC_GLTF_PRODUCT_SCALE_MANIFEST,
} from "./public-gltf-fixture.mjs";
import {
  acquirePublicGltfResourceBundle,
} from "./public-gltf-resource-bundle-fixture.mjs";
import {
  acquirePublicQuantizedGltfFixture,
} from "./public-gltf-quantized-fixture.mjs";
import {
  acquirePublicMeshoptGltfFixture,
} from "./public-gltf-meshopt-fixture.mjs";
import {
  acquirePublicLasLazFixture,
} from "./public-las-laz-fixture.mjs";
import {
  acquirePublicE57Fixture,
} from "./public-e57-fixture.mjs";
import {
  acquirePublicE57SphericalFixture,
} from "./public-e57-spherical-fixture.mjs";
import {
  acquirePublicE57MultipleScanFixture,
} from "./public-e57-multiple-scan-fixture.mjs";
import {
  resolveVscodeQualificationRuntime,
} from "./vscode-qualification-runtime.mjs";
import {
  gpuQualificationLaunchArguments,
  validateGpuQualificationMode,
} from "./gpu-qualification-profile.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

function parseArguments(values) {
  const options = {
    includeFederatedSurfaceFixture: false,
    includeRetainedOverlayFixture: false,
    includeExternalResourceFixture: false,
    includeEmbeddedTextureFixture: false,
    includeMeshoptFixture: false,
    includeQuantizedFixture: false,
    includePublicFixture: false,
    includeProductScaleFixture: false,
    includePointFixtures: false,
    includeE57SphericalFixture: false,
    includeE57MultipleScanFixture: false,
    rendererMode: "swiftshader",
    output: null,
  };
  for (let index = 0; index < values.length; index += 1) {
    const name = values[index];
    if (name === "--federated-surface") {
      options.includeFederatedSurfaceFixture = true;
      continue;
    }
    if (name === "--retained-overlay") {
      options.includeFederatedSurfaceFixture = true;
      options.includeRetainedOverlayFixture = true;
      continue;
    }
    if (name === "--external-gltf") {
      options.includeExternalResourceFixture = true;
      continue;
    }
    if (name === "--embedded-texture-gltf") {
      options.includeEmbeddedTextureFixture = true;
      continue;
    }
    if (name === "--quantized-gltf") {
      options.includeQuantizedFixture = true;
      continue;
    }
    if (name === "--meshopt-gltf") {
      options.includeMeshoptFixture = true;
      continue;
    }
    if (name === "--public") {
      options.includePublicFixture = true;
      continue;
    }
    if (name === "--product-scale") {
      options.includeProductScaleFixture = true;
      continue;
    }
    if (name === "--point-cloud") {
      options.includePointFixtures = true;
      continue;
    }
    if (name === "--e57-spherical") {
      options.includeE57SphericalFixture = true;
      continue;
    }
    if (name === "--e57-multiple-scan") {
      options.includeE57MultipleScanFixture = true;
      continue;
    }
    if (name === "--physical-gpu") {
      options.rendererMode = "physical";
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
        "[--federated-surface] [--retained-overlay] " +
        "[--product-scale] [--point-cloud] " +
        "[--external-gltf] " +
        "[--embedded-texture-gltf] " +
        "[--meshopt-gltf] " +
        "[--quantized-gltf] " +
        "[--public] " +
        "[--e57-spherical] " +
        "[--e57-multiple-scan] " +
        "[--physical-gpu] " +
        "[--output path]",
    );
  }
  return options;
}

export async function qualifyVscodeCustomEditor({
  includeFederatedSurfaceFixture = false,
  includeRetainedOverlayFixture = false,
  includeExternalResourceFixture = false,
  includeEmbeddedTextureFixture = false,
  includeMeshoptFixture = false,
  includeQuantizedFixture = false,
  includeE57MultipleScanFixture = false,
  includeE57SphericalFixture = false,
  includePointFixtures = false,
  includeProductScaleFixture = false,
  includePublicFixture = false,
  externalResourceManifestPath = undefined,
  rendererMode = "swiftshader",
  vscodeRuntime = null,
} = {}) {
  validateGpuQualificationMode(rendererMode);
  if (includeRetainedOverlayFixture) {
    includeFederatedSurfaceFixture = true;
  }
  const runtime = vscodeRuntime ??
    await resolveVscodeQualificationRuntime();
  const publicManifest = includePublicFixture
    ? await loadPublicIfcFixtureManifest()
    : null;
  const publicFixture = includePublicFixture
    ? await ensurePublicIfcFixture({ manifest: publicManifest })
    : null;
  const referenceFixture = await acquirePublicGltfFixture();
  referenceFixture.bytes.fill(0);
  const productScaleReferenceFixture =
    includeProductScaleFixture
      ? await acquirePublicGltfFixture({
          manifestPath: PUBLIC_GLTF_PRODUCT_SCALE_MANIFEST,
        })
      : null;
  const externalReferenceFixture = includeExternalResourceFixture
    ? await acquirePublicGltfResourceBundle({
        manifestPath: externalResourceManifestPath,
      })
    : null;
  externalReferenceFixture?.document.bytes.fill(0);
  for (const resource of externalReferenceFixture?.resources ?? []) {
    resource.bytes.fill(0);
  }
  const embeddedTextureReferenceFixture =
    includeEmbeddedTextureFixture
      ? await acquirePublicGltfFixture({
          manifestPath: PUBLIC_GLTF_EMBEDDED_TEXTURE_MANIFEST,
        })
      : null;
  embeddedTextureReferenceFixture?.bytes.fill(0);
  const quantizedReferenceFixture = includeQuantizedFixture
    ? await acquirePublicQuantizedGltfFixture()
    : null;
  quantizedReferenceFixture?.bytes.fill(0);
  const meshoptReferenceFixture = includeMeshoptFixture
    ? await acquirePublicMeshoptGltfFixture()
    : null;
  meshoptReferenceFixture?.bytes.fill(0);
  productScaleReferenceFixture?.bytes.fill(0);
  const pointFixtures = includePointFixtures
    ? await acquirePublicLasLazFixture()
    : null;
  const e57Fixture = includePointFixtures
    ? await acquirePublicE57Fixture()
    : null;
  const e57SphericalFixture = includeE57SphericalFixture
    ? await acquirePublicE57SphericalFixture()
    : null;
  const e57MultipleScanFixture = includeE57MultipleScanFixture
    ? await acquirePublicE57MultipleScanFixture()
    : null;
  pointFixtures?.bytes.las.fill(0);
  pointFixtures?.bytes.laz.fill(0);
  e57Fixture?.bytes.fill(0);
  e57SphericalFixture?.bytes.fill(0);
  e57MultipleScanFixture?.bytes.fill(0);
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
    if (includeRetainedOverlayFixture) {
      await build({
        banner: {
          js:
            "// Generated for retained-overlay VS Code qualification " +
            "only. MPL-2.0.",
        },
        bundle: true,
        entryPoints: [path.join(
          ROOT,
          "packages",
          "federated-bim-surface",
          "src",
          "package-entry.mjs",
        )],
        format: "esm",
        legalComments: "none",
        minify: false,
        outfile: path.join(
          stagedExtension,
          "packages",
          "federated-bim-surface",
          "runtime",
          "index.mjs",
        ),
        platform: "neutral",
        sourcemap: false,
        target: ["es2022"],
      });
    }
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
        ...gpuQualificationLaunchArguments(rendererMode),
      ],
      extensionTestsEnv: {
        BIM_EXPLORER_ROOT: ROOT,
        BIM_EXPLORER_PACKAGE_RUNTIME: "staged",
        BIM_EXPLORER_VSCODE_RENDERER_MODE: rendererMode,
        ...(includeFederatedSurfaceFixture
          ? {
              BIM_EXPLORER_VSCODE_FEDERATED_SURFACE: "true",
            }
          : {}),
        ...(includeRetainedOverlayFixture
          ? {
              BIM_EXPLORER_VSCODE_RETAINED_OVERLAY: "true",
            }
          : {}),
        ...(publicFixture === null
          ? {}
          : {
              BIM_EXPLORER_VSCODE_PUBLIC_SOURCE:
                publicFixture.input,
            }),
        BIM_EXPLORER_VSCODE_GLTF_SOURCE:
          referenceFixture.cachePath,
        ...(pointFixtures === null
          ? {}
          : {
              BIM_EXPLORER_VSCODE_LAS_SOURCE:
                pointFixtures.cachePaths.las,
              BIM_EXPLORER_VSCODE_LAZ_SOURCE:
                pointFixtures.cachePaths.laz,
              BIM_EXPLORER_VSCODE_E57_SOURCE:
                e57Fixture.cachePath,
            }),
        ...(e57SphericalFixture === null
          ? {}
          : {
              BIM_EXPLORER_VSCODE_E57_SPHERICAL_SOURCE:
                e57SphericalFixture.cachePath,
            }),
        ...(e57MultipleScanFixture === null
          ? {}
          : {
              BIM_EXPLORER_VSCODE_E57_MULTIPLE_SCAN_SOURCE:
                e57MultipleScanFixture.cachePath,
            }),
        ...(productScaleReferenceFixture === null
          ? {}
          : {
              BIM_EXPLORER_VSCODE_GLTF_PRODUCT_SCALE_SOURCE:
                productScaleReferenceFixture.cachePath,
            }),
        ...(externalReferenceFixture === null
          ? {}
          : {
              BIM_EXPLORER_VSCODE_GLTF_EXTERNAL_SOURCE:
                externalReferenceFixture.document.cachePath,
              ...(externalResourceManifestPath === undefined
                ? {}
                : {
                    BIM_EXPLORER_VSCODE_GLTF_EXTERNAL_MANIFEST:
                      externalResourceManifestPath,
                  }),
            }),
        ...(embeddedTextureReferenceFixture === null
          ? {}
          : {
              BIM_EXPLORER_VSCODE_GLTF_EMBEDDED_TEXTURE_SOURCE:
                embeddedTextureReferenceFixture.cachePath,
              BIM_EXPLORER_VSCODE_GLTF_EMBEDDED_TEXTURE_MANIFEST:
                PUBLIC_GLTF_EMBEDDED_TEXTURE_MANIFEST,
            }),
        ...(quantizedReferenceFixture === null
          ? {}
          : {
              BIM_EXPLORER_VSCODE_GLTF_QUANTIZED_SOURCE:
                quantizedReferenceFixture.cachePath,
            }),
        ...(meshoptReferenceFixture === null
          ? {}
          : {
              BIM_EXPLORER_VSCODE_GLTF_MESHOPT_SOURCE:
                meshoptReferenceFixture.cachePath,
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
