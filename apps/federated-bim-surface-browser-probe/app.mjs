import {
  BIM_SOURCE_PROTOCOL_VERSION,
  createBimModelSource,
} from "../../packages/bim-model-source/src/index.mjs";
import {
  cameraViewProjectionMatrix,
} from "../../packages/bim-renderer-3d/src/camera.mjs";
import {
  createBounded3dRenderer,
} from "../../packages/bim-renderer-3d/src/index.mjs";
import {
  createWebGl2Backend,
} from "../../packages/bim-renderer-3d/src/webgl2-backend.mjs";
import {
  createExplicitAlignment,
} from "../../packages/bim-federation/src/index.mjs";
import {
  createFederatedBimSurface,
} from "../../packages/federated-bim-surface/src/index.mjs";
import {
  createBimSurfaceHitRenderer,
} from "../../packages/bim-surface-hit/src/index.mjs";
import {
  createGltfReferenceSource,
} from "../../packages/gltf-reference-source/src/index.mjs";

const WIDTH = 800;
const HEIGHT = 600;
const canvas = document.querySelector("#model-canvas");
const receiptElement = document.querySelector("#receipt");
const statusElement = document.querySelector("#status");

function publish(report) {
  globalThis.__federatedBimSurfaceBrowserReport =
    Object.freeze(report);
  receiptElement.textContent = JSON.stringify(report, null, 2);
  statusElement.textContent = report.status === "passed"
    ? "Passed: source-local Browser anchors and cleanup verified"
    : report.status === "running"
      ? "Opening three source-scoped surfaces…"
      : `Failed: ${report.error?.message ?? "unknown error"}`;
}

function decodeBase64(value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError("Browser probe byte payload is invalid");
  }
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function reviveBytes(value) {
  if (Array.isArray(value)) {
    return value.map(reviveBytes);
  }
  if (value !== null && typeof value === "object") {
    if (
      Object.keys(value).length === 1 &&
      typeof value.$bytes === "string"
    ) {
      return decodeBase64(value.$bytes);
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        reviveBytes(item),
      ]),
    );
  }
  return value;
}

function translation(x) {
  return Object.freeze([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, 0, 0, 1,
  ]);
}

function alignment(snapshot, x, reference) {
  return createExplicitAlignment({
    sourceRevisionId: snapshot.revisionId,
    sourceCoordinateSystem: snapshot.coordinateSystem.source,
    federationCoordinateSystem: "federation-local",
    sourceToFederation: translation(x),
    reference,
  });
}

function transformPoint(matrix, point) {
  const [x, y, z] = point;
  const w =
    matrix[3] * x + matrix[7] * y +
    matrix[11] * z + matrix[15];
  return [
    (matrix[0] * x + matrix[4] * y +
      matrix[8] * z + matrix[12]) / w,
    (matrix[1] * x + matrix[5] * y +
      matrix[9] * z + matrix[13]) / w,
    (matrix[2] * x + matrix[6] * y +
      matrix[10] * z + matrix[14]) / w,
  ];
}

function projectedPixel(camera, point) {
  const matrix = cameraViewProjectionMatrix(
    camera,
    WIDTH / HEIGHT,
  );
  const [x, y, z] = point;
  const clip = [
    matrix[0] * x + matrix[4] * y +
      matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y +
      matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y +
      matrix[10] * z + matrix[14],
    matrix[3] * x + matrix[7] * y +
      matrix[11] * z + matrix[15],
  ];
  if (clip[3] <= 0) {
    return null;
  }
  const ndcX = clip[0] / clip[3];
  const ndcY = clip[1] / clip[3];
  const pixel = {
    x: Math.floor((ndcX + 1) * WIDTH / 2),
    y: Math.floor((1 - ndcY) * HEIGHT / 2),
  };
  return pixel.x < 0 || pixel.x >= WIDTH ||
    pixel.y < 0 || pixel.y >= HEIGHT
    ? null
    : pixel;
}

function boundsCandidates(bounds, sourceToFederation) {
  const center = bounds.min.map(
    (value, axis) => (value + bounds.max[axis]) / 2,
  );
  const points = [center];
  for (let axis = 0; axis < 3; axis += 1) {
    for (const side of [bounds.min[axis], bounds.max[axis]]) {
      const point = [...center];
      point[axis] = side;
      points.push(point);
    }
  }
  return points.map((point) =>
    transformPoint(sourceToFederation, point));
}

