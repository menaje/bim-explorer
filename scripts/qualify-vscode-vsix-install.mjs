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
} from "./public-gltf-fixture.mjs";

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

function codeExecutable() {
  if (
    typeof process.env.BIM_EXPLORER_VSCODE_EXECUTABLE ===
      "string" &&
    process.env.BIM_EXPLORER_VSCODE_EXECUTABLE.length > 0
  ) {
    return process.env.BIM_EXPLORER_VSCODE_EXECUTABLE;
  }
  if (process.platform === "darwin") {
    return "/Applications/Visual Studio Code.app/" +
      "Contents/MacOS/Code";
  }
  throw new Error(
    "Set BIM_EXPLORER_VSCODE_EXECUTABLE to qualify VSIX runtime",
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
  const publicManifest = await loadPublicIfcFixtureManifest();
  const publicFixture = await ensurePublicIfcFixture({
    manifest: publicManifest,
  });
  const referenceFixture = await acquirePublicGltfFixture();
  referenceFixture.bytes.fill(0);
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
      vscodeExecutablePath: codeExecutable(),
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
        BIM_EXPLORER_VSCODE_PUBLIC_SOURCE:
          publicFixture.input,
        BIM_EXPLORER_VSCODE_GLTF_SOURCE:
          referenceFixture.cachePath,
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
        publicRuntime: {
          fixture: runtime.publicFixture,
          hostKind: runtime.publicObservation?.hostKind,
          model: runtime.publicObservation?.model,
          performance:
            runtime.publicObservation?.performance,
          resources: runtime.publicObservation?.resources,
          renderer: runtime.publicObservation?.renderer,
          semantic: runtime.publicObservation?.semantic,
          lifecycle: runtime.publicObservation?.lifecycle,
          externalUpload:
            runtime.publicObservation?.externalUpload,
          telemetry:
            runtime.publicObservation?.telemetry,
        },
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
      },
      assertions,
      decision: {
        cleanInstall: "passed",
        publicFixtureOpen: "passed",
        referenceFixtureOpen: "passed-bounded-read-only",
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
