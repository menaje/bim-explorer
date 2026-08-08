import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  runTests,
} from "@vscode/test-electron";

import {
  packageVscodeExtension,
} from "./package-vscode-extension.mjs";
import {
  ensurePublicIfcFixture,
  loadPublicIfcFixtureManifest,
} from "./public-ifc-fixture.mjs";
import {
  acquirePublicGltfFixture,
  PUBLIC_GLTF_PRODUCT_SCALE_MANIFEST,
} from "./public-gltf-fixture.mjs";
import {
  resolveVscodeQualificationRuntime,
} from "./vscode-qualification-runtime.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const EXTENSION_VERSION = JSON.parse(
  await readFile(
    path.join(
      ROOT,
      "apps",
      "bim-explorer-vscode",
      "package.json",
    ),
    "utf8",
  ),
).version;

function parseArguments(values) {
  const options = {
    includeProductScaleFixture: false,
    includePublicFixture: true,
    output: null,
  };
  for (let index = 0; index < values.length; index += 1) {
    const name = values[index];
    if (name === "--product-scale") {
      options.includeProductScaleFixture = true;
      continue;
    }
    if (name === "--no-public") {
      options.includePublicFixture = false;
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
      "usage: node scripts/qualify-vscode-vsix-install.mjs " +
        "[--product-scale] [--no-public] [--output path]",
    );
  }
  return options;
}

