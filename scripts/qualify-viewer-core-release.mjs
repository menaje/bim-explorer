import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  readFile,
  readdir,
} from "node:fs/promises";
import path from "node:path";
import {
  fileURLToPath,
  pathToFileURL,
} from "node:url";

import {
  ViewerCoreApi,
  ViewerCoreVersion,
  openViewerRuntime,
} from "@menaje/viewer-core";
import {
  runRenderDeltaConformance,
  runRenderSourceConformance,
} from "@menaje/viewer-core/conformance";
import {
  RenderProtocolDiagnosticCode,
  RenderProtocolId,
  RenderProtocolVersion,
} from "@menaje/viewer-render-protocol";

import {
  createWebIfcSourceArtifact,
} from "../adapters/web-ifc/src/create-source-artifact.mjs";
import {
  Bounded3dRenderer,
  Headless3dBackend,
} from "../packages/bim-renderer-3d/src/index.mjs";
import {
  BimMockRenderSource,
  MockViewerHost,
  createBimMockRenderDeltaHarness,
  createViewerCoreBimRendererMount,
  createViewerCoreBimRenderSource,
} from "../packages/viewer-core-consumer/src/index.mjs";
import {
  syntheticMappedIfc,
} from "./generate-synthetic-ifc.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const SOURCE_SHA256 =
  "400071d0a99f14ef37c46560bde1651965a378e0586b5f470be3fda81e585243";
const LICENSE_SHA256 =
  "3f3d9e0024b1921b067d6f7f88deb4a60cbe7a78e76c64e3f1d7fc3b779b9d04";
const RELEASE = Object.freeze({
  repository: "menaje/dwg-viewer",
  tag: "viewer-core-v0.1.2",
  tagCommit: "e225c2c8531e1f5e9677238d85adf6f686203026",
  releaseUrl:
    "https://github.com/menaje/dwg-viewer/releases/tag/" +
    "viewer-core-v0.1.2",
  publishedAt: "2026-08-04T04:36:50Z",
  releaseStage: "prerelease",
});
const PACKAGE_DEFINITIONS = Object.freeze([
  Object.freeze({
    key: "viewerCore",
    package: "@menaje/viewer-core",
    version: "0.1.2",
    file: "menaje-viewer-core-0.1.2.tgz",
    url:
      "https://github.com/menaje/dwg-viewer/releases/download/" +
      "viewer-core-v0.1.2/menaje-viewer-core-0.1.2.tgz",
    sha256:
      "69bedf751ef718eb8e37bb06718d5a956f33f567225bf64468d25e42c5a82c4c",
    bytes: 49_537,
    contentSha256:
      "fd46b69f95a831c518be2ccff5f08d2d0170b5a79f18cfcdfc6c198f78b8af19",
    entries: 31,
    integrity:
      "sha512-REN+i3+b894/pzhjOhT7Al0TXCrzgteBCqrHlmYdrcSI4E6HFA3dGg8x" +
      "XX21Vj//VNgjr3xUDdMqd3USX9Vl7A==",
  }),
  Object.freeze({
    key: "renderProtocol",
    package: "@menaje/viewer-render-protocol",
    version: "0.1.2",
    file: "menaje-viewer-render-protocol-0.1.2.tgz",
    url:
      "https://github.com/menaje/dwg-viewer/releases/download/" +
      "viewer-core-v0.1.2/menaje-viewer-render-protocol-0.1.2.tgz",
    sha256:
      "6534ec7d021e06d3ea616ae15fb995ece57a7c3292fc37e892a28db8e2a91d42",
    bytes: 16_424,
    contentSha256:
      "6b02978d161a61f4ed8b3453b941c13a2c6a7f2f58bb8477e980a0ab34e0d1d2",
    entries: 10,
    integrity:
      "sha512-Vf73Tyd+q0vmlHvsEtXizF3C6Y0nKyxR8jT32yUO2/hUaeUmDYGxObwj" +
      "3D9ETt8eobKoL8t19zaIH8fIUtx0jA==",
  }),
]);

