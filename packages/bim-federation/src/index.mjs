export const BIM_FEDERATION_CONTRACT =
  "bim-explorer-federation/0.1";
export const BIM_FEDERATION_SOURCE_SCHEMA =
  "bim-explorer-federation-source/0.1";
export const BIM_FEDERATION_ALIGNMENT_SCHEMA =
  "bim-explorer-federation-alignment/0.1";
export const BIM_FEDERATION_SELECTION_SCHEMA =
  "bim-explorer-federation-selection/0.1";
export const BIM_FEDERATION_SAVED_VIEW_SCHEMA =
  "bim-explorer-federation-saved-view/0.1";
export const BIM_REFERENCE_FORMAT_REGISTRY_SCHEMA =
  "bim-explorer-reference-format-registry/0.1";

const SOURCE_PROTOCOL = "bim-explorer-bim-source/0.2";
const GLTF_REFERENCE_CONTRACT =
  "bim-explorer-gltf-reference-source/0.1";
const GLTF_REFERENCE_PROFILE =
  "gltf-2.0-bounded-reference-mesh-v0.1";
const SOURCE_STATES = new Set(["ready", "partial", "stale"]);
const MAXIMUM_SOURCES = 32;
const MAXIMUM_SELECTION_ITEMS = 512;
const MAXIMUM_SECTION_PLANES = 6;
const LOCAL_PATH_PATTERN =
  /(?:\/Users\/|\/Volumes\/|[A-Z]:\\)/u;

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

