export const BIM_SEMANTIC_EXPLORER_CONTRACT =
  "bim-explorer-bim-semantic-explorer/0.1";
export const BIM_SEMANTIC_SAVED_VIEW_SCHEMA =
  "bim-explorer-bim-semantic-saved-view/0.1";

const QUERY_RESULT_SCHEMA =
  "bim-explorer-bim-source-semantic-query-result/0.1";
const PICK_RECEIPT_SCHEMA =
  "bim-explorer-bim-renderer-3d-pick-receipt/0.1";
const DEFAULT_LIMITS = Object.freeze({
  maximumDomRows: 64,
  maximumLoadedTreeItems: 2_000,
  maximumRelations: 100,
  maximumSearchResults: 500,
  searchPageSize: 25,
  treePageSize: 25,
});

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

function positiveInteger(
  value,
  label,
  maximum = Number.MAX_SAFE_INTEGER,
) {
  if (
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > maximum
  ) {
    throw new RangeError(
      `${label} must be an integer in the range 1..${maximum}`,
    );
  }
  return value;
}

function deepFreeze(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    ArrayBuffer.isView(value)
  ) {
    return value;
  }
  for (const item of Object.values(value)) {
    deepFreeze(item);
  }
  return Object.freeze(value);
}

function invalidState(message) {
  return new DOMException(message, "InvalidStateError");
}

function contextFromSnapshot(snapshot) {
  const context = {};
  for (const field of [
    "protocolVersion",
    "sessionId",
    "sourceId",
    "revisionId",
    "snapshotId",
    "layerId",
  ]) {
    if (
      typeof snapshot?.[field] !== "string" ||
      snapshot[field].length === 0
    ) {
      throw new TypeError(
        `semantic explorer snapshot.${field} is invalid`,
      );
    }
    context[field] = snapshot[field];
  }
  if (
    typeof snapshot.source?.fingerprint !== "string" ||
    snapshot.source.fingerprint.length === 0
  ) {
    throw new TypeError(
      "semantic explorer snapshot source fingerprint is invalid",
    );
  }
  return Object.freeze(context);
}

function validateSession(session) {
  plainRecord(session, "semantic explorer session");
  for (const method of [
    "getEntity",
    "queryRelations",
    "queryTree",
    "searchEntities",
  ]) {
    if (typeof session[method] !== "function") {
      throw new TypeError(
        `semantic explorer session.${method} must be a function`,
      );
    }
  }
  return session;
}

function validateStorage(storage) {
  if (storage === null) {
    return null;
  }
  plainRecord(storage, "semantic explorer storage");
  for (const method of ["getItem", "setItem", "removeItem"]) {
    if (typeof storage[method] !== "function") {
      throw new TypeError(
        `semantic explorer storage.${method} must be a function`,
      );
    }
  }
  return storage;
}

function validateLimits(overrides) {
  plainRecord(overrides, "semantic explorer limits");
  for (const key of Object.keys(overrides)) {
    if (!(key in DEFAULT_LIMITS)) {
      throw new TypeError(
        `semantic explorer limit ${key} is unsupported`,
      );
    }
  }
  const limits = {
    ...DEFAULT_LIMITS,
    ...overrides,
  };
  for (const [key, value] of Object.entries(limits)) {
    positiveInteger(
      value,
      `semantic explorer limits.${key}`,
      10_000,
    );
  }
  if (
    limits.treePageSize > 100 ||
    limits.searchPageSize > 100 ||
    limits.maximumRelations > 100
  ) {
    throw new RangeError(
      "semantic explorer source query limits cannot exceed 100",
    );
  }
  if (
    limits.maximumLoadedTreeItems < limits.treePageSize ||
    limits.maximumSearchResults < limits.searchPageSize
  ) {
    throw new RangeError(
      "semantic explorer aggregate limits must include one page",
    );
  }
  return Object.freeze(limits);
}

function exactContext(actual, expected, label) {
  for (const [field, value] of Object.entries(expected)) {
    if (actual?.[field] !== value) {
      throw new RangeError(
        `${label} ${field} is outside the active snapshot`,
      );
    }
  }
}

