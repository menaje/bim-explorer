import {
  BIM_GEOMETRY_MEDIA_TYPE,
  BIM_TEXTURED_GEOMETRY_MEDIA_TYPE,
  BIM_TEXTURED_GEOMETRY_MEDIA_TYPE_V3,
  encodeGltfGeometryRange,
  encodeGltfTexturedGeometryRange,
} from "./geometry.mjs";
import {
  MESHOPT_DECODER_REQUIRED_MESSAGE,
  parseGltfReferenceProfile,
} from "./profile.mjs";

export const GLTF_REFERENCE_SOURCE_CONTRACT =
  "bim-explorer-gltf-reference-source/0.1";
export const BIM_SOURCE_PROTOCOL_VERSION =
  "bim-explorer-bim-source/0.2";

const IDENTITY_MATRIX = Object.freeze([
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

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
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

function invalidState(message) {
  return new DOMException(message, "InvalidStateError");
}

function context(source) {
  return {
    protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
    sessionId: source.sessionId,
    sourceId: source.sourceId,
    revisionId: source.revisionId,
    snapshotId: source.snapshotId,
    layerId: source.layerId,
  };
}

async function sha256(bytes) {
  if (globalThis.crypto?.subtle === undefined) {
    throw new Error("SHA-256 Web Crypto is unavailable");
  }
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    bytes,
  );
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function bundleSha256(bytes, resources, resourceUris) {
  if (resourceUris.length === 0) {
    return await sha256(bytes);
  }
  const resourcesByUri = new Map(
    resources.map((resource) => [resource.uri, resource.bytes]),
  );
  const entries = [];
  for (const uri of resourceUris) {
    const resourceBytes = resourcesByUri.get(uri);
    if (!(resourceBytes instanceof Uint8Array)) {
      throw new Error("glTF external resource digest input is missing");
    }
    entries.push({
      uri,
      byteLength: resourceBytes.byteLength,
      sha256: await sha256(resourceBytes),
    });
  }
  const descriptor = new TextEncoder().encode(JSON.stringify({
    schema: "bim-explorer-gltf-local-resource-bundle/0.1",
    document: {
      byteLength: bytes.byteLength,
      sha256: await sha256(bytes),
    },
    resources: entries,
  }));
  try {
    return await sha256(descriptor);
  } finally {
    descriptor.fill(0);
  }
}

export class GltfReferenceSource {
  #geometryBytes;
  #snapshot;
  #entityIndexes;
  #opened = false;
  #sessionDisposed = false;
  #disposed = false;
  #reads = 0;
  #bytesRead = 0;

  constructor({
    profile,
    sourceDigest,
    geometryBytes,
    geometryDigest,
    geometryMediaType,
    geometryMetadata,
    maximumRequestBytes = 1024 * 1024,
    sessionReadBudgetBytes = geometryBytes.byteLength,
  }) {
    positiveInteger(maximumRequestBytes, "maximumRequestBytes");
    positiveInteger(
      sessionReadBudgetBytes,
      "sessionReadBudgetBytes",
    );
    this.#geometryBytes = Uint8Array.from(geometryBytes);
    this.sourceFingerprint = `sha256:${sourceDigest}`;
    this.sourceId =
      `source:${profile.format}:${sourceDigest.slice(0, 24)}`;
    this.revisionId =
      `source-snapshot:${this.sourceFingerprint}`;
    this.sessionId =
      `session:gltf-reference:${sourceDigest.slice(0, 24)}`;
    this.snapshotId =
      `snapshot:gltf-reference:${sourceDigest}:0`;
    this.layerId = "layer:gltf-reference:base-3d";
    this.maximumRequestBytes = Math.min(
      maximumRequestBytes,
      geometryBytes.byteLength,
    );
    this.sessionReadBudgetBytes = sessionReadBudgetBytes;
    const idPrefix = sourceDigest.slice(0, 16);
    const rangeId = "range:gltf-reference:geometry:0";
    const baseContext = context(this);
    const entities = profile.occurrences.map(
      (occurrence, index) => {
        const record = geometryMetadata.get(
          occurrence.geometryKey,
        );
        const localNumericId = index + 1;
        return deepFreeze({
          expressId: localNumericId,
          localNumericId,
          globalId: null,
          nativeId: occurrence.nativeId,
          name: occurrence.name,
          sourceClass: "gltf-mesh-primitive",
          semanticAuthority: false,
          renderable: true,
          renderId:
            `render:${profile.format}:${idPrefix}:${localNumericId}`,
          pickId:
            `pick:${profile.format}:${idPrefix}:${localNumericId}`,
          externalIdentityToken:
            `gltf-native:${this.sourceFingerprint}:` +
            occurrence.nativeId,
          bounds: occurrence.bounds,
          primitives: [{
            geometryExpressId: record.geometryExpressId,
            vertexCount: record.vertexCount,
            indexCount: record.indexCount,
            triangles: record.triangles,
            slice: {
              rangeId,
              offset: record.slice.offset,
              byteLength: record.slice.byteLength,
            },
            transform: occurrence.transform,
            color: occurrence.color,
            ...([
              BIM_TEXTURED_GEOMETRY_MEDIA_TYPE,
              BIM_TEXTURED_GEOMETRY_MEDIA_TYPE_V3,
            ].includes(geometryMediaType)
              ? { textureIndex: record.textureIndex }
              : {}),
          }],
          provenance: {
            format: profile.format,
            nodeIndex: occurrence.nodeIndex,
            meshIndex: occurrence.meshIndex,
            primitiveIndex: occurrence.primitiveIndex,
          },
        });
      },
    );
    this.#entityIndexes = {
      expressId: new Map(
        entities.map((entity) => [entity.expressId, entity]),
      ),
      nativeId: new Map(
        entities.map((entity) => [entity.nativeId, entity]),
      ),
      renderId: new Map(
        entities.map((entity) => [entity.renderId, entity]),
      ),
      pickId: new Map(
        entities.map((entity) => [entity.pickId, entity]),
      ),
    };
    const handle = deepFreeze({
      ...baseContext,
      handleId: rangeId,
      mediaType: geometryMediaType,
      byteLength: this.#geometryBytes.byteLength,
      maximumRequestBytes: this.maximumRequestBytes,
      sha256: geometryDigest,
      expiresAt: null,
      disposeWithSession: true,
    });
    this.#snapshot = deepFreeze({
      ...baseContext,
      sequence: 0,
      source: {
        documentId:
          `document:${profile.format}:${sourceDigest.slice(0, 32)}`,
        fingerprint: this.sourceFingerprint,
        byteLength: profile.statistics.sourceBytes,
        format: profile.format,
        mediaType: profile.format === "glb"
          ? "model/gltf-binary"
          : "model/gltf+json",
        gltfVersion: profile.asset.version,
        profile: "gltf-2.0-bounded-reference-mesh-v0.1",
        sourceRole: "derived-or-reference-mesh",
        semanticAuthority: false,
        writeAuthority: false,
        roundTripAuthority: false,
        adapter: {
          id: "@bim-explorer/gltf-reference-source",
          version: "0.1.0",
          backend: "bounded-native-js",
          license: "MPL-2.0",
        },
      },
      coordinateSystem: {
        storage: "gltf-local-meter-y-up",
        source: "gltf-local-meter-y-up",
        sourceFromStorage: IDENTITY_MATRIX,
      },
      geometry: {
        bounds: profile.bounds,
        records: profile.statistics.geometryRecords,
        instances: profile.statistics.instances,
        vertices: profile.statistics.vertices,
        triangles: profile.statistics.triangles,
        representationAuthority: "derived-display-cache",
      },
      entities,
      layers: [{
        layerId: this.layerId,
        sourceId: this.sourceId,
        revisionId: this.revisionId,
        kind: "reference",
        representation: "3d",
        order: 0,
        visible: true,
        rangeHandles: [handle],
      }],
      loadPlan: {
        firstFrameRangeIds: [rangeId],
        deferredRangeIds: [],
      },
      referenceMetadata: {
        schema: GLTF_REFERENCE_SOURCE_CONTRACT,
        generator: profile.asset.generator,
        extensionsRequired: profile.extensionsRequired,
        extensionsUsed: profile.extensionsUsed,
        compression: profile.compression,
        appearance: profile.appearance,
        ...(profile.appearanceOmissions === null
          ? {}
          : {
              appearanceOmissions:
                profile.appearanceOmissions,
            }),
        nodeCount: profile.statistics.nodes,
        meshCount: profile.statistics.meshes,
        resourceBundle: {
          schema: "bim-explorer-gltf-local-resource-bundle/0.1",
          documentBytes: profile.resourceBundle.documentBytes,
          externalResourceBytes:
            profile.resourceBundle.externalResourceBytes,
          externalResources:
            profile.resourceBundle.externalResources,
          ...(
            profile.resourceBundle.externalImageResources ===
              undefined &&
            profile.resourceBundle.externalBufferViewImageResources ===
              undefined
            ? {}
            : {
                externalBufferResources:
                  profile.resourceBundle.externalBufferResources,
                ...(profile.resourceBundle.externalImageResources ===
                  undefined
                  ? {}
                  : {
                      externalImageResources:
                        profile.resourceBundle.externalImageResources,
                    }),
                ...(profile.resourceBundle
                    .externalBufferViewImageResources === undefined
                  ? {}
                  : {
                      externalBufferViewImageResources:
                        profile.resourceBundle
                          .externalBufferViewImageResources,
                    }),
              }),
          ...(profile.resourceBundle.embeddedImageResources ===
            undefined
            ? {}
            : {
                embeddedImageBytes:
                  profile.resourceBundle.embeddedImageBytes,
                embeddedImageResources:
                  profile.resourceBundle.embeddedImageResources,
              }),
          networkAtRuntime: false,
        },
        metadataQuery: "bounded-node-mesh-material-projection",
      },
    });
  }

  get state() {
    return Object.freeze({
      opened: this.#opened,
      sessionDisposed: this.#sessionDisposed,
      disposed: this.#disposed,
      rangeReads: this.#reads,
      rangeBytesRead: this.#bytesRead,
      remainingReadBytes: Math.max(
        0,
        this.sessionReadBudgetBytes - this.#bytesRead,
      ),
    });
  }

  #assertSourceOpen() {
    if (this.#disposed) {
      throw invalidState("glTF reference source is disposed");
    }
  }

  #assertSessionOpen() {
    this.#assertSourceOpen();
    if (this.#sessionDisposed) {
      throw invalidState("glTF reference session is disposed");
    }
  }

  #assertContext(value, label) {
    for (const [field, expected] of Object.entries(context(this))) {
      if (value?.[field] !== expected) {
        throw new RangeError(`${label} is outside the snapshot`);
      }
    }
  }

  async open({ protocolVersion, signal } = {}) {
    this.#assertSourceOpen();
    aborted(signal);
    if (this.#opened) {
      throw invalidState("glTF reference source supports one session");
    }
    if (protocolVersion !== BIM_SOURCE_PROTOCOL_VERSION) {
      throw new RangeError(
        `unsupported BIM source protocol ${protocolVersion}`,
      );
    }
    this.#opened = true;
    const descriptor = deepFreeze({
      protocolVersion,
      sessionId: this.sessionId,
      sourceId: this.sourceId,
      currentRevisionId: this.revisionId,
      lastSuccessfulRevisionId: this.revisionId,
      sourceFingerprint: this.sourceFingerprint,
      capabilities: [
        "immutable-snapshot",
        "binary-range-read",
        "entity-resolve",
        "bounded-reference-metadata",
        "source-display-geometry-separation",
        "pick-resolve",
        ...(this.#snapshot.referenceMetadata.appearance === null
          ? []
          : ["bounded-base-color-texture"]),
        ...(this.#snapshot.referenceMetadata
          .appearanceOmissions === undefined
          ? []
          : ["bounded-appearance-omissions"]),
      ],
      resourceBudgetBytes: this.sessionReadBudgetBytes,
      sourceRole: "derived-or-reference-mesh",
      semanticAuthority: false,
      writeAuthority: false,
    });
    return {
      descriptor,
      getSnapshot: async ({ signal: snapshotSignal } = {}) => {
        this.#assertSessionOpen();
        aborted(snapshotSignal);
        return this.#snapshot;
      },
      readRange: async (
        handle,
        offset,
        length,
        { signal: rangeSignal } = {},
      ) => {
        this.#assertSessionOpen();
        aborted(rangeSignal);
        this.#assertContext(handle, "glTF range handle");
        const expected =
          this.#snapshot.layers[0].rangeHandles[0];
        if (
          handle?.handleId !== expected.handleId ||
          handle.mediaType !== expected.mediaType ||
          handle.byteLength !== expected.byteLength ||
          handle.maximumRequestBytes !==
            expected.maximumRequestBytes ||
          handle.sha256 !== expected.sha256
        ) {
          throw new RangeError(
            "glTF range handle is outside the snapshot",
          );
        }
        if (
          !Number.isSafeInteger(offset) ||
          !Number.isSafeInteger(length) ||
          offset < 0 ||
          length <= 0 ||
          length > this.maximumRequestBytes ||
          offset + length > this.#geometryBytes.byteLength
        ) {
          throw new RangeError("glTF range request is invalid");
        }
        if (
          this.#bytesRead + length >
            this.sessionReadBudgetBytes
        ) {
          throw new RangeError(
            "glTF reference read budget is exhausted",
          );
        }
        this.#reads += 1;
        this.#bytesRead += length;
        return this.#geometryBytes.slice(offset, offset + length);
      },
      getEntity: async (
        request,
        { signal: entitySignal } = {},
      ) => {
        this.#assertSessionOpen();
        aborted(entitySignal);
        this.#assertContext(request, "glTF entity request");
        const lookups = Object.entries(this.#entityIndexes)
          .filter(([field]) => request?.[field] !== undefined);
        if (lookups.length !== 1) {
          throw new TypeError(
            "glTF entity request requires one source-local identity",
          );
        }
        const [field, index] = lookups[0];
        const entity = index.get(request[field]);
        if (entity === undefined) {
          throw new RangeError(
            "glTF entity identity is outside the snapshot",
          );
        }
        return entity;
      },
      resolvePick: async (
        request,
        { signal: pickSignal } = {},
      ) => {
        this.#assertSessionOpen();
        aborted(pickSignal);
        this.#assertContext(request, "glTF pick request");
        const entity = this.#entityIndexes.pickId.get(
          request?.pickId,
        );
        if (
          entity === undefined ||
          request.renderId !== entity.renderId
        ) {
          throw new RangeError(
            "glTF pick identity is outside the snapshot",
          );
        }
        return deepFreeze({
          ...context(this),
          nativeId: entity.nativeId,
          globalId: null,
          localNumericId: entity.localNumericId,
          renderId: entity.renderId,
          pickId: entity.pickId,
          externalIdentityToken:
            entity.externalIdentityToken,
        });
      },
      dispose: async () => {
        if (this.#sessionDisposed) {
          return false;
        }
        this.#sessionDisposed = true;
        return true;
      },
    };
  }

  async dispose() {
    if (this.#disposed) {
      return false;
    }
    this.#disposed = true;
    this.#geometryBytes.fill(0);
    this.#geometryBytes = new Uint8Array();
    for (const index of Object.values(this.#entityIndexes)) {
      index.clear();
    }
    return true;
  }
}