function pixelCandidates(camera, points) {
  const offsets = [
    [0, 0],
    [-3, 0], [3, 0], [0, -3], [0, 3],
    [-6, -6], [-6, 6], [6, -6], [6, 6],
    [-12, 0], [12, 0], [0, -12], [0, 12],
  ];
  const candidates = [];
  const keys = new Set();
  for (const point of points) {
    const projected = projectedPixel(camera, point);
    if (projected === null) {
      continue;
    }
    for (const [xOffset, yOffset] of offsets) {
      const candidate = {
        x: projected.x + xOffset,
        y: projected.y + yOffset,
      };
      const key = `${candidate.x}:${candidate.y}`;
      if (
        candidate.x >= 0 && candidate.x < WIDTH &&
        candidate.y >= 0 && candidate.y < HEIGHT &&
        !keys.has(key)
      ) {
        keys.add(key);
        candidates.push(candidate);
      }
    }
  }
  return candidates;
}

async function pickSource({
  alignment: sourceAlignment,
  camera,
  federationSourceId,
  snapshot,
  surface,
}) {
  const entity = snapshot.entities.find((candidate) =>
    candidate.renderable === true);
  if (entity === undefined) {
    throw new Error("Browser probe source has no renderable entity");
  }
  const candidates = pixelCandidates(
    camera,
    boundsCandidates(
      entity.bounds,
      sourceAlignment.sourceToFederation,
    ),
  );
  for (const coordinates of candidates) {
    const pick = await surface.pick(coordinates);
    if (
      pick.status === "hit" &&
      pick.federationSourceId === federationSourceId &&
      pick.rendererPick.surfaceHitCapability ===
        "resolved-exact-triangle"
    ) {
      return pick;
    }
  }
  throw new Error(
    `Browser probe could not resolve ${federationSourceId}`,
  );
}

function anchorProjection(anchor) {
  return {
    sourceSlot: anchor.federationSourceId,
    format: anchor.nativeDocument.format,
    identityKind: anchor.nativeIdentity.kind,
    nativeId: anchor.nativeIdentity.nativeId,
    globalId: anchor.nativeIdentity.globalId ?? null,
    point: anchor.hit.point,
    normal: anchor.hit.normal,
    stability: anchor.stability,
    locator: anchor.locator,
    alignmentFingerprint: anchor.alignmentFingerprint,
    projectionFingerprint: anchor.projectionFingerprint,
    authority: anchor.authority,
  };
}