function runCode(cli, argumentsValue) {
  const [command, ...prefix] = cli;
  const result = spawnSync(command, [
    ...prefix,
    ...argumentsValue,
  ], {
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

export async function qualifyVscodeVsixInstall({
  includeProductScaleFixture = false,
  includePublicFixture = true,
  vscodeRuntime = null,
} = {}) {
  const runtimeHost = vscodeRuntime ??
    await resolveVscodeQualificationRuntime();
  const publicManifest = includePublicFixture
    ? await loadPublicIfcFixtureManifest()
    : null;
  const publicFixture = includePublicFixture
    ? await ensurePublicIfcFixture({
        manifest: publicManifest,
      })
    : null;
  const referenceFixture = await acquirePublicGltfFixture();
  referenceFixture.bytes.fill(0);
  const productScaleReferenceFixture =
    includeProductScaleFixture
      ? await acquirePublicGltfFixture({
          manifestPath: PUBLIC_GLTF_PRODUCT_SCALE_MANIFEST,
        })
      : null;
  productScaleReferenceFixture?.bytes.fill(0);
  const temporary = await mkdtemp(
    path.join(
      process.platform === "darwin" ? "/tmp" : tmpdir(),
      "bex-vsix-",
    ),
  );
  const output = path.join(
    temporary,
    `bim-explorer-${EXTENSION_VERSION}.vsix`,
  );
  const extensions = path.join(temporary, "extensions");
  const userData = path.join(temporary, "user-data");
  const runtimeEvidencePath = path.join(
    temporary,
    "runtime-evidence.json",
  );
  try {
    const packaged = await packageVscodeExtension(output);
    const common = [
      "--user-data-dir",
      userData,
      "--extensions-dir",
      extensions,
    ];
    const installOutput = runCode(runtimeHost.cli, [
      ...common,
      "--install-extension",
      output,
      "--force",
    ]);
    const installedList = runCode(runtimeHost.cli, [
      ...common,
      "--list-extensions",
      "--show-versions",
    ]).trim().split(/\r?\n/u).filter(Boolean);
    if (
      !installedList.includes(
        `menaje.bim-explorer@${EXTENSION_VERSION}`,
      )
    ) {
      throw new Error(
        "Clean VSIX install did not register menaje.bim-explorer",
      );
    }
    const entries = await readdir(extensions, {
      withFileTypes: true,
    });
    const installedEntry = entries.find((entry) =>
      entry.isDirectory() &&
      entry.name.startsWith(
        `menaje.bim-explorer-${EXTENSION_VERSION}`,
      ));
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
      "apps/bim-explorer-web/reference-mesh-explorer.mjs",
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
    await runTests({
      vscodeExecutablePath: runtimeHost.executable,
      extensionDevelopmentPath: path.join(
        ROOT,
        "tests",
        "vscode",
        "driver-extension",
      ),
      extensionTestsPath: path.join(
        ROOT,
        "tests",
        "vscode",
        "suite",
        "index.cjs",
      ),
      launchArgs: [
        `--user-data-dir=${userData}`,
        `--extensions-dir=${extensions}`,
        "--disable-telemetry",
        "--enable-unsafe-swiftshader",
        "--use-angle=swiftshader",
      ],
      extensionTestsEnv: {
        BIM_EXPLORER_PACKAGE_RUNTIME: "installed-vsix",
        BIM_EXPLORER_ROOT: ROOT,
        ...(publicFixture === null
          ? {}
          : {
              BIM_EXPLORER_VSCODE_PUBLIC_SOURCE:
                publicFixture.input,
            }),
        BIM_EXPLORER_VSCODE_GLTF_SOURCE:
          referenceFixture.cachePath,
        ...(productScaleReferenceFixture === null
          ? {}
          : {
              BIM_EXPLORER_VSCODE_GLTF_PRODUCT_SCALE_SOURCE:
                productScaleReferenceFixture.cachePath,
            }),
        BIM_EXPLORER_VSCODE_EVIDENCE:
          runtimeEvidencePath,
      },
    });
    const runtime = JSON.parse(
      await readFile(runtimeEvidencePath, "utf8"),
    );
    const assertions = {
      cliAcceptedPackage:
        /successfully installed/iu.test(installOutput),
      extensionRegistered:
        installedList.includes(
          `menaje.bim-explorer@${EXTENSION_VERSION}`,
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
      readOnlyGltfGlbAssociation:
        JSON.stringify(
          manifest.contributes.customEditors[0].selector,
        ) === JSON.stringify([
          { filenamePattern: "*.ifc" },
          { filenamePattern: "*.gltf" },
          { filenamePattern: "*.glb" },
        ]),
      installedPackageOpensFixture:
        runtime.assertions?.localSourceOpened === true,
      installedPackageUsesWebGl2:
        runtime.assertions
          ?.actualVscodeChromiumWebGl2 === true,
      installedPackageBridgeIsPathFree:
        runtime.assertions?.pathFreeHostBridge === true,
      installedPackageClosesCleanly:
        runtime.assertions?.editorCloseObserved === true,
      ...(includePublicFixture
        ? {
            installedPackageOpensPublicFixture:
              runtime.publicAssertions
                ?.localPublicSourceOpened === true,
            installedPublicFixtureIdentityExact:
              runtime.publicAssertions
                ?.publicSourceIdentityExact === true,
            installedPublicFixtureUsesWebGl2:
              runtime.publicAssertions
                ?.publicVscodeChromiumWebGl2 === true,
            installedPublicBridgeIsPathFree:
              runtime.publicAssertions
                ?.publicPathFreeHostBridge === true,
            installedPublicFixtureClosesCleanly:
              runtime.publicAssertions
                ?.publicEditorCloseObserved === true,
          }
        : {}),
      installedPackageOpensReferenceFixture:
        runtime.referenceAssertions
          ?.localReferenceSourceOpened === true,
      installedReferenceIdentityExact:
        runtime.referenceAssertions
          ?.referenceSourceIdentityExact === true,
      installedReferenceHasNoBimAuthority:
        runtime.referenceAssertions
          ?.referenceHasNoBimSemanticAuthority === true,
      installedReferenceUsesWebGl2:
        runtime.referenceAssertions
          ?.referenceVscodeChromiumWebGl2 === true,
      installedReferenceBridgeIsPathFree:
        runtime.referenceAssertions
          ?.referencePathFreeHostBridge === true,
      installedReferenceClosesCleanly:
        runtime.referenceAssertions
          ?.referenceEditorCloseObserved === true,
      ...(includeProductScaleFixture
        ? {
            installedPackageOpensProductScaleReference:
              runtime.productScaleReferenceAssertions
                ?.localProductScaleReferenceSourceOpened === true,
            installedProductScaleReferenceIdentityExact:
              runtime.productScaleReferenceAssertions
                ?.productScaleReferenceIdentityExact === true,
            installedProductScaleReferenceHasNoBimAuthority:
              runtime.productScaleReferenceAssertions
                ?.productScaleReferenceHasNoBimAuthority === true,
            installedProductScaleReferenceUsesWebGl2:
              runtime.productScaleReferenceAssertions
                ?.productScaleReferenceVscodeWebGl2 === true,
            installedProductScaleReferenceRendererBounded:
              runtime.productScaleReferenceAssertions
                ?.productScaleReferenceRendererBounded === true,
            installedProductScaleReferenceBridgeIsPathFree:
              runtime.productScaleReferenceAssertions
                ?.productScaleReferencePathFreeBridge === true,
            installedProductScaleReferenceClosesCleanly:
              runtime.productScaleReferenceAssertions
                ?.productScaleReferenceEditorCloseObserved === true,
          }
        : {}),
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
        runtime: {
          environment: runtime.environment,
          fixture: runtime.fixture,
          hostKind: runtime.observation?.hostKind,
          model: runtime.observation?.model,
          renderer: runtime.observation?.renderer,
          lifecycle: runtime.observation?.lifecycle,
        },
        ...(includePublicFixture
          ? {
              publicRuntime: {
                fixture: runtime.publicFixture,
                hostKind:
                  runtime.publicObservation?.hostKind,
                model: runtime.publicObservation?.model,
                performance:
                  runtime.publicObservation?.performance,
                resources:
                  runtime.publicObservation?.resources,
                renderer:
                  runtime.publicObservation?.renderer,
                semantic:
                  runtime.publicObservation?.semantic,
                lifecycle:
                  runtime.publicObservation?.lifecycle,
                externalUpload:
                  runtime.publicObservation?.externalUpload,
                telemetry:
                  runtime.publicObservation?.telemetry,
              },
            }
          : {}),
        referenceRuntime: {
          fixture: runtime.referenceFixture,
          hostKind:
            runtime.referenceObservation?.hostKind,
          model: runtime.referenceObservation?.model,
          performance:
            runtime.referenceObservation?.performance,
          resources:
            runtime.referenceObservation?.resources,
          renderer:
            runtime.referenceObservation?.renderer,
          reference:
            runtime.referenceObservation?.reference,
          lifecycle:
            runtime.referenceObservation?.lifecycle,
          externalUpload:
            runtime.referenceObservation?.externalUpload,
          telemetry:
            runtime.referenceObservation?.telemetry,
        },
        ...(includeProductScaleFixture
          ? {
              productScaleReferenceRuntime: {
                fixture:
                  runtime.productScaleReferenceFixture,
                hostKind:
                  runtime.productScaleReferenceObservation
                    ?.hostKind,
                model:
                  runtime.productScaleReferenceObservation
                    ?.model,
                performance:
                  runtime.productScaleReferenceObservation
                    ?.performance,
                resources:
                  runtime.productScaleReferenceObservation
                    ?.resources,
                renderer:
                  runtime.productScaleReferenceObservation
                    ?.renderer,
                reference:
                  runtime.productScaleReferenceObservation
                    ?.reference,
                lifecycle:
                  runtime.productScaleReferenceObservation
                    ?.lifecycle,
                externalUpload:
                  runtime.productScaleReferenceObservation
                    ?.externalUpload,
                telemetry:
                  runtime.productScaleReferenceObservation
                    ?.telemetry,
              },
            }
          : {}),
      },
      assertions,
      decision: {
        cleanInstall: "passed",
        publicFixtureOpen: includePublicFixture
          ? "passed"
          : "not-run",
        referenceFixtureOpen: "passed-bounded-read-only",
        productScaleReferenceFixtureOpen:
          includeProductScaleFixture
            ? "passed-bounded-read-only"
            : "not-run",
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
  const options = parseArguments(process.argv.slice(2));
  const evidence = await qualifyVscodeVsixInstall(options);
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
