importScripts("/vendor/laz-perf.js");

const REQUEST_SCHEMA = "bim-explorer-laz-worker-request/0.1";
const RESULT_SCHEMA = "bim-explorer-laz-worker-result/0.1";
const PROGRESS_SCHEMA = "bim-explorer-laz-worker-progress/0.1";
const MAXIMUM_SOURCE_BYTES = 8 * 1024 * 1024;
const MAXIMUM_DECODED_POINT_BYTES = 64 * 1024 * 1024;
const MAXIMUM_POINT_RECORDS = 2_000_000;
const MAXIMUM_VLRS = 1_024;
const MINIMUM_HEADER_BYTES = 227;
const VLR_HEADER_BYTES = 54;
const MINIMUM_POINT_RECORD_BYTES = Object.freeze({
  0: 20,
  1: 28,
  2: 26,
  3: 34,
});
const SOURCE_ID = /^[a-z0-9][a-z0-9-]+$/u;
const PHASES = new Set([
  "source-admitted",
  "decoder-initialized",
  "decode-call-starting",
  "decode-complete",
]);
const CANCELLED = Symbol("cancelled");

let active = null;

function ascii(bytes, offset, length) {
  return new TextDecoder("ascii", { fatal: true })
    .decode(bytes.subarray(offset, offset + length))
    .replace(/\0+$/gu, "")
    .trim();
}

function finiteVector(view, offsets, label) {
  const values = offsets.map((offset) =>
    view.getFloat64(offset, true));
  if (values.some((value) => !Number.isFinite(value))) {
    throw new TypeError(`${label} must be finite`);
  }
  return values;
}

function parseVariableLengthRecords(
  bytes,
  view,
  headerSize,
  pointDataOffset,
  count,
) {
  const records = [];
  let offset = headerSize;
  for (let index = 0; index < count; index += 1) {
    if (offset + VLR_HEADER_BYTES > pointDataOffset) {
      throw new RangeError("LAZ VLR header is truncated");
    }
    const recordLength = view.getUint16(offset + 20, true);
    const end = offset + VLR_HEADER_BYTES + recordLength;
    if (end > pointDataOffset) {
      throw new RangeError("LAZ VLR payload is truncated");
    }
    records.push({
      userId: ascii(bytes, offset + 2, 16),
      recordId: view.getUint16(offset + 18, true),
    });
    offset = end;
  }
  return records;
}

function probeHeader(bytes) {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.byteLength < MINIMUM_HEADER_BYTES ||
    bytes.byteLength > MAXIMUM_SOURCE_BYTES
  ) {
    throw new RangeError("LAZ source exceeds its byte bound");
  }
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  );
  const signature = ascii(bytes, 0, 4);
  const versionMajor = view.getUint8(24);
  const versionMinor = view.getUint8(25);
  const headerSize = view.getUint16(94, true);
  const pointDataOffset = view.getUint32(96, true);
  const variableLengthRecordCount = view.getUint32(100, true);
  const pointFormatRaw = view.getUint8(104);
  const pointFormat = pointFormatRaw & 0x3f;
  const compressionBits = pointFormatRaw & 0xc0;
  const pointRecordLength = view.getUint16(105, true);
  const pointRecords = view.getUint32(107, true);
  const decodedPointBytes = pointRecordLength * pointRecords;
  if (
    signature !== "LASF" ||
    versionMajor !== 1 ||
    versionMinor > 3 ||
    headerSize < MINIMUM_HEADER_BYTES ||
    headerSize > bytes.byteLength ||
    pointDataOffset < headerSize ||
    pointDataOffset > bytes.byteLength ||
    variableLengthRecordCount > MAXIMUM_VLRS ||
    compressionBits === 0 ||
    compressionBits === 0xc0 ||
    MINIMUM_POINT_RECORD_BYTES[pointFormat] === undefined ||
    pointRecordLength < MINIMUM_POINT_RECORD_BYTES[pointFormat] ||
    pointRecords === 0 ||
    pointRecords > MAXIMUM_POINT_RECORDS ||
    !Number.isSafeInteger(decodedPointBytes) ||
    decodedPointBytes > MAXIMUM_DECODED_POINT_BYTES
  ) {
    throw new Error("LAZ header identity or profile is invalid");
  }
  const scale = finiteVector(
    view,
    [131, 139, 147],
    "LAZ coordinate scale",
  );
  const offset = finiteVector(
    view,
    [155, 163, 171],
    "LAZ coordinate offset",
  );
  const bounds = {
    min: finiteVector(
      view,
      [187, 203, 219],
      "LAZ minimum bounds",
    ),
    max: finiteVector(
      view,
      [179, 195, 211],
      "LAZ maximum bounds",
    ),
  };
  if (
    scale.some((value) => value <= 0) ||
    bounds.min.some((value, axis) => value > bounds.max[axis])
  ) {
    throw new RangeError("LAZ coordinate profile is invalid");
  }
  const records = parseVariableLengthRecords(
    bytes,
    view,
    headerSize,
    pointDataOffset,
    variableLengthRecordCount,
  );
  if (!records.some((record) =>
    record.userId === "laszip encoded" &&
    record.recordId === 22_204)) {
    throw new Error("LAZ compression VLR is missing");
  }
  return {
    bounds,
    decodedPointBytes,
    formatVersion: `${versionMajor}.${versionMinor}`,
    offset,
    pointFormat,
    pointRecordLength,
    pointRecords,
    scale,
  };
}

