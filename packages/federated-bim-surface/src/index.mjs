import {
  createBimSemanticExplorer,
} from "../../bim-semantic-explorer/src/index.mjs";
import {
  createBimFederation,
  createFederatedRendererProjection,
} from "../../bim-federation/src/index.mjs";
import {
  BIM_REFERENCE_ANCHOR_AUTHORITY,
  BIM_REFERENCE_ANCHOR_VALIDATION_SCHEMA,
  createBimReferenceAnchorFromFederatedPick,
  evaluateBimReferenceAnchor,
  fingerprintReferenceAnchorContext,
  validateBimReferenceAnchor,
} from "../../bim-reference-anchor/src/index.mjs";
import {
  BIM_SURFACE_HIT_SCHEMA,
} from "../../bim-surface-hit/src/index.mjs";

export const BIM_FEDERATED_SURFACE_CONTRACT =
  "bim-explorer-bim-surface/0.2";
export const BIM_FEDERATED_SURFACE_PACKAGE_VERSION = "0.3.0";
export const BIM_FEDERATED_SURFACE_RECEIPT =
  "bim-explorer-bim-surface-receipt/0.2";
export const BIM_FEDERATED_SURFACE_SELECTION_SCHEMA =
  "bim-explorer-bim-surface-selection/0.2";
export const BIM_FEDERATED_SURFACE_PICK_SCHEMA =
  "bim-explorer-bim-surface-pick/0.2";
export const BIM_FEDERATED_SURFACE_ANCHOR_RESULT_SCHEMA =
  "bim-explorer-bim-surface-anchor-result/0.2";
export const BIM_FEDERATED_SURFACE_SAVED_VIEW_SCHEMA =
  "bim-explorer-bim-surface-saved-view/0.2";
export const BIM_FEDERATED_SURFACE_REFRESH_SCHEMA =
  "bim-explorer-bim-surface-refresh/0.2";
export const BIM_FEDERATED_RETAINED_OVERLAY_CONTRACT =
  "bim-explorer-federated-retained-overlay/0.1";
export const BIM_FEDERATED_RETAINED_OVERLAY_ADAPTER_SCHEMA =
  "bim-explorer-federated-retained-overlay-adapter/0.1";

export const BIM_FEDERATED_SURFACE_AUTHORITY = deepFreeze({
  workspace: false,
  canonicalEntityId: false,
  sourceMutation: false,
  revisionMutation: false,
  geometryMutation: false,
  constraintMutation: false,
  acceptance: false,
  publish: false,
  export: false,
});

const SOURCE_FINGERPRINT = /^sha256:[0-9a-f]{64}$/u;
const LOCAL_PATH_PATTERN =
  /(?:\/Users\/|\/Volumes\/|[A-Z]:\\)/u;
const SOURCE_ROLES = new Set([
  "semantic-base",
  "geometric-reference",
  "observation-reference",
  "consumer-overlay",
]);
const SOURCE_STATES = new Set(["ready", "partial", "stale"]);
const OWNERSHIP = new Set(["transferred", "borrowed"]);
const MAXIMUM_SOURCES = 8;
const MAXIMUM_VIEW_BYTES = 32 * 1024;
const MAXIMUM_OCCURRENCES = 64;
const DEFAULT_MAXIMUM_REPLAY_BYTES = 4 * 1024 * 1024;

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
    Array.isArray(value) ||
    ArrayBuffer.isView(value)
  ) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function boundedString(value, label, maximum = 512) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximum ||
    /[\u0000-\u001f\u007f]/u.test(value) ||
    LOCAL_PATH_PATTERN.test(value)
  ) {
    throw new TypeError(
      `${label} must be a bounded path-free string`,
    );
  }
  return value;
}

function invalidState(message) {
  return new DOMException(message, "InvalidStateError");
}

function unsupported(message) {
  return new DOMException(message, "NotSupportedError");
}

function aborted(signal) {
  signal?.throwIfAborted?.();
  if (signal?.aborted) {
    throw signal.reason ??
      new DOMException("operation aborted", "AbortError");
  }
}

function sourceFormat(snapshot) {
  return snapshot.source?.format ?? "ifc";
}

function validateRenderer(value) {
  const renderer = plainRecord(
    value,
    "federated BIM surface renderer",
  );
  for (const method of ["dispose", "mount", "pick"]) {
    if (typeof renderer[method] !== "function") {
      throw new TypeError(
        `federated BIM surface renderer.${method} must be a function`,
      );
    }
  }
  return renderer;
}

function validateWorkerLease(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const lease = plainRecord(
    value,
    "federated BIM surface Worker lease",
  );
  if (
    typeof lease.dispose !== "function" &&
    typeof lease.terminate !== "function"
  ) {
    throw new TypeError(
      "federated BIM surface Worker lease cannot be released",
    );
  }
  return lease;
}

function hasSemanticSession(session, snapshot) {
  return [
    "getEntity",
    "queryRelations",
    "queryTree",
    "searchEntities",
  ].every((method) => typeof session[method] === "function") &&
    Array.isArray(snapshot.tree?.nodes) &&
    Array.isArray(snapshot.tree?.roots);
}

function validateOccurrencePath(value) {
  if (!Array.isArray(value) || value.length > MAXIMUM_OCCURRENCES) {
    throw new RangeError(
      "federated BIM surface occurrence path exceeds its bound",
    );
  }
  return value.map((item, index) =>
    boundedString(
      item,
      `federated BIM surface occurrence path ${index}`,
      256,
    ));
}

function validateSlot(value, index) {
  const slot = plainRecord(
    value,
    `federated BIM surface source ${index}`,
  );
  const federationSourceId = boundedString(
    slot.federationSourceId,
    `federated BIM surface source ${index} ID`,
  );
  if (!SOURCE_ROLES.has(slot.sourceRole)) {
    throw new TypeError(
      `federated BIM surface source ${index} role is unsupported`,
    );
  }
  if (!OWNERSHIP.has(slot.lifecycleOwnership)) {
    throw new TypeError(
      `federated BIM surface source ${index} ownership is unsupported`,
    );
  }
  const session = plainRecord(
    slot.session,
    `federated BIM surface source ${index} session`,
  );
  if (
    typeof session.readRange !== "function" ||
    typeof session.dispose !== "function"
  ) {
    throw new TypeError(
      `federated BIM surface source ${index} session is invalid`,
    );
  }
  const snapshot = plainRecord(
    slot.snapshot,
    `federated BIM surface source ${index} snapshot`,
  );
  const fingerprint = snapshot.source?.fingerprint;
  if (
    snapshot.protocolVersion !== "bim-explorer-bim-source/0.2" ||
    !SOURCE_FINGERPRINT.test(fingerprint ?? "") ||
    snapshot.revisionId !== `source-snapshot:${fingerprint}` ||
    !Array.isArray(snapshot.entities) ||
    snapshot.entities.length === 0
  ) {
    throw new TypeError(
      `federated BIM surface source ${index} snapshot is invalid`,
    );
  }
  const alignment = plainRecord(
    slot.alignment,
    `federated BIM surface source ${index} alignment`,
  );
  if (
    alignment.schema !==
      "bim-explorer-federation-alignment/0.1" ||
    alignment.status !== "aligned" ||
    alignment.sourceRevisionId !== snapshot.revisionId
  ) {
    throw unsupported(
      `federated BIM surface source ${index} requires exact alignment`,
    );
  }
  const state = slot.state ?? "ready";
  if (!SOURCE_STATES.has(state)) {
    throw new TypeError(
      `federated BIM surface source ${index} state is unsupported`,
    );
  }
  const stateReason = state === "ready"
    ? null
    : boundedString(
      slot.stateReason,
      `federated BIM surface source ${index} state reason`,
    );
  if (
    state === "ready" &&
    slot.stateReason !== null &&
    slot.stateReason !== undefined
  ) {
    throw new TypeError(
      "ready federated BIM surface source cannot carry a reason",
    );
  }
  if (
    slot.visible !== undefined &&
    typeof slot.visible !== "boolean"
  ) {
    throw new TypeError(
      `federated BIM surface source ${index} visibility is invalid`,
    );
  }
  return {
    federationSourceId,
    sourceRole: slot.sourceRole,
    lifecycleOwnership: slot.lifecycleOwnership,
    session,
    snapshot,
    format: sourceFormat(snapshot),
    alignment,
    discipline: boundedString(
      slot.discipline ?? slot.sourceRole,
      `federated BIM surface source ${index} discipline`,
    ),
    owner: boundedString(
      slot.owner ?? "external-source",
      `federated BIM surface source ${index} owner`,
    ),
    state,
    stateReason,
    visible: slot.visible ?? true,
    workerLease: validateWorkerLease(slot.workerLease),
    semanticAvailable: hasSemanticSession(session, snapshot),
  };
}

