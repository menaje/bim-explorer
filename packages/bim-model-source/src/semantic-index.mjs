export const BIM_SOURCE_SEMANTIC_QUERY_RESULT =
  "bim-explorer-bim-source-semantic-query-result/0.1";

const CURSOR =
  /^semantic-cursor:([0-9a-f]{16}):(0|[1-9][0-9]*)$/u;
const DEFAULT_LIMIT = 50;
const MAXIMUM_LIMIT = 100;
const MAXIMUM_SCOPE = 10_000;
const MAXIMUM_SEARCH_LENGTH = 256;

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

function normalizedText(value) {
  return String(value)
    .normalize("NFKC")
    .toLocaleLowerCase("en-US");
}

function signature(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let hash = 14_695_981_039_346_656_037n;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(
      64,
      hash * 1_099_511_628_211n,
    );
  }
  return hash.toString(16).padStart(16, "0");
}

function positiveLimit(value) {
  const limit = value ?? DEFAULT_LIMIT;
  if (
    !Number.isSafeInteger(limit) ||
    limit <= 0 ||
    limit > MAXIMUM_LIMIT
  ) {
    throw new RangeError(
      `semantic query limit must be 1..${MAXIMUM_LIMIT}`,
    );
  }
  return limit;
}

function page(items, {
  cursor = null,
  limit: limitValue,
  signatureValue,
}) {
  const limit = positiveLimit(limitValue);
  const digest = signature(signatureValue);
  let offset = 0;
  if (cursor !== null) {
    const match = CURSOR.exec(cursor);
    if (match === null || match[1] !== digest) {
      throw new RangeError(
        "semantic query cursor is stale or mismatched",
      );
    }
    offset = Number(match[2]);
    if (!Number.isSafeInteger(offset) || offset >= items.length) {
      throw new RangeError(
        "semantic query cursor is outside the result",
      );
    }
  }
  const selected = items.slice(offset, offset + limit);
  const nextOffset = offset + selected.length;
  const remaining = items.length - nextOffset;
  return deepFreeze({
    items: selected,
    page: {
      limit,
      offset,
      returned: selected.length,
      total: items.length,
      remaining,
      hasMore: remaining > 0,
      nextCursor: remaining > 0
        ? `semantic-cursor:${digest}:${nextOffset}`
        : null,
    },
  });
}

function relationKind(node) {
  if (node.parentExpressId === null) {
    return "root";
  }
  return node.kind === "spatial"
    ? "decomposition"
    : "spatial-containment";
}

function summary(node, children) {
  return {
    expressId: node.expressId,
    globalId: node.globalId,
    ifcClass: node.ifcClass,
    name: node.name,
    kind: node.kind,
    parentExpressId: node.parentExpressId,
    parentRelation: relationKind(node),
    renderId: node.renderId ?? null,
    pickId: node.pickId ?? null,
    externalIdentityToken:
      node.externalIdentityToken ?? null,
    childCount:
      children.get(node.expressId)?.length ?? 0,
  };
}

function fieldValues(node, entity) {
  const values = new Map([
    ["globalId", [node.globalId]],
    ["name", [node.name]],
    ["ifcClass", [node.ifcClass]],
  ]);
  if (entity === undefined) {
    return values;
  }
  const semantics = entity.semantics;
  values.set(
    "propertySet",
    [...(semantics.propertySets ?? [])],
  );
  values.set(
    "quantity",
    Object.keys(semantics.quantities ?? {}),
  );
  values.set(
    "material",
    [...(semantics.materials ?? [])],
  );
  values.set(
    "classification",
    (semantics.classifications ?? []).flatMap((value) => [
      value.identification,
      value.name,
      value.source,
    ]),
  );
  values.set(
    "type",
    semantics.type === null
      ? []
      : [
          semantics.type.globalId,
          semantics.type.ifcClass,
          semantics.type.name,
        ],
  );
  values.set(
    "container",
    semantics.container === null
      ? []
      : [
          semantics.container.globalId,
          semantics.container.ifcClass,
          semantics.container.name,
        ],
  );
  return values;
}

