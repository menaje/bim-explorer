import {
  BimSemanticIndex,
} from "/semantic-index.mjs";

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

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
}

function contextFromSnapshot(snapshot) {
  return Object.freeze(Object.fromEntries([
    "protocolVersion",
    "sessionId",
    "sourceId",
    "revisionId",
    "snapshotId",
    "layerId",
  ].map((field) => [field, snapshot[field]])));
}

export class BrowserSemanticRangeSession {
  #context;
  #disposed = false;
  #detailByExpressId = new Map();
  #entityByExpressId;
  #handles;
  #detailReads = 0;
  #rangeBytes = 0;
  #rangeReads = 0;
  #relationQueries = 0;
  #searchQueries = 0;
  #semanticIndex;
  #treeQueries = 0;

  constructor(snapshot) {
    const layer = snapshot?.layers?.find(
      (candidate) => candidate.layerId === snapshot.layerId,
    );
    if (
      !Array.isArray(layer?.rangeHandles) ||
      !Array.isArray(snapshot?.entities) ||
      !Array.isArray(snapshot?.tree?.nodes)
    ) {
      throw new TypeError(
        "Browser semantic session snapshot is invalid",
      );
    }
    this.#context = contextFromSnapshot(snapshot);
    this.#handles = new Map(
      [
        ...layer.rangeHandles,
        ...(snapshot.details?.rangeHandles ?? []),
      ].map((handle) => [
        handle.handleId,
        handle,
      ]),
    );
    this.#entityByExpressId = new Map(
      snapshot.entities.map((entity) => [
        entity.expressId,
        entity,
      ]),
    );
    this.#semanticIndex = new BimSemanticIndex({
      context: this.#context,
      coverage: snapshot.coverage,
      entities: snapshot.entities,
      tree: snapshot.tree,
    });
  }

  get state() {
    return Object.freeze({
      disposed: this.#disposed,
      detailReads: this.#detailReads,
      rangeBytes: this.#rangeBytes,
      rangeReads: this.#rangeReads,
      relationQueries: this.#relationQueries,
      searchQueries: this.#searchQueries,
      treeQueries: this.#treeQueries,
    });
  }

  #assertRequest(request, label) {
    if (this.#disposed) {
      throw invalidState("Browser semantic session is disposed");
    }
    for (
      const [field, expected] of
        Object.entries(this.#context)
    ) {
      if (request?.[field] !== expected) {
        throw new RangeError(
          `${label} ${field} is outside the snapshot`,
        );
      }
    }
  }

  async getEntity(request, { signal } = {}) {
    aborted(signal);
    this.#assertRequest(request, "Browser entity request");
    if (
      !Number.isSafeInteger(request.expressId) ||
      Object.keys(request).some((field) =>
        ["globalId", "renderId", "pickId"].includes(field))
    ) {
      throw new TypeError(
        "Browser entity request requires one Express ID",
      );
    }
    const entity = this.#entityByExpressId.get(
      request.expressId,
    );
    if (entity === undefined) {
      throw new RangeError(
        "Browser entity is outside the snapshot",
      );
    }
    return entity;
  }

  async getEntityDetails(request, { signal } = {}) {
    aborted(signal);
    this.#assertRequest(
      request,
      "Browser entity detail request",
    );
    const entity = this.#entityByExpressId.get(
      request.expressId,
    );
    if (entity === undefined) {
      throw new RangeError(
        "Browser entity detail is outside the snapshot",
      );
    }
    const cached = this.#detailByExpressId.get(
      entity.expressId,
    );
    if (cached !== undefined) {
      return cached;
    }
    const slice = entity.detailSlice;
    const handle = this.#handles.get(slice.rangeId);
    if (handle === undefined) {
      throw new RangeError(
        "Browser entity detail handle is unavailable",
      );
    }
    const bytes = await this.readRange(
      handle,
      slice.offset,
      slice.byteLength,
      { signal },
    );
    let semantics;
    try {
      semantics = JSON.parse(
        new TextDecoder("utf-8", {
          fatal: true,
        }).decode(bytes),
      );
    } finally {
      bytes.fill(0);
    }
    this.#detailReads += 1;
    const result = Object.freeze({
      schema: "bim-explorer-bim-entity-details/0.1",
      ...this.#context,
      expressId: entity.expressId,
      globalId: entity.globalId,
      semantics,
      receipt: {
        handleId: handle.handleId,
        offset: slice.offset,
        byteLength: slice.byteLength,
      },
    });
    this.#detailByExpressId.set(entity.expressId, result);
    return result;
  }

  async queryTree(request, { signal } = {}) {
    aborted(signal);
    this.#assertRequest(request, "Browser tree query");
    this.#treeQueries += 1;
    return this.#semanticIndex.queryTree(request);
  }

  async searchEntities(request, { signal } = {}) {
    aborted(signal);
    this.#assertRequest(request, "Browser semantic search");
    this.#searchQueries += 1;
    return this.#semanticIndex.search(request);
  }

  async queryRelations(request, { signal } = {}) {
    aborted(signal);
    this.#assertRequest(request, "Browser relation query");
    this.#relationQueries += 1;
    return this.#semanticIndex.queryRelations(request);
  }

  async readRange(
    handle,
    offset,
    length,
    { signal } = {},
  ) {
    aborted(signal);
    if (this.#disposed) {
      throw invalidState("Browser semantic session is disposed");
    }
    positiveInteger(length, "Browser range read length");
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new TypeError(
        "Browser range read offset must be a safe integer",
      );
    }
    const expected = this.#handles.get(handle?.handleId);
    if (
      expected === undefined ||
      handle.sessionId !== expected.sessionId ||
      handle.sourceId !== expected.sourceId ||
      handle.revisionId !== expected.revisionId ||
      handle.snapshotId !== expected.snapshotId ||
      handle.layerId !== expected.layerId ||
      handle.sha256 !== expected.sha256 ||
      handle.byteLength !== expected.byteLength ||
      length > expected.maximumRequestBytes ||
      offset + length > expected.byteLength
    ) {
      throw new RangeError(
        "Browser range read is outside its handle",
      );
    }
    const end = offset + length - 1;
    const response = await fetch(
      `/range/${encodeURIComponent(handle.handleId)}`,
      {
        cache: "no-store",
        credentials: "omit",
        headers: {
          Range: `bytes=${offset}-${end}`,
        },
        signal,
      },
    );
    if (
      response.status !== 206 ||
      response.headers.get("Content-Range") !==
        `bytes ${offset}-${end}/${expected.byteLength}`
    ) {
      throw new Error(
        "Browser range response did not honor its byte range",
      );
    }
    const bytes = new Uint8Array(
      await response.arrayBuffer(),
    );
    if (bytes.byteLength !== length) {
      bytes.fill(0);
      throw new Error(
        "Browser range response length is invalid",
      );
    }
    aborted(signal);
    this.#rangeReads += 1;
    this.#rangeBytes += bytes.byteLength;
    return bytes;
  }

  async dispose() {
    if (this.#disposed) {
      return false;
    }
    this.#disposed = true;
    this.#detailByExpressId.clear();
    this.#handles.clear();
    this.#entityByExpressId.clear();
    return true;
  }
}
