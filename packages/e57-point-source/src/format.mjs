// Packet and BitPack behavior was implemented with cry-inc/e57@0.10.5 as an
// MIT-licensed audit reference. See LICENSES/e57-rs-MIT.txt and notices.

export const E57_MAXIMUM_SOURCE_BYTES = 8 * 1024 * 1024;
export const E57_MAXIMUM_POINTS = 500_000;
export const E57_MAXIMUM_DECODED_POINT_BYTES = 16 * 1024 * 1024;

const SIGNATURE = "ASTM-E57";
const HEADER_BYTES = 48;
const CHECKSUM_BYTES = 4;
const MINIMUM_PAGE_BYTES = 1024;
const MAXIMUM_PAGE_BYTES = 1024 * 1024;
const MAXIMUM_XML_BYTES = 1024 * 1024;
const SECTION_HEADER_BYTES = 32;
const DATA_PACKET_HEADER_BYTES = 6;
const INDEX_PACKET_HEADER_BYTES = 16;
const MAXIMUM_PROTOTYPE_FIELDS = 7;
const COORDINATES = Object.freeze([
  "cartesianX",
  "cartesianY",
  "cartesianZ",
]);
const COLORS = Object.freeze([
  "colorRed",
  "colorGreen",
  "colorBlue",
]);
const CARTESIAN_INVALID_STATE = "cartesianInvalidState";
const FIELDS = new Set([
  ...COORDINATES,
  ...COLORS,
  CARTESIAN_INVALID_STATE,
]);
const CRC32C_POLYNOMIAL = 0x82f63b78;

const CRC32C_TABLE = Uint32Array.from(
  { length: 256 },
  (_, value) => {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^
        ((crc & 1) === 1 ? CRC32C_POLYNOMIAL : 0);
    }
    return crc >>> 0;
  },
);

function positiveLimit(value, fallback, label) {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return result;
}

function safeUnsigned64(view, offset, label) {
  const value = view.getBigUint64(offset, true);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`${label} exceeds the safe integer range`);
  }
  return Number(value);
}

function crc32c(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC32C_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function logicalFile(bytes, pageSize) {
  const pagePayloadBytes = pageSize - CHECKSUM_BYTES;
  const pages = bytes.byteLength / pageSize;
  const logical = new Uint8Array(pages * pagePayloadBytes);
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  );
  for (let page = 0; page < pages; page += 1) {
    const physicalOffset = page * pageSize;
    const expected = view.getUint32(
      physicalOffset + pagePayloadBytes,
      false,
    );
    const payload = bytes.subarray(
      physicalOffset,
      physicalOffset + pagePayloadBytes,
    );
    if (crc32c(payload) !== expected) {
      logical.fill(0);
      throw new Error(`E57 page ${page} CRC-32C is invalid`);
    }
    logical.set(payload, page * pagePayloadBytes);
  }
  return Object.freeze({ logical, pages });
}

function physicalToLogical(offset, physicalLength, pageSize, label) {
  const pageOffset = offset % pageSize;
  if (
    !Number.isSafeInteger(offset) ||
    offset < HEADER_BYTES ||
    offset >= physicalLength ||
    pageOffset >= pageSize - CHECKSUM_BYTES
  ) {
    throw new RangeError(`${label} is not a physical data offset`);
  }
  return offset - Math.floor(offset / pageSize) * CHECKSUM_BYTES;
}

function parseAttributes(text, label) {
  const values = new Map();
  const pattern = /([A-Za-z_][A-Za-z0-9_.:-]*)="([^"]*)"/gu;
  let consumed = 0;
  for (const match of text.matchAll(pattern)) {
    if (text.slice(consumed, match.index).trim().length > 0) {
      throw new TypeError(`${label} attributes are invalid`);
    }
    if (values.has(match[1]) || /[<>&]/u.test(match[2])) {
      throw new TypeError(`${label} attributes are invalid`);
    }
    values.set(match[1], match[2]);
    consumed = match.index + match[0].length;
  }
  if (text.slice(consumed).trim().length > 0) {
    throw new TypeError(`${label} attributes are invalid`);
  }
  return values;
}

