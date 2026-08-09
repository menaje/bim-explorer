import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  createWebIfcSourceArtifact,
} from "../adapters/web-ifc/src/create-source-artifact.mjs";
import {
  BIM_SOURCE_PROTOCOL_VERSION,
  createBimModelSource,
} from "../packages/bim-model-source/src/index.mjs";
import {
  createBounded3dRenderer,
} from "../packages/bim-renderer-3d/src/index.mjs";
import {
  createExplicitAlignment,
} from "../packages/bim-federation/src/index.mjs";
import {
  BIM_FEDERATED_SURFACE_CONTRACT,
  BIM_FEDERATED_SURFACE_RECEIPT,
  BIM_FEDERATED_SURFACE_REFRESH_SCHEMA,
  BIM_FEDERATED_SURFACE_SELECTION_SCHEMA,
  createFederatedBimSurface,
} from "../packages/federated-bim-surface/src/index.mjs";
import {
  BIM_REFERENCE_ANCHOR_SCHEMA,
} from "../packages/bim-reference-anchor/src/index.mjs";
import {
  createGltfReferenceSource,
} from "../packages/gltf-reference-source/src/index.mjs";
import {
  syntheticGlbBytes,
} from "./generate-synthetic-gltf.mjs";
import {
  syntheticMappedIfc,
} from "./generate-synthetic-ifc.mjs";

const EVIDENCE_PATH =
  "compatibility/evidence/" +
  "federated-bim-surface-headless-2026-08-09.json";
const FEDERATION_ID = "federation:surface-v0.2-qualification";
const REFERENCE_SLOT = "source-slot:a-reference";
const SEMANTIC_SLOT = "source-slot:z-semantic";
const IDENTITY = Object.freeze([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]);

function deepFreeze(value) {
  if (
    value !== null &&
    typeof value === "object" &&
    !ArrayBuffer.isView(value) &&
    !Object.isFrozen(value)
  ) {
    for (const item of Object.values(value)) {
      deepFreeze(item);
    }
    Object.freeze(value);
  }
  return value;
}

class QualificationPickBackend {
  #active = null;
  #disposed = false;
  #mounts = 0;
  #picks = 0;

  get state() {
    return Object.freeze({
      activeBytes: this.#active?.uploadedBytes ?? 0,
      disposed: this.#disposed,
      mounts: this.#mounts,
      picks: this.#picks,
    });
  }

  async mount(plan) {
    this.#mounts += 1;
    const handleId = `qualification-surface:${this.#mounts}`;
    const uploadedBytes =
      plan.metrics.geometryPayloadBytes + plan.metrics.instanceBytes;
    const identities = plan.instances.map((instance) => ({
      expressId: instance.expressId,
      globalId: instance.globalId,
      nativeId: instance.nativeId,
      renderId: instance.renderId,
      pickId: instance.pickId,
      externalIdentityToken: instance.externalIdentityToken,
    }));
    const reference = identities.find((identity) =>
      identity.nativeId.startsWith("federated:0:"));
    const semantic = identities.find((identity) =>
      identity.nativeId.startsWith("federated:1:"));
    assert.ok(reference);
    assert.ok(semantic);
    this.#active = {
      handleId,
      uploadedBytes,
      drawCalls: identities.length,
      picks: [reference, semantic],
    };
    return {
      handleId,
      receipt: {
        backendId: "qualification-headless-pick",
        frameId: `mount:${this.#mounts}`,
        rendered: false,
        geometryBytes: plan.metrics.geometryPayloadBytes,
        instanceBytes: plan.metrics.instanceBytes,
        uploadedBytes,
        drawCalls: plan.metrics.drawCalls,
      },
    };
  }

  async pick(handleId, { x, y }) {
    assert.equal(handleId, this.#active.handleId);
    const identity = this.#active.picks[
      this.#picks % this.#active.picks.length
    ];
    this.#picks += 1;
    return {
      receipt: {
        backendId: "qualification-headless-pick",
        frameId: `pick:${this.#mounts}:${this.#picks}`,
        hit: true,
        x,
        y,
        drawCalls: this.#active.drawCalls,
        temporaryTargetBytes: 16,
        temporaryReleased: true,
        frameMs: 0,
        glError: 0,
        identity,
        depth: 0.5,
        worldPosition: [0, 0, 0],
      },
    };
  }

  async unmount(handleId) {
    assert.equal(handleId, this.#active.handleId);
    const releasedBytes = this.#active.uploadedBytes;
    this.#active = null;
    return {
      released: true,
      releasedBytes,
    };
  }

  async dispose() {
    if (this.#disposed) {
      return false;
    }
    this.#active = null;
    this.#disposed = true;
    return true;
  }
}