function validateSlots(values) {
  if (
    !Array.isArray(values) ||
    values.length === 0 ||
    values.length > MAXIMUM_SOURCES
  ) {
    throw new RangeError(
      "federated BIM surface requires 1..8 source slots",
    );
  }
  const slots = values.map(validateSlot);
  if (
    new Set(slots.map((slot) => slot.federationSourceId)).size !==
      slots.length ||
    new Set(slots.map((slot) => slot.session)).size !== slots.length
  ) {
    throw new RangeError(
      "federated BIM surface source IDs and sessions must be unique",
    );
  }
  if (!slots.some((slot) => slot.visible)) {
    throw new RangeError(
      "federated BIM surface requires one visible source",
    );
  }
  return slots;
}

function transferCandidates(values) {
  if (!Array.isArray(values)) {
    return [];
  }
  return values.flatMap((value, index) => {
    if (
      value === null ||
      typeof value !== "object" ||
      value.lifecycleOwnership !== "transferred"
    ) {
      return [];
    }
    return [{
      federationSourceId:
        typeof value.federationSourceId === "string"
          ? value.federationSourceId
          : `invalid-source:${index}`,
      lifecycleOwnership: "transferred",
      session: value.session ?? null,
      workerLease: value.workerLease ?? null,
    }];
  });
}

async function releaseResource(resource, role) {
  if (resource === null || resource === undefined) {
    return deepFreeze({
      role,
      present: false,
      released: false,
      method: null,
    });
  }
  if (typeof resource.dispose === "function") {
    const result = await resource.dispose();
    return deepFreeze({
      role,
      present: true,
      released: result !== false,
      method: "dispose",
    });
  }
  if (typeof resource.terminate === "function") {
    await resource.terminate();
    return deepFreeze({
      role,
      present: true,
      released: true,
      method: "terminate",
    });
  }
  throw new TypeError(`${role} resource cannot be released`);
}

class RevisionRangeReplaySession {
  #bytes = 0;
  #cache = new Map();
  #disposed = false;
  #maximumBytes;
  #session;

  constructor(session, maximumBytes) {
    this.#session = session;
    this.#maximumBytes = maximumBytes;
  }

  get state() {
    return deepFreeze({
      disposed: this.#disposed,
      cachedRanges: this.#cache.size,
      cachedBytes: this.#bytes,
      maximumBytes: this.#maximumBytes,
      ownsSourceSession: false,
    });
  }

  async readRange(handle, offset, length, options = {}) {
    aborted(options.signal);
    if (this.#disposed) {
      throw invalidState(
        "federated BIM surface range replay is disposed",
      );
    }
    const key = JSON.stringify({
      handleId: handle?.handleId,
      revisionId: handle?.revisionId,
      sha256: handle?.sha256,
      byteLength: handle?.byteLength,
      offset,
      length,
    });
    const cached = this.#cache.get(key);
    if (cached !== undefined) {
      return cached.slice();
    }
    if (
      !Number.isSafeInteger(length) ||
      length <= 0 ||
      this.#bytes + length > this.#maximumBytes
    ) {
      throw new RangeError(
        "federated BIM surface range replay exceeds its bound",
      );
    }
    const bytes = await this.#session.readRange(
      handle,
      offset,
      length,
      options,
    );
    if (!(bytes instanceof Uint8Array) || bytes.byteLength !== length) {
      bytes?.fill?.(0);
      throw new Error(
        "federated BIM surface source returned invalid range bytes",
      );
    }
    aborted(options.signal);
    this.#cache.set(key, bytes.slice());
    this.#bytes += bytes.byteLength;
    return bytes;
  }

  async dispose() {
    if (this.#disposed) {
      return false;
    }
    for (const bytes of this.#cache.values()) {
      bytes.fill(0);
    }
    this.#cache.clear();
    this.#bytes = 0;
    this.#disposed = true;
    return true;
  }
}

function attachReplaySessions(slots, maximumBytes) {
  return slots.map((slot) => ({
    ...slot,
    renderSession: new RevisionRangeReplaySession(
      slot.session,
      maximumBytes,
    ),
  }));
}

function projectionSlots(slots) {
  const visible = slots.filter((slot) => slot.visible);
  if (visible.length === 0) {
    throw new RangeError(
      "federated BIM surface projection has no visible source",
    );
  }
  return visible.map((slot) => ({
    federationSourceId: slot.federationSourceId,
    session: slot.renderSession,
    snapshot: slot.snapshot,
    alignment: slot.alignment,
  }));
}

function descriptorMap(federation) {
  return new Map(
    federation.getDescriptor().sources.map((source) => [
      source.federationSourceId,
      source,
    ]),
  );
}

function projectionFingerprintMap(projection) {
  const result = new Map();
  for (const mapping of projection.identityMap) {
    const previous = result.get(mapping.federationSourceId);
    if (
      previous !== undefined &&
      previous !== mapping.sourceProjectionFingerprint
    ) {
      throw new Error(
        "federated BIM surface source projection is inconsistent",
      );
    }
    result.set(
      mapping.federationSourceId,
      mapping.sourceProjectionFingerprint,
    );
  }
  return result;
}

function publicSlot(slot, descriptor, projectionFingerprint) {
  return deepFreeze({
    federationSourceId: slot.federationSourceId,
    sourceRole: slot.sourceRole,
    nativeSourceRole: descriptor.sourceRole,
    format: descriptor.format,
    nativeDocument: descriptor.nativeDocument,
    state: descriptor.state,
    stateReason: descriptor.stateReason,
    visible: descriptor.visible,
    alignment: descriptor.alignment,
    lifecycleOwnership: slot.lifecycleOwnership,
    semanticAvailable: slot.semanticAvailable,
    projectionFingerprint: projectionFingerprint ?? null,
    authority: {
      semantic: slot.semanticAvailable
        ? "external-source-document"
        : "not-available",
      geometry: descriptor.identityPolicy.nativeAuthority,
      write: false,
      roundTrip: false,
    },
  });
}

function jsonClone(value, label) {
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new TypeError(`${label} must be JSON-safe`);
  }
  if (serialized === undefined || LOCAL_PATH_PATTERN.test(serialized)) {
    throw new TypeError(`${label} must be path-free JSON`);
  }
  return JSON.parse(serialized);
}

function mappingIdentityMatches(mapping, anchor) {
  if (
    mapping.federationSourceId !== anchor.federationSourceId ||
    mapping.sourceRevisionId !== anchor.nativeDocument.revisionId
  ) {
    return false;
  }
  const identity = mapping.nativeIdentity;
  if (anchor.nativeIdentity.kind === "ifc-global-id") {
    return identity.globalId === anchor.nativeIdentity.globalId;
  }
  if (anchor.nativeIdentity.kind === "ifc-express-id") {
    return anchor.nativeIdentity.nativeId ===
      `ifc-express-id:${identity.expressId}`;
  }
  return identity.nativeId === anchor.nativeIdentity.nativeId;
}

function finiteVector(value, length, label) {
  if (
    !Array.isArray(value) ||
    value.length !== length ||
    value.some((component) =>
      typeof component !== "number" || !Number.isFinite(component))
  ) {
    throw new TypeError(
      `${label} must contain ${length} finite numbers`,
    );
  }
  return [...value];
}

