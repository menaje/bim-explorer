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

function viewerCoreQualified(ready, disposed) {
  return (
    ready.viewerCore?.adopted === true &&
    ready.viewerCore?.api === "menaje-viewer-core/0.1" &&
    ready.viewerCore?.version === "0.1.2" &&
    ready.viewerCore?.protocolId ===
      "menaje-viewer-render-protocol/0.1.0" &&
    ready.viewerCore?.source?.rangeReads > 0 &&
    ready.viewerCore?.source?.rangeBytesRead ===
      ready.renderer?.sourceReadBytes &&
    ready.viewerCore?.host?.eventCount >= 1 &&
    disposed.viewerCore?.disposed === true &&
    disposed.viewerCore?.host?.disposed === true &&
    disposed.viewerCore?.host?.eventCount >=
      ready.viewerCore.host.eventCount &&
    disposed.viewerCore?.source?.disposed === true &&
    disposed.viewerCore?.source?.sessionDisposed === true &&
    disposed.viewerCore?.presentation
      ?.borrowedSessionDisposed === true &&
    disposed.viewerCore?.presentation
      ?.borrowedWorkerDisposed === true &&
    disposed.viewerCore?.presentation?.disposalStatus ===
      "disposed"
  );
}

function physicalAppleMetalGpu(value) {
  return (
    value?.schema === "bim-explorer-webgl2-gpu-identity/1" &&
    value.webgl2 === true &&
    value.debugRendererInfo === true &&
    /\bApple\b/u.test(value.unmaskedVendor ?? "") &&
    /ANGLE Metal Renderer: Apple/u.test(
      value.unmaskedRenderer ?? "",
    ) &&
    !/(?:swiftshader|subzero|llvmpipe|lavapipe|software)/iu.test(
      JSON.stringify(value),
    )
  );
}

