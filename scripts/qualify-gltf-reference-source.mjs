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
} from "./public-gltf-fixture.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const VALIDATOR_VERSION = "2.0.0-dev.3.10";
const VALIDATOR_INTEGRITY =
  "sha512-odJ4k0tRkGXiDGn78yDBg+fBbAIvBnXxh3RwAta0emSxGtyag" +
  "FE8B4xELB1oYe3S5RD8Ci3uZAsZaascH2LAEQ==";

function outputArgument(argumentsValue) {
  const index = argumentsValue.indexOf("--out");
  if (index === -1) {
    return null;
  }
  if (
    index + 1 >= argumentsValue.length ||
    argumentsValue[index + 1].startsWith("-")
  ) {
    throw new TypeError("--out requires a path");
  }
  return path.resolve(argumentsValue[index + 1]);
}

function assertQualification(report) {
  const expectedAssertions = [
    "officialValidatorZeroIssues",
    "exactValidatorArtifact",
    "publicFixtureDigestVerified",
    "boundedRangeReads",
    "geometryPrimitiveConformance",
    "sourceNativeIdentity",
    "noInventedIfcGlobalId",
    "referenceOnlyAuthority",
    "headlessRendererMount",
    "deterministicCleanup",
    "artifactNotTrackedOrBundled",
    "pathFreeEvidence",
  ];
  if (
    report.schema !==
      "bim-explorer-gltf-reference-source-qualification/1" ||
    report.fixture.sha256 !==
      "ed52f7192b8311d700ac0ce80644e385" +
      "2cd01537e4d62241b9acba023da3d54e" ||
    report.validator.version !== VALIDATOR_VERSION ||
    report.validator.integrity !== VALIDATOR_INTEGRITY ||
    report.validator.issues.errors !== 0 ||
    report.validator.issues.warnings !== 0 ||
    report.validator.issues.infos !== 0 ||
    report.validator.issues.hints !== 0 ||
    report.source.format !== "glb" ||
    report.source.semanticAuthority !== false ||
    report.source.writeAuthority !== false ||
    report.source.roundTripAuthority !== false ||
    report.geometry.records !== 1 ||
    report.geometry.instances !== 1 ||
    report.geometry.vertices !== 24 ||
    report.geometry.triangles !== 12 ||
    report.renderer.backend !== "headless" ||
    report.renderer.rendered !== false ||
    report.renderer.instances !== 1 ||
    report.renderer.instancedTriangles !== 12 ||
    report.cleanup.rendererDisposed !== true ||
    report.cleanup.sessionDisposed !== true ||
    report.cleanup.sourceDisposed !== true ||
    report.cleanup.activeBackendBytes !== 0 ||
    expectedAssertions.some(
      (name) => report.assertions[name] !== true,
    )
  ) {
    throw new Error("glTF reference source qualification is invalid");
  }
  const serialized = JSON.stringify(report);
  if (
    serialized.includes("/Users/") ||
    serialized.includes("/Volumes/") ||
    serialized.includes("\\\\")
  ) {
    throw new Error("glTF qualification evidence contains a local path");
  }
}

