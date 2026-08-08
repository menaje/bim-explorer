export const LAS_LAZ_MAXIMUM_SOURCE_BYTES = 8 * 1024 * 1024;
export const LAS_LAZ_MAXIMUM_POINTS = 500_000;
export const LAS_LAZ_MAXIMUM_DECODED_POINT_BYTES =
  24 * 1024 * 1024;

const LAS_SIGNATURE = "LASF";
const MINIMUM_HEADER_BYTES = 227;
const MAXIMUM_VLRS = 1_024;
const VLR_HEADER_BYTES = 54;
const MINIMUM_POINT_RECORD_BYTES = Object.freeze({
  2: 26,
  3: 34,
});

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
}

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
  return Object.freeze(values);
}

function variableLengthRecords(
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
      throw new RangeError(`LAS VLR ${index} header is truncated`);
    }
    const recordLength = view.getUint16(offset + 20, true);
    const end = offset + VLR_HEADER_BYTES + recordLength;
    if (end > pointDataOffset) {
      throw new RangeError(`LAS VLR ${index} payload is truncated`);
    }
    records.push(Object.freeze({
      userId: ascii(bytes, offset + 2, 16),
      recordId: view.getUint16(offset + 18, true),
      recordLength,
    }));
    offset = end;
  }
  return Object.freeze(records);
}

export function parseLasLazHeader(bytes, {
  format,
  maximumDecodedPointBytes =
    LAS_LAZ_MAXIMUM_DECODED_POINT_BYTES,
  maximumPoints = LAS_LAZ_MAXIMUM_POINTS,
  maximumSourceBytes = LAS_LAZ_MAXIMUM_SOURCE_BYTES,
} = {}) {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError("LAS/LAZ source must be a Uint8Array");
  }
  positiveInteger(maximumDecodedPointBytes, "maximumDecodedPointBytes");
  positiveInteger(maximumPoints, "maximumPoints");
  positiveInteger(maximumSourceBytes, "maximumSourceBytes");
  if (!new Set(["las", "laz"]).has(format)) {
    throw new TypeError("LAS/LAZ declared format is unsupported");
  }
  if (
    bytes.byteLength < MINIMUM_HEADER_BYTES ||
    bytes.byteLength > maximumSourceBytes
  ) {
    throw new RangeError("LAS/LAZ source exceeds its byte bound");
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
  const compressed = compressionBits === 0x80;
  const pointRecordLength = view.getUint16(105, true);
  const pointRecords = view.getUint32(107, true);
  const decodedPointBytes = pointRecords * pointRecordLength;
  if (
    signature !== LAS_SIGNATURE ||
    versionMajor !== 1 ||
    versionMinor > 3 ||
    headerSize < MINIMUM_HEADER_BYTES ||
    headerSize > bytes.byteLength ||
    pointDataOffset < headerSize ||
    pointDataOffset > bytes.byteLength ||
    variableLengthRecordCount > MAXIMUM_VLRS ||
    ![0, 0x80].includes(compressionBits) ||
    MINIMUM_POINT_RECORD_BYTES[pointFormat] === undefined ||
    pointRecordLength < MINIMUM_POINT_RECORD_BYTES[pointFormat] ||
    pointRecords === 0 ||
    pointRecords > maximumPoints ||
    !Number.isSafeInteger(decodedPointBytes) ||
    decodedPointBytes > maximumDecodedPointBytes ||
    (format === "laz") !== compressed
  ) {
    throw new Error("LAS/LAZ header identity or product profile is invalid");
  }
  if (
    !compressed &&
    pointDataOffset + decodedPointBytes > bytes.byteLength
  ) {
    throw new RangeError("LAS point records are truncated");
  }
  const scale = finiteVector(
    view,
    [131, 139, 147],
    "LAS/LAZ coordinate scale",
  );
  const offset = finiteVector(
    view,
    [155, 163, 171],
    "LAS/LAZ coordinate offset",
  );
  const bounds = Object.freeze({
    min: finiteVector(
      view,
      [187, 203, 219],
      "LAS/LAZ minimum bounds",
    ),
    max: finiteVector(
      view,
      [179, 195, 211],
      "LAS/LAZ maximum bounds",
    ),
  });
  if (
    scale.some((value) => value <= 0) ||
    bounds.min.some((value, axis) => value > bounds.max[axis])
  ) {
    throw new RangeError("LAS/LAZ coordinate profile is invalid");
  }
  const records = variableLengthRecords(
    bytes,
    view,
    headerSize,
    pointDataOffset,
    variableLengthRecordCount,
  );
  if (
    compressed &&
    !records.some((record) =>
      record.userId === "laszip encoded" &&
      record.recordId === 22_204)
  ) {
    throw new Error("LAZ compression VLR is missing");
  }
  return Object.freeze({
    bounds,
    compressed,
    decodedPointBytes,
    format,
    formatVersion: `${versionMajor}.${versionMinor}`,
    headerSize,
    offset,
    pointDataOffset,
    pointFormat,
    pointFormatRaw,
    pointRecordLength,
    pointRecords,
    scale,
    signature,
    variableLengthRecordCount,
    variableLengthRecords: records,
  });
}