function requiredAttribute(values, name, label) {
  const value = values.get(name);
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} ${name} is missing`);
  }
  return value;
}

function finiteAttribute(values, name, label, required = false) {
  const text = values.get(name);
  if (text === undefined && !required) {
    return null;
  }
  const value = Number(text);
  if (text === undefined || !Number.isFinite(value)) {
    throw new TypeError(`${label} ${name} is invalid`);
  }
  return value;
}

function integerAttribute(values, name, label) {
  const text = requiredAttribute(values, name, label);
  if (!/^-?(?:0|[1-9][0-9]*)$/u.test(text)) {
    throw new TypeError(`${label} ${name} is invalid`);
  }
  const value = Number(text);
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} ${name} exceeds the safe range`);
  }
  return value;
}

function fieldType(name, values) {
  const label = `E57 ${name}`;
  const type = requiredAttribute(values, "type", label);
  if (type === "Float") {
    const precision = values.get("precision") ?? "double";
    if (!["single", "double"].includes(precision)) {
      throw new TypeError(`${label} precision is unsupported`);
    }
    const minimum = finiteAttribute(values, "minimum", label);
    const maximum = finiteAttribute(values, "maximum", label);
    if (
      (minimum === null) !== (maximum === null) ||
      (minimum !== null && minimum > maximum)
    ) {
      throw new RangeError(`${label} bounds are invalid`);
    }
    return Object.freeze({
      bitSize: precision === "single" ? 32 : 64,
      kind: precision,
      maximum,
      minimum,
      offset: 0,
      scale: 1,
    });
  }
  if (!["Integer", "ScaledInteger"].includes(type)) {
    throw new TypeError(`${label} type is unsupported`);
  }
  const minimum = integerAttribute(values, "minimum", label);
  const maximum = integerAttribute(values, "maximum", label);
  if (minimum > maximum) {
    throw new RangeError(`${label} bounds are invalid`);
  }
  const range = BigInt(maximum) - BigInt(minimum);
  const bitSize = range === 0n ? 0 : range.toString(2).length;
  if (bitSize > 53) {
    throw new RangeError(`${label} integer range is too wide`);
  }
  const scale = type === "ScaledInteger"
    ? finiteAttribute(values, "scale", label) ?? 1
    : 1;
  const offset = type === "ScaledInteger"
    ? finiteAttribute(values, "offset", label) ?? 0
    : 0;
  if (scale === 0) {
    throw new RangeError(`${label} scale is invalid`);
  }
  return Object.freeze({
    bitSize,
    kind: type === "Integer" ? "integer" : "scaled-integer",
    maximum,
    minimum,
    offset,
    scale,
  });
}

function prototypeFields(body) {
  const pattern = /<([A-Za-z_][A-Za-z0-9_]*)\b([^>]*)\/>/gu;
  const fields = [];
  const names = new Set();
  let consumed = 0;
  for (const match of body.matchAll(pattern)) {
    if (body.slice(consumed, match.index).trim().length > 0) {
      throw new TypeError("E57 prototype structure is unsupported");
    }
    const name = match[1];
    if (!FIELDS.has(name) || names.has(name)) {
      throw new TypeError(`E57 prototype field ${name} is unsupported`);
    }
    const dataType = fieldType(
      name,
      parseAttributes(match[2], `E57 ${name}`),
    );
    fields.push(Object.freeze({
      ...dataType,
      name,
    }));
    names.add(name);
    consumed = match.index + match[0].length;
  }
  if (
    body.slice(consumed).trim().length > 0 ||
    fields.length < 3 ||
    fields.length > MAXIMUM_PROTOTYPE_FIELDS ||
    COORDINATES.some((name) => !names.has(name))
  ) {
    throw new TypeError("E57 Cartesian prototype is incomplete");
  }
  const colorFields = COLORS.filter((name) => names.has(name));
  if (![0, 3].includes(colorFields.length)) {
    throw new TypeError("E57 RGB prototype is incomplete");
  }
  for (const field of fields) {
    if (
      COLORS.includes(field.name) &&
      (
        field.minimum === null ||
        field.maximum === null ||
        field.minimum >= field.maximum
      )
    ) {
      throw new RangeError(`E57 ${field.name} bounds are invalid`);
    }
  }
  const invalidState = fields.find(
    (field) => field.name === CARTESIAN_INVALID_STATE,
  );
  if (
    invalidState !== undefined &&
    (
      invalidState.kind !== "integer" ||
      invalidState.minimum !== 0 ||
      ![1, 2].includes(invalidState.maximum) ||
      invalidState.scale !== 1 ||
      invalidState.offset !== 0
    )
  ) {
    throw new TypeError(
      "E57 cartesianInvalidState profile is unsupported",
    );
  }
  return Object.freeze(fields);
}