async function filesBelow(directory) {
  const files = [];
  for (const entry of await readdir(directory, {
    withFileTypes: true,
  })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await filesBelow(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    } else {
      throw new Error("installed Viewer package contains a non-file entry");
    }
  }
  return files.sort();
}

async function packageContentSha256(packageRoot) {
  const files = await filesBelow(packageRoot);
  const digest = createHash("sha256");
  for (const file of files) {
    const relativePath = path
      .relative(packageRoot, file)
      .split(path.sep)
      .join("/");
    const bytes = await readFile(file);
    digest.update(relativePath);
    digest.update("\0");
    digest.update(String(bytes.byteLength));
    digest.update("\0");
    digest.update(bytes);
    digest.update("\0");
  }
  return Object.freeze({
    entries: files.length,
    sha256: digest.digest("hex"),
  });
}

async function qualifyInstalledPackage(definition, lock) {
  const packageRoot = path.join(
    repositoryRoot,
    "node_modules",
    ...definition.package.split("/"),
  );
  const packageManifest = JSON.parse(
    await readFile(
      path.join(packageRoot, "package.json"),
      "utf8",
    ),
  );
  const lockEntry =
    lock.packages[`node_modules/${definition.package}`];
  assert.equal(packageManifest.name, definition.package);
  assert.equal(packageManifest.version, definition.version);
  assert.equal(packageManifest.private, false);
  assert.equal(packageManifest.license, "MPL-2.0");
  assert.equal(lockEntry.version, definition.version);
  assert.equal(lockEntry.resolved, definition.url);
  assert.equal(lockEntry.integrity, definition.integrity);
  assert.equal(lockEntry.license, "MPL-2.0");

  const [content, license] = await Promise.all([
    packageContentSha256(packageRoot),
    readFile(path.join(packageRoot, "LICENSE")),
  ]);
  assert.equal(content.entries, definition.entries);
  assert.equal(content.sha256, definition.contentSha256);
  assert.equal(
    createHash("sha256").update(license).digest("hex"),
    LICENSE_SHA256,
  );

  return Object.freeze({
    package: definition.package,
    version: definition.version,
    public: packageManifest.private === false,
    license: packageManifest.license,
    licenseSha256: LICENSE_SHA256,
    releaseAsset: Object.freeze({
      file: definition.file,
      url: definition.url,
      publishedSha256: definition.sha256,
      publishedBytes: definition.bytes,
    }),
    lock: Object.freeze({
      resolved: lockEntry.resolved,
      integrity: lockEntry.integrity,
    }),
    installedContent: Object.freeze({
      entries: content.entries,
      sha256: content.sha256,
    }),
  });
}

async function createArtifact() {
  return createWebIfcSourceArtifact(
    new TextEncoder().encode(syntheticMappedIfc()),
    { profile: "ReferenceView_V1.2" },
  );
}

async function createActualSource() {
  return createViewerCoreBimRenderSource(
    await createArtifact(),
    { maximumRequestBytes: 128 },
  );
}

async function expectProtocolError(operation, code) {
  try {
    await operation();
  } catch (error) {
    assert.equal(error?.code, code);
    return Object.freeze({
      rejected: true,
      code: error.code,
    });
  }
  throw new Error(`operation did not reject with ${code}`);
}

function midpoint(bounds) {
  return bounds.min.map(
    (minimum, index) => (minimum + bounds.max[index]) / 2,
  );
}

