import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createWebIfcSourceArtifact,
} from "../adapters/web-ifc/src/create-source-artifact.mjs";
import {
  BIM_SOURCE_PROTOCOL_VERSION,
  createBimModelSource,
} from "../packages/bim-model-source/src/index.mjs";
import {
  createBounded3dRenderer,
  createHeadless3dBackend,
} from "../packages/bim-renderer-3d/src/index.mjs";
import {
  BIM_FEDERATED_RENDERER_PROJECTION_SCHEMA,
  createBimFederation,
  createExplicitAlignment,
  createFederatedRendererProjection,
  createProjectedCrsAlignment,
} from "../packages/bim-federation/src/index.mjs";
import {
  createGltfReferenceSource,
} from "../packages/gltf-reference-source/src/index.mjs";
import {
  runBrowserQualification,
} from "./browser-qualification-runtime.mjs";
import {
  syntheticGeoreferencedIfc,
} from "./generate-synthetic-ifc.mjs";
import {
  acquirePublicGltfFixture,
  PUBLIC_GLTF_PRODUCT_SCALE_MANIFEST,
} from "./public-gltf-fixture.mjs";
import {
  createBimFederationBrowserProbeServer,
} from "./serve-bim-federation-browser-probe.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const EVIDENCE_PATH = path.join(
  ROOT,
  "compatibility",
  "evidence",
  "bim-federation-product-scale-2026-08-08.json",
);
const FEDERATION_ID = "federation:product-scale-composite";
const ARCHITECTURE_SLOT = "source-slot:architecture";
const REFERENCE_SLOT = "source-slot:glb-reference";
const MEP_SLOT = "source-slot:mep";
const CRS = "EPSG:32652";
const ORIGIN = Object.freeze([500000, 4100000, 100]);
const MAXIMUM_RESIDENT_SET_SIZE_BYTES = 1024 * 1024 * 1024;
const PERFORMANCE_LIMITS = Object.freeze({
  maximumSourceMs: 5_000,
  maximumProjectionMs: 1_000,
  maximumMountMs: 5_000,
});
const RENDERER_LIMITS = Object.freeze({
  maximumFirstFrameRanges: 3,
  maximumRangeBytes: 32 * 1024 * 1024,
  maximumSourceReadBytes: 32 * 1024 * 1024,
  maximumReadBytes: 1024 * 1024,
  maximumGeometryRecords: 100_000,
  maximumGeometryPayloadBytes: 24 * 1024 * 1024,
  maximumInstances: 100_000,
  maximumInstancedTriangles: 4_000_000,
  maximumDrawCalls: 100_000,
  maximumCpuStagingBytes: 32 * 1024 * 1024,
  maximumGpuCacheBytes: 32 * 1024 * 1024,
});
const EXPECTED = Object.freeze({
  sources: 3,
  entities: 53,
  firstFrameRanges: 3,
  sourceReadBytes: 16_898_404,
  sourceReads: 19,
  geometryPayloadBytes: 16_898_016,
  geometryRecords: 17,
  vertices: 417_096,
  indices: 1_721_928,
  uniqueTriangles: 573_976,
  instances: 53,
  instancedTriangles: 1_499_120,
  drawCalls: 53,
  instanceBytes: 4_240,
  cpuStagingBytes: 16_902_644,
  uploadedBytes: 16_902_256,
});

function parseArguments(values) {
  const options = { output: null, write: false };
  for (let index = 0; index < values.length; index += 1) {
    const name = values[index];
    if (name === "--write") {
      options.write = true;
      continue;
    }
    if (name === "--output") {
      const value = values[index + 1];
      if (typeof value !== "string" || value.startsWith("-")) {
        throw new TypeError("--output requires a file path");
      }
      options.output = path.resolve(value);
      index += 1;
      continue;
    }
    throw new TypeError(`unknown argument ${name}`);
  }
  if (options.write && options.output !== null) {
    throw new TypeError("--write and --output are mutually exclusive");
  }
  return options;
}

function everyTrue(value) {
  return Object.values(value).every((item) => item === true);
}

async function safeDispose(operation) {
  try {
    return await operation();
  } catch {
    return false;
  }
}