function decodedPointBytes(fields, recordCount) {
  const names = new Set(fields.map((field) => field.name));
  const hasColor = COLORS.every((name) => names.has(name));
  const hasInvalidState = names.has(CARTESIAN_INVALID_STATE);
  const bytesPerRecord = 28 +
    (hasInvalidState ? 1 : 0) +
    (hasColor && hasInvalidState ? 24 : 0);
  return recordCount * bytesPerRecord;
}

function parseXml(xml, limits) {
  if (
    !xml.startsWith("<?xml version=\"1.0\" encoding=\"UTF-8\"?>") ||
    !xml.includes(
      "xmlns=\"http://www.astm.org/COMMIT/E57/2010-e57-v1.0\"",
    ) ||
    /<!DOCTYPE|<!ENTITY|<\?|\u0000/iu.test(xml.slice(5))
  ) {
    throw new Error("E57 XML metadata envelope is invalid");
  }
  if ((xml.match(/<data3D\b/gu) ?? []).length !== 1) {
    throw new TypeError("E57 profile requires one data3D vector");
  }
  const points = [...xml.matchAll(
    /<points\b([^>]*)>([\s\S]*?)<\/points>/gu,
  )];
  if (points.length !== 1) {
    throw new TypeError("E57 profile requires one point scan");
  }
  const pointAttributes = parseAttributes(
    points[0][1],
    "E57 points",
  );
  if (
    requiredAttribute(pointAttributes, "type", "E57 points") !==
      "CompressedVector"
  ) {
    throw new TypeError("E57 points vector is unsupported");
  }
  const fileOffset = integerAttribute(
    pointAttributes,
    "fileOffset",
    "E57 points",
  );
  const recordCount = integerAttribute(
    pointAttributes,
    "recordCount",
    "E57 points",
  );
  if (
    recordCount <= 0 ||
    recordCount > limits.maximumPoints
  ) {
    throw new RangeError("E57 point count exceeds its bounded profile");
  }
  const prototypes = [...points[0][2].matchAll(
    /<prototype\b([^>]*)>([\s\S]*?)<\/prototype>/gu,
  )];
  const codecs = [...points[0][2].matchAll(
    /<codecs\b([^>]*)>([\s\S]*?)<\/codecs>/gu,
  )];
  if (
    prototypes.length !== 1 ||
    codecs.length !== 1 ||
    codecs[0][2].trim().length > 0
  ) {
    throw new TypeError("E57 point codec profile is unsupported");
  }
  const pointBodyWithoutProfile = points[0][2]
    .replace(prototypes[0][0], "")
    .replace(codecs[0][0], "");
  if (pointBodyWithoutProfile.trim().length > 0) {
    throw new TypeError("E57 points structure is unsupported");
  }
  const prototypeAttributes = parseAttributes(
    prototypes[0][1],
    "E57 prototype",
  );
  const codecAttributes = parseAttributes(
    codecs[0][1],
    "E57 codecs",
  );
  if (
    requiredAttribute(
      prototypeAttributes,
      "type",
      "E57 prototype",
    ) !== "Structure" ||
    requiredAttribute(codecAttributes, "type", "E57 codecs") !==
      "Vector"
  ) {
    throw new TypeError("E57 point metadata profile is unsupported");
  }
  const fields = prototypeFields(prototypes[0][2]);
  const decodedBytes = decodedPointBytes(fields, recordCount);
  if (decodedBytes > limits.maximumDecodedPointBytes) {
    throw new RangeError("E57 point count exceeds its bounded profile");
  }
  return Object.freeze({
    decodedPointBytes: decodedBytes,
    fields,
    fileOffset,
    recordCount,
  });
}