function relationSortKey(relation) {
  const target = relation.target ?? {};
  return [
    relation.kind,
    String(target.expressId ?? ""),
    String(relation.name ?? ""),
    JSON.stringify(relation.value ?? ""),
  ].join("\u0000");
}

export class BimSemanticIndex {
  #children = new Map();
  #context;
  #coverage;
  #entityByExpressId;
  #nodes;
  #nodeByExpressId;
  #typeByExpressId = new Map();

  constructor({
    context,
    coverage,
    entities,
    tree,
  }) {
    this.#context = deepFreeze({ ...context });
    this.#coverage = deepFreeze(structuredClone(coverage));
    this.#entityByExpressId = new Map(
      entities.map((entity) => [entity.expressId, entity]),
    );
    this.#nodes = tree.nodes.map((node) =>
      deepFreeze(structuredClone(node)));
    this.#nodeByExpressId = new Map(
      this.#nodes.map((node) => [node.expressId, node]),
    );
    for (const node of this.#nodes) {
      const key = node.parentExpressId;
      const children = this.#children.get(key) ?? [];
      children.push(node);
      this.#children.set(key, children);
    }
    for (const children of this.#children.values()) {
      children.sort(
        (left, right) => left.expressId - right.expressId,
      );
    }
    for (const entity of entities) {
      if (entity.semantics.type !== null) {
        this.#typeByExpressId.set(
          entity.semantics.type.expressId,
          deepFreeze(structuredClone(entity.semantics.type)),
        );
      }
    }
  }

  queryTree({
    cursor = null,
    limit,
    parentExpressId = null,
  } = {}) {
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
    const items = (this.#children.get(parentExpressId) ?? [])
      .map((node) => summary(node, this.#children));
    const result = page(items, {
      cursor,
      limit,
      signatureValue: [
        "tree-children",
        this.#context.revisionId,
        parentExpressId,
      ],
    });
    return deepFreeze({
      schema: BIM_SOURCE_SEMANTIC_QUERY_RESULT,
      kind: "tree-children",
      source: this.#context,
      query: {
        parentExpressId,
      },
      ...result,
    });
  }

  search({
    cursor = null,
    limit,
    query,
    scopeExpressIds = null,
  } = {}) {
    if (
      typeof query !== "string" ||
      query.trim().length === 0 ||
      query.length > MAXIMUM_SEARCH_LENGTH
    ) {
      throw new RangeError(
        "semantic search query must be 1..256 characters",
      );
    }
    let scope = null;
    if (scopeExpressIds !== null) {
      if (
        !Array.isArray(scopeExpressIds) ||
        scopeExpressIds.length > MAXIMUM_SCOPE ||
        new Set(scopeExpressIds).size !==
          scopeExpressIds.length ||
        scopeExpressIds.some((expressId) =>
          !Number.isSafeInteger(expressId) ||
          !this.#nodeByExpressId.has(expressId))
      ) {
        throw new RangeError(
          "semantic search scope is invalid or too large",
        );
      }
      scope = new Set(scopeExpressIds);
    }
    const needle = normalizedText(query.trim());
    const items = [];
    for (const node of this.#nodes) {
      if (scope !== null && !scope.has(node.expressId)) {
        continue;
      }
      const entity = this.#entityByExpressId.get(
        node.expressId,
      );
      const matches = [];
      for (const [field, values] of fieldValues(node, entity)) {
        if (values.some((value) =>
          normalizedText(value).includes(needle))) {
          matches.push(field);
        }
      }
      if (matches.length > 0) {
        items.push({
          ...summary(node, this.#children),
          matchedFields: matches,
        });
      }
    }
    items.sort(
      (left, right) => left.expressId - right.expressId,
    );
    const scopeSignature = scopeExpressIds === null
      ? null
      : [...scopeExpressIds].sort((left, right) => left - right);
    const result = page(items, {
      cursor,
      limit,
      signatureValue: [
        "semantic-search",
        this.#context.revisionId,
        needle,
        scopeSignature,
      ],
    });
    return deepFreeze({
      schema: BIM_SOURCE_SEMANTIC_QUERY_RESULT,
      kind: "semantic-search",
      source: this.#context,
      query: {
        text: query.trim(),
        normalized: needle,
        scoped: scope !== null,
        scopeSize: scope?.size ?? null,
      },
      ...result,
    });
  }

  queryRelations({
    cursor = null,
    expressId,
    limit,
  } = {}) {
    if (!Number.isSafeInteger(expressId)) {
      throw new TypeError(
        "semantic relation expressId must be a safe integer",
      );
    }
    const node = this.#nodeByExpressId.get(expressId);
    const type = this.#typeByExpressId.get(expressId);
    if (node === undefined && type === undefined) {
      throw new RangeError(
        "semantic relation identity is outside the snapshot",
      );
    }
    const relations = [];
    if (node !== undefined) {
      if (node.parentExpressId !== null) {
        relations.push({
          kind: node.kind === "spatial"
            ? "decomposition-parent"
            : "spatial-container",
          target: summary(
            this.#nodeByExpressId.get(node.parentExpressId),
            this.#children,
          ),
        });
      }
      for (
        const child of this.#children.get(expressId) ?? []
      ) {
        relations.push({
          kind: child.kind === "spatial"
            ? "decomposition-child"
            : "spatial-contained-element",
          target: summary(child, this.#children),
        });
      }
    }
    const entity = this.#entityByExpressId.get(expressId);
    if (entity !== undefined) {
      const semantics = entity.semantics;
      if (semantics.type !== null) {
        relations.push({
          kind: "type-definition",
          target: {
            ...semantics.type,
            kind: "type",
          },
        });
      }
      for (const name of semantics.propertySets ?? []) {
        relations.push({
          kind: "property-set",
          name,
          value: null,
        });
      }
      for (
        const [name, value] of Object.entries(
          semantics.quantities ?? {},
        )
      ) {
        relations.push({
          kind: "quantity",
          name,
          value,
        });
      }
      for (const name of semantics.materials ?? []) {
        relations.push({
          kind: "material",
          name,
          value: null,
        });
      }
      for (
        const classification of
          semantics.classifications ?? []
      ) {
        relations.push({
          kind: "classification",
          name: classification.name,
          value: classification,
        });
      }
    }
    if (type !== undefined) {
      for (const occurrence of this.#entityByExpressId.values()) {
        if (
          occurrence.semantics.type?.expressId === expressId
        ) {
          relations.push({
            kind: "typed-occurrence",
            target: summary(
              this.#nodeByExpressId.get(occurrence.expressId),
              this.#children,
            ),
          });
        }
      }
    }
    relations.sort((left, right) =>
      relationSortKey(left).localeCompare(
        relationSortKey(right),
        "en",
      ));
    const result = page(relations, {
      cursor,
      limit,
      signatureValue: [
        "semantic-relations",
        this.#context.revisionId,
        expressId,
      ],
    });
    return deepFreeze({
      schema: BIM_SOURCE_SEMANTIC_QUERY_RESULT,
      kind: "semantic-relations",
      source: this.#context,
      query: {
        expressId,
        identityKind: node?.kind ?? "type",
      },
      informationCoverage: {
        supported: [
          "decomposition",
          "spatial-containment",
          "type-occurrence",
          "property-set-name",
          "quantity",
          "direct-material",
          "classification-reference",
        ],
        unavailable: [
          {
            capability: "host-void-fill-relation",
            status: "opaque",
          },
          {
            capability: "connection-relation",
            status: "opaque",
          },
          ...this.#coverage.unsupported.map((capability) => ({
            capability,
            status: "opaque",
          })),
        ],
      },
      ...result,
    });
  }
}
