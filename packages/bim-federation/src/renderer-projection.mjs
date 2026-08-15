export const BIM_FEDERATED_RENDERER_PROJECTION_SCHEMA =
  "bim-explorer-federated-renderer-projection/0.1";

const SOURCE_PROTOCOL = "bim-explorer-bim-source/0.2";
const GEOMETRY_MEDIA_TYPE =
  "application/vnd.bim-explorer.geometry-range.v1";
const ALIGNMENT_SCHEMA =
  "bim-explorer-federation-alignment/0.1";
const SHA256 = /^[0-9a-f]{64}$/u;
const SOURCE_FINGERPRINT = /^sha256:[0-9a-f]{64}$/u;
const LOCAL_PATH_PATTERN =
  /(?:\/Users\/|\/Volumes\/|[A-Z]:\\)/u;
const IDENTITY_MATRIX = Object.freeze([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]);

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
    throw new TypeError(`${label} must be a bounded path-free string`);
  }
  return value;
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return value;
}

function finiteVector(value, length, label) {
  if (
    !Array.isArray(value) ||
    value.length !== length ||
    value.some((item) =>
      typeof item !== "number" || !Number.isFinite(item))
  ) {
    throw new TypeError(`${label} must contain finite numbers`);
  }
  return [...value];
}

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

function invalidState(message) {
  return new DOMException(message, "InvalidStateError");
}

function aborted(signal) {
  signal?.throwIfAborted?.();
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException(
      "operation aborted",
      "AbortError",
    );
  }
}

function multiplyTransform(left, right) {
  const result = new Array(16).fill(0);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      for (let index = 0; index < 4; index += 1) {
        result[column * 4 + row] +=
          left[index * 4 + row] *
          right[column * 4 + index];
      }
    }
  }
  return result;
}

function projectPoint(matrix, point) {
  const [x, y, z] = point;
  const w =
    matrix[3] * x +
    matrix[7] * y +
    matrix[11] * z +
    matrix[15];
  if (!Number.isFinite(w) || Math.abs(w) < Number.EPSILON) {
    throw new RangeError(
      "federated renderer point is not projectable",
    );
  }
  return [
    (
      matrix[0] * x +
      matrix[4] * y +
      matrix[8] * z +
      matrix[12]
    ) / w,
    (
      matrix[1] * x +
      matrix[5] * y +
      matrix[9] * z +
      matrix[13]
    ) / w,
    (
      matrix[2] * x +
      matrix[6] * y +
      matrix[10] * z +
      matrix[14]
    ) / w,
  ];
}

function projectBounds(matrix, value, label) {
  const bounds = plainRecord(value, label);
  const min = finiteVector(bounds.min, 3, `${label}.min`);
  const max = finiteVector(bounds.max, 3, `${label}.max`);
  if (
    min.some((item, axis) => item > max[axis]) ||
    min.every((item, axis) => item === max[axis])
  ) {
    throw new RangeError(`${label} must have an extent`);
  }
  const corners = [];
  for (const x of [min[0], max[0]]) {
    for (const y of [min[1], max[1]]) {
      for (const z of [min[2], max[2]]) {
        corners.push(projectPoint(matrix, [x, y, z]));
      }
    }
  }
  return {
    min: [0, 1, 2].map((axis) =>
      Math.min(...corners.map((point) => point[axis]))),
    max: [0, 1, 2].map((axis) =>
      Math.max(...corners.map((point) => point[axis]))),
  };
}

async function digestText(value) {
  if (globalThis.crypto?.subtle === undefined) {
    throw new Error("SHA-256 Web Crypto is unavailable");
  }
  const bytes = new TextEncoder().encode(value);
  try {
    const digest = new Uint8Array(
      await globalThis.crypto.subtle.digest("SHA-256", bytes),
    );
    return [...digest]
      .map((item) => item.toString(16).padStart(2, "0"))
      .join("");
  } finally {
    bytes.fill(0);
  }
}