async function qualifyRuntime(kind) {
  const artifact = await createArtifact();
  assert.equal(artifact.source.sha256, SOURCE_SHA256);
  const source = createViewerCoreBimRenderSource(artifact, {
    maximumRequestBytes: 128,
  });
  const host = new MockViewerHost({ kind });
  const backend = new Headless3dBackend();
  const renderer = new Bounded3dRenderer({ backend });
  const mountState = {};
  const runtime = await openViewerRuntime(source, {
    host,
    mount: createViewerCoreBimRendererMount({
      renderer,
      source,
      state: mountState,
    }),
  });
  const internalSnapshot = source.rendererSnapshot(runtime.snapshot);
  const entity = internalSnapshot.entities.find(
    (candidate) => candidate.expressId === 40,
  );
  const layer = runtime.snapshot.layers[0];
  assert.ok(entity);
  const request = Object.freeze({
    protocolVersion: runtime.descriptor.protocolVersion,
    sessionId: runtime.descriptor.sessionId,
    sourceId: layer.sourceId,
    revisionId: runtime.snapshot.revisionId,
    snapshotId: runtime.snapshot.snapshotId,
    layerId: layer.layerId,
    renderId: entity.renderId,
    pickId: entity.pickId,
    worldPosition: midpoint(entity.bounds),
    worldBounds: entity.bounds,
  });
  const identity = await runtime.sourceSession.resolvePick(request);
  assert.equal(
    identity.externalIdentityToken,
    entity.externalIdentityToken,
  );
  runtime.handleEvent(Object.freeze({
    type: "selection.changed",
    revisionId: identity.revisionId,
    renderId: identity.renderId,
    externalIdentityToken: identity.externalIdentityToken,
  }));
  const stalePick = await expectProtocolError(
    () => runtime.sourceSession.resolvePick({
      ...request,
      revisionId: `source-snapshot:sha256:${"f".repeat(64)}`,
    }),
    RenderProtocolDiagnosticCode.STALE_REVISION,
  );

  const receipt = mountState.receipt;
  assert.equal(receipt.status, "mounted");
  assert.deepEqual(receipt.rangeIds, [
    "range:ifc:geometry:0",
  ]);
  assert.deepEqual(receipt.metrics, {
    sourceReadBytes: 996,
    sourceReads: 8,
    geometryPayloadBytes: 960,
    geometryRecords: 1,
    vertices: 34,
    indices: 36,
    uniqueTriangles: 12,
    instances: 2,
    instancedTriangles: 24,
    drawCalls: 2,
    instanceBytes: 160,
    cpuStagingBytes: 1156,
  });
  assert.equal(receipt.backend.backendId, "headless");
  assert.equal(receipt.backend.uploadedBytes, 1120);
  assert.equal(renderer.state.activeBackendBytes, 1120);
  assert.equal(backend.state.activeBytes, 1120);

  const firstDisposal = runtime.dispose();
  const repeatedDisposal = runtime.dispose();
  assert.equal(firstDisposal, repeatedDisposal);
  await firstDisposal;
  assert.equal(runtime.disposed, true);
  assert.equal(host.disposed, true);
  assert.equal(host.events.length, 1);
  assert.equal(renderer.state.disposed, true);
  assert.equal(renderer.state.unmounts, 1);
  assert.equal(renderer.state.activeBackendBytes, 0);
  assert.equal(backend.state.disposed, true);
  assert.equal(backend.state.unmounts, 1);
  assert.equal(backend.state.activeBytes, 0);
  assert.equal(source.state.disposed, true);
  assert.equal(source.state.sessionDisposed, true);
  assert.equal(await source.dispose(), false);

  return Object.freeze({
    host: kind,
    protocolVersion: runtime.descriptor.protocolVersion,
    representation: layer.representation,
    source: Object.freeze({
      sha256: artifact.source.sha256,
      ifcSchema: artifact.source.ifcSchema,
      profile: artifact.source.profile,
      sourceBytes: artifact.source.byteLength,
      geometryRangeBytes: layer.rangeHandle.byteLength,
    }),
    renderer: Object.freeze({
      backend: receipt.backend.backendId,
      actualGpu: false,
      rangeIds: receipt.rangeIds,
      geometryRecords: receipt.metrics.geometryRecords,
      instances: receipt.metrics.instances,
      instancedTriangles: receipt.metrics.instancedTriangles,
      drawCalls: receipt.metrics.drawCalls,
      uploadedBytes: receipt.backend.uploadedBytes,
    }),
    identity: Object.freeze({
      expressId: entity.expressId,
      renderId: identity.renderId,
      pickId: identity.pickId,
      externalIdentityToken: identity.externalIdentityToken,
    }),
    stalePick,
    hostEvents: host.events.length,
    cleanup: Object.freeze({
      runtimeDisposed: runtime.disposed,
      hostDisposed: host.disposed,
      sourceDisposed: source.state.disposed,
      sourceSessionDisposed: source.state.sessionDisposed,
      rendererDisposed: renderer.state.disposed,
      rendererUnmounts: renderer.state.unmounts,
      backendDisposed: backend.state.disposed,
      backendUnmounts: backend.state.unmounts,
      backendActiveBytes: backend.state.activeBytes,
      repeatedDisposalIdempotent:
        firstDisposal === repeatedDisposal,
    }),
  });
}

