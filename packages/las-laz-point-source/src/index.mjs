import {
  BIM_POINT_RANGE_MEDIA_TYPE,
  decodeBimPointRange,
  encodeBimPointRange,
} from "../../bim-renderer-3d/src/point-cloud.mjs";
import {
  LAS_LAZ_MAXIMUM_DECODED_POINT_BYTES,
  LAS_LAZ_MAXIMUM_POINTS,
  LAS_LAZ_MAXIMUM_SOURCE_BYTES,
  parseLasLazHeader,
} from "./header.mjs";

export {
  LAS_LAZ_MAXIMUM_DECODED_POINT_BYTES,
  LAS_LAZ_MAXIMUM_POINTS,
  LAS_LAZ_MAXIMUM_SOURCE_BYTES,
  parseLasLazHeader,
} from "./header.mjs";

export const LAS_LAZ_POINT_SOURCE_CONTRACT =
  "bim-explorer-las-laz-point-source/0.1";

const SHA256 = /^[0-9a-f]{64}$/u;

function bytesToHex(bytes) {
  return [...bytes]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256(bytes) {
  if (globalThis.crypto?.subtle === undefined) {
    throw new Error("LAS/LAZ source requires SHA-256 Web Crypto");
  }
  return bytesToHex(new Uint8Array(
    await globalThis.crypto.subtle.digest("SHA-256", bytes),
  ));
}

function moduleContract(value) {
  if (
    typeof value?._malloc !== "function" ||
    typeof value?._free !== "function" ||
    typeof value?.LASZip !== "function" ||
    !(value.HEAPU8 instanceof Uint8Array)
  ) {
    throw new TypeError("laz-perf product module contract is invalid");
  }
  return value;
}

function projection(header) {
  const positions = new Float32Array(header.pointRecords * 3);
  const colors = new Uint8Array(header.pointRecords * 4);
  let origin = null;
  const rawBounds = {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
  const rawColorRange = {
    min: [65_535, 65_535, 65_535],
    max: [0, 0, 0],
  };
  const rgba8Range = {
    min: [255, 255, 255, 255],
    max: [0, 0, 0, 0],
  };
  let maximumAbsoluteError = 0;
  let boundsObserved = 0;
  let observed = 0;
  const colorOffset = header.pointFormat === 2 ? 20 : 28;
  function recordView(record) {
    if (
      !(record instanceof Uint8Array) ||
      record.byteLength < header.pointRecordLength
    ) {
      throw new RangeError("LAS/LAZ decoded point record is invalid");
    }
    return new DataView(
      record.buffer,
      record.byteOffset,
      header.pointRecordLength,
    );
  }
  function coordinate(view, axis) {
    const world =
      view.getInt32(axis * 4, true) * header.scale[axis] +
      header.offset[axis];
    if (!Number.isFinite(world)) {
      throw new RangeError("LAS/LAZ point coordinate is non-finite");
    }
    return world;
  }
  return {
    colors,
    observeBounds(record) {
      if (boundsObserved >= header.pointRecords) {
        throw new RangeError("LAS/LAZ decoded point count is excessive");
      }
      const view = recordView(record);
      for (let axis = 0; axis < 3; axis += 1) {
        const world = coordinate(view, axis);
        rawBounds.min[axis] = Math.min(rawBounds.min[axis], world);
        rawBounds.max[axis] = Math.max(rawBounds.max[axis], world);
      }
      boundsObserved += 1;
    },
    prepare() {
      if (boundsObserved !== header.pointRecords || origin !== null) {
        throw new Error("LAS/LAZ point bounds pass is incomplete");
      }
      origin = rawBounds.min.map(
        (value, axis) => (value + rawBounds.max[axis]) / 2,
      );
    },
    positions,
    observe(record) {
      if (
        origin === null ||
        observed >= header.pointRecords
      ) {
        throw new RangeError("LAS/LAZ decoded point record is invalid");
      }
      const view = recordView(record);
      for (let axis = 0; axis < 3; axis += 1) {
        const world = coordinate(view, axis);
        const relative = Math.fround(world - origin[axis]);
        positions[observed * 3 + axis] = relative;
        const projected = origin[axis] + relative;
        maximumAbsoluteError = Math.max(
          maximumAbsoluteError,
          Math.abs(projected - world),
        );
      }
      for (let channel = 0; channel < 3; channel += 1) {
        const raw = view.getUint16(
          colorOffset + channel * 2,
          true,
        );
        const color = Math.min(255, Math.round(raw / 257));
        colors[observed * 4 + channel] = color;
        rawColorRange.min[channel] = Math.min(
          rawColorRange.min[channel],
          raw,
        );
        rawColorRange.max[channel] = Math.max(
          rawColorRange.max[channel],
          raw,
        );
        rgba8Range.min[channel] = Math.min(
          rgba8Range.min[channel],
          color,
        );
        rgba8Range.max[channel] = Math.max(
          rgba8Range.max[channel],
          color,
        );
      }
      colors[observed * 4 + 3] = 255;
      rgba8Range.min[3] = 255;
      rgba8Range.max[3] = 255;
      observed += 1;
    },
    finish() {
      if (
        boundsObserved !== header.pointRecords ||
        observed !== header.pointRecords ||
        origin === null
      ) {
        throw new Error("LAS/LAZ decoded point count is incomplete");
      }
      const tolerance = Math.max(...header.scale) * 2 + 1e-12;
      for (let axis = 0; axis < 3; axis += 1) {
        if (
          Math.abs(rawBounds.min[axis] - header.bounds.min[axis]) >
            tolerance ||
          Math.abs(rawBounds.max[axis] - header.bounds.max[axis]) >
            tolerance
        ) {
          throw new Error(
            "LAS/LAZ decoded bounds differ from the source header",
          );
        }
      }
      return {
        colors,
        origin,
        positions,
        profile: Object.freeze({
          coordinateProjection: Object.freeze({
            crsAuthority: false,
            maximumAbsoluteError,
            method: "float64-origin-plus-relative-float32",
            origin: Object.freeze([...origin]),
            rawBounds: Object.freeze({
              min: Object.freeze([...rawBounds.min]),
              max: Object.freeze([...rawBounds.max]),
            }),
          }),
          colorProjection: Object.freeze({
            method: "round-uint16-div-257-to-rgba8",
            rawRange: Object.freeze({
              min: Object.freeze([...rawColorRange.min]),
              max: Object.freeze([...rawColorRange.max]),
            }),
            rgba8Range: Object.freeze({
              min: Object.freeze([...rgba8Range.min]),
              max: Object.freeze([...rgba8Range.max]),
            }),
          }),
        }),
      };
    },
  };
}

function decodeLas(bytes, header, output) {
  for (let index = 0; index < header.pointRecords; index += 1) {
    const offset =
      header.pointDataOffset + index * header.pointRecordLength;
    output.observeBounds(bytes.subarray(
      offset,
      offset + header.pointRecordLength,
    ));
  }
  output.prepare();
  for (let index = 0; index < header.pointRecords; index += 1) {
    const offset =
      header.pointDataOffset + index * header.pointRecordLength;
    output.observe(bytes.subarray(
      offset,
      offset + header.pointRecordLength,
    ));
  }
  return Object.freeze({
    decoderReleased: true,
    wasmAllocationsReleased: true,
    wasmHeapCapacityBytes: null,
  });
}

async function decodeLaz(bytes, header, output, moduleFactory) {
  if (typeof moduleFactory !== "function") {
    throw new TypeError("LAZ product source requires a module factory");
  }
  const module = moduleContract(await moduleFactory());
  const heapAfterInitialization = module.HEAPU8.buffer.byteLength;
  let decoder = null;
  let filePointer = 0;
  let pointPointer = 0;
  let decoderReleased = false;
  let wasmAllocationsReleased = false;
  try {
    filePointer = module._malloc(bytes.byteLength);
    if (!Number.isSafeInteger(filePointer) || filePointer <= 0) {
      throw new Error("laz-perf source allocation failed");
    }
    module.HEAPU8.set(bytes, filePointer);
    pointPointer = module._malloc(header.pointRecordLength);
    if (!Number.isSafeInteger(pointPointer) || pointPointer <= 0) {
      throw new Error("laz-perf point allocation failed");
    }
    for (let pass = 0; pass < 2; pass += 1) {
      decoder = new module.LASZip();
      decoder.open(filePointer, bytes.byteLength);
      if (
        decoder.getCount() !== header.pointRecords ||
        decoder.getPointLength() !== header.pointRecordLength ||
        decoder.getPointFormat() !== header.pointFormat
      ) {
        throw new Error("LAZ decoder identity differs from its header");
      }
      for (let index = 0; index < header.pointRecords; index += 1) {
        decoder.getPoint(pointPointer);
        const record = module.HEAPU8.subarray(
          pointPointer,
          pointPointer + header.pointRecordLength,
        );
        if (pass === 0) {
          output.observeBounds(record);
        } else {
          output.observe(record);
        }
      }
      decoder.delete();
      decoder = null;
      if (pass === 0) {
        output.prepare();
      }
    }
    decoderReleased = true;
  } finally {
    if (decoder !== null) {
      decoder.delete();
      decoderReleased = true;
    }
    if (pointPointer > 0) {
      module.HEAPU8.fill(
        0,
        pointPointer,
        pointPointer + header.pointRecordLength,
      );
      module._free(pointPointer);
    }
    if (filePointer > 0) {
      module.HEAPU8.fill(
        0,
        filePointer,
        filePointer + bytes.byteLength,
      );
      module._free(filePointer);
    }
    wasmAllocationsReleased = true;
  }
  const heapAfterDecode = module.HEAPU8.buffer.byteLength;
  return Object.freeze({
    decoderReleased,
    wasmAllocationsReleased,
    wasmHeapCapacityBytes: Object.freeze({
      afterDecode: heapAfterDecode,
      afterInitialization: heapAfterInitialization,
      peakObserved: Math.max(
        heapAfterInitialization,
        heapAfterDecode,
      ),
    }),
  });
}

function decoderIdentity(format) {
  return format === "laz"
    ? Object.freeze({
        backend: "browser-wasm-worker-product-source",
        id: "laz-perf",
        license: "Apache-2.0",
        version: "0.0.6",
      })
    : Object.freeze({
        backend: "bounded-native-js-product-source",
        id: "las-point-record-reader",
        license: "MPL-2.0",
        version: "0.1.0",
      });
}

export async function createLasLazPointSourceArtifact(
  bytes,
  {
    format,
    maximumDecodedPointBytes =
      LAS_LAZ_MAXIMUM_DECODED_POINT_BYTES,
    maximumPoints = LAS_LAZ_MAXIMUM_POINTS,
    maximumSourceBytes = LAS_LAZ_MAXIMUM_SOURCE_BYTES,
    moduleFactory,
  } = {},
) {
  const header = parseLasLazHeader(bytes, {
    format,
    maximumDecodedPointBytes,
    maximumPoints,
    maximumSourceBytes,
  });
  const sourceDigest = await sha256(bytes);
  if (!SHA256.test(sourceDigest)) {
    throw new Error("LAS/LAZ source digest is invalid");
  }
  const started = performance.now();
  const output = projection(header);
  let decoded;
  let rangeBytes = null;
  try {
    decoded = format === "laz"
      ? await decodeLaz(bytes, header, output, moduleFactory)
      : decodeLas(bytes, header, output);
    const result = output.finish();
    rangeBytes = encodeBimPointRange({
      colors: result.colors,
      origin: result.origin,
      positions: result.positions,
    });
    const range = decodeBimPointRange(rangeBytes, {
      maximumPoints,
    });
    const rangeDigest = await sha256(rangeBytes);
    const fingerprint = `sha256:${sourceDigest}`;
    const revisionId = `source-snapshot:${fingerprint}`;
    return Object.freeze({
      schema: LAS_LAZ_POINT_SOURCE_CONTRACT,
      source: Object.freeze({
        adapter: Object.freeze({
          backend: format === "laz"
            ? "isolated-browser-wasm-worker"
            : "isolated-browser-worker",
          id: "@bim-explorer/las-laz-point-source",
          license: "MPL-2.0",
          version: "0.1.0",
        }),
        byteLength: bytes.byteLength,
        coordinateReferenceStatus: "unqualified",
        fingerprint,
        format,
        formatVersion: header.formatVersion,
        mediaType: "application/octet-stream",
        pointFormat: header.pointFormat,
        revisionId,
        semanticAuthority: false,
        sourceRole: "derived-or-reference-points",
        writeAuthority: false,
        roundTripAuthority: false,
      }),
      model: Object.freeze({
        bounds: range.bounds,
        colorRange: range.colorRange,
        pointStrideBytes: range.pointStrideBytes,
        points: range.pointCount,
        ranges: 1,
      }),
      range: {
        byteLength: rangeBytes.byteLength,
        bytes: rangeBytes,
        handleId:
          `range:${format}:points:${rangeDigest.slice(0, 24)}`,
        mediaType: BIM_POINT_RANGE_MEDIA_TYPE,
        sha256: rangeDigest,
      },
      profile: Object.freeze({
        colorProjection: result.profile.colorProjection,
        coordinateProjection:
          result.profile.coordinateProjection,
        decoder: decoderIdentity(format),
        header: Object.freeze({
          compressed: header.compressed,
          decodedPointBytes: header.decodedPointBytes,
          formatVersion: header.formatVersion,
          pointFormat: header.pointFormat,
          pointRecordLength: header.pointRecordLength,
          pointRecords: header.pointRecords,
          variableLengthRecordCount:
            header.variableLengthRecordCount,
        }),
      }),
      resources: Object.freeze({
        decodedPointBytes: header.decodedPointBytes,
        inputBytes: bytes.byteLength,
        pointRangeBytes: rangeBytes.byteLength,
        pointRangePayloadBytes: range.payloadBytes,
        wasmHeapCapacityBytes: decoded.wasmHeapCapacityBytes,
      }),
      cleanup: Object.freeze({
        cpuProjectionBuffersReleased: true,
        decoderReleased: decoded.decoderReleased,
        wasmAllocationsReleased:
          decoded.wasmAllocationsReleased,
      }),
      performance: Object.freeze({
        sourceProjectionMs: performance.now() - started,
      }),
    });
  } catch (error) {
    rangeBytes?.fill(0);
    throw error;
  } finally {
    output.positions.fill(0);
    output.colors.fill(0);
  }
}