class Cursor {
  #bytes;
  #end;
  offset;

  constructor(bytes, offset, end = bytes.byteLength) {
    if (
      !(bytes instanceof Uint8Array) ||
      !Number.isSafeInteger(offset) ||
      !Number.isSafeInteger(end) ||
      offset < 0 ||
      end < offset ||
      end > bytes.byteLength
    ) {
      throw new RangeError("E57 logical cursor range is invalid");
    }
    this.#bytes = bytes;
    this.#end = end;
    this.offset = offset;
  }

  read(length, label) {
    if (
      !Number.isSafeInteger(length) ||
      length < 0 ||
      this.offset + length > this.#end
    ) {
      throw new RangeError(`${label} is truncated`);
    }
    const value = this.#bytes.subarray(
      this.offset,
      this.offset + length,
    );
    this.offset += length;
    return value;
  }

  skip(length, label) {
    this.read(length, label);
  }
}

class BitStream {
  #bitOffset = 0;
  #bytes = new Uint8Array(0);

  get availableBits() {
    return this.#bytes.byteLength * 8 - this.#bitOffset;
  }

  append(value) {
    const consumedBytes = Math.floor(this.#bitOffset / 8);
    const remainder = this.#bytes.subarray(consumedBytes);
    const next = new Uint8Array(
      remainder.byteLength + value.byteLength,
    );
    next.set(remainder);
    next.set(value, remainder.byteLength);
    this.#bytes.fill(0);
    this.#bytes = next;
    this.#bitOffset -= consumedBytes * 8;
  }

  extract(bits) {
    if (
      !Number.isSafeInteger(bits) ||
      bits < 0 ||
      bits > 64 ||
      this.availableBits < bits
    ) {
      return null;
    }
    if (bits === 0) {
      return 0n;
    }
    const startByte = Math.floor(this.#bitOffset / 8);
    const endByte = Math.ceil((this.#bitOffset + bits) / 8);
    let value = 0n;
    for (let index = startByte; index < endByte; index += 1) {
      value |= BigInt(this.#bytes[index]) <<
        BigInt((index - startByte) * 8);
    }
    value >>= BigInt(this.#bitOffset % 8);
    value &= (1n << BigInt(bits)) - 1n;
    this.#bitOffset += bits;
    return value;
  }

  clear() {
    this.#bytes.fill(0);
    this.#bytes = new Uint8Array(0);
    this.#bitOffset = 0;
  }
}

function numberView(raw, bits) {
  const bytes = new Uint8Array(bits / 8);
  const view = new DataView(bytes.buffer);
  if (bits === 32) {
    view.setUint32(0, Number(raw), true);
    return view.getFloat32(0, true);
  }
  view.setBigUint64(0, raw, true);
  return view.getFloat64(0, true);
}

function recordValue(stream, field) {
  if (field.bitSize === 0) {
    return field.minimum * field.scale + field.offset;
  }
  const raw = stream.extract(field.bitSize);
  if (raw === null) {
    throw new Error(`E57 ${field.name} bit stream is incomplete`);
  }
  if (["single", "double"].includes(field.kind)) {
    const value = numberView(raw, field.bitSize);
    if (!Number.isFinite(value)) {
      throw new RangeError(`E57 ${field.name} is non-finite`);
    }
    return value;
  }
  const integer = Number(raw) + field.minimum;
  if (!Number.isSafeInteger(integer) || integer > field.maximum) {
    throw new RangeError(`E57 ${field.name} integer is invalid`);
  }
  const value = integer * field.scale + field.offset;
  if (!Number.isFinite(value)) {
    throw new RangeError(`E57 ${field.name} is non-finite`);
  }
  return value;
}

function fieldBounds(field) {
  if (field.minimum === null || field.maximum === null) {
    return null;
  }
  const values = [
    field.minimum * field.scale + field.offset,
    field.maximum * field.scale + field.offset,
  ];
  return Object.freeze({
    min: Math.min(...values),
    max: Math.max(...values),
  });
}

function colorByte(value, bounds, label) {
  if (bounds === null || !Number.isFinite(value)) {
    throw new RangeError(`${label} cannot be projected`);
  }
  const unit = (value - bounds.min) / (bounds.max - bounds.min);
  if (!Number.isFinite(unit) || unit < -1e-9 || unit > 1 + 1e-9) {
    throw new RangeError(`${label} is outside its prototype bounds`);
  }
  return Math.min(255, Math.max(0, Math.round(unit * 255)));
}

function decodePackets(logical, header, pointProfile) {
  const sectionStart = physicalToLogical(
    pointProfile.fileOffset,
    header.physicalLength,
    header.pageSize,
    "E57 compressed-vector offset",
  );
  const sectionHeader = new Cursor(
    logical,
    sectionStart,
    sectionStart + SECTION_HEADER_BYTES,
  ).read(SECTION_HEADER_BYTES, "E57 compressed-vector header");
  const sectionView = new DataView(
    sectionHeader.buffer,
    sectionHeader.byteOffset,
    sectionHeader.byteLength,
  );
  const sectionLength = safeUnsigned64(
    sectionView,
    8,
    "E57 compressed-vector length",
  );
  const dataPhysicalOffset = safeUnsigned64(
    sectionView,
    16,
    "E57 compressed-vector data offset",
  );
  const indexPhysicalOffset = safeUnsigned64(
    sectionView,
    24,
    "E57 compressed-vector index offset",
  );
  if (
    sectionHeader[0] !== 1 ||
    sectionHeader.subarray(1, 8).some((value) => value !== 0) ||
    sectionLength < SECTION_HEADER_BYTES ||
    sectionLength % 4 !== 0
  ) {
    throw new Error("E57 compressed-vector header is invalid");
  }
  const dataOffset = physicalToLogical(
    dataPhysicalOffset,
    header.physicalLength,
    header.pageSize,
    "E57 compressed-vector data offset",
  );
  const sectionEnd = sectionStart + sectionLength;
  const indexOffset = indexPhysicalOffset === 0
    ? null
    : physicalToLogical(
        indexPhysicalOffset,
        header.physicalLength,
        header.pageSize,
        "E57 compressed-vector index offset",
      );
  const dataEnd = indexOffset ?? sectionEnd;
  if (
    dataOffset !== sectionStart + SECTION_HEADER_BYTES ||
    dataEnd <= dataOffset ||
    (indexOffset !== null && sectionEnd <= indexOffset) ||
    sectionEnd > header.xmlLogicalOffset
  ) {
    throw new RangeError("E57 compressed-vector range is invalid");
  }
  const fields = pointProfile.fields;
  const names = new Set(fields.map((field) => field.name));
  const hasColor = COLORS.every((name) => names.has(name));
  const invalidStateField = fields.findIndex(
    (field) => field.name === CARTESIAN_INVALID_STATE,
  );
  const hasInvalidState = invalidStateField !== -1;
  const streams = fields.map(() => new BitStream());
  const rawPositions = new Float64Array(
    pointProfile.recordCount * 3,
  );
  const colors = new Uint8Array(pointProfile.recordCount * 4);
  const invalidStates = hasInvalidState
    ? new Uint8Array(pointProfile.recordCount)
    : null;
  const rawColorValues = hasColor && hasInvalidState
    ? new Float64Array(pointProfile.recordCount * 3)
    : null;
  const rawColorRange = {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
  const coordinateIndex = new Map(
    COORDINATES.map((name, index) => [name, index]),
  );
  const colorIndex = new Map(
    COLORS.map((name, index) => [name, index]),
  );
  let records = 0;
  let dataPackets = 0;
  let indexPackets = 0;
  try {
    const cursor = new Cursor(logical, dataOffset, dataEnd);
    while (cursor.offset < dataEnd) {
      const packetStart = cursor.offset;
      const packetHeader = cursor.read(
        DATA_PACKET_HEADER_BYTES,
        "E57 data packet header",
      );
      const packetView = new DataView(
        packetHeader.buffer,
        packetHeader.byteOffset,
        packetHeader.byteLength,
      );
      const packetLength = packetView.getUint16(2, true) + 1;
      const streamCount = packetView.getUint16(4, true);
      const packetEnd = packetStart + packetLength;
      if (
        packetHeader[0] !== 1 ||
        packetHeader[1] !== 0 ||
        streamCount !== fields.length ||
        packetLength % 4 !== 0 ||
        packetLength < DATA_PACKET_HEADER_BYTES + streamCount * 2 ||
        packetEnd > dataEnd
      ) {
        throw new Error("E57 data packet header is invalid");
      }
      const sizesBytes = cursor.read(
        streamCount * 2,
        "E57 data packet stream sizes",
      );
      const sizesView = new DataView(
        sizesBytes.buffer,
        sizesBytes.byteOffset,
        sizesBytes.byteLength,
      );
      const sizes = fields.map((_, index) =>
        sizesView.getUint16(index * 2, true));
      const payloadBytes = sizes.reduce(
        (sum, value) => sum + value,
        0,
      );
      if (cursor.offset + payloadBytes > packetEnd) {
        throw new RangeError("E57 data packet payload is truncated");
      }
      sizes.forEach((size, index) => {
        streams[index].append(cursor.read(
          size,
          `E57 ${fields[index].name} stream`,
        ));
      });
      cursor.skip(
        packetEnd - cursor.offset,
        "E57 data packet padding",
      );
      const available = fields
        .map((field, index) => field.bitSize === 0
          ? Infinity
          : Math.floor(
              streams[index].availableBits / field.bitSize,
            ))
        .reduce((minimum, value) => Math.min(minimum, value));
      if (!Number.isSafeInteger(available) || available < 0) {
        throw new Error("E57 data packet has no sized point stream");
      }
      const count = Math.min(
        available,
        pointProfile.recordCount - records,
      );
      for (const [fieldIndex, field] of fields.entries()) {
        const coordinate = coordinateIndex.get(field.name);
        const color = colorIndex.get(field.name);
        const bounds = fieldBounds(field);
        for (let index = 0; index < count; index += 1) {
          const value = recordValue(streams[fieldIndex], field);
          const target = records + index;
          if (coordinate !== undefined) {
            rawPositions[target * 3 + coordinate] = value;
          } else if (color !== undefined) {
            colors[target * 4 + color] = colorByte(
              value,
              bounds,
              `E57 ${field.name}`,
            );
            if (rawColorValues === null) {
              rawColorRange.min[color] = Math.min(
                rawColorRange.min[color],
                value,
              );
              rawColorRange.max[color] = Math.max(
                rawColorRange.max[color],
                value,
              );
            } else {
              rawColorValues[target * 3 + color] = value;
            }
          } else if (fieldIndex === invalidStateField) {
            invalidStates[target] = value;
          }
        }
      }
      for (let index = 0; index < count; index += 1) {
        const target = records + index;
        if (!hasColor) {
          colors.fill(255, target * 4, target * 4 + 4);
        } else {
          colors[target * 4 + 3] = 255;
        }
      }
      records += count;
      dataPackets += 1;
    }
    if (records !== pointProfile.recordCount || dataPackets === 0) {
      throw new Error("E57 decoded point count is incomplete");
    }
    fields.forEach((field, index) => {
      const remaining = streams[index].availableBits;
      const expectedPadding = field.bitSize === 0
        ? 0
        : (8 - pointProfile.recordCount * field.bitSize % 8) % 8;
      if (remaining !== expectedPadding) {
        throw new Error(`E57 ${field.name} stream has extra records`);
      }
      if (
        remaining > 0 &&
        streams[index].extract(remaining) !== 0n
      ) {
        throw new Error(`E57 ${field.name} padding is invalid`);
      }
    });
    if (indexOffset !== null) {
      const indexCursor = new Cursor(
        logical,
        indexOffset,
        sectionEnd,
      );
      while (indexCursor.offset < sectionEnd) {
        const packetStart = indexCursor.offset;
        const packetHeader = indexCursor.read(
          INDEX_PACKET_HEADER_BYTES,
          "E57 index packet header",
        );
        const packetView = new DataView(
          packetHeader.buffer,
          packetHeader.byteOffset,
          packetHeader.byteLength,
        );
        const packetLength = packetView.getUint16(2, true) + 1;
        if (
          packetHeader[0] !== 0 ||
          packetLength < INDEX_PACKET_HEADER_BYTES ||
          packetLength % 4 !== 0 ||
          packetStart + packetLength > sectionEnd
        ) {
          throw new Error("E57 index packet header is invalid");
        }
        indexCursor.skip(
          packetLength - INDEX_PACKET_HEADER_BYTES,
          "E57 index packet payload",
        );
        indexPackets += 1;
      }
      if (indexPackets === 0) {
        throw new Error("E57 compressed-vector index is missing");
      }
    }
    let validPointRecords = records;
    let directionPointRecords = 0;
    let invalidPointRecords = 0;
    if (invalidStates !== null) {
      let write = 0;
      for (let read = 0; read < records; read += 1) {
        const state = invalidStates[read];
        if (state === 0) {
          if (write !== read) {
            rawPositions.copyWithin(
              write * 3,
              read * 3,
              read * 3 + 3,
            );
            colors.copyWithin(
              write * 4,
              read * 4,
              read * 4 + 4,
            );
            rawColorValues?.copyWithin(
              write * 3,
              read * 3,
              read * 3 + 3,
            );
          }
          write += 1;
        } else if (state === 1) {
          directionPointRecords += 1;
        } else if (state === 2) {
          invalidPointRecords += 1;
        } else {
          throw new RangeError(
            "E57 cartesianInvalidState value is unsupported",
          );
        }
      }
      validPointRecords = write;
      rawPositions.fill(0, write * 3);
      colors.fill(0, write * 4);
      rawColorValues?.fill(0, write * 3);
    }
    if (validPointRecords === 0) {
      throw new RangeError("E57 scan has no valid Cartesian points");
    }
    const rawBounds = {
      min: [Infinity, Infinity, Infinity],
      max: [-Infinity, -Infinity, -Infinity],
    };
    for (let point = 0; point < validPointRecords; point += 1) {
      for (let axis = 0; axis < 3; axis += 1) {
        const value = rawPositions[point * 3 + axis];
        rawBounds.min[axis] = Math.min(rawBounds.min[axis], value);
        rawBounds.max[axis] = Math.max(rawBounds.max[axis], value);
        if (rawColorValues !== null) {
          const color = rawColorValues[point * 3 + axis];
          rawColorRange.min[axis] = Math.min(
            rawColorRange.min[axis],
            color,
          );
          rawColorRange.max[axis] = Math.max(
            rawColorRange.max[axis],
            color,
          );
        }
      }
    }
    return {
      colors: colors.subarray(0, validPointRecords * 4),
      directionPointRecords,
      invalidPointRecords,
      packetProfile: Object.freeze({
        dataPackets,
        indexPackets,
        sectionLength,
      }),
      rawBounds: Object.freeze({
        min: Object.freeze([...rawBounds.min]),
        max: Object.freeze([...rawBounds.max]),
      }),
      rawColorRange: !hasColor
        ? null
        : Object.freeze({
            min: Object.freeze([...rawColorRange.min]),
            max: Object.freeze([...rawColorRange.max]),
          }),
      rawPositions: rawPositions.subarray(
        0,
        validPointRecords * 3,
      ),
      validPointRecords,
    };
  } catch (error) {
    rawPositions.fill(0);
    colors.fill(0);
    invalidStates?.fill(0);
    rawColorValues?.fill(0);
    throw error;
  } finally {
    invalidStates?.fill(0);
    rawColorValues?.fill(0);
    streams.forEach((stream) => stream.clear());
  }
}

export function decodeE57PointSource(
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
  const limits = Object.freeze({
    maximumDecodedPointBytes: positiveLimit(
      maximumDecodedPointBytes,
      E57_MAXIMUM_DECODED_POINT_BYTES,
      "E57 decoded point byte limit",
    ),
    maximumPoints: positiveLimit(
      maximumPoints,
      E57_MAXIMUM_POINTS,
      "E57 point limit",
    ),
    maximumSourceBytes: positiveLimit(
      maximumSourceBytes,
      E57_MAXIMUM_SOURCE_BYTES,
      "E57 source byte limit",
    ),
  });
  if (
    limits.maximumSourceBytes > E57_MAXIMUM_SOURCE_BYTES ||
    limits.maximumPoints > E57_MAXIMUM_POINTS ||
    limits.maximumDecodedPointBytes >
      E57_MAXIMUM_DECODED_POINT_BYTES ||
    bytes.byteLength < HEADER_BYTES ||
    bytes.byteLength > limits.maximumSourceBytes
  ) {
    throw new RangeError("E57 source exceeds its bounded profile");
  }
  const signature = new TextDecoder("ascii", { fatal: true })
    .decode(bytes.subarray(0, 8));
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  );
  const major = view.getUint32(8, true);
  const minor = view.getUint32(12, true);
  const physicalLength = safeUnsigned64(
    view,
    16,
    "E57 physical length",
  );
  const xmlPhysicalOffset = safeUnsigned64(
    view,
    24,
    "E57 XML offset",
  );
  const xmlLogicalLength = safeUnsigned64(
    view,
    32,
    "E57 XML length",
  );
  const pageSize = safeUnsigned64(view, 40, "E57 page size");
  if (
    signature !== SIGNATURE ||
    major !== 1 ||
    minor !== 0 ||
    physicalLength !== bytes.byteLength
  ) {
    throw new Error("E57 header identity is invalid");
  }
  if (
    pageSize < MINIMUM_PAGE_BYTES ||
    pageSize > MAXIMUM_PAGE_BYTES ||
    (pageSize & (pageSize - 1)) !== 0 ||
    bytes.byteLength % pageSize !== 0 ||
    xmlLogicalLength <= 0 ||
    xmlLogicalLength > MAXIMUM_XML_BYTES
  ) {
    throw new RangeError("E57 physical page layout is invalid");
  }
  const { logical, pages } = logicalFile(bytes, pageSize);
  let decoded = null;
  try {
    const xmlLogicalOffset = physicalToLogical(
      xmlPhysicalOffset,
      physicalLength,
      pageSize,
      "E57 XML offset",
    );
    if (
      xmlLogicalOffset + xmlLogicalLength > logical.byteLength
    ) {
      throw new RangeError("E57 XML range is truncated");
    }
    const xml = new TextDecoder("utf-8", { fatal: true }).decode(
      logical.subarray(
        xmlLogicalOffset,
        xmlLogicalOffset + xmlLogicalLength,
      ),
    );
    const pointProfile = parseXml(xml, limits);
    const envelopeHeader = Object.freeze({
      decodedPointBytes: pointProfile.decodedPointBytes,
      fields: pointProfile.fields,
      formatVersion: `${major}.${minor}`,
      pageChecksum: "CRC-32C",
      pageSize,
      pages,
      physicalLength,
      signature,
      sourcePointRecords: pointProfile.recordCount,
      validPageChecksums: pages,
      xmlLogicalLength,
      xmlLogicalOffset,
      xmlPhysicalOffset,
    });
    decoded = decodePackets(logical, envelopeHeader, pointProfile);
    const header = Object.freeze({
      ...envelopeHeader,
      directionPointRecords: decoded.directionPointRecords,
      invalidPointRecords: decoded.invalidPointRecords,
      pointRecords: decoded.validPointRecords,
    });
    return Object.freeze({
      ...decoded,
      header,
    });
  } finally {
    logical.fill(0);
  }
}