function validateSource(value, index) {
  const entry = plainRecord(
    value,
    `federated renderer source ${index}`,
  );
  const federationSourceId = boundedString(
    entry.federationSourceId,
    `federated renderer source ${index} ID`,
  );
  if (typeof entry.session?.readRange !== "function") {
    throw new TypeError(
      `federated renderer source ${index} session is invalid`,
    );
  }
  const snapshot = plainRecord(
    entry.snapshot,
    `federated renderer source ${index} snapshot`,
  );
  const source = plainRecord(
    snapshot.source,
    `federated renderer source ${index} descriptor`,
  );
  if (
    snapshot.protocolVersion !== SOURCE_PROTOCOL ||
    !SOURCE_FINGERPRINT.test(source.fingerprint ?? "") ||
    snapshot.revisionId !==
      `source-snapshot:${source.fingerprint}` ||
    !Array.isArray(snapshot.entities) ||
    snapshot.entities.length === 0 ||
    !Array.isArray(snapshot.layers) ||
    !Array.isArray(snapshot.loadPlan?.firstFrameRangeIds) ||
    snapshot.loadPlan.firstFrameRangeIds.length === 0 ||
    !Array.isArray(snapshot.loadPlan?.deferredRangeIds)
  ) {
    throw new TypeError(
      `federated renderer source ${index} snapshot is invalid`,
    );
  }
  const layer = snapshot.layers.find((candidate) =>
    candidate.layerId === snapshot.layerId &&
    candidate.representation === "3d" &&
    candidate.sourceId === snapshot.sourceId &&
    candidate.revisionId === snapshot.revisionId);
  if (!Array.isArray(layer?.rangeHandles)) {
    throw new TypeError(
      `federated renderer source ${index} has no 3D layer`,
    );
  }
  const handles = new Map();
  for (const handleValue of layer.rangeHandles) {
    const handle = plainRecord(
      handleValue,
      `federated renderer source ${index} range`,
    );
    boundedString(handle.handleId, "source range handle ID");
    positiveInteger(handle.byteLength, "source range byteLength");
    positiveInteger(
      handle.maximumRequestBytes,
      "source range maximumRequestBytes",
    );
    if (
      handle.mediaType !== GEOMETRY_MEDIA_TYPE ||
      !SHA256.test(handle.sha256 ?? "") ||
      handle.maximumRequestBytes > handle.byteLength ||
      handles.has(handle.handleId) ||
      [
        "protocolVersion",
        "sessionId",
        "sourceId",
        "revisionId",
        "snapshotId",
        "layerId",
      ].some((field) => handle[field] !== snapshot[field])
    ) {
      throw new TypeError(
        `federated renderer source ${index} range is invalid`,
      );
    }
    handles.set(handle.handleId, handle);
  }
  const planned = [
    ...snapshot.loadPlan.firstFrameRangeIds,
    ...snapshot.loadPlan.deferredRangeIds,
  ];
  if (
    planned.length !== handles.size ||
    new Set(planned).size !== handles.size ||
    planned.some((handleId) => !handles.has(handleId))
  ) {
    throw new TypeError(
      `federated renderer source ${index} range plan is invalid`,
    );
  }
  const alignment = plainRecord(
    entry.alignment,
    `federated renderer source ${index} alignment`,
  );
  if (
    alignment.schema !== ALIGNMENT_SCHEMA ||
    alignment.status !== "aligned" ||
    alignment.sourceRevisionId !== snapshot.revisionId ||
    alignment.datumTransformation !== "not-performed" ||
    !["projected-same-crs", "explicit"].includes(
      alignment.method,
    ) ||
    alignment.numericPrecision !== "float64"
  ) {
    throw new TypeError(
      `federated renderer source ${index} must be explicitly aligned`,
    );
  }
  const sourceToFederation = finiteVector(
    alignment.sourceToFederation,
    16,
    `federated renderer source ${index} alignment matrix`,
  );
  if (Math.abs(sourceToFederation[15]) < Number.EPSILON) {
    throw new RangeError(
      `federated renderer source ${index} alignment is not projectable`,
    );
  }
  boundedString(
    alignment.sourceCoordinateSystem,
    `federated renderer source ${index} source coordinate system`,
  );
  boundedString(
    alignment.federationCoordinateSystem,
    `federated renderer source ${index} federation coordinate system`,
  );
  finiteVector(
    alignment.federationOrigin,
    3,
    `federated renderer source ${index} federation origin`,
  );
  const provenance = plainRecord(
    alignment.provenance,
    `federated renderer source ${index} alignment provenance`,
  );
  if (
    provenance.kind !== (
      alignment.method === "projected-same-crs"
        ? "ifc-map-conversion"
        : "explicit-user-input"
    )
  ) {
    throw new TypeError(
      `federated renderer source ${index} alignment provenance is invalid`,
    );
  }
  boundedString(
    provenance.reference,
    `federated renderer source ${index} alignment reference`,
  );
  const sourceFromStorage = finiteVector(
    snapshot.coordinateSystem?.sourceFromStorage,
    16,
    `federated renderer source ${index} coordinate matrix`,
  );
  projectBounds(
    sourceToFederation,
    snapshot.geometry?.bounds,
    `federated renderer source ${index} geometry bounds`,
  );
  return {
    federationSourceId,
    session: entry.session,
    snapshot,
    source,
    layer,
    handles,
    alignment,
    sourceToFederation,
    sourceFromStorage,
  };
}