async function createIfcFixture(label, alignmentFactory) {
  const input = new TextEncoder().encode(
    syntheticGeoreferencedIfc().replace(
      "synthetic-mapped.ifc",
      `federation-product-${label}.ifc`,
    ),
  );
  let artifact;
  try {
    artifact = await createWebIfcSourceArtifact(input, {
      profile: "ReferenceView_V1.2",
    });
  } finally {
    input.fill(0);
  }
  const geometryBytes = artifact.ranges.reduce(
    (sum, range) => sum + range.bytes.byteLength,
    0,
  );
  const source = createBimModelSource(artifact, {
    sessionReadBudgetBytes: geometryBytes * 2,
  });
  const session = await source.open({
    protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
  });
  const snapshot = await session.getSnapshot();
  return {
    alignment: alignmentFactory(snapshot),
    geometryBytes,
    session,
    snapshot,
    source,
  };
}

function explicitAlignment(snapshot, sourceToFederation, reference) {
  return createExplicitAlignment({
    sourceRevisionId: snapshot.revisionId,
    sourceCoordinateSystem: snapshot.coordinateSystem.source,
    federationCoordinateSystem: CRS,
    federationOrigin: ORIGIN,
    sourceToFederation,
    reference,
  });
}

function sourceProjection(snapshot) {
  return snapshot.federation.sourceSlots.map((slot) => {
    const entities = snapshot.entities.filter((entity) =>
      entity.federationSourceId === slot.federationSourceId);
    return {
      federationSourceId: slot.federationSourceId,
      format: slot.format,
      sourceRevisionId: slot.sourceRevisionId,
      entities: entities.length,
      instances: entities.reduce(
        (sum, entity) => sum + entity.primitives.length,
        0,
      ),
    };
  });
}

function exactMetrics(actual) {
  return [
    "sourceReadBytes",
    "sourceReads",
    "geometryPayloadBytes",
    "geometryRecords",
    "vertices",
    "indices",
    "uniqueTriangles",
    "instances",
    "instancedTriangles",
    "drawCalls",
    "instanceBytes",
    "cpuStagingBytes",
  ].every((field) => actual[field] === EXPECTED[field]);
}

async function copyProjectionRanges(projection) {
  const layer = projection.snapshot.layers.find((candidate) =>
    candidate.layerId === projection.snapshot.layerId);
  const ranges = new Map();
  for (const handle of layer.rangeHandles) {
    const bytes = new Uint8Array(handle.byteLength);
    try {
      for (let offset = 0; offset < handle.byteLength;) {
        const length = Math.min(
          handle.maximumRequestBytes,
          RENDERER_LIMITS.maximumReadBytes,
          handle.byteLength - offset,
        );
        const chunk = await projection.session.readRange(
          handle,
          offset,
          length,
        );
        try {
          bytes.set(chunk, offset);
        } finally {
          chunk.fill(0);
        }
        offset += length;
      }
      ranges.set(handle.handleId, bytes);
    } catch (error) {
      bytes.fill(0);
      throw error;
    }
  }
  return ranges;
}

