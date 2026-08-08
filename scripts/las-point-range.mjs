import { createHash } from "node:crypto";

import {
  BIM_POINT_RANGE_MEDIA_TYPE,
  decodeBimPointRange,
  encodeBimPointRange,
} from "../packages/bim-renderer-3d/src/index.mjs";
import { probeLasHeader } from "./las-header-probe.mjs";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function pointPosition(view, offset, header) {
  return [0, 1, 2].map((axis) =>
    view.getInt32(offset + axis * 4, true) *
      header.scale[axis] +
      header.offset[axis]);
}

function rgba8Channel(value) {
  return Math.min(255, Math.round(value / 257));
}

export function createLasPointRange(
  lasBytes,
  { maximumPoints = 500_000 } = {},
) {
  if (
    !(lasBytes instanceof Uint8Array) ||
    !Number.isSafeInteger(maximumPoints) ||
    maximumPoints <= 0 ||
    maximumPoints > 500_000
  ) {
    throw new TypeError("LAS point range options are invalid");
  }
  const header = probeLasHeader(lasBytes);
  if (
    header.compressed ||
    ![2, 3].includes(header.pointFormat) ||
    header.pointRecords > maximumPoints
  ) {
    throw new RangeError(
      "LAS point range requires bounded uncompressed RGB records",
    );
  }
  const sourceView = new DataView(
    lasBytes.buffer,
    lasBytes.byteOffset,
    lasBytes.byteLength,
  );
  const rawBounds = {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
  for (let index = 0; index < header.pointRecords; index += 1) {
    const offset =
      header.pointDataOffset + index * header.pointRecordLength;
    const position = pointPosition(sourceView, offset, header);
    for (let axis = 0; axis < 3; axis += 1) {
      rawBounds.min[axis] = Math.min(
        rawBounds.min[axis],
        position[axis],
      );
      rawBounds.max[axis] = Math.max(
        rawBounds.max[axis],
        position[axis],
      );
    }
  }
  const origin = rawBounds.min.map(
    (value, axis) => (value + rawBounds.max[axis]) / 2,
  );
  const positions = new Float32Array(header.pointRecords * 3);
  const colors = new Uint8Array(header.pointRecords * 4);
  const rawColorRange = {
    min: [65_535, 65_535, 65_535],
    max: [0, 0, 0],
  };
  const rgba8ColorRange = {
    min: [255, 255, 255, 255],
    max: [0, 0, 0, 0],
  };
  const projectedBounds = {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
  const pointRecordHash = createHash("sha256");
  const colorOffset = header.pointFormat === 2 ? 20 : 28;
  let maximumAbsoluteProjectionError = 0;
  let rangeBytes;
  try {
    for (let index = 0; index < header.pointRecords; index += 1) {
      const offset =
        header.pointDataOffset + index * header.pointRecordLength;
      const record = lasBytes.subarray(
        offset,
        offset + header.pointRecordLength,
      );
      pointRecordHash.update(record);
      const position = pointPosition(sourceView, offset, header);
      for (let axis = 0; axis < 3; axis += 1) {
        const relative = Math.fround(position[axis] - origin[axis]);
        positions[index * 3 + axis] = relative;
        const projected = origin[axis] + relative;
        projectedBounds.min[axis] = Math.min(
          projectedBounds.min[axis],
          projected,
        );
        projectedBounds.max[axis] = Math.max(
          projectedBounds.max[axis],
          projected,
        );
        maximumAbsoluteProjectionError = Math.max(
          maximumAbsoluteProjectionError,
          Math.abs(projected - position[axis]),
        );
      }
      for (let channel = 0; channel < 3; channel += 1) {
        const raw = sourceView.getUint16(
          offset + colorOffset + channel * 2,
          true,
        );
        const projected = rgba8Channel(raw);
        colors[index * 4 + channel] = projected;
        rawColorRange.min[channel] = Math.min(
          rawColorRange.min[channel],
          raw,
        );
        rawColorRange.max[channel] = Math.max(
          rawColorRange.max[channel],
          raw,
        );
        rgba8ColorRange.min[channel] = Math.min(
          rgba8ColorRange.min[channel],
          projected,
        );
        rgba8ColorRange.max[channel] = Math.max(
          rgba8ColorRange.max[channel],
          projected,
        );
      }
      colors[index * 4 + 3] = 255;
      rgba8ColorRange.min[3] = 255;
      rgba8ColorRange.max[3] = 255;
    }
    rangeBytes = encodeBimPointRange({
      colors,
      origin,
      positions,
    });
  } finally {
    positions.fill(0);
    colors.fill(0);
  }
  const decoded = decodeBimPointRange(rangeBytes, {
    maximumPoints,
  });
  const profile = Object.freeze({
    schema: "bim-explorer-las-point-range-profile/1",
    mediaType: BIM_POINT_RANGE_MEDIA_TYPE,
    source: Object.freeze({
      formatVersion: header.formatVersion,
      pointFormat: header.pointFormat,
      pointRecordLength: header.pointRecordLength,
      pointRecords: header.pointRecords,
      pointRecordSha256: pointRecordHash.digest("hex"),
    }),
    range: Object.freeze({
      byteLength: rangeBytes.byteLength,
      payloadBytes: decoded.payloadBytes,
      pointStrideBytes: decoded.pointStrideBytes,
      sha256: sha256(rangeBytes),
    }),
    coordinateProjection: Object.freeze({
      method: "float64-origin-plus-relative-float32",
      origin: Object.freeze([...origin]),
      rawBounds: Object.freeze({
        min: Object.freeze([...rawBounds.min]),
        max: Object.freeze([...rawBounds.max]),
      }),
      projectedBounds: decoded.bounds,
      maximumAbsoluteError:
        maximumAbsoluteProjectionError,
      crsAuthority: false,
    }),
    colorProjection: Object.freeze({
      method: "round-uint16-div-257-to-rgba8",
      rawRange: Object.freeze({
        min: Object.freeze([...rawColorRange.min]),
        max: Object.freeze([...rawColorRange.max]),
      }),
      rgba8Range: Object.freeze({
        min: Object.freeze([...rgba8ColorRange.min]),
        max: Object.freeze([...rgba8ColorRange.max]),
      }),
    }),
  });
  return { bytes: rangeBytes, profile };
}