function retainedWorldBounds(value, label) {
  const input = plainRecord(value, label);
  const min = finiteVector(input.min, 3, `${label}.min`);
  const max = finiteVector(input.max, 3, `${label}.max`);
  if (min.some((component, axis) => component > max[axis])) {
    throw new RangeError(`${label} is inverted`);
  }
  for (let axis = 0; axis < 3; axis += 1) {
    if (min[axis] === max[axis]) {
      const epsilon = Math.max(1, Math.abs(min[axis])) * 1e-6;
      min[axis] -= epsilon;
      max[axis] += epsilon;
    }
  }
  return deepFreeze({ min, max });
}

function normalizedVector(value, label) {
  const vector = finiteVector(value, 3, label);
  const magnitude = Math.hypot(...vector);
  if (!Number.isFinite(magnitude) || magnitude <= Number.EPSILON) {
    throw new RangeError(`${label} must not be zero`);
  }
  return vector.map((component) => {
    const normalized = component / magnitude;
    return Object.is(normalized, -0) ? 0 : normalized;
  });
}

function affineProjection(value, label) {
  const matrix = finiteVector(value, 16, label);
  const scale = matrix[15];
  if (
    Math.abs(scale) <= Number.EPSILON ||
    [matrix[3], matrix[7], matrix[11]].some((component) =>
      Math.abs(component) > Number.EPSILON)
  ) {
    throw unsupported(
      "surface-hit anchor requires an invertible affine alignment",
    );
  }
  const normalized = matrix.map((component) => component / scale);
  const determinant =
    normalized[0] * (
      normalized[5] * normalized[10] -
      normalized[9] * normalized[6]
    ) -
    normalized[4] * (
      normalized[1] * normalized[10] -
      normalized[9] * normalized[2]
    ) +
    normalized[8] * (
      normalized[1] * normalized[6] -
      normalized[5] * normalized[2]
    );
  if (!Number.isFinite(determinant) ||
    Math.abs(determinant) <= Number.EPSILON) {
    throw unsupported(
      "surface-hit anchor alignment is not invertible",
    );
  }
  const inverseDeterminant = 1 / determinant;
  const inverse = [
    (normalized[5] * normalized[10] -
      normalized[9] * normalized[6]) * inverseDeterminant,
    (normalized[9] * normalized[2] -
      normalized[1] * normalized[10]) * inverseDeterminant,
    (normalized[1] * normalized[6] -
      normalized[5] * normalized[2]) * inverseDeterminant,
    (normalized[8] * normalized[6] -
      normalized[4] * normalized[10]) * inverseDeterminant,
    (normalized[0] * normalized[10] -
      normalized[8] * normalized[2]) * inverseDeterminant,
    (normalized[4] * normalized[2] -
      normalized[0] * normalized[6]) * inverseDeterminant,
    (normalized[4] * normalized[9] -
      normalized[8] * normalized[5]) * inverseDeterminant,
    (normalized[8] * normalized[1] -
      normalized[0] * normalized[9]) * inverseDeterminant,
    (normalized[0] * normalized[5] -
      normalized[4] * normalized[1]) * inverseDeterminant,
  ];
  return {
    determinant,
    inverse,
    matrix: normalized,
  };
}

function projectionHitToSourceLocal(
  rendererPick,
  source,
  projection,
) {
  const hit = plainRecord(
    rendererPick.surfaceHit,
    "federated BIM surface renderer surface hit",
  );
  if (
    hit.schema !== BIM_SURFACE_HIT_SCHEMA ||
    hit.status !== "resolved" ||
    hit.coordinateSpace !== "projection-local" ||
    hit.projection?.fingerprint !==
      projection.snapshot.source.fingerprint ||
    hit.projection.revisionId !== projection.snapshot.revisionId ||
    hit.identity?.pickId !== rendererPick.identity?.pickId ||
    hit.verification?.actualGpuDepth !== true ||
    hit.verification.exactGeometryDigest !== true ||
    hit.verification.identityBound !== true ||
    hit.verification.nearestUniqueTriangle !== true ||
    hit.resources?.retainedGeometryBytes !== 0 ||
    hit.resources.temporaryGeometryReleased !== true ||
    Object.values(hit.authority ?? {}).some((value) => value !== false)
  ) {
    throw new TypeError(
      "federated BIM surface renderer hit is not verified",
    );
  }
  const point = finiteVector(
    hit.point,
    3,
    "federated BIM surface projection hit point",
  );
  const normal = normalizedVector(
    hit.normal,
    "federated BIM surface projection hit normal",
  );
  const transform = affineProjection(
    source.alignment.sourceToFederation,
    "federated BIM surface source alignment",
  );
  const translated = point.map(
    (value, axis) => value - transform.matrix[12 + axis],
  );
  const sourcePoint = [
    transform.inverse[0] * translated[0] +
      transform.inverse[3] * translated[1] +
      transform.inverse[6] * translated[2],
    transform.inverse[1] * translated[0] +
      transform.inverse[4] * translated[1] +
      transform.inverse[7] * translated[2],
    transform.inverse[2] * translated[0] +
      transform.inverse[5] * translated[1] +
      transform.inverse[8] * translated[2],
  ];
  const orientation = Math.sign(transform.determinant);
  const sourceNormal = normalizedVector([
    orientation * (
      transform.matrix[0] * normal[0] +
      transform.matrix[1] * normal[1] +
      transform.matrix[2] * normal[2]
    ),
    orientation * (
      transform.matrix[4] * normal[0] +
      transform.matrix[5] * normal[1] +
      transform.matrix[6] * normal[2]
    ),
    orientation * (
      transform.matrix[8] * normal[0] +
      transform.matrix[9] * normal[1] +
      transform.matrix[10] * normal[2]
    ),
  ], "federated BIM surface source-local normal");
  return {
    anchorPick: {
      ...rendererPick,
      worldPosition: point,
    },
    locator: hit.locator,
    sourceLocalHit: {
      coordinateSpace: "source-local",
      point: sourcePoint,
      normal: sourceNormal,
    },
  };
}

export class FederatedBimSurface {
  #activeAnchors = [];
  #explorers = new Map();
  #federation = null;
  #federationId = null;
  #lastPick = null;
  #lastReceipt = null;
  #lifecycle = "idle";
  #maximumReplayBytes;
  #overlayAdapters = new Set();
  #projection = null;
  #projectionFingerprints = new Map();
  #renderer;
  #retainedOverlays = new Map();
  #savedViews = new Map();
  #selection = null;
  #semanticLimits;
  #slots = [];
  #sourceDescriptors = new Map();
  #staleAnchors = 0;
  #staleViews = 0;
  #storage;
  #stagedRetained = null;

