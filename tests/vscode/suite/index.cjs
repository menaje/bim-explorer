"use strict";

const assert = require("node:assert/strict");
const {
  mkdtemp,
  rm,
  stat,
  writeFile,
} = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const vscode = require("vscode");

function waitFor(probe, label, timeoutMs = 60_000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      try {
        const value = probe();
        if (value !== null && value !== false) {
          resolve(value);
          return;
        }
      } catch (error) {
        reject(error);
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        reject(new Error(`Timed out waiting for ${label}`));
        return;
      }
      setTimeout(check, 100);
    };
    check();
  });
}

async function run() {
  const root = process.env.BIM_EXPLORER_ROOT;
  const evidencePath =
    process.env.BIM_EXPLORER_VSCODE_EVIDENCE;
  const runtimeLayout =
    process.env.BIM_EXPLORER_PACKAGE_RUNTIME;
  const publicSourcePath =
    process.env.BIM_EXPLORER_VSCODE_PUBLIC_SOURCE;
  const referenceSourcePath =
    process.env.BIM_EXPLORER_VSCODE_GLTF_SOURCE;
  const packagedRuntime = [
    "installed-vsix",
    "staged",
  ].includes(runtimeLayout);
  assert.equal(typeof root, "string");
  assert.equal(typeof evidencePath, "string");
  assert.equal(packagedRuntime, true);
  const generated = await import(
    pathToFileURL(
      path.join(
        root,
        "scripts",
        "generate-synthetic-ifc.mjs",
      ),
    ).href
  );
  const temporary = await mkdtemp(
    path.join(tmpdir(), "bim-explorer-vscode-source-"),
  );
  const sourcePath = path.join(
    temporary,
    "qualification-source.ifc",
  );
  try {
    await writeFile(
      sourcePath,
      generated.syntheticSemanticIfc(),
      "utf8",
    );
    const extension = vscode.extensions.getExtension(
      "menaje.bim-explorer",
    );
    assert.ok(extension, "BIM Explorer extension is unavailable");
    const api = await extension.activate();
    assert.equal(
      typeof api.qualificationReports,
      "function",
    );
    const commands = await vscode.commands.getCommands(true);
    for (const command of [
      "bimExplorer.openWith",
      "bimExplorer.cancel",
      "bimExplorer.retry",
      "bimExplorer.showDiagnostics",
    ]) {
      assert.ok(commands.includes(command), command);
    }
    const source = vscode.Uri.file(sourcePath);
    await vscode.commands.executeCommand(
      "vscode.openWith",
      source,
      "bimExplorer.ifcEditor",
    );
    const ready = await waitFor(() => {
      const report = api.qualificationReports().at(-1);
      if (report?.status === "failed") {
        throw new Error(
          `Custom Editor failed: ${JSON.stringify(report)}`,
        );
      }
      return report?.status === "ready" ? report : null;
    }, "Custom Editor ready report");
    assert.equal(ready.hostKind, "vscode-webview");
    assert.equal(ready.externalUpload, false);
    assert.equal(ready.telemetry, false);
    assert.match(
      ready.source.fingerprint,
      /^sha256:[0-9a-f]{64}$/u,
    );
    assert.equal(ready.source.ifcSchema, "IFC4");
    assert.equal(ready.model.products, 2);
    assert.equal(ready.renderer.actualGpu, true);
    assert.ok(ready.renderer.nonBackgroundPixels > 0);
    const serialized = JSON.stringify(ready);
    assert.equal(serialized.includes(sourcePath), false);
    assert.equal(serialized.includes("qualification-source"), false);
    await vscode.commands.executeCommand(
      "workbench.action.closeActiveEditor",
    );
    const disposed = await waitFor(() => {
      const report = api.qualificationReports().at(-1);
      return report?.status === "disposed" ? report : null;
    }, "Custom Editor disposal");
    let publicQualification = null;
    if (
      typeof publicSourcePath === "string" &&
      publicSourcePath.length > 0
    ) {
      const publicFixtureModule = await import(
        pathToFileURL(
          path.join(root, "scripts", "public-ifc-fixture.mjs"),
        ).href
      );
      const manifest =
        await publicFixtureModule.loadPublicIfcFixtureManifest();
      const publicMetadata = await stat(publicSourcePath);
      assert.equal(publicMetadata.isFile(), true);
      assert.equal(publicMetadata.size, manifest.entry.byteLength);
      const publicSource = vscode.Uri.file(publicSourcePath);
      await vscode.commands.executeCommand(
        "vscode.openWith",
        publicSource,
        "bimExplorer.ifcEditor",
      );
      const publicReady = await waitFor(() => {
        const report = api.qualificationReports().at(-1);
        if (report?.status === "failed") {
          throw new Error(
            `Public Custom Editor failed: ` +
              `${JSON.stringify(report)}`,
          );
        }
        return report?.status === "ready" ? report : null;
      }, "public Custom Editor ready report");
      assert.equal(publicReady.hostKind, "vscode-webview");
      assert.equal(publicReady.externalUpload, false);
      assert.equal(publicReady.telemetry, false);
      assert.equal(
        publicReady.source.fingerprint,
        `sha256:${manifest.entry.sha256}`,
      );
      assert.equal(
        publicReady.source.byteLength,
        manifest.entry.byteLength,
      );
      assert.equal(
        publicReady.source.ifcSchema,
        manifest.ifc.schema,
      );
      assert.deepEqual(publicReady.model, {
        products: manifest.expected.geometryProducts,
        treeNodes: 3_578,
        triangles: manifest.expected.triangles,
        ranges: 3,
      });
      assert.equal(publicReady.renderer.actualGpu, true);
      assert.ok(
        publicReady.renderer.nonBackgroundPixels > 0,
      );
      assert.equal(
        publicReady.renderer.sourceReadBytes,
        4_193_868,
      );
      assert.equal(
        publicReady.renderer.uploadedBytes,
        4_399_252,
      );
      const publicSerialized = JSON.stringify(publicReady);
      assert.equal(
        publicSerialized.includes(publicSourcePath),
        false,
      );
      assert.equal(
        publicSerialized.includes(path.basename(publicSourcePath)),
        false,
      );
      await vscode.commands.executeCommand(
        "workbench.action.closeActiveEditor",
      );
      const publicDisposed = await waitFor(() => {
        const report = api.qualificationReports().at(-1);
        return report?.status === "disposed" ? report : null;
      }, "public Custom Editor disposal");
      publicQualification = {
        fixture: {
          id: manifest.fixtureId,
          committed: false,
          sourceBytes: publicReady.source.byteLength,
          fingerprint: publicReady.source.fingerprint,
          ifcSchema: publicReady.source.ifcSchema,
          provenance: {
            repository: manifest.provenance.repository,
            commit: manifest.provenance.commit,
            license: manifest.provenance.license,
            bundled: false,
          },
        },
        observation: {
          hostKind: publicReady.hostKind,
          model: publicReady.model,
          performance: publicReady.performance,
          resources: publicReady.resources,
          renderer: publicReady.renderer,
          semantic: publicReady.semantic,
          lifecycle: {
            opened: publicReady.status,
            closed: publicDisposed.status,
          },
          externalUpload: publicReady.externalUpload,
          telemetry: publicReady.telemetry,
        },
        assertions: {
          localPublicSourceOpened: true,
          publicSourceIdentityExact: true,
          publicVscodeChromiumWebGl2: true,
          publicPathFreeHostBridge: true,
          publicEditorCloseObserved:
            publicDisposed.status === "disposed",
        },
      };
    }
    let referenceQualification = null;
    if (
      typeof referenceSourcePath === "string" &&
      referenceSourcePath.length > 0
    ) {
      const referenceFixtureModule = await import(
        pathToFileURL(
          path.join(root, "scripts", "public-gltf-fixture.mjs"),
        ).href
      );
      const manifest =
        await referenceFixtureModule
          .loadPublicGltfFixtureManifest();
      const referenceMetadata = await stat(
        referenceSourcePath,
      );
      assert.equal(referenceMetadata.isFile(), true);
      assert.equal(
        referenceMetadata.size,
        manifest.entry.byteLength,
      );
      const referenceSource = vscode.Uri.file(
        referenceSourcePath,
      );
      await vscode.commands.executeCommand(
        "vscode.openWith",
        referenceSource,
        "bimExplorer.ifcEditor",
      );
      const referenceReady = await waitFor(() => {
        const report = api.qualificationReports().at(-1);
        if (report?.status === "failed") {
          throw new Error(
            `Reference Custom Editor failed: ` +
              `${JSON.stringify(report)}`,
          );
        }
        return report?.status === "ready" ? report : null;
      }, "reference Custom Editor ready report");
      assert.equal(
        referenceReady.hostKind,
        "vscode-webview",
      );
      assert.equal(referenceReady.externalUpload, false);
      assert.equal(referenceReady.telemetry, false);
      assert.equal(referenceReady.source.format, "glb");
      assert.equal(
        referenceReady.source.fingerprint,
        `sha256:${manifest.entry.sha256}`,
      );
      assert.equal(
        referenceReady.source.byteLength,
        manifest.entry.byteLength,
      );
      assert.equal(
        referenceReady.source.sourceRole,
        "derived-or-reference-mesh",
      );
      assert.equal(
        referenceReady.source.semanticAuthority,
        false,
      );
      assert.deepEqual(referenceReady.model, {
        entities: 1,
        geometryRecords: 1,
        instances: 1,
        triangles: 12,
        ranges: 1,
      });
      assert.equal(referenceReady.reference.globalId, null);
      assert.equal(
        referenceReady.reference.selectedNativeId,
        "node:1/mesh:0/primitive:0",
      );
      assert.equal(referenceReady.renderer.actualGpu, true);
      assert.ok(
        referenceReady.renderer.nonBackgroundPixels > 0,
      );
      assert.equal(
        referenceReady.renderer.sourceReadBytes,
        756,
      );
      assert.equal(
        referenceReady.renderer.uploadedBytes,
        800,
      );
      const referenceSerialized = JSON.stringify(
        referenceReady,
      );
      assert.equal(
        referenceSerialized.includes(referenceSourcePath),
        false,
      );
      assert.equal(
        referenceSerialized.includes(
          path.basename(referenceSourcePath),
        ),
        false,
      );
      await vscode.commands.executeCommand(
        "workbench.action.closeActiveEditor",
      );
      const referenceDisposed = await waitFor(() => {
        const report = api.qualificationReports().at(-1);
        return report?.status === "disposed" ? report : null;
      }, "reference Custom Editor disposal");
      referenceQualification = {
        fixture: {
          id: manifest.fixtureId,
          committed: false,
          format: "glb",
          sourceBytes: referenceReady.source.byteLength,
          fingerprint: referenceReady.source.fingerprint,
          gltfVersion: referenceReady.source.gltfVersion,
          nativeId: "node:1/mesh:0/primitive:0",
          provenance: {
            repository: manifest.provenance.repository,
            commit: manifest.provenance.commit,
            license: manifest.license.spdx,
            bundled: false,
          },
        },
        observation: {
          hostKind: referenceReady.hostKind,
          model: referenceReady.model,
          performance: referenceReady.performance,
          resources: referenceReady.resources,
          renderer: referenceReady.renderer,
          reference: referenceReady.reference,
          lifecycle: {
            opened: referenceReady.status,
            closed: referenceDisposed.status,
          },
          externalUpload: referenceReady.externalUpload,
          telemetry: referenceReady.telemetry,
        },
        assertions: {
          localReferenceSourceOpened: true,
          referenceSourceIdentityExact: true,
          referenceHasNoBimSemanticAuthority: true,
          referenceVscodeChromiumWebGl2: true,
          referencePathFreeHostBridge: true,
          referenceEditorCloseObserved:
            referenceDisposed.status === "disposed",
        },
      };
    }
    const evidence = {
      schema:
        "bim-explorer-vscode-custom-editor-evidence/1",
      capturedAt: new Date().toISOString(),
      environment: {
        vscode: vscode.version,
        platform: `${process.platform}-${process.arch}`,
        extensionMode: extension.extensionMode,
        runtimeLayout,
      },
      fixture: {
        id: "synthetic-semantic-ifc4",
        committed: false,
        sourceBytes: ready.source.byteLength,
        fingerprint: ready.source.fingerprint,
        ifcSchema: ready.source.ifcSchema,
      },
      observation: {
        hostKind: ready.hostKind,
        model: ready.model,
        performance: ready.performance,
        resources: ready.resources,
        renderer: ready.renderer,
        semantic: ready.semantic,
        lifecycle: {
          opened: ready.status,
          closed: disposed.status,
        },
        commandCount: 4,
        externalUpload: ready.externalUpload,
        telemetry: ready.telemetry,
      },
      ...(publicQualification === null
        ? {}
        : {
            publicFixture: publicQualification.fixture,
            publicObservation:
              publicQualification.observation,
            publicAssertions:
              publicQualification.assertions,
          }),
      ...(referenceQualification === null
        ? {}
        : {
            referenceFixture:
              referenceQualification.fixture,
            referenceObservation:
              referenceQualification.observation,
            referenceAssertions:
              referenceQualification.assertions,
          }),
      assertions: {
        actualVscodeChromiumWebGl2:
          ready.renderer.actualGpu === true &&
          ready.renderer.nonBackgroundPixels > 0,
        localSourceOpened:
          ready.source.byteLength > 0 &&
          ready.source.ifcSchema === "IFC4",
        pathFreeHostBridge:
          serialized.includes(sourcePath) === false &&
          serialized.includes("qualification-source") === false,
        commandsRegistered: true,
        editorCloseObserved: disposed.status === "disposed",
        packagedRuntimeIndependent: packagedRuntime,
        spatialIndependent: true,
      },
      decision: {
        vscodeCustomEditor: "passed",
        actualPhysicalGpu: "not-claimed",
        publicViewerCoreConformance: "held",
      },
    };
    assert.ok(
      Object.values(evidence.assertions).every(Boolean),
    );
    if (evidence.publicAssertions !== undefined) {
      assert.ok(
        Object.values(evidence.publicAssertions).every(Boolean),
      );
    }
    if (evidence.referenceAssertions !== undefined) {
      assert.ok(
        Object.values(
          evidence.referenceAssertions,
        ).every(Boolean),
      );
    }
    await writeFile(
      evidencePath,
      `${JSON.stringify(evidence, null, 2)}\n`,
      "utf8",
    );
  } finally {
    await rm(temporary, {
      force: true,
      recursive: true,
    });
  }
}

module.exports = {
  run,
};
