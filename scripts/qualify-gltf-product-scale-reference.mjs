import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import validator from "gltf-validator";

import {
  BIM_SOURCE_PROTOCOL_VERSION,
  createGltfReferenceSource,
} from "../packages/gltf-reference-source/src/index.mjs";
import {
  createBounded3dRenderer,
  createHeadless3dBackend,
} from "../packages/bim-renderer-3d/src/index.mjs";
import {
  acquirePublicGltfFixture,
  PUBLIC_GLTF_PRODUCT_SCALE_MANIFEST,
} from "./public-gltf-fixture.mjs";
import {
  qualifyGltfBrowserWebGl2,
} from "./qualify-gltf-browser-webgl2.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const EVIDENCE_PATH = path.join(
  ROOT,
  "compatibility",
  "evidence",
  "gltf-reference-source-a-beautiful-game-product-scale-2026-08-08.json",
);
const VALIDATOR_VERSION = "2.0.0-dev.3.10";
const VALIDATOR_INTEGRITY =
  "sha512-odJ4k0tRkGXiDGn78yDBg+fBbAIvBnXxh3RwAta0emSxGtyag" +
  "FE8B4xELB1oYe3S5RD8Ci3uZAsZaascH2LAEQ==";

function parseArguments(values) {
  const options = {
    output: null,
    write: false,
  };
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

async function safeDispose(operation) {
  try {
    return await operation();
  } catch {
    return false;
  }
}

function validatorProjection(report) {
  return {
    gltfVersion: report.info.version,
    generator: report.info.generator,
    extensionsUsed: report.info.extensionsUsed ?? [],
    drawCalls: report.info.drawCallCount,
    vertices: report.info.totalVertexCount,
    triangles: report.info.totalTriangleCount,
    materials: report.info.materialCount,
    textures: report.info.hasTextures,
    skins: report.info.hasSkins,
    animations: report.info.animationCount,
  };
}

function exactProjection(actual, expected) {
  return (
    actual.gltfVersion === expected.gltfVersion &&
    actual.generator === expected.generator &&
    actual.drawCalls === expected.drawCalls &&
    actual.vertices === expected.vertices &&
    actual.triangles === expected.triangles &&
    actual.materials === expected.materials &&
    actual.textures === expected.textures &&
    actual.skins === expected.skins &&
    actual.animations === expected.animations &&
    JSON.stringify(actual.extensionsUsed) ===
      JSON.stringify(expected.extensionsUsed)
  );
}

function everyTrue(value) {
  return Object.values(value).every((item) => item === true);
}

export async function qualifyGltfProductScaleReference() {
  const lock = JSON.parse(
    await readFile(path.join(ROOT, "package-lock.json"), "utf8"),
  );
  const validatorPackage =
    lock.packages?.["node_modules/gltf-validator"];
  if (
    validatorPackage?.version !== VALIDATOR_VERSION ||
    validatorPackage.license !== "Apache-2.0" ||
    validatorPackage.integrity !== VALIDATOR_INTEGRITY ||
    validator.version() !== VALIDATOR_VERSION
  ) {
    throw new Error("official glTF Validator artifact is not exact");
  }

  const acquired = await acquirePublicGltfFixture({
    manifestPath: PUBLIC_GLTF_PRODUCT_SCALE_MANIFEST,
  });
  const manifest = acquired.manifest;
  let backend = null;
  let renderer = null;
  let session = null;
  let source = null;
  let headless;
  try {
    const validationStarted = performance.now();
    const validation = await validator.validateBytes(
      acquired.bytes,
      {
        format: "glb",
        maxIssues: 100,
        uri: manifest.entry.name,
        writeTimestamp: false,
      },
    );
    const validationMs = performance.now() - validationStarted;
    const projection = validatorProjection(validation);
    if (
      validation.issues.numErrors !== 0 ||
      validation.issues.numWarnings !== 0 ||
      validation.issues.numInfos !== 0 ||
      validation.issues.numHints !== 0 ||
      validation.issues.truncated !== false ||
      !exactProjection(projection, manifest.expected)
    ) {
      throw new Error(
        "official glTF Validator rejected the product-scale fixture",
      );
    }

    const sourceStarted = performance.now();
    source = await createGltfReferenceSource(
      acquired.bytes,
      {
        maximumRequestBytes:
          manifest.browserQualification.maximumRequestBytes,
      },
    );
    session = await source.open({
      protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
    });
    const snapshot = await session.getSnapshot();
    const sourceMs = performance.now() - sourceStarted;
    const firstEntity = snapshot.entities[0];
    const lastEntity = snapshot.entities.at(-1);
    const [resolvedFirst, resolvedLast] = await Promise.all([
      session.getEntity({
        protocolVersion: snapshot.protocolVersion,
        sessionId: snapshot.sessionId,
        sourceId: snapshot.sourceId,
        revisionId: snapshot.revisionId,
        snapshotId: snapshot.snapshotId,
        layerId: snapshot.layerId,
        nativeId: firstEntity.nativeId,
      }),
      session.getEntity({
        protocolVersion: snapshot.protocolVersion,
        sessionId: snapshot.sessionId,
        sourceId: snapshot.sourceId,
        revisionId: snapshot.revisionId,
        snapshotId: snapshot.snapshotId,
        layerId: snapshot.layerId,
        nativeId: lastEntity.nativeId,
      }),
    ]);

    backend = createHeadless3dBackend();
    renderer = createBounded3dRenderer({
      backend,
      limits:
        manifest.browserQualification.rendererLimits,
    });
    const mountStarted = performance.now();
    const mount = await renderer.mount({ session, snapshot });
    const mountMs = performance.now() - mountStarted;
    const memory = process.memoryUsage();
    const sourceState = source.state;
    const release = await renderer.unmount();
    const rendererDisposed = await renderer.dispose();
    const sessionDisposed = await session.dispose();
    const sourceDisposed = await source.dispose();
    headless = {
      validator: {
        package: "gltf-validator",
        version: VALIDATOR_VERSION,
        integrity: VALIDATOR_INTEGRITY,
        license: "Apache-2.0",
        issues: {
          errors: validation.issues.numErrors,
          warnings: validation.issues.numWarnings,
          infos: validation.issues.numInfos,
          hints: validation.issues.numHints,
          truncated: validation.issues.truncated,
        },
        projection,
      },
      source: {
        fingerprint: snapshot.source.fingerprint,
        format: snapshot.source.format,
        profile: snapshot.source.profile,
        sourceRole: snapshot.source.sourceRole,
        semanticAuthority: snapshot.source.semanticAuthority,
        writeAuthority: snapshot.source.writeAuthority,
        roundTripAuthority: snapshot.source.roundTripAuthority,
        extensionsUsed:
          snapshot.referenceMetadata.extensionsUsed,
      },
      geometry: {
        ...snapshot.geometry,
        rangeBytes:
          snapshot.layers[0].rangeHandles[0].byteLength,
      },
      identity: {
        entities: snapshot.entities.length,
        firstNativeId: firstEntity.nativeId,
        lastNativeId: lastEntity.nativeId,
        firstResolved:
          resolvedFirst.nativeId === firstEntity.nativeId,
        lastResolved:
          resolvedLast.nativeId === lastEntity.nativeId,
        allGlobalIdsNull:
          snapshot.entities.every(
            (entity) => entity.globalId === null,
          ),
      },
      renderer: {
        backend: mount.backend.backendId,
        rendered: mount.backend.rendered,
        sourceReadBytes: mount.metrics.sourceReadBytes,
        sourceReads: mount.metrics.sourceReads,
        geometryPayloadBytes:
          mount.metrics.geometryPayloadBytes,
        geometryRecords: mount.metrics.geometryRecords,
        instances: mount.metrics.instances,
        uniqueTriangles: mount.metrics.uniqueTriangles,
        instancedTriangles:
          mount.metrics.instancedTriangles,
        uploadedBytes: mount.backend.uploadedBytes,
        drawCalls: mount.metrics.drawCalls,
        limits: renderer.limits,
      },
      performance: {
        validationMs,
        sourceMs,
        mountMs,
        maximumResidentSetSizeBytes:
          process.resourceUsage().maxRSS * 1024,
        residentSetSizeAfterMount: memory.rss,
        heapUsedAfterMount: memory.heapUsed,
      },
      cleanup: {
        releasedBytes: release.releasedBytes,
        rendererDisposed,
        sessionDisposed,
        sourceDisposed,
        rangeReads: sourceState.rangeReads,
        rangeBytesRead: sourceState.rangeBytesRead,
        remainingReadBytes: sourceState.remainingReadBytes,
        backendDisposed: backend.state.disposed,
        activeBackendBytes: backend.state.activeBytes,
        residentRanges: backend.state.residentRanges,
      },
    };
  } finally {
    if (renderer?.state.disposed !== true) {
      await safeDispose(() => renderer.dispose());
    }
    if (session !== null) {
      await safeDispose(() => session.dispose());
    }
    if (source?.state.disposed !== true) {
      await safeDispose(() => source.dispose());
    }
    acquired.bytes.fill(0);
  }

  const browser = await qualifyGltfBrowserWebGl2({
    manifestPath: PUBLIC_GLTF_PRODUCT_SCALE_MANIFEST,
  });
  const expected = manifest.expected;
  const scale = manifest.scale;
  const nodeBudget = manifest.nodeQualification;
  const assertions = {
    exactPinnedFixture:
      headless.source.fingerprint ===
        `sha256:${manifest.entry.sha256}` &&
      manifest.tracking.artifactTracked === false &&
      manifest.tracking.releaseBundled === false,
    officialValidatorZeroIssues:
      Object.entries(headless.validator.issues)
        .filter(([name]) => name !== "truncated")
        .every(([, count]) => count === 0) &&
      headless.validator.issues.truncated === false,
    productScaleThresholds:
      manifest.entry.byteLength >= scale.minimumSourceBytes &&
      headless.geometry.vertices >= scale.minimumVertices &&
      headless.geometry.triangles >= scale.minimumTriangles &&
      headless.geometry.rangeBytes >=
        scale.minimumGeometryRangeBytes,
    exactBoundedProjection:
      headless.geometry.records ===
        expected.geometryRecords &&
      headless.geometry.instances === expected.instances &&
      headless.geometry.vertices === expected.vertices &&
      headless.geometry.triangles === expected.triangles &&
      JSON.stringify(headless.source.extensionsUsed) ===
        JSON.stringify(expected.extensionsUsed),
    sourceNativeIdentity:
      headless.identity.entities === expected.instances &&
      headless.identity.firstResolved === true &&
      headless.identity.lastResolved === true &&
      headless.identity.allGlobalIdsNull === true,
    referenceOnlyAuthority:
      headless.source.semanticAuthority === false &&
      headless.source.writeAuthority === false &&
      headless.source.roundTripAuthority === false,
    boundedHeadlessRenderer:
      headless.renderer.backend === "headless" &&
      headless.renderer.geometryRecords ===
        expected.geometryRecords &&
      headless.renderer.instances === expected.instances &&
      headless.renderer.uniqueTriangles === expected.triangles &&
      headless.renderer.instancedTriangles ===
        expected.instancedTriangles &&
      headless.renderer.sourceReadBytes ===
        expected.geometryRangeBytes &&
      headless.renderer.uploadedBytes ===
        browser.renderer.uploadedBytes,
    nodeBudget:
      headless.performance.sourceMs <=
        nodeBudget.maximumSourceMs &&
      headless.performance.mountMs <=
        nodeBudget.maximumMountMs &&
      headless.performance.maximumResidentSetSizeBytes <=
        nodeBudget.maximumResidentSetSizeBytes,
    actualBrowserWebGl2:
      browser.fixture.classification ===
        "product-scale-reference" &&
      browser.renderer.actualGpu === true &&
      browser.renderer.nonBackgroundPixels > 0 &&
      everyTrue(browser.assertions),
    deterministicCleanup:
      headless.cleanup.rendererDisposed === true &&
      headless.cleanup.sessionDisposed === true &&
      headless.cleanup.sourceDisposed === true &&
      headless.cleanup.remainingReadBytes === 0 &&
      headless.cleanup.activeBackendBytes === 0 &&
      browser.cleanup.rendererDisposed === true &&
      browser.cleanup.sessionDisposed === true &&
      browser.cleanup.backendDisposed === true &&
      browser.cleanup.activeBackendBytes === 0,
    localOnlyRuntime:
      browser.network.externalOrigins.length === 0 &&
      browser.network.runtimeErrors.length === 0,
    physicalGpuNotClaimed:
      browser.environment.physicalGpuClaimed === false,
    pathFreeEvidence: true,
  };
  if (!everyTrue(assertions)) {
    throw new Error(
      "product-scale glTF qualification gates failed: " +
      JSON.stringify(assertions),
    );
  }
  const report = {
    schema:
      "bim-explorer-gltf-product-scale-reference-qualification/1",
    status: "passed-experimental",
    asOf: "2026-08-08",
    contract: "bim-explorer-gltf-reference-source/0.1",
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
    scale,
    headless,
    browser,
    assertions,
    decision: {
      productScaleReferenceGeometry: "passed-experimental",
      browserWebGl2: "passed-swiftshader",
      browserProductFileOpen: "held-separate-product-gate",
      vscodeProductFileOpen: "held-separate-product-gate",
      physicalGpu: "not-claimed",
      bimSemanticAuthority: false,
      write: false,
      roundTrip: false,
      productionClaims: false,
    },
    limitations: [
      "A Beautiful Game is product-scale reference geometry, not a BIM semantic model",
      "embedded textures and material extensions are not projected by the bounded geometry profile",
      "the actual Browser path uses SwiftShader and makes no physical GPU claim",
      "Browser and VS Code product file-open remain separate qualification gates",
      "the fixture is fetched into a private cache and is not tracked or release-bundled",
    ],
  };
  const serialized = JSON.stringify(report);
  if (
    serialized.includes("/Users/") ||
    serialized.includes("/Volumes/") ||
    serialized.includes("\\\\")
  ) {
    throw new Error(
      "product-scale glTF evidence contains a local path",
    );
  }
  return Object.freeze(report);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const options = parseArguments(process.argv.slice(2));
  const report = await qualifyGltfProductScaleReference();
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  const output = options.write
    ? EVIDENCE_PATH
    : options.output;
  if (output === null) {
    process.stdout.write(serialized);
  } else {
    await writeFile(output, serialized, "utf8");
    console.log(`Wrote ${path.relative(ROOT, output)}`);
  }
}