async function sha256(bytes) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ),
  );
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0")).join("");
}

function createProfile() {
  return {
    points: 0,
    bounds: {
      min: [Infinity, Infinity, Infinity],
      max: [-Infinity, -Infinity, -Infinity],
    },
    firstPosition: null,
    lastPosition: null,
    intensityRange: [Infinity, -Infinity],
    classifications: new Set(),
    colorRange: {
      min: [Infinity, Infinity, Infinity],
      max: [-Infinity, -Infinity, -Infinity],
    },
    firstColor: null,
    lastColor: null,
  };
}

function observePoint(record, header, profile) {
  const view = new DataView(
    record.buffer,
    record.byteOffset,
    record.byteLength,
  );
  const position = [0, 1, 2].map((axis) =>
    view.getInt32(axis * 4, true) * header.scale[axis] +
      header.offset[axis]);
  profile.firstPosition ??= position;
  profile.lastPosition = position;
  for (let axis = 0; axis < 3; axis += 1) {
    profile.bounds.min[axis] = Math.min(
      profile.bounds.min[axis],
      position[axis],
    );
    profile.bounds.max[axis] = Math.max(
      profile.bounds.max[axis],
      position[axis],
    );
  }
  const intensity = view.getUint16(12, true);
  profile.intensityRange[0] = Math.min(
    profile.intensityRange[0],
    intensity,
  );
  profile.intensityRange[1] = Math.max(
    profile.intensityRange[1],
    intensity,
  );
  profile.classifications.add(view.getUint8(15));
  if (header.pointFormat === 2 || header.pointFormat === 3) {
    const colorOffset = header.pointFormat === 2 ? 20 : 28;
    const color = [0, 1, 2].map((channel) =>
      view.getUint16(colorOffset + channel * 2, true));
    profile.firstColor ??= color;
    profile.lastColor = color;
    for (let channel = 0; channel < 3; channel += 1) {
      profile.colorRange.min[channel] = Math.min(
        profile.colorRange.min[channel],
        color[channel],
      );
      profile.colorRange.max[channel] = Math.max(
        profile.colorRange.max[channel],
        color[channel],
      );
    }
  }
  profile.points += 1;
}

function finalizeProfile(profile, pointRecordSha256) {
  if (
    profile.points === 0 ||
    profile.firstPosition === null ||
    profile.lastPosition === null ||
    profile.firstColor === null ||
    profile.lastColor === null
  ) {
    throw new Error("LAZ decoded point profile is incomplete");
  }
  return {
    pointRecords: profile.points,
    decodedBounds: profile.bounds,
    firstPosition: profile.firstPosition,
    lastPosition: profile.lastPosition,
    intensityRange: profile.intensityRange,
    classifications: [...profile.classifications]
      .sort((left, right) => left - right),
    colorRange: profile.colorRange,
    firstColor: profile.firstColor,
    lastColor: profile.lastColor,
    pointRecordSha256,
  };
}

function validRequest(request) {
  return (
    request?.schema === REQUEST_SCHEMA &&
    request.type === "decode" &&
    typeof request.requestId === "string" &&
    request.requestId.length > 0 &&
    request.source?.format === "laz" &&
    SOURCE_ID.test(request.source?.id ?? "") &&
    request.bytes instanceof ArrayBuffer &&
    request.bytes.byteLength > 0 &&
    request.bytes.byteLength <= MAXIMUM_SOURCE_BYTES &&
    Number.isSafeInteger(
      request.qualification?.decodePasses,
    ) &&
    request.qualification.decodePasses > 0 &&
    request.qualification.decodePasses <= 256 &&
    (
      request.qualification.stallAtPhase === null ||
      PHASES.has(request.qualification.stallAtPhase)
    )
  );
}

