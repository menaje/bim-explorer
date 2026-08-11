export const BIM_REFERENCE_MESH_EXPLORER_CONTRACT =
  "bim-explorer-reference-mesh-explorer/0.1";

const PICK_RECEIPT_SCHEMA =
  "bim-explorer-bim-renderer-3d-pick-receipt/0.1";
const DEFAULT_LIMITS = Object.freeze({
  maximumDomRows: 64,
  maximumSearchResults: 500,
  searchPageSize: 25,
});

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

function positiveInteger(value, label, maximum) {
  if (
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > maximum
  ) {
    throw new RangeError(
      `${label} must be in the range 1..${maximum}`,
    );
  }
  return value;
}

function validateLimits(overrides) {
  const value = {
    ...DEFAULT_LIMITS,
    ...(overrides ?? {}),
  };
  positiveInteger(
    value.maximumDomRows,
    "reference explorer maximumDomRows",
    DEFAULT_LIMITS.maximumDomRows,
  );
  positiveInteger(
    value.maximumSearchResults,
    "reference explorer maximumSearchResults",
    DEFAULT_LIMITS.maximumSearchResults,
  );
  positiveInteger(
    value.searchPageSize,
    "reference explorer searchPageSize",
    DEFAULT_LIMITS.searchPageSize,
  );
  return Object.freeze(value);
}

function context(snapshot) {
  const value = {};
  for (const field of [
    "protocolVersion",
    "sessionId",
    "sourceId",
    "revisionId",
    "snapshotId",
    "layerId",
  ]) {
    if (
      typeof snapshot[field] !== "string" ||
      snapshot[field].length === 0
    ) {
      throw new TypeError(
        `reference explorer snapshot ${field} is invalid`,
      );
    }
    value[field] = snapshot[field];
  }
  return Object.freeze(value);
}

function validateEntity(value, seenExpressIds, seenNativeIds) {
  const entity = plainRecord(value, "reference mesh entity");
  if (
    !Number.isSafeInteger(entity.expressId) ||
    entity.expressId <= 0 ||
    entity.localNumericId !== entity.expressId ||
    seenExpressIds.has(entity.expressId) ||
    typeof entity.nativeId !== "string" ||
    entity.nativeId.length === 0 ||
    seenNativeIds.has(entity.nativeId) ||
    entity.globalId !== null ||
    entity.semanticAuthority !== false ||
    typeof entity.name !== "string" ||
    entity.name.length === 0 ||
    typeof entity.sourceClass !== "string" ||
    entity.sourceClass.length === 0 ||
    typeof entity.renderId !== "string" ||
    typeof entity.pickId !== "string" ||
    typeof entity.externalIdentityToken !== "string" ||
    !Array.isArray(entity.primitives) ||
    entity.primitives.length === 0
  ) {
    throw new TypeError(
      "reference mesh entity identity is invalid",
    );
  }
  seenExpressIds.add(entity.expressId);
  seenNativeIds.add(entity.nativeId);
  return structuredClone(entity);
}

function row(entity, selected) {
  return {
    childCount: 0,
    depth: 0,
    expanded: false,
    expressId: entity.expressId,
    globalId: null,
    ifcClass: entity.sourceClass,
    kind: "reference",
    name: entity.name,
    nativeId: entity.nativeId,
    parentExpressId: null,
    parentRelation: "reference-node",
    pickId: entity.pickId,
    renderId: entity.renderId,
    selected,
  };
}

function searchItem(entity, query) {
  const fields = {
    name: entity.name,
    nativeId: entity.nativeId,
    sourceClass: entity.sourceClass,
    node: String(entity.provenance?.nodeIndex ?? ""),
    mesh: String(entity.provenance?.meshIndex ?? ""),
  };
  const matchedFields = Object.entries(fields)
    .filter(([, value]) =>
      value.toLocaleLowerCase().includes(query))
    .map(([field]) => field);
  if (matchedFields.length === 0) {
    return null;
  }
  return {
    expressId: entity.expressId,
    globalId: null,
    ifcClass: entity.sourceClass,
    matchedFields,
    name: entity.name,
    nativeId: entity.nativeId,
    pickId: entity.pickId,
    renderId: entity.renderId,
  };
}

function referenceMetadata(entity, snapshot) {
  const primitive = entity.primitives[0];
  const color = primitive.color
    .map((value) => Number(value.toFixed(4)))
    .join(", ");
  return [
    {
      label: "Native ID",
      value: entity.nativeId,
    },
    {
      label: "Source role",
      value: snapshot.source.sourceRole,
    },
    {
      label: "Node / mesh / primitive",
      value: [
        entity.provenance?.nodeIndex,
        entity.provenance?.meshIndex,
        entity.provenance?.primitiveIndex,
      ].join(" / "),
    },
    {
      label: "Geometry",
      value:
        `${primitive.vertexCount} vertices · ` +
        `${primitive.triangles} triangles`,
    },
    {
      label: "Base color",
      value: color,
    },
    {
      label: "Generator",
      value:
        snapshot.referenceMetadata?.generator ??
        "not declared",
    },
    {
      label: "Required extensions",
      value:
        snapshot.referenceMetadata?.extensionsRequired
          ?.join(", ") || "none",
    },
  ];
}

