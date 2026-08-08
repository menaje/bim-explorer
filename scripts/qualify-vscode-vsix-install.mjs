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
  acquirePublicLasLazFixture,
} from "./public-las-laz-fixture.mjs";
import {
  acquirePublicE57Fixture,
} from "./public-e57-fixture.mjs";
import {
  acquirePublicE57SphericalFixture,
} from "./public-e57-spherical-fixture.mjs";
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
    includePointFixtures: false,
    includeE57SphericalFixture: false,
    includePublicFixture: true,
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
    if (name === "--e57-spherical") {
      options.includeE57SphericalFixture = true;
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
        "[--product-scale] [--point-cloud] [--e57-spherical] " +
          "[--no-public] " +
          "[--output path]",
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

function allTrue(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0 &&
    Object.values(value).every((item) => item === true)
  );
}

async function sha256(file) {
  return createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
}

export async function qualifyVscodeVsixInstall({
  includeE57SphericalFixture = false,
  includePointFixtures = false,
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
  const pointFixtures = includePointFixtures
    ? await acquirePublicLasLazFixture()
    : null;
  const e57Fixture = includePointFixtures
    ? await acquirePublicE57Fixture()
    : null;
  const e57SphericalFixture = includeE57SphericalFixture
    ? await acquirePublicE57SphericalFixture()
    : null;
  pointFixtures?.bytes.las.fill(0);
  pointFixtures?.bytes.laz.fill(0);
  e57Fixture?.bytes.fill(0);
  e57SphericalFixture?.bytes.fill(0);
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
      "apps/bim-explorer-web/point-source-worker.bundle.js",
      "apps/bim-explorer-web/laz-perf-worker-csp.js",
      "packages/e57-point-source/src/format.mjs",
      "packages/e57-point-source/src/index.mjs",
      "LICENSES/e57-rs-MIT.txt",
      "node_modules/laz-perf/lib/worker/laz-perf.wasm",
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
    const [
      installedWorkerSha256,
      sourceWorkerSha256,
      installedPointWorkerSha256,
      sourcePointWorkerSha256,
      installedLazPerfJsSha256,
      sourceLazPerfJsSha256,
      installedLazPerfWasmSha256,
      sourceLazPerfWasmSha256,
    ] =
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
        sha256(path.join(
          installedRoot,
          "apps",
          "bim-explorer-web",
          "point-source-worker.bundle.js",
        )),
        sha256(path.join(
          ROOT,
          "apps",
          "bim-explorer-web",
          "point-source-worker.bundle.js",
        )),
        sha256(path.join(
          installedRoot,
          "apps",
          "bim-explorer-web",
          "laz-perf-worker-csp.js",
        )),
        sha256(path.join(
          ROOT,
          "apps",
          "bim-explorer-web",
          "laz-perf-worker-csp.js",
        )),
        sha256(path.join(
          installedRoot,
          "node_modules",
          "laz-perf",
          "lib",
          "worker",
          "laz-perf.wasm",
        )),
        sha256(path.join(
          ROOT,
          "node_modules",
          "laz-perf",
          "lib",
          "worker",
          "laz-perf.wasm",
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
      pointWorkerBundleExact:
        installedPointWorkerSha256 ===
          sourcePointWorkerSha256,
      lazPerfRuntimeExact:
        installedLazPerfJsSha256 === sourceLazPerfJsSha256 &&
        installedLazPerfWasmSha256 === sourceLazPerfWasmSha256,
      noSpatialDependency:
        !Object.keys(manifest.dependencies ?? {}).some((name) =>
          /spatial/iu.test(name)),
      readOnlyIfcAssociation:
        manifest.contributes.customEditors[0]
          .selector[0].filenamePattern === "*.ifc",
      readOnlyGltfGlbAssociation:
        JSON.stringify(
          manifest.contributes.customEditors[0].selector.slice(0, 3),
        ) === JSON.stringify([
          { filenamePattern: "*.ifc" },
          { filenamePattern: "*.gltf" },
          { filenamePattern: "*.glb" },
        ]),
      readOnlyLasLazAssociation:
        JSON.stringify(
          manifest.contributes.customEditors[0].selector.slice(3),
        ) === JSON.stringify([
          { filenamePattern: "*.e57" },
          { filenamePattern: "*.las" },
          { filenamePattern: "*.laz" },
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
      ...(includePointFixtures
        ? {
            installedPackageOpensE57:
              allTrue(runtime.pointAssertions?.e57),
            installedPackageOpensLas:
              allTrue(runtime.pointAssertions?.las),
            installedPackageOpensLaz:
              allTrue(runtime.pointAssertions?.laz),
            installedPointRangeParity:
              runtime.pointObservations?.las?.pointCloud
                ?.rangeSha256 ===
              runtime.pointObservations?.laz?.pointCloud
                ?.rangeSha256 &&
              runtime.pointObservations?.las?.pointCloud
                ?.rangeSha256 ===
                "8383abce84d57b8f50ee1f39aa1d442" +
                  "a7f258cd759ab9812aff1a0625ab10449",
            installedPointVisualParity:
              runtime.pointObservations?.las?.renderer
                ?.nonBackgroundPixels ===
              runtime.pointObservations?.laz?.renderer
                ?.nonBackgroundPixels &&
              runtime.pointObservations?.las?.renderer
                ?.nonBackgroundPixels > 0,
            installedE57PointProjection:
              runtime.pointObservations?.e57?.pointCloud
                ?.rangeSha256 ===
                "dcc6868c55c79a51d315bfc4b287ca38" +
                  "f8217e3d572554ef56b0da77359cd6aa",
            installedE57VisibleProjection:
              runtime.pointObservations?.e57?.renderer
                ?.nonBackgroundPixels > 0,
          }
        : {}),
      ...(includeE57SphericalFixture
        ? {
            installedPackageOpensE57Spherical:
              allTrue(runtime.pointAssertions?.e57Spherical),
            installedE57SphericalPointProjection:
              runtime.pointObservations?.e57Spherical?.pointCloud
                ?.rangeSha256 ===
                "b0a0c2cd5cb5f3a051d208332824318e" +
                  "7561e1098ef24a4dd718e460b3fd303f",
            installedE57SphericalVisibleProjection:
              runtime.pointObservations?.e57Spherical?.renderer
                ?.nonBackgroundPixels > 0,
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
        pointWorkerBundleSha256:
          installedPointWorkerSha256,
        lazPerfJsSha256: installedLazPerfJsSha256,
        lazPerfWasmSha256: installedLazPerfWasmSha256,
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
        ...(includePointFixtures || includeE57SphericalFixture
          ? {
              pointRuntime: {
                fixtures: runtime.pointFixtures,
                observations: runtime.pointObservations,
                assertions: runtime.pointAssertions,
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
        pointFixtureOpen:
          includePointFixtures || includeE57SphericalFixture
          ? "passed-bounded-read-only-unqualified-coordinates"
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