function decoderIdentity() {
  return {
    id: "laz-perf",
    version: "0.0.6",
    backend: "browser-wasm-worker-qualification",
    license: "Apache-2.0",
  };
}

async function checkpoint(state, phase) {
  state.phase = phase;
  const waiting = new Promise((resolve) => {
    state.resume = resolve;
    state.waitingPhase = phase;
  });
  self.postMessage({
    schema: PROGRESS_SCHEMA,
    requestId: state.requestId,
    status: "progress",
    phase,
  });
  if (state.cancelRequested) {
    state.resume();
  }
  await waiting;
  state.resume = null;
  state.waitingPhase = null;
  if (state.cancelRequested) {
    throw CANCELLED;
  }
  if (state.stallAtPhase === phase) {
    await new Promise(() => {});
  }
}

async function decodePoints(
  module,
  sourceBytes,
  header,
  decodePasses,
  cleanup,
) {
  let decoder = null;
  let filePointer = 0;
  let pointPointer = 0;
  const records = new Uint8Array(header.decodedPointBytes);
  const profile = createProfile();
  try {
    filePointer = module._malloc(sourceBytes.byteLength);
    if (!Number.isSafeInteger(filePointer) || filePointer <= 0) {
      throw new Error("LAZ input allocation failed");
    }
    module.HEAPU8.set(sourceBytes, filePointer);
    pointPointer = module._malloc(header.pointRecordLength);
    if (!Number.isSafeInteger(pointPointer) || pointPointer <= 0) {
      throw new Error("LAZ point allocation failed");
    }
    for (let pass = 0; pass < decodePasses; pass += 1) {
      decoder = new module.LASZip();
      decoder.open(filePointer, sourceBytes.byteLength);
      if (
        decoder.getCount() !== header.pointRecords ||
        decoder.getPointLength() !== header.pointRecordLength ||
        decoder.getPointFormat() !== header.pointFormat
      ) {
        throw new Error("LAZ decoder profile differs from header");
      }
      const observe = pass === decodePasses - 1;
      for (let index = 0; index < header.pointRecords; index += 1) {
        decoder.getPoint(pointPointer);
        if (observe) {
          const record = module.HEAPU8.subarray(
            pointPointer,
            pointPointer + header.pointRecordLength,
          );
          records.set(record, index * header.pointRecordLength);
          observePoint(record, header, profile);
        }
      }
      decoder.delete();
      decoder = null;
    }
    const digest = await sha256(records);
    return {
      profile: finalizeProfile(profile, digest),
      decodedPointBytes: records.byteLength,
    };
  } finally {
    records.fill(0);
    if (decoder !== null) {
      try {
        decoder.delete();
      } catch {
        cleanup.decoderReleased = false;
      }
    }
    if (pointPointer > 0) {
      try {
        module.HEAPU8.fill(
          0,
          pointPointer,
          pointPointer + header.pointRecordLength,
        );
        module._free(pointPointer);
      } catch {
        cleanup.wasmAllocationsReleased = false;
      }
    }
    if (filePointer > 0) {
      try {
        module.HEAPU8.fill(
          0,
          filePointer,
          filePointer + sourceBytes.byteLength,
        );
        module._free(filePointer);
      } catch {
        cleanup.wasmAllocationsReleased = false;
      }
    }
  }
}

