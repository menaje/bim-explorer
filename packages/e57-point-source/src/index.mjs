import {
  BIM_POINT_RANGE_MEDIA_TYPE,
  BIM_POINT_RANGE_MAXIMUM_BYTES,
  decodeBimPointRange,
  encodeBimPointRange,
} from "../../bim-renderer-3d/src/point-cloud.mjs";
import {
  E57_MAXIMUM_DECODED_POINT_BYTES,
  E57_MAXIMUM_POINTS,
  E57_MAXIMUM_SOURCE_BYTES,
  E57_MULTIPLE_SCAN_MAXIMUM_DECODED_POINT_BYTES,
  E57_MULTIPLE_SCAN_MAXIMUM_POINTS,
  E57_MULTIPLE_SCAN_MAXIMUM_SOURCE_BYTES,
  decodeE57MultipleScanSource,
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

function multipleScanProjection(decoded) {
  const rawBounds = {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
  for (const scan of decoded.scans) {
    for (let axis = 0; axis < 3; axis += 1) {
      rawBounds.min[axis] = Math.min(
        rawBounds.min[axis],
        scan.worldBounds.min[axis],
      );
      rawBounds.max[axis] = Math.max(
        rawBounds.max[axis],
        scan.worldBounds.max[axis],
      );
    }
  }
  const origin = rawBounds.min.map(
    (value, axis) => (value + rawBounds.max[axis]) / 2,
  );
  const positions = new Float32Array(
    decoded.header.pointRecords * 3,
  );
  const colors = new Uint8Array(
    decoded.header.pointRecords * 4,
  );
  let maximumAbsoluteError = 0;
  let pointOffset = 0;
  for (const scan of decoded.scans) {
    for (
      let index = 0;
      index < scan.header.pointRecords;
      index += 1
    ) {
      for (let axis = 0; axis < 3; axis += 1) {
        const world = scan.worldPositions[index * 3 + axis];
        const relative = Math.fround(world - origin[axis]);
        positions[(pointOffset + index) * 3 + axis] = relative;
        maximumAbsoluteError = Math.max(
          maximumAbsoluteError,
          Math.abs(origin[axis] + relative - world),
        );
      }
    }
    colors.set(scan.colors, pointOffset * 4);
    pointOffset += scan.header.pointRecords;
  }
  if (pointOffset !== decoded.header.pointRecords) {
    positions.fill(0);
    colors.fill(0);
    throw new Error("E57 multiple-scan projection is incomplete");
  }
  return Object.freeze({
    colors,
    maximumAbsoluteError,
    origin: Object.freeze([...origin]),
    positions,
    rawBounds: Object.freeze({
      min: Object.freeze([...rawBounds.min]),
      max: Object.freeze([...rawBounds.max]),
    }),
  });
}

function aggregateColorRange(scans) {
  if (scans.some((scan) => scan.rawColorRange === null)) {
    return null;
  }
  const result = {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
  for (const scan of scans) {
    for (let channel = 0; channel < 3; channel += 1) {
      result.min[channel] = Math.min(
        result.min[channel],
        scan.rawColorRange.min[channel],
      );
      result.max[channel] = Math.max(
        result.max[channel],
        scan.rawColorRange.max[channel],
      );
    }
  }
  return Object.freeze({
    min: Object.freeze(result.min),
    max: Object.freeze(result.max),
  });
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

export async function createE57MultipleScanPointSourceArtifact(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError("E57 source must be a Uint8Array");
  }
  if (
    bytes.byteLength < 48 ||
    bytes.byteLength > E57_MULTIPLE_SCAN_MAXIMUM_SOURCE_BYTES
  ) {
    throw new RangeError(
      "E57 multiple-scan source exceeds its bounded profile",
    );
  }
  const sourceDigest = await sha256(bytes);
  if (!SHA256.test(sourceDigest)) {
    throw new Error("E57 source digest is invalid");
  }
  const started = performance.now();
  const decoded = decodeE57MultipleScanSource(bytes);
  let projected = null;
  let rangeBytes = null;
  try {
    projected = multipleScanProjection(decoded);
    rangeBytes = encodeBimPointRange({
      colors: projected.colors,
      origin: projected.origin,
      positions: projected.positions,
    }, {
      maximumPayloadBytes: BIM_POINT_RANGE_MAXIMUM_BYTES,
      maximumPoints: E57_MULTIPLE_SCAN_MAXIMUM_POINTS,
    });
    const range = decodeBimPointRange(rangeBytes, {
      maximumPayloadBytes: BIM_POINT_RANGE_MAXIMUM_BYTES,
      maximumPoints: E57_MULTIPLE_SCAN_MAXIMUM_POINTS,
    });
    const rangeDigest = await sha256(rangeBytes);
    const fingerprint = `sha256:${sourceDigest}`;
    const revisionId = `source-snapshot:${fingerprint}`;
    const fields = decoded.scans[0].header.fields;
    const hasColor = ["colorRed", "colorGreen", "colorBlue"]
      .every((name) => fields.some((field) => field.name === name));
    const ignoredFields = fields
      .map((field) => field.name)
      .filter((name) => [
        "columnIndex",
        "intensity",
        "rowIndex",
      ].includes(name));
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
          ? "cartesian-xyz-rgb-multiple-scan"
          : "cartesian-xyz-multiple-scan",
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
        handleId:
          `range:e57:multiple-scan:${rangeDigest.slice(0, 24)}`,
        mediaType: BIM_POINT_RANGE_MEDIA_TYPE,
        sha256: rangeDigest,
      },
      profile: Object.freeze({
        attributeProjection: Object.freeze({
          ignoredFields: Object.freeze(ignoredFields),
          lossiness: ignoredFields.includes("intensity")
            ? "lossy"
            : "lossless-for-admitted-fields",
          method:
            "decode-for-stream-alignment-without-semantic-authority",
        }),
        colorProjection: Object.freeze({
          method: hasColor
            ? "prototype-range-to-rgba8"
            : "opaque-white-no-color",
          rawRange: aggregateColorRange(decoded.scans),
          rgba8Range: range.colorRange,
        }),
        coordinateProjection: Object.freeze({
          crsAuthority: false,
          maximumAbsoluteError:
            projected.maximumAbsoluteError,
          method:
            "scan-pose-then-float64-origin-plus-relative-float32",
          origin: projected.origin,
          poseAuthority: "local-registration-only",
          rawBounds: projected.rawBounds,
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
          explicitPoseScans: decoded.header.explicitPoseScans,
          formatVersion: decoded.header.formatVersion,
          implicitIdentityPoseScans:
            decoded.header.implicitIdentityPoseScans,
          invalidPointRecords: decoded.header.invalidPointRecords,
          pageChecksum: decoded.header.pageChecksum,
          pageSize: decoded.header.pageSize,
          pages: decoded.header.pages,
          pointRecords: decoded.header.pointRecords,
          prototype: prototypeProfile(fields),
          scanCount: decoded.header.scanCount,
          sourcePointRecords: decoded.header.sourcePointRecords,
          validPageChecksums:
            decoded.header.validPageChecksums,
          xmlLogicalLength: decoded.header.xmlLogicalLength,
          xmlPhysicalOffset:
            decoded.header.xmlPhysicalOffset,
        }),
        scans: Object.freeze(decoded.scans.map((scan) =>
          Object.freeze({
            dataPackets: scan.packetProfile.dataPackets,
            directionPointRecords:
              scan.header.directionPointRecords,
            guid: scan.header.guid,
            index: scan.header.index,
            indexPackets: scan.packetProfile.indexPackets,
            invalidPointRecords: scan.header.invalidPointRecords,
            name: scan.header.name,
            pointRecords: scan.header.pointRecords,
            pose: scan.header.pose,
            sectionLength: scan.packetProfile.sectionLength,
            sourcePointRecords: scan.header.sourcePointRecords,
            worldBounds: scan.worldBounds,
          }))),
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
    for (const scan of decoded.scans) {
      scan.worldPositions.fill(0);
      scan.colors.fill(0);
    }
    projected?.positions.fill(0);
    projected?.colors.fill(0);
  }
}

export async function createE57ProductPointSourceArtifact(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError("E57 source must be a Uint8Array");
  }
  if (bytes.byteLength > E57_MAXIMUM_SOURCE_BYTES) {
    return await createE57MultipleScanPointSourceArtifact(bytes);
  }
  try {
    return await createE57PointSourceArtifact(bytes);
  } catch (error) {
    if (
      !(error instanceof TypeError) ||
      error.message !== "E57 profile requires one point scan"
    ) {
      throw error;
    }
    return await createE57MultipleScanPointSourceArtifact(bytes);
  }
}
