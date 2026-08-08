import {
  BIM_SOURCE_PROTOCOL_VERSION,
} from "../../bim-model-source/src/index.mjs";
import {
  createBimRenderer3dHost,
} from "../../bim-renderer-3d/src/index.mjs";
import {
  createBimSemanticExplorer,
} from "../../bim-semantic-explorer/src/index.mjs";

export const BIM_SURFACE_CONTRACT =
  "bim-explorer-bim-surface/0.1";
export const BIM_SURFACE_RECEIPT =
  "bim-explorer-bim-surface-receipt/0.1";
export const BIM_SURFACE_PACKAGE_VERSION = "0.1.0";

const SOURCE_FINGERPRINT = /^sha256:[0-9a-f]{64}$/u;
const AUTHORITY = Object.freeze({
  workspace: false,
  canonicalEntityId: false,
  sourceMutation: false,
  revisionMutation: false,
  acceptance: false,
  publish: false,
  export: false,
});

function invalidState(message) {
  return new DOMException(message, "InvalidStateError");
}

function plainRecord(value, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ArrayBuffer.isView(value)
  ) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function nonEmptyString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function validateSnapshot(value) {
  const snapshot = plainRecord(value, "BIM surface snapshot");
  const source = plainRecord(
    snapshot.source,
    "BIM surface snapshot source",
  );
  for (const field of [
    "sessionId",
    "sourceId",
    "revisionId",
    "snapshotId",
    "layerId",
  ]) {
    nonEmptyString(
      snapshot[field],
      `BIM surface snapshot.${field}`,
    );
  }
  if (
    snapshot.protocolVersion !== BIM_SOURCE_PROTOCOL_VERSION ||
    !SOURCE_FINGERPRINT.test(source.fingerprint ?? "") ||
    snapshot.revisionId !==
      `source-snapshot:${source.fingerprint}` ||
    !Array.isArray(snapshot.layers) ||
    snapshot.layers.length === 0 ||
    !Array.isArray(snapshot.entities) ||
    snapshot.entities.length === 0 ||
    !Array.isArray(snapshot.tree?.nodes) ||
    !Array.isArray(snapshot.tree?.roots)
  ) {
    throw new TypeError(
      "BIM surface snapshot identity or semantic projection is invalid",
    );
  }
  return snapshot;
}

function validateOwnedSession(value) {
  const session = plainRecord(value, "BIM surface session");
  for (const method of [
    "dispose",
    "getEntity",
    "queryRelations",
    "queryTree",
    "readRange",
    "searchEntities",
  ]) {
    if (typeof session[method] !== "function") {
      throw new TypeError(
        `BIM surface session.${method} must be a function`,
      );
    }
  }
  return session;
}

function validateWorkerLease(value) {
  if (value === null) {
    return null;
  }
  const worker = plainRecord(value, "BIM surface Worker lease");
  if (
    typeof worker.dispose !== "function" &&
    typeof worker.terminate !== "function"
  ) {
    throw new TypeError(
      "BIM surface Worker lease must support dispose or terminate",
    );
  }
  return worker;
}

async function release(resource) {
  if (resource === null || resource === undefined) {
    return false;
  }
  if (typeof resource.dispose === "function") {
    return await resource.dispose();
  }
  if (typeof resource.terminate === "function") {
    return await resource.terminate();
  }
  return false;
}

function firstRenderable(snapshot) {
  return snapshot.entities.find((entity) =>
    typeof entity?.renderId === "string" &&
    entity.renderId.length > 0) ?? null;
}

function sourceIdentity(snapshot) {
  return Object.freeze({
    fingerprint: snapshot.source.fingerprint,
    revisionId: snapshot.revisionId,
    snapshotId: snapshot.snapshotId,
  });
}

export class BimSurface {
  #explorer = null;
  #host;
  #kind;
  #lastReceipt = null;
  #lifecycle = "idle";
  #semanticLimits;
  #source = null;
  #storage;

