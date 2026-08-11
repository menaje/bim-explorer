import {
  ViewerCoreApi,
  ViewerCoreVersion,
  ViewerSelectionController,
  openViewerRuntime,
} from "@menaje/viewer-core";
import {
  RenderProtocolId,
  RenderProtocolVersion,
} from "@menaje/viewer-render-protocol";

export const BIM_PRODUCT_VIEWER_CORE_CONTRACT =
  "bim-explorer-product-viewer-core/0.1";

const MAXIMUM_HOST_EVENTS = 64;
const VIEWER_CAPABILITIES = Object.freeze([
  "layer-manifest",
  "range-read",
  "render-snapshot",
]);
const VIEWER_LAYER_KINDS = new Set([
  "base",
  "live",
  "added",
  "modified",
  "removed",
  "diagnostic",
  "selection",
  "annotation",
]);
const SEMANTIC_METHODS = Object.freeze([
  "getEntity",
  "getEntityDetails",
  "getPropertySetValues",
  "queryRelations",
  "queryTree",
  "searchEntities",
]);

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

function method(value, name, label) {
  if (typeof value[name] !== "function") {
    throw new TypeError(`${label} must implement ${name}()`);
  }
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive integer`);
  }
  return value;
}

function boundedString(value, label, maximumLength = 512) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximumLength
  ) {
    throw new TypeError(`${label} must be a bounded string`);
  }
  return value;
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

function validateOpened(value) {
  const opened = plainRecord(value, "product source receipt");
  const session = plainRecord(
    opened.session,
    "product source session",
  );
  method(session, "readRange", "product source session");
  method(session, "dispose", "product source session");
  for (const name of SEMANTIC_METHODS) {
    method(session, name, "product source session");
  }
  const descriptor = plainRecord(
    session.descriptor,
    "product source descriptor",
  );
  for (const field of [
    "sessionId",
    "sourceId",
    "currentRevisionId",
  ]) {
    boundedString(
      descriptor[field],
      `product source descriptor.${field}`,
      256,
    );
  }
  positiveInteger(
    descriptor.resourceBudgetBytes,
    "product source descriptor.resourceBudgetBytes",
  );
  const snapshot = plainRecord(
    opened.snapshot,
    "product source snapshot",
  );
  if (
    !Array.isArray(snapshot.layers) ||
    snapshot.layers.length === 0
  ) {
    throw new TypeError(
      "product source snapshot must contain render layers",
    );
  }
  const workerLease = plainRecord(
    opened.workerLease,
    "product source Worker lease",
  );
  if (
    typeof workerLease.dispose !== "function" &&
    typeof workerLease.terminate !== "function"
  ) {
    throw new TypeError(
      "product source Worker lease must be disposable",
    );
  }
  return opened;
}

function productSelection(value) {
  const selection = plainRecord(value, "product selection");
  const projected = {};
  if (Number.isSafeInteger(selection.expressId)) {
    projected.expressId = selection.expressId;
  }
  for (const name of [
    "globalId",
    "kind",
    "nativeId",
    "renderId",
  ]) {
    const candidate = selection[name];
    if (
      typeof candidate === "string" &&
      candidate.length > 0 &&
      candidate.length <= 512
    ) {
      projected[name] = candidate;
    }
  }
  if (Object.keys(projected).length === 0) {
    throw new TypeError(
      "product selection has no bounded public identity",
    );
  }
  return Object.freeze(projected);
}

class ProductViewerHost {
  #disposed = false;
  #events = [];
  #kind;

  constructor(kind) {
    this.#kind = boundedString(kind, "product Viewer Host kind", 64);
  }

  get state() {
    return Object.freeze({
      disposed: this.#disposed,
      eventCount: this.#events.length,
      kind: this.#kind,
      lastEventType: this.#events.at(-1)?.type ?? null,
    });
  }

  handleEvent(value) {
    if (this.#disposed) {
      throw invalidState("product Viewer Host is disposed");
    }
    const event = plainRecord(value, "product Viewer Host event");
    boundedString(event.type, "product Viewer Host event type", 128);
    const retained = deepFreeze(structuredClone(event));
    this.#events.push(retained);
    if (this.#events.length > MAXIMUM_HOST_EVENTS) {
      this.#events.shift();
    }
    return retained;
  }

  dispose() {
    if (this.#disposed) {
      return false;
    }
    this.#disposed = true;
    return true;
  }
}

class ProductViewerRenderSource {
  #disposed = false;
  #externalSnapshot;
  #externalToInternal = new Map();
  #internalToExternal = new Map();
  #opened;
  #rangeBytesRead = 0;
  #rangeReads = 0;
  #releasePromise = null;
  #sessionOpened = false;
  #sessionDisposed = false;

  constructor(opened) {
    this.#opened = validateOpened(opened);
    this.supportedProtocolVersions = Object.freeze([
      RenderProtocolVersion,
    ]);
    this.#externalSnapshot = this.#createSnapshot();
  }

  get state() {
    return Object.freeze({
      disposed: this.#disposed,
      rangeBytesRead: this.#rangeBytesRead,
      rangeReads: this.#rangeReads,
      sessionDisposed: this.#sessionDisposed,
      sessionOpened: this.#sessionOpened,
    });
  }

  #createSnapshot() {
    const internal = this.#opened.snapshot;
    const descriptor = this.#opened.session.descriptor;
    const layers = [];
    for (const sourceLayer of internal.layers) {
      const handles = sourceLayer.rangeHandles;
      if (!Array.isArray(handles)) {
        continue;
      }
      for (const [index, handleValue] of handles.entries()) {
        const handle = plainRecord(
          handleValue,
          "product render range handle",
        );
        const externalLayerId =
          `${sourceLayer.layerId}:viewer-range:${index}`;
        const externalHandle = deepFreeze({
          protocolVersion: RenderProtocolVersion,
          handleId: boundedString(
            handle.handleId,
            "product render range handle ID",
            256,
          ),
          sessionId: descriptor.sessionId,
          sourceId: sourceLayer.sourceId,
          revisionId: sourceLayer.revisionId,
          layerId: externalLayerId,
          mediaType: boundedString(
            handle.mediaType,
            "product render range media type",
            128,
          ),
          byteLength: positiveInteger(
            handle.byteLength,
            "product render range byte length",
          ),
          maximumRequestBytes: positiveInteger(
            handle.maximumRequestBytes,
            "product render maximum request bytes",
          ),
          remainingReadBytes: Math.min(
            descriptor.resourceBudgetBytes,
            handle.byteLength,
          ),
          sha256: boundedString(
            handle.sha256,
            "product render range digest",
            64,
          ),
          expiresAt: handle.expiresAt ?? null,
          disposeWithSession:
            handle.disposeWithSession === true,
        });
        const mapping = Object.freeze({
          external: externalHandle,
          internal: handle,
        });
        this.#externalToInternal.set(handle.handleId, mapping);
        this.#internalToExternal.set(handle.handleId, mapping);
        layers.push(deepFreeze({
          layerId: externalLayerId,
          sourceId: sourceLayer.sourceId,
          revisionId: sourceLayer.revisionId,
          kind: VIEWER_LAYER_KINDS.has(sourceLayer.kind)
            ? sourceLayer.kind
            : "base",
          representation: sourceLayer.representation,
          order: sourceLayer.order + index,
          visible: sourceLayer.visible,
          rangeHandle: externalHandle,
        }));
      }
    }
    if (layers.length === 0) {
      throw new TypeError(
        "product source has no bounded render range",
      );
    }
    return deepFreeze({
      protocolVersion: RenderProtocolVersion,
      sessionId: descriptor.sessionId,
      sourceId: descriptor.sourceId,
      revisionId: internal.revisionId,
      snapshotId: internal.snapshotId,
      sequence: internal.sequence,
      layers,
    });
  }

  #assertSessionOpen() {
    if (
      this.#disposed ||
      this.#sessionDisposed ||
      !this.#sessionOpened
    ) {
      throw invalidState(
        "product Viewer render source session is disposed",
      );
    }
  }

  #release() {
    this.#releasePromise ??= (async () => {
      const errors = [];
      try {
        await this.#opened.session.dispose();
      } catch (error) {
        errors.push(error);
      }
      try {
        if (typeof this.#opened.workerLease.dispose === "function") {
          await this.#opened.workerLease.dispose();
        } else {
          await this.#opened.workerLease.terminate();
        }
      } catch (error) {
        errors.push(error);
      }
      if (errors.length === 1) {
        throw errors[0];
      }
      if (errors.length > 1) {
        throw new AggregateError(
          errors,
          "product Viewer source cleanup failed",
        );
      }
      return true;
    })();
    return this.#releasePromise;
  }

  async open({ protocolVersion, signal } = {}) {
    if (this.#disposed) {
      throw invalidState("product Viewer render source is disposed");
    }
    aborted(signal);
    if (protocolVersion !== RenderProtocolVersion) {
      throw new RangeError(
        `unsupported Viewer render protocol ${protocolVersion}`,
      );
    }
    if (this.#sessionOpened) {
      throw invalidState(
        "product Viewer render source supports one session",
      );
    }
    this.#sessionOpened = true;
    const internalDescriptor = this.#opened.session.descriptor;
    const descriptor = deepFreeze({
      protocolVersion: RenderProtocolVersion,
      sessionId: internalDescriptor.sessionId,
      sourceId: internalDescriptor.sourceId,
      currentRevisionId: internalDescriptor.currentRevisionId,
      lastSuccessfulRevisionId:
        internalDescriptor.lastSuccessfulRevisionId ??
        internalDescriptor.currentRevisionId,
      capabilities: VIEWER_CAPABILITIES,
      resourceBudgetBytes:
        internalDescriptor.resourceBudgetBytes,
    });
    return {
      descriptor,
      getSnapshot: async ({ signal: snapshotSignal } = {}) => {
        this.#assertSessionOpen();
        aborted(snapshotSignal);
        return this.#externalSnapshot;
      },
      readRange: async (
        handle,
        offset,
        length,
        { signal: rangeSignal } = {},
      ) => {
        this.#assertSessionOpen();
        aborted(rangeSignal);
        const mapping = this.#externalToInternal.get(
          handle?.handleId,
        );
        if (
          mapping === undefined ||
          handle.layerId !== mapping.external.layerId ||
          handle.sha256 !== mapping.external.sha256
        ) {
          throw new RangeError(
            "Viewer range is outside the product snapshot",
          );
        }
        const bytes = await this.#opened.session.readRange(
          mapping.internal,
          offset,
          length,
          { signal: rangeSignal },
        );
        this.#rangeReads += 1;
        this.#rangeBytesRead += bytes.byteLength;
        return bytes;
      },
      dispose: async () => {
        if (this.#sessionDisposed) {
          return false;
        }
        this.#sessionDisposed = true;
        return this.#release();
      },
    };
  }

  internalSnapshot(viewerSnapshot) {
    this.#assertSessionOpen();
    if (
      viewerSnapshot?.snapshotId !==
        this.#externalSnapshot.snapshotId ||
      viewerSnapshot?.revisionId !==
        this.#externalSnapshot.revisionId
    ) {
      throw new RangeError(
        "Viewer snapshot is outside the product source",
      );
    }
    return this.#opened.snapshot;
  }

  viewerRangeHandle(internalHandle) {
    this.#assertSessionOpen();
    const mapping = this.#internalToExternal.get(
      internalHandle?.handleId,
    );
    if (
      mapping === undefined ||
      mapping.internal.sha256 !== internalHandle.sha256
    ) {
      throw new RangeError(
        "product range is outside the Viewer snapshot",
      );
    }
    return mapping.external;
  }

  get semanticSession() {
    return this.#opened.session;
  }

  async dispose() {
    if (this.#disposed) {
      return false;
    }
    this.#disposed = true;
    this.#externalToInternal.clear();
    this.#internalToExternal.clear();
    await this.#release();
    return true;
  }
}

class BorrowedProductSession {
  #disposed = false;
  #source;
  #sourceSession;

  constructor(source, sourceSession) {
    this.#source = source;
    this.#sourceSession = sourceSession;
    this.descriptor = source.semanticSession.descriptor;
    for (const name of SEMANTIC_METHODS) {
      this[name] = (request, options = {}) => {
        this.#assertOpen();
        aborted(options.signal);
        return this.#source.semanticSession[name](
          request,
          options,
        );
      };
    }
  }

  get state() {
    return Object.freeze({ disposed: this.#disposed });
  }

  #assertOpen() {
    if (this.#disposed) {
      throw invalidState("borrowed product session is disposed");
    }
  }

  async readRange(handle, offset, length, options = {}) {
    this.#assertOpen();
    return new Uint8Array(
      await this.#sourceSession.readRange(
        this.#source.viewerRangeHandle(handle),
        offset,
        length,
        options,
      ),
    );
  }

  async dispose() {
    if (this.#disposed) {
      return false;
    }
    this.#disposed = true;
    return true;
  }
}

class BorrowedWorkerLease {
  #disposed = false;

  get state() {
    return Object.freeze({ disposed: this.#disposed });
  }

  dispose() {
    if (this.#disposed) {
      return false;
    }
    this.#disposed = true;
    return true;
  }

  terminate() {
    return this.dispose();
  }
}

class ProductViewerCoreRuntime {
  #presentation;
  #runtime;
  #selection;
  #source;

  constructor({ presentation, runtime, selection, source }) {
    this.#presentation = presentation;
    this.#runtime = runtime;
    this.#selection = selection;
    this.#source = source;
  }

  get product() {
    return this.#presentation.product;
  }

  get state() {
    return Object.freeze({
      adopted: true,
      api: ViewerCoreApi,
      contract: BIM_PRODUCT_VIEWER_CORE_CONTRACT,
      descriptorProtocolVersion:
        this.#runtime.descriptor.protocolVersion,
      disposed: this.#runtime.disposed,
      host: this.#runtime.host.state,
      presentation: this.#presentation.state,
      protocolId: RenderProtocolId,
      protocolVersion: RenderProtocolVersion,
      selection: this.#selection.snapshot(),
      source: this.#source.state,
      version: ViewerCoreVersion,
    });
  }

  publishSelection(value, { reason = "product-selection" } = {}) {
    return value === null
      ? this.#selection.clear({ force: true, reason })
      : this.#selection.replace(value, {
          force: true,
          reason,
        });
  }

  dispose() {
    return this.#runtime.dispose();
  }
}

export async function openBimProductViewerCore({
  kind,
  mountProduct,
  opened: openedValue,
  signal,
} = {}) {
  if (typeof mountProduct !== "function") {
    throw new TypeError(
      "product Viewer Core requires mountProduct()",
    );
  }
  const opened = validateOpened(openedValue);
  const source = new ProductViewerRenderSource(opened);
  const host = new ProductViewerHost(kind);
  let presentation = null;
  let selection = null;
  const runtime = await openViewerRuntime(source, {
    host,
    signal,
    supportedProtocolVersions: [RenderProtocolVersion],
    mount: async ({
      host: viewerHost,
      signal: mountSignal,
      snapshot: viewerSnapshot,
      sourceSession,
    }) => {
      const borrowedSession = new BorrowedProductSession(
        source,
        sourceSession,
      );
      const borrowedWorkerLease = new BorrowedWorkerLease();
      selection = new ViewerSelectionController({
        host: viewerHost,
        snapshot: viewerSnapshot,
        projectSelection: productSelection,
        sameSelection: (left, right) =>
          JSON.stringify(left) === JSON.stringify(right),
      });
      let product = null;
      let disposed = false;
      let disposalStatus = "active";
      try {
        product = plainRecord(
          await mountProduct({
            publishSelection: (value, options = {}) =>
              value === null
                ? selection.clear({
                    force: true,
                    ...options,
                  })
                : selection.replace(value, {
                    force: true,
                    ...options,
                  }),
            session: borrowedSession,
            signal: mountSignal,
            snapshot: source.internalSnapshot(viewerSnapshot),
            workerLease: borrowedWorkerLease,
          }),
          "product Viewer Core presentation",
        );
        method(
          product,
          "dispose",
          "product Viewer Core presentation",
        );
      } catch (error) {
        selection.dispose();
        await Promise.allSettled([
          borrowedSession.dispose(),
          borrowedWorkerLease.dispose(),
        ]);
        throw error;
      }
      presentation = {
        product,
        get state() {
          return Object.freeze({
            borrowedSessionDisposed:
              borrowedSession.state.disposed,
            borrowedWorkerDisposed:
              borrowedWorkerLease.state.disposed,
            disposalStatus,
            disposed,
          });
        },
        async dispose() {
          if (disposed) {
            return false;
          }
          disposed = true;
          selection.dispose();
          try {
            await product.dispose();
            disposalStatus = "disposed";
          } catch (error) {
            disposalStatus = "failed";
            throw error;
          }
          return true;
        },
      };
      return presentation;
    },
  });
  return new ProductViewerCoreRuntime({
    presentation,
    runtime,
    selection,
    source,
  });
}
