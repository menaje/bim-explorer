const E57_SIGNATURE = "ASTM-E57";
const HEADER_BYTES = 48;
const CHECKSUM_BYTES = 4;
const MAXIMUM_BYTES = 8 * 1024 * 1024;
const MAXIMUM_XML_BYTES = 1024 * 1024;
const CRC32C_POLYNOMIAL = 0x82f63b78;

function unsigned64(view, offset, label) {
  const value = view.getBigUint64(offset, true);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`${label} exceeds the safe integer range`);
  }
  return Number(value);
}

function crc32c(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^
        ((crc & 1) === 1 ? CRC32C_POLYNOMIAL : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function validatePages(bytes, pageSize) {
  if (
    pageSize < 1024 ||
    pageSize > 1024 * 1024 ||
    (pageSize & (pageSize - 1)) !== 0 ||
    bytes.byteLength % pageSize !== 0
  ) {
    throw new RangeError("E57 physical page layout is invalid");
  }
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  );
  const pages = bytes.byteLength / pageSize;
  for (let index = 0; index < pages; index += 1) {
    const offset = index * pageSize;
    const expected = view.getUint32(
      offset + pageSize - CHECKSUM_BYTES,
      false,
    );
    const actual = crc32c(
      bytes.subarray(offset, offset + pageSize - CHECKSUM_BYTES),
    );
    if (actual !== expected) {
      throw new Error(`E57 page ${index} CRC-32C is invalid`);
    }
  }
  return pages;
}

function logicalRange(bytes, physicalOffset, logicalLength, pageSize) {
  if (
    logicalLength <= 0 ||
    logicalLength > MAXIMUM_XML_BYTES ||
    physicalOffset < HEADER_BYTES ||
    physicalOffset >= bytes.byteLength
  ) {
    throw new RangeError("E57 XML range is invalid");
  }
  const output = new Uint8Array(logicalLength);
  let sourceOffset = physicalOffset;
  let targetOffset = 0;
  while (targetOffset < output.byteLength) {
    const pageStart = Math.floor(sourceOffset / pageSize) * pageSize;
    const pageDataEnd = pageStart + pageSize - CHECKSUM_BYTES;
    if (sourceOffset >= pageDataEnd) {
      sourceOffset = pageStart + pageSize;
      continue;
    }
    const count = Math.min(
      output.byteLength - targetOffset,
      pageDataEnd - sourceOffset,
    );
    if (sourceOffset + count > bytes.byteLength) {
      throw new RangeError("E57 XML range is truncated");
    }
    output.set(
      bytes.subarray(sourceOffset, sourceOffset + count),
      targetOffset,
    );
    sourceOffset += count;
    targetOffset += count;
  }
  return output;
}

function tags(xml, name) {
  return [...xml.matchAll(
    new RegExp(`<${name}\\b([^>]*)>`, "gu"),
  )].map((match) => match[1]);
}

function attribute(attributes, name) {
  const match = new RegExp(
    `(?:^|\\s)${name}="([^"]*)"`,
    "u",
  ).exec(attributes);
  return match?.[1] ?? null;
}

function numericAttribute(attributes, name, label) {
  const text = attribute(attributes, name);
  const value = Number(text);
  if (text === null || !Number.isFinite(value)) {
    throw new TypeError(`${label} is invalid`);
  }
  return value;
}

function prototypeField(xml, name) {
  const match = new RegExp(`<${name}\\b([^>]*)/>`, "u").exec(xml);
  if (match === null) {
    return null;
  }
  const minimum = numericAttribute(
    match[1],
    "minimum",
    `E57 ${name} minimum`,
  );
  const maximum = numericAttribute(
    match[1],
    "maximum",
    `E57 ${name} maximum`,
  );
  if (!(minimum < maximum)) {
    throw new RangeError(`E57 ${name} bounds are invalid`);
  }
  return Object.freeze({ minimum, maximum });
}

export function probeE57Envelope(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError("E57 probe input must be a Uint8Array");
  }
  if (
    bytes.byteLength < HEADER_BYTES ||
    bytes.byteLength > MAXIMUM_BYTES
  ) {
    throw new RangeError("E57 probe input exceeds its byte bound");
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
  const physicalLength = unsigned64(
    view,
    16,
    "E57 physical length",
  );
  const xmlPhysicalOffset = unsigned64(
    view,
    24,
    "E57 XML physical offset",
  );
  const xmlLogicalLength = unsigned64(
    view,
    32,
    "E57 XML logical length",
  );
  const pageSize = unsigned64(view, 40, "E57 page size");
  if (
    signature !== E57_SIGNATURE ||
    major !== 1 ||
    minor !== 0 ||
    physicalLength !== bytes.byteLength
  ) {
    throw new Error("E57 header identity is invalid");
  }
  const pages = validatePages(bytes, pageSize);
  const xmlBytes = logicalRange(
    bytes,
    xmlPhysicalOffset,
    xmlLogicalLength,
    pageSize,
  );
  const xml = new TextDecoder("utf-8", { fatal: true })
    .decode(xmlBytes);
  xmlBytes.fill(0);
  if (
    !xml.startsWith("<?xml version=\"1.0\" encoding=\"UTF-8\"?>") ||
    !xml.includes(
      "xmlns=\"http://www.astm.org/COMMIT/E57/2010-e57-v1.0\"",
    ) ||
    /<!DOCTYPE|<!ENTITY|\u0000/iu.test(xml)
  ) {
    throw new Error("E57 XML metadata envelope is invalid");
  }
  const pointTags = tags(xml, "points");
  if (pointTags.length === 0) {
    throw new Error("E57 data3D has no compressed point vector");
  }
  let pointRecords = 0;
  for (const [index, pointTag] of pointTags.entries()) {
    if (attribute(pointTag, "type") !== "CompressedVector") {
      throw new Error(`E57 points vector ${index} is unsupported`);
    }
    const fileOffset = numericAttribute(
      pointTag,
      "fileOffset",
      `E57 points vector ${index} file offset`,
    );
    const recordCount = numericAttribute(
      pointTag,
      "recordCount",
      `E57 points vector ${index} record count`,
    );
    if (
      !Number.isSafeInteger(fileOffset) ||
      fileOffset < HEADER_BYTES ||
      fileOffset >= xmlPhysicalOffset ||
      !Number.isSafeInteger(recordCount) ||
      recordCount <= 0
    ) {
      throw new RangeError(
        `E57 points vector ${index} range is invalid`,
      );
    }
    pointRecords += recordCount;
  }
  const coordinateFields = [
    "cartesianX",
    "cartesianY",
    "cartesianZ",
  ];
  const colorFields = ["colorRed", "colorGreen", "colorBlue"];
  const coordinateProfiles = coordinateFields.map(
    (name) => prototypeField(xml, name),
  );
  if (coordinateProfiles.some((profile) => profile === null)) {
    throw new Error("E57 Cartesian coordinate profile is incomplete");
  }
  const availableColorFields = colorFields.filter(
    (name) => prototypeField(xml, name) !== null,
  );
  const libraryMatch =
    /<e57LibraryVersion type="String"><!\[CDATA\[([^\]]+)\]\]><\/e57LibraryVersion>/u
      .exec(xml);
  const profile = Object.freeze({
    data3DScans: pointTags.length,
    pointRecords,
    coordinateFields: Object.freeze([...coordinateFields]),
    colorFields: Object.freeze(availableColorFields),
    coordinateBounds: Object.freeze({
      min: Object.freeze(
        coordinateProfiles.map((item) => item.minimum),
      ),
      max: Object.freeze(
        coordinateProfiles.map((item) => item.maximum),
      ),
    }),
    producerLibrary: libraryMatch?.[1] ?? null,
  });
  return Object.freeze({
    signature,
    formatVersion: `${major}.${minor}`,
    physicalLength,
    pageSize,
    pages,
    pageChecksum: "CRC-32C",
    validPageChecksums: pages,
    xmlPhysicalOffset,
    xmlLogicalLength,
    profile,
    pointPayloadDecoded: false,
    rendererMounted: false,
  });
}
