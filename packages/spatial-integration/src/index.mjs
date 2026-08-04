export const BIM_SPATIAL_INTEGRATION_CONTRACT =
  "bim-explorer-spatial-integration/0.1";
export const BIM_SPATIAL_HANDOFF_SCHEMA =
  "bim-explorer-spatial-handoff/0.1";
export const BIM_SPATIAL_VIEWPOINT_SCHEMA =
  "bim-explorer-spatial-viewpoint/0.1";
export const BIM_SPATIAL_SELECTION_SCHEMA =
  "bim-explorer-spatial-selection-sync/0.1";
export const BIM_SPATIAL_CONTEXT_SCHEMA =
  "bim-explorer-spatial-context-reference/0.1";
export const BIM_SPATIAL_REVIEW_SCHEMA =
  "bim-explorer-spatial-review/0.1";
export const BIM_SPATIAL_BRIDGE_DESCRIPTOR_SCHEMA =
  "bim-explorer-spatial-bridge-descriptor/0.1";
export const BIM_SPATIAL_BRIDGE_PROTOCOL_VERSION = "0.1.0";
export const BIM_SPATIAL_VIEWER_CORE_VERSION = "0.1.2";
export const BIM_SPATIAL_RENDER_PROTOCOL_PACKAGE_VERSION =
  "0.1.2";
export const BIM_SPATIAL_RENDER_PROTOCOL_ID =
  "menaje-viewer-render-protocol/0.1.0";

const SOURCE_PROTOCOL = "bim-explorer-bim-source/0.2";
const REQUIRED_CAPABILITIES = Object.freeze([
  "bim-external-identity-map",
  "context-create",
  "diff-descriptor",
  "layer-manifest",
]);
const DIFF_CATEGORIES = Object.freeze([
  "semantic",
  "geometry",
  "representation",
  "render",
  "requirement",
]);
const SPATIAL_LAYER_KINDS = new Set([
  "live",
  "added",
  "modified",
  "removed",
  "diagnostic",
  "selection",
  "annotation",
]);
const REPRESENTATIONS = new Set(["2d", "3d"]);
const MAXIMUM_HANDOFF_BYTES = 32 * 1024;
const MAXIMUM_REVIEW_LAYERS = 32;
const MAXIMUM_SELECTION_VIEWS = 4;
const MAXIMUM_SECTION_PLANES = 6;

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

function plainRecord(value, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function nonEmptyString(value, label, maximum = 512) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximum ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new TypeError(`${label} must be a bounded string`);
  }
  return value;
}

function finiteVector(value, length, label) {
  if (
    !Array.isArray(value) ||
    value.length !== length ||
    value.some((item) => !Number.isFinite(item))
  ) {
    throw new TypeError(
      `${label} must contain ${length} finite numbers`,
    );
  }
  return [...value];
}

function invalidState(message) {
  return new DOMException(message, "InvalidStateError");
}

function unavailable(message) {
  return new DOMException(message, "NotSupportedError");
}

function aborted(signal) {
  signal?.throwIfAborted?.();
  if (signal?.aborted) {
    throw signal.reason ??
      new DOMException("operation aborted", "AbortError");
  }
}

function validateSnapshot(snapshot) {
  const value = plainRecord(snapshot, "BIM source snapshot");
  const source = plainRecord(value.source, "BIM source descriptor");
  const fingerprint = nonEmptyString(
    source.fingerprint,
    "BIM source fingerprint",
  );
  if (
    value.protocolVersion !== SOURCE_PROTOCOL ||
    !/^sha256:[0-9a-f]{64}$/u.test(fingerprint) ||
    value.revisionId !== `source-snapshot:${fingerprint}` ||
    !Array.isArray(value.entities) ||
    !Array.isArray(value.layers) ||
    value.layers.length === 0
  ) {
    throw new TypeError("BIM source snapshot identity is invalid");
  }
  const entityByExpressId = new Map();
  for (const entityValue of value.entities) {
    const entity = plainRecord(entityValue, "BIM source entity");
    if (
      !Number.isSafeInteger(entity.expressId) ||
      entity.expressId <= 0 ||
      typeof entity.globalId !== "string" ||
      typeof entity.externalIdentityToken !== "string" ||
      entityByExpressId.has(entity.expressId)
    ) {
      throw new TypeError("BIM source entity identity is invalid");
    }
    entityByExpressId.set(entity.expressId, entity);
  }
  return {
    snapshot: value,
    source,
    entityByExpressId,
  };
}

