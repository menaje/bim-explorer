import {
  BIM_SOURCE_PROTOCOL_VERSION,
  createBimModelSource,
} from "@bim-explorer/bim-model-source";

export const VIEWER_RENDER_PROTOCOL_VERSION = "0.1.0";

const VIEWER_CAPABILITIES = Object.freeze([
  "layer-manifest",
  "render-snapshot",
  "range-read",
  "pick-resolve",
]);

function aborted(signal) {
  signal?.throwIfAborted?.();
  if (signal?.aborted) {
    throw (
      signal.reason ??
      new DOMException("operation aborted", "AbortError")
    );
  }
}

function invalidState(message) {
  return new DOMException(message, "InvalidStateError");
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

function layerId(sourceLayerId, index) {
  return `${sourceLayerId}:range:${index}`;
}

export class ViewerCoreBimRenderSource {
  #bimSnapshot = null;
  #bimSource;
  #externalSnapshot = null;
  #externalToInternalRange = new Map();
  #internalSession = null;
  #sessionDisposed = false;
  #disposed = false;

  constructor(artifact, options) {
    this.#bimSource = createBimModelSource(artifact, options);
    this.supportedProtocolVersions = Object.freeze([
      VIEWER_RENDER_PROTOCOL_VERSION,
    ]);
  }

  get state() {
    return Object.freeze({
      disposed: this.#disposed,
      sessionDisposed: this.#sessionDisposed,
      snapshotReady: this.#externalSnapshot !== null,
      bimSource: this.#bimSource.state,
    });
  }

  #assertSourceOpen() {
    if (this.#disposed) {
      throw invalidState("Viewer Core BIM source is disposed");
    }
  }

  #assertSessionOpen() {
    this.#assertSourceOpen();
    if (this.#sessionDisposed || this.#internalSession === null) {
      throw invalidState("Viewer Core BIM session is disposed");
    }
  }

  #externalRangeHandle(internalHandle, externalLayerId) {
    return deepFreeze({
      protocolVersion: VIEWER_RENDER_PROTOCOL_VERSION,
      handleId: internalHandle.handleId,
      sessionId: internalHandle.sessionId,
      sourceId: internalHandle.sourceId,
      revisionId: internalHandle.revisionId,
      layerId: externalLayerId,
      mediaType: internalHandle.mediaType,
      byteLength: internalHandle.byteLength,
      maximumRequestBytes: internalHandle.maximumRequestBytes,
      remainingReadBytes: internalHandle.byteLength,
      sha256: internalHandle.sha256,
      expiresAt: internalHandle.expiresAt,
      disposeWithSession: internalHandle.disposeWithSession,
    });
  }

  #createExternalSnapshot(internalSnapshot) {
    const sourceLayer = internalSnapshot.layers.find(
      (candidate) => candidate.representation === "3d",
    );
    if (
      sourceLayer === undefined ||
      !Array.isArray(sourceLayer.rangeHandles) ||
      sourceLayer.rangeHandles.length === 0
    ) {
      throw new Error("BIM source has no bounded 3D range");
    }
    const layers = sourceLayer.rangeHandles.map((handle, index) => {
      const externalLayerId = layerId(sourceLayer.layerId, index);
      const externalHandle = this.#externalRangeHandle(
        handle,
        externalLayerId,
      );
      this.#externalToInternalRange.set(handle.handleId, {
        external: externalHandle,
        internal: handle,
      });
      return deepFreeze({
        layerId: externalLayerId,
        sourceId: sourceLayer.sourceId,
        revisionId: sourceLayer.revisionId,
        kind: sourceLayer.kind,
        representation: sourceLayer.representation,
        order: sourceLayer.order + index,
        visible: sourceLayer.visible,
        rangeHandle: externalHandle,
      });
    });
    return deepFreeze({
      protocolVersion: VIEWER_RENDER_PROTOCOL_VERSION,
      sessionId: internalSnapshot.sessionId,
      sourceId: internalSnapshot.sourceId,
      revisionId: internalSnapshot.revisionId,
      snapshotId: internalSnapshot.snapshotId,
      sequence: internalSnapshot.sequence,
      layers,
    });
  }

  async open({ protocolVersion, signal } = {}) {
    this.#assertSourceOpen();
    aborted(signal);
    if (protocolVersion !== VIEWER_RENDER_PROTOCOL_VERSION) {
      throw new RangeError(
        `unsupported Viewer render protocol ${protocolVersion}`,
      );
    }
    if (this.#internalSession !== null) {
      throw invalidState("Viewer Core BIM source supports one session");
    }
    const internalSession = await this.#bimSource.open({
      protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
      signal,
    });
    this.#internalSession = internalSession;
    const internalDescriptor = internalSession.descriptor;
    const descriptor = deepFreeze({
      protocolVersion: VIEWER_RENDER_PROTOCOL_VERSION,
      sessionId: internalDescriptor.sessionId,
      sourceId: internalDescriptor.sourceId,
      currentRevisionId: internalDescriptor.currentRevisionId,
      lastSuccessfulRevisionId:
        internalDescriptor.lastSuccessfulRevisionId,
      capabilities: VIEWER_CAPABILITIES,
      resourceBudgetBytes: internalDescriptor.resourceBudgetBytes,
    });

    return {
      descriptor,
      getSnapshot: async ({ signal: snapshotSignal } = {}) => {
        this.#assertSessionOpen();
        aborted(snapshotSignal);
        if (this.#externalSnapshot === null) {
          this.#bimSnapshot = await internalSession.getSnapshot({
            signal: snapshotSignal,
          });
          this.#externalSnapshot =
            this.#createExternalSnapshot(this.#bimSnapshot);
        }
        return this.#externalSnapshot;
      },
      readRange: async (
        externalHandle,
        offset,
        length,
        { signal: rangeSignal } = {},
      ) => {
        this.#assertSessionOpen();
        aborted(rangeSignal);
        const mapped = this.#externalToInternalRange.get(
          externalHandle?.handleId,
        );
        if (
          mapped === undefined ||
          mapped.external.layerId !== externalHandle.layerId ||
          mapped.external.sha256 !== externalHandle.sha256
        ) {
          throw new RangeError(
            "Viewer Core range is outside the BIM snapshot",
          );
        }
        return internalSession.readRange(
          mapped.internal,
          offset,
          length,
          { signal: rangeSignal },
        );
      },
      resolvePick: async (
        request,
        { signal: pickSignal } = {},
      ) => {
        this.#assertSessionOpen();
        aborted(pickSignal);
        if (
          this.#externalSnapshot === null ||
          !this.#externalSnapshot.layers.some(
            (candidate) => candidate.layerId === request?.layerId,
          )
        ) {
          throw new RangeError(
            "Viewer Core pick layer is outside the BIM snapshot",
          );
        }
        const identity = await internalSession.resolvePick({
          protocolVersion: BIM_SOURCE_PROTOCOL_VERSION,
          sessionId: request.sessionId,
          sourceId: request.sourceId,
          revisionId: request.revisionId,
          snapshotId: request.snapshotId,
          layerId: this.#bimSnapshot.layers[0].layerId,
          renderId: request.renderId,
          pickId: request.pickId,
        }, {
          signal: pickSignal,
        });
        return deepFreeze({
          protocolVersion: VIEWER_RENDER_PROTOCOL_VERSION,
          sessionId: request.sessionId,
          sourceId: request.sourceId,
          revisionId: request.revisionId,
          snapshotId: request.snapshotId,
          layerId: request.layerId,
          renderId: request.renderId,
          pickId: request.pickId,
          worldPosition: [...request.worldPosition],
          worldBounds: {
            min: [...request.worldBounds.min],
            max: [...request.worldBounds.max],
          },
          externalIdentityToken: identity.externalIdentityToken,
        });
      },
      dispose: async () => {
        if (this.#sessionDisposed) {
          return false;
        }
        this.#sessionDisposed = true;
        return internalSession.dispose();
      },
    };
  }

  rendererSnapshot(viewerSnapshot) {
    this.#assertSessionOpen();
    if (
      this.#bimSnapshot === null ||
      this.#externalSnapshot === null ||
      viewerSnapshot?.snapshotId !== this.#externalSnapshot.snapshotId ||
      viewerSnapshot?.revisionId !== this.#externalSnapshot.revisionId
    ) {
      throw new RangeError(
        "Viewer snapshot is outside the active BIM source",
      );
    }
    return this.#bimSnapshot;
  }

  viewerRangeHandle(internalHandle) {
    this.#assertSessionOpen();
    const mapped = this.#externalToInternalRange.get(
      internalHandle?.handleId,
    );
    if (
      mapped === undefined ||
      mapped.internal.sha256 !== internalHandle.sha256
    ) {
      throw new RangeError(
        "BIM renderer range is outside the Viewer snapshot",
      );
    }
    return mapped.external;
  }

  async dispose() {
    if (this.#disposed) {
      return false;
    }
    this.#disposed = true;
    this.#externalToInternalRange.clear();
    return this.#bimSource.dispose();
  }
}