function inspector(entity, snapshot) {
  return {
    identity: {
      expressId: entity.expressId,
      globalId: null,
      ifcClass: entity.sourceClass,
      kind: "reference",
      localNumericId: entity.localNumericId,
      name: entity.name,
      nativeId: entity.nativeId,
      pickId: entity.pickId,
      renderId: entity.renderId,
    },
    groups: {
      classifications: [],
      containment: [],
      materials: [],
      propertySets: [],
      quantities: [],
      referenceMetadata: referenceMetadata(entity, snapshot),
      relations: [],
      type: [],
    },
    coverage: {
      limitations: [
        {
          capability: "bim-semantics",
          status: "not-authoritative",
        },
        {
          capability: "write-round-trip",
          status: "blocked",
        },
      ],
      supported: [
        "source-native-identity",
        "bounded-node-mesh-metadata",
        "read-only-render-pick",
      ],
    },
  };
}

export class ReferenceMeshExplorer {
  #context;
  #disposed = false;
  #entities;
  #entityByExpressId;
  #entityByNativeId;
  #initialized = false;
  #inspector = null;
  #limits;
  #search = null;
  #selected = null;
  #session;
  #snapshot;
  #visibility = {
    mode: "show-all",
    renderIds: [],
    resultExpressIds: [],
  };

  constructor({
    limits,
    session,
    snapshot,
  } = {}) {
    if (
      typeof session?.getEntity !== "function" ||
      typeof session?.dispose !== "function"
    ) {
      throw new TypeError(
        "reference explorer session is invalid",
      );
    }
    const current = plainRecord(
      snapshot,
      "reference explorer snapshot",
    );
    if (
      !["gltf", "glb"].includes(current.source?.format) ||
      current.source?.sourceRole !==
        "derived-or-reference-mesh" ||
      current.source?.semanticAuthority !== false ||
      !Array.isArray(current.entities) ||
      current.entities.length === 0
    ) {
      throw new TypeError(
        "reference explorer source profile is invalid",
      );
    }
    const expressIds = new Set();
    const nativeIds = new Set();
    this.#entities = current.entities.map((entity) =>
      validateEntity(entity, expressIds, nativeIds));
    this.#entityByExpressId = new Map(
      this.#entities.map((entity) => [
        entity.expressId,
        entity,
      ]),
    );
    this.#entityByNativeId = new Map(
      this.#entities.map((entity) => [
        entity.nativeId,
        entity,
      ]),
    );
    this.#context = context(current);
    this.#limits = validateLimits(limits);
    this.#session = session;
    this.#snapshot = current;
  }

  #active() {
    if (this.#disposed) {
      throw new DOMException(
        "reference explorer is disposed",
        "InvalidStateError",
      );
    }
  }

  get state() {
    this.#active();
    const visibleRows = this.#entities
      .slice(0, this.#limits.maximumDomRows)
      .map((entity) =>
        row(
          entity,
          this.#selected?.expressId === entity.expressId,
        ));
    const searchItems = this.#search?.items ?? [];
    const searchTotal = this.#search?.total ?? 0;
    return deepFreeze({
      contract: BIM_REFERENCE_MESH_EXPLORER_CONTRACT,
      source: {
        fingerprint: this.#snapshot.source.fingerprint,
        format: this.#snapshot.source.format,
        revisionId: this.#context.revisionId,
        snapshotId: this.#context.snapshotId,
      },
      tree: {
        rows: visibleRows,
        visibleLoadedRows: this.#entities.length,
        omittedDomRows: Math.max(
          0,
          this.#entities.length - visibleRows.length,
        ),
        expandedExpressIds: [],
        pages: [],
        loadedItems: this.#entities.length,
        maximumLoadedItems: this.#entities.length,
        maximumDomRows: this.#limits.maximumDomRows,
        selectedExpressId:
          this.#selected?.expressId ?? null,
        selectedRevealed: this.#selected === null
          ? false
          : visibleRows.some((item) =>
            item.expressId === this.#selected.expressId),
      },
      search: {
        query: this.#search?.query ?? "",
        scopeExpressIds: [],
        items: searchItems,
        loaded: searchItems.length,
        total: searchTotal,
        omitted: Math.max(0, searchTotal - searchItems.length),
        sourceRemaining: Math.max(
          0,
          searchTotal - searchItems.length,
        ),
        hasMore:
          searchItems.length < searchTotal &&
          searchItems.length < this.#limits.maximumSearchResults,
        nextCursor: null,
        limitedByExplorer:
          searchTotal > this.#limits.maximumSearchResults,
        maximumResults: this.#limits.maximumSearchResults,
      },
      selection: this.#selected,
      inspector: this.#inspector,
      visibility: this.#visibility,
      savedView: {
        storage: false,
        available: false,
      },
    });
  }

  async initialize() {
    this.#active();
    if (this.#initialized) {
      return this.state;
    }
    this.#initialized = true;
    return this.state;
  }

  async #select(entity, origin) {
    this.#active();
    const resolved = await this.#session.getEntity({
      ...this.#context,
      nativeId: entity.nativeId,
    });
    if (
      resolved?.nativeId !== entity.nativeId ||
      resolved?.externalIdentityToken !==
        entity.externalIdentityToken ||
      resolved?.globalId !== null
    ) {
      throw new RangeError(
        "reference explorer identity is inconsistent",
      );
    }
    this.#selected = {
      expressId: entity.expressId,
      globalId: null,
      ifcClass: entity.sourceClass,
      kind: "reference",
      localNumericId: entity.localNumericId,
      name: entity.name,
      nativeId: entity.nativeId,
      origin,
      pickId: entity.pickId,
      renderId: entity.renderId,
    };
    this.#inspector = inspector(entity, this.#snapshot);
    return this.state.selection;
  }

  async selectExpressId(expressId, {
    origin = "tree",
  } = {}) {
    const entity = this.#entityByExpressId.get(expressId);
    if (entity === undefined) {
      throw new RangeError(
        "reference identity is outside the snapshot",
      );
    }
    return this.#select(entity, origin);
  }

  async selectPick(pickReceipt) {
    const pick = plainRecord(
      pickReceipt,
      "reference explorer pick",
    );
    const entity = this.#entityByNativeId.get(
      pick.identity?.nativeId,
    );
    if (
      pick.schema !== PICK_RECEIPT_SCHEMA ||
      pick.status !== "hit" ||
      pick.source?.fingerprint !==
        this.#snapshot.source.fingerprint ||
      pick.source?.revisionId !== this.#context.revisionId ||
      entity === undefined ||
      pick.identity?.globalId !== null ||
      pick.identity?.renderId !== entity.renderId ||
      pick.identity?.pickId !== entity.pickId
    ) {
      throw new RangeError(
        "reference pick is outside the active snapshot",
      );
    }
    return this.#select(entity, "3d");
  }

  async search(query) {
    this.#active();
    if (typeof query !== "string") {
      throw new TypeError(
        "reference search query must be a string",
      );
    }
    const normalized = query.trim().toLocaleLowerCase();
    if (normalized.length === 0) {
      this.#search = null;
      return this.state.search;
    }
    const all = [];
    let total = 0;
    for (const entity of this.#entities) {
      const item = searchItem(entity, normalized);
      if (item === null) {
        continue;
      }
      total += 1;
      if (all.length < this.#limits.maximumSearchResults) {
        all.push(item);
      }
    }
    this.#search = {
      all,
      items: all.slice(0, this.#limits.searchPageSize),
      query: query.trim(),
      total,
    };
    return this.state.search;
  }

  async loadMoreSearch() {
    this.#active();
    if (this.#search === null) {
      return this.state.search;
    }
    this.#search.items = this.#search.all.slice(
      0,
      Math.min(
        this.#search.items.length +
          this.#limits.searchPageSize,
        this.#limits.maximumSearchResults,
      ),
    );
    return this.state.search;
  }

  async setVisibility(mode) {
    this.#active();
    if (![
      "isolate-results",
      "isolate-selection",
      "show-all",
    ].includes(mode)) {
      throw new TypeError(
        "reference visibility mode is invalid",
      );
    }
    const identities = mode === "isolate-results"
      ? this.#search?.items ?? []
      : mode === "isolate-selection" &&
          this.#selected !== null
        ? [this.#selected]
        : [];
    const renderIds = [
      ...new Set(identities.map((item) => item.renderId)),
    ];
    if (mode !== "show-all" && renderIds.length === 0) {
      throw new RangeError(
        "reference visibility scope is empty",
      );
    }
    this.#visibility = {
      mode,
      renderIds,
      resultExpressIds: identities.map((item) =>
        item.expressId),
    };
    return deepFreeze({
      source: {
        fingerprint: this.#snapshot.source.fingerprint,
        revisionId: this.#context.revisionId,
      },
      isolateRenderIds:
        mode === "show-all" ? null : renderIds,
      selectedPickIds:
        this.#selected === null
          ? []
          : [this.#selected.pickId],
    });
  }

  async expand(expressId) {
    if (!this.#entityByExpressId.has(expressId)) {
      throw new RangeError(
        "reference tree identity is outside the snapshot",
      );
    }
    return this.state.tree;
  }

  async collapse(expressId) {
    return this.expand(expressId);
  }

  async selectRelation() {
    throw new DOMException(
      "reference mesh has no BIM relation authority",
      "NotSupportedError",
    );
  }

  async dispose() {
    if (this.#disposed) {
      return false;
    }
    this.#disposed = true;
    this.#entities.length = 0;
    this.#entityByExpressId.clear();
    this.#entityByNativeId.clear();
    this.#search = null;
    this.#selected = null;
    this.#inspector = null;
    return true;
  }
}

export function createReferenceMeshExplorer(options) {
  return new ReferenceMeshExplorer(options);
}
