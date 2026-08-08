const LAS_SIGNATURE = "LASF";
const MINIMUM_HEADER_BYTES = 227;
const MAXIMUM_BYTES = 8 * 1024 * 1024;
const MAXIMUM_VLRS = 1_024;
const VLR_HEADER_BYTES = 54;
const MINIMUM_POINT_RECORD_BYTES = Object.freeze({
  0: 20,
  1: 28,
  2: 26,
  3: 34,
});

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
      description: ascii(bytes, offset + 22, 32),
    }));
    offset = end;
  }
  if (offset > pointDataOffset) {
    throw new RangeError("LAS VLR region overlaps point data");
  }
  return Object.freeze(records);
}

export function probeLasHeader(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError("LAS header probe input must be a Uint8Array");
  }
  if (
    bytes.byteLength < MINIMUM_HEADER_BYTES ||
    bytes.byteLength > MAXIMUM_BYTES
  ) {
    throw new RangeError("LAS header probe input exceeds its byte bound");
  }
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  );
  const signature = ascii(bytes, 0, 4);
  const versionMajor = view.getUint8(24);
  const versionMinor = view.getUint8(25);
  const formatVersion = `${versionMajor}.${versionMinor}`;
  const headerSize = view.getUint16(94, true);
  const pointDataOffset = view.getUint32(96, true);
  const variableLengthRecordCount = view.getUint32(100, true);
  const pointFormatRaw = view.getUint8(104);
  const pointFormat = pointFormatRaw & 0x3f;
  const compressionBits = pointFormatRaw & 0xc0;
  const compressed = compressionBits !== 0;
  const pointRecordLength = view.getUint16(105, true);
  const pointRecords = view.getUint32(107, true);
  if (
    signature !== LAS_SIGNATURE ||
    versionMajor !== 1 ||
    versionMinor > 3 ||
    headerSize < MINIMUM_HEADER_BYTES ||
    headerSize > bytes.byteLength ||
    pointDataOffset < headerSize ||
    pointDataOffset > bytes.byteLength ||
    variableLengthRecordCount > MAXIMUM_VLRS ||
    compressionBits === 0xc0 ||
    MINIMUM_POINT_RECORD_BYTES[pointFormat] === undefined ||
    pointRecordLength < MINIMUM_POINT_RECORD_BYTES[pointFormat] ||
    pointRecords === 0 ||
    pointRecords > 2_000_000
  ) {
    throw new Error("LAS header identity or bounded profile is invalid");
  }
  if (
    !compressed &&
    pointDataOffset + pointRecordLength * pointRecords >
      bytes.byteLength
  ) {
    throw new RangeError("LAS point records are truncated");
  }
  const scale = finiteVector(
    view,
    [131, 139, 147],
    "LAS coordinate scale",
  );
  const coordinateOffset = finiteVector(
    view,
    [155, 163, 171],
    "LAS coordinate offset",
  );
  const bounds = Object.freeze({
    min: Object.freeze(finiteVector(
      view,
      [187, 203, 219],
      "LAS minimum bounds",
    )),
    max: Object.freeze(finiteVector(
      view,
      [179, 195, 211],
      "LAS maximum bounds",
    )),
  });
  if (
    scale.some((value) => value <= 0) ||
    bounds.min.some((value, axis) => value > bounds.max[axis])
  ) {
    throw new RangeError("LAS coordinate profile is invalid");
  }
  const variableLengthRecords = parseVariableLengthRecords(
    bytes,
    view,
    headerSize,
    pointDataOffset,
    variableLengthRecordCount,
  );
  if (
    compressed &&
    !variableLengthRecords.some((record) =>
      record.userId === "laszip encoded" &&
      record.recordId === 22_204)
  ) {
    throw new Error("LAZ compression VLR is missing");
  }
  return Object.freeze({
    signature,
    formatVersion,
    headerSize,
    pointDataOffset,
    variableLengthRecordCount,
    pointFormatRaw,
    pointFormat,
    compressed,
    pointRecordLength,
    pointRecords,
    scale: Object.freeze(scale),
    offset: Object.freeze(coordinateOffset),
    bounds,
    variableLengthRecords,
  });
}