  constructor({
    kind,
    renderer,
    semanticLimits = {},
    storage = null,
  } = {}) {
    this.#kind = kind;
    this.#semanticLimits = plainRecord(
      semanticLimits,
      "BIM surface semantic limits",
    );
    this.#storage = storage;
    this.#host = createBimRenderer3dHost({
      kind,
      renderer,
    });
  }

  get state() {
    return Object.freeze({
      contract: BIM_SURFACE_CONTRACT,
      packageVersion: BIM_SURFACE_PACKAGE_VERSION,
      lifecycle: this.#lifecycle,
      kind: this.#kind,
      source: this.#source,
      authority: AUTHORITY,
      host: this.#host.state,
      semantic: this.#explorer?.state ?? null,
      lastReceipt: this.#lastReceipt,
    });
  }

  get host() {
    if (this.#lifecycle !== "ready") {
      throw invalidState("BIM surface host is not ready");
    }
    return this.#host;
  }

  get explorer() {
    if (
      this.#lifecycle !== "ready" ||
      this.#explorer === null
    ) {
      throw invalidState(
        "BIM surface semantic explorer is not ready",
      );
    }
    return this.#explorer;
  }

  async open({
    initialCamera = null,
    initialRangeStrategy = "source-plan",
    selectInitialRenderable = true,
    session: sessionValue,
    signal,
    snapshot: snapshotValue,
    workerLease: workerLeaseValue = null,
  } = {}) {
    if (this.#lifecycle !== "idle") {
      throw invalidState(
        "BIM surface can open exactly one source",
      );
    }
    this.#lifecycle = "opening";
    let session = null;
    let workerLease = null;
    let hostOwnsResources = false;
    try {
      session = validateOwnedSession(sessionValue);
      workerLease = validateWorkerLease(workerLeaseValue);
      const snapshot = validateSnapshot(snapshotValue);
      signal?.throwIfAborted?.();
      hostOwnsResources = true;
      const mount = await this.#host.mount({
        initialCamera,
        initialRangeStrategy,
        session,
        signal,
        snapshot,
        workerLease,
      });
      this.#explorer = createBimSemanticExplorer({
        limits: this.#semanticLimits,
        session,
        snapshot,
        storage: this.#storage,
      });
      await this.#explorer.initialize();
      let initialSelection = null;
      if (selectInitialRenderable) {
        const entity = firstRenderable(snapshot);
        if (entity !== null) {
          initialSelection =
            await this.#explorer.selectExpressId(
              entity.expressId,
              { origin: "surface-open" },
            );
        }
      }
      this.#source = sourceIdentity(snapshot);
      this.#lifecycle = "ready";
      this.#lastReceipt = Object.freeze({
        schema: BIM_SURFACE_RECEIPT,
        status: "ready",
        contract: BIM_SURFACE_CONTRACT,
        packageVersion: BIM_SURFACE_PACKAGE_VERSION,
        source: this.#source,
        authority: AUTHORITY,
        mount,
        semantic: Object.freeze({
          contract: this.#explorer.state.contract,
          initialSelection,
          treeRows: this.#explorer.state.tree.rows.length,
        }),
      });
      return this.#lastReceipt;
    } catch (error) {
      const cleanupErrors = [];
      try {
        await this.#explorer?.dispose();
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
      try {
        await this.#host.dispose({
          reason: "surface-open-failed",
        });
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
      if (!hostOwnsResources) {
        for (const resource of [session, workerLease]) {
          try {
            await release(resource);
          } catch (cleanupError) {
            cleanupErrors.push(cleanupError);
          }
        }
      }
      this.#explorer = null;
      this.#source = null;
      this.#lifecycle = "failed";
      if (cleanupErrors.length > 0) {
        throw new AggregateError(
          [error, ...cleanupErrors],
          "BIM surface open and cleanup failed",
        );
      }
      throw error;
    }
  }

  async dispose({
    reason = "surface-dispose",
  } = {}) {
    if (["disposed", "failed"].includes(this.#lifecycle)) {
      return false;
    }
    if (this.#lifecycle === "opening") {
      throw invalidState(
        "BIM surface cannot dispose while open is in progress",
      );
    }
    nonEmptyString(reason, "BIM surface dispose reason");
    this.#lifecycle = "disposing";
    const errors = [];
    let explorerDisposed = false;
    let hostReceipt = null;
    try {
      explorerDisposed = this.#explorer === null
        ? false
        : await this.#explorer.dispose();
    } catch (error) {
      errors.push(error);
    }
    try {
      hostReceipt = await this.#host.dispose({ reason });
    } catch (error) {
      errors.push(error);
    }
    this.#explorer = null;
    this.#source = null;
    this.#lifecycle = "disposed";
    if (errors.length > 0) {
      throw new AggregateError(
        errors,
        "BIM surface disposal failed",
      );
    }
    this.#lastReceipt = Object.freeze({
      schema: BIM_SURFACE_RECEIPT,
      status: "disposed",
      contract: BIM_SURFACE_CONTRACT,
      packageVersion: BIM_SURFACE_PACKAGE_VERSION,
      reason,
      authority: AUTHORITY,
      explorerDisposed,
      hostReceipt,
    });
    return this.#lastReceipt;
  }
}