class FederatedRendererSession {
  #bytesRead = 0;
  #disposed = false;
  #mappings;
  #reads = 0;
  #sourceCount;

  constructor(mappings, sourceCount) {
    this.#mappings = mappings;
    this.#sourceCount = sourceCount;
  }

  get state() {
    return Object.freeze({
      disposed: this.#disposed,
      rangeReads: this.#reads,
      rangeBytes: this.#bytesRead,
      sourceCount: this.#sourceCount,
      ownsSourceSessions: false,
    });
  }

  async readRange(handleValue, offset, length, options = {}) {
    aborted(options.signal);
    if (this.#disposed) {
      throw invalidState("federated renderer session is disposed");
    }
    const handle = plainRecord(
      handleValue,
      "federated renderer range handle",
    );
    const mapping = this.#mappings.get(handle.handleId);
    if (
      mapping === undefined ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      !Number.isSafeInteger(length) ||
      length <= 0 ||
      length > mapping.composite.maximumRequestBytes ||
      offset + length > mapping.composite.byteLength ||
      [
        "protocolVersion",
        "sessionId",
        "sourceId",
        "revisionId",
        "snapshotId",
        "layerId",
        "sha256",
        "byteLength",
        "maximumRequestBytes",
      ].some((field) =>
        handle[field] !== mapping.composite[field])
    ) {
      throw new RangeError(
        "federated renderer range read is outside its handle",
      );
    }
    const bytes = await mapping.session.readRange(
      mapping.original,
      offset,
      length,
      options,
    );
    if (!(bytes instanceof Uint8Array) || bytes.byteLength !== length) {
      bytes?.fill?.(0);
      throw new Error(
        "federated renderer source returned invalid range bytes",
      );
    }
    aborted(options.signal);
    this.#reads += 1;
    this.#bytesRead += bytes.byteLength;
    return bytes;
  }

  async dispose() {
    if (this.#disposed) {
      return false;
    }
    this.#disposed = true;
    this.#mappings.clear();
    return true;
  }
}