async function run() {
  publish({
    schema:
      "bim-explorer-federated-bim-surface-browser-report/1",
    status: "running",
  });
  let backend = null;
  let renderer = null;
  let surface = null;
  const sources = [];
  try {
    const response = await fetch("/probe-input.json", {
      cache: "no-store",
      credentials: "omit",
    });
    if (!response.ok) {
      throw new Error("Browser probe input is unavailable");
    }
    const input = reviveBytes(await response.json());
    if (
      input.schema !==
        "bim-explorer-federated-bim-surface-browser-input/1"
    ) {
      throw new Error("Browser probe input schema is invalid");
    }
    const semanticSource = createBimModelSource(
      input.ifcArtifact,
    );
    const referenceSource = await createGltfReferenceSource(
      input.referenceGlb,
    );
    const overlaySource = await createGltfReferenceSource(
      input.overlayGlb,
    );
    sources.push(semanticSource, referenceSource, overlaySource);
    const semanticSession = await semanticSource.open({
      protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
    });
    const referenceSession = await referenceSource.open({
      protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
    });
    const overlaySession = await overlaySource.open({
      protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
    });
    const semanticSnapshot = await semanticSession.getSnapshot();
    const referenceSnapshot = await referenceSession.getSnapshot();
    const overlaySnapshot = await overlaySession.getSnapshot();
    const alignments = {
      reference: alignment(
        referenceSnapshot,
        -8,
        "browser:reference-placement",
      ),
      semantic: alignment(
        semanticSnapshot,
        0,
        "browser:semantic-placement",
      ),
      overlay: alignment(
        overlaySnapshot,
        8,
        "browser:overlay-placement",
      ),
    };
    backend = createWebGl2Backend({
      canvas,
      width: WIDTH,
      height: HEIGHT,
    });
    renderer = createBimSurfaceHitRenderer({
      width: WIDTH,
      height: HEIGHT,
      renderer: createBounded3dRenderer({
        backend,
        limits: {
          maximumFirstFrameRanges: 3,
          maximumSourceReadBytes: 4 * 1024 * 1024,
        },
      }),
    });
    surface = createFederatedBimSurface({ renderer });
    const slots = [
      {
        federationSourceId: "source-slot:a-reference",
        sourceRole: "geometric-reference",
        lifecycleOwnership: "transferred",
        session: referenceSession,
        snapshot: referenceSnapshot,
        alignment: alignments.reference,
        discipline: "external-reference",
        owner: "external-source",
      },
      {
        federationSourceId: "source-slot:m-semantic",
        sourceRole: "semantic-base",
        lifecycleOwnership: "transferred",
        session: semanticSession,
        snapshot: semanticSnapshot,
        alignment: alignments.semantic,
        discipline: "architecture",
        owner: "external-source",
      },
      {
        federationSourceId: "source-slot:z-overlay",
        sourceRole: "consumer-overlay",
        lifecycleOwnership: "transferred",
        session: overlaySession,
        snapshot: overlaySnapshot,
        alignment: alignments.overlay,
        discipline: "consumer-overlay",
        owner: "consumer-source",
      },
    ];
    const opened = await surface.open({
      federationId: "federation:browser-surface-v0.2",
      sources: slots,
    });
    const search = await surface.search({
      federationSourceId: "source-slot:m-semantic",
      query: "wall",
    });
    let referenceSemanticsRejected = false;
    try {
      surface.getSemanticExplorer("source-slot:a-reference");
    } catch (error) {
      referenceSemanticsRejected =
        error?.name === "NotSupportedError";
    }
    const camera = opened.mount.backend.camera;
    const targets = [
      {
        federationSourceId: "source-slot:a-reference",
        snapshot: referenceSnapshot,
        alignment: alignments.reference,
      },
      {
        federationSourceId: "source-slot:m-semantic",
        snapshot: semanticSnapshot,
        alignment: alignments.semantic,
      },
      {
        federationSourceId: "source-slot:z-overlay",
        snapshot: overlaySnapshot,
        alignment: alignments.overlay,
      },
    ];
    const picks = [];
    const anchors = [];
    for (const target of targets) {
      const pick = await pickSource({
        ...target,
        camera,
        surface,
      });
      const result = await surface.createAnchor({ pick });
      if (result.status !== "created") {
        throw new Error(
          "Browser surface did not create a source-local anchor",
        );
      }
      const evaluation = await surface.evaluateAnchor(result.anchor);
      if (evaluation.status !== "current") {
        throw new Error("Browser surface anchor is not current");
      }
      picks.push(pick);
      anchors.push(result.anchor);
    }
    const selection = surface.createSelection({
      items: picks.map((pick) => pick.selection.items[0]),
    });
    const view = surface.saveView({
      viewId: "view:browser-three-source-anchor",
      camera,
    });
    const sourceRangeReads = {
      reference: referenceSource.state.rangeReads,
      semantic: semanticSource.state.rangeReads,
      overlay: overlaySource.state.rangeReads,
    };
    const rendererStateBeforeDispose = renderer.state;
    const cleanup = await surface.dispose({
      reason: "browser-qualification-complete",
    });
    const repeatedDispose = await surface.dispose();
    const report = {
      schema:
        "bim-explorer-federated-bim-surface-browser-report/1",
      status: "passed",
      contract: opened.contract,
      composition: {
        federationId: opened.federationId,
        sourceCount: opened.projection.sourceCount,
        formats: opened.sources.map((source) => source.format),
        sourceRoles: opened.sources.map((source) =>
          source.sourceRole),
        semanticAvailability: opened.sources.map((source) =>
          source.semanticAvailable),
        projectionFingerprint: opened.projection.fingerprint,
        sourceProjectionFingerprints: opened.sources.map(
          (source) => source.projectionFingerprint,
        ),
        identityMerged: false,
      },
      semantics: {
        queriedSource: "source-slot:m-semantic",
        query: "wall",
        returned: search.items.length,
        referenceSemanticsRejected,
      },
      selection: {
        items: selection.items.length,
        sourceSlots: selection.items.map((item) =>
          item.federationSourceId),
        distinctKeys: new Set(selection.items.map((item) =>
          item.key)).size,
        mergeAcrossSources:
          selection.identityPolicy.mergeAcrossSources,
        savedView: view.schema,
      },
      renderer: {
        backend: opened.mount.backend.backendId,
        actualGpu: opened.mount.backend.actualGpu,
        context: opened.mount.backend.context,
        nonBackgroundPixels:
          opened.mount.backend.nonBackgroundPixels,
        uploadedBytes: opened.mount.backend.uploadedBytes,
        surfaceHits: rendererStateBeforeDispose.surfaceHits,
        surfaceMisses: rendererStateBeforeDispose.surfaceMisses,
        retainedGeometryBytes:
          rendererStateBeforeDispose.retainedGeometryBytes,
      },
      picks: picks.map((pick) => ({
        sourceSlot: pick.federationSourceId,
        sourceRevisionId: pick.sourceRevisionId,
        nativeId:
          pick.selection.items[0].nativeIdentity.nativeId ?? null,
        globalId:
          pick.selection.items[0].nativeIdentity.globalId ?? null,
        surfaceHitCapability: pick.anchorCapability,
        coordinateSpace:
          pick.rendererPick.surfaceHit.coordinateSpace,
        locator: pick.rendererPick.surfaceHit.locator,
        verification:
          pick.rendererPick.surfaceHit.verification,
        resources: pick.rendererPick.surfaceHit.resources,
        authority: pick.rendererPick.surfaceHit.authority,
      })),
      anchors: anchors.map(anchorProjection),
      ranges: {
        sourceRangeReads,
        unchangedBySurfaceResolution:
          Object.values(sourceRangeReads).every((value) => value === 1),
      },
      cleanup: {
        surfaceStatus: cleanup.status,
        rendererDisposed: cleanup.cleanup.rendererDisposed,
        backendDisposed: backend.state.disposed,
        backendActiveBytes: backend.state.activeBytes,
        backendResidentRanges: backend.state.residentRanges,
        retainedGeometryBytes: renderer.state.retainedGeometryBytes,
        projectionCachesReleased:
          cleanup.cleanup.sourceReceipts.every((receipt) =>
            receipt.projectionCache.released === true),
        transferredSessionsReleased:
          cleanup.cleanup.sourceReceipts.every((receipt) =>
            receipt.resources.some((resource) =>
              resource.role === "source-session" &&
              resource.released === true)),
        sourceSessionsDisposed: [
          referenceSource,
          semanticSource,
          overlaySource,
        ].every((source) => source.state.sessionDisposed === true),
        repeatedDispose,
      },
      authority: opened.authority,
    };
    if (
      report.composition.sourceCount !== 3 ||
      JSON.stringify(report.composition.formats) !==
        JSON.stringify(["glb", "ifc", "glb"]) ||
      JSON.stringify(report.composition.sourceRoles) !==
        JSON.stringify([
          "geometric-reference",
          "semantic-base",
          "consumer-overlay",
        ]) ||
      report.semantics.returned !== 2 ||
      report.semantics.referenceSemanticsRejected !== true ||
      report.selection.items !== 3 ||
      report.selection.distinctKeys !== 3 ||
      report.selection.mergeAcrossSources !== false ||
      report.renderer.actualGpu !== true ||
      report.renderer.context !== "webgl2" ||
      report.renderer.nonBackgroundPixels <= 0 ||
      report.renderer.surfaceHits !== 3 ||
      report.renderer.retainedGeometryBytes !== 0 ||
      report.picks.some((pick) =>
        pick.surfaceHitCapability !== "source-local-surface-hit" ||
        pick.coordinateSpace !== "projection-local" ||
        pick.locator?.kind !== "triangle-barycentric" ||
        pick.verification?.actualGpuDepth !== true ||
        pick.verification.exactGeometryDigest !== true ||
        pick.verification.nearestUniqueTriangle !== true ||
        pick.resources?.retainedGeometryBytes !== 0 ||
        pick.resources.temporaryGeometryReleased !== true ||
        Object.values(pick.authority).some(Boolean)) ||
      report.anchors.some((anchor) =>
        anchor.stability !== "derived" ||
        anchor.locator?.kind !== "triangle-barycentric" ||
        Object.values(anchor.authority).some(Boolean)) ||
      report.ranges.unchangedBySurfaceResolution !== true ||
      report.cleanup.surfaceStatus !== "disposed" ||
      report.cleanup.rendererDisposed !== true ||
      report.cleanup.backendDisposed !== true ||
      report.cleanup.backendActiveBytes !== 0 ||
      report.cleanup.backendResidentRanges !== 0 ||
      report.cleanup.retainedGeometryBytes !== 0 ||
      report.cleanup.projectionCachesReleased !== true ||
      report.cleanup.transferredSessionsReleased !== true ||
      report.cleanup.sourceSessionsDisposed !== true ||
      report.cleanup.repeatedDispose !== false ||
      Object.values(report.authority).some(Boolean)
    ) {
      throw new Error(
        "federated BIM Surface Browser receipt is invalid",
      );
    }
    for (const source of sources) {
      await source.dispose();
    }
    publish(report);
  } catch (error) {
    try {
      if (surface !== null &&
        ["idle", "ready"].includes(surface.state.lifecycle)) {
        await surface.dispose({ reason: "browser-probe-failure" });
      }
      for (const source of sources) {
        await source.dispose();
      }
    } catch {
      // The original error remains authoritative.
    }
    publish({
      schema:
        "bim-explorer-federated-bim-surface-browser-report/1",
      status: "failed",
      error: {
        name: error?.name ?? "Error",
        message: error?.message ?? "Browser probe failed",
      },
      cleanup: {
        surfaceLifecycle: surface?.state.lifecycle ?? null,
        rendererDisposed: renderer?.state.disposed ?? false,
        backendDisposed: backend?.state.disposed ?? false,
        backendActiveBytes: backend?.state.activeBytes ?? 0,
      },
    });
  }
}

await run();