function validateBridgeDescriptor(value) {
  const descriptor = plainRecord(
    value,
    "Spatial bridge descriptor",
  );
  const viewer = plainRecord(
    descriptor.viewer,
    "Spatial bridge Viewer identity",
  );
  const capabilities = descriptor.capabilities;
  if (
    descriptor.schema !==
      BIM_SPATIAL_BRIDGE_DESCRIPTOR_SCHEMA ||
    descriptor.protocolVersion !==
      BIM_SPATIAL_BRIDGE_PROTOCOL_VERSION ||
    !Array.isArray(capabilities) ||
    capabilities.length !== new Set(capabilities).size ||
    !REQUIRED_CAPABILITIES.every((capability) =>
      capabilities.includes(capability)) ||
    viewer.viewerCorePackageVersion !==
      BIM_SPATIAL_VIEWER_CORE_VERSION ||
    viewer.renderProtocolPackageVersion !==
      BIM_SPATIAL_RENDER_PROTOCOL_PACKAGE_VERSION ||
    viewer.renderProtocolId !==
      BIM_SPATIAL_RENDER_PROTOCOL_ID
  ) {
    throw new TypeError(
      "Spatial bridge contract or package pin is incompatible",
    );
  }
  for (const field of [
    "workspaceId",
    "revisionId",
    "renderMapId",
  ]) {
    nonEmptyString(
      descriptor[field],
      `Spatial bridge ${field}`,
    );
  }
  return structuredClone(descriptor);
}

function validateBridge(bridge) {
  const value = plainRecord(bridge, "Spatial bridge");
  for (const method of [
    "getDescriptor",
    "mapBimSelection",
    "createContextReference",
    "getReviewDescriptor",
    "release",
  ]) {
    if (typeof value[method] !== "function") {
      throw new TypeError(
        `Spatial bridge ${method} must be a function`,
      );
    }
  }
  return value;
}

function validateViewpoint(value, source) {
  const viewpoint = plainRecord(value, "BIM Spatial viewpoint");
  if (
    viewpoint.schema !== BIM_SPATIAL_VIEWPOINT_SCHEMA ||
    viewpoint.sourceFingerprint !== source.fingerprint ||
    viewpoint.sourceRevisionId !==
      `source-snapshot:${source.fingerprint}` ||
    !["perspective", "orthographic"].includes(
      viewpoint.projection,
    )
  ) {
    throw new RangeError(
      "BIM Spatial viewpoint is outside the source snapshot",
    );
  }
  const sectionPlanes = viewpoint.sectionPlanes ?? [];
  if (
    !Array.isArray(sectionPlanes) ||
    sectionPlanes.length > MAXIMUM_SECTION_PLANES
  ) {
    throw new RangeError(
      "BIM Spatial viewpoint section planes exceed their bound",
    );
  }
  return deepFreeze({
    schema: BIM_SPATIAL_VIEWPOINT_SCHEMA,
    sourceFingerprint: source.fingerprint,
    sourceRevisionId: viewpoint.sourceRevisionId,
    projection: viewpoint.projection,
    position: finiteVector(
      viewpoint.position,
      3,
      "viewpoint position",
    ),
    target: finiteVector(
      viewpoint.target,
      3,
      "viewpoint target",
    ),
    up: finiteVector(viewpoint.up, 3, "viewpoint up"),
    sectionPlanes: sectionPlanes.map((plane, index) => {
      const record = plainRecord(
        plane,
        `viewpoint section plane ${index}`,
      );
      if (!Number.isFinite(record.distance)) {
        throw new TypeError(
          "viewpoint section plane distance must be finite",
        );
      }
      return {
        normal: finiteVector(
          record.normal,
          3,
          "viewpoint section plane normal",
        ),
        distance: record.distance,
      };
    }),
  });
}

