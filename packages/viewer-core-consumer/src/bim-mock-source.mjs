const PROTOCOL_VERSION = "0.1.0";
const SOURCE_FINGERPRINT = `sha256:${"1".repeat(64)}`;
const REVISION_ID = `source-snapshot:${SOURCE_FINGERPRINT}`;
const SESSION_ID = "session:bim-explorer:mock";
const SOURCE_ID = "source:bim-explorer:mock-ifc";
const SNAPSHOT_PREFIX = "snapshot:bim-explorer:mock-ifc";
const LAYER_ID = "layer:bim-explorer:base-3d";
const RENDER_ID = "render:bim-explorer:wall-42";
const PICK_ID = "pick:bim-explorer:wall-42";
const EXTERNAL_IDENTITY =
  `ifc-globalid:${SOURCE_FINGERPRINT}:2O2Fr$t4X7Zf8NOew3FLOH`;
const RANGE_ID = "range:bim-explorer:mock-mesh";

const CAPABILITIES = Object.freeze([
  "layer-manifest",
  "render-snapshot",
  "range-read",
  "pick-resolve",
]);

function aborted(signal) {
  signal?.throwIfAborted?.();
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException("operation aborted", "AbortError");
  }
}

function invalidState(message) {
  return new DOMException(message, "InvalidStateError");
}

function freezeBounds(bounds) {
  return Object.freeze({
    min: Object.freeze([...bounds.min]),
    max: Object.freeze([...bounds.max]),
  });
}

export const BimMockPickFixture = Object.freeze({
  layerId: LAYER_ID,
  renderId: RENDER_ID,
  pickId: PICK_ID,
  worldPosition: Object.freeze([2, 1, 1.5]),
  worldBounds: freezeBounds({
    min: [0, 0, 0],
    max: [4, 0.2, 3],
  }),
});

function mockMeshBytes() {
  return Uint8Array.from([
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 128, 64,
    0, 0, 0, 0,
    0, 0, 64, 64,
  ]);
}

export class BimMockRenderSource {
  #bytes;
  #snapshotSequences;
  #snapshotIndex = 0;
  #opened = false;
  #disposed = false;
  #sessionDisposed = false;
  #sourceDisposals = 0;
  #sessionDisposals = 0;
  #rangeReads = 0;
  #pickResolutions = 0;

  constructor({
    protocolVersion = PROTOCOL_VERSION,
    snapshotSequences = [0],
  } = {}) {
    if (
      !Array.isArray(snapshotSequences) ||
      snapshotSequences.length === 0 ||
      !snapshotSequences.every(Number.isSafeInteger)
    ) {
      throw new TypeError("snapshotSequences must contain integers");
    }
    this.supportedProtocolVersions = Object.freeze([protocolVersion]);
    this.#snapshotSequences = Object.freeze([...snapshotSequences]);
    this.#bytes = mockMeshBytes();
  }

  get state() {
    return Object.freeze({
      opened: this.#opened,
      disposed: this.#disposed,
      sessionDisposed: this.#sessionDisposed,
      sourceDisposals: this.#sourceDisposals,
      sessionDisposals: this.#sessionDisposals,
      rangeReads: this.#rangeReads,
      pickResolutions: this.#pickResolutions,
    });
  }