function resultPage(result, expected, kind) {
  plainRecord(result, `${kind} result`);
  if (
    result.schema !== QUERY_RESULT_SCHEMA ||
    result.kind !== kind ||
    !Array.isArray(result.items)
  ) {
    throw new TypeError(`${kind} result is invalid`);
  }
  exactContext(result.source, expected, `${kind} result`);
  const page = plainRecord(result.page, `${kind} result.page`);
  for (const field of [
    "limit",
    "offset",
    "returned",
    "total",
    "remaining",
  ]) {
    if (
      !Number.isSafeInteger(page[field]) ||
      page[field] < 0
    ) {
      throw new TypeError(
        `${kind} result.page.${field} is invalid`,
      );
    }
  }
  if (
    page.returned !== result.items.length ||
    page.offset + page.returned + page.remaining !==
      page.total ||
    page.hasMore !== (page.remaining > 0) ||
    (
      page.hasMore &&
      (
        typeof page.nextCursor !== "string" ||
        page.nextCursor.length === 0
      )
    ) ||
    (!page.hasMore && page.nextCursor !== null)
  ) {
    throw new Error(`${kind} result pagination is inconsistent`);
  }
  return result;
}

function treeKey(parentExpressId) {
  return parentExpressId === null
    ? "roots"
    : `parent:${parentExpressId}`;
}

function identityFromNode(node) {
  return {
    expressId: node.expressId,
    globalId: node.globalId,
    ifcClass: node.ifcClass,
    name: node.name,
    kind: node.kind,
    renderId: node.renderId ?? null,
    pickId: node.pickId ?? null,
    externalIdentityToken:
      node.externalIdentityToken ?? null,
  };
}

function informationLimitations(entity, relationResult) {
  const limitations = [
    ...(relationResult.informationCoverage?.unavailable ?? []),
  ];
  if ((entity?.semantics.propertySets?.length ?? 0) > 0) {
    limitations.push({
      capability: "property-value",
      status: "lossy",
      detail: "property-set-name-only",
    });
  }
  if (relationResult.page.remaining > 0) {
    limitations.push({
      capability: "relation-result",
      status: "omitted",
      count: relationResult.page.remaining,
    });
  }
  const unique = new Map();
  for (const item of limitations) {
    const key = [
      item.capability,
      item.status,
      item.detail ?? "",
    ].join("\u0000");
    unique.set(key, structuredClone(item));
  }
  return [...unique.values()];
}

function inspectorFor(identity, entity, relationResult) {
  const semantics = entity?.semantics ?? null;
  return {
    identity: structuredClone(identity),
    groups: {
      containment: semantics?.container === null ||
        semantics?.container === undefined
        ? []
        : [structuredClone(semantics.container)],
      type: semantics?.type === null ||
        semantics?.type === undefined
        ? []
        : [structuredClone(semantics.type)],
      propertySets: [
        ...(semantics?.propertySets ?? []),
      ].map((name) => ({
        name,
        valueStatus: "name-only",
      })),
      quantities: Object.entries(
        semantics?.quantities ?? {},
      ).map(([name, value]) => ({ name, value })),
      materials: [
        ...(semantics?.materials ?? []),
      ].map((name) => ({ name })),
      classifications: (
        semantics?.classifications ?? []
      ).map((value) => structuredClone(value)),
      relations: relationResult.items.map((value) =>
        structuredClone(value)),
    },
    coverage: {
      supported: [
        ...(relationResult.informationCoverage?.supported ?? []),
      ],
      limitations: informationLimitations(
        entity,
        relationResult,
      ),
      relationPage: structuredClone(relationResult.page),
    },
  };
}