export async function qualifyViewerCoreRelease() {
  assert.equal(ViewerCoreVersion, "0.1.2");
  assert.equal(ViewerCoreApi, "menaje-viewer-core/0.1");
  assert.equal(RenderProtocolVersion, "0.1.0");
  assert.equal(
    RenderProtocolId,
    "menaje-viewer-render-protocol/0.1.0",
  );
  const lock = JSON.parse(
    await readFile(
      path.join(repositoryRoot, "package-lock.json"),
      "utf8",
    ),
  );
  const consumerDependencies =
    lock.packages["packages/viewer-core-consumer"].dependencies;
  for (const definition of PACKAGE_DEFINITIONS) {
    assert.equal(
      consumerDependencies[definition.package],
      definition.url,
    );
  }

  const installedPackages = {};
  for (const definition of PACKAGE_DEFINITIONS) {
    installedPackages[definition.key] =
      await qualifyInstalledPackage(definition, lock);
  }
  const [mockLifecycle, mockDelta, actualBimLifecycle] =
    await Promise.all([
      runRenderSourceConformance(
        () => new BimMockRenderSource(),
      ),
      runRenderDeltaConformance(
        () => createBimMockRenderDeltaHarness(),
      ),
      runRenderSourceConformance(createActualSource),
    ]);
  const hosts = [];
  for (const kind of ["browser", "vscode"]) {
    hosts.push(await qualifyRuntime(kind));
  }

  const report = {
    schema:
      "bim-explorer-viewer-core-release-qualification/1",
    status: "passed-public-preview",
    asOf: "2026-08-04",
    release: {
      ...RELEASE,
      tagPublicationApproved: true,
      automaticStablePromotion: false,
    },
    packages: installedPackages,
    identities: {
      viewerCoreApi: ViewerCoreApi,
      renderProtocol: RenderProtocolId,
      consumerPackage: "@bim-explorer/viewer-core-consumer",
      bimSourceProtocol: "bim-explorer-bim-source/0.2",
      bimRendererContract:
        "bim-explorer-bim-renderer-3d/0.1",
    },
    conformance: {
      mockLifecycle,
      mockDelta,
      actualBimLifecycle,
      actualBimRendererHosts: hosts,
      assertions: {
        immutableReleaseInstall: true,
        neutralNamespace: true,
        sourceLifecycle: true,
        boundedRangeRead: true,
        threeDimensionalRendererMount: true,
        externalIdentity: true,
        staleRevisionRejected: true,
        orderedDelta: true,
        browserHostLifecycle: true,
        vscodeHostLifecycle: true,
        deterministicDisposal: true,
        pathFreeEvidence: true,
      },
    },
    decision: {
      compatibility: "passed-public-preview",
      productionStableRelease:
        "held-upstream-prerelease",
      actualGpuQualification:
        "held-existing-product-evidence-only",
      coniSpatialConsumerQualification:
        "held-consumer-owned",
      productionClaims: false,
    },
  };
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(
    serialized,
    /\/Users\/|\/Volumes\/|[A-Z]:\\/u,
  );
  return Object.freeze(report);
}

async function main() {
  process.stdout.write(
    `${JSON.stringify(await qualifyViewerCoreRelease(), null, 2)}\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url ===
    pathToFileURL(path.resolve(process.argv[1])).href
) {
  await main();
}