export async function qualifyBimFederationProductScale() {
  const acquired = await acquirePublicGltfFixture({
    manifestPath: PUBLIC_GLTF_PRODUCT_SCALE_MANIFEST,
  });
  const manifest = acquired.manifest;
  const fixtures = [];
  const ranges = new Map();
  let backend = null;
  let browserRuntime = null;
  let federation = null;
  let projection = null;
  let renderer = null;
  try {
    const sourceStarted = performance.now();
    const architecture = await createIfcFixture(
      "architecture",
      (snapshot) => createProjectedCrsAlignment({
        snapshot,
        federationCoordinateSystem: CRS,
        federationOrigin: ORIGIN,
      }),
    );
    fixtures.push(architecture);
    const mep = await createIfcFixture(
      "mep",
      (snapshot) => explicitAlignment(
        snapshot,
        [
          1, 0, 0, 0,
          0, 1, 0, 0,
          0, 0, 1, 0,
          0, 6, 0, 1,
        ],
        "qualification:generated-mep-offset",
      ),
    );
    fixtures.push(mep);
    const referenceSource = await createGltfReferenceSource(
      acquired.bytes,
      {
        maximumRequestBytes:
          manifest.browserQualification.maximumRequestBytes,
        sessionReadBudgetBytes:
          manifest.expected.geometryRangeBytes * 2,
      },
    );
    const referenceSession = await referenceSource.open({
      protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
    });
    const referenceSnapshot =
      await referenceSession.getSnapshot();
    const reference = {
      alignment: explicitAlignment(
        referenceSnapshot,
        [
          8, 0, 0, 0,
          0, 0, 8, 0,
          0, -8, 0, 0,
          8, 3, 0, 1,
        ],
        "qualification:pinned-glb-layout",
      ),
      geometryBytes: manifest.expected.geometryRangeBytes,
      session: referenceSession,
      snapshot: referenceSnapshot,
      source: referenceSource,
    };
    fixtures.push(reference);
    const sourceMs = performance.now() - sourceStarted;

    federation = createBimFederation({
      federationId: FEDERATION_ID,
      maximumSources: 3,
    });
    federation.addIfcSource({
      federationSourceId: ARCHITECTURE_SLOT,
      snapshot: architecture.snapshot,
      discipline: "architecture",
      owner: "external-document:architecture",
      alignment: architecture.alignment,
    });
    federation.addIfcSource({
      federationSourceId: MEP_SLOT,
      snapshot: mep.snapshot,
      discipline: "mep",
      owner: "external-document:mep",
      alignment: mep.alignment,
    });
    federation.addReferenceSource({
      format: "glb",
      federationSourceId: REFERENCE_SLOT,
      snapshot: reference.snapshot,
      discipline: "reference",
      owner: "external-reference:a-beautiful-game",
      alignment: reference.alignment,
    });
    const descriptor = federation.getDescriptor();

    const projectionStarted = performance.now();
    projection = await createFederatedRendererProjection({
      federationId: FEDERATION_ID,
      maximumSources: 3,
      sources: [
        {
          federationSourceId: ARCHITECTURE_SLOT,
          ...architecture,
        },
        {
          federationSourceId: MEP_SLOT,
          ...mep,
        },
        {
          federationSourceId: REFERENCE_SLOT,
          ...reference,
        },
      ],
    });
    const projectionMs = performance.now() - projectionStarted;
    const sourceSlots = sourceProjection(projection.snapshot);

    const beforeMount = process.memoryUsage();
    backend = createHeadless3dBackend();
    renderer = createBounded3dRenderer({
      backend,
      limits: RENDERER_LIMITS,
    });
    const mountStarted = performance.now();
    const mount = await renderer.mount({
      session: projection.session,
      snapshot: projection.snapshot,
    });
    const mountMs = performance.now() - mountStarted;
    const afterMount = process.memoryUsage();
    const headlessSession = projection.session.state;
    const headlessRelease = await renderer.unmount();
    const rendererDisposed = await renderer.dispose();

    const copiedRanges = await copyProjectionRanges(projection);
    for (const [rangeId, bytes] of copiedRanges) {
      ranges.set(rangeId, bytes);
    }
    const preparationSession = projection.session.state;
    const selectedPickId = projection.identityMap.find((entry) =>
      entry.federationSourceId === ARCHITECTURE_SLOT)?.pickId;
    if (selectedPickId === undefined) {
      throw new Error("federation selection target is unavailable");
    }
    const browserInput = {
      schema: "bim-explorer-federation-browser-probe-input/1",
      fixture: {
        id: manifest.fixtureId,
        byteLength: manifest.entry.byteLength,
        sha256: manifest.entry.sha256,
        license: manifest.license.spdx,
        artifactTracked: false,
        releaseBundled: false,
      },
      snapshot: structuredClone(projection.snapshot),
      qualification: {
        expected: {
          ...EXPECTED,
          sourceSlots,
        },
        rendererLimits: RENDERER_LIMITS,
        selectedPickId,
      },
    };
    browserRuntime = await runBrowserQualification({
      server: createBimFederationBrowserProbeServer({
        input: browserInput,
        ranges,
      }),
      reportExpression: `(() => {
        const report =
          globalThis.__bimFederationBrowserProbeReport;
        if (!report || report.status === "running") {
          return null;
        }
        return report;
      })()`,
      timeoutMs: manifest.browserQualification.timeoutMs,
      userDataPrefix: "bim-explorer-federation-",
    });
    if (browserRuntime.report.status !== "passed") {
      throw new Error(
        "federation Browser probe failed: " +
          (browserRuntime.report.error?.message ?? "unknown error"),
      );
    }

    for (const bytes of ranges.values()) {
      bytes.fill(0);
    }
    ranges.clear();
    const projectionDisposed = await projection.session.dispose();
    const underlyingSessionsRemainUsable = (
      await Promise.all(fixtures.map(async (fixture) =>
        (await fixture.session.getSnapshot()).revisionId ===
          fixture.snapshot.revisionId))
    ).every(Boolean);
    const federationRelease = await federation.dispose();
    const sourceStates = fixtures.map((fixture) => ({
      format: fixture.snapshot.source.format ?? "ifc",
      rangeReads: fixture.source.state.rangeReads,
      rangeBytesRead: fixture.source.state.rangeBytesRead,
      remainingReadBytes:
        fixture.source.state.remainingReadBytes,
    }));
    const sessionDisposals = await Promise.all(
      fixtures.map((fixture) => fixture.session.dispose()),
    );
    const sourceDisposals = await Promise.all(
      fixtures.map((fixture) => fixture.source.dispose()),
    );

    const duplicateGlobalIds = projection.snapshot.entities
      .filter((entity) => entity.globalId !== null)
      .reduce((counts, entity) => {
        counts.set(
          entity.globalId,
          (counts.get(entity.globalId) ?? 0) + 1,
        );
        return counts;
      }, new Map());
    const largestDuplicateGlobalIdOccurrences = Math.max(
      0,
      ...duplicateGlobalIds.values(),
    );
    const headless = {
      renderer: {
        backend: mount.backend.backendId,
        rendered: mount.backend.rendered,
        ...mount.metrics,
        uploadedBytes: mount.backend.uploadedBytes,
        limits: renderer.limits,
      },
      memory: {
        residentSetSizeBeforeMount: beforeMount.rss,
        residentSetSizeAfterMount: afterMount.rss,
        residentSetDeltaBytes: Math.max(
          0,
          afterMount.rss - beforeMount.rss,
        ),
        heapUsedAfterMount: afterMount.heapUsed,
        maximumResidentSetSizeBytes:
          process.resourceUsage().maxRSS * 1024,
        budgetBytes: MAXIMUM_RESIDENT_SET_SIZE_BYTES,
      },
      performance: {
        sourceMs,
        projectionMs,
        mountMs,
        limits: PERFORMANCE_LIMITS,
      },
      range: {
        firstFrame: headlessSession,
        afterBrowserPreparation: preparationSession,
      },
      cleanup: {
        releasedBytes: headlessRelease.releasedBytes,
        rendererDisposed,
        backendDisposed: backend.state.disposed,
        activeBackendBytes: backend.state.activeBytes,
        residentRanges: backend.state.residentRanges,
      },
    };
    const browser = {
      environment: {
        browser: browserRuntime.browserVersion,
        platform: browserRuntime.platform,
        headless: true,
        webgl2: "actual Browser API via SwiftShader",
        physicalGpuClaimed: false,
      },
      federation: browserRuntime.report.federation,
      renderer: browserRuntime.report.renderer,
      range: browserRuntime.report.range,
      cleanup: browserRuntime.report.cleanup,
      network: {
        externalOrigins: browserRuntime.externalOrigins,
        requestCount: browserRuntime.requestedUrls.length,
        runtimeErrors: browserRuntime.runtimeErrors,
      },
    };
    const assertions = {
      exactPinnedFixture:
        projection.snapshot.entities.filter((entity) =>
          entity.federationSourceId === REFERENCE_SLOT).length ===
            manifest.expected.instances &&
        reference.snapshot.source.fingerprint ===
          `sha256:${manifest.entry.sha256}` &&
        manifest.tracking.artifactTracked === false &&
        manifest.tracking.releaseBundled === false,
      simultaneousThreeSourceFrame:
        projection.schema ===
          BIM_FEDERATED_RENDERER_PROJECTION_SCHEMA &&
        projection.snapshot.geometry.sources === EXPECTED.sources &&
        projection.snapshot.geometry.entities === EXPECTED.entities &&
        projection.snapshot.loadPlan.firstFrameRangeIds.length ===
          EXPECTED.firstFrameRanges &&
        descriptor.sources.length === EXPECTED.sources,
      exactCompositeGeometry:
        exactMetrics(mount.metrics) &&
        mount.backend.uploadedBytes === EXPECTED.uploadedBytes,
      nativeIdentityIsolation:
        projection.snapshot.federation.sourceIdentityMerged === false &&
        projection.identityMap.length === EXPECTED.entities &&
        new Set(projection.identityMap.map((entry) =>
          entry.compositeNativeId)).size === EXPECTED.entities &&
        largestDuplicateGlobalIdOccurrences === 2,
      boundedAlignment:
        descriptor.sources.every((source) =>
          source.alignment.status === "aligned" &&
          source.alignment.datumTransformation === "not-performed") &&
        descriptor.authority.datumTransformation === false &&
        descriptor.authority.spatialAuthority === false,
      aggregateMemoryBudget:
        headless.memory.maximumResidentSetSizeBytes <=
          MAXIMUM_RESIDENT_SET_SIZE_BYTES &&
        headless.renderer.cpuStagingBytes ===
          EXPECTED.cpuStagingBytes &&
        headless.renderer.uploadedBytes === EXPECTED.uploadedBytes,
      headlessPerformanceBudget:
        headless.performance.sourceMs <=
          PERFORMANCE_LIMITS.maximumSourceMs &&
        headless.performance.projectionMs <=
          PERFORMANCE_LIMITS.maximumProjectionMs &&
        headless.performance.mountMs <=
          PERFORMANCE_LIMITS.maximumMountMs,
      actualBrowserWebGl2:
        browser.renderer.backend === "webgl2" &&
        browser.renderer.actualGpu === true &&
        browser.renderer.rendered === true &&
        browser.renderer.glError === 0 &&
        browser.renderer.nonBackgroundPixels > 0 &&
        browser.renderer.selectedInstances === 1 &&
        browser.renderer.highlightedInstances === 1 &&
        browser.renderer.highlightPixels > 0 &&
        browser.renderer.uploadedBytes === EXPECTED.uploadedBytes,
      exactBrowserRangeReads:
        browser.range.clientReads === EXPECTED.sourceReads &&
        browser.range.clientBytes === EXPECTED.sourceReadBytes &&
        browser.range.serverRequests === EXPECTED.sourceReads &&
        browser.range.serverBytes === EXPECTED.sourceReadBytes,
      localOnlyRuntime:
        browser.network.externalOrigins.length === 0 &&
        browser.network.runtimeErrors.length === 0,
      deterministicCleanup:
        headless.cleanup.releasedBytes === EXPECTED.uploadedBytes &&
        headless.cleanup.rendererDisposed === true &&
        headless.cleanup.backendDisposed === true &&
        headless.cleanup.activeBackendBytes === 0 &&
        headless.cleanup.residentRanges === 0 &&
        browser.cleanup.releasedBytes === EXPECTED.uploadedBytes &&
        browser.cleanup.rendererDisposed === true &&
        browser.cleanup.sessionDisposed === true &&
        browser.cleanup.backendDisposed === true &&
        browser.cleanup.activeBackendBytes === 0 &&
        browser.cleanup.residentRanges === 0 &&
        projectionDisposed === true &&
        underlyingSessionsRemainUsable === true &&
        federationRelease.releasedSources === EXPECTED.sources &&
        federationRelease.disposed === true &&
        sessionDisposals.every((disposed) => disposed === true) &&
        sourceDisposals.every((disposed) => disposed === true) &&
        sourceStates.every((state) =>
          state.remainingReadBytes === 0),
      authorityBoundaries:
        projection.snapshot.source.semanticAuthority === false &&
        projection.snapshot.source.writeAuthority === false &&
        projection.snapshot.source.roundTripAuthority === false &&
        browser.environment.physicalGpuClaimed === false,
      pathFreeEvidence: true,
    };
    if (!everyTrue(assertions)) {
      throw new Error(
        "product-scale federation qualification gates failed: " +
          JSON.stringify({
            assertions,
            actualMetrics: mount.metrics,
            uploadedBytes: mount.backend.uploadedBytes,
          }),
      );
    }
    const report = {
      schema:
        "bim-explorer-federation-product-scale-qualification/1",
      status: "passed-experimental",
      asOf: "2026-08-08",
      contract: {
        federation: "bim-explorer-federation/0.1",
        rendererProjection:
          BIM_FEDERATED_RENDERER_PROJECTION_SCHEMA,
        bimSourceProtocol: BIM_SOURCE_PROTOCOL_VERSION,
      },
      fixture: {
        fixtureId: manifest.fixtureId,
        repository: manifest.provenance.repository,
        commit: manifest.provenance.commit,
        path: manifest.provenance.path,
        readmeUrl: manifest.provenance.readmeUrl,
        byteLength: manifest.entry.byteLength,
        sha256: manifest.entry.sha256,
        license: manifest.license.spdx,
        attribution: manifest.license.attribution,
        artifactTracked: false,
        releaseBundled: false,
        downloadOnDemand: true,
      },
      federation: {
        federationId: FEDERATION_ID,
        sources: descriptor.sources.map((source) => ({
          federationSourceId: source.federationSourceId,
          format: source.format,
          sourceRevisionId: source.nativeDocument.revisionId,
          alignmentMethod: source.alignment.method,
          alignmentProvenance: source.alignment.provenance.kind,
          datumTransformation: source.alignment.datumTransformation,
        })),
        sourceSlots,
        sourceIdentityMerged: false,
        entities: projection.snapshot.geometry.entities,
        instances: projection.snapshot.geometry.instances,
        firstFrameRanges:
          projection.snapshot.loadPlan.firstFrameRangeIds.length,
        distinctCompositeNativeIds: projection.identityMap.length,
        largestDuplicateGlobalIdOccurrences,
      },
      expected: EXPECTED,
      headless,
      browser,
      sourceCleanup: {
        projectionDisposed,
        projectionOwnsSourceSessions:
          preparationSession.ownsSourceSessions,
        underlyingSessionsRemainUsable,
        federationReleasedSources: federationRelease.releasedSources,
        federationDisposed: federationRelease.disposed,
        sourceStates,
        sessionsDisposed: sessionDisposals.length,
        sourcesDisposed: sourceDisposals.length,
      },
      assertions,
      decision: {
        productScaleFederationPerformance: "passed-experimental",
        simultaneousMultiSourceFrame:
          "passed-two-generated-ifc-and-product-scale-glb",
        browserWebGl2: "passed-swiftshader",
        physicalGpu: "not-claimed",
        surveyedDatumTransformation: "not-claimed",
        actualSpatialConsumer: "not-qualified-by-this-evidence",
        actualMultiFormatUserDemand:
          "not-qualified-by-this-evidence",
        write: false,
        roundTrip: false,
        productionClaims: false,
      },
      limitations: [
        "the two IFC sources are generated qualification fixtures, while A Beautiful Game is product-scale reference geometry and not a BIM semantic model",
        "explicit MEP and GLB placement is qualification input, not surveyed control-point or datum-transformation evidence",
        "SwiftShader proves the Browser WebGL2 API path and makes no physical GPU claim",
        "this evidence does not establish actual Coni Spatial consumer conformance or user demand",
        "the public GLB is fetched into a private cache and is not tracked or release-bundled",
        "native mutation, write, round-trip and production federation claims remain blocked",
      ],
    };
    const serialized = JSON.stringify(report);
    if (
      serialized.includes("/Users/") ||
      serialized.includes("/Volumes/") ||
      serialized.includes("\\\\")
    ) {
      throw new Error(
        "product-scale federation evidence contains a local path",
      );
    }
    return Object.freeze(report);
  } finally {
    for (const bytes of ranges.values()) {
      bytes.fill(0);
    }
    ranges.clear();
    if (renderer?.state.disposed === false) {
      await safeDispose(() => renderer.dispose());
    }
    if (projection?.session.state.disposed === false) {
      await safeDispose(() => projection.session.dispose());
    }
    if (federation?.state.disposed === false) {
      await safeDispose(() => federation.dispose());
    }
    for (const fixture of fixtures) {
      await safeDispose(() => fixture.session.dispose());
      if (fixture.source.state.disposed !== true) {
        await safeDispose(() => fixture.source.dispose());
      }
    }
    acquired.bytes.fill(0);
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const options = parseArguments(process.argv.slice(2));
  const report = await qualifyBimFederationProductScale();
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  const output = options.write ? EVIDENCE_PATH : options.output;
  if (output === null) {
    process.stdout.write(serialized);
  } else {
    await writeFile(output, serialized, "utf8");
    console.log(`Wrote ${path.relative(ROOT, output)}`);
  }
}
