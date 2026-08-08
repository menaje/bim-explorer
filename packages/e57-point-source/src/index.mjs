import {
  BIM_POINT_RANGE_MEDIA_TYPE,
  decodeBimPointRange,
  encodeBimPointRange,
} from "../../bim-renderer-3d/src/point-cloud.mjs";
import {
  E57_MAXIMUM_DECODED_POINT_BYTES,
  E57_MAXIMUM_POINTS,
  E57_MAXIMUM_SOURCE_BYTES,
  decodeE57PointSource,
} from "./format.mjs";

export {
  E57_MAXIMUM_DECODED_POINT_BYTES,
  E57_MAXIMUM_POINTS,
  E57_MAXIMUM_SOURCE_BYTES,
  E57_MULTIPLE_SCAN_MAXIMUM_DECODED_POINT_BYTES,
  E57_MULTIPLE_SCAN_MAXIMUM_POINTS,
  E57_MULTIPLE_SCAN_MAXIMUM_POINTS_PER_SCAN,
  E57_MULTIPLE_SCAN_MAXIMUM_SCANS,
  E57_MULTIPLE_SCAN_MAXIMUM_SOURCE_BYTES,
  decodeE57MultipleScanSource,
  decodeE57PointSource,
} from "./format.mjs";

export const E57_POINT_SOURCE_CONTRACT =
  "bim-explorer-e57-point-source/0.1";

const SHA256 = /^[0-9a-f]{64}$/u;