async function qualifyReference({
  api,
  embeddedTexture = false,
  manifestPath = undefined,
  meshopt = false,
  productScale = false,
  quantized = false,
  resourceBundle = false,
  root,
  sourcePath,
}) {
  const fixtureModule = await import(
    pathToFileURL(
      path.join(
        root,
        "scripts",
        resourceBundle
          ? "public-gltf-resource-bundle-fixture.mjs"
          : meshopt
            ? "public-gltf-meshopt-fixture.mjs"
          : quantized
            ? "public-gltf-quantized-fixture.mjs"
          : "public-gltf-fixture.mjs",
      ),
    ).href
  );
  const manifest = resourceBundle
    ? await fixtureModule.loadPublicGltfResourceBundleManifest(
        manifestPath,
      )
    : meshopt
      ? await fixtureModule.loadPublicMeshoptGltfManifest(
          manifestPath,
        )
    : quantized
      ? await fixtureModule.loadPublicQuantizedGltfManifest(
          manifestPath,
        )
    : await fixtureModule.loadPublicGltfFixtureManifest(manifestPath);
  const entry = resourceBundle ? manifest.document : manifest.entry;
  const timeoutMs = resourceBundle
    ? 30_000
    : quantized || meshopt
      ? 30_000
    : manifest.browserQualification.timeoutMs;
  const metadata = await stat(sourcePath);
  assert.equal(metadata.isFile(), true);
  assert.equal(metadata.size, entry.byteLength);
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
    : embeddedTexture
      ? "embedded-texture reference"
    : resourceBundle
      ? "external-resource reference"
      : meshopt
        ? "meshopt reference"
      : quantized
        ? "quantized reference"
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
    timeoutMs,
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
    : resourceBundle || embeddedTexture
      ? manifest.expected.geometryRangeBytes
      : quantized || meshopt
        ? manifest.expected.geometryRangeBytes
      : 756;
  const expectedUploadedBytes = productScale
    ? 16_900_016
    : resourceBundle || embeddedTexture
      ? manifest.expected.gpuUploadBytes
      : quantized || meshopt
        ? manifest.expected.gpuUploadBytes
      : 800;
  assert.equal(ready.hostKind, "vscode-webview");
  assert.equal(ready.externalUpload, false);
  assert.equal(ready.telemetry, false);
  assert.equal(ready.source.format, resourceBundle ? "gltf" : "glb");
  assert.equal(
    ready.source.fingerprint,
    `sha256:${resourceBundle
      ? manifest.expected.sourceFingerprint
      : manifest.entry.sha256}`,
  );
  assert.equal(
    ready.source.byteLength,
    resourceBundle
      ? manifest.expected.aggregateSourceBytes
      : manifest.entry.byteLength,
  );
  if (quantized || meshopt) {
    assert.deepEqual(
      ready.source.extensionsRequired,
      manifest.expected.extensionsRequired,
    );
    assert.deepEqual(
      ready.source.extensionsUsed,
      manifest.expected.extensionsUsed,
    );
  }
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
  if (productScale) {
    assert.equal(ready.source.appearance, undefined);
    assert.deepEqual(
      ready.source.appearanceOmissions,
      manifest.expected.appearanceOmissions,
    );
  }
  if (resourceBundle || embeddedTexture) {
    const documentBytes = resourceBundle
      ? manifest.document.byteLength
      : manifest.entry.byteLength;
    const expectedResourceBundle = {
      schema: "bim-explorer-gltf-local-resource-bundle/0.1",
      documentBytes,
      externalResourceBytes:
        manifest.expected.externalResourceBytes,
      externalResources: manifest.expected.externalResources,
      ...(manifest.expected.externalImageResources === undefined
        ? {}
        : {
            externalBufferResources:
              manifest.expected.externalBufferResources,
            externalImageResources:
              manifest.expected.externalImageResources,
          }),
      ...(manifest.expected.externalBufferViewImageResources ===
        undefined
        ? {}
        : {
            externalBufferResources:
              manifest.expected.externalBufferResources,
            externalBufferViewImageResources:
              manifest.expected.externalBufferViewImageResources,
          }),
      ...(manifest.expected.embeddedImageResources === undefined
        ? {}
        : {
            embeddedImageBytes:
              manifest.expected.embeddedImageBytes,
            embeddedImageResources:
              manifest.expected.embeddedImageResources,
          }),
      networkAtRuntime: false,
    };
    assert.deepEqual(
      ready.source.resourceBundle,
      expectedResourceBundle,
    );
    assert.equal(
      ready.resources.documentBytes,
      documentBytes,
    );
    assert.equal(
      ready.resources.externalResourceBytes,
      manifest.expected.externalResourceBytes,
    );
    assert.equal(
      ready.resources.externalResources,
      manifest.expected.externalResources,
    );
    if (
      manifest.expected.externalImageResources !== undefined ||
      manifest.expected.externalBufferViewImageResources !==
        undefined ||
      manifest.expected.embeddedImageResources !== undefined
    ) {
      if (manifest.expected.externalImageResources !== undefined) {
        assert.equal(
          ready.resources.externalBufferResources,
          manifest.expected.externalBufferResources,
        );
        assert.equal(
          ready.resources.externalImageResources,
          manifest.expected.externalImageResources,
        );
      }
      if (
        manifest.expected.externalBufferViewImageResources !==
          undefined
      ) {
        assert.equal(
          ready.resources.externalBufferResources,
          manifest.expected.externalBufferResources,
        );
        assert.equal(
          ready.resources.externalBufferViewImageResources,
          manifest.expected.externalBufferViewImageResources,
        );
      }
      if (manifest.expected.embeddedImageResources !== undefined) {
        assert.equal(
          ready.resources.embeddedImageBytes,
          manifest.expected.embeddedImageBytes,
        );
        assert.equal(
          ready.resources.embeddedImageResources,
          manifest.expected.embeddedImageResources,
        );
      }
      assert.deepEqual(ready.source.appearance, {
        profile: manifest.expected.appearanceProfile ??
          "base-color-texture-png-opaque-v0.1",
        textureCoordinateSet:
          manifest.expected.textureCoordinateSet,
        textureSourceBytes:
          manifest.expected.textureSourceBytes,
        textureDecodedBytes:
          manifest.expected.textureDecodedBytes,
        textures: manifest.expected.textures,
        imageMediaTypes: [manifest.expected.imageMediaType],
        ...(manifest.expected.imageStorageProfile === undefined
          ? {}
          : {
              imageStorageProfiles: [
                manifest.expected.imageStorageProfile,
              ],
            }),
        colorSpace: "srgb-to-linear-webgl2",
      });
      assert.equal(
        ready.renderer.textureDecodedBytes,
        manifest.expected.textureDecodedBytes,
      );
      assert.equal(
        ready.renderer.textureGpuBytes,
        manifest.expected.textureGpuBytes,
      );
      assert.equal(
        ready.renderer.gpuTextures,
        manifest.expected.textures,
      );
    }
  }
  const serialized = JSON.stringify(ready);
  assert.equal(serialized.includes(sourcePath), false);
  assert.equal(
    serialized.includes(path.basename(sourcePath)),
    false,
  );
  await vscode.commands.executeCommand(
    "bimExplorer.closeModel",
  );
  const disposed = await waitFor(() => {
    const report = api.qualificationReports().at(-1);
    return report?.status === "disposed" ? report : null;
  }, `${label} Custom Editor disposal`);
  await vscode.commands.executeCommand(
    "workbench.action.closeActiveEditor",
  );
  return {
    fixture: {
      id: manifest.fixtureId,
      committed: false,
      format: resourceBundle ? "gltf" : "glb",
      sourceBytes: ready.source.byteLength,
      fingerprint: ready.source.fingerprint,
      gltfVersion: ready.source.gltfVersion,
      nativeId,
      ...(resourceBundle || embeddedTexture
        ? {
            resourceBundle: ready.source.resourceBundle,
            ...(ready.source.appearance === undefined
              ? {}
              : { appearance: ready.source.appearance }),
          }
        : {}),
      ...(quantized || meshopt
        ? {
            extensionsRequired:
              ready.source.extensionsRequired,
            extensionsUsed: ready.source.extensionsUsed,
          }
        : {}),
      ...(productScale
        ? {
            classification:
              manifest.browserQualification.classification,
            rendererLimits:
              manifest.browserQualification.rendererLimits,
            appearanceOmissions:
              ready.source.appearanceOmissions,
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
      gpu: ready.gpu,
      model: ready.model,
      performance: ready.performance,
      resources: ready.resources,
      renderer: ready.renderer,
      reference: {
        ...ready.reference,
        ...(ready.source.appearanceOmissions === undefined
          ? {}
          : {
              appearanceOmissions:
                ready.source.appearanceOmissions,
            }),
      },
      lifecycle: {
        opened: ready.status,
        closed: disposed.status,
      },
      viewerCore: {
        opened: ready.viewerCore,
        disposed: disposed.viewerCore,
      },
      externalUpload: ready.externalUpload,
      telemetry: ready.telemetry,
    },
    assertions: {
      localSourceOpened: true,
      sourceIdentityExact: true,
      noBimSemanticAuthority: true,
      exactLocalResourceBundle:
        !(resourceBundle || embeddedTexture) ||
        (
          ready.resources.documentBytes ===
            (resourceBundle
              ? manifest.document.byteLength
              : manifest.entry.byteLength) &&
          ready.resources.externalResourceBytes ===
            manifest.expected.externalResourceBytes &&
          ready.resources.externalResources ===
            manifest.expected.externalResources &&
          ready.source.resourceBundle?.networkAtRuntime === false
        ),
      exactRequiredExtensions:
        !(quantized || meshopt) ||
        (
          JSON.stringify(ready.source.extensionsRequired) ===
            JSON.stringify(manifest.expected.extensionsRequired) &&
          JSON.stringify(ready.source.extensionsUsed) ===
            JSON.stringify(manifest.expected.extensionsUsed)
        ),
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
      boundedAppearanceOmissions:
        !productScale ||
        (
          ready.source.appearance === undefined &&
          JSON.stringify(ready.source.appearanceOmissions) ===
            JSON.stringify(manifest.expected.appearanceOmissions)
        ),
      pathFreeHostBridge: true,
      editorCloseObserved: disposed.status === "disposed",
      publicViewerCoreProductEntrypoint:
        viewerCoreQualified(ready, disposed),
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
  assert.equal(
    ready.gpu?.schema,
    "bim-explorer-webgl2-gpu-identity/1",
  );
  assert.equal(ready.gpu.webgl2, true);
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
    "bimExplorer.closeModel",
  );
  const disposed = await waitFor(() => {
    const report = api.qualificationReports().at(-1);
    return report?.status === "disposed" ? report : null;
  }, `${format.toUpperCase()} Custom Editor disposal`);
  await vscode.commands.executeCommand(
    "workbench.action.closeActiveEditor",
  );
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
      gpu: ready.gpu,
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

function translation(x) {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, 0, 0, 1,
  ];
}

async function qualifyFederatedSurface({ api, root, temporary }) {
  const generatedIfc = await import(
    pathToFileURL(
      path.join(root, "scripts", "generate-synthetic-ifc.mjs"),
    ).href
  );
  const generatedGltf = await import(
    pathToFileURL(
      path.join(root, "scripts", "generate-synthetic-gltf.mjs"),
    ).href
  );
  const files = {
    manifest: path.join(
      temporary,
      "qualification-federation.bimfed.json",
    ),
    reference: path.join(
      temporary,
      "qualification-reference.glb",
    ),
    semantic: path.join(
      temporary,
      "qualification-semantic.ifc",
    ),
    overlay: path.join(
      temporary,
      "qualification-overlay.glb",
    ),
  };
  await Promise.all([
    writeFile(
      files.reference,
      generatedGltf.syntheticGlbBytes({ secondNodeX: 3 }),
    ),
    writeFile(
      files.semantic,
      generatedIfc.syntheticMappedIfc(),
      "utf8",
    ),
    writeFile(
      files.overlay,
      generatedGltf.syntheticGlbBytes({ secondNodeX: 6 }),
    ),
  ]);
  const manifest = {
    schema: "bim-explorer-federation-document/0.1",
    federationId: "federation:vscode-surface-v0.2",
    sources: [
      {
        federationSourceId: "source-slot:a-reference",
        sourceRole: "geometric-reference",
        file: path.basename(files.reference),
        sourceToFederation: translation(-8),
        reference: "vscode:reference-placement",
        discipline: "external-reference",
        owner: "external-source",
      },
      {
        federationSourceId: "source-slot:m-semantic",
        sourceRole: "semantic-base",
        file: path.basename(files.semantic),
        sourceToFederation: translation(0),
        reference: "vscode:semantic-placement",
        discipline: "architecture",
        owner: "external-source",
      },
      {
        federationSourceId: "source-slot:z-overlay",
        sourceRole: "consumer-overlay",
        file: path.basename(files.overlay),
        sourceToFederation: translation(8),
        reference: "vscode:overlay-placement",
        discipline: "consumer-overlay",
        owner: "consumer-source",
      },
    ],
  };
  await writeFile(
    files.manifest,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  await vscode.commands.executeCommand(
    "vscode.openWith",
    vscode.Uri.file(files.manifest),
    "bimExplorer.federationEditor",
  );
  const ready = await waitFor(() => {
    const report = api.qualificationReports().at(-1);
    if (report?.status === "failed") {
      throw new Error(
        `Federated Surface failed: ${JSON.stringify(report)}`,
      );
    }
    return report?.schema ===
        "bim-explorer-federated-vscode-surface-report/1" &&
      report.status === "ready"
      ? report
      : null;
  }, "Federated Surface ready report", 120_000);
  assert.equal(ready.hostKind, "vscode-webview");
  assert.equal(ready.externalUpload, false);
  assert.equal(ready.telemetry, false);
  assert.equal(ready.contract, "bim-explorer-bim-surface/0.2");
  assert.deepEqual(ready.composition.formats, ["glb", "ifc", "glb"]);
  assert.deepEqual(ready.composition.sourceRoles, [
    "geometric-reference",
    "semantic-base",
    "consumer-overlay",
  ]);
  assert.deepEqual(
    ready.composition.semanticAvailability,
    [false, true, false],
  );
  assert.equal(ready.composition.sourceCount, 3);
  assert.equal(ready.composition.identityMerged, false);
  assert.equal(ready.semantics.returned, 2);
  assert.equal(ready.semantics.referenceSemanticsRejected, true);
  assert.equal(ready.renderer.actualGpu, true);
  assert.equal(ready.renderer.context, "webgl2");
  assert.ok(ready.renderer.nonBackgroundPixels > 0);
  assert.equal(
    ready.gpu.schema,
    "bim-explorer-webgl2-gpu-identity/1",
  );
  assert.equal(ready.gpu.webgl2, true);
  assert.equal(typeof ready.gpu.renderer, "string");
  assert.equal(typeof ready.gpu.vendor, "string");
  assert.equal(
    await vscode.commands.executeCommand(
      "bimExplorer.verifyFederatedAnchors",
    ),
    true,
  );
  const qualified = await waitFor(() => {
    const report = api.qualificationReports().at(-1);
    if (report?.status === "failed") {
      throw new Error(
        `Federated anchor verification failed: ` +
          `${JSON.stringify(report)}`,
      );
    }
    return report?.status === "qualified" ? report : null;
  }, "Federated Surface anchor report", 120_000);
  assert.equal(qualified.selection.items, 3);
  assert.equal(qualified.selection.distinctKeys, 3);
  assert.equal(qualified.selection.mergeAcrossSources, false);
  assert.equal(qualified.renderer.surfaceHits, 3);
  assert.equal(qualified.renderer.retainedGeometryBytes, 0);
  assert.equal(qualified.picks.length, 3);
  assert.equal(qualified.anchors.length, 3);
  for (const pick of qualified.picks) {
    assert.equal(
      pick.surfaceHitCapability,
      "source-local-surface-hit",
    );
    assert.equal(pick.coordinateSpace, "projection-local");
    assert.equal(pick.locator.kind, "triangle-barycentric");
    assert.equal(pick.verification.actualGpuDepth, true);
    assert.equal(pick.verification.exactGeometryDigest, true);
    assert.equal(pick.verification.nearestUniqueTriangle, true);
    assert.equal(pick.resources.retainedGeometryBytes, 0);
    assert.equal(pick.resources.temporaryGeometryReleased, true);
    assert.equal(Object.values(pick.authority).some(Boolean), false);
  }
  for (const anchor of qualified.anchors) {
    assert.equal(anchor.stability, "derived");
    assert.equal(anchor.locator.kind, "triangle-barycentric");
    assert.equal(Object.values(anchor.authority).some(Boolean), false);
  }
  assert.equal(
    qualified.ranges.sources.every((source) => source.reads === 1),
    true,
  );
  assert.equal(
    qualified.ranges.unchangedBySurfaceResolution,
    true,
  );
  assert.equal(Object.values(qualified.authority).some(Boolean), false);
  const serialized = JSON.stringify(qualified);
  for (const file of Object.values(files)) {
    assert.equal(serialized.includes(file), false);
    assert.equal(serialized.includes(path.basename(file)), false);
  }
  assert.equal(
    await vscode.commands.executeCommand(
      "bimExplorer.disposeFederatedSurface",
    ),
    true,
  );
  const disposed = await waitFor(() => {
    const report = api.qualificationReports().at(-1);
    if (report?.status === "failed") {
      throw new Error(
        `Federated Surface cleanup failed: ${JSON.stringify(report)}`,
      );
    }
    return report?.status === "disposed" ? report : null;
  }, "Federated Surface cleanup report", 120_000);
  assert.deepEqual(disposed.cleanup, {
    surfaceStatus: "disposed",
    rendererDisposed: true,
    backendDisposed: true,
    backendActiveBytes: 0,
    backendResidentRanges: 0,
    retainedGeometryBytes: 0,
    projectionCachesReleased: true,
    transferredSessionsReleased: true,
    sourceSessionsDisposed: true,
    workersTerminated: true,
    clientsDisposed: true,
    runtimeUrlsRevoked: true,
    repeatedDispose: false,
  });
  await vscode.commands.executeCommand(
    "workbench.action.closeActiveEditor",
  );
  const closed = await waitFor(() => {
    const report = api.qualificationReports().at(-1);
    return report?.status === "disposed" &&
      report.editorClosed === true
      ? report
      : null;
  }, "Federated Surface editor close");
  return {
    fixture: {
      id: "generated-ifc-glb-glb-vscode-surface-v0.2",
      committed: false,
      releaseBundled: false,
      sourceCount: 3,
      formats: ["glb", "ifc", "glb"],
    },
    observation: {
      hostKind: ready.hostKind,
      externalUpload: ready.externalUpload,
      telemetry: ready.telemetry,
      ready: {
        composition: ready.composition,
        gpu: ready.gpu,
        semantics: ready.semantics,
        renderer: ready.renderer,
      },
      qualified: {
        selection: qualified.selection,
        renderer: qualified.renderer,
        picks: qualified.picks,
        anchors: qualified.anchors,
        ranges: qualified.ranges,
        authority: qualified.authority,
      },
      cleanup: disposed.cleanup,
      lifecycle: {
        opened: ready.status,
        anchors: qualified.status,
        disposed: disposed.status,
        editorClosed: closed.editorClosed,
      },
    },
    assertions: {
      actualVscodeFederatedSurface: true,
      threeSourceCompositionExact: true,
      sourceScopedSemanticsAndIdentity: true,
      actualVscodeChromiumWebGl2: true,
      exactSourceLocalHits: true,
      derivedAnchorsCurrent: true,
      rangeReplayBounded: true,
      noWorkspaceOrMutationAuthority: true,
      pathFreeHostBridge: true,
      transferredResourcesReleased: true,
      editorCloseObserved: true,
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
  const externalReferenceSourcePath =
    process.env.BIM_EXPLORER_VSCODE_GLTF_EXTERNAL_SOURCE;
  const externalReferenceManifestPath =
    process.env.BIM_EXPLORER_VSCODE_GLTF_EXTERNAL_MANIFEST;
  const embeddedTextureReferenceSourcePath =
    process.env
      .BIM_EXPLORER_VSCODE_GLTF_EMBEDDED_TEXTURE_SOURCE;
  const embeddedTextureReferenceManifestPath =
    process.env
      .BIM_EXPLORER_VSCODE_GLTF_EMBEDDED_TEXTURE_MANIFEST;
  const quantizedReferenceSourcePath =
    process.env.BIM_EXPLORER_VSCODE_GLTF_QUANTIZED_SOURCE;
  const meshoptReferenceSourcePath =
    process.env.BIM_EXPLORER_VSCODE_GLTF_MESHOPT_SOURCE;
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
  const includeFederatedSurface =
    process.env.BIM_EXPLORER_VSCODE_FEDERATED_SURFACE === "true";
  const rendererMode =
    process.env.BIM_EXPLORER_VSCODE_RENDERER_MODE ?? "swiftshader";
  assert.ok(["physical", "swiftshader"].includes(rendererMode));
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
      "bimExplorer.closeModel",
      "bimExplorer.retry",
      "bimExplorer.showDiagnostics",
      "bimExplorer.pickVisiblePoint",
      "bimExplorer.refinePointLod",
      "bimExplorer.openFederation",
      "bimExplorer.verifyFederatedAnchors",
      "bimExplorer.disposeFederatedSurface",
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
      "bimExplorer.closeModel",
    );
    const disposed = await waitFor(() => {
      const report = api.qualificationReports().at(-1);
      return report?.status === "disposed" ? report : null;
    }, "Custom Editor disposal");
    await vscode.commands.executeCommand(
      "workbench.action.closeActiveEditor",
    );
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
        "bimExplorer.closeModel",
      );
      const publicDisposed = await waitFor(() => {
        const report = api.qualificationReports().at(-1);
        return report?.status === "disposed" ? report : null;
      }, "public Custom Editor disposal");
      await vscode.commands.executeCommand(
        "workbench.action.closeActiveEditor",
      );
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
          viewerCore: {
            opened: publicReady.viewerCore,
            disposed: publicDisposed.viewerCore,
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
          publicViewerCoreProductEntrypoint:
            viewerCoreQualified(
              publicReady,
              publicDisposed,
            ),
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
          referenceViewerCoreProductEntrypoint:
            qualified.assertions
              .publicViewerCoreProductEntrypoint,
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
          productScaleReferenceAppearanceOmissionsExact:
            qualified.assertions.boundedAppearanceOmissions,
          productScaleReferencePathFreeBridge:
            qualified.assertions.pathFreeHostBridge,
          productScaleReferenceEditorCloseObserved:
            qualified.assertions.editorCloseObserved,
          productScaleReferenceViewerCoreProductEntrypoint:
            qualified.assertions
              .publicViewerCoreProductEntrypoint,
        },
      };
    }
    let externalReferenceQualification = null;
    if (
      typeof externalReferenceSourcePath === "string" &&
      externalReferenceSourcePath.length > 0
    ) {
      const qualified = await qualifyReference({
        api,
        manifestPath: externalReferenceManifestPath,
        resourceBundle: true,
        root,
        sourcePath: externalReferenceSourcePath,
      });
      externalReferenceQualification = {
        fixture: qualified.fixture,
        observation: qualified.observation,
        assertions: {
          localExternalReferenceSourceOpened:
            qualified.assertions.localSourceOpened,
          externalReferenceIdentityExact:
            qualified.assertions.sourceIdentityExact,
          externalReferenceHasNoBimAuthority:
            qualified.assertions.noBimSemanticAuthority,
          externalReferenceVscodeWebGl2:
            qualified.assertions.vscodeChromiumWebGl2,
          externalReferenceBundleExact:
            qualified.assertions.exactLocalResourceBundle,
          externalReferencePathFreeBridge:
            qualified.assertions.pathFreeHostBridge,
          externalReferenceEditorCloseObserved:
            qualified.assertions.editorCloseObserved,
          externalReferenceViewerCoreProductEntrypoint:
            qualified.assertions
              .publicViewerCoreProductEntrypoint,
        },
      };
    }
    let embeddedTextureReferenceQualification = null;
    if (
      typeof embeddedTextureReferenceSourcePath === "string" &&
      embeddedTextureReferenceSourcePath.length > 0
    ) {
      const qualified = await qualifyReference({
        api,
        embeddedTexture: true,
        manifestPath: embeddedTextureReferenceManifestPath,
        root,
        sourcePath: embeddedTextureReferenceSourcePath,
      });
      embeddedTextureReferenceQualification = {
        fixture: qualified.fixture,
        observation: qualified.observation,
        assertions: {
          localEmbeddedTextureReferenceOpened:
            qualified.assertions.localSourceOpened,
          embeddedTextureReferenceIdentityExact:
            qualified.assertions.sourceIdentityExact,
          embeddedTextureReferenceHasNoBimAuthority:
            qualified.assertions.noBimSemanticAuthority,
          embeddedTextureReferenceVscodeWebGl2:
            qualified.assertions.vscodeChromiumWebGl2,
          embeddedTextureReferenceBundleExact:
            qualified.assertions.exactLocalResourceBundle,
          embeddedTextureReferencePathFreeBridge:
            qualified.assertions.pathFreeHostBridge,
          embeddedTextureReferenceEditorCloseObserved:
            qualified.assertions.editorCloseObserved,
          embeddedTextureReferenceViewerCoreProductEntrypoint:
            qualified.assertions
              .publicViewerCoreProductEntrypoint,
        },
      };
    }
    let quantizedReferenceQualification = null;
    if (
      typeof quantizedReferenceSourcePath === "string" &&
      quantizedReferenceSourcePath.length > 0
    ) {
      const qualified = await qualifyReference({
        api,
        quantized: true,
        root,
        sourcePath: quantizedReferenceSourcePath,
      });
      quantizedReferenceQualification = {
        fixture: qualified.fixture,
        observation: qualified.observation,
        assertions: {
          localQuantizedReferenceSourceOpened:
            qualified.assertions.localSourceOpened,
          quantizedReferenceIdentityExact:
            qualified.assertions.sourceIdentityExact,
          quantizedReferenceHasNoBimAuthority:
            qualified.assertions.noBimSemanticAuthority,
          quantizedReferenceVscodeWebGl2:
            qualified.assertions.vscodeChromiumWebGl2,
          quantizedRequiredExtensionExact:
            qualified.assertions.exactRequiredExtensions,
          quantizedReferencePathFreeBridge:
            qualified.assertions.pathFreeHostBridge,
          quantizedReferenceEditorCloseObserved:
            qualified.assertions.editorCloseObserved,
          quantizedReferenceViewerCoreProductEntrypoint:
            qualified.assertions
              .publicViewerCoreProductEntrypoint,
        },
      };
    }
    let meshoptReferenceQualification = null;
    if (
      typeof meshoptReferenceSourcePath === "string" &&
      meshoptReferenceSourcePath.length > 0
    ) {
      const qualified = await qualifyReference({
        api,
        meshopt: true,
        root,
        sourcePath: meshoptReferenceSourcePath,
      });
      meshoptReferenceQualification = {
        fixture: qualified.fixture,
        observation: qualified.observation,
        assertions: {
          localMeshoptReferenceSourceOpened:
            qualified.assertions.localSourceOpened,
          meshoptReferenceIdentityExact:
            qualified.assertions.sourceIdentityExact,
          meshoptReferenceHasNoBimAuthority:
            qualified.assertions.noBimSemanticAuthority,
          meshoptReferenceVscodeWebGl2:
            qualified.assertions.vscodeChromiumWebGl2,
          meshoptRequiredExtensionExact:
            qualified.assertions.exactRequiredExtensions,
          meshoptReferencePathFreeBridge:
            qualified.assertions.pathFreeHostBridge,
          meshoptReferenceEditorCloseObserved:
            qualified.assertions.editorCloseObserved,
          meshoptReferenceViewerCoreProductEntrypoint:
            qualified.assertions
              .publicViewerCoreProductEntrypoint,
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
    const federatedSurfaceQualification = includeFederatedSurface
      ? await qualifyFederatedSurface({ api, root, temporary })
      : null;
    const physicalGpuCandidates = [
      ready.gpu,
      publicQualification?.observation?.gpu,
      referenceQualification?.observation?.gpu,
      productScaleReferenceQualification?.observation?.gpu,
      externalReferenceQualification?.observation?.gpu,
      embeddedTextureReferenceQualification?.observation?.gpu,
      ...Object.values(pointQualifications).map(
        (value) => value.observation.gpu,
      ),
      federatedSurfaceQualification?.observation?.ready?.gpu,
    ].filter((value) => value !== null && value !== undefined);
    const physicalGpuObserved = rendererMode !== "physical" || (
      physicalGpuCandidates.length > 0 &&
      physicalGpuCandidates.every(physicalAppleMetalGpu)
    );
    assert.equal(physicalGpuObserved, true);
    const evidence = {
      schema:
        "bim-explorer-vscode-custom-editor-evidence/1",
      capturedAt: new Date().toISOString(),
      environment: {
        vscode: vscode.version,
        platform: `${process.platform}-${process.arch}`,
        extensionMode: extension.extensionMode,
        rendererMode,
        runtimeLayout,
        ...(rendererMode === "physical"
          ? { gpu: ready.gpu }
          : {}),
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
        gpu: ready.gpu,
        model: ready.model,
        performance: ready.performance,
        resources: ready.resources,
        renderer: ready.renderer,
        semantic: ready.semantic,
        viewerCore: {
          opened: ready.viewerCore,
          disposed: disposed.viewerCore,
        },
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
      ...(externalReferenceQualification === null
        ? {}
        : {
            externalReferenceFixture:
              externalReferenceQualification.fixture,
            externalReferenceObservation:
              externalReferenceQualification.observation,
            externalReferenceAssertions:
              externalReferenceQualification.assertions,
          }),
      ...(embeddedTextureReferenceQualification === null
        ? {}
        : {
            embeddedTextureReferenceFixture:
              embeddedTextureReferenceQualification.fixture,
            embeddedTextureReferenceObservation:
              embeddedTextureReferenceQualification.observation,
            embeddedTextureReferenceAssertions:
              embeddedTextureReferenceQualification.assertions,
          }),
      ...(quantizedReferenceQualification === null
        ? {}
        : {
            quantizedReferenceFixture:
              quantizedReferenceQualification.fixture,
            quantizedReferenceObservation:
              quantizedReferenceQualification.observation,
            quantizedReferenceAssertions:
              quantizedReferenceQualification.assertions,
          }),
      ...(meshoptReferenceQualification === null
        ? {}
        : {
            meshoptReferenceFixture:
              meshoptReferenceQualification.fixture,
            meshoptReferenceObservation:
              meshoptReferenceQualification.observation,
            meshoptReferenceAssertions:
              meshoptReferenceQualification.assertions,
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
      ...(federatedSurfaceQualification === null
        ? {}
        : {
            federatedSurfaceFixture:
              federatedSurfaceQualification.fixture,
            federatedSurfaceObservation:
              federatedSurfaceQualification.observation,
            federatedSurfaceAssertions:
              federatedSurfaceQualification.assertions,
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
        publicViewerCoreProductEntrypoint:
          viewerCoreQualified(ready, disposed),
        packagedRuntimeIndependent: packagedRuntime,
        spatialIndependent: true,
        ...(rendererMode === "physical"
          ? { physicalGpuObserved }
          : {}),
      },
      decision: {
        vscodeCustomEditor: "passed",
        actualPhysicalGpu: rendererMode === "physical"
          ? "passed-observed-apple-metal"
          : "not-claimed",
        publicViewerCoreConformance:
          "passed-product-entrypoint",
      },
    };
    assert.ok(
      Object.values(evidence.assertions).every(Boolean),
      `Custom Editor assertions failed: ${JSON.stringify({
        assertions: evidence.assertions,
        disposedViewerCore: disposed.viewerCore,
        readyViewerCore: ready.viewerCore,
      })}`,
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
    if (evidence.externalReferenceAssertions !== undefined) {
      assert.ok(
        Object.values(
          evidence.externalReferenceAssertions,
        ).every(Boolean),
      );
    }
    if (
      evidence.embeddedTextureReferenceAssertions !== undefined
    ) {
      assert.ok(
        Object.values(
          evidence.embeddedTextureReferenceAssertions,
        ).every(Boolean),
      );
    }
    if (evidence.quantizedReferenceAssertions !== undefined) {
      assert.ok(
        Object.values(
          evidence.quantizedReferenceAssertions,
        ).every(Boolean),
      );
    }
    if (evidence.meshoptReferenceAssertions !== undefined) {
      assert.ok(
        Object.values(
          evidence.meshoptReferenceAssertions,
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
    if (evidence.federatedSurfaceAssertions !== undefined) {
      assert.ok(
        Object.values(
          evidence.federatedSurfaceAssertions,
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
