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

export class BrowserGeometryRangeSession {
  #disposed = false;
  #handles;
  #rangeBytes = 0;
  #rangeReads = 0;

  constructor(snapshot) {
    const layer = snapshot?.layers?.find(
      (candidate) => candidate.layerId === snapshot.layerId,
    );
    if (!Array.isArray(layer?.rangeHandles)) {
      throw new TypeError(
        "Browser range session snapshot has no range handles",
      );
    }
    this.#handles = new Map(
      layer.rangeHandles.map((handle) => [
        handle.handleId,
        handle,
      ]),
    );
  }

  get state() {
    return Object.freeze({
      disposed: this.#disposed,
      rangeReads: this.#rangeReads,
      rangeBytes: this.#rangeBytes,
    });
  }

  async readRange(
    handle,
    offset,
    length,
    { signal } = {},
  ) {
    aborted(signal);
    if (this.#disposed) {
      throw invalidState("Browser range session is disposed");
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
      throw new RangeError("Browser range read is outside its handle");
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
    const expectedContentRange =
      `bytes ${offset}-${end}/${expected.byteLength}`;
    if (
      response.status !== 206 ||
      response.headers.get("Content-Range") !==
        expectedContentRange
    ) {
      throw new Error(
        "Browser range response did not honor its byte range",
      );
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength !== length) {
      bytes.fill(0);
      throw new Error("Browser range response length is invalid");
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
    return true;
  }
}