class QualificationWorkerLease {
  disposed = false;

  async dispose() {
    if (this.disposed) {
      return false;
    }
    this.disposed = true;
    return true;
  }
}

async function ifcFixture() {
  const artifact = await createWebIfcSourceArtifact(
    new TextEncoder().encode(syntheticMappedIfc()),
    { profile: "ReferenceView_V1.2" },
  );
  const source = createBimModelSource(artifact);
  const session = await source.open({
    protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
  });
  return {
    source,
    session,
    snapshot: await session.getSnapshot(),
  };
}

async function glbFixture(secondNodeX) {
  const source = await createGltfReferenceSource(
    syntheticGlbBytes({ secondNodeX }),
  );
  const session = await source.open({
    protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
  });
  return {
    source,
    session,
    snapshot: await session.getSnapshot(),
  };
}

function alignment(snapshot, reference) {
  return createExplicitAlignment({
    sourceRevisionId: snapshot.revisionId,
    sourceCoordinateSystem: snapshot.coordinateSystem.source,
    federationCoordinateSystem: "federation-local",
    sourceToFederation: IDENTITY,
    reference,
  });
}

function nativeSelection(slot, snapshot, entity) {
  return {
    federationSourceId: slot,
    sourceRevisionId: snapshot.revisionId,
    nativeIdentity: entity.nativeId === undefined
      ? {
        expressId: entity.expressId,
        globalId: entity.globalId,
        externalIdentityToken: entity.externalIdentityToken,
      }
      : {
        nativeId: entity.nativeId,
        globalId: null,
        externalIdentityToken: entity.externalIdentityToken,
      },
    occurrencePath: [],
  };
}

async function closeFixture(fixture) {
  if (fixture === null) {
    return;
  }
  await fixture.session.dispose();
  await fixture.source.dispose();
}