export function createViewerCoreBimRenderSource(artifact, options) {
  return new ViewerCoreBimRenderSource(artifact, options);
}

export function createViewerCoreBimRendererMount({
  renderer,
  source,
  state = {},
} = {}) {
  if (
    renderer === null ||
    typeof renderer !== "object" ||
    typeof renderer.mount !== "function" ||
    typeof renderer.unmount !== "function" ||
    typeof renderer.dispose !== "function"
  ) {
    throw new TypeError("Viewer Core BIM mount requires a renderer");
  }
  if (!(source instanceof ViewerCoreBimRenderSource)) {
    throw new TypeError("Viewer Core BIM mount requires its source adapter");
  }
  return async ({ sourceSession, snapshot, signal }) => {
    const rendererSnapshot = source.rendererSnapshot(snapshot);
    const rendererSession = {
      readRange: async (
        handle,
        offset,
        length,
        options,
      ) => new Uint8Array(
        await sourceSession.readRange(
          source.viewerRangeHandle(handle),
          offset,
          length,
          options,
        ),
      ),
    };
    const receipt = await renderer.mount({
      session: rendererSession,
      snapshot: rendererSnapshot,
      signal,
    });
    state.receipt = receipt;
    let disposed = false;
    return {
      dispose: async () => {
        if (disposed) {
          return false;
        }
        disposed = true;
        state.unmount = await renderer.unmount();
        await renderer.dispose();
        return true;
      },
    };
  };
}