function bytesToHex(bytes) {
  return [...bytes]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256(bytes) {
  if (globalThis.crypto?.subtle === undefined) {
    throw new Error("E57 source requires SHA-256 Web Crypto");
  }
  return bytesToHex(new Uint8Array(
    await globalThis.crypto.subtle.digest("SHA-256", bytes),
  ));
}

function projection(decoded) {
  const positions = new Float32Array(
    decoded.header.pointRecords * 3,
  );
  const origin = decoded.rawBounds.min.map(
    (value, axis) =>
      (value + decoded.rawBounds.max[axis]) / 2,
  );
  let maximumAbsoluteError = 0;
  for (let index = 0; index < decoded.header.pointRecords; index += 1) {
    for (let axis = 0; axis < 3; axis += 1) {
      const world = decoded.rawPositions[index * 3 + axis];
      const relative = Math.fround(world - origin[axis]);
      positions[index * 3 + axis] = relative;
      maximumAbsoluteError = Math.max(
        maximumAbsoluteError,
        Math.abs(origin[axis] + relative - world),
      );
    }
  }
  return Object.freeze({
    maximumAbsoluteError,
    origin: Object.freeze([...origin]),
    positions,
  });
}

function prototypeProfile(fields) {
  return Object.freeze(fields.map((field) => Object.freeze({
    bitSize: field.bitSize,
    kind: field.kind,
    maximum: field.maximum,
    minimum: field.minimum,
    name: field.name,
    offset: field.offset,
    scale: field.scale,
  })));
}

export async function createE57PointSourceArtifact(
  bytes,
  {
    maximumDecodedPointBytes =
      E57_MAXIMUM_DECODED_POINT_BYTES,
    maximumPoints = E57_MAXIMUM_POINTS,
    maximumSourceBytes = E57_MAXIMUM_SOURCE_BYTES,
  } = {},
) {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError("E57 source must be a Uint8Array");
  }
  if (
    !Number.isSafeInteger(maximumSourceBytes) ||
    maximumSourceBytes <= 0 ||
    maximumSourceBytes > E57_MAXIMUM_SOURCE_BYTES ||
    bytes.byteLength < 48 ||
    bytes.byteLength > maximumSourceBytes
  ) {
    throw new RangeError("E57 source exceeds its bounded profile");
  }
  const sourceDigest = await sha256(bytes);
  if (!SHA256.test(sourceDigest)) {
    throw new Error("E57 source digest is invalid");
  }
  const started = performance.now();
  const decoded = decodeE57PointSource(bytes, {
    maximumDecodedPointBytes,
    maximumPoints,
    maximumSourceBytes,
  });
  let projected = null;
  let rangeBytes = null;
  try {
    projected = projection(decoded);
    rangeBytes = encodeBimPointRange({
      colors: decoded.colors,
      origin: projected.origin,
      positions: projected.positions,
    });
    const range = decodeBimPointRange(rangeBytes, {
      maximumPoints,
    });
    const rangeDigest = await sha256(rangeBytes);
    const fingerprint = `sha256:${sourceDigest}`;
    const revisionId = `source-snapshot:${fingerprint}`;
    const hasColor = ["colorRed", "colorGreen", "colorBlue"]
      .every((name) =>
        decoded.header.fields.some((field) => field.name === name));
    const coordinateFormat =
      decoded.header.coordinateRepresentation === "spherical"
        ? "spherical-rae"
        : "cartesian-xyz";
    return Object.freeze({
      schema: E57_POINT_SOURCE_CONTRACT,
      source: Object.freeze({
        adapter: Object.freeze({
          backend: "isolated-browser-worker",
          id: "@bim-explorer/e57-point-source",
          license: "MPL-2.0",
          version: "0.1.0",
        }),
        byteLength: bytes.byteLength,
        coordinateReferenceStatus: "unqualified",
        fingerprint,
        format: "e57",
        formatVersion: decoded.header.formatVersion,
        mediaType: "application/octet-stream",
        pointFormat: hasColor
          ? `${coordinateFormat}-rgb`
          : coordinateFormat,
        revisionId,
        roundTripAuthority: false,
        semanticAuthority: false,
        sourceRole: "derived-or-reference-points",
        writeAuthority: false,
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
        handleId: `range:e57:points:${rangeDigest.slice(0, 24)}`,
        mediaType: BIM_POINT_RANGE_MEDIA_TYPE,
        sha256: rangeDigest,
      },
      profile: Object.freeze({
        attributeProjection: Object.freeze({
          ignoredFields: Object.freeze(
            decoded.header.fields
              .map((field) => field.name)
              .filter((name) => [
                "columnIndex",
                "intensity",
                "rowIndex",
              ].includes(name)),
          ),
          lossiness: decoded.header.fields.some(
            (field) => field.name === "intensity",
          )
            ? "lossy"
            : "lossless-for-admitted-fields",
          method: "decode-for-stream-alignment-without-semantic-authority",
        }),
        colorProjection: Object.freeze({
          method: hasColor
            ? "prototype-range-to-rgba8"
            : "opaque-white-no-color",
          rawRange: decoded.rawColorRange,
          rgba8Range: range.colorRange,
        }),
        coordinateProjection: Object.freeze({
          crsAuthority: false,
          maximumAbsoluteError:
            projected.maximumAbsoluteError,
          method: "float64-origin-plus-relative-float32",
          origin: projected.origin,
          rawBounds: decoded.rawBounds,
          sourceRepresentation:
            decoded.header.coordinateRepresentation,
        }),
        decoder: Object.freeze({
          backend: "bounded-native-js-product-source",
          id: "bim-explorer-e57-bitpack-reader",
          license: "MPL-2.0",
          reference: Object.freeze({
            commit:
              "7a7498f679b30588dc9298beb7aafab2245a2d0c",
            id: "cry-inc/e57",
            license: "MIT",
            version: "0.10.5",
          }),
          version: "0.1.0",
        }),
        header: Object.freeze({
          coordinateRepresentation:
            decoded.header.coordinateRepresentation,
          decodedPointBytes: decoded.header.decodedPointBytes,
          directionPointRecords:
            decoded.header.directionPointRecords,
          formatVersion: decoded.header.formatVersion,
          invalidPointRecords: decoded.header.invalidPointRecords,
          pageChecksum: decoded.header.pageChecksum,
          pageSize: decoded.header.pageSize,
          pages: decoded.header.pages,
          pointRecords: decoded.header.pointRecords,
          prototype: prototypeProfile(decoded.header.fields),
          sourcePointRecords: decoded.header.sourcePointRecords,
          validPageChecksums:
            decoded.header.validPageChecksums,
          xmlLogicalLength: decoded.header.xmlLogicalLength,
          xmlPhysicalOffset:
            decoded.header.xmlPhysicalOffset,
        }),
        packets: decoded.packetProfile,
      }),
      resources: Object.freeze({
        decodedPointBytes: decoded.header.decodedPointBytes,
        inputBytes: bytes.byteLength,
        pointRangeBytes: rangeBytes.byteLength,
        pointRangePayloadBytes: range.payloadBytes,
        wasmHeapCapacityBytes: null,
      }),
      cleanup: Object.freeze({
        cpuProjectionBuffersReleased: true,
        decoderReleased: true,
        wasmAllocationsReleased: true,
      }),
      performance: Object.freeze({
        sourceProjectionMs: performance.now() - started,
      }),
    });
  } catch (error) {
    rangeBytes?.fill(0);
    throw error;
  } finally {
    decoded.rawPositions.fill(0);
    decoded.colors.fill(0);
    projected?.positions.fill(0);
  }
}