export class BimSemanticExplorer {
  #context;
  #disposed = false;
  #expanded = new Set();
  #initialized = false;
  #inspector = null;
  #limits;
  #nodeByExpressId;
  #operation = Promise.resolve();
  #search = null;
  #selected = null;
  #session;
  #snapshot;
  #storage;
  #treePages = new Map();
  #virtualIdentities = new Map();
  #visibility = {
    mode: "show-all",
    renderIds: [],
    resultExpressIds: [],
  };

  constructor({
    limits = {},
    session,
    snapshot,
    storage = globalThis.localStorage ?? null,
  } = {}) {
    this.#session = validateSession(session);
    this.#snapshot = plainRecord(
      snapshot,
      "semantic explorer snapshot",
    );
    this.#context = contextFromSnapshot(snapshot);
    this.#limits = validateLimits(limits);
    this.#storage = validateStorage(storage);
    if (
      !Array.isArray(snapshot.tree?.nodes) ||
      !Array.isArray(snapshot.tree?.roots)
    ) {
      throw new TypeError(
        "semantic explorer snapshot tree is invalid",
      );
    }
    this.#nodeByExpressId = new Map(
      snapshot.tree.nodes.map((node) => [
        node.expressId,
        structuredClone(node),
      ]),
    );
    if (
      this.#nodeByExpressId.size !==
        snapshot.tree.nodes.length
    ) {
      throw new Error(
        "semantic explorer snapshot tree identities are not unique",
      );
    }
  }

  get state() {
    const rows = this.#visibleRows();
    const treePages = [...this.#treePages.entries()].map(
      ([key, value]) => ({
        key,
        loaded: value.items.length,
        total: value.page.total,
        remaining: value.page.remaining,
        hasMore: value.page.hasMore &&
          this.#loadedTreeItems() <
            this.#limits.maximumLoadedTreeItems,
      }),
    );
    const searchResults = this.#search?.items ?? [];
    const searchTotal = this.#search?.page.total ?? 0;
    return deepFreeze({
      contract: BIM_SEMANTIC_EXPLORER_CONTRACT,
      source: {
        fingerprint: this.#snapshot.source.fingerprint,
        revisionId: this.#context.revisionId,
        snapshotId: this.#context.snapshotId,
      },
      tree: {
        rows: rows.items,
        visibleLoadedRows: rows.total,
        omittedDomRows: rows.omitted,
        expandedExpressIds: [...this.#expanded],
        pages: treePages,
        loadedItems: this.#loadedTreeItems(),
        maximumLoadedItems:
          this.#limits.maximumLoadedTreeItems,
        maximumDomRows: this.#limits.maximumDomRows,
        selectedExpressId:
          this.#selected?.expressId ?? null,
        selectedRevealed: this.#selected === null
          ? false
          : rows.items.some((row) =>
            row.expressId === this.#selected.expressId),
      },
      search: {
        query: this.#search?.query ?? "",
        scopeExpressIds: [
          ...(this.#search?.scopeExpressIds ?? []),
        ],
        items: searchResults,
        loaded: searchResults.length,
        total: searchTotal,
        omitted: Math.max(
          0,
          searchTotal - searchResults.length,
        ),
        sourceRemaining:
          this.#search?.page.remaining ?? 0,
        hasMore: (
          this.#search?.page.hasMore ?? false
        ) && searchResults.length <
          this.#limits.maximumSearchResults,
        nextCursor:
          this.#search?.page.nextCursor ?? null,
        limitedByExplorer: searchResults.length >=
          this.#limits.maximumSearchResults &&
          searchResults.length < searchTotal,
        maximumResults:
          this.#limits.maximumSearchResults,
      },
      selection: this.#selected,
      inspector: this.#inspector,
      visibility: this.#visibility,
      savedView: {
        storage: this.#storage === null
          ? "unavailable"
          : "source-local",
        key: this.#storageKey(),
      },
      lifecycle: {
        initialized: this.#initialized,
        disposed: this.#disposed,
      },
    });
  }

  #assertOpen() {
    if (this.#disposed) {
      throw invalidState("BIM semantic explorer is disposed");
    }
  }

  #enqueue(operation) {
    const run = async () => {
      this.#assertOpen();
      return operation();
    };
    const result = this.#operation.then(run, run);
    this.#operation = result.catch(() => {});
    return result;
  }

  #request(additions = {}) {
    return {
      ...this.#context,
      ...additions,
    };
  }

  #storageKey() {
    return [
      "bim-semantic-explorer",
      this.#snapshot.source.fingerprint,
      this.#context.revisionId,
    ].join(":");
  }

  #loadedTreeItems() {
    return [...this.#treePages.values()].reduce(
      (sum, value) => sum + value.items.length,
      0,
    );
  }

  #visibleRows() {
    const all = [];
    const append = (parentExpressId, depth) => {
      const page = this.#treePages.get(
        treeKey(parentExpressId),
      );
      for (const node of page?.items ?? []) {
        all.push({
          ...structuredClone(node),
          depth,
          expanded: this.#expanded.has(node.expressId),
          selected:
            this.#selected?.expressId === node.expressId,
        });
        if (this.#expanded.has(node.expressId)) {
          append(node.expressId, depth + 1);
        }
      }
    };
    append(null, 0);
    return {
      items: all.slice(0, this.#limits.maximumDomRows),
      total: all.length,
      omitted: Math.max(
        0,
        all.length - this.#limits.maximumDomRows,
      ),
    };
  }

  async #loadTreePage(parentExpressId, cursor = null) {
    const available =
      this.#limits.maximumLoadedTreeItems -
      this.#loadedTreeItems();
    if (available <= 0) {
      return false;
    }
    const limit = Math.min(
      available,
      this.#limits.treePageSize,
    );
    const result = resultPage(
      await this.#session.queryTree(this.#request({
        cursor,
        limit,
        parentExpressId,
      })),
      this.#context,
      "tree-children",
    );
    const key = treeKey(parentExpressId);
    const previous = this.#treePages.get(key);
    if (
      previous !== undefined &&
      result.page.offset !== previous.items.length
    ) {
      throw new Error(
        "semantic tree continuation is not contiguous",
      );
    }
    const items = [
      ...(previous?.items ?? []),
      ...result.items.map((item) => structuredClone(item)),
    ];
    if (
      new Set(items.map((item) => item.expressId)).size !==
        items.length
    ) {
      throw new Error(
        "semantic tree continuation contains duplicates",
      );
    }
    this.#treePages.set(key, {
      items,
      page: structuredClone(result.page),
    });
    return result.items.length > 0;
  }

  async #ensureChildLoaded(parentExpressId, expressId) {
    const key = treeKey(parentExpressId);
    let page = this.#treePages.get(key);
    if (page === undefined) {
      await this.#loadTreePage(parentExpressId);
      page = this.#treePages.get(key);
    }
    while (
      page !== undefined &&
      !page.items.some((item) => item.expressId === expressId) &&
      page.page.hasMore &&
      this.#loadedTreeItems() <
        this.#limits.maximumLoadedTreeItems
    ) {
      await this.#loadTreePage(
        parentExpressId,
        page.page.nextCursor,
      );
      page = this.#treePages.get(key);
    }
    return page?.items.some((item) =>
      item.expressId === expressId) ?? false;
  }

  async #reveal(expressId) {
    const node = this.#nodeByExpressId.get(expressId);
    if (node === undefined) {
      return false;
    }
    const lineage = [];
    let current = node;
    while (current !== undefined) {
      lineage.unshift(current);
      current = current.parentExpressId === null
        ? undefined
        : this.#nodeByExpressId.get(current.parentExpressId);
    }
    let parentExpressId = null;
    for (const item of lineage) {
      if (
        !await this.#ensureChildLoaded(
          parentExpressId,
          item.expressId,
        )
      ) {
        return false;
      }
      if (parentExpressId !== null) {
        this.#expanded.add(parentExpressId);
      }
      parentExpressId = item.expressId;
    }
    return true;
  }

  async #select(expressId, origin, identityHint = null) {
    if (!Number.isSafeInteger(expressId) || expressId <= 0) {
      throw new TypeError(
        "semantic selection expressId must be a positive integer",
      );
    }
    await this.#reveal(expressId);
    const node = this.#nodeByExpressId.get(expressId);
    let identity;
    let entity = null;
    if (node?.kind === "product") {
      entity = await this.#session.getEntity(
        this.#request({ expressId }),
      );
      if (
        entity?.expressId !== node.expressId ||
        entity.globalId !== node.globalId ||
        entity.renderId !== node.renderId ||
        entity.pickId !== node.pickId
      ) {
        throw new RangeError(
          "semantic entity is inconsistent with the snapshot tree",
        );
      }
      identity = identityFromNode(node);
    } else if (node !== undefined) {
      identity = identityFromNode(node);
    } else {
      identity = identityHint ??
        this.#virtualIdentities.get(expressId);
      if (identity === undefined) {
        throw new RangeError(
          "semantic selection identity is outside the snapshot",
        );
      }
      identity = {
        ...structuredClone(identity),
        kind: "type",
        renderId: null,
        pickId: null,
        externalIdentityToken:
          identity.externalIdentityToken ?? null,
      };
    }
    const relationResult = resultPage(
      await this.#session.queryRelations(this.#request({
        expressId,
        limit: this.#limits.maximumRelations,
      })),
      this.#context,
      "semantic-relations",
    );
    for (const relation of relationResult.items) {
      if (
        relation.target?.kind === "type" &&
        Number.isSafeInteger(relation.target.expressId)
      ) {
        this.#virtualIdentities.set(
          relation.target.expressId,
          structuredClone(relation.target),
        );
      }
    }
    this.#selected = {
      ...structuredClone(identity),
      origin,
      sourceFingerprint: this.#snapshot.source.fingerprint,
      revisionId: this.#context.revisionId,
    };
    this.#inspector = inspectorFor(
      this.#selected,
      entity,
      relationResult,
    );
    return this.state.selection;
  }

  async initialize() {
    return this.#enqueue(async () => {
      if (!this.#initialized) {
        await this.#loadTreePage(null);
        this.#initialized = true;
      }
      return this.state;
    });
  }

  async expand(expressId) {
    return this.#enqueue(async () => {
      positiveInteger(expressId, "semantic tree expressId");
      if (!this.#nodeByExpressId.has(expressId)) {
        throw new RangeError(
          "semantic tree identity is outside the snapshot",
        );
      }
      const key = treeKey(expressId);
      if (!this.#treePages.has(key)) {
        await this.#loadTreePage(expressId);
      }
      this.#expanded.add(expressId);
      return this.state.tree;
    });
  }

  async collapse(expressId) {
    return this.#enqueue(async () => {
      positiveInteger(expressId, "semantic tree expressId");
      this.#expanded.delete(expressId);
      return this.state.tree;
    });
  }

  async loadMoreTree(parentExpressId = null) {
    return this.#enqueue(async () => {
      if (
        parentExpressId !== null &&
        (
          !Number.isSafeInteger(parentExpressId) ||
          !this.#nodeByExpressId.has(parentExpressId)
        )
      ) {
        throw new RangeError(
          "semantic tree parent is outside the snapshot",
        );
      }
      const page = this.#treePages.get(
        treeKey(parentExpressId),
      );
      if (page === undefined) {
        await this.#loadTreePage(parentExpressId);
      } else if (
        page.page.hasMore &&
        this.#loadedTreeItems() <
          this.#limits.maximumLoadedTreeItems
      ) {
        await this.#loadTreePage(
          parentExpressId,
          page.page.nextCursor,
        );
      }
      return this.state.tree;
    });
  }

  async selectExpressId(expressId, {
    origin = "tree",
  } = {}) {
    return this.#enqueue(() =>
      this.#select(expressId, origin));
  }

  async selectRelation({
    kind,
    targetExpressId,
  } = {}) {
    return this.#enqueue(async () => {
      if (
        typeof kind !== "string" ||
        !Number.isSafeInteger(targetExpressId)
      ) {
        throw new TypeError(
          "semantic relation selection is invalid",
        );
      }
      const relation = this.#inspector?.groups.relations.find(
        (item) =>
          item.kind === kind &&
          item.target?.expressId === targetExpressId,
      );
      if (relation === undefined) {
        throw new RangeError(
          "semantic relation is outside the current inspector",
        );
      }
      return this.#select(
        targetExpressId,
        "relation",
        relation.target,
      );
    });
  }

  async selectPick(pickReceipt) {
    return this.#enqueue(async () => {
      const pick = plainRecord(
        pickReceipt,
        "semantic explorer pick receipt",
      );
      if (
        pick.schema !== PICK_RECEIPT_SCHEMA ||
        pick.status !== "hit" ||
        pick.source?.fingerprint !==
          this.#snapshot.source.fingerprint ||
        pick.source?.revisionId !==
          this.#context.revisionId ||
        !Number.isSafeInteger(pick.identity?.expressId)
      ) {
        throw new RangeError(
          "semantic explorer pick is outside the active snapshot",
        );
      }
      const node = this.#nodeByExpressId.get(
        pick.identity.expressId,
      );
      if (
        node === undefined ||
        node.renderId !== pick.identity.renderId ||
        node.pickId !== pick.identity.pickId
      ) {
        throw new RangeError(
          "semantic explorer pick identity is inconsistent",
        );
      }
      return this.#select(
        pick.identity.expressId,
        "3d",
      );
    });
  }

  async search(query, {
    scopeExpressIds = null,
  } = {}) {
    return this.#enqueue(async () => {
      if (typeof query !== "string") {
        throw new TypeError(
          "semantic explorer search query must be a string",
        );
      }
      if (query.trim().length === 0) {
        this.#search = null;
        return this.state.search;
      }
      const scope = scopeExpressIds === null
        ? null
        : [...scopeExpressIds];
      const result = resultPage(
        await this.#session.searchEntities(this.#request({
          query,
          scopeExpressIds: scope,
          limit: Math.min(
            this.#limits.searchPageSize,
            this.#limits.maximumSearchResults,
          ),
        })),
        this.#context,
        "semantic-search",
      );
      this.#search = {
        items: result.items.map((item) =>
          structuredClone(item)),
        page: structuredClone(result.page),
        query: result.query.text,
        scopeExpressIds: scope,
      };
      return this.state.search;
    });
  }

  async loadMoreSearch() {
    return this.#enqueue(async () => {
      if (
        this.#search === null ||
        !this.#search.page.hasMore ||
        this.#search.items.length >=
          this.#limits.maximumSearchResults
      ) {
        return this.state.search;
      }
      const limit = Math.min(
        this.#limits.searchPageSize,
        this.#limits.maximumSearchResults -
          this.#search.items.length,
      );
      const result = resultPage(
        await this.#session.searchEntities(this.#request({
          cursor: this.#search.page.nextCursor,
          query: this.#search.query,
          scopeExpressIds:
            this.#search.scopeExpressIds === null
              ? null
              : [...this.#search.scopeExpressIds],
          limit,
        })),
        this.#context,
        "semantic-search",
      );
      const items = [
        ...this.#search.items,
        ...result.items.map((item) =>
          structuredClone(item)),
      ];
      if (
        new Set(items.map((item) => item.expressId)).size !==
          items.length
      ) {
        throw new Error(
          "semantic search continuation contains duplicates",
        );
      }
      this.#search = {
        ...this.#search,
        items,
        page: structuredClone(result.page),
      };
      return this.state.search;
    });
  }

  async setVisibility(mode) {
    return this.#enqueue(async () => {
      if (![
        "isolate-results",
        "isolate-selection",
        "show-all",
      ].includes(mode)) {
        throw new TypeError(
          "semantic explorer visibility mode is invalid",
        );
      }
      let identities = [];
      if (mode === "isolate-results") {
        identities = this.#search?.items ?? [];
      } else if (
        mode === "isolate-selection" &&
        this.#selected !== null
      ) {
        identities = [this.#selected];
      }
      const renderIds = [
        ...new Set(
          identities
            .map((item) => item.renderId)
            .filter((value) =>
              typeof value === "string"),
        ),
      ];
      if (mode !== "show-all" && renderIds.length === 0) {
        throw new RangeError(
          "semantic explorer visibility scope has no renderable entity",
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
          mode === "show-all" ? null : [...renderIds],
        selectedPickIds:
          this.#selected?.pickId === null ||
          this.#selected?.pickId === undefined
            ? []
            : [this.#selected.pickId],
      });
    });
  }

  async saveView({
    camera = null,
  } = {}) {
    return this.#enqueue(async () => {
      if (this.#storage === null) {
        throw new DOMException(
          "local saved view storage is unavailable",
          "NotSupportedError",
        );
      }
      const record = {
        schema: BIM_SEMANTIC_SAVED_VIEW_SCHEMA,
        source: {
          fingerprint: this.#snapshot.source.fingerprint,
          revisionId: this.#context.revisionId,
          snapshotId: this.#context.snapshotId,
        },
        selectedIdentity: this.#selected === null
          ? null
          : structuredClone(this.#selected),
        search: {
          query: this.#search?.query ?? "",
          scopeExpressIds: [
            ...(this.#search?.scopeExpressIds ?? []),
          ],
        },
        visibilityMode: this.#visibility.mode,
        camera: camera === null
          ? null
          : structuredClone(camera),
      };
      this.#storage.setItem(
        this.#storageKey(),
        JSON.stringify(record),
      );
      return deepFreeze(record);
    });
  }

  async restoreView() {
    return this.#enqueue(async () => {
      if (this.#storage === null) {
        return null;
      }
      const serialized = this.#storage.getItem(
        this.#storageKey(),
      );
      if (serialized === null) {
        return null;
      }
      let record;
      try {
        record = JSON.parse(serialized);
      } catch {
        this.#storage.removeItem(this.#storageKey());
        return null;
      }
      if (
        record?.schema !== BIM_SEMANTIC_SAVED_VIEW_SCHEMA ||
        record.source?.fingerprint !==
          this.#snapshot.source.fingerprint ||
        record.source?.revisionId !==
          this.#context.revisionId ||
        record.source?.snapshotId !==
          this.#context.snapshotId
      ) {
        this.#storage.removeItem(this.#storageKey());
        return null;
      }
      if (record.search?.query) {
        const result = resultPage(
          await this.#session.searchEntities(this.#request({
            query: record.search.query,
            scopeExpressIds:
              record.search.scopeExpressIds?.length > 0
                ? [...record.search.scopeExpressIds]
                : null,
            limit: Math.min(
              this.#limits.searchPageSize,
              this.#limits.maximumSearchResults,
            ),
          })),
          this.#context,
          "semantic-search",
        );
        this.#search = {
          items: result.items.map((item) =>
            structuredClone(item)),
          page: structuredClone(result.page),
          query: result.query.text,
          scopeExpressIds:
            record.search.scopeExpressIds?.length > 0
              ? [...record.search.scopeExpressIds]
              : null,
        };
      }
      if (record.selectedIdentity !== null) {
        const hint = plainRecord(
          record.selectedIdentity,
          "saved semantic identity",
        );
        await this.#select(
          hint.expressId,
          "saved-view",
          hint,
        );
      }
      if ([
        "isolate-results",
        "isolate-selection",
        "show-all",
      ].includes(record.visibilityMode)) {
        const identities =
          record.visibilityMode === "isolate-results"
            ? this.#search?.items ?? []
            : record.visibilityMode === "isolate-selection" &&
                this.#selected !== null
              ? [this.#selected]
              : [];
        const renderIds = [
          ...new Set(
            identities
              .map((item) => item.renderId)
              .filter((value) =>
                typeof value === "string"),
          ),
        ];
        this.#visibility = {
          mode:
            record.visibilityMode !== "show-all" &&
            renderIds.length === 0
              ? "show-all"
              : record.visibilityMode,
          renderIds,
          resultExpressIds: identities.map((item) =>
            item.expressId),
        };
      }
      return deepFreeze({
        restored: true,
        camera: record.camera === null
          ? null
          : structuredClone(record.camera),
        state: this.state,
      });
    });
  }

  async dispose() {
    const result = await this.#operation.then(
      () => true,
      () => true,
    );
    if (!result || this.#disposed) {
      return false;
    }
    this.#disposed = true;
    this.#expanded.clear();
    this.#treePages.clear();
    this.#virtualIdentities.clear();
    this.#search = null;
    this.#selected = null;
    this.#inspector = null;
    return true;
  }
}

export function createBimSemanticExplorer(options) {
  return new BimSemanticExplorer(options);
}