export async function createGltfReferenceSource(
  bytes,
  {
    appearancePolicy = "strict",
    limits,
    maximumRequestBytes,
    resources = [],
    sessionReadBudgetBytes,
    signal,
  } = {},
) {
  aborted(signal);
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError("glTF input must be a Uint8Array");
  }
  if (!Array.isArray(resources)) {
    throw new TypeError("glTF external resources must be an array");
  }
  const ownedResources = [];
  try {
    for (const resource of resources) {
      ownedResources.push({
        uri: resource?.uri,
        bytes: resource?.bytes instanceof Uint8Array
          ? Uint8Array.from(resource.bytes)
          : resource?.bytes,
      });
    }
  } catch (error) {
    for (const resource of ownedResources) {
      resource.bytes?.fill?.(0);
    }
    throw error;
  }
  let profile;
  let encoded;
  try {
    try {
      profile = parseGltfReferenceProfile(bytes, {
        appearancePolicy,
        limits,
        resources: ownedResources,
      });
    } catch (error) {
      if (
        error?.name !== "NotSupportedError" ||
        error.message !== MESHOPT_DECODER_REQUIRED_MESSAGE
      ) {
        throw error;
      }
      const { loadMeshoptDecoder } = await import(
        "./meshopt-decoder.mjs"
      );
      const decoder = await loadMeshoptDecoder({ signal });
      profile = parseGltfReferenceProfile(bytes, {
        appearancePolicy,
        limits,
        meshoptDecoder: decoder,
        resources: ownedResources,
      });
    }
    const sourceDigest = await bundleSha256(
      bytes,
      ownedResources,
      profile.externalResourceUris,
    );
    aborted(signal);
    encoded = profile.textures.length === 0
      ? encodeGltfGeometryRange(profile.records)
      : encodeGltfTexturedGeometryRange(
          profile.records,
          profile.textures,
        );
    const geometryDigest = await sha256(encoded.bytes);
    aborted(signal);
    return new GltfReferenceSource({
      profile,
      sourceDigest,
      geometryBytes: encoded.bytes,
      geometryDigest,
      geometryMediaType: encoded.mediaType,
      geometryMetadata: encoded.metadata,
      maximumRequestBytes,
      sessionReadBudgetBytes,
    });
  } finally {
    encoded?.bytes.fill(0);
    for (const record of profile?.records ?? []) {
      record.positions.fill(0);
      record.normals.fill(0);
      record.indices.fill(0);
      record.texcoords?.fill(0);
    }
    for (const texture of profile?.textures ?? []) {
      texture.bytes.fill(0);
    }
    for (const resource of ownedResources) {
      resource.bytes?.fill?.(0);
    }
  }
}

export {
  BIM_GEOMETRY_MEDIA_TYPE,
  BIM_TEXTURED_GEOMETRY_MEDIA_TYPE,
  BIM_TEXTURED_GEOMETRY_MEDIA_TYPE_V3,
  parseGltfReferenceProfile,
};
