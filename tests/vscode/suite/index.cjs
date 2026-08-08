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

async function qualifyReference({
  api,
  manifestPath = undefined,
  productScale = false,
  root,
  sourcePath,
}) {
  const fixtureModule = await import(
    pathToFileURL(
      path.join(root, "scripts", "public-gltf-fixture.mjs"),
    ).href
  );
  const manifest = await fixtureModule
    .loadPublicGltfFixtureManifest(manifestPath);
  const metadata = await stat(sourcePath);
  assert.equal(metadata.isFile(), true);
  assert.equal(metadata.size, manifest.entry.byteLength);
  if (productScale) {
    await vscode.workspace
      .getConfiguration("bimExplorer")
      .update(
        "openTimeoutMs",
        manifest.browserQualification.timeoutMs,
        vscode.ConfigurationTarget.Global,
      );
  }
  const source = vscode.Uri.file(sourcePath);
  await vscode.commands.executeCommand(
    "vscode.openWith",
    source,
    "bimExplorer.ifcEditor",
  );
  const label = productScale
    ? "product-scale reference"
    : "reference";
  let ready = await waitFor(
    () => {
      const report = api.qualificationReports().at(-1);
      if (report?.status === "failed") {
        throw new Error(
          `${label} Custom Editor failed: ` +
            `${JSON.stringify(report)}`,
        );
      }
      return report?.status === "ready" ? report : null;
    },
    `${label} Custom Editor ready report`,
    manifest.browserQualification.timeoutMs,
  );
  const nativeId = productScale
    ? "node:0/mesh:0/primitive:0"
    : "node:1/mesh:0/primitive:0";
  const expectedModel = productScale
    ? {
        entities: manifest.expected.instances,
        geometryRecords: manifest.expected.geometryRecords,
        instances: manifest.expected.instances,
        triangles: manifest.expected.triangles,
        ranges: 1,
      }
    : {
        entities: 1,
        geometryRecords: 1,
        instances: 1,
        triangles: manifest.expected.triangles,
        ranges: 1,
      };
  const expectedReadBytes = productScale
    ? manifest.expected.geometryRangeBytes
    : 756;
  const expectedUploadedBytes = productScale
    ? 16_900_016
    : 800;
  assert.equal(ready.hostKind, "vscode-webview");
  assert.equal(ready.externalUpload, false);
  assert.equal(ready.telemetry, false);
  assert.equal(ready.source.format, "glb");
  assert.equal(
    ready.source.fingerprint,
    `sha256:${manifest.entry.sha256}`,
  );
  assert.equal(
    ready.source.byteLength,
    manifest.entry.byteLength,
  );
  assert.equal(
    ready.source.sourceRole,
    "derived-or-reference-mesh",
  );
  assert.equal(ready.source.semanticAuthority, false);
  assert.deepEqual(ready.model, expectedModel);
  assert.equal(ready.reference.globalId, null);
  assert.equal(ready.reference.selectedNativeId, nativeId);
  assert.equal(ready.renderer.actualGpu, true);
  assert.ok(ready.renderer.nonBackgroundPixels > 0);
  assert.equal(
    ready.renderer.sourceReadBytes,
    expectedReadBytes,
  );
  assert.equal(
    ready.renderer.uploadedBytes,
    expectedUploadedBytes,
  );
  const serialized = JSON.stringify(ready);
  assert.equal(serialized.includes(sourcePath), false);
  assert.equal(
    serialized.includes(path.basename(sourcePath)),
    false,
  );
  await vscode.commands.executeCommand(
    "workbench.action.closeActiveEditor",
  );
  const disposed = await waitFor(() => {
    const report = api.qualificationReports().at(-1);
    return report?.status === "disposed" ? report : null;
  }, `${label} Custom Editor disposal`);
  return {
    fixture: {
      id: manifest.fixtureId,
      committed: false,
      format: "glb",
      sourceBytes: ready.source.byteLength,
      fingerprint: ready.source.fingerprint,
      gltfVersion: ready.source.gltfVersion,
      nativeId,
      ...(productScale
        ? {
            classification:
              manifest.browserQualification.classification,
            rendererLimits:
              manifest.browserQualification.rendererLimits,
          }
        : {}),
      provenance: {
        repository: manifest.provenance.repository,
        commit: manifest.provenance.commit,
        license: manifest.license.spdx,
        bundled: false,
      },
    },
    observation: {
      hostKind: ready.hostKind,
      model: ready.model,
      performance: ready.performance,
      resources: ready.resources,
      renderer: ready.renderer,
      reference: ready.reference,
      lifecycle: {
        opened: ready.status,
        closed: disposed.status,
      },
      externalUpload: ready.externalUpload,
      telemetry: ready.telemetry,
    },
    assertions: {
      localSourceOpened: true,
      sourceIdentityExact: true,
      noBimSemanticAuthority: true,
      vscodeChromiumWebGl2: true,
      boundedRenderer:
        !productScale ||
        (
          ready.renderer.sourceReadBytes <=
            manifest.browserQualification.rendererLimits
              .maximumSourceReadBytes &&
          ready.renderer.uploadedBytes <=
            manifest.browserQualification.rendererLimits
              .maximumGpuCacheBytes
        ),
      pathFreeHostBridge: true,
      editorCloseObserved: disposed.status === "disposed",
    },
  };
}