function validateSelection(selection, snapshot, entityByExpressId) {
  const value = plainRecord(selection, "BIM selection");
  const entity = entityByExpressId.get(value.expressId);
  if (
    entity === undefined ||
    typeof entity.renderId !== "string" ||
    typeof entity.pickId !== "string" ||
    entity.externalIdentityToken !==
      `ifc-globalid:${snapshot.source.fingerprint}:` +
        entity.globalId ||
    value.globalId !== entity.globalId ||
    value.renderId !== entity.renderId ||
    value.pickId !== entity.pickId ||
    value.externalIdentityToken !==
      entity.externalIdentityToken ||
    value.sourceFingerprint !== snapshot.source.fingerprint ||
    value.revisionId !== snapshot.revisionId
  ) {
    throw new RangeError(
      "BIM selection is outside the active source snapshot",
    );
  }
  return entity;
}

function sanitizedBaseLayers(snapshot) {
  return snapshot.layers.map((layerValue, index) => {
    const layer = plainRecord(
      layerValue,
      `BIM base layer ${index}`,
    );
    if (
      layer.revisionId !== snapshot.revisionId ||
      layer.sourceId !== snapshot.sourceId ||
      layer.representation !== "3d"
    ) {
      throw new RangeError(
        "BIM base layer is outside the source snapshot",
      );
    }
    return {
      owner: "bim-explorer",
      layerId: nonEmptyString(
        layer.layerId,
        "BIM base layer ID",
      ),
      sourceId: layer.sourceId,
      revisionId: layer.revisionId,
      kind: "base",
      representation: "3d",
      order: Number.isSafeInteger(layer.order)
        ? layer.order
        : index,
      visible: layer.visible !== false,
      rangeHandleIds: (layer.rangeHandles ?? []).map(
        (handle) => nonEmptyString(
          handle.handleId,
          "BIM base range handle ID",
        ),
      ),
    };
  });
}

function validateViewReference(value, descriptor, label) {
  const reference = plainRecord(value, label);
  if (
    !REPRESENTATIONS.has(reference.view) ||
    reference.revisionId !== descriptor.revisionId ||
    reference.renderMapId !== descriptor.renderMapId
  ) {
    throw new RangeError(`${label} is stale or unsupported`);
  }
  for (const field of ["layerId", "renderId", "pickId"]) {
    nonEmptyString(reference[field], `${label} ${field}`);
  }
  return structuredClone(reference);
}

function validateSelectionMapping(
  value,
  descriptor,
  snapshot,
  entity,
) {
  const mapping = plainRecord(
    value,
    "Spatial BIM selection mapping",
  );
  if (
    mapping.schema !==
      "bim-explorer-spatial-bridge-selection/0.1" ||
    mapping.protocolVersion !== descriptor.protocolVersion ||
    mapping.workspaceId !== descriptor.workspaceId ||
    mapping.revisionId !== descriptor.revisionId ||
    mapping.renderMapId !== descriptor.renderMapId ||
    mapping.sourceFingerprint !==
      snapshot.source.fingerprint ||
    mapping.sourceRevisionId !== snapshot.revisionId ||
    mapping.externalIdentityToken !==
      entity.externalIdentityToken ||
    mapping.mappingStatus !== "exact" ||
    !Array.isArray(mapping.views) ||
    mapping.views.length < 2 ||
    mapping.views.length > MAXIMUM_SELECTION_VIEWS
  ) {
    throw new RangeError(
      "Spatial BIM selection mapping is stale or invalid",
    );
  }
  nonEmptyString(mapping.canonicalId, "Spatial canonical ID");
  const views = mapping.views.map((view, index) =>
    validateViewReference(
      view,
      descriptor,
      `Spatial selection view ${index}`,
    ));
  if (
    new Set(views.map((view) => view.view)).size !==
      views.length ||
    !["2d", "3d"].every((view) =>
      views.some((candidate) => candidate.view === view))
  ) {
    throw new RangeError(
      "Spatial BIM selection must map unique 2D and 3D views",
    );
  }
  return deepFreeze({
    schema: BIM_SPATIAL_SELECTION_SCHEMA,
    contract: BIM_SPATIAL_INTEGRATION_CONTRACT,
    protocolVersion: descriptor.protocolVersion,
    workspaceId: descriptor.workspaceId,
    revisionId: descriptor.revisionId,
    renderMapId: descriptor.renderMapId,
    sourceFingerprint: snapshot.source.fingerprint,
    sourceRevisionId: snapshot.revisionId,
    externalIdentityToken: entity.externalIdentityToken,
    canonicalId: mapping.canonicalId,
    mappingStatus: mapping.mappingStatus,
    views,
  });
}