export function createBimSurface(options) {
  return new BimSurface(options);
}

export {
  BIM_ENTITY_DETAILS_SCHEMA,
  BIM_PROPERTY_SET_VALUES_SCHEMA,
  BIM_SOURCE_ARTIFACT_SCHEMA,
  BIM_SOURCE_PROTOCOL_VERSION,
  BIM_SOURCE_SEMANTIC_QUERY_RESULT,
  BimModelSource,
  createBimModelSource,
} from "../../bim-model-source/src/index.mjs";

export {
  BIM_CAMERA_3D_SCHEMA,
  BIM_GEOMETRY_MEDIA_TYPE,
  BIM_MEASUREMENT_3D_SCHEMA,
  BIM_RENDERER_3D_CONTRACT,
  BIM_RENDERER_3D_DELTA_RECEIPT,
  BIM_RENDERER_3D_HOST_CONTRACT,
  BIM_RENDERER_3D_HOST_RECEIPT,
  BIM_RENDERER_3D_MEASUREMENT_RECEIPT,
  BIM_RENDERER_3D_PICK_RECEIPT,
  BIM_RENDERER_3D_RANGE_RECEIPT,
  BIM_RENDERER_3D_RECEIPT,
  BIM_RENDERER_3D_VIEW_RECEIPT,
  BimRenderer3dHost,
  Bounded3dRenderer,
  CameraInteraction3d,
  Headless3dBackend,
  WebGl2Backend,
  attachCameraControls3d,
  cameraViewProjectionMatrix,
  createBimRenderer3dHost,
  createBounded3dRenderer,
  createCameraInteraction3d,
  createFitCamera3d,
  createHeadless3dBackend,
  createMeasurement3d,
  createWebGl2Backend,
  decodeBimGeometryRange,
  measureAngle3d,
  measureArea3d,
  measureDistance3d,
  orbitCamera3d,
  panCamera3d,
  unprojectCameraPoint3d,
  validateCamera3d,
  zoomCamera3d,
} from "../../bim-renderer-3d/src/index.mjs";

export {
  BIM_SEMANTIC_EXPLORER_CONTRACT,
  BIM_SEMANTIC_SAVED_VIEW_SCHEMA,
  BimSemanticExplorer,
  createBimSemanticExplorer,
} from "../../bim-semantic-explorer/src/index.mjs";

export {
  BIM_SPATIAL_BRIDGE_DESCRIPTOR_SCHEMA,
  BIM_SPATIAL_BRIDGE_PROTOCOL_VERSION,
  BIM_SPATIAL_CONTEXT_SCHEMA,
  BIM_SPATIAL_HANDOFF_SCHEMA,
  BIM_SPATIAL_INTEGRATION_CONTRACT,
  BIM_SPATIAL_RENDER_PROTOCOL_ID,
  BIM_SPATIAL_RENDER_PROTOCOL_PACKAGE_VERSION,
  BIM_SPATIAL_REVIEW_SCHEMA,
  BIM_SPATIAL_SELECTION_SCHEMA,
  BIM_SPATIAL_VIEWER_CORE_VERSION,
  BIM_SPATIAL_VIEWPOINT_SCHEMA,
  BimSpatialIntegration,
  createBimSpatialIntegration,
} from "../../spatial-integration/src/index.mjs";