export async function qualifyFederatedBimSurface() {
  const semantic = await ifcFixture();
  const reference = await glbFixture(3);
  const replacement = await glbFixture(4);
  const workerLease = new QualificationWorkerLease();
  const backend = new QualificationPickBackend();
  const renderer = createBounded3dRenderer({
    backend,
    limits: {
      maximumFirstFrameRanges: 2,
    },
  });
  const surface = createFederatedBimSurface({ renderer });
  let disposed = false;
  try {
    const opened = await surface.open({
      federationId: FEDERATION_ID,
      sources: [
        {
          federationSourceId: REFERENCE_SLOT,
          sourceRole: "geometric-reference",
          lifecycleOwnership: "borrowed",
          session: reference.session,
          snapshot: reference.snapshot,
          alignment: alignment(
            reference.snapshot,
            "qualification:reference-identity",
          ),
          discipline: "reference",
          owner: "external-reference",
        },
        {
          federationSourceId: SEMANTIC_SLOT,
          sourceRole: "semantic-base",
          lifecycleOwnership: "transferred",
          session: semantic.session,
          snapshot: semantic.snapshot,
          alignment: alignment(
            semantic.snapshot,
            "qualification:semantic-identity",
          ),
          discipline: "architecture",
          owner: "external-bim",
          workerLease,
        },
      ],
    });
    const search = await surface.search({
      federationSourceId: SEMANTIC_SLOT,
      query: "wall",
    });
    let referenceSemanticsRejected = false;
    try {
      surface.getSemanticExplorer(REFERENCE_SLOT);
    } catch (error) {
      assert.equal(error.name, "NotSupportedError");
      referenceSemanticsRejected = true;
    }

    const referencePick = await surface.pick({ x: 1, y: 1 });
    const unsupportedAnchor = await surface.createAnchor({
      pick: referencePick,
    });
    const referenceAnchor = (await surface.createAnchor({
      pick: referencePick,
      sourceLocalHit: {
        coordinateSpace: "source-local",
        point: [0, 0, 0],
        normal: [0, 0, 1],
      },
      stability: "point-only",
    })).anchor;
    const semanticPick = await surface.pick({ x: 2, y: 2 });
    const semanticAnchor = (await surface.createAnchor({
      pick: semanticPick,
      sourceLocalHit: {
        coordinateSpace: "source-local",
        point: [0, 0, 0],
        normal: [0, 1, 0],
      },
      stability: "point-only",
    })).anchor;

    const referenceEntity = reference.snapshot.entities[0];
    const semanticEntity = semantic.snapshot.entities.find((entity) =>
      entity.renderable === true);
    const selection = surface.createSelection({
      items: [
        nativeSelection(
          REFERENCE_SLOT,
          reference.snapshot,
          referenceEntity,
        ),
        nativeSelection(
          SEMANTIC_SLOT,
          semantic.snapshot,
          semanticEntity,
        ),
      ],
    });
    const savedView = surface.saveView({
      viewId: "view:before-reference-refresh",
      camera: { projection: "perspective" },
    });
    const semanticRangeReadsBeforeRefresh =
      semantic.source.state.rangeReads;
    const refreshed = await surface.refreshSource({
      federationSourceId: REFERENCE_SLOT,
      expectedRevisionId: reference.snapshot.revisionId,
      session: replacement.session,
      snapshot: replacement.snapshot,
      alignment: alignment(
        replacement.snapshot,
        "qualification:replacement-identity",
      ),
      lifecycleOwnership: "borrowed",
    });
    const semanticRangeReadsAfterRefresh =
      semantic.source.state.rangeReads;
    const referenceAnchorAfterRefresh =
      await surface.evaluateAnchor(referenceAnchor);
    const semanticAnchorAfterRefresh =
      await surface.evaluateAnchor(semanticAnchor);
    const refreshedState = surface.state;
    const oldBorrowedRevision =
      (await reference.session.getSnapshot()).revisionId;

    const cleanup = await surface.dispose({
      reason: "qualification-complete",
    });
    disposed = true;
    const replacementBorrowedRevision =
      (await replacement.session.getSnapshot()).revisionId;
    const repeatedDispose = await surface.dispose();
    const semanticCleanup = cleanup.cleanup.sourceReceipts.find(
      (receipt) => receipt.federationSourceId === SEMANTIC_SLOT,
    );
    const replacementCleanup = cleanup.cleanup.sourceReceipts.find(
      (receipt) => receipt.federationSourceId === REFERENCE_SLOT,
    );

    return deepFreeze({
      schema:
        "bim-explorer-federated-bim-surface-qualification/1",
      status: "passed-headless-foundation",
      asOf: "2026-08-09",
      contract: {
        surface: BIM_FEDERATED_SURFACE_CONTRACT,
        receipt: BIM_FEDERATED_SURFACE_RECEIPT,
        refresh: BIM_FEDERATED_SURFACE_REFRESH_SCHEMA,
        selection: BIM_FEDERATED_SURFACE_SELECTION_SCHEMA,
        referenceAnchor: BIM_REFERENCE_ANCHOR_SCHEMA,
        federation: "bim-explorer-federation/0.1",
        source: "bim-explorer-bim-source/0.2",
      },
      composition: {
        federationId: opened.federationId,
        sourceCount: opened.projection.sourceCount,
        formats: opened.sources.map((source) => source.format),
        sourceRoles: opened.sources.map((source) =>
          source.sourceRole),
        lifecycleOwnership: opened.sources.map((source) =>
          source.lifecycleOwnership),
        semanticAvailability: opened.sources.map((source) =>
          source.semanticAvailable),
        compositeProjectionFingerprint:
          opened.projection.fingerprint,
        sourceProjectionFingerprints: opened.sources.map(
          (source) => source.projectionFingerprint,
        ),
        identityMerged: false,
      },
      semantics: {
        sourceScoped: true,
        queriedSource: SEMANTIC_SLOT,
        query: "wall",
        returned: search.items.length,
        referenceSemanticsRejected,
      },
      selection: {
        schema: selection.schema,
        items: selection.items.length,
        sourceSlots: selection.items.map((item) =>
          item.federationSourceId),
        distinctKeys:
          new Set(selection.items.map((item) => item.key)).size,
        mergeAcrossSources:
          selection.identityPolicy.mergeAcrossSources,
        savedViewSchema: savedView.schema,
      },
      anchors: {
        unsupportedWithoutSourceLocalHit:
          unsupportedAnchor.status === "unsupported" &&
          unsupportedAnchor.diagnostic ===
            "source-local-surface-hit-unavailable",
        reference: {
          sourceSlot: referenceAnchor.federationSourceId,
          format: referenceAnchor.nativeDocument.format,
          identityKind: referenceAnchor.nativeIdentity.kind,
          nativeId: referenceAnchor.nativeIdentity.nativeId,
          globalId: referenceAnchor.nativeIdentity.globalId ?? null,
          coordinateSpace: referenceAnchor.hit.coordinateSpace,
          stability: referenceAnchor.stability,
          authority: referenceAnchor.authority,
        },
        semantic: {
          sourceSlot: semanticAnchor.federationSourceId,
          format: semanticAnchor.nativeDocument.format,
          identityKind: semanticAnchor.nativeIdentity.kind,
          nativeId: semanticAnchor.nativeIdentity.nativeId,
          globalId: semanticAnchor.nativeIdentity.globalId,
          coordinateSpace: semanticAnchor.hit.coordinateSpace,
          stability: semanticAnchor.stability,
          authority: semanticAnchor.authority,
        },
        afterRefresh: {
          refreshedSource: referenceAnchorAfterRefresh.status,
          unchangedSource: semanticAnchorAfterRefresh.status,
          active: refreshedState.anchors.active,
          stale: refreshedState.anchors.stale,
        },
      },
      refresh: {
        schema: refreshed.schema,
        refreshedSource: refreshed.federationSourceId,
        previousRevisionId: refreshed.previousRevisionId,
        currentRevisionId: refreshed.currentRevisionId,
        unchangedFederationSources:
          refreshed.unchangedFederationSources,
        invalidated: refreshed.invalidated,
        retainedSelectionItems:
          refreshedState.selection.items.length,
        retainedSelectionSource:
          refreshedState.selection.items[0].federationSourceId,
        replayCacheReleased:
          refreshed.priorResources[0].role ===
            "revision-range-replay" &&
          refreshed.priorResources[0].released === true,
        previousProjectionDisposed:
          refreshed.previousProjectionDisposed,
        unchangedSourceRangeReadsBefore:
          semanticRangeReadsBeforeRefresh,
        unchangedSourceRangeReadsAfter:
          semanticRangeReadsAfterRefresh,
        oldBorrowedRevision,
      },
      lifecycle: {
        rendererMounts: backend.state.mounts,
        rendererPicks: backend.state.picks,
        rendererDisposed: cleanup.cleanup.rendererDisposed,
        rendererActiveBytes: backend.state.activeBytes,
        projectionDisposed:
          cleanup.cleanup.projectionReceipts.every(Boolean),
        federationDisposed:
          cleanup.cleanup.federationReceipts.every(
            (receipt) => receipt.disposed === true,
          ),
        semanticExplorersDisposed:
          cleanup.cleanup.semanticReceipts.every(Boolean),
        transferredSessionReleased:
          semanticCleanup.resources.some((resource) =>
            resource.role === "source-session" &&
            resource.released === true),
        transferredWorkerReleased: workerLease.disposed,
        borrowedSessionReleased:
          replacementCleanup.resources.some((resource) =>
            resource.role === "source-session" &&
            resource.released === true),
        borrowedRevisionAfterDispose:
          replacementBorrowedRevision,
        oldBorrowedRevisionAfterRefresh: oldBorrowedRevision,
        projectionCachesReleased:
          cleanup.cleanup.sourceReceipts.every((receipt) =>
            receipt.projectionCache.released === true),
        repeatedDispose,
      },
      authority: opened.authority,
      held: {
        actualBrowserSurfaceNormal: false,
        actualBrowserAnchor: false,
        actualVscodeSurface: false,
        actualSpatialConsumer: false,
        publicV02Package: false,
        productionSupport: false,
      },
      decision: {
        internalSurfaceImplementation: "passed-headless-generated",
        browserSurfaceNormal:
          "held-renderer-pick-has-no-normal-or-triangle-locator",
        browserProductComposition: "held-no-v0.2-entrypoint",
        vscodeProductComposition: "held-no-v0.2-entrypoint",
        actualSpatialConsumer: "held-consumer-owned",
        publicV02Package: "held-qualification-and-release",
        productionClaims: false,
      },
    });
  } finally {
    if (!disposed && ["idle", "ready"].includes(
      surface.state.lifecycle,
    )) {
      await surface.dispose({ reason: "qualification-failure" });
    }
    await closeFixture(semantic);
    await closeFixture(reference);
    await closeFixture(replacement);
  }
}

async function main() {
  const evidence = await qualifyFederatedBimSurface();
  const text = `${JSON.stringify(evidence, null, 2)}\n`;
  if (process.argv[2] === "--write") {
    await writeFile(EVIDENCE_PATH, text, "utf8");
    process.stdout.write(
      `Wrote federated BIM Surface evidence: ${EVIDENCE_PATH}\n`,
    );
    return;
  }
  if (process.argv.length > 2) {
    throw new TypeError(
      "usage: node scripts/qualify-federated-bim-surface.mjs [--write]",
    );
  }
  process.stdout.write(text);
}

if (
  process.argv[1] &&
  import.meta.url ===
    pathToFileURL(path.resolve(process.argv[1])).href
) {
  await main();
}
