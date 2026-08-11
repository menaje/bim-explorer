export const BIM_TEXTURED_GEOMETRY_MEDIA_TYPE =
  "application/vnd.bim-explorer.geometry-range.v2";

const TEXTURE_NONE = 0xffff_ffff;
const PNG_SIGNATURE = Object.freeze([
  0x89, 0x50, 0x4e, 0x47,
  0x0d, 0x0a, 0x1a, 0x0a,
]);
const PNG_CRC_TABLE = Object.freeze(
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

function pngCrc32(bytes, start, end) {
  let crc = 0xffff_ffff;
  for (let offset = start; offset < end; offset += 1) {
    crc = PNG_CRC_TABLE[(crc ^ bytes[offset]) & 0xff] ^
      (crc >>> 8);
  }
  return (crc ^ 0xffff_ffff) >>> 0;
}

function pngChunkName(bytes, offset) {
  return String.fromCharCode(
    bytes[offset],
    bytes[offset + 1],
    bytes[offset + 2],
    bytes[offset + 3],
  );
}

function validatePngPayload(bytes, expectedWidth, expectedHeight) {
  if (
    bytes.byteLength < 33 ||
    PNG_SIGNATURE.some((value, index) => bytes[index] !== value)
  ) {
    throw new Error("textured geometry PNG signature is invalid");
  }
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  );
  let colorType = -1;
  let chunks = 0;
  let offset = PNG_SIGNATURE.length;
  let paletteEntries = 0;
  let sawIdat = false;
  let closedIdat = false;
  let sawIend = false;
  let sawIhdr = false;
  let sawPlte = false;
  let sawTrns = false;
  while (offset < bytes.byteLength) {
    if (chunks >= 256 || offset + 12 > bytes.byteLength) {
      throw new Error("textured geometry PNG chunks are invalid");
    }
    const byteLength = view.getUint32(offset, false);
    const typeOffset = offset + 4;
    const dataOffset = typeOffset + 4;
    const crcOffset = dataOffset + byteLength;
    const end = crcOffset + 4;
    if (end > bytes.byteLength) {
      throw new Error("textured geometry PNG chunk is truncated");
    }
    const type = pngChunkName(bytes, typeOffset);
    if (
      !/^[A-Za-z]{4}$/u.test(type) ||
      pngCrc32(bytes, typeOffset, crcOffset) !==
        view.getUint32(crcOffset, false)
    ) {
      throw new Error("textured geometry PNG chunk is invalid");
    }
    if (!sawIhdr) {
      if (
        type !== "IHDR" ||
        byteLength !== 13 ||
        view.getUint32(dataOffset, false) !== expectedWidth ||
        view.getUint32(dataOffset + 4, false) !== expectedHeight ||
        bytes[dataOffset + 8] !== 8 ||
        ![2, 3, 6].includes(bytes[dataOffset + 9]) ||
        bytes[dataOffset + 10] !== 0 ||
        bytes[dataOffset + 11] !== 0 ||
        bytes[dataOffset + 12] !== 0
      ) {
        throw new Error("textured geometry PNG IHDR is invalid");
      }
      colorType = bytes[dataOffset + 9];
      sawIhdr = true;
    } else if (type === "IHDR") {
      throw new Error("textured geometry PNG IHDR is duplicated");
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
        throw new Error("textured geometry PNG palette is invalid");
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
        throw new Error(
          "textured geometry PNG transparency is invalid",
        );
      }
      sawTrns = true;
    }
    if (
      ["acTL", "fcTL", "fdAT"].includes(type) ||
      (
        (bytes[typeOffset] & 0x20) === 0 &&
        !["IHDR", "PLTE", "IDAT", "IEND"].includes(type)
      )
    ) {
      throw new Error("textured geometry PNG chunk is unsupported");
    }
    if (type === "IDAT") {
      if (closedIdat || byteLength === 0) {
        throw new Error("textured geometry PNG IDAT is invalid");
      }
      sawIdat = true;
    } else if (sawIdat && type !== "IEND") {
      closedIdat = true;
    }
    if (type === "IEND") {
      if (byteLength !== 0 || !sawIdat || end !== bytes.byteLength) {
        throw new Error("textured geometry PNG IEND is invalid");
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
    (colorType === 3 && !sawPlte)
  ) {
    throw new Error("textured geometry PNG structure is incomplete");
  }
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive integer`);
  }
}

function align4(value) {
  return (value + 3) & ~3;
}

function textureGpuByteLength(width, height, minFilter) {
  let levelWidth = width;
  let levelHeight = height;
  let byteLength = levelWidth * levelHeight * 4;
  if (![9984, 9985, 9986, 9987].includes(minFilter)) {
    return byteLength;
  }
  while (levelWidth > 1 || levelHeight > 1) {
    levelWidth = Math.max(1, Math.floor(levelWidth / 2));
    levelHeight = Math.max(1, Math.floor(levelHeight / 2));
    byteLength += levelWidth * levelHeight * 4;
  }
  return byteLength;
}

export function decodeBimTexturedGeometryRange(
  bytes,
  {
    maximumPayloadBytes = 8 * 1024 * 1024,
    maximumRecords = 100_000,
    maximumTextureCompressionRatio = 256,
    maximumTextureDecodedBytes = 16 * 1024 * 1024,
    maximumTextureSourceBytes = 8 * 1024 * 1024,
    maximumTextures = 16,
  } = {},
) {
  for (const [label, value] of Object.entries({
    maximumPayloadBytes,
    maximumRecords,
    maximumTextureCompressionRatio,
    maximumTextureDecodedBytes,
    maximumTextureSourceBytes,
    maximumTextures,
  })) {
    positiveInteger(value, label);
  }
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError(
      "textured geometry range must be a Uint8Array",
    );
  }
  const headerBytes = 24;
  const recordHeaderBytes = 28;
  const textureHeaderBytes = 40;
  if (bytes.byteLength < headerBytes) {
    throw new RangeError("textured geometry range header is truncated");
  }
  if (
    new TextDecoder().decode(bytes.slice(0, 8)) !== "BEXGEO02"
  ) {
    throw new Error("textured geometry range magic is invalid");
  }
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  );
  if (
    view.getUint32(8, true) !== 2 ||
    view.getUint32(20, true) !== 0
  ) {
    throw new Error("textured geometry range version is unsupported");
  }
  const recordCount = view.getUint32(12, true);
  const textureCount = view.getUint32(16, true);
  if (
    recordCount === 0 ||
    recordCount > maximumRecords ||
    textureCount === 0 ||
    textureCount > maximumTextures
  ) {
    throw new RangeError(
      "textured geometry range collections exceed their limits",
    );
  }
  const geometryExpressIds = new Set();
  const records = [];
  const referencedTextures = new Set();
  let geometryPayloadBytes = 0;
  let indices = 0;
  let offset = headerBytes;
  let triangles = 0;
  let vertices = 0;
  for (let index = 0; index < recordCount; index += 1) {
    const label = `textured geometry range record ${index}`;
    if (offset + recordHeaderBytes > bytes.byteLength) {
      throw new RangeError(`${label} header is truncated`);
    }
    const recordOffset = offset;
    const geometryExpressId = view.getUint32(offset, true);
    const vertexFloatCount = view.getUint32(offset + 4, true);
    const indexCount = view.getUint32(offset + 8, true);
    const vertexByteLength = view.getUint32(offset + 12, true);
    const indexByteLength = view.getUint32(offset + 16, true);
    const encodedTextureIndex = view.getUint32(offset + 20, true);
    const flags = view.getUint32(offset + 24, true);
    if (
      geometryExpressId === 0 ||
      geometryExpressIds.has(geometryExpressId) ||
      vertexFloatCount === 0 ||
      vertexFloatCount % 8 !== 0 ||
      indexCount === 0 ||
      indexCount % 3 !== 0 ||
      vertexByteLength !==
        vertexFloatCount * Float32Array.BYTES_PER_ELEMENT ||
      indexByteLength !==
        indexCount * Uint32Array.BYTES_PER_ELEMENT ||
      (
        encodedTextureIndex !== TEXTURE_NONE &&
        encodedTextureIndex >= textureCount
      ) ||
      flags !== 0
    ) {
      throw new Error(`${label} header is malformed`);
    }
    offset += recordHeaderBytes;
    const vertexOffset = offset;
    const vertexEnd = vertexOffset + vertexByteLength;
    const indexOffset = vertexEnd;
    const indexEnd = indexOffset + indexByteLength;
    geometryPayloadBytes += vertexByteLength + indexByteLength;
    if (
      indexEnd > bytes.byteLength ||
      geometryPayloadBytes > maximumPayloadBytes
    ) {
      throw new RangeError(`${label} payload exceeds its byte limit`);
    }
    for (
      let cursor = vertexOffset;
      cursor < vertexEnd;
      cursor += Float32Array.BYTES_PER_ELEMENT
    ) {
      if (!Number.isFinite(view.getFloat32(cursor, true))) {
        throw new Error(`${label} contains a non-finite vertex`);
      }
    }
    const vertexCount = vertexFloatCount / 8;
    for (
      let cursor = indexOffset;
      cursor < indexEnd;
      cursor += Uint32Array.BYTES_PER_ELEMENT
    ) {
      if (view.getUint32(cursor, true) >= vertexCount) {
        throw new RangeError(`${label} contains an out-of-range index`);
      }
    }
    const textureIndex = encodedTextureIndex === TEXTURE_NONE
      ? null
      : encodedTextureIndex;
    if (textureIndex !== null) {
      referencedTextures.add(textureIndex);
    }
    const recordTriangles = indexCount / 3;
    records.push(Object.freeze({
      geometryExpressId,
      indexCount,
      textureIndex,
      triangles: recordTriangles,
      vertexCount,
      vertexStrideBytes: 8 * Float32Array.BYTES_PER_ELEMENT,
      texcoordByteOffset: 6 * Float32Array.BYTES_PER_ELEMENT,
      slice: Object.freeze({
        offset: recordOffset,
        byteLength: indexEnd - recordOffset,
      }),
      vertexPayload: Object.freeze({
        offset: vertexOffset,
        byteLength: vertexByteLength,
      }),
      indexPayload: Object.freeze({
        offset: indexOffset,
        byteLength: indexByteLength,
      }),
    }));
    geometryExpressIds.add(geometryExpressId);
    vertices += vertexCount;
    indices += indexCount;
    triangles += recordTriangles;
    offset = indexEnd;
  }
  const textures = [];
  let textureDecodedBytes = 0;
  let textureGpuBytes = 0;
  let textureSourceBytes = 0;
  for (let index = 0; index < textureCount; index += 1) {
    const label = `textured geometry range texture ${index}`;
    if (offset + textureHeaderBytes > bytes.byteLength) {
      throw new RangeError(`${label} header is truncated`);
    }
    const textureIndex = view.getUint32(offset, true);
    const mimeType = view.getUint32(offset + 4, true);
    const width = view.getUint32(offset + 8, true);
    const height = view.getUint32(offset + 12, true);
    const sourceByteLength = view.getUint32(offset + 16, true);
    const decodedByteLength = view.getUint32(offset + 20, true);
    const magFilter = view.getUint32(offset + 24, true);
    const minFilter = view.getUint32(offset + 28, true);
    const wrapS = view.getUint32(offset + 32, true);
    const wrapT = view.getUint32(offset + 36, true);
    if (
      textureIndex !== index ||
      mimeType !== 1 ||
      width === 0 ||
      height === 0 ||
      width > 2_048 ||
      height > 2_048 ||
      sourceByteLength === 0 ||
      decodedByteLength !== width * height * 4 ||
      ![9728, 9729].includes(magFilter) ||
      ![9728, 9729, 9984, 9985, 9986, 9987]
        .includes(minFilter) ||
      ![33071, 33648, 10497].includes(wrapS) ||
      ![33071, 33648, 10497].includes(wrapT)
    ) {
      throw new Error(`${label} header is malformed`);
    }
    offset += textureHeaderBytes;
    const sourceOffset = offset;
    const sourceEnd = sourceOffset + sourceByteLength;
    const paddedEnd = sourceOffset + align4(sourceByteLength);
    if (
      paddedEnd > bytes.byteLength ||
      bytes.subarray(sourceEnd, paddedEnd)
        .some((value) => value !== 0)
    ) {
      throw new Error(`${label} PNG payload is invalid`);
    }
    validatePngPayload(
      bytes.subarray(sourceOffset, sourceEnd),
      width,
      height,
    );
    textureSourceBytes += sourceByteLength;
    textureDecodedBytes += decodedByteLength;
    const gpuByteLength = textureGpuByteLength(
      width,
      height,
      minFilter,
    );
    textureGpuBytes += gpuByteLength;
    if (
      textureSourceBytes > maximumTextureSourceBytes ||
      textureDecodedBytes > maximumTextureDecodedBytes ||
      decodedByteLength / sourceByteLength >
        maximumTextureCompressionRatio
    ) {
      throw new RangeError(`${label} exceeds its byte limit`);
    }
    textures.push(Object.freeze({
      index,
      mediaType: "image/png",
      width,
      height,
      sourcePayload: Object.freeze({
        offset: sourceOffset,
        byteLength: sourceByteLength,
      }),
      decodedByteLength,
      gpuByteLength,
      sampler: Object.freeze({
        magFilter,
        minFilter,
        wrapS,
        wrapT,
      }),
    }));
    offset = paddedEnd;
  }
  if (
    offset !== bytes.byteLength ||
    referencedTextures.size !== textureCount
  ) {
    throw new Error(
      "textured geometry range has unused or trailing texture bytes",
    );
  }
  return Object.freeze({
    schema: "bim-explorer-decoded-geometry-range/2",
    mediaType: BIM_TEXTURED_GEOMETRY_MEDIA_TYPE,
    byteLength: bytes.byteLength,
    recordCount,
    payloadBytes: geometryPayloadBytes,
    geometryPayloadBytes,
    textureSourceBytes,
    textureDecodedBytes,
    textureGpuBytes,
    textureCount,
    vertices,
    indices,
    triangles,
    records: Object.freeze(records),
    textures: Object.freeze(textures),
  });
}