function validateViewport(value) {
  const viewport = plainRecord(value, "Spatial viewport");
  if (
    !REPRESENTATIONS.has(viewport.representation) ||
    !Number.isSafeInteger(viewport.width) ||
    !Number.isSafeInteger(viewport.height) ||
    viewport.width <= 0 ||
    viewport.height <= 0 ||
    viewport.width > 16_384 ||
    viewport.height > 16_384
  ) {
    throw new TypeError("Spatial viewport is invalid");
  }
  return {
    representation: viewport.representation,
    viewId: nonEmptyString(
      viewport.viewId,
      "Spatial viewport view ID",
    ),
    width: viewport.width,
    height: viewport.height,
  };
}

function validateContextReference(value, descriptor) {
  const context = plainRecord(
    value,
    "Spatial Context Reference",
  );
  if (
    context.schema !==
      "bim-explorer-spatial-bridge-context/0.1" ||
    context.protocolVersion !== descriptor.protocolVersion ||
    context.workspaceId !== descriptor.workspaceId ||
    context.revisionId !== descriptor.revisionId ||
    !/^cadctx:\/\/local\/[A-Za-z0-9_-]{32,128}$/u.test(
      context.uri,
    ) ||
    !Number.isFinite(Date.parse(context.expiresAt))
  ) {
    throw new RangeError(
      "Spatial Context Reference is stale or invalid",
    );
  }
  return deepFreeze({
    schema: BIM_SPATIAL_CONTEXT_SCHEMA,
    contract: BIM_SPATIAL_INTEGRATION_CONTRACT,
    protocolVersion: descriptor.protocolVersion,
    workspaceId: descriptor.workspaceId,
    revisionId: descriptor.revisionId,
    uri: context.uri,
    expiresAt: context.expiresAt,
    authority: "opaque-service-record",
  });
}

function validateDiffCategory(value, label) {
  const category = plainRecord(value, label);
  if (
    !/^sha256:[0-9a-f]{64}$/u.test(category.digest) ||
    !Number.isSafeInteger(category.changedEntities) ||
    category.changedEntities < 0
  ) {
    throw new TypeError(`${label} is invalid`);
  }
  return {
    digest: category.digest,
    changedEntities: category.changedEntities,
  };
}

function validateReview(
  value,
  descriptor,
  fromRevisionId,
) {
  const review = plainRecord(
    value,
    "Spatial review descriptor",
  );
  if (
    review.schema !==
      "bim-explorer-spatial-bridge-review/0.1" ||
    review.protocolVersion !== descriptor.protocolVersion ||
    review.workspaceId !== descriptor.workspaceId ||
    review.fromRevisionId !== fromRevisionId ||
    review.toRevisionId !== descriptor.revisionId ||
    review.renderMapId !== descriptor.renderMapId ||
    !Array.isArray(review.layers) ||
    review.layers.length === 0 ||
    review.layers.length > MAXIMUM_REVIEW_LAYERS
  ) {
    throw new RangeError(
      "Spatial review descriptor is stale or invalid",
    );
  }
  const layers = review.layers.map((layerValue, index) => {
    const layer = plainRecord(
      layerValue,
      `Spatial review layer ${index}`,
    );
    if (
      !SPATIAL_LAYER_KINDS.has(layer.kind) ||
      !REPRESENTATIONS.has(layer.representation) ||
      layer.revisionId !== descriptor.revisionId ||
      !Number.isSafeInteger(layer.order)
    ) {
      throw new TypeError(
        `Spatial review layer ${index} is invalid`,
      );
    }
    return {
      owner: "coni-spatial",
      layerId: nonEmptyString(
        layer.layerId,
        "Spatial review layer ID",
      ),
      sourceId: nonEmptyString(
        layer.sourceId,
        "Spatial review source ID",
      ),
      revisionId: layer.revisionId,
      kind: layer.kind,
      representation: layer.representation,
      order: layer.order,
      visible: layer.visible !== false,
      rangeHandleId: layer.rangeHandleId === null ||
        layer.rangeHandleId === undefined
        ? null
        : nonEmptyString(
            layer.rangeHandleId,
            "Spatial review range handle ID",
          ),
    };
  });
  if (
    new Set(layers.map((layer) => layer.layerId)).size !==
      layers.length
  ) {
    throw new TypeError(
      "Spatial review layer identities are not unique",
    );
  }
  const diff = plainRecord(
    review.diff,
    "Spatial review diff",
  );
  if (
    Object.keys(diff).length !== DIFF_CATEGORIES.length ||
    !DIFF_CATEGORIES.every((category) =>
      Object.hasOwn(diff, category))
  ) {
    throw new TypeError(
      "Spatial review diff category inventory is invalid",
    );
  }
  return {
    layers,
    diff: Object.fromEntries(
      DIFF_CATEGORIES.map((category) => [
        category,
        validateDiffCategory(
          diff[category],
          `Spatial ${category} diff`,
        ),
      ]),
    ),
  };
}