async function qualifyPointSource({
  api,
  format,
  manifest,
  sourcePath,
}) {
  const e57 = format === "e57";
  const sphericalE57 =
    manifest.schema ===
      "bim-explorer-public-e57-spherical-fixture/1";
  const multipleScanE57 =
    manifest.schema ===
      "bim-explorer-public-e57-multiple-scan-fixture/1";
  const exampleE57 = sphericalE57 || multipleScanE57;
  const e57Projection = multipleScanE57
    ? manifest.expected.productProjection
    : manifest.expected;
  const entry = e57 ? manifest.entry : manifest.entries[format];
  const metadata = await stat(sourcePath);
  assert.equal(metadata.isFile(), true);
  assert.equal(metadata.size, entry.byteLength);
  await vscode.commands.executeCommand(
    "vscode.openWith",
    vscode.Uri.file(sourcePath),
    "bimExplorer.ifcEditor",
  );
  let ready = await waitFor(
    () => {
      const report = api.qualificationReports().at(-1);
      if (report?.status === "failed") {
        throw new Error(
          `${format.toUpperCase()} Custom Editor failed: ` +
            `${JSON.stringify(report)}`,
        );
      }
      return report?.status === "ready" ? report : null;
    },
    `${format.toUpperCase()} Custom Editor ready report`,
  );
  const initialPointLod = ready.pointCloud?.lod?.fullDetail === false
    ? {
        lifecycle: ready.productLifecycle,
        lod: ready.pointCloud.lod,
        renderer: ready.renderer,
        renderedRangeSha256:
          ready.pointCloud.renderedRangeSha256,
      }
    : null;
  if (initialPointLod !== null) {
    assert.equal(
      await vscode.commands.executeCommand(
        "bimExplorer.pickVisiblePoint",
      ),
      true,
    );
    const initialSelected = await waitFor(() => {
      const report = api.qualificationReports().at(-1);
      return report?.status === "ready" &&
        report.pointSelection?.status === "hit"
        ? report
        : null;
    }, `${format.toUpperCase()} initial LOD point selection`);
    initialPointLod.pointSelection = initialSelected.pointSelection;
  }
  while (ready.pointCloud?.lod?.fullDetail === false) {
    const nextLevel = ready.pointCloud.lod.levelIndex + 1;
    assert.equal(
      await vscode.commands.executeCommand(
        "bimExplorer.refinePointLod",
      ),
      true,
    );
    ready = await waitFor(() => {
      const report = api.qualificationReports().at(-1);
      if (report?.status === "failed") {
        throw new Error(
          `${format.toUpperCase()} point LOD failed: ` +
            `${JSON.stringify(report)}`,
        );
      }
      return report?.status === "ready" &&
        report.pointCloud?.lod?.levelIndex === nextLevel
        ? report
        : null;
    }, `${format.toUpperCase()} point LOD ${nextLevel}`, 120_000);
  }
  const expectedDecoder = format === "laz"
    ? {
        backend: "browser-wasm-worker-product-source",
        id: "laz-perf",
        license: "Apache-2.0",
        version: "0.0.6",
      }
    : e57
      ? {
          backend: "bounded-native-js-product-source",
          id: "bim-explorer-e57-bitpack-reader",
          license: "MPL-2.0",
          version: "0.1.0",
        }
      : {
        backend: "bounded-native-js-product-source",
        id: "las-point-record-reader",
        license: "MPL-2.0",
        version: "0.1.0",
      };
  assert.equal(ready.hostKind, "vscode-webview");
  assert.equal(ready.externalUpload, false);
  assert.equal(ready.telemetry, false);
  assert.deepEqual(ready.source, {
    fingerprint: `sha256:${entry.sha256}`,
    revisionId: `source-snapshot:sha256:${entry.sha256}`,
    snapshotId: null,
    byteLength: entry.byteLength,
    ifcSchema: null,
    format,
    gltfVersion: null,
    coordinateReferenceStatus: "unqualified",
    formatVersion: manifest.expected.formatVersion,
    pointFormat: e57
      ? multipleScanE57
        ? e57Projection.pointFormat
        : sphericalE57
          ? "spherical-rae-rgb"
          : "cartesian-xyz-rgb"
      : manifest.expected.pointFormat,
    profile: null,
    sourceRole: "derived-or-reference-points",
    semanticAuthority: false,
  });
  assert.deepEqual(ready.model, {
    chunks: ready.pointCloud.hierarchy.chunkCount,
    levels: ready.pointCloud.hierarchy.levels.length,
    points: manifest.expected.pointRecords,
    ranges: 1,
  });
  assert.equal(
    ready.resources.decodedPointBytes,
    e57
      ? exampleE57
        ? manifest.expected.decodedPointBytes
        : 215_040
      : manifest.expected.pointRecordLength *
          manifest.expected.pointRecords,
  );
  const pointRangeBytes = e57
    ? e57Projection.pointRangeByteLength
    : 163_264;
  const pointRangePayloadBytes = e57
    ? e57Projection.pointRangePayloadBytes
    : 163_216;
  assert.equal(ready.resources.pointRangeBytes, pointRangeBytes);
  assert.equal(
    ready.resources.pointRangePayloadBytes,
    pointRangePayloadBytes,
  );
  assert.equal(ready.resources.sourceBytes, entry.byteLength);
  if (format !== "laz") {
    assert.equal(
      ready.resources.wasmHeapCapacityBytes,
      null,
    );
  } else {
    assert.deepEqual(
      ready.resources.wasmHeapCapacityBytes,
      {
        afterDecode: 4_063_232,
        afterInitialization: 262_144,
        peakObserved: 4_063_232,
      },
    );
  }
  assert.equal(ready.renderer.actualGpu, true);
  assert.ok(ready.renderer.nonBackgroundPixels > 0);
  assert.equal(ready.renderer.sourceReadBytes, pointRangeBytes);
  assert.equal(
    ready.renderer.uploadedBytes,
    pointRangePayloadBytes,
  );
  assert.equal(
    ready.pointCloud.rangeSha256,
    e57
      ? e57Projection.pointRangeSha256
      : "8383abce84d57b8f50ee1f39aa1d442" +
          "a7f258cd759ab9812aff1a0625ab10449",
  );
  assert.equal(
    ready.pointCloud.coordinateReferenceStatus,
    "unqualified",
  );
  if (e57) {
    assert.deepEqual(
      {
        backend: ready.pointCloud.decoder.backend,
        id: ready.pointCloud.decoder.id,
        license: ready.pointCloud.decoder.license,
        version: ready.pointCloud.decoder.version,
      },
      expectedDecoder,
    );
    assert.equal(
      ready.pointCloud.decoder.reference.id,
      "cry-inc/e57",
    );
  } else {
    assert.deepEqual(ready.pointCloud.decoder, expectedDecoder);
  }
  assert.equal(ready.pointCloud.pointPrimitive, "POINTS");
  assert.equal(ready.pointCloud.pointSize, 3);
  assert.ok(ready.pointCloud.maximumProjectionError < 1e-6);
  assert.equal(ready.productLifecycle.cpuPointRangeCleared, true);
  assert.equal(ready.productLifecycle.sourceBufferCleared, true);
  assert.equal(
    ready.productLifecycle.workerTerminatedAfterTransfer,
    true,
  );
  assert.equal(
    ready.productLifecycle.hierarchyCleanup?.disposed ?? true,
    true,
  );
  assert.equal(
    await vscode.commands.executeCommand(
      "bimExplorer.pickVisiblePoint",
    ),
    true,
  );
  const selected = await waitFor(() => {
    const report = api.qualificationReports().at(-1);
    return report?.status === "ready" &&
      report.pointSelection?.status === "hit"
      ? report
      : null;
  }, `${format.toUpperCase()} point selection`);
  assert.equal(
    selected.pointSelection.schema,
    "bim-explorer-bounded-point-renderer-pick-receipt/0.1",
  );
  assert.equal(
    selected.pointSelection.identity.authority,
    "derived-point-range-order",
  );
  assert.match(
    selected.pointSelection.identity.nativeId,
    /^point:\d+$/u,
  );
  assert.equal(
    selected.pointSelection.identity.rangeSha256,
    ready.pointCloud.rangeSha256,
  );
  assert.equal(selected.pointSelection.backend.actualGpu, true);
  assert.equal(
    selected.pointSelection.backend.temporaryReleased,
    true,
  );
  assert.equal(
    selected.pointSelection.worldPosition.every(Number.isFinite),
    true,
  );
  const serialized = JSON.stringify(selected);
  assert.equal(serialized.includes(sourcePath), false);
  assert.equal(
    serialized.includes(path.basename(sourcePath)),
    false,
  );
  await vscode.commands.executeCommand(
    "workbench.action.closeActiveEditor",
  );
  const disposed = await waitFor(() => {
    const report = api.qualificationReports().at(-1);
    return report?.status === "disposed" ? report : null;
  }, `${format.toUpperCase()} Custom Editor disposal`);
  return {
    fixture: {
      id: e57
        ? manifest.fixtureId
        : `${manifest.fixtureId}-${format}`,
      committed: false,
      format,
      sourceBytes: entry.byteLength,
      fingerprint: ready.source.fingerprint,
      formatVersion: ready.source.formatVersion,
      pointFormat: ready.source.pointFormat,
      provenance: {
        repository: manifest.provenance.repository,
        ...(exampleE57
          ? {
              sourcePage: manifest.provenance.sourcePage,
              publishedAt: manifest.provenance.publishedAt,
              license: manifest.license.identifier,
              notice: manifest.license.notice,
            }
          : {
              commit: manifest.provenance.commit,
              license: e57
                ? manifest.license.spdx
                : manifest.use.sourceRepositoryLicense,
            }),
        bundled: false,
        sampleRedistributed: false,
      },
    },
    observation: {
      hostKind: ready.hostKind,
      source: ready.source,
      model: ready.model,
      performance: ready.performance,
      resources: ready.resources,
      renderer: ready.renderer,
      pointCloud: ready.pointCloud,
      pointSelection: selected.pointSelection,
      productLifecycle: ready.productLifecycle,
      initialPointLod,
      lodTransitions: ready.lodTransitions,
      lifecycle: {
        opened: ready.status,
        closed: disposed.status,
      },
      externalUpload: ready.externalUpload,
      telemetry: ready.telemetry,
    },
    assertions: {
      localPointSourceOpened: true,
      pointSourceIdentityExact: true,
      noCoordinateOrSemanticAuthority: true,
      vscodeChromiumWebGl2: true,
      boundedPointRenderer: true,
      sourceScopedPointIdentityAndPicking: true,
      pointWorkerAndCpuCleanup: true,
      pathFreeHostBridge: true,
      editorCloseObserved: disposed.status === "disposed",
    },
  };
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
  const productScaleReferenceSourcePath =
    process.env
      .BIM_EXPLORER_VSCODE_GLTF_PRODUCT_SCALE_SOURCE;
  const lasSourcePath =
    process.env.BIM_EXPLORER_VSCODE_LAS_SOURCE;
  const lazSourcePath =
    process.env.BIM_EXPLORER_VSCODE_LAZ_SOURCE;
  const e57SourcePath =
    process.env.BIM_EXPLORER_VSCODE_E57_SOURCE;
  const e57SphericalSourcePath =
    process.env.BIM_EXPLORER_VSCODE_E57_SPHERICAL_SOURCE;
  const e57MultipleScanSourcePath =
    process.env.BIM_EXPLORER_VSCODE_E57_MULTIPLE_SCAN_SOURCE;
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
      "bimExplorer.pickVisiblePoint",
      "bimExplorer.refinePointLod",
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
      const qualified = await qualifyReference({
        api,
        root,
        sourcePath: referenceSourcePath,
      });
      referenceQualification = {
        fixture: qualified.fixture,
        observation: qualified.observation,
        assertions: {
          localReferenceSourceOpened:
            qualified.assertions.localSourceOpened,
          referenceSourceIdentityExact:
            qualified.assertions.sourceIdentityExact,
          referenceHasNoBimSemanticAuthority:
            qualified.assertions.noBimSemanticAuthority,
          referenceVscodeChromiumWebGl2:
            qualified.assertions.vscodeChromiumWebGl2,
          referencePathFreeHostBridge:
            qualified.assertions.pathFreeHostBridge,
          referenceEditorCloseObserved:
            qualified.assertions.editorCloseObserved,
        },
      };
    }
    let productScaleReferenceQualification = null;
    if (
      typeof productScaleReferenceSourcePath === "string" &&
      productScaleReferenceSourcePath.length > 0
    ) {
      const fixtureModule = await import(
        pathToFileURL(
          path.join(root, "scripts", "public-gltf-fixture.mjs"),
        ).href
      );
      const qualified = await qualifyReference({
        api,
        manifestPath:
          fixtureModule.PUBLIC_GLTF_PRODUCT_SCALE_MANIFEST,
        productScale: true,
        root,
        sourcePath: productScaleReferenceSourcePath,
      });
      productScaleReferenceQualification = {
        fixture: qualified.fixture,
        observation: qualified.observation,
        assertions: {
          localProductScaleReferenceSourceOpened:
            qualified.assertions.localSourceOpened,
          productScaleReferenceIdentityExact:
            qualified.assertions.sourceIdentityExact,
          productScaleReferenceHasNoBimAuthority:
            qualified.assertions.noBimSemanticAuthority,
          productScaleReferenceVscodeWebGl2:
            qualified.assertions.vscodeChromiumWebGl2,
          productScaleReferenceRendererBounded:
            qualified.assertions.boundedRenderer,
          productScaleReferencePathFreeBridge:
            qualified.assertions.pathFreeHostBridge,
          productScaleReferenceEditorCloseObserved:
            qualified.assertions.editorCloseObserved,
        },
      };
    }
    const pointQualifications = {};
    if (
      typeof lasSourcePath === "string" &&
      lasSourcePath.length > 0 &&
      typeof lazSourcePath === "string" &&
      lazSourcePath.length > 0 &&
      typeof e57SourcePath === "string" &&
      e57SourcePath.length > 0
    ) {
      const fixtureModule = await import(
        pathToFileURL(
          path.join(root, "scripts", "public-las-laz-fixture.mjs"),
        ).href
      );
      const manifest = await fixtureModule
        .loadPublicLasLazFixtureManifest();
      const e57FixtureModule = await import(
        pathToFileURL(
          path.join(root, "scripts", "public-e57-fixture.mjs"),
        ).href
      );
      const e57Manifest = await e57FixtureModule
        .loadPublicE57FixtureManifest();
      Object.assign(pointQualifications, {
        e57: await qualifyPointSource({
          api,
          format: "e57",
          manifest: e57Manifest,
          sourcePath: e57SourcePath,
        }),
        las: await qualifyPointSource({
          api,
          format: "las",
          manifest,
          sourcePath: lasSourcePath,
        }),
        laz: await qualifyPointSource({
          api,
          format: "laz",
          manifest,
          sourcePath: lazSourcePath,
        }),
      });
    }
    if (
      typeof e57SphericalSourcePath === "string" &&
      e57SphericalSourcePath.length > 0
    ) {
      const fixtureModule = await import(
        pathToFileURL(
          path.join(
            root,
            "scripts",
            "public-e57-spherical-fixture.mjs",
          ),
        ).href
      );
      const manifest = await fixtureModule
        .loadPublicE57SphericalFixtureManifest();
      pointQualifications.e57Spherical =
        await qualifyPointSource({
          api,
          format: "e57",
          manifest,
          sourcePath: e57SphericalSourcePath,
        });
    }
    if (
      typeof e57MultipleScanSourcePath === "string" &&
      e57MultipleScanSourcePath.length > 0
    ) {
      const fixtureModule = await import(
        pathToFileURL(
          path.join(
            root,
            "scripts",
            "public-e57-multiple-scan-fixture.mjs",
          ),
        ).href
      );
      const manifest = await fixtureModule
        .loadPublicE57MultipleScanFixtureManifest();
      pointQualifications.e57MultipleScan =
        await qualifyPointSource({
          api,
          format: "e57",
          manifest,
          sourcePath: e57MultipleScanSourcePath,
        });
    }
    const hasPointQualifications =
      Object.keys(pointQualifications).length > 0;
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
      ...(productScaleReferenceQualification === null
        ? {}
        : {
            productScaleReferenceFixture:
              productScaleReferenceQualification.fixture,
            productScaleReferenceObservation:
              productScaleReferenceQualification.observation,
            productScaleReferenceAssertions:
              productScaleReferenceQualification.assertions,
          }),
      ...(!hasPointQualifications
        ? {}
        : {
            pointFixtures: Object.fromEntries(
              Object.entries(pointQualifications).map(
                ([name, value]) => [name, value.fixture],
              ),
            ),
            pointObservations: Object.fromEntries(
              Object.entries(pointQualifications).map(
                ([name, value]) => [name, value.observation],
              ),
            ),
            pointAssertions: Object.fromEntries(
              Object.entries(pointQualifications).map(
                ([name, value]) => [name, value.assertions],
              ),
            ),
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
    if (
      evidence.productScaleReferenceAssertions !== undefined
    ) {
      assert.ok(
        Object.values(
          evidence.productScaleReferenceAssertions,
        ).every(Boolean),
      );
    }
    if (evidence.pointAssertions !== undefined) {
      for (const assertions of Object.values(
        evidence.pointAssertions,
      )) {
        assert.ok(Object.values(assertions).every(Boolean));
      }
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
