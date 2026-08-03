const PROTOCOL_VERSION = "0.1.0";
const SESSION_ID = "session:bim-explorer:delta";
const SOURCE_ID = "source:bim-explorer:delta";
const LAYER_ID = "layer:bim-explorer:delta-3d";
const BASE_SNAPSHOT_ID = "snapshot:bim-explorer:delta:base";
const INITIAL_REVISION = `source-snapshot:sha256:${"4".repeat(64)}`;
const SECOND_REVISION = `source-snapshot:sha256:${"5".repeat(64)}`;
const THIRD_REVISION = `source-snapshot:sha256:${"6".repeat(64)}`;
const RENDER_ID = "render:bim-explorer:delta-wall";
const WORLD_BOUNDS = Object.freeze({
  min: Object.freeze([0, 0, 0]),
  max: Object.freeze([4, 0.2, 3]),
});

function aborted(signal) {
  signal?.throwIfAborted?.();
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException("operation aborted", "AbortError");
  }
}

function operation({
  operationId,
  kind,
  aspect,
  externalIdentityToken,
}) {
  return Object.freeze({
    operationId,
    kind,
    aspect,
    layerId: LAYER_ID,
    sourceId: SOURCE_ID,
    renderIds: Object.freeze([RENDER_ID]),
    affectedWorldBounds: WORLD_BOUNDS,
    dependencyIds: Object.freeze([]),
    externalIdentityToken,
  });
}

function deltas(protocolVersion) {
  return Object.freeze([
    Object.freeze({
      protocolVersion,
      deltaId: "delta:bim-explorer:1",
      sessionId: SESSION_ID,
      sourceId: SOURCE_ID,
      baseSnapshotId: BASE_SNAPSHOT_ID,
      fromRevisionId: INITIAL_REVISION,
      toRevisionId: SECOND_REVISION,
      sequence: 1,
      operations: Object.freeze([
        operation({
          operationId: "operation:bim-explorer:upsert",
          kind: "upsert",
          aspect: "geometry",
          externalIdentityToken:
            `ifc-globalid:sha256:${"4".repeat(64)}:2O2Fr$t4X7Zf8NOew3FLOH`,
        }),
      ]),
      affectedWorldBounds: WORLD_BOUNDS,
      payload: Object.freeze({
        protocolVersion,
        payloadId: "payload:bim-explorer:delta:1",
        sessionId: SESSION_ID,
        sourceId: SOURCE_ID,
        fromRevisionId: INITIAL_REVISION,
        toRevisionId: SECOND_REVISION,
        mediaType: "application/vnd.bim-explorer.mock-mesh-delta",
        byteLength: 64,
        sha256: "7".repeat(64),
        expiresAt: null,
        disposeWithSession: true,
      }),
    }),
    Object.freeze({
      protocolVersion,
      deltaId: "delta:bim-explorer:2",
      sessionId: SESSION_ID,
      sourceId: SOURCE_ID,
      baseSnapshotId: BASE_SNAPSHOT_ID,
      fromRevisionId: SECOND_REVISION,
      toRevisionId: THIRD_REVISION,
      sequence: 2,
      operations: Object.freeze([
        operation({
          operationId: "operation:bim-explorer:tombstone",
          kind: "tombstone",
          aspect: "entity",
          externalIdentityToken: null,
        }),
      ]),
      affectedWorldBounds: WORLD_BOUNDS,
      payload: null,
    }),
  ]);
}

export class BimMockRenderDeltaSource {
  #opened = false;
  #disposed = false;
  #sessionDisposed = false;
  #listener;
  #cursor = 0;
  #deltas;

  constructor({ protocolVersion = PROTOCOL_VERSION } = {}) {
    this.supportedProtocolVersions = Object.freeze([protocolVersion]);
    this.#deltas = deltas(protocolVersion);
  }

  async open({ protocolVersion, signal } = {}) {
    if (this.#disposed) {
      throw new DOMException("delta source is disposed", "InvalidStateError");
    }
    if (this.#opened) {
      throw new DOMException(
        "delta source supports one session",
        "InvalidStateError",
      );
    }
    if (!this.supportedProtocolVersions.includes(protocolVersion)) {
      throw new RangeError(`unsupported render protocol ${protocolVersion}`);
    }
    aborted(signal);
    this.#opened = true;
    const descriptor = Object.freeze({
      protocolVersion,
      sessionId: SESSION_ID,
      sourceId: SOURCE_ID,
      currentRevisionId: INITIAL_REVISION,
      lastSuccessfulRevisionId: INITIAL_REVISION,
      capabilities: Object.freeze([
        "layer-manifest",
        "render-snapshot",
        "render-delta",
      ]),
      resourceBudgetBytes: 4096,
    });
    const snapshot = Object.freeze({
      protocolVersion,
      sessionId: SESSION_ID,
      sourceId: SOURCE_ID,
      revisionId: INITIAL_REVISION,
      snapshotId: BASE_SNAPSHOT_ID,
      sequence: 0,
      layers: Object.freeze([
        Object.freeze({
          layerId: LAYER_ID,
          sourceId: SOURCE_ID,
          revisionId: INITIAL_REVISION,
          kind: "live",
          representation: "3d",
          order: 0,
          visible: true,
        }),
      ]),
    });

    return {
      descriptor,
      getSnapshot: async ({ signal: snapshotSignal } = {}) => {
        if (this.#sessionDisposed) {
          throw new DOMException(
            "delta session is disposed",
            "InvalidStateError",
          );
        }
        aborted(snapshotSignal);
        return snapshot;
      },
      subscribeRenderDeltas: async (
        listener,
        { signal: subscriptionSignal } = {},
      ) => {
        if (this.#sessionDisposed) {
          throw new DOMException(
            "delta session is disposed",
            "InvalidStateError",
          );
        }
        aborted(subscriptionSignal);
        if (typeof listener !== "function") {
          throw new TypeError("delta listener must be a function");
        }
        if (this.#listener) {
          throw new DOMException(
            "delta source already has a subscriber",
            "InvalidStateError",
          );
        }
        this.#listener = listener;
        let disposed = false;
        return {
          dispose: () => {
            if (disposed) {
              return false;
            }
            disposed = true;
            if (this.#listener === listener) {
              this.#listener = undefined;
            }
            return true;
          },
        };
      },
      dispose: async () => {
        if (this.#sessionDisposed) {
          return false;
        }
        this.#sessionDisposed = true;
        this.#listener = undefined;
        return true;
      },
    };
  }

  async emitNext() {
    if (!this.#listener) {
      throw new DOMException(
        "delta source has no subscriber",
        "InvalidStateError",
      );
    }
    const delta = this.#deltas[this.#cursor];
    if (!delta) {
      return null;
    }
    const accepted = await this.#listener(delta);
    if (accepted) {
      this.#cursor += 1;
    }
    return accepted;
  }

  async emit(delta) {
    if (!this.#listener) {
      throw new DOMException(
        "delta source has no subscriber",
        "InvalidStateError",
      );
    }
    return this.#listener(delta);
  }

  async dispose() {
    if (this.#disposed) {
      return false;
    }
    this.#disposed = true;
    this.#sessionDisposed = true;
    this.#listener = undefined;
    return true;
  }
}

export function createBimMockRenderDeltaHarness() {
  const source = new BimMockRenderDeltaSource();
  return Object.freeze({
    source,
    emitNext: () => source.emitNext(),
    emit: (delta) => source.emit(delta),
  });
}