async function processRequest(request, state) {
  const requestId = typeof request?.requestId === "string"
    ? request.requestId
    : "invalid";
  const started = performance.now();
  const cleanup = {
    decoderReleased: true,
    wasmAllocationsReleased: true,
    sourceBufferCleared: false,
    moduleRetainedUntilWorkerTermination: true,
  };
  let sourceBytes = null;
  let sourceDigest = null;
  let sourceId = "invalid";
  let header = null;
  let module = null;
  let failurePhase = "request-validation";
  let initializationMs = 0;
  let decodeMs = 0;
  let heapAfterInitialization = null;
  let heapAfterDecode = null;
  let report;
  try {
    if (!validRequest(request)) {
      throw new TypeError("invalid LAZ Worker request");
    }
    sourceBytes = new Uint8Array(request.bytes);
    sourceId = request.source.id;
    sourceDigest = await sha256(sourceBytes);
    failurePhase = "source-envelope";
    header = probeHeader(sourceBytes);
    await checkpoint(state, "source-admitted");

    failurePhase = "decoder-initialization";
    const initializationStarted = performance.now();
    module = await createLazPerf({
      locateFile() {
        return "/vendor/laz-perf.wasm";
      },
    });
    if (
      typeof module?._malloc !== "function" ||
      typeof module._free !== "function" ||
      typeof module.LASZip !== "function" ||
      !(module.HEAPU8 instanceof Uint8Array)
    ) {
      throw new TypeError("laz-perf module contract is invalid");
    }
    initializationMs = performance.now() - initializationStarted;
    heapAfterInitialization = module.HEAPU8.buffer.byteLength;
    await checkpoint(state, "decoder-initialized");

    failurePhase = "point-decode";
    await checkpoint(state, "decode-call-starting");
    const decodeStarted = performance.now();
    const decoded = await decodePoints(
      module,
      sourceBytes,
      header,
      request.qualification.decodePasses,
      cleanup,
    );
    decodeMs = performance.now() - decodeStarted;
    heapAfterDecode = module.HEAPU8.buffer.byteLength;
    await checkpoint(state, "decode-complete");
    report = {
      schema: RESULT_SCHEMA,
      requestId,
      status: "passed",
      decoder: decoderIdentity(),
      source: {
        id: sourceId,
        format: "laz",
        byteLength: sourceBytes.byteLength,
        sha256: sourceDigest,
      },
      header: {
        formatVersion: header.formatVersion,
        pointFormat: header.pointFormat,
        pointRecordLength: header.pointRecordLength,
        pointRecords: header.pointRecords,
      },
      profile: decoded.profile,
      performance: {
        initializationMs,
        decodeMs,
        totalMs: performance.now() - started,
      },
      resources: {
        inputBytes: sourceBytes.byteLength,
        decodedPointBytes: decoded.decodedPointBytes,
        wasmHeapCapacityBytes: {
          afterInitialization: heapAfterInitialization,
          afterDecode: heapAfterDecode,
          peakObserved: Math.max(
            heapAfterInitialization,
            heapAfterDecode,
          ),
        },
      },
      cleanup,
      diagnostics: [],
    };
  } catch (error) {
    if (
      error === CANCELLED &&
      sourceBytes instanceof Uint8Array &&
      typeof sourceDigest === "string"
    ) {
      report = {
        schema: RESULT_SCHEMA,
        requestId,
        status: "cancelled",
        phase: state.phase,
        decoder: decoderIdentity(),
        source: {
          id: sourceId,
          format: "laz",
          byteLength: sourceBytes.byteLength,
          sha256: sourceDigest,
        },
        cleanup,
        diagnostics: [],
      };
    } else if (
      sourceBytes instanceof Uint8Array &&
      typeof sourceDigest === "string"
    ) {
      report = {
        schema: RESULT_SCHEMA,
        requestId,
        status: "failed",
        decoder: decoderIdentity(),
        source: {
          id: sourceId,
          format: "laz",
          byteLength: sourceBytes.byteLength,
          sha256: sourceDigest,
        },
        failure: {
          code: "BROWSER_LAZ_INPUT_REJECTED",
          phase: failurePhase,
        },
        cleanup,
        diagnostics: [
          { code: "BROWSER_LAZ_INPUT_REJECTED" },
        ],
      };
    } else {
      report = {
        schema: RESULT_SCHEMA,
        requestId,
        status: "failed",
        failure: {
          code: "BROWSER_LAZ_REQUEST_REJECTED",
          phase: "request-validation",
        },
        cleanup,
        diagnostics: [
          { code: "BROWSER_LAZ_REQUEST_REJECTED" },
        ],
      };
    }
  } finally {
    if (sourceBytes instanceof Uint8Array) {
      sourceBytes.fill(0);
      cleanup.sourceBufferCleared = sourceBytes.every(
        (value) => value === 0,
      );
    }
  }
  self.postMessage(report);
}

self.addEventListener("message", (event) => {
  const request = event.data;
  if (active === null) {
    if (request?.type !== "decode") {
      return;
    }
    active = {
      cancelRequested: false,
      phase: null,
      requestId: typeof request.requestId === "string"
        ? request.requestId
        : "invalid",
      resume: null,
      stallAtPhase:
        request.qualification?.stallAtPhase ?? null,
      waitingPhase: null,
    };
    const state = active;
    void processRequest(request, state).finally(() => {
      if (active === state) {
        active = null;
      }
    });
    return;
  }
  if (
    request?.schema !== REQUEST_SCHEMA ||
    request.requestId !== active.requestId
  ) {
    return;
  }
  if (request.type === "cancel") {
    active.cancelRequested = true;
    active.resume?.();
    return;
  }
  if (
    request.type === "continue" &&
    request.phase === active.waitingPhase &&
    !active.cancelRequested
  ) {
    active.resume?.();
  }
});