function boundedString(value, label, maximum = 256) {
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

function unsupported(message) {
  return new DOMException(message, "NotSupportedError");
}

function validateSourceState(value, reason) {
  if (!SOURCE_STATES.has(value)) {
    throw new TypeError("federation source state is unsupported");
  }
  if (value === "ready") {
    if (reason !== null && reason !== undefined) {
      throw new TypeError(
        "ready federation source cannot carry a reason",
      );
    }
    return null;
  }
  return boundedString(
    reason,
    "federation source state reason",
    512,
  );
}

function validateSnapshot(snapshot) {
  const value = plainRecord(snapshot, "BIM source snapshot");
  const source = plainRecord(value.source, "BIM source descriptor");
  const format = source.format ?? "ifc";
  const reference = format !== "ifc";
  const sourceRole = source.sourceRole ??
    (format === "ifc"
      ? "semantic-bim-source"
      : null);
  if (
    value.protocolVersion !== SOURCE_PROTOCOL ||
    !/^sha256:[0-9a-f]{64}$/u.test(source.fingerprint ?? "") ||
    value.revisionId !==
      `source-snapshot:${source.fingerprint}` ||
    typeof value.sourceId !== "string" ||
    !Array.isArray(value.entities)
  ) {
    throw new TypeError("BIM source snapshot identity is invalid");
  }
  if (
    reference &&
    (
      !["gltf", "glb"].includes(format) ||
      source.gltfVersion !== "2.0" ||
      source.profile !== GLTF_REFERENCE_PROFILE ||
      source.mediaType !== (
        format === "glb"
          ? "model/gltf-binary"
          : "model/gltf+json"
      ) ||
      source.adapter?.id !==
        "@bim-explorer/gltf-reference-source" ||
      value.referenceMetadata?.schema !==
        GLTF_REFERENCE_CONTRACT ||
      value.coordinateSystem?.storage !==
        "gltf-local-meter-y-up" ||
      value.coordinateSystem?.source !==
        "gltf-local-meter-y-up" ||
      value.geometry?.representationAuthority !==
        "derived-display-cache"
    )
  ) {
    throw new TypeError(
      "reference source profile is not qualified",
    );
  }
  const entityByExpressId = new Map();
  const entityByNativeId = new Map();
  for (const item of value.entities) {
    const entity = plainRecord(item, "BIM source entity");
    if (
      !Number.isSafeInteger(entity.expressId) ||
      entity.expressId <= 0 ||
      entityByExpressId.has(entity.expressId)
    ) {
      throw new TypeError("BIM source entity identity is invalid");
    }
    if (
      entity.globalId !== null &&
      entity.globalId !== undefined &&
      typeof entity.globalId !== "string"
    ) {
      throw new TypeError("BIM source GlobalId is invalid");
    }
    if (reference) {
      if (
        sourceRole !== "derived-or-reference-mesh" ||
        source.semanticAuthority !== false ||
        source.writeAuthority !== false ||
        source.roundTripAuthority !== false ||
        entity.globalId !== null ||
        entity.localNumericId !== entity.expressId ||
        entity.semanticAuthority !== false ||
        typeof entity.nativeId !== "string" ||
        entity.nativeId.length === 0 ||
        entity.nativeId.length > 256 ||
        /[\u0000-\u001f\u007f]/u.test(entity.nativeId) ||
        LOCAL_PATH_PATTERN.test(entity.nativeId) ||
        entityByNativeId.has(entity.nativeId) ||
        typeof entity.externalIdentityToken !== "string" ||
        entity.externalIdentityToken !==
          `gltf-native:${source.fingerprint}:${entity.nativeId}`
      ) {
        throw new TypeError(
          "reference source native identity or authority is invalid",
        );
      }
      entityByNativeId.set(entity.nativeId, entity);
    }
    entityByExpressId.set(entity.expressId, entity);
  }
  return {
    snapshot: value,
    source,
    format,
    sourceRole,
    entityByExpressId,
    entityByNativeId,
  };
}

function validateAlignment(value, revisionId) {
  const alignment = plainRecord(
    value,
    "federation source alignment",
  );
  if (
    alignment.schema !== BIM_FEDERATION_ALIGNMENT_SCHEMA ||
    !["aligned", "unaligned"].includes(alignment.status)
  ) {
    throw new TypeError("federation source alignment is invalid");
  }
  if (alignment.status === "unaligned") {
    return deepFreeze({
      schema: BIM_FEDERATION_ALIGNMENT_SCHEMA,
      status: "unaligned",
      reason: boundedString(
        alignment.reason,
        "unaligned source reason",
        512,
      ),
      sourceRevisionId: revisionId,
      datumTransformation: "not-performed",
    });
  }
  if (
    !["projected-same-crs", "explicit"].includes(
      alignment.method,
    ) ||
    alignment.numericPrecision !== "float64" ||
    alignment.datumTransformation !== "not-performed" ||
    alignment.sourceRevisionId !== revisionId
  ) {
    throw new TypeError(
      "aligned source precision or provenance is invalid",
    );
  }
  const provenance = plainRecord(
    alignment.provenance,
    "federation alignment provenance",
  );
  if (
    !["ifc-map-conversion", "explicit-user-input"].includes(
      provenance.kind,
    )
  ) {
    throw new TypeError(
      "federation alignment provenance kind is unsupported",
    );
  }
  const sourceToFederation = finiteVector(
    alignment.sourceToFederation,
    16,
    "source-to-federation matrix",
  );
  if (Math.abs(sourceToFederation[15]) < Number.EPSILON) {
    throw new RangeError(
      "source-to-federation matrix is not projectable",
    );
  }
  return deepFreeze({
    schema: BIM_FEDERATION_ALIGNMENT_SCHEMA,
    status: "aligned",
    method: alignment.method,
    sourceRevisionId: revisionId,
    sourceCoordinateSystem: boundedString(
      alignment.sourceCoordinateSystem,
      "source coordinate system",
    ),
    federationCoordinateSystem: boundedString(
      alignment.federationCoordinateSystem,
      "federation coordinate system",
    ),
    federationOrigin: finiteVector(
      alignment.federationOrigin,
      3,
      "federation origin",
    ),
    sourceToFederation,
    numericPrecision: "float64",
    datumTransformation: "not-performed",
    provenance: {
      kind: provenance.kind,
      reference: boundedString(
        provenance.reference,
        "alignment provenance reference",
        512,
      ),
    },
  });
}

export function createProjectedCrsAlignment({
  snapshot,
  federationCoordinateSystem,
  federationOrigin,
}) {
  const current = validateSnapshot(snapshot);
  const georeferencing = plainRecord(
    current.snapshot.georeferencing,
    "BIM source georeferencing",
  );
  if (
    georeferencing.status !== "mapped" ||
    georeferencing.projectedCrs?.name !==
      federationCoordinateSystem
  ) {
    throw new RangeError(
      "projected alignment requires one exact mapped CRS",
    );
  }
  const origin = finiteVector(
    federationOrigin,
    3,
    "federation origin",
  );
  const sourceToFederation = finiteVector(
    georeferencing.mapConversion?.mapFromIfcWorld,
    16,
    "IFC map conversion matrix",
  );
  sourceToFederation[12] -= origin[0];
  sourceToFederation[13] -= origin[1];
  sourceToFederation[14] -= origin[2];
  return validateAlignment({
    schema: BIM_FEDERATION_ALIGNMENT_SCHEMA,
    status: "aligned",
    method: "projected-same-crs",
    sourceRevisionId: current.snapshot.revisionId,
    sourceCoordinateSystem:
      georeferencing.projectedCrs.name,
    federationCoordinateSystem,
    federationOrigin: origin,
    sourceToFederation,
    numericPrecision: "float64",
    datumTransformation: "not-performed",
    provenance: {
      kind: "ifc-map-conversion",
      reference:
        `${current.snapshot.sourceId}:` +
        `${georeferencing.mapConversion.expressId}`,
    },
  }, current.snapshot.revisionId);
}

export function createExplicitAlignment({
  sourceRevisionId,
  sourceCoordinateSystem,
  federationCoordinateSystem,
  federationOrigin = [0, 0, 0],
  sourceToFederation,
  reference,
}) {
  return validateAlignment({
    schema: BIM_FEDERATION_ALIGNMENT_SCHEMA,
    status: "aligned",
    method: "explicit",
    sourceRevisionId,
    sourceCoordinateSystem,
    federationCoordinateSystem,
    federationOrigin,
    sourceToFederation,
    numericPrecision: "float64",
    datumTransformation: "not-performed",
    provenance: {
      kind: "explicit-user-input",
      reference,
    },
  }, sourceRevisionId);
}

export function createUnalignedSource({
  sourceRevisionId,
  reason,
}) {
  return validateAlignment({
    schema: BIM_FEDERATION_ALIGNMENT_SCHEMA,
    status: "unaligned",
    sourceRevisionId,
    reason,
  }, sourceRevisionId);
}

const REFERENCE_FORMATS = deepFreeze([
  {
    format: "ifc",
    family: "openbim-semantic",
    sourceRole: "semantic-bim-source",
    authority: {
      geometry: "external-source-document",
      semantics: "external-source-document",
      coordinates: "source-map-conversion-or-explicit",
    },
    capabilities: {
      view: "qualified-ifc4-reference-view-read-only",
      query: "qualified-bounded-semantics",
      write: "blocked-read-only",
      roundTrip: "blocked-no-evidence",
    },
    admitted: true,
    requirement: "exact IFC4 ReferenceView_V1.2 source profile",
  },
  {
    format: "gltf",
    family: "mesh-reference",
    sourceRole: "derived-or-reference-mesh",
    authority: {
      geometry: "reference-only",
      semantics: "not-bim-authority",
      coordinates: "explicit-metadata-required",
    },
    capabilities: {
      view: "qualified-gltf-2.0-bounded-reference-mesh-read-only",
      query: "qualified-bounded-node-mesh-metadata",
      write: "blocked-read-only",
      roundTrip: "blocked-not-source-authority",
    },
    admitted: true,
    requirement:
      "exact bounded glTF 2.0 profile, Khronos Validator and Browser evidence",
  },
  {
    format: "glb",
    family: "mesh-reference",
    sourceRole: "derived-or-reference-mesh",
    authority: {
      geometry: "reference-only",
      semantics: "not-bim-authority",
      coordinates: "explicit-metadata-required",
    },
    capabilities: {
      view: "qualified-gltf-2.0-bounded-reference-mesh-read-only",
      query: "qualified-bounded-node-mesh-metadata",
      write: "blocked-read-only",
      roundTrip: "blocked-not-source-authority",
    },
    admitted: true,
    requirement:
      "exact bounded glTF 2.0 profile, Khronos Validator and Browser evidence",
  },
  ...["las", "laz", "e57"].map((format) => ({
    format,
    family: "point-cloud-reference",
    sourceRole: "survey-reference",
    authority: {
      geometry: "point-observation-reference",
      semantics: "not-bim-authority",
      coordinates: "survey-crs-evidence-required",
    },
    capabilities: {
      view: "held-codec-and-scale-evidence",
      query: "held-point-metadata-profile",
      write: "blocked-read-only",
      roundTrip: "blocked-no-evidence",
    },
    admitted: false,
    requirement:
      "codec rights, CRS, chunking, memory and cleanup evidence",
  })),
  {
    format: "3d-tiles",
    family: "geospatial-reference",
    sourceRole: "site-context-reference",
    authority: {
      geometry: "reference-only",
      semantics: "not-bim-authority",
      coordinates: "geospatial-engine-required",
    },
    capabilities: {
      view: "held-gis-engine-and-tileset-evidence",
      query: "held-bounded-metadata-profile",
      write: "blocked-read-only",
      roundTrip: "blocked-no-evidence",
    },
    admitted: false,
    requirement:
      "3D Tiles/GIS engine, network policy and precision evidence",
  },
  ...["rvt", "dgn"].map((format) => ({
    format,
    family: "native-authoring-bridge",
    sourceRole: "native-sdk-reference",
    authority: {
      geometry: "native-bridge-derived",
      semantics: "native-source-only",
      coordinates: "native-sdk-evidence-required",
    },
    capabilities: {
      view: "held-sdk-and-redistribution-rights",
      query: "held-sdk-and-profile",
      write: "blocked-separate-adapter-gate",
      roundTrip: "blocked-reopen-qualification-required",
    },
    admitted: false,
    requirement:
      "SDK rights, platform package and reopen qualification",
  })),
]);

export function getReferenceFormatRegistry() {
  return deepFreeze({
    schema: BIM_REFERENCE_FORMAT_REGISTRY_SCHEMA,
    formats: structuredClone(REFERENCE_FORMATS),
  });
}

export function getReferenceFormatCapability(format) {
  const normalized = boundedString(
    format,
    "reference format",
    32,
  ).toLowerCase();
  const capability = REFERENCE_FORMATS.find(
    (item) => item.format === normalized,
  );
  if (capability === undefined) {
    throw unsupported(
      `reference format ${normalized} is not registered`,
    );
  }
  return deepFreeze(structuredClone(capability));
}

function cameraDescriptor(value) {
  const camera = plainRecord(value, "federation camera");
  if (
    !["perspective", "orthographic"].includes(
      camera.projection,
    )
  ) {
    throw new TypeError("federation camera projection is invalid");
  }
  const sectionPlanes = camera.sectionPlanes ?? [];
  if (
    !Array.isArray(sectionPlanes) ||
    sectionPlanes.length > MAXIMUM_SECTION_PLANES
  ) {
    throw new RangeError(
      "federation camera section planes exceed their bound",
    );
  }
  return {
    projection: camera.projection,
    position: finiteVector(
      camera.position,
      3,
      "federation camera position",
    ),
    target: finiteVector(
      camera.target,
      3,
      "federation camera target",
    ),
    up: finiteVector(camera.up, 3, "federation camera up"),
    sectionPlanes: sectionPlanes.map((item, index) => {
      const plane = plainRecord(
        item,
        `federation section plane ${index}`,
      );
      if (!Number.isFinite(plane.distance)) {
        throw new TypeError(
          "federation section plane distance must be finite",
        );
      }
      return {
        normal: finiteVector(
          plane.normal,
          3,
          "federation section plane normal",
        ),
        distance: plane.distance,
      };
    }),
  };
}

function publicSourceDescriptor(entry) {
  const reference = entry.format !== "ifc";
  return {
    schema: BIM_FEDERATION_SOURCE_SCHEMA,
    federationSourceId: entry.federationSourceId,
    discipline: entry.discipline,
    owner: entry.owner,
    format: entry.format,
    sourceRole: entry.sourceRole,
    nativeDocument: {
      sourceId: entry.snapshot.sourceId,
      documentId: entry.source.documentId,
      fingerprint: entry.source.fingerprint,
      revisionId: entry.snapshot.revisionId,
      schema: reference
        ? `glTF ${entry.source.gltfVersion}`
        : entry.source.ifcSchema,
      profile: entry.source.profile,
    },
    state: entry.state,
    stateReason: entry.stateReason,
    visible: entry.visible,
    alignment: entry.alignment,
    identityPolicy: {
      namespace:
        `${entry.federationSourceId}@` +
        entry.snapshot.revisionId,
      mergeAcrossSources: false,
      nativeAuthority: reference
        ? "external-reference-mesh"
        : "external-bim-document",
      semanticAuthority: reference
        ? "not-bim-authority"
        : "external-source-document",
    },
  };
}

export function createBimFederation({
  federationId,
  maximumSources = MAXIMUM_SOURCES,
  maximumSelectionItems = MAXIMUM_SELECTION_ITEMS,
} = {}) {
  const id = boundedString(
    federationId,
    "federation ID",
  );
  if (
    !Number.isSafeInteger(maximumSources) ||
    maximumSources <= 0 ||
    maximumSources > MAXIMUM_SOURCES ||
    !Number.isSafeInteger(maximumSelectionItems) ||
    maximumSelectionItems <= 0 ||
    maximumSelectionItems > MAXIMUM_SELECTION_ITEMS
  ) {
    throw new RangeError("federation bounds are invalid");
  }
  const sources = new Map();
  let generation = 0;
  let disposed = false;

  function active() {
    if (disposed) {
      throw invalidState("BIM federation is disposed");
    }
  }

  function sourceEntry(federationSourceId, revisionId) {
    active();
    const sourceId = boundedString(
      federationSourceId,
      "federation source ID",
    );
    const entry = sources.get(sourceId);
    if (
      entry === undefined ||
      entry.snapshot.revisionId !== revisionId
    ) {
      throw invalidState(
        "federation source revision is stale or unavailable",
      );
    }
    return entry;
  }

  function validateSelectionItems(items) {
    if (
      !Array.isArray(items) ||
      items.length === 0 ||
      items.length > maximumSelectionItems
    ) {
      throw new RangeError(
        "federation selection exceeds its bound",
      );
    }
    const seen = new Set();
    return items.map((item, index) => {
      const selection = plainRecord(
        item,
        `federation selection ${index}`,
      );
      const entry = sourceEntry(
        selection.federationSourceId,
        selection.sourceRevisionId,
      );
      const nativeIdentity = plainRecord(
        selection.nativeIdentity,
        "federation native identity",
      );
      const entity = entry.format === "ifc"
        ? entry.entityByExpressId.get(
          nativeIdentity.expressId,
        )
        : entry.entityByNativeId.get(
          nativeIdentity.nativeId,
        );
      if (
        entity === undefined ||
        entity.globalId !== nativeIdentity.globalId ||
        entity.externalIdentityToken !==
          nativeIdentity.externalIdentityToken
      ) {
        throw new RangeError(
          "federation selection is outside its native source",
        );
      }
      const key =
        `${entry.federationSourceId}:` +
        `${entry.snapshot.revisionId}:` +
        (
          entry.format === "ifc"
            ? `express:${entity.expressId}`
            : `native:${entity.nativeId}`
        );
      if (seen.has(key)) {
        throw new RangeError(
          "federation selection contains duplicate identity",
        );
      }
      seen.add(key);
      const projectedIdentity = entry.format === "ifc"
        ? {
          expressId: entity.expressId,
          globalId: entity.globalId ?? null,
          externalIdentityToken:
            entity.externalIdentityToken ?? null,
        }
        : {
          nativeId: entity.nativeId,
          localNumericId:
            entity.localNumericId ?? entity.expressId,
          globalId: null,
          externalIdentityToken:
            entity.externalIdentityToken,
        };
      return {
        key,
        federationSourceId: entry.federationSourceId,
        sourceRevisionId: entry.snapshot.revisionId,
        nativeIdentity: projectedIdentity,
      };
    });
  }

  function createSelection(items) {
    active();
    return deepFreeze({
      schema: BIM_FEDERATION_SELECTION_SCHEMA,
      federationId: id,
      generation,
      items: validateSelectionItems(items),
      identityPolicy: {
        mergeAcrossSources: false,
        sourceSlotRequired: true,
      },
    });
  }

  return Object.freeze({
    get state() {
      return deepFreeze({
        federationId: id,
        generation,
        sources: sources.size,
        disposed,
      });
    },
    getDescriptor() {
      active();
      return deepFreeze({
        contract: BIM_FEDERATION_CONTRACT,
        federationId: id,
        generation,
        maximumSources,
        sources: [...sources.values()]
          .map(publicSourceDescriptor)
          .sort((left, right) =>
            left.federationSourceId.localeCompare(
              right.federationSourceId,
            )),
        authority: {
          mergeSourceIdentity: false,
          mutateNativeSource: false,
          datumTransformation: false,
          spatialAuthority: false,
        },
      });
    },
    addIfcSource({
      federationSourceId,
      snapshot,
      discipline,
      owner,
      alignment,
      state = "ready",
      stateReason = null,
      visible = true,
    }) {
      active();
      if (sources.size >= maximumSources) {
        throw new RangeError(
          "federation source count exceeds its bound",
        );
      }
      const sourceId = boundedString(
        federationSourceId,
        "federation source ID",
      );
      if (sources.has(sourceId)) {
        throw new RangeError(
          "federation source ID already exists",
        );
      }
      const current = validateSnapshot(snapshot);
      if (current.format !== "ifc") {
        throw new TypeError(
          "addIfcSource requires an IFC source snapshot",
        );
      }
      const entry = {
        federationSourceId: sourceId,
        snapshot: current.snapshot,
        source: current.source,
        entityByExpressId: current.entityByExpressId,
        entityByNativeId: current.entityByNativeId,
        format: current.format,
        sourceRole: current.sourceRole,
        discipline: boundedString(
          discipline,
          "federation source discipline",
        ),
        owner: boundedString(
          owner,
          "federation source owner",
        ),
        alignment: validateAlignment(
          alignment,
          current.snapshot.revisionId,
        ),
        state,
        stateReason: validateSourceState(
          state,
          stateReason,
        ),
        visible: visible === true,
      };
      if (typeof visible !== "boolean") {
        throw new TypeError(
          "federation source visibility must be boolean",
        );
      }
      sources.set(sourceId, entry);
      generation += 1;
      return deepFreeze(publicSourceDescriptor(entry));
    },
    addReferenceSource({
      format,
      federationSourceId,
      snapshot,
      discipline,
      owner,
      alignment,
      state = "ready",
      stateReason = null,
      visible = true,
    }) {
      active();
      const capability = getReferenceFormatCapability(format);
      if (!capability.admitted) {
        throw unsupported(
          `${capability.format} source is held: ` +
          capability.capabilities.view,
        );
      }
      if (capability.format === "ifc") {
        throw unsupported(
          "IFC sources require addIfcSource with a bounded snapshot",
        );
      }
      if (sources.size >= maximumSources) {
        throw new RangeError(
          "federation source count exceeds its bound",
        );
      }
      const sourceId = boundedString(
        federationSourceId,
        "federation source ID",
      );
      if (sources.has(sourceId)) {
        throw new RangeError(
          "federation source ID already exists",
        );
      }
      const current = validateSnapshot(snapshot);
      if (
        current.format !== capability.format ||
        current.sourceRole !== capability.sourceRole
      ) {
        throw new TypeError(
          "reference source snapshot does not match its format capability",
        );
      }
      if (typeof visible !== "boolean") {
        throw new TypeError(
          "federation source visibility must be boolean",
        );
      }
      const entry = {
        federationSourceId: sourceId,
        snapshot: current.snapshot,
        source: current.source,
        entityByExpressId: current.entityByExpressId,
        entityByNativeId: current.entityByNativeId,
        format: current.format,
        sourceRole: current.sourceRole,
        discipline: boundedString(
          discipline,
          "federation source discipline",
        ),
        owner: boundedString(
          owner,
          "federation source owner",
        ),
        alignment: validateAlignment(
          alignment,
          current.snapshot.revisionId,
        ),
        state,
        stateReason: validateSourceState(
          state,
          stateReason,
        ),
        visible,
      };
      sources.set(sourceId, entry);
      generation += 1;
      return deepFreeze(publicSourceDescriptor(entry));
    },
    setSourceVisibility({
      federationSourceId,
      sourceRevisionId,
      visible,
    }) {
      if (typeof visible !== "boolean") {
        throw new TypeError(
          "federation source visibility must be boolean",
        );
      }
      const entry = sourceEntry(
        federationSourceId,
        sourceRevisionId,
      );
      if (entry.visible !== visible) {
        entry.visible = visible;
        generation += 1;
      }
      return deepFreeze(publicSourceDescriptor(entry));
    },
    setSourceState({
      federationSourceId,
      sourceRevisionId,
      state,
      reason = null,
    }) {
      const entry = sourceEntry(
        federationSourceId,
        sourceRevisionId,
      );
      entry.stateReason = validateSourceState(state, reason);
      entry.state = state;
      generation += 1;
      return deepFreeze(publicSourceDescriptor(entry));
    },
    transformPoint({
      federationSourceId,
      sourceRevisionId,
      point,
    }) {
      const entry = sourceEntry(
        federationSourceId,
        sourceRevisionId,
      );
      if (entry.alignment.status !== "aligned") {
        throw unsupported(
          "unaligned federation source has no shared coordinate",
        );
      }
      const [x, y, z] = finiteVector(
        point,
        3,
        "source point",
      );
      const matrix = entry.alignment.sourceToFederation;
      const w =
        matrix[3] * x +
        matrix[7] * y +
        matrix[11] * z +
        matrix[15];
      if (!Number.isFinite(w) || Math.abs(w) < Number.EPSILON) {
        throw new RangeError(
          "source point cannot be projected",
        );
      }
      return deepFreeze([
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
      ]);
    },
    createSelection({ items }) {
      return createSelection(items);
    },
    createSavedView({
      viewId,
      camera,
      selection,
    }) {
      active();
      const selected = plainRecord(
        selection,
        "federation selection",
      );
      if (
        selected.schema !== BIM_FEDERATION_SELECTION_SCHEMA ||
        selected.federationId !== id
      ) {
        throw new TypeError(
          "federation saved view selection is incompatible",
        );
      }
      const currentSelection = createSelection(
        selected.items,
      );
      return deepFreeze({
        schema: BIM_FEDERATION_SAVED_VIEW_SCHEMA,
        federationId: id,
        viewId: boundedString(
          viewId,
          "federation saved view ID",
        ),
        sourceStates: [...sources.values()]
          .map((entry) => ({
            federationSourceId:
              entry.federationSourceId,
            sourceRevisionId: entry.snapshot.revisionId,
            visible: entry.visible,
          }))
          .sort((left, right) =>
            left.federationSourceId.localeCompare(
              right.federationSourceId,
            )),
        camera: cameraDescriptor(camera),
        selection: currentSelection,
        identityPolicy: {
          mergeAcrossSources: false,
          staleRevisionRejected: true,
        },
      });
    },
    applySavedView(view) {
      active();
      const saved = plainRecord(
        view,
        "federation saved view",
      );
      if (
        saved.schema !== BIM_FEDERATION_SAVED_VIEW_SCHEMA ||
        saved.federationId !== id ||
        !Array.isArray(saved.sourceStates) ||
        saved.sourceStates.length !== sources.size
      ) {
        throw new TypeError(
          "federation saved view is incompatible",
        );
      }
      const seen = new Set();
      for (const sourceState of saved.sourceStates) {
        const state = plainRecord(
          sourceState,
          "saved source state",
        );
        const entry = sourceEntry(
          state.federationSourceId,
          state.sourceRevisionId,
        );
        if (
          seen.has(entry.federationSourceId) ||
          typeof state.visible !== "boolean"
        ) {
          throw new TypeError(
            "saved source visibility is invalid",
          );
        }
        seen.add(entry.federationSourceId);
      }
      cameraDescriptor(saved.camera);
      const selection = createSelection(
        plainRecord(
          saved.selection,
          "saved federation selection",
        ).items,
      );
      for (const sourceState of saved.sourceStates) {
        sources.get(
          sourceState.federationSourceId,
        ).visible = sourceState.visible;
      }
      generation += 1;
      return deepFreeze({
        schema: BIM_FEDERATION_SAVED_VIEW_SCHEMA,
        federationId: id,
        viewId: saved.viewId,
        generation,
        camera: cameraDescriptor(saved.camera),
        selection,
        sourceStates: structuredClone(saved.sourceStates),
      });
    },
    refreshIfcSource({
      federationSourceId,
      expectedRevisionId,
      snapshot,
      alignment,
      state = "ready",
      stateReason = null,
    }) {
      const previous = sourceEntry(
        federationSourceId,
        expectedRevisionId,
      );
      const current = validateSnapshot(snapshot);
      if (current.format !== "ifc") {
        throw new TypeError(
          "refreshIfcSource requires an IFC source snapshot",
        );
      }
      if (current.snapshot.revisionId === expectedRevisionId) {
        throw new RangeError(
          "federation refresh requires a new source revision",
        );
      }
      const next = {
        ...previous,
        snapshot: current.snapshot,
        source: current.source,
        entityByExpressId: current.entityByExpressId,
        entityByNativeId: current.entityByNativeId,
        format: current.format,
        sourceRole: current.sourceRole,
        alignment: validateAlignment(
          alignment,
          current.snapshot.revisionId,
        ),
        state,
        stateReason: validateSourceState(
          state,
          stateReason,
        ),
      };
      sources.set(previous.federationSourceId, next);
      generation += 1;
      return deepFreeze({
        schema: "bim-explorer-federation-refresh/0.1",
        federationId: id,
        federationSourceId: previous.federationSourceId,
        previousRevisionId: expectedRevisionId,
        currentRevisionId: current.snapshot.revisionId,
        unchangedFederationSources: sources.size - 1,
        priorIdentityPolicy:
          "all-prior-source-selections-are-stale",
        sourceCount: sources.size,
        generation,
      });
    },
    refreshReferenceSource({
      format,
      federationSourceId,
      expectedRevisionId,
      snapshot,
      alignment,
      state = "ready",
      stateReason = null,
    }) {
      const capability = getReferenceFormatCapability(format);
      if (
        !capability.admitted ||
        capability.format === "ifc"
      ) {
        throw unsupported(
          `${capability.format} reference refresh is held`,
        );
      }
      const previous = sourceEntry(
        federationSourceId,
        expectedRevisionId,
      );
      if (previous.format !== capability.format) {
        throw new TypeError(
          "federation reference format cannot change on refresh",
        );
      }
      const current = validateSnapshot(snapshot);
      if (
        current.format !== capability.format ||
        current.sourceRole !== capability.sourceRole ||
        current.snapshot.revisionId === expectedRevisionId
      ) {
        throw new RangeError(
          "federation reference refresh snapshot is invalid",
        );
      }
      const next = {
        ...previous,
        snapshot: current.snapshot,
        source: current.source,
        entityByExpressId: current.entityByExpressId,
        entityByNativeId: current.entityByNativeId,
        format: current.format,
        sourceRole: current.sourceRole,
        alignment: validateAlignment(
          alignment,
          current.snapshot.revisionId,
        ),
        state,
        stateReason: validateSourceState(
          state,
          stateReason,
        ),
      };
      sources.set(previous.federationSourceId, next);
      generation += 1;
      return deepFreeze({
        schema: "bim-explorer-federation-refresh/0.1",
        federationId: id,
        federationSourceId: previous.federationSourceId,
        format: current.format,
        previousRevisionId: expectedRevisionId,
        currentRevisionId: current.snapshot.revisionId,
        unchangedFederationSources: sources.size - 1,
        priorIdentityPolicy:
          "all-prior-source-selections-are-stale",
        sourceCount: sources.size,
        generation,
      });
    },
    async dispose() {
      if (disposed) {
        return deepFreeze({
          federationId: id,
          releasedSources: 0,
          disposed: true,
          repeated: true,
        });
      }
      const releasedSources = sources.size;
      sources.clear();
      disposed = true;
      generation += 1;
      return deepFreeze({
        federationId: id,
        releasedSources,
        disposed: true,
        repeated: false,
      });
    },
  });
}