export async function qualifyGltfReferenceSource() {
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
  const fixture = await acquirePublicGltfFixture();
  let source = null;
  let session = null;
  let renderer = null;
  try {
    const validation = await validator.validateBytes(
      fixture.bytes,
      {
        format: "glb",
        maxIssues: 100,
        uri: "Box.glb",
        writeTimestamp: false,
      },
    );
    if (
      validation.issues.numErrors !== 0 ||
      validation.issues.numWarnings !== 0 ||
      validation.issues.numInfos !== 0 ||
      validation.issues.numHints !== 0 ||
      validation.issues.truncated !== false
    ) {
      throw new Error(
        "official glTF Validator rejected the public fixture",
      );
    }
    source = await createGltfReferenceSource(
      fixture.bytes,
      { maximumRequestBytes: 256 },
    );
    session = await source.open({
      protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
    });
    const snapshot = await session.getSnapshot();
    const entity = snapshot.entities[0];
    const resolved = await session.getEntity({
      protocolVersion: snapshot.protocolVersion,
      sessionId: snapshot.sessionId,
      sourceId: snapshot.sourceId,
      revisionId: snapshot.revisionId,
      snapshotId: snapshot.snapshotId,
      layerId: snapshot.layerId,
      nativeId: entity.nativeId,
    });
    const pick = await session.resolvePick({
      protocolVersion: snapshot.protocolVersion,
      sessionId: snapshot.sessionId,
      sourceId: snapshot.sourceId,
      revisionId: snapshot.revisionId,
      snapshotId: snapshot.snapshotId,
      layerId: snapshot.layerId,
      renderId: entity.renderId,
      pickId: entity.pickId,
    });
    const backend = createHeadless3dBackend();
    renderer = createBounded3dRenderer({ backend });
    const mount = await renderer.mount({ session, snapshot });
    const rangeState = source.state;
    const rendererDisposed = await renderer.dispose();
    const sessionDisposed = await session.dispose();
    const sourceDisposed = await source.dispose();
    const report = {
      schema:
        "bim-explorer-gltf-reference-source-qualification/1",
      asOf: "2026-08-04",
      contract: "bim-explorer-gltf-reference-source/0.1",
      fixture: {
        fixtureId: fixture.manifest.fixtureId,
        repository:
          fixture.manifest.provenance.repository,
        commit: fixture.manifest.provenance.commit,
        path: fixture.manifest.provenance.path,
        byteLength: fixture.manifest.entry.byteLength,
        sha256: fixture.manifest.entry.sha256,
        license: fixture.manifest.license.spdx,
        attribution: fixture.manifest.license.attribution,
        artifactTracked: false,
        releaseBundled: false,
      },
      validator: {
        package: "gltf-validator",
        version: VALIDATOR_VERSION,
        license: "Apache-2.0",
        integrity: VALIDATOR_INTEGRITY,
        source:
          "https://github.com/KhronosGroup/glTF-Validator",
        externalResourceFunction: "not-provided",
        issues: {
          errors: validation.issues.numErrors,
          warnings: validation.issues.numWarnings,
          infos: validation.issues.numInfos,
          hints: validation.issues.numHints,
          truncated: validation.issues.truncated,
        },
        projection: {
          gltfVersion: validation.info.version,
          generator: validation.info.generator,
          drawCalls: validation.info.drawCallCount,
          vertices: validation.info.totalVertexCount,
          triangles: validation.info.totalTriangleCount,
          materials: validation.info.materialCount,
          textures: validation.info.hasTextures,
          skins: validation.info.hasSkins,
          animations: validation.info.animationCount,
        },
      },
      source: {
        format: snapshot.source.format,
        profile: snapshot.source.profile,
        fingerprint: snapshot.source.fingerprint,
        sourceRole: snapshot.source.sourceRole,
        semanticAuthority: snapshot.source.semanticAuthority,
        writeAuthority: snapshot.source.writeAuthority,
        roundTripAuthority:
          snapshot.source.roundTripAuthority,
        coordinateSystem: snapshot.coordinateSystem.source,
      },
      geometry: {
        ...snapshot.geometry,
        rangeBytes:
          snapshot.layers[0].rangeHandles[0].byteLength,
        maximumRequestBytes:
          snapshot.layers[0].rangeHandles[0]
            .maximumRequestBytes,
      },
      identity: {
        nativeId: entity.nativeId,
        globalId: entity.globalId,
        localNumericId: entity.localNumericId,
        entityResolved:
          resolved.nativeId === entity.nativeId,
        pickResolved: pick.nativeId === entity.nativeId,
        externalIdentityTokenBound:
          pick.externalIdentityToken ===
          entity.externalIdentityToken,
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
        instancedTriangles:
          mount.metrics.instancedTriangles,
        uploadedBytes: mount.backend.uploadedBytes,
        drawCalls: mount.metrics.drawCalls,
      },
      cleanup: {
        rendererDisposed,
        sessionDisposed,
        sourceDisposed,
        rangeReads: rangeState.rangeReads,
        rangeBytesRead: rangeState.rangeBytesRead,
        remainingReadBytes: rangeState.remainingReadBytes,
        activeBackendBytes: backend.state.activeBytes,
        residentRanges: backend.state.residentRanges,
      },
      assertions: {
        officialValidatorZeroIssues: true,
        exactValidatorArtifact: true,
        publicFixtureDigestVerified: true,
        boundedRangeReads:
          rangeState.rangeReads === 3 &&
          rangeState.remainingReadBytes === 0,
        geometryPrimitiveConformance:
          mount.metrics.geometryRecords === 1 &&
          mount.metrics.uniqueTriangles === 12,
        sourceNativeIdentity:
          resolved.nativeId === entity.nativeId &&
          pick.nativeId === entity.nativeId,
        noInventedIfcGlobalId:
          entity.globalId === null &&
          pick.globalId === null,
        referenceOnlyAuthority:
          snapshot.source.semanticAuthority === false &&
          snapshot.source.writeAuthority === false &&
          snapshot.source.roundTripAuthority === false,
        headlessRendererMount:
          mount.backend.backendId === "headless" &&
          mount.backend.rendered === false,
        deterministicCleanup:
          rendererDisposed &&
          sessionDisposed &&
          sourceDisposed &&
          backend.state.activeBytes === 0,
        artifactNotTrackedOrBundled: true,
        pathFreeEvidence: true,
      },
      limitations: [
        "headless backend does not prove Browser WebGL2 rasterization",
        "Box is a small core-profile GLB, not product-scale geometry",
        "mesh metadata is not BIM semantic authority",
        "external resources, required extensions, write and round-trip remain blocked",
      ],
    };
    assertQualification(report);
    return report;
  } finally {
    if (renderer !== null && renderer.state.disposed !== true) {
      await renderer.dispose();
    }
    if (
      session !== null &&
      source?.state.sessionDisposed !== true
    ) {
      await session.dispose();
    }
    if (source !== null && source.state.disposed !== true) {
      await source.dispose();
    }
    fixture.bytes.fill(0);
  }
}

const invoked = process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const report = await qualifyGltfReferenceSource();
  const output = outputArgument(process.argv.slice(2));
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (output === null) {
    process.stdout.write(serialized);
  } else {
    await writeFile(output, serialized);
    console.log(`Wrote ${path.relative(ROOT, output)}`);
  }
}