  constructor({
    renderer,
    semanticLimits = {},
    storage = null,
  } = {}) {
    this.#renderer = validateRenderer(renderer);
    const replayBytes = renderer.limits?.maximumSourceReadBytes ??
      DEFAULT_MAXIMUM_REPLAY_BYTES;
    if (!Number.isSafeInteger(replayBytes) || replayBytes <= 0) {
      throw new TypeError(
        "federated BIM surface replay byte limit is invalid",
      );
    }
    this.#maximumReplayBytes = replayBytes;
    this.#semanticLimits = plainRecord(
      semanticLimits,
      "federated BIM surface semantic limits",
    );
    this.#storage = storage;
  }

  get state() {
    return deepFreeze({
      contract: BIM_FEDERATED_SURFACE_CONTRACT,
      lifecycle: this.#lifecycle,
      federationId: this.#federationId,
      sources: this.#slots.map((slot) =>
        publicSlot(
          slot,
          this.#sourceDescriptors.get(slot.federationSourceId),
          this.#projectionFingerprints.get(
            slot.federationSourceId,
          ),
        )),
      projection: this.#projection === null
        ? null
        : {
          fingerprint: this.#projection.snapshot.source.fingerprint,
          sourceCount:
            this.#projection.snapshot.federation.sourceCount,
        },
      selection: this.#selection,
      anchors: {
        active: this.#activeAnchors.length,
        stale: this.#staleAnchors,
      },
      savedViews: {
        active: this.#savedViews.size,
        stale: this.#staleViews,
      },
      renderer: this.#renderer.state ?? null,
      retainedOverlays: [...this.#retainedOverlays.values()].map(
        (overlay) => ({
          federationSourceId: overlay.federationSourceId,
          overlayId: overlay.overlayId,
          sourceId: overlay.sourceId,
          layerId: overlay.layerId,
          revisionId: overlay.revisionId,
          sequence: overlay.sequence,
          identities: overlay.mappings.size,
        }),
      ),
      stagedRetainedDelta: this.#stagedRetained !== null,
      authority: BIM_FEDERATED_SURFACE_AUTHORITY,
      lastReceipt: this.#lastReceipt,
    });
  }

  #assertReady() {
    if (this.#lifecycle !== "ready") {
      throw invalidState("federated BIM surface is not ready");
    }
  }

  async #createExplorers(slots) {
    const explorers = new Map();
    try {
      for (const slot of slots) {
        if (!slot.semanticAvailable) {
          continue;
        }
        const explorer = createBimSemanticExplorer({
          limits: this.#semanticLimits,
          session: slot.session,
          snapshot: slot.snapshot,
          storage: this.#storage,
        });
        await explorer.initialize();
        explorers.set(slot.federationSourceId, explorer);
      }
      return explorers;
    } catch (error) {
      const cleanupErrors = [];
      for (const explorer of [...explorers.values()].reverse()) {
        try {
          await explorer.dispose();
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError);
        }
      }
      if (cleanupErrors.length > 0) {
        throw new AggregateError(
          [error, ...cleanupErrors],
          "federated BIM semantic initialization failed",
        );
      }
      throw error;
    }
  }

  #createFederation(federationId, slots) {
    const federation = createBimFederation({
      federationId,
      maximumSources: MAXIMUM_SOURCES,
    });
    for (const slot of slots) {
      const input = {
        federationSourceId: slot.federationSourceId,
        snapshot: slot.snapshot,
        discipline: slot.discipline,
        owner: slot.owner,
        alignment: slot.alignment,
        state: slot.state,
        stateReason: slot.stateReason,
        visible: slot.visible,
      };
      if (slot.format === "ifc") {
        federation.addIfcSource(input);
      } else {
        federation.addReferenceSource({
          ...input,
          format: slot.format,
        });
      }
    }
    return federation;
  }

  #registerRetainedOverlaySources(slots, projection) {
    const overlays = new Map();
    const entities = new Map(
      projection.snapshot.entities.map((entity) => [
        entity.renderId,
        entity,
      ]),
    );
    for (const slot of slots.filter((candidate) =>
      candidate.visible && candidate.sourceRole === "consumer-overlay")) {
      if (
        typeof this.#renderer.registerRetainedOverlaySource !== "function" ||
        typeof this.#renderer.prepareRetainedOverlayDelta !== "function" ||
        typeof this.#renderer.checkpointRetainedOverlay !== "function"
      ) {
        throw unsupported(
          "consumer-overlay requires retained renderer support",
        );
      }
      const baseMappings = projection.identityMap.filter((mapping) =>
        mapping.federationSourceId === slot.federationSourceId);
      if (baseMappings.length === 0) {
        throw new RangeError(
          "consumer-overlay has no retained render identities",
        );
      }
      const overlayId = `surface-overlay:${slot.federationSourceId}`;
      const identities = baseMappings.map((mapping, index) => {
        const entity = entities.get(mapping.renderId);
        const primitive = entity?.primitives?.[0];
        if (entity === undefined || primitive === undefined) {
          throw new RangeError(
            `consumer-overlay identity ${index} is not renderable`,
          );
        }
        return {
          sourceRenderId: boundedString(
            mapping.sourceRenderId,
            `consumer-overlay identity ${index} source Render ID`,
          ),
          sourcePickId: boundedString(
            mapping.sourcePickId,
            `consumer-overlay identity ${index} source Pick ID`,
          ),
          renderId: mapping.renderId,
          pickId: mapping.pickId,
          nativeId: entity.nativeId,
          externalIdentityToken: entity.externalIdentityToken,
          bounds: retainedWorldBounds(
            entity.bounds,
            `consumer-overlay identity ${index} bounds`,
          ),
          transform: primitive.transform,
          color: primitive.color,
          visible: true,
        };
      });
      this.#renderer.registerRetainedOverlaySource({
        overlayId,
        sourceId: slot.snapshot.sourceId,
        layerId: slot.snapshot.layerId,
        revisionId: slot.snapshot.revisionId,
        identities,
      });
      const mappings = new Map(
        baseMappings.map((mapping) => [
          mapping.sourceRenderId,
          deepFreeze({
            ...mapping,
            retainedOverlayRevisionId: slot.snapshot.revisionId,
            retainedOverlaySequence: 0,
          }),
        ]),
      );
      overlays.set(slot.federationSourceId, {
        federationSourceId: slot.federationSourceId,
        overlayId,
        sourceId: slot.snapshot.sourceId,
        layerId: slot.snapshot.layerId,
        nativeRevisionId: slot.snapshot.revisionId,
        revisionId: slot.snapshot.revisionId,
        sequence: 0,
        baseMappings: new Map(
          baseMappings.map((mapping) => [
            mapping.sourceRenderId,
            mapping,
          ]),
        ),
        mappings,
      });
    }
    return overlays;
  }

  #activeIdentityMappings() {
    const retainedSourceIds = new Set(this.#retainedOverlays.keys());
    return [
      ...this.#projection.identityMap.filter((mapping) =>
        !retainedSourceIds.has(mapping.federationSourceId)),
      ...[...this.#retainedOverlays.values()].flatMap(
        (overlay) => [...overlay.mappings.values()]),
    ];
  }

  async #cleanup({
    explorers = [],
    federations = [],
    projections = [],
    slots = [],
  } = {}) {
    const errors = [];
    const semanticReceipts = [];
    for (const explorer of [
      ...new Set(explorers.flatMap((value) =>
        value instanceof Map ? [...value.values()] : [value])),
    ].reverse()) {
      try {
        semanticReceipts.push(await explorer.dispose());
      } catch (error) {
        errors.push(error);
      }
    }
    let rendererDisposed = false;
    try {
      rendererDisposed = await this.#renderer.dispose();
    } catch (error) {
      errors.push(error);
    }
    const projectionReceipts = [];
    for (const projection of [
      ...new Set(projections.filter(Boolean)),
    ].reverse()) {
      try {
        projectionReceipts.push(
          await projection.session.dispose(),
        );
      } catch (error) {
        errors.push(error);
      }
    }
    const federationReceipts = [];
    for (const federation of [
      ...new Set(federations.filter(Boolean)),
    ].reverse()) {
      try {
        federationReceipts.push(await federation.dispose());
      } catch (error) {
        errors.push(error);
      }
    }
    const seenResources = new Set();
    const sourceReceipts = [];
    for (const slot of [...slots].reverse()) {
      let projectionCache = deepFreeze({
        role: "revision-range-replay",
        present: false,
        released: false,
        method: null,
      });
      if (
        slot.renderSession !== null &&
        slot.renderSession !== undefined &&
        !seenResources.has(slot.renderSession)
      ) {
        seenResources.add(slot.renderSession);
        try {
          projectionCache = await releaseResource(
            slot.renderSession,
            "revision-range-replay",
          );
        } catch (error) {
          errors.push(error);
          projectionCache = deepFreeze({
            role: "revision-range-replay",
            present: true,
            released: false,
            method: null,
          });
        }
      }
      const resources = [];
      for (const [resource, role] of [
        [slot.workerLease, "worker"],
        [slot.session, "source-session"],
      ]) {
        if (
          slot.lifecycleOwnership !== "transferred" ||
          resource === null ||
          resource === undefined ||
          seenResources.has(resource)
        ) {
          resources.push(deepFreeze({
            role,
            present: resource !== null && resource !== undefined,
            released: false,
            method: null,
          }));
          continue;
        }
        seenResources.add(resource);
        try {
          resources.push(await releaseResource(resource, role));
        } catch (error) {
          errors.push(error);
          resources.push(deepFreeze({
            role,
            present: true,
            released: false,
            method: null,
          }));
        }
      }
      sourceReceipts.push(deepFreeze({
        federationSourceId: slot.federationSourceId,
        lifecycleOwnership: slot.lifecycleOwnership,
        projectionCache,
        resources,
      }));
    }
    return {
      receipt: deepFreeze({
        rendererDisposed,
        projectionReceipts,
        federationReceipts,
        semanticReceipts,
        sourceReceipts,
      }),
      errors,
    };
  }

  async open({
    federationId,
    sources: sourceValues,
    initialCamera = null,
    initialRangeStrategy = "source-plan",
    signal,
  } = {}) {
    if (this.#lifecycle !== "idle") {
      throw invalidState(
        "federated BIM surface can open exactly once",
      );
    }
    this.#lifecycle = "opening";
    let slots = [];
    let federation = null;
    let projection = null;
    let explorers = new Map();
    let retainedOverlays = new Map();
    try {
      aborted(signal);
      const id = boundedString(
        federationId,
        "federated BIM surface federation ID",
      );
      slots = attachReplaySessions(
        validateSlots(sourceValues),
        this.#maximumReplayBytes,
      );
      federation = this.#createFederation(id, slots);
      projection = await createFederatedRendererProjection({
        federationId: id,
        sources: projectionSlots(slots),
        maximumSources: MAXIMUM_SOURCES,
      });
      aborted(signal);
      const mount = await this.#renderer.mount({
        initialCamera,
        initialRangeStrategy,
        session: projection.session,
        snapshot: projection.snapshot,
        signal,
      });
      retainedOverlays = this.#registerRetainedOverlaySources(
        slots,
        projection,
      );
      explorers = await this.#createExplorers(slots);
      this.#federationId = id;
      this.#slots = slots;
      this.#federation = federation;
      this.#projection = projection;
      this.#projectionFingerprints =
        projectionFingerprintMap(projection);
      this.#sourceDescriptors = descriptorMap(federation);
      this.#explorers = explorers;
      this.#retainedOverlays = retainedOverlays;
      this.#lifecycle = "ready";
      this.#lastReceipt = deepFreeze({
        schema: BIM_FEDERATED_SURFACE_RECEIPT,
        status: "ready",
        contract: BIM_FEDERATED_SURFACE_CONTRACT,
        federationId: id,
        projection: {
          fingerprint: projection.snapshot.source.fingerprint,
          sourceCount: projection.snapshot.federation.sourceCount,
        },
        sources: this.state.sources,
        mount,
        authority: BIM_FEDERATED_SURFACE_AUTHORITY,
      });
      return this.#lastReceipt;
    } catch (error) {
      const cleanupSlots = slots.length > 0
        ? slots
        : transferCandidates(sourceValues);
      const cleanup = await this.#cleanup({
        explorers: [explorers],
        federations: [federation],
        projections: [projection],
        slots: cleanupSlots,
      });
      this.#slots = [];
      this.#sourceDescriptors.clear();
      this.#projectionFingerprints.clear();
      this.#explorers.clear();
      this.#retainedOverlays.clear();
      this.#federation = null;
      this.#projection = null;
      this.#federationId = null;
      this.#lifecycle = "failed";
      this.#lastReceipt = deepFreeze({
        schema: BIM_FEDERATED_SURFACE_RECEIPT,
        status: "failed",
        contract: BIM_FEDERATED_SURFACE_CONTRACT,
        cleanup: cleanup.receipt,
        authority: BIM_FEDERATED_SURFACE_AUTHORITY,
      });
      if (cleanup.errors.length > 0) {
        throw new AggregateError(
          [error, ...cleanup.errors],
          "federated BIM surface open and cleanup failed",
        );
      }
      throw error;
    }
  }

  getSemanticExplorer(federationSourceId) {
    this.#assertReady();
    const id = boundedString(
      federationSourceId,
      "federated BIM semantic source ID",
    );
    const explorer = this.#explorers.get(id);
    if (explorer === undefined) {
      throw unsupported(
        "source has no admitted bounded semantic projection",
      );
    }
    return explorer;
  }

  search({ federationSourceId, query, ...options } = {}) {
    return this.getSemanticExplorer(federationSourceId)
      .search(query, options);
  }

  async prepareRetainedOverlayDelta({
    federationSourceId,
    delta,
    payloadBytes = null,
    signal,
  } = {}) {
    this.#assertReady();
    if (this.#stagedRetained !== null) {
      throw invalidState(
        "federated BIM surface already owns a retained transaction",
      );
    }
    const id = boundedString(
      federationSourceId,
      "federated retained overlay source ID",
    );
    const overlay = this.#retainedOverlays.get(id);
    if (overlay === undefined) {
      throw unsupported(
        "source is not an active consumer-overlay",
      );
    }
    const rendererTransaction =
      await this.#renderer.prepareRetainedOverlayDelta({
        overlayId: overlay.overlayId,
        delta,
        payloadBytes,
        signal,
      });
    const staged = { overlay, rendererTransaction };
    this.#stagedRetained = staged;
    let status = "open";
    const assertOpen = () => {
      if (
        status !== "open" ||
        this.#stagedRetained !== staged ||
        this.#retainedOverlays.get(id) !== overlay
      ) {
        throw invalidState(
          "federated retained overlay transaction is closed",
        );
      }
    };
    const close = (nextStatus) => {
      if (this.#stagedRetained === staged) {
        this.#stagedRetained = null;
      }
      status = nextStatus;
    };
    return Object.freeze({
      receipt: deepFreeze({
        schema: BIM_FEDERATED_RETAINED_OVERLAY_CONTRACT,
        status: "prepared",
        federationSourceId: id,
        renderer: rendererTransaction.receipt,
      }),
      commit: () => {
        assertOpen();
        const receipt = rendererTransaction.commit();
        const mappings = new Map();
        for (const identity of receipt.identities) {
          const sourceRenderId =
            identity.retainedOverlay.sourceRenderId;
          const base = overlay.baseMappings.get(sourceRenderId);
          const nativeIdentity = base?.nativeIdentity ?? {
            nativeId: identity.nativeId,
            localNumericId: null,
            globalId: null,
            externalIdentityToken:
              identity.externalIdentityToken,
          };
          mappings.set(sourceRenderId, deepFreeze({
            ...(base ?? {
              compositeExpressId: null,
              compositeNativeId: identity.nativeId,
              federationSourceId: id,
              sourceRevisionId: overlay.nativeRevisionId,
              sourceProjectionFingerprint:
                this.#projectionFingerprints.get(id),
              nativeIdentity,
            }),
            renderId: identity.renderId,
            pickId: identity.pickId,
            sourceRenderId,
            sourcePickId:
              identity.retainedOverlay.sourcePickId,
            retainedOverlayRevisionId: receipt.toRevisionId,
            retainedOverlaySequence: receipt.sequence,
          }));
        }
        overlay.mappings = mappings;
        overlay.revisionId = receipt.toRevisionId;
        overlay.sequence = receipt.sequence;
        close("committed");
        this.#lastPick = null;
        return deepFreeze({
          schema: BIM_FEDERATED_RETAINED_OVERLAY_CONTRACT,
          status: "applied",
          federationSourceId: id,
          overlayId: overlay.overlayId,
          revisionId: overlay.revisionId,
          sequence: overlay.sequence,
          identities: mappings.size,
          renderer: receipt,
          authority: BIM_FEDERATED_SURFACE_AUTHORITY,
        });
      },
      rollback: async () => {
        if (status !== "open") {
          return false;
        }
        assertOpen();
        const result = await rendererTransaction.rollback();
        close("rolled-back");
        return result;
      },
      dispose: async () => {
        if (status === "open") {
          assertOpen();
          const result = await rendererTransaction.dispose();
          close("disposed");
          return result;
        }
        return await rendererTransaction.dispose();
      },
    });
  }

  checkpointRetainedOverlay({
    checkpointId,
    expectedRevisionId,
    federationSourceId,
  } = {}) {
    this.#assertReady();
    const id = boundedString(
      federationSourceId,
      "federated retained checkpoint source ID",
    );
    const overlay = this.#retainedOverlays.get(id);
    if (overlay === undefined) {
      throw unsupported(
        "source is not an active consumer-overlay",
      );
    }
    const renderer = this.#renderer.checkpointRetainedOverlay({
      overlayId: overlay.overlayId,
      checkpointId,
      expectedRevisionId,
    });
    return deepFreeze({
      schema: BIM_FEDERATED_RETAINED_OVERLAY_CONTRACT,
      status: "checkpointed",
      federationSourceId: id,
      overlayId: overlay.overlayId,
      revisionId: overlay.revisionId,
      sequence: overlay.sequence,
      renderer,
      externalSourceRangeReads: 0,
      externalSourceParses: 0,
      externalSourceRangeUploads: 0,
      authority: BIM_FEDERATED_SURFACE_AUTHORITY,
    });
  }

  createRetainedOverlayAdapter({
    federationSourceId,
    readPayload,
  } = {}) {
    this.#assertReady();
    const id = boundedString(
      federationSourceId,
      "federated retained adapter source ID",
    );
    if (!this.#retainedOverlays.has(id)) {
      throw unsupported(
        "source is not an active consumer-overlay",
      );
    }
    if (typeof readPayload !== "function") {
      throw new TypeError(
        "federated retained adapter readPayload must be a function",
      );
    }
    const surface = this;
    let disposed = false;
    let staged = null;
    let prepares = 0;
    let commits = 0;
    let rollbacks = 0;
    let payloadReads = 0;
    let adapter;
    adapter = Object.freeze({
      schema: BIM_FEDERATED_RETAINED_OVERLAY_ADAPTER_SCHEMA,
      get state() {
        return deepFreeze({
          disposed,
          staged: staged !== null,
          prepares,
          commits,
          rollbacks,
          payloadReads,
        });
      },
      async prepareDelta(delta, { signal } = {}) {
        if (disposed) {
          throw invalidState(
            "federated retained overlay adapter is disposed",
          );
        }
        if (staged !== null) {
          throw invalidState(
            "federated retained overlay adapter already owns a transaction",
          );
        }
        aborted(signal);
        let payloadBytes = null;
        try {
          if (delta?.payload !== null) {
            const loaded = await readPayload(delta.payload, { signal });
            if (!(loaded instanceof Uint8Array)) {
              throw new TypeError(
                "federated retained payload reader must return Uint8Array",
              );
            }
            payloadBytes = Uint8Array.from(loaded);
            payloadReads += 1;
          }
          aborted(signal);
          const transaction =
            await surface.prepareRetainedOverlayDelta({
              federationSourceId: id,
              delta,
              payloadBytes,
              signal,
            });
          prepares += 1;
          let closed = false;
          const wrapper = Object.freeze({
            receipt: transaction.receipt,
            commit() {
              if (closed || staged !== wrapper) {
                throw invalidState(
                  "federated retained adapter transaction is closed",
                );
              }
              const receipt = transaction.commit();
              closed = true;
              staged = null;
              commits += 1;
              return receipt;
            },
            async rollback() {
              if (closed) {
                return false;
              }
              const result = await transaction.rollback();
              closed = true;
              staged = null;
              rollbacks += 1;
              return result;
            },
            async dispose() {
              const result = await transaction.dispose();
              if (!closed) {
                closed = true;
                staged = null;
                rollbacks += 1;
              }
              return result;
            },
          });
          staged = wrapper;
          return wrapper;
        } finally {
          payloadBytes?.fill(0);
        }
      },
      async dispose() {
        if (disposed) {
          return false;
        }
        if (staged !== null) {
          await staged.rollback();
          await staged.dispose();
        }
        disposed = true;
        surface.#overlayAdapters.delete(adapter);
        return true;
      },
    });
    this.#overlayAdapters.add(adapter);
    return adapter;
  }

  createSelection({ items } = {}) {
    this.#assertReady();
    if (!Array.isArray(items)) {
      throw new TypeError(
        "federated BIM surface selection items must be a list",
      );
    }
    const inputs = items.map((item, index) => {
      const value = plainRecord(
        item,
        `federated BIM surface selection ${index}`,
      );
      return {
        federationSourceId: value.federationSourceId,
        sourceRevisionId: value.sourceRevisionId,
        nativeIdentity: value.nativeIdentity,
        occurrencePath: validateOccurrencePath(
          value.occurrencePath ?? [],
        ),
      };
    });
    const federationSelection = this.#federation.createSelection({
      items: inputs,
    });
    const selection = deepFreeze({
      schema: BIM_FEDERATED_SURFACE_SELECTION_SCHEMA,
      federationId: this.#federationId,
      generation: federationSelection.generation,
      items: federationSelection.items.map((item, index) => ({
        ...item,
        occurrencePath: inputs[index].occurrencePath,
      })),
      identityPolicy: {
        mergeAcrossSources: false,
        sourceSlotRequired: true,
        occurrencePathRequired: true,
      },
      authority: BIM_FEDERATED_SURFACE_AUTHORITY,
    });
    this.#selection = selection;
    return selection;
  }

  async pick({ x, y, signal } = {}) {
    this.#assertReady();
    const rendererPick = await this.#renderer.pick({ x, y, signal });
    if (rendererPick.status === "miss") {
      this.#lastPick = deepFreeze({
        schema: BIM_FEDERATED_SURFACE_PICK_SCHEMA,
        status: "miss",
        federationId: this.#federationId,
        projectionFingerprint:
          this.#projection.snapshot.source.fingerprint,
        rendererPick,
        selection: null,
        anchorCapability: "unavailable-no-hit",
        authority: BIM_FEDERATED_SURFACE_AUTHORITY,
      });
      return this.#lastPick;
    }
    const mappings = this.#activeIdentityMappings().filter((mapping) =>
      mapping.pickId === rendererPick.identity?.pickId);
    if (mappings.length !== 1) {
      throw new RangeError(
        "federated BIM surface pick identity is ambiguous or stale",
      );
    }
    const mapping = mappings[0];
    const selection = this.createSelection({
      items: [{
        federationSourceId: mapping.federationSourceId,
        sourceRevisionId: mapping.sourceRevisionId,
        nativeIdentity: mapping.nativeIdentity,
        occurrencePath: [],
      }],
    });
    const explorer = this.#explorers.get(
      mapping.federationSourceId,
    );
    if (
      explorer !== undefined &&
      Number.isSafeInteger(mapping.nativeIdentity.expressId)
    ) {
      await explorer.selectExpressId(
        mapping.nativeIdentity.expressId,
        { origin: "federated-3d" },
      );
    }
    this.#lastPick = deepFreeze({
      schema: BIM_FEDERATED_SURFACE_PICK_SCHEMA,
      status: "hit",
      federationId: this.#federationId,
      projectionFingerprint:
        this.#projection.snapshot.source.fingerprint,
      sourceProjectionFingerprint:
        mapping.sourceProjectionFingerprint,
      federationSourceId: mapping.federationSourceId,
      sourceRevisionId: mapping.sourceRevisionId,
      rendererPick,
      selection,
      retainedOverlay: mapping.retainedOverlaySequence > 0
        ? {
            revisionId: mapping.retainedOverlayRevisionId,
            sequence: mapping.retainedOverlaySequence,
            sourceRenderId: mapping.sourceRenderId,
            sourcePickId: mapping.sourcePickId,
          }
        : null,
      anchorCapability:
        mapping.retainedOverlaySequence > 0
          ? "unavailable-retained-overlay"
          : rendererPick.surfaceHit?.schema === BIM_SURFACE_HIT_SCHEMA
          ? "source-local-surface-hit"
          : "requires-source-local-hit",
      authority: BIM_FEDERATED_SURFACE_AUTHORITY,
    });
    return this.#lastPick;
  }

  async createAnchor({
    pick: pickValue = this.#lastPick,
    sourceLocalHit = null,
    occurrencePath = [],
    locator = null,
    stability = "derived",
  } = {}) {
    this.#assertReady();
    const pick = plainRecord(
      pickValue,
      "federated BIM surface anchor pick",
    );
    if (
      pick.schema !== BIM_FEDERATED_SURFACE_PICK_SCHEMA ||
      pick.status !== "hit" ||
      pick.federationId !== this.#federationId ||
      pick.projectionFingerprint !==
        this.#projection.snapshot.source.fingerprint
    ) {
      throw new RangeError(
        "federated BIM surface anchor pick is stale or incompatible",
      );
    }
    if (pick.retainedOverlay !== null && pick.retainedOverlay !== undefined) {
      return deepFreeze({
        schema: BIM_FEDERATED_SURFACE_ANCHOR_RESULT_SCHEMA,
        status: "unsupported",
        diagnostic: "retained-overlay-has-no-source-local-locator",
        selection: pick.selection,
        anchor: null,
        authority: BIM_FEDERATED_SURFACE_AUTHORITY,
      });
    }
    const source = this.#sourceDescriptors.get(
      pick.federationSourceId,
    );
    let effectivePick = pick.rendererPick;
    let effectiveHit = sourceLocalHit;
    let effectiveLocator = locator;
    let effectiveStability = stability;
    if (
      effectiveHit === null &&
      pick.rendererPick.surfaceHit?.schema === BIM_SURFACE_HIT_SCHEMA
    ) {
      const resolved = projectionHitToSourceLocal(
        pick.rendererPick,
        source,
        this.#projection,
      );
      effectivePick = resolved.anchorPick;
      effectiveHit = resolved.sourceLocalHit;
      if (effectiveLocator === null) {
        effectiveLocator = resolved.locator;
      }
      effectiveStability = "derived";
    }
    if (effectiveHit === null) {
      return deepFreeze({
        schema: BIM_FEDERATED_SURFACE_ANCHOR_RESULT_SCHEMA,
        status: "unsupported",
        diagnostic: "source-local-surface-hit-unavailable",
        selection: pick.selection,
        anchor: null,
        authority: BIM_FEDERATED_SURFACE_AUTHORITY,
      });
    }
    const anchor = await createBimReferenceAnchorFromFederatedPick({
      pick: effectivePick,
      projection: this.#projection,
      source,
      sourceLocalHit: effectiveHit,
      occurrencePath,
      locator: effectiveLocator,
      stability: effectiveStability,
    });
    this.#activeAnchors.push(anchor);
    return deepFreeze({
      schema: BIM_FEDERATED_SURFACE_ANCHOR_RESULT_SCHEMA,
      status: "created",
      diagnostic: null,
      selection: pick.selection,
      anchor,
      authority: BIM_FEDERATED_SURFACE_AUTHORITY,
    });
  }

  async evaluateAnchor(anchorValue) {
    this.#assertReady();
    const anchor = validateBimReferenceAnchor(anchorValue);
    const source = this.#sourceDescriptors.get(
      anchor.federationSourceId,
    );
    if (source === undefined) {
      return deepFreeze({
        schema: BIM_REFERENCE_ANCHOR_VALIDATION_SCHEMA,
        status: "stale",
        reasons: ["source-slot-unavailable"],
        authority: BIM_REFERENCE_ANCHOR_AUTHORITY,
      });
    }
    const mappings = this.#projection.identityMap.filter((mapping) =>
      mapping.federationSourceId === anchor.federationSourceId);
    const identityAvailable = mappings.some((mapping) =>
      mappingIdentityMatches(mapping, anchor));
    const projectionFingerprint =
      this.#projectionFingerprints.get(anchor.federationSourceId);
    if (projectionFingerprint === undefined) {
      return deepFreeze({
        schema: BIM_REFERENCE_ANCHOR_VALIDATION_SCHEMA,
        status: "stale",
        reasons: ["source-projection-unavailable"],
        authority: BIM_REFERENCE_ANCHOR_AUTHORITY,
      });
    }
    const currentIdentity = identityAvailable
      ? anchor.nativeIdentity
      : {
        ...anchor.nativeIdentity,
        nativeId: "missing:unresolved-native-identity",
      };
    const result = evaluateBimReferenceAnchor(anchor, {
      federationSourceId: source.federationSourceId,
      nativeDocument: {
        format: source.format,
        fingerprint: source.nativeDocument.fingerprint,
        revisionId: source.nativeDocument.revisionId,
        schema: source.nativeDocument.schema,
        profile: source.nativeDocument.profile,
      },
      nativeIdentity: currentIdentity,
      alignmentFingerprint:
        await fingerprintReferenceAnchorContext(source.alignment),
      projectionFingerprint,
    });
    if (identityAvailable) {
      return result;
    }
    return deepFreeze({
      ...result,
      status: "stale",
      reasons: [
        "native-identity-missing",
        ...result.reasons.filter((reason) =>
          reason !== "native-identity-changed"),
      ],
    });
  }

  saveView({ viewId, camera = null } = {}) {
    this.#assertReady();
    const id = boundedString(
      viewId,
      "federated BIM surface saved view ID",
    );
    if (this.#selection === null) {
      throw invalidState(
        "federated BIM surface saved view requires a selection",
      );
    }
    if (this.#savedViews.has(id)) {
      throw new RangeError(
        "federated BIM surface saved view ID already exists",
      );
    }
    const view = {
      schema: BIM_FEDERATED_SURFACE_SAVED_VIEW_SCHEMA,
      federationId: this.#federationId,
      viewId: id,
      sourceStates: this.#slots.map((slot) => ({
        federationSourceId: slot.federationSourceId,
        sourceRevisionId: slot.snapshot.revisionId,
        visible: slot.visible,
      })),
      camera: camera === null
        ? null
        : jsonClone(camera, "federated BIM surface camera"),
      selection: this.#selection,
      authority: BIM_FEDERATED_SURFACE_AUTHORITY,
    };
    if (
      new TextEncoder().encode(JSON.stringify(view)).byteLength >
        MAXIMUM_VIEW_BYTES
    ) {
      throw new RangeError(
        "federated BIM surface saved view exceeds 32 KiB",
      );
    }
    const frozen = deepFreeze(view);
    this.#savedViews.set(id, frozen);
    return frozen;
  }

  async #releaseReplacedSlot(previous, current) {
    const receipts = [await releaseResource(
      previous.renderSession,
      "revision-range-replay",
    )];
    if (previous.lifecycleOwnership !== "transferred") {
      return receipts;
    }
    for (const [resource, role, currentResource] of [
      [previous.workerLease, "worker", current.workerLease],
      [previous.session, "source-session", current.session],
    ]) {
      if (resource !== null && resource !== currentResource) {
        receipts.push(await releaseResource(resource, role));
      }
    }
    return receipts;
  }

  async refreshSource({
    federationSourceId,
    expectedRevisionId,
    session,
    snapshot,
    alignment,
    lifecycleOwnership,
    workerLease = null,
    state = "ready",
    stateReason = null,
    signal,
  } = {}) {
    this.#assertReady();
    if (this.#stagedRetained !== null) {
      throw invalidState(
        "federated retained overlay transaction is in progress",
      );
    }
    const id = boundedString(
      federationSourceId,
      "federated BIM surface refresh source ID",
    );
    const index = this.#slots.findIndex((slot) =>
      slot.federationSourceId === id);
    if (index < 0) {
      throw new RangeError(
        "federated BIM surface refresh source is unavailable",
      );
    }
    const previous = this.#slots[index];
    if (previous.snapshot.revisionId !== expectedRevisionId) {
      throw invalidState(
        "federated BIM surface refresh expected revision is stale",
      );
    }
    const current = attachReplaySessions([validateSlot({
      ...previous,
      federationSourceId: id,
      session,
      snapshot,
      alignment,
      lifecycleOwnership:
        lifecycleOwnership ?? previous.lifecycleOwnership,
      workerLease,
      state,
      stateReason,
    }, index)], this.#maximumReplayBytes)[0];
    if (current.format !== previous.format) {
      throw new TypeError(
        "federated BIM surface refresh cannot change source format",
      );
    }
    const candidateSlots = [...this.#slots];
    candidateSlots[index] = current;
    this.#lifecycle = "refreshing";
    let candidateProjection = null;
    let candidateExplorer = null;
    let candidateRetainedOverlays = new Map();
    try {
      aborted(signal);
      const refresh = previous.format === "ifc"
        ? this.#federation.refreshIfcSource({
          federationSourceId: id,
          expectedRevisionId,
          snapshot,
          alignment,
          state,
          stateReason,
        })
        : this.#federation.refreshReferenceSource({
          format: previous.format,
          federationSourceId: id,
          expectedRevisionId,
          snapshot,
          alignment,
          state,
          stateReason,
        });
      candidateProjection =
        await createFederatedRendererProjection({
          federationId: this.#federationId,
          sources: projectionSlots(candidateSlots),
          maximumSources: MAXIMUM_SOURCES,
        });
      if (current.semanticAvailable) {
        candidateExplorer = createBimSemanticExplorer({
          limits: this.#semanticLimits,
          session: current.session,
          snapshot: current.snapshot,
          storage: this.#storage,
        });
        await candidateExplorer.initialize();
      }
      const mount = await this.#renderer.mount({
        session: candidateProjection.session,
        snapshot: candidateProjection.snapshot,
        signal,
      });
      candidateRetainedOverlays =
        this.#registerRetainedOverlaySources(
          candidateSlots,
          candidateProjection,
        );
      const previousExplorer = this.#explorers.get(id);
      if (previousExplorer !== undefined) {
        await previousExplorer.dispose();
      }
      await this.#projection.session.dispose();
      const priorResources = await this.#releaseReplacedSlot(
        previous,
        current,
      );
      if (candidateExplorer === null) {
        this.#explorers.delete(id);
      } else {
        this.#explorers.set(id, candidateExplorer);
      }
      const previousProjection = this.#projection;
      this.#slots = candidateSlots;
      this.#projection = candidateProjection;
      this.#projectionFingerprints =
        projectionFingerprintMap(candidateProjection);
      this.#retainedOverlays = candidateRetainedOverlays;
      this.#sourceDescriptors = descriptorMap(this.#federation);
      this.#lifecycle = "ready";
      const priorSelectionItems = this.#selection?.items ?? [];
      const retainedSelectionItems = priorSelectionItems.filter(
        (item) => item.federationSourceId !== id,
      );
      const invalidatedSelectionItems =
        priorSelectionItems.length - retainedSelectionItems.length;
      this.#selection = retainedSelectionItems.length === 0
        ? null
        : this.createSelection({ items: retainedSelectionItems });
      const retainedAnchors = this.#activeAnchors.filter((anchor) =>
        anchor.federationSourceId !== id);
      const invalidatedAnchors =
        this.#activeAnchors.length - retainedAnchors.length;
      this.#activeAnchors = retainedAnchors;
      this.#staleAnchors += invalidatedAnchors;
      let invalidatedSavedViews = 0;
      for (const [viewId, view] of this.#savedViews) {
        if (view.sourceStates.some((sourceState) =>
          sourceState.federationSourceId === id)) {
          this.#savedViews.delete(viewId);
          invalidatedSavedViews += 1;
        }
      }
      this.#staleViews += invalidatedSavedViews;
      this.#lastPick = null;
      this.#lastReceipt = deepFreeze({
        schema: BIM_FEDERATED_SURFACE_REFRESH_SCHEMA,
        status: "ready",
        contract: BIM_FEDERATED_SURFACE_CONTRACT,
        federationId: this.#federationId,
        federationSourceId: id,
        previousRevisionId: expectedRevisionId,
        currentRevisionId: current.snapshot.revisionId,
        sourceRefresh: refresh,
        invalidated: {
          selectionItems: invalidatedSelectionItems,
          anchors: invalidatedAnchors,
          savedViews: invalidatedSavedViews,
        },
        unchangedFederationSources: this.#slots.length - 1,
        priorResources,
        previousProjectionDisposed:
          previousProjection.session.state.disposed,
        mount,
        authority: BIM_FEDERATED_SURFACE_AUTHORITY,
      });
      return this.#lastReceipt;
    } catch (error) {
      const explorers = [this.#explorers];
      if (candidateExplorer !== null) {
        explorers.push(candidateExplorer);
      }
      const cleanup = await this.#cleanup({
        explorers,
        federations: [this.#federation],
        projections: [this.#projection, candidateProjection],
        slots: [...this.#slots, current],
      });
      this.#slots = [];
      this.#sourceDescriptors.clear();
      this.#projectionFingerprints.clear();
      this.#explorers.clear();
      this.#retainedOverlays.clear();
      this.#federation = null;
      this.#projection = null;
      this.#federationId = null;
      this.#selection = null;
      this.#activeAnchors = [];
      this.#savedViews.clear();
      this.#lastPick = null;
      this.#lifecycle = "failed";
      this.#lastReceipt = deepFreeze({
        schema: BIM_FEDERATED_SURFACE_REFRESH_SCHEMA,
        status: "failed",
        contract: BIM_FEDERATED_SURFACE_CONTRACT,
        cleanup: cleanup.receipt,
        authority: BIM_FEDERATED_SURFACE_AUTHORITY,
      });
      if (cleanup.errors.length > 0) {
        throw new AggregateError(
          [error, ...cleanup.errors],
          "federated BIM surface refresh and cleanup failed",
        );
      }
      throw error;
    }
  }

  async dispose({ reason = "surface-dispose" } = {}) {
    if (["disposed", "failed"].includes(this.#lifecycle)) {
      return false;
    }
    if (["opening", "refreshing", "disposing"].includes(
      this.#lifecycle,
    )) {
      throw invalidState(
        "federated BIM surface operation is in progress",
      );
    }
    boundedString(reason, "federated BIM surface dispose reason");
    const retainedCleanupErrors = [];
    const retainedAdapterCount = this.#overlayAdapters.size;
    for (const adapter of [...this.#overlayAdapters]) {
      try {
        await adapter.dispose();
      } catch (error) {
        retainedCleanupErrors.push(error);
      }
    }
    if (this.#stagedRetained !== null) {
      try {
        await this.#stagedRetained.rendererTransaction.rollback();
        await this.#stagedRetained.rendererTransaction.dispose();
        this.#stagedRetained = null;
      } catch (error) {
        retainedCleanupErrors.push(error);
      }
    }
    this.#lifecycle = "disposing";
    const active = {
      selectionItems: this.#selection?.items.length ?? 0,
      anchors: this.#activeAnchors.length,
      savedViews: this.#savedViews.size,
    };
    const cleanup = await this.#cleanup({
      explorers: [this.#explorers],
      federations: [this.#federation],
      projections: [this.#projection],
      slots: this.#slots,
    });
    this.#slots = [];
    this.#sourceDescriptors.clear();
    this.#projectionFingerprints.clear();
    this.#explorers.clear();
    this.#retainedOverlays.clear();
    this.#overlayAdapters.clear();
    this.#federation = null;
    this.#projection = null;
    this.#federationId = null;
    this.#selection = null;
    this.#activeAnchors = [];
    this.#savedViews.clear();
    this.#lastPick = null;
    this.#lifecycle = "disposed";
    this.#lastReceipt = deepFreeze({
      schema: BIM_FEDERATED_SURFACE_RECEIPT,
      status: "disposed",
      contract: BIM_FEDERATED_SURFACE_CONTRACT,
      reason,
      activeBeforeDispose: active,
      cleanup: cleanup.receipt,
      retainedOverlayAdaptersDisposed: retainedAdapterCount,
      terminalState: "disposed",
      authority: BIM_FEDERATED_SURFACE_AUTHORITY,
    });
    if (cleanup.errors.length > 0 || retainedCleanupErrors.length > 0) {
      throw new AggregateError(
        [...retainedCleanupErrors, ...cleanup.errors],
        "federated BIM surface disposal failed",
      );
    }
    return this.#lastReceipt;
  }
}

export function createFederatedBimSurface(options) {
  return new FederatedBimSurface(options);
}
