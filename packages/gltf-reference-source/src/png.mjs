const PNG_SIGNATURE = Object.freeze([
  0x89, 0x50, 0x4e, 0x47,
  0x0d, 0x0a, 0x1a, 0x0a,
]);

const CRC_TABLE = Object.freeze(
  Array.from({ length: 256 }, (_, value) => {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) === 1
        ? 0xedb88320 ^ (crc >>> 1)
        : crc >>> 1;
    }
    return crc >>> 0;
  }),
);

function crc32(bytes, start, end) {
  let crc = 0xffff_ffff;
  for (let offset = start; offset < end; offset += 1) {
    crc = CRC_TABLE[(crc ^ bytes[offset]) & 0xff] ^
      (crc >>> 8);
  }
  return (crc ^ 0xffff_ffff) >>> 0;
}

function chunkName(bytes, offset) {
  return String.fromCharCode(
    bytes[offset],
    bytes[offset + 1],
    bytes[offset + 2],
    bytes[offset + 3],
  );
}

export function inspectBoundedPng(
  input,
  {
    maximumChunks = 256,
    maximumCompressionRatio = 256,
    maximumDecodedBytes = 16 * 1024 * 1024,
    maximumDimension = 2_048,
    maximumSourceBytes = 8 * 1024 * 1024,
  } = {},
) {
  if (!(input instanceof Uint8Array)) {
    throw new TypeError("PNG input must be a Uint8Array");
  }
  for (const [label, value] of Object.entries({
    maximumChunks,
    maximumCompressionRatio,
    maximumDecodedBytes,
    maximumDimension,
    maximumSourceBytes,
  })) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new TypeError(`PNG ${label} must be a positive integer`);
    }
  }
  if (
    input.byteLength < 33 ||
    input.byteLength > maximumSourceBytes ||
    PNG_SIGNATURE.some((value, index) => input[index] !== value)
  ) {
    throw new RangeError("PNG source exceeds the bounded profile");
  }
  const view = new DataView(
    input.buffer,
    input.byteOffset,
    input.byteLength,
  );
  let chunks = 0;
  let colorType = -1;
  let height = 0;
  let idatBytes = 0;
  let offset = PNG_SIGNATURE.length;
  let sawIdat = false;
  let closedIdat = false;
  let sawIend = false;
  let sawIhdr = false;
  let sawPlte = false;
  let sawTrns = false;
  let paletteEntries = 0;
  let width = 0;
  while (offset < input.byteLength) {
    if (
      chunks >= maximumChunks ||
      offset + 12 > input.byteLength
    ) {
      throw new RangeError("PNG chunk table exceeds the bounded profile");
    }
    const byteLength = view.getUint32(offset, false);
    const typeOffset = offset + 4;
    const dataOffset = typeOffset + 4;
    const crcOffset = dataOffset + byteLength;
    const end = crcOffset + 4;
    if (end > input.byteLength) {
      throw new RangeError("PNG chunk is truncated");
    }
    const type = chunkName(input, typeOffset);
    if (!/^[A-Za-z]{4}$/u.test(type)) {
      throw new Error("PNG chunk type is invalid");
    }
    if (
      crc32(input, typeOffset, crcOffset) !==
        view.getUint32(crcOffset, false)
    ) {
      throw new Error(`PNG ${type} chunk CRC is invalid`);
    }
    if (!sawIhdr) {
      if (type !== "IHDR" || byteLength !== 13) {
        throw new Error("PNG IHDR must be the first chunk");
      }
      width = view.getUint32(dataOffset, false);
      height = view.getUint32(dataOffset + 4, false);
      const bitDepth = input[dataOffset + 8];
      colorType = input[dataOffset + 9];
      const compression = input[dataOffset + 10];
      const filter = input[dataOffset + 11];
      const interlace = input[dataOffset + 12];
      if (
        width === 0 ||
        height === 0 ||
        width > maximumDimension ||
        height > maximumDimension ||
        bitDepth !== 8 ||
        ![2, 3, 6].includes(colorType) ||
        compression !== 0 ||
        filter !== 0 ||
        interlace !== 0
      ) {
        throw new DOMException(
          "PNG image profile is unsupported",
          "NotSupportedError",
        );
      }
      sawIhdr = true;
    } else if (type === "IHDR") {
      throw new Error("PNG contains more than one IHDR chunk");
    }
    if (type === "PLTE") {
      if (
        sawPlte ||
        sawTrns ||
        sawIdat ||
        byteLength < 3 ||
        byteLength > 768 ||
        byteLength % 3 !== 0
      ) {
        throw new Error("PNG PLTE chunk is invalid");
      }
      sawPlte = true;
      paletteEntries = byteLength / 3;
    }
    if (type === "tRNS") {
      if (
        sawTrns ||
        sawIdat ||
        (
          colorType === 3 &&
          (
            !sawPlte ||
            byteLength === 0 ||
            byteLength > paletteEntries
          )
        ) ||
        (colorType === 2 && byteLength !== 6) ||
        colorType === 6
      ) {
        throw new Error("PNG tRNS chunk is invalid");
      }
      sawTrns = true;
    }
    if (["acTL", "fcTL", "fdAT"].includes(type)) {
      throw new DOMException(
        "animated PNG is unsupported",
        "NotSupportedError",
      );
    }
    if (
      (input[typeOffset] & 0x20) === 0 &&
      !["IHDR", "PLTE", "IDAT", "IEND"].includes(type)
    ) {
      throw new DOMException(
        `PNG critical chunk ${type} is unsupported`,
        "NotSupportedError",
      );
    }
    if (type === "IDAT") {
      if (closedIdat || byteLength === 0) {
        throw new Error("PNG IDAT sequence is invalid");
      }
      sawIdat = true;
      idatBytes += byteLength;
    } else if (sawIdat && type !== "IEND") {
      closedIdat = true;
    }
    if (type === "IEND") {
      if (byteLength !== 0 || !sawIdat || end !== input.byteLength) {
        throw new Error("PNG IEND chunk is invalid");
      }
      sawIend = true;
    }
    chunks += 1;
    offset = end;
  }
  if (
    !sawIhdr ||
    !sawIdat ||
    !sawIend ||
    idatBytes === 0 ||
    (colorType === 3 && !sawPlte)
  ) {
    throw new Error("PNG image structure is incomplete");
  }
  const decodedBytes = width * height * 4;
  if (
    decodedBytes > maximumDecodedBytes ||
    decodedBytes / input.byteLength > maximumCompressionRatio
  ) {
    throw new RangeError("PNG decoded bytes exceed the bounded profile");
  }
  return Object.freeze({
    byteLength: input.byteLength,
    chunks,
    decodedBytes,
    height,
    idatBytes,
    mediaType: "image/png",
    width,
  });
}