export async function createFederatedRendererProjection({
  federationId,
  sources,
  maximumSources = 8,
  maximumEntities = 100_000,
  maximumInstances = 100_000,
} = {}) {
  const id = boundedString(
    federationId,
    "federated renderer federation ID",
  );
  if (
    !Number.isSafeInteger(maximumSources) ||
    maximumSources < 1 ||
    maximumSources > 32 ||
    !Number.isSafeInteger(maximumEntities) ||
    maximumEntities <= 0 ||
    maximumEntities > 1_000_000 ||
    !Number.isSafeInteger(maximumInstances) ||
    maximumInstances <= 0 ||
    maximumInstances > 1_000_000 ||
    !Array.isArray(sources) ||
    sources.length < 1 ||
    sources.length > maximumSources
  ) {
    throw new RangeError(
      "federated renderer source count exceeds its bound",
    );
  }
  const entries = sources
    .map(validateSource)
    .sort((left, right) =>
      left.federationSourceId.localeCompare(
        right.federationSourceId,
      ));
  if (
    new Set(entries.map((entry) => entry.federationSourceId))
      .size !== entries.length
  ) {
    throw new RangeError(
      "federated renderer source ID is duplicated",
    );
  }
  let projectedEntities = 0;
  let projectedInstances = 0;
  for (const entry of entries) {
    for (const entity of entry.snapshot.entities) {
      if (entity.renderable !== true) {
        continue;
      }
      if (
        !Array.isArray(entity.primitives) ||
        entity.primitives.length === 0
      ) {
        throw new TypeError(
          "federated renderer source has an invalid renderable entity",
        );
      }
      projectedEntities += 1;
      projectedInstances += entity.primitives.length;
      if (
        projectedEntities > maximumEntities ||
        projectedInstances > maximumInstances
      ) {
        throw new RangeError(
          "federated renderer projection exceeds its entity or instance bound",
        );
      }
    }
  }
  const sourceSeeds = entries.map((entry) => ({
    federationSourceId: entry.federationSourceId,
    fingerprint: entry.source.fingerprint,
    revisionId: entry.snapshot.revisionId,
    snapshotId: entry.snapshot.snapshotId,
    cacheFingerprint: entry.snapshot.cacheFingerprint ?? null,
    format: entry.source.format ?? "ifc",
    sourceToFederation: entry.sourceToFederation,
    sourceFromStorage: entry.sourceFromStorage,
    geometryBounds: entry.snapshot.geometry.bounds,
    ranges: [
      ...entry.snapshot.loadPlan.firstFrameRangeIds,
      ...entry.snapshot.loadPlan.deferredRangeIds,
    ].map((handleId) => {
      const handle = entry.handles.get(handleId);
      return {
        handleId,
        sha256: handle.sha256,
        byteLength: handle.byteLength,
        maximumRequestBytes: handle.maximumRequestBytes,
      };
    }),
    firstFrameRangeIds:
      entry.snapshot.loadPlan.firstFrameRangeIds,
    entities: entry.snapshot.entities
      .filter((entity) => entity.renderable === true)
      .map((entity) => ({
        expressId: entity.expressId,
        globalId: entity.globalId ?? null,
        nativeId: entity.nativeId ?? null,
        externalIdentityToken:
          entity.externalIdentityToken,
        bounds: entity.bounds,
        primitives: entity.primitives,
      })),
  }));
  const sourceProjectionFingerprints = await Promise.all(
    sourceSeeds.map(async (sourceSeed) =>
      `sha256:${await digestText(JSON.stringify({
        schema: BIM_FEDERATED_RENDERER_PROJECTION_SCHEMA,
        source: sourceSeed,
      }))}`),
  );
  const seed = JSON.stringify({
    schema: BIM_FEDERATED_RENDERER_PROJECTION_SCHEMA,
    federationId: id,
    sources: sourceSeeds,
  });
  const digest = await digestText(seed);
  const fingerprint = `sha256:${digest}`;
  const protocolVersion = SOURCE_PROTOCOL;
  const sessionId =
    `session:federated-renderer:${digest.slice(0, 24)}`;
  const sourceId =
    `source:federated-renderer:${digest.slice(0, 24)}`;
  const revisionId = `source-snapshot:${fingerprint}`;
  const snapshotId =
    `snapshot:federated-renderer:${digest}:0`;
  const layerId = "layer:federated-renderer:base-3d";
  const mappings = new Map();
  const handleIds = new Map();
  const rangeHandles = [];
  const firstFrameRangeIds = [];
  const deferredRangeIds = [];
  for (const [sourceIndex, entry] of entries.entries()) {
    for (
      const [rangeIndex, original] of
        [
          ...entry.snapshot.loadPlan.firstFrameRangeIds,
          ...entry.snapshot.loadPlan.deferredRangeIds,
        ].map((handleId) => entry.handles.get(handleId)).entries()
    ) {
      const handleId =
        `range:federated:${sourceIndex}:${rangeIndex}`;
      const composite = deepFreeze({
        protocolVersion,
        sessionId,
        sourceId,
        revisionId,
        snapshotId,
        layerId,
        handleId,
        mediaType: GEOMETRY_MEDIA_TYPE,
        byteLength: original.byteLength,
        maximumRequestBytes: original.maximumRequestBytes,
        sha256: original.sha256,
        expiresAt: null,
        disposeWithSession: true,
      });
      mappings.set(handleId, {
        composite,
        original,
        session: entry.session,
      });
      handleIds.set(
        `${sourceIndex}:${original.handleId}`,
        handleId,
      );
      rangeHandles.push(composite);
      if (
        entry.snapshot.loadPlan.firstFrameRangeIds.includes(
          original.handleId,
        )
      ) {
        firstFrameRangeIds.push(handleId);
      } else {
        deferredRangeIds.push(handleId);
      }
    }
  }
  const entities = [];
  const identityMap = [];
  const projectedSourceBounds = [];
  let nextExpressId = 1;
  for (const [sourceIndex, entry] of entries.entries()) {
    projectedSourceBounds.push(projectBounds(
      entry.sourceToFederation,
      entry.snapshot.geometry.bounds,
      `federated renderer source ${sourceIndex} geometry bounds`,
    ));
    const federationFromStorage = multiplyTransform(
      entry.sourceToFederation,
      entry.sourceFromStorage,
    );
    for (
      const [entityIndex, sourceEntity] of
        entry.snapshot.entities.entries()
    ) {
      if (
        sourceEntity.renderable !== true ||
        !Array.isArray(sourceEntity.primitives) ||
        sourceEntity.primitives.length === 0
      ) {
        continue;
      }
      const compositeNativeId =
        `federated:${sourceIndex}:${entityIndex}`;
      const renderId =
        `render:federated:${digest.slice(0, 16)}:` +
        `${sourceIndex}:${entityIndex}`;
      const pickId =
        `pick:federated:${digest.slice(0, 16)}:` +
        `${sourceIndex}:${entityIndex}`;
      const externalIdentityToken =
        `federated-native:${fingerprint}:` +
        `${sourceIndex}:${entityIndex}`;
      const nativeIdentity = sourceEntity.nativeId === undefined
        ? {
            expressId: sourceEntity.expressId,
            globalId: sourceEntity.globalId ?? null,
            externalIdentityToken:
              sourceEntity.externalIdentityToken,
          }
        : {
            nativeId: sourceEntity.nativeId,
            localNumericId:
              sourceEntity.localNumericId ??
              sourceEntity.expressId,
            globalId: null,
            externalIdentityToken:
              sourceEntity.externalIdentityToken,
          };
      const projectedBounds = projectBounds(
        entry.sourceToFederation,
        sourceEntity.bounds,
        `federated renderer entity ${sourceIndex}:${entityIndex} bounds`,
      );
      const primitives = sourceEntity.primitives.map(
        (primitive, primitiveIndex) => {
          const rangeId = handleIds.get(
            `${sourceIndex}:${primitive.slice?.rangeId}`,
          );
          if (rangeId === undefined) {
            throw new RangeError(
              "federated renderer primitive range is unavailable",
            );
          }
          return {
            geometryExpressId: positiveInteger(
              primitive.geometryExpressId,
              "federated renderer geometry identity",
            ),
            vertexCount: positiveInteger(
              primitive.vertexCount,
              "federated renderer vertex count",
            ),
            indexCount: positiveInteger(
              primitive.indexCount,
              "federated renderer index count",
            ),
            triangles: positiveInteger(
              primitive.triangles,
              "federated renderer triangle count",
            ),
            transform: multiplyTransform(
              federationFromStorage,
              finiteVector(
                primitive.transform,
                16,
                `federated renderer primitive ${primitiveIndex} transform`,
              ),
            ),
            color: finiteVector(
              primitive.color,
              4,
              `federated renderer primitive ${primitiveIndex} color`,
            ),
            slice: {
              rangeId,
              offset: positiveInteger(
                primitive.slice?.offset,
                "federated renderer primitive slice offset",
              ),
              byteLength: positiveInteger(
                primitive.slice?.byteLength,
                "federated renderer primitive slice byteLength",
              ),
            },
          };
        },
      );
      entities.push({
        expressId: nextExpressId,
        localNumericId: nextExpressId,
        globalId: sourceEntity.globalId ?? null,
        nativeId: compositeNativeId,
        renderable: true,
        renderId,
        pickId,
        externalIdentityToken,
        bounds: projectedBounds,
        primitives,
        federationSourceId: entry.federationSourceId,
        sourceRevisionId: entry.snapshot.revisionId,
        nativeIdentity,
      });
      identityMap.push({
        compositeExpressId: nextExpressId,
        compositeNativeId,
        renderId,
        pickId,
        sourceRenderId: sourceEntity.renderId,
        sourcePickId: sourceEntity.pickId,
        federationSourceId: entry.federationSourceId,
        sourceRevisionId: entry.snapshot.revisionId,
        sourceProjectionFingerprint:
          sourceProjectionFingerprints[sourceIndex],
        nativeIdentity,
      });
      nextExpressId += 1;
    }
  }
  if (entities.length === 0) {
    throw new RangeError(
      "federated renderer projection has no renderable entities",
    );
  }
  const geometryBounds = {
    min: [0, 1, 2].map((axis) =>
      Math.min(...projectedSourceBounds.map(
        (bounds) => bounds.min[axis],
      ))),
    max: [0, 1, 2].map((axis) =>
      Math.max(...projectedSourceBounds.map(
        (bounds) => bounds.max[axis],
      ))),
  };
  const snapshot = deepFreeze({
    protocolVersion,
    sessionId,
    sourceId,
    revisionId,
    snapshotId,
    layerId,
    sequence: 0,
    source: {
      format: "federated",
      fingerprint,
      profile: "bounded-multi-source-read-only-v0.1",
      sourceRole: "derived-federated-display-cache",
      semanticAuthority: false,
      writeAuthority: false,
      roundTripAuthority: false,
    },
    coordinateSystem: {
      storage: "federation-local",
      source: "federation-local",
      sourceFromStorage: [...IDENTITY_MATRIX],
    },
    geometry: {
      bounds: geometryBounds,
      sources: entries.length,
      entities: entities.length,
      instances: entities.reduce(
        (sum, entity) => sum + entity.primitives.length,
        0,
      ),
      representationAuthority: "derived-display-cache",
    },
    entities,
    layers: [{
      layerId,
      sourceId,
      revisionId,
      kind: "federated",
      representation: "3d",
      order: 0,
      visible: true,
      rangeHandles,
    }],
    loadPlan: {
      firstFrameRangeIds,
      deferredRangeIds,
    },
    federation: {
      schema: BIM_FEDERATED_RENDERER_PROJECTION_SCHEMA,
      federationId: id,
      sourceCount: entries.length,
      sourceIdentityMerged: false,
      ownsSourceSessions: false,
      limits: {
        maximumSources,
        maximumEntities,
        maximumInstances,
      },
      sourceSlots: entries.map((entry, index) => ({
        federationSourceId: entry.federationSourceId,
        sourceRevisionId: entry.snapshot.revisionId,
        sourceProjectionFingerprint:
          sourceProjectionFingerprints[index],
        format: entry.source.format ?? "ifc",
        alignmentMethod: entry.alignment.method,
      })),
    },
  });
  return Object.freeze({
    schema: BIM_FEDERATED_RENDERER_PROJECTION_SCHEMA,
    snapshot,
    session: new FederatedRendererSession(
      mappings,
      entries.length,
    ),
    identityMap: deepFreeze(identityMap),
  });
}