  #assertSourceOpen() {
    if (this.#disposed) {
      throw invalidState("BIM mock source is disposed");
    }
  }

  #rangeHandle(protocolVersion) {
    return Object.freeze({
      protocolVersion,
      handleId: RANGE_ID,
      sessionId: SESSION_ID,
      sourceId: SOURCE_ID,
      revisionId: REVISION_ID,
      layerId: LAYER_ID,
      mediaType: "application/vnd.bim-explorer.mock-mesh",
      byteLength: this.#bytes.byteLength,
      maximumRequestBytes: this.#bytes.byteLength,
      remainingReadBytes: this.#bytes.byteLength,
      sha256: "2".repeat(64),
      expiresAt: null,
      disposeWithSession: true,
    });
  }

  #snapshot(protocolVersion) {
    const sequence = this.#snapshotSequences[
      Math.min(this.#snapshotIndex, this.#snapshotSequences.length - 1)
    ];
    this.#snapshotIndex += 1;
    return Object.freeze({
      protocolVersion,
      sessionId: SESSION_ID,
      sourceId: SOURCE_ID,
      revisionId: REVISION_ID,
      snapshotId: `${SNAPSHOT_PREFIX}:${sequence}`,
      sequence,
      layers: Object.freeze([
        Object.freeze({
          layerId: LAYER_ID,
          sourceId: SOURCE_ID,
          revisionId: REVISION_ID,
          kind: "base",
          representation: "3d",
          order: 0,
          visible: true,
          rangeHandle: this.#rangeHandle(protocolVersion),
        }),
      ]),
    });
  }

  async open({ protocolVersion, signal } = {}) {
    this.#assertSourceOpen();
    aborted(signal);
    if (this.#opened) {
      throw invalidState("BIM mock source supports one session");
    }
    if (!this.supportedProtocolVersions.includes(protocolVersion)) {
      throw new RangeError(`unsupported render protocol ${protocolVersion}`);
    }
    this.#opened = true;
    const descriptor = Object.freeze({
      protocolVersion,
      sessionId: SESSION_ID,
      sourceId: SOURCE_ID,
      currentRevisionId: REVISION_ID,
      lastSuccessfulRevisionId: REVISION_ID,
      capabilities: CAPABILITIES,
      resourceBudgetBytes: 4096,
    });

    return {
      descriptor,
      getSnapshot: async ({ signal: snapshotSignal } = {}) => {
        this.#assertSourceOpen();
        if (this.#sessionDisposed) {
          throw invalidState("BIM mock session is disposed");
        }
        aborted(snapshotSignal);
        return this.#snapshot(protocolVersion);
      },
      readRange: async (
        handle,
        offset,
        length,
        { signal: rangeSignal } = {},
      ) => {
        this.#assertSourceOpen();
        if (this.#sessionDisposed) {
          throw invalidState("BIM mock session is disposed");
        }
        aborted(rangeSignal);
        if (
          handle?.handleId !== RANGE_ID ||
          handle?.revisionId !== REVISION_ID ||
          handle?.sourceId !== SOURCE_ID ||
          handle?.layerId !== LAYER_ID
        ) {
          throw new RangeError("range handle is outside the BIM snapshot");
        }
        if (
          !Number.isSafeInteger(offset) ||
          !Number.isSafeInteger(length) ||
          offset < 0 ||
          length <= 0 ||
          offset + length > this.#bytes.byteLength
        ) {
          throw new RangeError("BIM mock range is invalid");
        }
        this.#rangeReads += 1;
        return this.#bytes.slice(offset, offset + length);
      },
      resolvePick: async (
        request,
        { signal: pickSignal } = {},
      ) => {
        this.#assertSourceOpen();
        if (this.#sessionDisposed) {
          throw invalidState("BIM mock session is disposed");
        }
        aborted(pickSignal);
        for (const [key, expected] of Object.entries({
          protocolVersion,
          sessionId: SESSION_ID,
          sourceId: SOURCE_ID,
          revisionId: REVISION_ID,
          layerId: LAYER_ID,
          renderId: RENDER_ID,
          pickId: PICK_ID,
        })) {
          if (request?.[key] !== expected) {
            throw new RangeError(`pick ${key} is outside the BIM snapshot`);
          }
        }
        this.#pickResolutions += 1;
        return Object.freeze({
          ...request,
          externalIdentityToken: EXTERNAL_IDENTITY,
        });
      },
      dispose: async () => {
        if (this.#sessionDisposed) {
          return false;
        }
        this.#sessionDisposed = true;
        this.#sessionDisposals += 1;
        return true;
      },
    };
  }

  async dispose() {
    if (this.#disposed) {
      return false;
    }
    this.#disposed = true;
    this.#sourceDisposals += 1;
    return true;
  }
}