export class BimSpatialIntegration {
  #bridge;
  #descriptor;
  #disposed = false;
  #entityByExpressId;
  #snapshot;
  #source;
  #selectionByCanonicalId = new Map();
  #contextByUri = new Map();
  #handoffs = 0;
  #mappings = 0;
  #contexts = 0;
  #reviews = 0;

  constructor({
    bridge,
    descriptor,
    snapshot,
    source,
    entityByExpressId,
  }) {
    this.#bridge = bridge;
    this.#descriptor = descriptor;
    this.#snapshot = snapshot;
    this.#source = source;
    this.#entityByExpressId = entityByExpressId;
  }

  get state() {
    return deepFreeze({
      contract: BIM_SPATIAL_INTEGRATION_CONTRACT,
      availability: this.#bridge === null
        ? "standalone"
        : "connected",
      disposed: this.#disposed,
      sourceFingerprint: this.#source.fingerprint,
      sourceRevisionId: this.#snapshot.revisionId,
      workspaceId:
        this.#descriptor?.workspaceId ?? null,
      spatialRevisionId:
        this.#descriptor?.revisionId ?? null,
      mappings: this.#mappings,
      contexts: this.#contexts,
      reviews: this.#reviews,
      handoffs: this.#handoffs,
    });
  }

  #assertOpen() {
    if (this.#disposed) {
      throw invalidState("BIM Spatial integration is disposed");
    }
  }

  #assertConnected() {
    this.#assertOpen();
    if (this.#bridge === null) {
      throw unavailable(
        "Coni Spatial integration is optional and unavailable",
      );
    }
  }

  async #assertCurrent(signal) {
    this.#assertConnected();
    aborted(signal);
    const current = validateBridgeDescriptor(
      await this.#bridge.getDescriptor({ signal }),
    );
    if (
      current.workspaceId !== this.#descriptor.workspaceId ||
      current.revisionId !== this.#descriptor.revisionId ||
      current.renderMapId !== this.#descriptor.renderMapId
    ) {
      throw new RangeError(
        "Spatial bridge revision changed during integration",
      );
    }
  }

  createHandoff({
    selection,
    viewpoint,
    contextReference = null,
  } = {}) {
    this.#assertOpen();
    const entity = validateSelection(
      selection,
      this.#snapshot,
      this.#entityByExpressId,
    );
    const normalizedViewpoint = validateViewpoint(
      viewpoint,
      this.#source,
    );
    let context = null;
    if (contextReference !== null) {
      const supplied = plainRecord(
        contextReference,
        "Spatial handoff context",
      );
      const cached = this.#contextByUri.get(supplied.uri);
      if (
        cached === undefined ||
        JSON.stringify(cached) !== JSON.stringify(supplied)
      ) {
        throw new RangeError(
          "Spatial handoff Context Reference is not active",
        );
      }
      context = {
        uri: supplied.uri,
        workspaceId: supplied.workspaceId,
        revisionId: supplied.revisionId,
        expiresAt: supplied.expiresAt,
      };
    }
    const handoff = deepFreeze({
      schema: BIM_SPATIAL_HANDOFF_SCHEMA,
      contract: BIM_SPATIAL_INTEGRATION_CONTRACT,
      target: {
        product: "coni-spatial",
        minimumSpatialProtocol:
          BIM_SPATIAL_BRIDGE_PROTOCOL_VERSION,
      },
      source: {
        documentId: this.#source.documentId,
        fingerprint: this.#source.fingerprint,
        revisionId: this.#snapshot.revisionId,
        ifcSchema: this.#source.ifcSchema,
        profile: this.#source.profile,
      },
      selection: {
        expressId: entity.expressId,
        globalId: entity.globalId,
        renderId: entity.renderId,
        pickId: entity.pickId,
        externalIdentityToken:
          entity.externalIdentityToken,
      },
      viewpoint: normalizedViewpoint,
      contextReference: context,
      requestedCapabilities: [
        "bim-base",
        "selection-context",
        "revision-review",
      ],
      authority: {
        grants: [],
        acceptance: false,
        publish: false,
        sourceMutation: false,
      },
    });
    if (
      new TextEncoder().encode(JSON.stringify(handoff))
        .byteLength > MAXIMUM_HANDOFF_BYTES ||
      /\/Users\/|\/Volumes\/|[A-Z]:\\/u.test(
        JSON.stringify(handoff),
      )
    ) {
      throw new RangeError(
        "BIM Spatial handoff exceeds its public bound",
      );
    }
    this.#handoffs += 1;
    return handoff;
  }

  async resolveSelection({
    selection,
    viewpoint,
    signal,
  } = {}) {
    await this.#assertCurrent(signal);
    const entity = validateSelection(
      selection,
      this.#snapshot,
      this.#entityByExpressId,
    );
    const normalizedViewpoint = validateViewpoint(
      viewpoint,
      this.#source,
    );
    const result = await this.#bridge.mapBimSelection({
      schema:
        "bim-explorer-spatial-bridge-selection-request/0.1",
      protocolVersion:
        BIM_SPATIAL_BRIDGE_PROTOCOL_VERSION,
      workspaceId: this.#descriptor.workspaceId,
      revisionId: this.#descriptor.revisionId,
      renderMapId: this.#descriptor.renderMapId,
      source: {
        fingerprint: this.#source.fingerprint,
        revisionId: this.#snapshot.revisionId,
        documentId: this.#source.documentId,
      },
      nativeIdentity: {
        kind: "ifc-globalid",
        globalId: entity.globalId,
        expressId: entity.expressId,
        externalIdentityToken:
          entity.externalIdentityToken,
      },
      viewpoint: normalizedViewpoint,
    }, { signal });
    aborted(signal);
    await this.#assertCurrent(signal);
    const mapped = validateSelectionMapping(
      result,
      this.#descriptor,
      this.#snapshot,
      entity,
    );
    this.#selectionByCanonicalId.set(
      mapped.canonicalId,
      mapped,
    );
    this.#mappings += 1;
    return mapped;
  }

  async createContextReference({
    selectionSync,
    viewport,
    signal,
  } = {}) {
    await this.#assertCurrent(signal);
    let selection = plainRecord(
      selectionSync,
      "Spatial synchronized selection",
    );
    const cachedSelection = this.#selectionByCanonicalId.get(
      selection.canonicalId,
    );
    if (
      cachedSelection === undefined ||
      JSON.stringify(cachedSelection) !==
        JSON.stringify(selection) ||
      selection.workspaceId !==
        this.#descriptor.workspaceId ||
      selection.revisionId !==
        this.#descriptor.revisionId
    ) {
      throw new RangeError(
        "Spatial synchronized selection is stale",
      );
    }
    selection = cachedSelection;
    const normalizedViewport = validateViewport(viewport);
    const result =
      await this.#bridge.createContextReference({
        schema:
          "bim-explorer-spatial-bridge-context-request/0.1",
        protocolVersion:
          BIM_SPATIAL_BRIDGE_PROTOCOL_VERSION,
        workspaceId: this.#descriptor.workspaceId,
        revisionId: this.#descriptor.revisionId,
        renderMapId: this.#descriptor.renderMapId,
        selection: selection.views.map((view) => ({
          view: view.view,
          layerId: view.layerId,
          renderId: view.renderId,
          pickId: view.pickId,
        })),
        viewport: normalizedViewport,
      }, { signal });
    aborted(signal);
    await this.#assertCurrent(signal);
    const context = validateContextReference(
      result,
      this.#descriptor,
    );
    this.#contextByUri.set(context.uri, context);
    this.#contexts += 1;
    return context;
  }

  async loadReview({
    selectionSync,
    fromRevisionId,
    signal,
  } = {}) {
    await this.#assertCurrent(signal);
    let selection = plainRecord(
      selectionSync,
      "Spatial review selection",
    );
    const cachedSelection = this.#selectionByCanonicalId.get(
      selection.canonicalId,
    );
    if (
      cachedSelection === undefined ||
      JSON.stringify(cachedSelection) !==
        JSON.stringify(selection) ||
      selection.revisionId !==
        this.#descriptor.revisionId
    ) {
      throw new RangeError(
        "Spatial review selection is stale",
      );
    }
    selection = cachedSelection;
    nonEmptyString(
      fromRevisionId,
      "Spatial review from revision",
    );
    if (fromRevisionId === this.#descriptor.revisionId) {
      throw new RangeError(
        "Spatial review requires distinct revisions",
      );
    }
    const result =
      await this.#bridge.getReviewDescriptor({
        schema:
          "bim-explorer-spatial-bridge-review-request/0.1",
        protocolVersion:
          BIM_SPATIAL_BRIDGE_PROTOCOL_VERSION,
        workspaceId: this.#descriptor.workspaceId,
        fromRevisionId,
        toRevisionId: this.#descriptor.revisionId,
        renderMapId: this.#descriptor.renderMapId,
        selection: {
          views: selection.views.map((view) => ({
            view: view.view,
            layerId: view.layerId,
            renderId: view.renderId,
            pickId: view.pickId,
          })),
        },
      }, { signal });
    aborted(signal);
    await this.#assertCurrent(signal);
    const review = validateReview(
      result,
      this.#descriptor,
      fromRevisionId,
    );
    const composed = deepFreeze({
      schema: BIM_SPATIAL_REVIEW_SCHEMA,
      contract: BIM_SPATIAL_INTEGRATION_CONTRACT,
      workspaceId: this.#descriptor.workspaceId,
      fromRevisionId,
      toRevisionId: this.#descriptor.revisionId,
      renderMapId: this.#descriptor.renderMapId,
      bimBase: {
        fingerprint: this.#source.fingerprint,
        revisionId: this.#snapshot.revisionId,
        layers: sanitizedBaseLayers(this.#snapshot),
      },
      spatial: {
        layers: review.layers,
        diff: review.diff,
      },
      selectionSync: selection,
      authority: {
        bimBase: "bim-explorer-read-only-source",
        spatialRevision: "coni-spatial-service",
        acceptPublish: "not-granted",
      },
    });
    this.#reviews += 1;
    return composed;
  }

  async dispose() {
    if (this.#disposed) {
      return false;
    }
    this.#disposed = true;
    this.#selectionByCanonicalId.clear();
    this.#contextByUri.clear();
    if (this.#bridge !== null) {
      await this.#bridge.release();
    }
    return true;
  }
}

export async function createBimSpatialIntegration({
  snapshot,
  bridge = null,
  signal,
} = {}) {
  aborted(signal);
  const source = validateSnapshot(snapshot);
  if (bridge === null) {
    return new BimSpatialIntegration({
      bridge: null,
      descriptor: null,
      ...source,
    });
  }
  const validatedBridge = validateBridge(bridge);
  let descriptor;
  try {
    descriptor = validateBridgeDescriptor(
      await validatedBridge.getDescriptor({ signal }),
    );
  } catch (error) {
    await validatedBridge.release();
    throw error;
  }
  aborted(signal);
  return new BimSpatialIntegration({
    bridge: validatedBridge,
    descriptor,
    ...source,
  });
}
